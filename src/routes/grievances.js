// ============================================================
// Grievance Log Routes — admin-only
// GET  /api/grievances              — list all (newest received first)
// POST /api/grievances               — log a new grievance
// PUT  /api/grievances/:id/acknowledge — mark acknowledged (24h IT Rules deadline)
// PUT  /api/grievances/:id/resolve     — mark resolved (15-day IT Rules deadline)
// ============================================================
// Grievances arrive via Arun's personal email (Grievance Officer contact,
// see docs/legal/terms-privacy-draft2.html) — there's no automatic capture path,
// so every row here is entered manually by an admin. All routes are
// requireAuth + requireAdmin; the deliberate no-RLS-policy table
// (008-grievance-log.sql) means only this file's service-role client can
// ever touch grievances.
const express          = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { createError }  = require('../middleware/errorHandler');

const router = express.Router();

// ── List all grievances ───────────────────────────────────────
// GET /api/grievances
router.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { data: grievances, error } = await supabaseAdmin
      .from('grievances')
      .select('*')
      .order('received_at', { ascending: false });
    if (error) return next(createError(error.message));
    res.json({ grievances: grievances || [] });
  } catch (err) { next(err); }
});

// ── Log a new grievance ─────────────────────────────────────────
// POST /api/grievances
// Body: { complainant_name, complainant_contact?, note, received_at? }
// received_at defaults to now — optional so Arun can backdate a grievance
// he's only now getting around to logging (the 24h/15-day clocks should
// count from when it actually arrived, not when it was typed in here).
router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { complainant_name, complainant_contact, note, received_at } = req.body;
    if (!complainant_name?.trim()) return next(createError('Complainant name is required.'));
    if (!note?.trim()) return next(createError('A short note describing the grievance is required.'));

    const insert = {
      complainant_name:    complainant_name.trim(),
      complainant_contact: complainant_contact?.trim() || null,
      note:                note.trim(),
      logged_by:           req.user.id,
    };
    if (received_at) {
      const d = new Date(received_at);
      if (isNaN(d.getTime())) return next(createError('received_at is not a valid date.'));
      insert.received_at = d.toISOString();
    }

    const { data: grievance, error } = await supabaseAdmin
      .from('grievances')
      .insert(insert)
      .select()
      .single();
    if (error) return next(createError(error.message));
    res.status(201).json({ grievance });
  } catch (err) { next(err); }
});

// ── Mark acknowledged ─────────────────────────────────────────
// PUT /api/grievances/:id/acknowledge
router.put('/:id/acknowledge', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { data: grievance, error } = await supabaseAdmin
      .from('grievances')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return next(createError(error.message));
    if (!grievance) return next(createError('Grievance not found.', 404));
    res.json({ grievance });
  } catch (err) { next(err); }
});

// ── Mark resolved ────────────────────────────────────────────
// PUT /api/grievances/:id/resolve
router.put('/:id/resolve', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { data: grievance, error } = await supabaseAdmin
      .from('grievances')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return next(createError(error.message));
    if (!grievance) return next(createError('Grievance not found.', 404));
    res.json({ grievance });
  } catch (err) { next(err); }
});

module.exports = router;
