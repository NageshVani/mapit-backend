// ============================================================
// Users Routes — Public profiles & feedback
// GET  /api/users/:id          — get public profile
// PUT  /api/users/me           — update own profile
// POST /api/users/feedback     — submit feedback
// GET  /api/users/:id/listings — get user's public listings
// ============================================================
const express         = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');

const router = express.Router();

// ── Mark feedback as resolved (admin) ────────────────────────
// PUT /api/users/feedback/:id/resolve
router.put('/feedback/:id/resolve', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('feedback')
      .update({ status: 'resolved' })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return next(createError(error.message));
    res.json({ feedback: data });
  } catch (err) { next(err); }
});

// ── Get all feedbacks (admin view) ───────────────────────────
// GET /api/users/feedback/all
router.get('/feedback/all', requireAuth, async (req, res, next) => {
  try {
    const { data: feedbacks, error } = await supabaseAdmin
      .from('feedback')
      .select('*')
      .order('id', { ascending: false });

    if (error) return next(createError(error.message));

    // Fetch profiles and invite-code names for all unique submitters
    const userIds = [...new Set((feedbacks || []).map(f => f.user_id).filter(Boolean))];
    let profilesMap = {};
    let inviteNameMap = {};
    if (userIds.length > 0) {
      const [{ data: profiles }, { data: inviteCodes }] = await Promise.all([
        supabaseAdmin.from('profiles').select('id, full_name, avatar_color').in('id', userIds),
        supabaseAdmin.from('invite_codes').select('used_by, created_for').in('used_by', userIds),
      ]);
      (profiles || []).forEach(p => { profilesMap[p.id] = p; });
      (inviteCodes || []).forEach(ic => { if (ic.used_by) inviteNameMap[ic.used_by] = ic.created_for; });
    }

    const enriched = (feedbacks || []).map(f => ({
      ...f,
      profile: profilesMap[f.user_id] || null,
      created_for: inviteNameMap[f.user_id] || null,
    }));

    res.json({ feedbacks: enriched });
  } catch (err) { next(err); }
});

// ── Get public profile ────────────────────────────────────────
// GET /api/users/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, trust_badge, avg_rating, review_count, avatar_color, created_at')
      .eq('id', id)
      .single();

    if (error || !profile) return next(createError('User not found.', 404));

    res.json({ profile });
  } catch (err) { next(err); }
});

// ── Update own profile ────────────────────────────────────────
// PUT /api/users/me
// Body: { full_name, phone, avatar_color }
router.put('/me/profile', requireAuth, async (req, res, next) => {
  try {
    const { full_name, phone, avatar_color } = req.body;

    const updates = {};
    if (full_name)    updates.full_name    = full_name.trim();
    if (phone)        updates.phone        = phone.trim();
    if (avatar_color) updates.avatar_color = avatar_color;

    if (Object.keys(updates).length === 0) return next(createError('No fields to update.'));

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) return next(createError(error.message));

    res.json({ profile });
  } catch (err) { next(err); }
});

// ── Get user's public active listings ─────────────────────────
// GET /api/users/:id/listings
router.get('/:id/listings', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: listings, error } = await supabaseAdmin
      .from('listings')
      .select('id, title, price, price_label, category, subcategory, lat, lng, address, status, created_at')
      .eq('seller_id', id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) return next(createError(error.message));

    res.json({ listings: listings || [] });
  } catch (err) { next(err); }
});

// ── Submit feedback ───────────────────────────────────────────
// POST /api/users/feedback
// Body: { type, description, screenshot_url, rating? }
router.post('/feedback/submit', requireAuth, async (req, res, next) => {
  try {
    const { type, description, screenshot_url, rating } = req.body;

    const validTypes = ['suggestion', 'bug', 'complaint', 'praise'];
    if (!type || !validTypes.includes(type)) {
      return next(createError(`type must be one of: ${validTypes.join(', ')}`));
    }
    if (!description || description.trim().length < 10) {
      return next(createError('Description must be at least 10 characters.'));
    }
    // Optional — not every feedback type needs a star rating (e.g. a bug report)
    if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      return next(createError('rating must be an integer between 1 and 5.'));
    }

    const { data, error } = await supabaseAdmin
      .from('feedback')
      .insert({
        user_id:        req.user.id,
        type,
        description:    description.trim(),
        screenshot_url: screenshot_url || null,
        rating:         rating != null ? rating : null,
      })
      .select()
      .single();

    if (error) return next(createError(error.message));

    res.status(201).json({
      feedback: data,
      message:  'Thank you! Your feedback has been received.',
    });
  } catch (err) { next(err); }
});

module.exports = router;
