// ============================================================
// Listing Review Queue — /review page for approvers (Session 9L)
// Plan: docs/technical/review-queue-plan.md. Tables: migration 019.
// GET  /api/review/me              — my access + reasons (requireAuth only)
// POST /api/review/access-request  — after sign-up: ask to become an approver
// POST /api/review/next            — claim + return the next pending listing
// POST /api/review/:id/approve     — go live
// POST /api/review/:id/needs-change — fixable: seller edits + resubmits (D11)
// POST /api/review/:id/reject      — not acceptable + reason (listing is kept)
// POST /api/review/:id/release     — Skip: hand the listing back to the queue
// GET  /api/review/team            — admin: approver roster
// POST /api/review/team/:userId    — admin: activate / revoke an approver
// GET  /api/review/invite/check    — public: is this invite code usable? (D16)
// POST /api/review/invites         — admin: create a personal invite link
// GET  /api/review/invites         — admin: list invites
// POST /api/review/invites/:id/cancel — admin: cancel an unused invite
//
// Pattern: work queue with leases. claim_next_pending_listing() gives each
// approver a different listing for LEASE_SECONDS (FOR UPDATE SKIP LOCKED).
// Every decision only changes a listing that is still pending AND claimed by
// me — otherwise 409 (someone else decided, the claim ran out and was taken,
// or the seller edited it, which clears the claim).
// ============================================================
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth, requireAdmin, requireReviewer, isAdminEmail } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');
const { logAuditEvent } = require('../utils/auditLog');
const { notifySellerListingLive, notifySellerListingReviewed, siteUrl } = require('../utils/notifySeller');
const { newExpiry } = require('../config/listingRules');
const { REVIEW_REASONS, GROUP_HEADINGS, REVIEW_NOTE_MAX } = require('../config/reviewReasons');
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
    const reasons = REVIEW_REASONS.map(({ group, code, label, noteRequired }) => ({ group, code, label, noteRequired: !!noteRequired }));
    if (isAdminEmail(req.user.email)) {
      const { data: profile } = await supabaseAdmin.from('profiles').select('full_name').eq('id', req.user.id).maybeSingle();
      return res.json({ access: 'admin', display_name: profile?.full_name || null, email: req.user.email, reasons, headings: GROUP_HEADINGS, note_max: REVIEW_NOTE_MAX });
    }
    const { data: staff, error } = await supabaseAdmin
      .from('staff_members').select('status, display_name').eq('user_id', req.user.id).maybeSingle();
    if (error) return next(createError(error.message, 500));
    res.json({ access: staff?.status || 'none', display_name: staff?.display_name || null, email: req.user.email, reasons, headings: GROUP_HEADINGS, note_max: REVIEW_NOTE_MAX });
  } catch (err) { next(err); }
});

// ── Personal invite links (D16, migration 020) ───────────────
// Code = 8 characters without look-alikes (no 0/O, 1/I), shown as K7P2-QX9M.
// Only its sha256 is stored. An invite lets ONE account request access; it
// does NOT activate it — an admin still taps Activate.
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_DAYS = 7;
const INVITE_BAD_MSG = 'This invite link is not valid, already used or expired. Please ask the MapIt team for a new one.';

function newInviteCode() {
  let c = '';
  for (let i = 0; i < 8; i++) c += INVITE_ALPHABET[crypto.randomInt(INVITE_ALPHABET.length)];
  return c.slice(0, 4) + '-' + c.slice(4);
}
// Tolerant of case, spaces and the dash; null when it can't be a code.
function inviteHash(raw) {
  const code = typeof raw === 'string' ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  if (code.length !== 8 || ![...code].every(ch => INVITE_ALPHABET.includes(ch))) return null;
  return crypto.createHash('sha256').update('review-invite:' + code).digest('hex');
}

// ── Ask to become an approver (after sign-up) ────────────────
// Never changes an existing row: a revoked approver can't re-request
// their way back in; only an admin can reactivate them. Someone already on
// the roster gets their status back without using up an invite.
// Body: { display_name, invite }
router.post('/access-request', requireAuth, async (req, res, next) => {
  try {
    if (isAdminEmail(req.user.email)) return res.json({ access: 'admin' });
    const name = typeof req.body.display_name === 'string' ? req.body.display_name.trim().replace(/\s+/g, ' ') : '';
    if (name.length < 2 || name.length > 40) return next(createError('Please enter your name (2–40 characters).'));

    const { data: existing, error: exErr } = await supabaseAdmin
      .from('staff_members').select('status, display_name').eq('user_id', req.user.id).maybeSingle();
    if (exErr) return next(createError(exErr.message, 500));
    if (existing) return res.json({ access: existing.status, display_name: existing.display_name });

    const hash = inviteHash(req.body.invite);
    if (!hash) return next(createError('You need an invite link from the MapIt team to join.', 403));
    // Use the invite with ONE conditional update, so two people opening the
    // same link at once can't both use it (same idea as decide()).
    const { data: invite, error: invErr } = await supabaseAdmin
      .from('review_invites')
      .update({ used_by: req.user.id, used_at: new Date().toISOString() })
      .eq('code_hash', hash)
      .is('used_at', null)
      .is('cancelled_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('id')
      .maybeSingle();
    if (invErr) return next(createError(invErr.message, 500));
    if (!invite) return next(createError(INVITE_BAD_MSG, 403));

    const { error } = await supabaseAdmin
      .from('staff_members')
      .upsert({ user_id: req.user.id, display_name: name }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (error) {
      // Give the invite back, so a DB hiccup doesn't burn the person's link
      await supabaseAdmin.from('review_invites').update({ used_by: null, used_at: null }).eq('id', invite.id);
      return next(createError(error.message, 500));
    }
    const { data: staff } = await supabaseAdmin
      .from('staff_members').select('status, display_name').eq('user_id', req.user.id).single();
    res.json({ access: staff.status, display_name: staff.display_name });
  } catch (err) { next(err); }
});

// Public pre-check, so the page can say "expired" before anyone types an
// email. Answers valid true/false only — never who the invite is for.
const inviteCheckLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { error: 'Too many tries. Please wait 1 hour.' },
});
router.get('/invite/check', inviteCheckLimiter, async (req, res, next) => {
  try {
    const hash = inviteHash(req.query.code);
    if (!hash) return res.json({ valid: false });
    const { data, error } = await supabaseAdmin
      .from('review_invites').select('id')
      .eq('code_hash', hash).is('used_at', null).is('cancelled_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (error) return next(createError(error.message, 500));
    res.json({ valid: !!data });
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
      // Nobody reviews their own listing — admins included, since sellers
      // now post themselves (no more posting on their behalf, 2026-10-31)
      p_exclude_seller: req.user.id,
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
router.post('/:id/approve', requireAuth, requireReviewer, validId, async (req, res, next) => {
  try {
    // The 30 days start when the listing goes live, not when it was posted
    const listing = await decide(req.params.id, req.user.id,
      { status: 'active', expires_at: newExpiry(), rejection_reason: null });
    if (!listing) return next(createError(CHANGED_MSG, 409));

    await recordReview({ listing_id: listing.id, reviewer_id: req.user.id, decision: 'approved' });
    // Fire-and-forget seller email; waitUntil keeps Vercel alive for it.
    waitUntil(notifySellerListingLive(listing));
    res.json({ ok: true, message: 'Approved. The listing is live.' });
  } catch (err) { next(err); }
});

// ── Needs change / Reject (listing is kept, seller can edit + resubmit — D1) ─
// Both store status 'rejected' (option A, D11); the reason's group decides the
// seller's heading. Body: { reason_code, note? } — note required for 'Other'.
// The code must belong to the button's group, so the approver's choice and
// the seller's heading can never disagree.
function decideWithReason(group, message) {
  return async (req, res, next) => {
    try {
      const reason = REVIEW_REASONS.find(r => r.group === group && r.code === req.body.reason_code);
      if (!reason) return next(createError('Please choose a reason.'));
      const note = cleanNote(req.body.note);
      if (note.length > REVIEW_NOTE_MAX) return next(createError(`Note is too long (max ${REVIEW_NOTE_MAX} characters).`));
      if (reason.noteRequired && !note) return next(createError('Please add a note for "Other".'));

      // The full sentence the seller sees in My Listings, e.g.
      // "Needs a small change: Wrong category: listed as a car, it is a scooter"
      const detail = reason.noteRequired ? note : (note ? `${reason.label}: ${note}` : reason.label);
      const listing = await decide(req.params.id, req.user.id,
        { status: 'rejected', rejection_reason: `${GROUP_HEADINGS[group]}: ${detail}` });
      if (!listing) return next(createError(CHANGED_MSG, 409));

      await recordReview({ listing_id: listing.id, reviewer_id: req.user.id, decision: 'rejected',
        reason_code: reason.code, reason_note: note || null });
      waitUntil(notifySellerListingReviewed(listing, group));
      res.json({ ok: true, message });
    } catch (err) { next(err); }
  };
}

router.post('/:id/needs-change', requireAuth, requireReviewer, validId,
  decideWithReason('change', 'Sent back to the seller for a change.'));
router.post('/:id/reject', requireAuth, requireReviewer, validId,
  decideWithReason('reject', 'Rejected. The seller has been told why.'));

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

// ── Invites (admin) ──────────────────────────────────────────
// Body: { display_name } — who it is for. The code is shown ONCE, here;
// only its hash is stored, so a lost link is cancelled and made again.
router.post('/invites', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const name = typeof req.body.display_name === 'string' ? req.body.display_name.trim().replace(/\s+/g, ' ') : '';
    if (name.length < 2 || name.length > 40) return next(createError('Please enter who the invite is for (2–40 characters).'));
    const expires_at = new Date(Date.now() + INVITE_DAYS * 86400e3).toISOString();

    for (let attempt = 0; attempt < 3; attempt++) {
      const code = newInviteCode();
      const { data, error } = await supabaseAdmin
        .from('review_invites')
        .insert({ code_hash: inviteHash(code), display_name: name, created_by: req.user.id, expires_at })
        .select('id, display_name, expires_at')
        .single();
      if (error?.code === '23505') continue;   // same code already exists (very unlikely): new code
      if (error) return next(createError(error.message, 500));
      waitUntil(logAuditEvent('review_invite_created', req, req.user.id, { invite_id: data.id }));
      return res.json({ invite: data, code, link: `${siteUrl()}/review?invite=${code}` });
    }
    next(createError('Could not create an invite. Please try again.', 500));
  } catch (err) { next(err); }
});

// status: open | used | cancelled | expired. used_by_name from the roster.
router.get('/invites', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { data: rows, error } = await supabaseAdmin
      .from('review_invites')
      .select('id, display_name, created_at, expires_at, used_by, used_at, cancelled_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return next(createError(error.message, 500));
    const usedIds = rows.filter(r => r.used_by).map(r => r.used_by);
    const { data: staff } = usedIds.length
      ? await supabaseAdmin.from('staff_members').select('user_id, display_name').in('user_id', usedIds)
      : { data: [] };
    const names = Object.fromEntries((staff || []).map(s => [s.user_id, s.display_name]));
    const now = Date.now();
    const invites = rows.map(({ used_by, ...r }) => ({
      ...r,
      used_by_name: used_by ? names[used_by] || null : null,
      status: r.used_at ? 'used' : r.cancelled_at ? 'cancelled' : new Date(r.expires_at).getTime() <= now ? 'expired' : 'open',
    }));
    res.json({ invites });
  } catch (err) { next(err); }
});

router.post('/invites/:id/cancel', requireAuth, requireAdmin, validId, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('review_invites')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('id', req.params.id).is('used_at', null).is('cancelled_at', null)
      .select('id')
      .maybeSingle();
    if (error) return next(createError(error.message, 500));
    if (!data) return next(createError('This invite was already used or cancelled.', 404));
    waitUntil(logAuditEvent('review_invite_cancelled', req, req.user.id, { invite_id: data.id }));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
