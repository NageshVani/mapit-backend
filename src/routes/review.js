// ============================================================
// Listing Review Queue — /review page for approvers (Session 9L)
// Plan: docs/technical/review-queue-plan.md. Tables: migration 019.
// GET  /api/review/me              — my access + reject reasons (requireAuth only)
// POST /api/review/access-request  — after sign-up: ask to become an approver
// POST /api/review/next            — claim + return the next pending listing
// POST /api/review/:id/approve     — go live (+ optional note to the seller)
// POST /api/review/:id/reject      — rejected + reason (listing is kept)
// POST /api/review/:id/release     — Skip: hand the listing back to the queue
// GET  /api/review/team            — admin: approver roster
// POST /api/review/team/:userId    — admin: activate / revoke an approver
//
// Pattern: work queue with leases. claim_next_pending_listing() gives each
// approver a different listing for LEASE_SECONDS (FOR UPDATE SKIP LOCKED).
// Approve/reject only change a listing that is still pending AND claimed by
// me — otherwise 409 (someone else decided, the claim ran out and was taken,
// or the seller edited it, which clears the claim).
// ============================================================
const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth, requireAdmin, requireReviewer, isAdminEmail } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');
const { logAuditEvent } = require('../utils/auditLog');
const { notifySellerListingLive } = require('../utils/notifySeller');
const { newExpiry } = require('../config/listingRules');
const { REJECT_REASONS, REVIEW_NOTE_MAX } = require('../config/reviewReasons');
const { waitUntil } = require('@vercel/functions');

const router = express.Router();

const LEASE_SECONDS = 300;   // 5-minute claim (plan section 3)
const SKIP_MAX = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANGED_MSG = 'This listing just changed or was already reviewed. Loading again.';

// What an approver sees — an allowlist, never select('*') (Rule 8): no exact
// lat/lng, no phone, no email, no seller_id. address = area name only.
const CARD_COLUMNS = 'id, title, description, price, price_label, category, subcategory, specs, details, '
  + 'address, created_at, reference_code, moderation_verdict, moderation_reason, '
  + 'profiles(full_name), listing_photos(public_url, sort_order)';

const cleanNote = n => (typeof n === 'string' ? n.replace(/\r\n?/g, '\n').trim() : '');

function validId(req, res, next) {
  if (!UUID_RE.test(req.params.id || req.params.userId || '')) return next(createError('Invalid ID.'));
  next();
}

// ── Who am I on /review? ─────────────────────────────────────
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const reasons = REJECT_REASONS.map(({ code, label, noteRequired }) => ({ code, label, noteRequired: !!noteRequired }));
    if (isAdminEmail(req.user.email)) {
      const { data: profile } = await supabaseAdmin.from('profiles').select('full_name').eq('id', req.user.id).maybeSingle();
      return res.json({ access: 'admin', display_name: profile?.full_name || null, reasons, note_max: REVIEW_NOTE_MAX });
    }
    const { data: staff, error } = await supabaseAdmin
      .from('staff_members').select('status, display_name').eq('user_id', req.user.id).maybeSingle();
    if (error) return next(createError(error.message, 500));
    res.json({ access: staff?.status || 'none', display_name: staff?.display_name || null, reasons, note_max: REVIEW_NOTE_MAX });
  } catch (err) { next(err); }
});

// ── Ask to become an approver (after sign-up) ────────────────
// Never changes an existing row: a revoked approver can't re-request
// their way back in; only an admin can reactivate them.
router.post('/access-request', requireAuth, async (req, res, next) => {
  try {
    if (isAdminEmail(req.user.email)) return res.json({ access: 'admin' });
    const name = typeof req.body.display_name === 'string' ? req.body.display_name.trim().replace(/\s+/g, ' ') : '';
    if (name.length < 2 || name.length > 40) return next(createError('Please enter your name (2–40 characters).'));

    const { error } = await supabaseAdmin
      .from('staff_members')
      .upsert({ user_id: req.user.id, display_name: name }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (error) return next(createError(error.message, 500));
    const { data: staff } = await supabaseAdmin
      .from('staff_members').select('status, display_name').eq('user_id', req.user.id).single();
    res.json({ access: staff.status, display_name: staff.display_name });
  } catch (err) { next(err); }
});

// ── Claim the next listing ────────────────────────────────────
// Body: { skip: [listing ids skipped in this session] }
router.post('/next', requireAuth, requireReviewer, async (req, res, next) => {
  try {
    const skip = req.body.skip === undefined ? [] : req.body.skip;
    if (!Array.isArray(skip) || skip.length > SKIP_MAX || !skip.every(id => typeof id === 'string' && UUID_RE.test(id))) {
      return next(createError('Invalid skip list.'));
    }
    const isAdmin = req.reviewer.role === 'admin';
    const { data: id, error } = await supabaseAdmin.rpc('claim_next_pending_listing', {
      p_reviewer:       req.user.id,
      p_lease_seconds:  LEASE_SECONDS,
      // Approvers never review their own listings; admins post for sellers
      p_exclude_seller: isAdmin ? null : req.user.id,
      p_skip:           skip,
    });
    if (error) return next(createError(error.message, 500));

    // Includes listings other approvers hold right now → "about N left"
    const { count } = await supabaseAdmin
      .from('listings').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    if (!id) return res.json({ listing: null, remaining: count || 0 });

    const { data: row, error: rowErr } = await supabaseAdmin
      .from('listings').select(CARD_COLUMNS).eq('id', id).single();
    if (rowErr) return next(createError(rowErr.message, 500));

    const { profiles, listing_photos, ...listing } = row;
    const fullName = profiles?.full_name || '';
    listing.seller_name = isAdmin ? fullName : fullName.split(' ')[0];   // first name only for approvers
    listing.photos = (listing_photos || [])
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .slice(0, 5)
      .map(p => p.public_url);
    listing.flagged = listing.moderation_verdict === 'flagged';
    listing.flag_reason = listing.flagged ? listing.moderation_reason : null;
    delete listing.moderation_verdict;
    delete listing.moderation_reason;

    res.json({ listing, remaining: count || 0, lease_seconds: LEASE_SECONDS });
  } catch (err) { next(err); }
});

// Conditional update shared by approve + reject: only a listing that is
// still pending and claimed by me. Returns the updated row, or null (→ 409).
async function decide(listingId, reviewerId, updates) {
  const { data, error } = await supabaseAdmin
    .from('listings')
    .update({ ...updates, review_claimed_by: null, review_claimed_until: null })
    .eq('id', listingId)
    .eq('status', 'pending')
    .eq('review_claimed_by', reviewerId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

// History row, written after the status change (decision 2, 2026-10-31):
// if it fails the decision still stands — logged with IDs only (Rule 8).
async function recordReview(row) {
  const { error } = await supabaseAdmin.from('listing_reviews').insert(row);
  if (error) console.error('listing_reviews insert failed for listing', row.listing_id, '-', error.message);
}

// ── Approve ───────────────────────────────────────────────────
// Body: { note? } — optional "Approve with note", shown to the seller in the
// listing-live email.
router.post('/:id/approve', requireAuth, requireReviewer, validId, async (req, res, next) => {
  try {
    const note = cleanNote(req.body.note);
    if (note.length > REVIEW_NOTE_MAX) return next(createError(`Note is too long (max ${REVIEW_NOTE_MAX} characters).`));

    // The 30 days start when the listing goes live, not when it was posted
    const listing = await decide(req.params.id, req.user.id,
      { status: 'active', expires_at: newExpiry(), rejection_reason: null });
    if (!listing) return next(createError(CHANGED_MSG, 409));

    await recordReview({ listing_id: listing.id, reviewer_id: req.user.id, decision: 'approved', reason_note: note || null });
    // Fire-and-forget seller email; waitUntil keeps Vercel alive for it.
    waitUntil(notifySellerListingLive(listing, note || null));
    res.json({ ok: true, message: 'Approved. The listing is live.' });
  } catch (err) { next(err); }
});

// ── Reject (listing is kept, seller can edit + resubmit — D1) ─
// Body: { reason_code, note? } — note required for 'other'.
router.post('/:id/reject', requireAuth, requireReviewer, validId, async (req, res, next) => {
  try {
    const reason = REJECT_REASONS.find(r => r.code === req.body.reason_code);
    if (!reason) return next(createError('Please choose a reason.'));
    const note = cleanNote(req.body.note);
    if (note.length > REVIEW_NOTE_MAX) return next(createError(`Note is too long (max ${REVIEW_NOTE_MAX} characters).`));
    if (reason.noteRequired && !note) return next(createError('Please add a note for "Other".'));

    // Seller sees this text ("Not approved: …")
    const sellerText = reason.noteRequired ? note : (note ? `${reason.label}: ${note}` : reason.label);
    const listing = await decide(req.params.id, req.user.id, { status: 'rejected', rejection_reason: sellerText });
    if (!listing) return next(createError(CHANGED_MSG, 409));

    await recordReview({ listing_id: listing.id, reviewer_id: req.user.id, decision: 'rejected',
      reason_code: reason.code, reason_note: note || null });
    res.json({ ok: true, message: 'Rejected. The seller can edit and resubmit.' });
  } catch (err) { next(err); }
});

// ── Skip: release my claim ────────────────────────────────────
// Always 200 — releasing a claim I no longer hold is harmless.
router.post('/:id/release', requireAuth, requireReviewer, validId, async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin
      .from('listings')
      .update({ review_claimed_by: null, review_claimed_until: null })
      .eq('id', req.params.id)
      .eq('review_claimed_by', req.user.id);
    if (error) return next(createError(error.message, 500));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Team (admins only) ────────────────────────────────────────
// Emails are shown to admins only, to tell approvers apart.
router.get('/team', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { data: rows, error } = await supabaseAdmin
      .from('staff_members')
      .select('user_id, display_name, role, status, requested_at, decided_at')
      .order('requested_at', { ascending: false });
    if (error) return next(createError(error.message, 500));
    const team = await Promise.all((rows || []).map(async r => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
      return { ...r, email: data?.user?.email || null };
    }));
    res.json({ team });
  } catch (err) { next(err); }
});

// Body: { status: 'active' | 'revoked' }. Revoked also = "ignore" a stranger's request.
router.post('/team/:userId', requireAuth, requireAdmin, validId, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['active', 'revoked'].includes(status)) return next(createError('Status must be active or revoked.'));
    const { data, error } = await supabaseAdmin
      .from('staff_members')
      .update({ status, decided_by: req.user.id, decided_at: new Date().toISOString() })
      .eq('user_id', req.params.userId)
      .select('user_id, display_name, status')
      .maybeSingle();
    if (error) return next(createError(error.message, 500));
    if (!data) return next(createError('No such approver.', 404));
    waitUntil(logAuditEvent('staff_status_change', req, req.user.id, { staff_user_id: data.user_id, status }));
    res.json({ member: data });
  } catch (err) { next(err); }
});

module.exports = router;
