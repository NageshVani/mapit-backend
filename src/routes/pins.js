// ============================================================
// User Pins Routes — Multiple named locations per user
// GET    /api/pins           — get all pins for current user
// POST   /api/pins           — add a new pin
// PUT    /api/pins/:id       — update a pin (label, location)
// DELETE /api/pins/:id       — delete a pin
// PUT    /api/pins/:id/default — set as default/active pin
// ============================================================
const express         = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');

const router = express.Router();

// ── Get all pins ──────────────────────────────────────────────
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { data: pins, error } = await supabaseAdmin
      .from('user_pins')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true });

    if (error) return next(createError(error.message));

    res.json({ pins: pins || [] });
  } catch (err) { next(err); }
});

// ── Add a new pin ─────────────────────────────────────────────
// Body: { label, lat, lng, is_default }
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { label, lat, lng, is_default = false } = req.body;

    if (!label || lat === undefined || lng === undefined) {
      return next(createError('label, lat and lng are required.'));
    }

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      return next(createError('lat and lng must be valid numbers.'));
    }
    if (parsedLat < -90 || parsedLat > 90) return next(createError('Invalid latitude.'));
    if (parsedLng < -180 || parsedLng > 180) return next(createError('Invalid longitude.'));

    // If this is being set as default, unset any existing default first
    if (is_default) {
      await supabaseAdmin
        .from('user_pins')
        .update({ is_default: false })
        .eq('user_id', req.user.id);
    }

    const { data: pin, error } = await supabaseAdmin
      .from('user_pins')
      .insert({
        user_id:    req.user.id,
        label:      label.trim(),
        lat:        parsedLat,
        lng:        parsedLng,
        is_default: !!is_default,
      })
      .select()
      .single();

    if (error) return next(createError(error.message));

    // If this is the user's first pin, make it default automatically
    const { count } = await supabaseAdmin
      .from('user_pins')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id);

    if (count === 1) {
      await supabaseAdmin
        .from('user_pins')
        .update({ is_default: true })
        .eq('id', pin.id);
      pin.is_default = true;
    }

    res.status(201).json({ pin });
  } catch (err) { next(err); }
});

// ── Update a pin ──────────────────────────────────────────────
// PUT /api/pins/:id
// Body: { label, lat, lng }
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { label, lat, lng } = req.body;

    // Ensure pin belongs to current user
    const { data: existing } = await supabaseAdmin
      .from('user_pins')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!existing) return next(createError('Pin not found.', 404));
    if (existing.user_id !== req.user.id) {
      return next(createError('You can only edit your own pins.', 403));
    }

    const updates = {};
    if (label !== undefined) updates.label = label.trim();
    if (lat   !== undefined) updates.lat   = parseFloat(lat);
    if (lng   !== undefined) updates.lng   = parseFloat(lng);

    if (Object.keys(updates).length === 0) return next(createError('No fields to update.'));

    const { data: pin, error } = await supabaseAdmin
      .from('user_pins')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return next(createError(error.message));

    res.json({ pin });
  } catch (err) { next(err); }
});

// ── Delete a pin ──────────────────────────────────────────────
// DELETE /api/pins/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: existing } = await supabaseAdmin
      .from('user_pins')
      .select('user_id, is_default')
      .eq('id', id)
      .single();

    if (!existing) return next(createError('Pin not found.', 404));
    if (existing.user_id !== req.user.id) {
      return next(createError('You can only delete your own pins.', 403));
    }

    await supabaseAdmin.from('user_pins').delete().eq('id', id);

    // If we deleted the default pin, promote the oldest remaining pin to default
    if (existing.is_default) {
      const { data: remaining } = await supabaseAdmin
        .from('user_pins')
        .select('id')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: true })
        .limit(1);

      if (remaining && remaining.length > 0) {
        await supabaseAdmin
          .from('user_pins')
          .update({ is_default: true })
          .eq('id', remaining[0].id);
      }
    }

    res.json({ message: 'Pin deleted successfully.' });
  } catch (err) { next(err); }
});

// ── Set default pin ───────────────────────────────────────────
// PUT /api/pins/:id/default
router.put('/:id/default', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: existing } = await supabaseAdmin
      .from('user_pins')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!existing) return next(createError('Pin not found.', 404));
    if (existing.user_id !== req.user.id) {
      return next(createError('You can only manage your own pins.', 403));
    }

    // Unset all current defaults
    await supabaseAdmin
      .from('user_pins')
      .update({ is_default: false })
      .eq('user_id', req.user.id);

    // Set new default
    const { data: pin, error } = await supabaseAdmin
      .from('user_pins')
      .update({ is_default: true })
      .eq('id', id)
      .select()
      .single();

    if (error) return next(createError(error.message));

    res.json({ pin, message: `"${pin.label}" is now your active location.` });
  } catch (err) { next(err); }
});

module.exports = router;
