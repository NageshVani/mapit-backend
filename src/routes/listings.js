// ============================================================
// Listings Routes
// GET    /api/listings           — get listings (with radius filter)
// GET    /api/listings/:id       — get single listing with photos + seller
// POST   /api/listings           — create new listing
// PUT    /api/listings/:id       — update listing
// DELETE /api/listings/:id       — delete listing
// PUT    /api/listings/:id/sold  — mark as sold
// PUT    /api/listings/:id/renew — owner extends an active listing by 30 days
// GET    /api/listings/mine      — get current user's own listings
// POST   /api/listings/:id/save  — save/unsave a listing (toggle)
// GET    /api/listings/saved     — get user's saved listings
// POST   /api/listings/:id/view  — increment view count
// POST   /api/listings/:id/feedback — submit feedback on a listing
// ============================================================
const express         = require('express');
const crypto          = require('crypto');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth, requireAdmin, isAdminEmail } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');
const { fuzzLocation, haversineM } = require('../utils/geo');
const { areaName } = require('../utils/areaName');
const { logAuditEvent } = require('../utils/auditLog');
const { lookupAndStoreNearbyPois } = require('../utils/poiLookup');
const { moderateAndAlert } = require('../utils/notifyListings');
const { notifySellerListingLive } = require('../utils/notifySeller');
const { needsPhoneVerification } = require('../utils/phoneGate');
const { waitUntil } = require('@vercel/functions');
const { LISTING_EXPIRY_ENABLED, enforceRentOnly } = require('../config/listingRules');

const router = express.Router();

// Valid categories and statuses
const VALID_CATEGORIES = ['re', 'veh', 'hh', 'furn', 'electronics']; // furn kept for legacy data
const VALID_STATUSES   = ['active', 'sold', 'expired'];
// Seller phone numbers are never shown (Nagesh + Arun, 2026-10-24): the post
// form no longer offers a choice and the server always stores 'never'. The
// show_phone column is kept (no migration) in case the decision changes.
const SHOW_PHONE = 'never';

// Listing life: 30 days from approval, renewable by the owner.
// Lazy expiry: reads hide listings past expires_at; nothing flips status to
// 'expired' yet (that cron + seller emails come with Session 9H).
// Switched off by LISTING_EXPIRY_ENABLED (FB-06) — see src/config/listingRules.js.
const LISTING_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const newExpiry = () => new Date(Date.now() + LISTING_TTL_MS).toISOString();
const isLive = l => !LISTING_EXPIRY_ENABLED || !l.expires_at || new Date(l.expires_at).getTime() > Date.now();

// Description keeps the seller's line breaks (feedback FB-02, 2026-10-28):
// CRLF → LF, 3+ newlines → one blank line, trimmed ends. Empty → null.
const cleanDescription = d =>
  typeof d === 'string' ? (d.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim() || null) : null;

// Radius search over-fetches by this much, then filters on the visible
// point. MUST stay above fuzzLocation()'s max offset (400 m, utils/geo.js).
const FUZZ_MARGIN_M = 500;

// Reference code: MP-BLR-XXXXXX (6 alphanumeric, no 0/O/1/I to avoid confusion)
function generateRefCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'MP-BLR-';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Resolves what location a viewer is allowed to see for a listing: the
// owner always sees their own exact lat/lng (needed to edit the pin); any
// other viewer sees exact only if the seller opted in via
// show_exact_location, otherwise the fuzzed display point. display_lat/lng
// is normally pre-computed at write time, but falls back to computing it
// here for any row that predates migration 010 — safe because fuzzLocation
// is deterministic (same listing id always yields the same fuzzed point).
function visiblePoint(listing, viewerId) {
  const isOwner = !!viewerId && listing.seller_id === viewerId;
  const exact = isOwner || !!listing.show_exact_location;
  if (exact) return { lat: listing.lat, lng: listing.lng, exact };
  if (listing.display_lat != null && listing.display_lng != null) {
    return { lat: listing.display_lat, lng: listing.display_lng, exact };
  }
  const fuzzed = fuzzLocation(listing.lat, listing.lng, listing.id);
  return { lat: fuzzed.lat, lng: fuzzed.lng, exact };
}

function resolveListingLocation(listing, viewerId) {
  const { lat, lng, exact } = visiblePoint(listing, viewerId);
  // Moderation fields (migration 015) are admin-only — strip them from every
  // buyer/seller-facing response. The admin queue reads them via /pending/all,
  // which doesn't go through this function.
  const { display_lat, display_lng, moderation_verdict, moderation_reason, moderation_scored_at, ...rest } = listing;
  return { ...rest, lat, lng, location_is_exact: exact };
}

// ── GET pending listings (admin review) ──────────────────────
// GET /api/listings/pending/all
router.get('/pending/all', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { data: listings, error } = await supabaseAdmin
      .from('listings')
      // listing_photos: the reviewer must see the photos they approve
      .select('*, profiles(full_name, avatar_color, suspended), listing_photos(public_url, sort_order)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) return next(createError(error.message));
    // Session 9E: flagged listings sort first (a signal for the human
    // reviewer, not an auto-reject gate) — cheap in-JS sort rather than a
    // second query, same pattern as the admin Overview dashboard's other
    // cheap-query-plus-JS-aggregation stats. created_at DESC is preserved
    // within each group since Array.sort is stable in Node.
    const sorted = (listings || []).slice().sort((a, b) =>
      (b.moderation_verdict === 'flagged' ? 1 : 0) - (a.moderation_verdict === 'flagged' ? 1 : 0));
    res.json({ listings: sorted });
  } catch (err) { next(err); }
});

// ── Approve listing (admin) ───────────────────────────────────
// PUT /api/listings/:id/approve
router.put('/:id/approve', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data: listing, error } = await supabaseAdmin
      .from('listings')
      // The 30 days start when the listing goes live, not when it was posted
      .update({ status: 'active', expires_at: newExpiry() })
      .eq('id', id)
      .select()
      .single();
    if (error) return next(createError(error.message));
    // Fire-and-forget seller email (FB-05); waitUntil keeps Vercel alive for it.
    waitUntil(notifySellerListingLive(listing));
    res.json({ listing, message: 'Listing approved and is now live.' });
  } catch (err) { next(err); }
});

// ── GET reported-listings queue (admin) ───────────────────────
// GET /api/listings/reports/queue
// Returns open (unresolved) listing_reports, joined with the reported
// listing's details + photos (the admin judges the report against the full
// listing, same as the pending queue) and the reporter's nickname, newest first.
router.get('/reports/queue', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { data: reports, error } = await supabaseAdmin
      .from('listing_reports')
      .select(`*, listings(id, title, status, seller_id, category, subcategory, price, price_label, address,
        description, reference_code, profiles(suspended, full_name), listing_photos(public_url, sort_order)),
        profiles!reporter_id(nickname, full_name)`)
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (error) return next(createError(error.message));

    // Batch-check which reports have a matching conversation (reporter as
    // buyer, on the reported listing) so the admin page can show/hide the
    // "View Chat" button without an extra round-trip per report.
    const listingIds = [...new Set((reports || []).map(r => r.listing_id))];
    let convKeySet = new Set();
    if (listingIds.length > 0) {
      const { data: convs } = await supabaseAdmin
        .from('conversations')
        .select('listing_id, buyer_id')
        .in('listing_id', listingIds);
      (convs || []).forEach(c => convKeySet.add(`${c.listing_id}:${c.buyer_id}`));
    }
    const withFlag = (reports || []).map(r => ({
      ...r,
      has_conversation: convKeySet.has(`${r.listing_id}:${r.reporter_id}`),
    }));

    res.json({ reports: withFlag });
  } catch (err) { next(err); }
});

// ── GET the chat thread tied to a report (admin, read-only) ──────
// GET /api/listings/reports/:reportId/chat
// Finds the conversation between the reporter (as buyer) and the listing's
// seller, returns the full message history with sender nicknames, and logs
// the view to report_chat_views. 404s if no matching conversation exists —
// the frontend only shows the "View Chat" button when has_conversation was
// true on the queue response, so this is a safety net, not the main path.
router.get('/reports/:reportId/chat', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { reportId } = req.params;

    const { data: report } = await supabaseAdmin
      .from('listing_reports')
      .select('id, listing_id, reporter_id')
      .eq('id', reportId)
      .single();
    if (!report) return next(createError('Report not found.', 404));

    const { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select(`
        id, listing_id, buyer_id, seller_id,
        buyer:profiles!buyer_id(id, nickname),
        seller:profiles!seller_id(id, nickname)
      `)
      .eq('listing_id', report.listing_id)
      .eq('buyer_id', report.reporter_id)
      .maybeSingle();

    if (!conversation) return next(createError('No conversation found for this report.', 404));

    const { data: messages, error } = await supabaseAdmin
      .from('chat_messages')
      .select('id, sender_id, content, sent_at')
      .eq('conversation_id', conversation.id)
      .order('sent_at', { ascending: true });
    if (error) return next(createError(error.message));

    const { error: logErr } = await supabaseAdmin
      .from('report_chat_views')
      .insert({ report_id: reportId, admin_id: req.user.id });
    if (logErr) console.error('report_chat_views logging failed:', logErr.message);

    res.json({ conversation, messages: messages || [] });
  } catch (err) { next(err); }
});

// ── Resolve a report (admin) ──────────────────────────────────
// PUT /api/listings/reports/:reportId/resolve
// Body: { action: 'dismiss' | 'remove_listing', reason? }
//   dismiss        — marks the report resolved, listing untouched
//   remove_listing — deletes the reported listing (+ its Storage photos,
//                    same cleanup as the seller's own DELETE /:id) and
//                    marks the report resolved; `reason` (one of the 5
//                    report reason codes) overwrites the report's stored
//                    reason if the admin picked a different one than the
//                    reporter did
router.put('/reports/:reportId/resolve', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const { action, reason } = req.body;

    if (!['dismiss', 'remove_listing'].includes(action)) {
      return next(createError("action must be 'dismiss' or 'remove_listing'."));
    }
    if (reason && !VALID_REPORT_REASONS.includes(reason)) {
      return next(createError(`reason must be one of: ${VALID_REPORT_REASONS.join(', ')}`));
    }

    const { data: report } = await supabaseAdmin
      .from('listing_reports')
      .select('id, listing_id')
      .eq('id', reportId)
      .single();
    if (!report) return next(createError('Report not found.', 404));

    if (action === 'remove_listing') {
      const { data: photos } = await supabaseAdmin
        .from('listing_photos')
        .select('storage_path')
        .eq('listing_id', report.listing_id);

      const { error: delErr } = await supabaseAdmin
        .from('listings')
        .delete()
        .eq('id', report.listing_id);
      if (delErr) return next(createError(delErr.message));

      if (photos && photos.length) {
        const bucket = process.env.STORAGE_BUCKET || 'listing-photos';
        try {
          await supabaseAdmin.storage.from(bucket).remove(photos.map(p => p.storage_path));
        } catch (storageErr) {
          console.error('Storage cleanup on admin listing removal failed:', storageErr.message);
        }
      }
    }

    const updates = { status: 'resolved' };
    if (reason) updates.reason = reason;

    const { data: updated, error } = await supabaseAdmin
      .from('listing_reports')
      .update(updates)
      .eq('id', reportId)
      .select()
      .single();
    if (error) return next(createError(error.message));

    res.json({ report: updated });
  } catch (err) { next(err); }
});

// ── GET cleanup candidates (admin) ─────────────────────────────
// GET /api/listings/cleanup/candidates
// Two independent flags, not mutually exclusive:
//  - stale: status='active' but expires_at has passed. Nothing in this
//    codebase ever flips status to 'expired' or filters browse results by
//    expires_at, so these listings would otherwise sit live forever.
//  - duplicates: active/pending listings grouped by (seller_id + title +
//    price) with more than one match — tight match, deliberately not
//    category/subcategory-based, to keep false positives low (e.g. a
//    dealer with two genuinely similar cars must not get flagged).
router.get('/cleanup/candidates', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const nowIso = new Date().toISOString();

    // Expiry off (FB-06): nothing is stale, so admins can't bulk-delete
    // listings that are still live for buyers.
    const { data: staleRaw, error: staleErr } = LISTING_EXPIRY_ENABLED
      ? await supabaseAdmin
          .from('listings')
          .select('*, profiles(full_name, avatar_color)')
          .eq('status', 'active')
          .lt('expires_at', nowIso)
          .order('expires_at', { ascending: true })
      : { data: [], error: null };
    if (staleErr) return next(createError(staleErr.message));

    const { data: liveRaw, error: liveErr } = await supabaseAdmin
      .from('listings')
      .select('*, profiles(full_name, avatar_color)')
      .in('status', ['active', 'pending'])
      .order('created_at', { ascending: true });
    if (liveErr) return next(createError(liveErr.message));

    const groups = new Map();
    for (const l of liveRaw || []) {
      const key = `${l.seller_id}|${(l.title || '').trim().toLowerCase()}|${l.price}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(l);
    }
    const duplicates = [...groups.values()].filter(g => g.length > 1);

    res.json({ stale: staleRaw || [], duplicates });
  } catch (err) { next(err); }
});

// ── Bulk-delete listings (admin) ───────────────────────────────
// POST /api/listings/cleanup/bulk-delete   body: { ids: [...] }
// Same photo-cleanup pattern as the single DELETE /:id route, just looped —
// deliberately sequential (not Promise.all) so one Storage hiccup can't
// tangle up with another listing's cleanup, and so the response can report
// exactly which ids failed rather than an all-or-nothing result.
router.post('/cleanup/bulk-delete', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return next(createError('ids must be a non-empty array.'));
    }

    const bucket = process.env.STORAGE_BUCKET || 'listing-photos';
    const deleted = [];
    const failed = [];

    for (const id of ids) {
      try {
        const { data: photos } = await supabaseAdmin
          .from('listing_photos')
          .select('storage_path')
          .eq('listing_id', id);

        const { error: delErr } = await supabaseAdmin
          .from('listings')
          .delete()
          .eq('id', id);
        if (delErr) { failed.push({ id, error: delErr.message }); continue; }

        if (photos && photos.length) {
          try {
            await supabaseAdmin.storage.from(bucket).remove(photos.map(p => p.storage_path));
          } catch (storageErr) {
            console.error('Storage cleanup on bulk delete failed for', id, ':', storageErr.message);
          }
        }
        deleted.push(id);
      } catch (err) {
        failed.push({ id, error: err.message });
      }
    }

    res.json({ deleted, failed, message: `${deleted.length} listing(s) deleted.${failed.length ? ` ${failed.length} failed.` : ''}` });
  } catch (err) { next(err); }
});

// Session 9G — Real Estate transaction type ('Rent' | 'Sell'), stored in
// details.transaction_type by the post form. Legacy/seed rows predate that
// field: a 'per month' price label means Rent, anything else Sell. Mirrors
// isRental() in the frontend so pins and filters always agree.
function listingTxn(l) {
  const t = l.details?.transaction_type;
  if (t === 'Rent' || t === 'Sell') return t;
  return /per\s*month|\/\s*month|monthly/i.test(l.price_label || '') ? 'Rent' : 'Sell';
}

// ── GET listings with radius filter ──────────────────────────
// GET /api/listings?lat=12.93&lng=77.62&radius=5000&category=re&subcategory=Buy&q=flat&txn=Rent
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const {
      lat, lng,
      radius    = 5000,   // metres — default 5 km
      category,
      subcategory,
      txn,                // 'Rent' | 'Sell' — Real Estate only (Session 9G)
      q,                  // search query
      limit     = 50,
      offset    = 0,
    } = req.query;

    let listings;

    if (lat && lng) {
      // DB-side radius filter via the listings_within_radius RPC (migration 013)
      // — returns only (id, distance_m), so the follow-up `select('*')` below
      // always carries every listings column (subcategory included) without
      // the RPC needing its own hardcoded column list to stay in sync.
      // The RPC measures from the EXACT point, so it is asked for radius +
      // FUZZ_MARGIN_M (candidates), and membership is decided below from the
      // point the viewer can see (2026-10-21, replaces planned migration 019).
      const rM = Math.min(parseInt(radius), 999000);
      const uLat = parseFloat(lat), uLng = parseFloat(lng);

      const { data: nearby, error: rpcError } = await supabaseAdmin
        .rpc('listings_within_radius', { user_lat: uLat, user_lng: uLng, radius_m: rM + FUZZ_MARGIN_M });

      if (rpcError) return next(createError(rpcError.message));

      const distanceById = new Map((nearby || []).map(r => [r.id, r.distance_m]));
      const ids = [...distanceById.keys()];

      if (!ids.length) {
        listings = [];
      } else {
        const { data, error } = await supabaseAdmin
          .from('listings')
          .select('*')
          .in('id', ids);

        if (error) return next(createError(error.message));
        // The RPC measures from the exact lat/lng. For a fuzzed listing that
        // number (and the sort order, and whether it is inside the radius at
        // all) would let a buyer trilaterate the real spot from a few
        // searches, so measure from the point they can see and keep only
        // listings whose VISIBLE point is within the requested radius.
        listings = (data || [])
          .map(l => {
            const p = visiblePoint(l, req.user.id);
            const distance_m = p.exact
              ? distanceById.get(l.id)
              : Math.round(haversineM(uLat, uLng, p.lat, p.lng));
            return { ...l, distance_m };
          })
          .filter(l => l.distance_m <= rM)
          .sort((a, b) => a.distance_m - b.distance_m);
      }
    } else {
      // No location — return all active listings
      const { data, error } = await supabaseAdmin
        .from('listings')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) return next(createError(error.message));
      listings = data || [];
    }

    // Hide listings past expires_at (before pagination, so `total` matches)
    listings = listings.filter(isLive);

    // Apply filters in-memory after PostGIS query
    if (category && category !== 'all') {
      listings = listings.filter(l => l.category === category);
    }
    if (subcategory && subcategory !== 'All Types') {
      listings = listings.filter(l => l.subcategory === subcategory);
    }
    // Only the two known values are honoured; anything else is ignored rather
    // than echoed, so a crafted ?txn= cannot change behaviour.
    if (txn === 'Rent' || txn === 'Sell') {
      listings = listings.filter(l => l.category === 're' && listingTxn(l) === txn);
    }
    if (q) {
      const ql = q.toLowerCase();
      listings = listings.filter(l =>
        l.title?.toLowerCase().includes(ql) ||
        l.address?.toLowerCase().includes(ql) ||
        l.subcategory?.toLowerCase().includes(ql)
      );
    }

    // Paginate
    const total     = listings.length;
    const paginated = listings.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    // Get photos for each listing (cover photo only for list view)
    const listingIds = paginated.map(l => l.id);
    let photosMap = {};
    if (listingIds.length > 0) {
      const { data: photos } = await supabaseAdmin
        .from('listing_photos')
        .select('listing_id, public_url, sort_order')
        .in('listing_id', listingIds)
        .eq('sort_order', 0);

      (photos || []).forEach(p => { photosMap[p.listing_id] = p.public_url; });
    }

    // Get seller profiles
    const sellerIds = [...new Set(paginated.map(l => l.seller_id))];
    let sellersMap = {};
    if (sellerIds.length > 0) {
      const { data: sellers } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, trust_badge, avg_rating, review_count, avatar_color')
        .in('id', sellerIds);

      (sellers || []).forEach(s => { sellersMap[s.id] = s; });
    }

    // Compose response
    const result = paginated.map(l => ({
      ...resolveListingLocation(l, req.user.id),
      cover_photo: photosMap[l.id] || null,
      seller:      sellersMap[l.seller_id] || null,
    }));

    res.json({ listings: result, total, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) { next(err); }
});

// ── My listings ───────────────────────────────────────────────
// GET /api/listings/mine/all
router.get('/mine/all', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.query;

    let query = supabaseAdmin
      .from('listings')
      .select('*')
      .eq('seller_id', req.user.id)
      .order('created_at', { ascending: false });

    if (status && VALID_STATUSES.includes(status)) {
      query = query.eq('status', status);
    }

    const { data: listings, error } = await query;
    if (error) return next(createError(error.message));

    res.json({ listings: listings || [] });
  } catch (err) { next(err); }
});

// ── Get saved listings ────────────────────────────────────────
// GET /api/listings/saved/all
router.get('/saved/all', requireAuth, async (req, res, next) => {
  try {
    const { data: saved, error } = await supabaseAdmin
      .from('saved_listings')
      .select('listing_id, saved_at, listings(*)')
      .eq('user_id', req.user.id)
      .order('saved_at', { ascending: false });

    if (error) return next(createError(error.message));

    const listings = (saved || []).map(s => ({
      ...resolveListingLocation(s.listings, req.user.id),
      saved_at: s.saved_at,
    }));

    res.json({ listings });
  } catch (err) { next(err); }
});

// ── GET single listing ────────────────────────────────────────
// GET /api/listings/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: listing, error } = await supabaseAdmin
      .from('listings')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !listing) return next(createError('Listing not found.', 404));

    // Photos (all, sorted)
    const { data: photos } = await supabaseAdmin
      .from('listing_photos')
      .select('*')
      .eq('listing_id', id)
      .order('sort_order');

    // Seller profile
    const { data: seller } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, trust_badge, avg_rating, review_count, avatar_color, created_at')
      .eq('id', listing.seller_id)
      .single();

    // Is this listing saved by the current user?
    const { data: saved } = await supabaseAdmin
      .from('saved_listings')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('listing_id', id)
      .maybeSingle();

    res.json({
      listing: {
        ...resolveListingLocation(listing, req.user.id),
        photos: photos || [],
        seller: seller || null,
        is_saved: !!saved,
      },
    });
  } catch (err) { next(err); }
});

// ── POST create listing ───────────────────────────────────────
// POST /api/listings
// Body: { category, subcategory, title, description, price, price_label,
//         lat, lng, specs, details, show_exact_location }
// (any `address` sent is ignored — the server derives the area name)
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const {
      category, subcategory, title, description,
      price, price_label,
      lat, lng, specs, details, show_exact_location,
    } = req.body;

    // Validation
    if (!category || !subcategory || !title || !lat || !lng) {
      return next(createError('category, subcategory, title, lat and lng are required.'));
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return next(createError(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`));
    }
    if (title.length > 80) return next(createError('Title must be 80 characters or less.'));
    if (price && parseFloat(price) < 0) return next(createError('Price cannot be negative.'));

    // Session 9C: new accounts must verify their phone before posting. The
    // frontend pre-checks via /api/auth/otp/phone/status; this is the real gate.
    const { data: sellerProfile } = await supabaseAdmin
      .from('profiles').select('phone_verified').eq('id', req.user.id).maybeSingle();
    if (needsPhoneVerification(req.user, sellerProfile)) {
      return res.status(403).json({
        error: 'Please verify your phone number via WhatsApp before posting a listing.',
        phone_verification_required: true,
      });
    }

    // Generated up front (rather than left to the DB default) so the fuzz
    // offset below can be seeded by it in the same insert — avoids a
    // second round-trip to compute display_lat/lng after the row exists.
    const listingId = crypto.randomUUID();
    const exactLat = parseFloat(lat), exactLng = parseFloat(lng);
    const fuzzed = fuzzLocation(exactLat, exactLng, listingId);
    const showExactLocation = show_exact_location === true || show_exact_location === 'true';
    // Public address = area name of the pin buyers see; the client's
    // `address` is ignored (it carried the seller's private location label).
    const publicAddress = await areaName(
      showExactLocation ? exactLat : fuzzed.lat,
      showExactLocation ? exactLng : fuzzed.lng);

    const { data: listing, error } = await supabaseAdmin
      .from('listings')
      .insert({
        id:                   listingId,
        seller_id:            req.user.id,
        category,
        subcategory,
        title:                title.trim(),
        description:          cleanDescription(description),
        price:                parseFloat(price) || 0,
        price_label:          price_label?.trim() || null,
        lat:                  exactLat,
        lng:                  exactLng,
        display_lat:          fuzzed.lat,
        display_lng:          fuzzed.lng,
        show_exact_location:  showExactLocation,
        address:              publicAddress,
        specs:                specs || [],
        details:              enforceRentOnly(category, subcategory, details || {}),
        status:               'pending',
        reference_code:       generateRefCode(),
        expires_at:           newExpiry(),
        show_phone:           SHOW_PHONE,
      })
      .select()
      .single();

    if (error) return next(createError(error.message));

    // Fire-and-forget: never block or fail listing creation on POI lookup errors.
    lookupAndStoreNearbyPois(listing.id, listing.lat, listing.lng)
      .catch(err => console.error('POI lookup pipeline failed:', err.message));

    // Fire-and-forget: never block or fail listing creation on moderation
    // errors (migration 015, Session 9E). Flagged/clean is a sort signal
    // for the human admin reviewer, not an auto-approve/auto-reject gate —
    // the listing goes to the normal 'pending' review queue either way.
    // Then emails the listings@ admin mailbox (🆕 NEW). waitUntil() keeps
    // the Vercel function alive until this finishes after the response is
    // sent (fixes T-015: the function could freeze first); no-op locally.
    waitUntil(moderateAndAlert(listing, 'new'));

    // Fire-and-forget: IT Rules 2021 compliance record (migration 014).
    logAuditEvent('listing_created', req, req.user.id, { listing_id: listing.id });

    res.status(201).json({ listing, message: 'Listing submitted for review. It will go live within 4 hours.' });
  } catch (err) { next(err); }
});

// ── PUT update listing ────────────────────────────────────────
// PUT /api/listings/:id
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Ensure listing belongs to current user. Full row: the listings@
    // alert compares before/after ("What changed", "was live").
    const { data: existing } = await supabaseAdmin
      .from('listings')
      .select('*')
      .eq('id', id)
      .single();

    if (!existing) return next(createError('Listing not found.', 404));
    if (existing.seller_id !== req.user.id) {
      return next(createError('You can only edit your own listings.', 403));
    }

    const allowedFields = [
      'title', 'description', 'price', 'price_label',
      'specs', 'details', 'category', 'subcategory', 'lat', 'lng',
      'show_exact_location',
    ];
    const updates = {};
    allowedFields.forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });

    if (Object.keys(updates).length === 0) {
      return next(createError('No valid fields to update.'));
    }

    if (updates.description !== undefined) updates.description = cleanDescription(updates.description);

    // Rent-only types (PG, FB-04): an edit can't turn one into a sale, nor
    // move a sale listing into PG while keeping 'Sell'.
    const finalCat = updates.category ?? existing.category;
    const finalSub = updates.subcategory ?? existing.subcategory;
    const finalDetails = updates.details ?? existing.details;
    const rentOnly = enforceRentOnly(finalCat, finalSub, finalDetails);
    if (rentOnly?.transaction_type !== finalDetails?.transaction_type) updates.details = rentOnly;

    if (updates.show_exact_location !== undefined) {
      updates.show_exact_location = updates.show_exact_location === true || updates.show_exact_location === 'true';
    }

    // Moving the pin invalidates the previously-fuzzed display point —
    // recompute it from the (possibly partially) updated coordinates, still
    // seeded by the same listing id so the offset stays stable going forward.
    if (updates.lat !== undefined || updates.lng !== undefined) {
      const newLat = updates.lat !== undefined ? parseFloat(updates.lat) : existing.lat;
      const newLng = updates.lng !== undefined ? parseFloat(updates.lng) : existing.lng;
      const fuzzed = fuzzLocation(newLat, newLng, id);
      updates.display_lat = fuzzed.lat;
      updates.display_lng = fuzzed.lng;
    }
    // `address` is server-derived (never taken from the client) — refresh it
    // when the pin buyers see changes: a moved pin or a flipped exact-pin setting.
    const pinMoved = updates.display_lat !== undefined
      && (Number(updates.lat ?? existing.lat) !== Number(existing.lat) || Number(updates.lng ?? existing.lng) !== Number(existing.lng));
    const exactChanged = updates.show_exact_location !== undefined && updates.show_exact_location !== existing.show_exact_location;
    if (pinMoved || exactChanged || !existing.address || existing.address.includes('·')) {
      const exact = updates.show_exact_location ?? existing.show_exact_location;
      const pt = exact
        ? { lat: Number(updates.lat ?? existing.lat), lng: Number(updates.lng ?? existing.lng) }
        : (updates.display_lat ?? existing.display_lat) != null
          ? { lat: updates.display_lat ?? existing.display_lat, lng: updates.display_lng ?? existing.display_lng }
          : fuzzLocation(Number(existing.lat), Number(existing.lng), id);   // rows inserted by SQL have no display point
      updates.address = await areaName(pt.lat, pt.lng);
    }

    // Re-submit for review whenever the owner edits
    updates.status = 'pending';
    updates.show_phone = SHOW_PHONE;   // older listings saved 'on_agreement'

    const { data: listing, error } = await supabaseAdmin
      .from('listings')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return next(createError(error.message));

    // Fire-and-forget: re-run moderation if title/description changed, then
    // email the listings@ admin mailbox (✏️ UPDATED). Same as POST above.
    waitUntil(moderateAndAlert(listing, 'updated', existing));

    res.json({ listing, message: 'Listing updated and re-submitted for review.' });
  } catch (err) { next(err); }
});

// ── DELETE listing ────────────────────────────────────────────
// DELETE /api/listings/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: existing } = await supabaseAdmin
      .from('listings')
      .select('seller_id')
      .eq('id', id)
      .single();

    if (!existing) return next(createError('Listing not found.', 404));
    // Owners can delete their own listings; admins can also delete any
    // listing (used by the admin Reject-pending-listing action).
    if (existing.seller_id !== req.user.id && !isAdminEmail(req.user.email)) {
      return next(createError('You can only delete your own listings.', 403));
    }

    // listing_photos rows cascade-delete with the listing (confirmed via
    // ON DELETE CASCADE), but that only removes the DB rows — the actual
    // Supabase Storage objects they pointed to are a separate system and are
    // never touched by that cascade. Read the paths before deleting the
    // listing, so we can also remove the files themselves and not leave them
    // orphaned in Storage (see the cleanup-orphaned sweep in uploads.js for
    // the backstop that catches anything that slips through elsewhere).
    const { data: photos } = await supabaseAdmin
      .from('listing_photos')
      .select('storage_path')
      .eq('listing_id', id);

    const { error } = await supabaseAdmin
      .from('listings')
      .delete()
      .eq('id', id);

    if (error) return next(createError(error.message));

    if (photos && photos.length) {
      const bucket = process.env.STORAGE_BUCKET || 'listing-photos';
      try {
        await supabaseAdmin.storage.from(bucket).remove(photos.map(p => p.storage_path));
      } catch (storageErr) {
        console.error('Storage cleanup on listing delete failed:', storageErr.message);
      }
    }

    res.json({ message: 'Listing deleted successfully.' });
  } catch (err) { next(err); }
});

// ── Mark as sold ──────────────────────────────────────────────
// PUT /api/listings/:id/sold
router.put('/:id/sold', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { agreed_price, buyer_id } = req.body;

    const { data: existing } = await supabaseAdmin
      .from('listings')
      .select('seller_id, price')
      .eq('id', id)
      .single();

    if (!existing) return next(createError('Listing not found.', 404));
    if (existing.seller_id !== req.user.id) {
      return next(createError('Only the seller can mark this as sold.', 403));
    }

    // Update listing status
    const { data: listing, error } = await supabaseAdmin
      .from('listings')
      .update({ status: 'sold' })
      .eq('id', id)
      .select()
      .single();

    if (error) return next(createError(error.message));

    // Create transaction record
    if (buyer_id) {
      await supabaseAdmin.from('transactions').insert({
        listing_id:     id,
        buyer_id,
        seller_id:      req.user.id,
        original_price: existing.price,
        agreed_price:   agreed_price ? parseFloat(agreed_price) : null,
        status:        'completed',
        completed_at:   new Date().toISOString(),
      });
    }

    res.json({ listing, message: 'Listing marked as sold.' });
  } catch (err) { next(err); }
});

// ── Renew listing ─────────────────────────────────────────────
// PUT /api/listings/:id/renew
// Owner only, active listings only (pending ones get their 30 days on approval).
// Works before or after expiry; sets expires_at to 30 days from now.
router.put('/:id/renew', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: existing } = await supabaseAdmin
      .from('listings')
      .select('seller_id, status')
      .eq('id', id)
      .single();

    if (!existing) return next(createError('Listing not found.', 404));
    if (existing.seller_id !== req.user.id) {
      return next(createError('Only the seller can renew this listing.', 403));
    }
    if (existing.status !== 'active') {
      return next(createError('Only active listings can be renewed.', 400));
    }

    const { data: listing, error } = await supabaseAdmin
      .from('listings')
      .update({ expires_at: newExpiry() })
      .eq('id', id)
      .select()
      .single();

    if (error) return next(createError(error.message));
    res.json({ listing, message: 'Listing renewed for 30 days.' });
  } catch (err) { next(err); }
});

// ── My listings ───────────────────────────────────────────────
// ── Save / unsave listing ─────────────────────────────────────
// POST /api/listings/:id/save  (toggles)
router.post('/:id/save', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if already saved
    const { data: existing } = await supabaseAdmin
      .from('saved_listings')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('listing_id', id)
      .maybeSingle();

    if (existing) {
      // Unsave
      await supabaseAdmin.from('saved_listings').delete().eq('id', existing.id);
      return res.json({ saved: false, message: 'Listing removed from saved.' });
    } else {
      // Save
      await supabaseAdmin.from('saved_listings').insert({
        user_id:    req.user.id,
        listing_id: id,
      });
      return res.json({ saved: true, message: 'Listing saved to favourites.' });
    }
  } catch (err) { next(err); }
});

// ── Increment view count ──────────────────────────────────────
// POST /api/listings/:id/view  (no auth required — views counted for all visitors)
router.post('/:id/view', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data } = await supabaseAdmin
      .from('listings')
      .select('views_count')
      .eq('id', id)
      .single();
    if (data) {
      await supabaseAdmin
        .from('listings')
        .update({ views_count: (data.views_count || 0) + 1 })
        .eq('id', id);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Report a listing ────────────────────────────────────────────
// POST /api/listings/:id/report
// Body: { reason: 'fake'|'wrong_price'|'spam'|'offensive'|'other', note? }
// One report per (listing, reporter) — a second report from the same user
// updates their existing row (new reason/note) rather than duplicating.
const VALID_REPORT_REASONS = ['fake', 'wrong_price', 'spam', 'offensive', 'other'];
router.post('/:id/report', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason, note } = req.body;

    if (!VALID_REPORT_REASONS.includes(reason)) {
      return next(createError(`reason must be one of: ${VALID_REPORT_REASONS.join(', ')}`));
    }
    if (note && note.length > 500) {
      return next(createError('Note must be 500 characters or less.'));
    }

    const { data: listing } = await supabaseAdmin
      .from('listings')
      .select('id, seller_id')
      .eq('id', id)
      .single();

    if (!listing) return next(createError('Listing not found.', 404));
    if (listing.seller_id === req.user.id) {
      return next(createError('You cannot report your own listing.'));
    }

    const { data: report, error } = await supabaseAdmin
      .from('listing_reports')
      .upsert(
        { listing_id: id, reporter_id: req.user.id, reason, note: note?.trim() || null, status: 'open' },
        { onConflict: 'listing_id,reporter_id' }
      )
      .select()
      .single();

    if (error) return next(createError(error.message));

    res.status(201).json({ report });
  } catch (err) { next(err); }
});

module.exports = router;
