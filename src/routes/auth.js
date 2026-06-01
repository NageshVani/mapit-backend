// ============================================================
// Auth Routes
// Routes for authentication endpoints
// ============================================================
console.log('[auth.js] Auth router loaded');

const express = require('express');
const { supabase, supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');

const router = express.Router();

// ── Auth Status (health check for auth routes) ────────────────
router.get('/status', (req, res) => {
  res.json({ status: 'ok', message: 'Auth service is running' });
});

// ── Validate Invite Code ─────────────────────────────────────
// GET /api/auth/validate-invite?code=MAPIT-A-01
router.get('/validate-invite', async (req, res, next) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({
        error: 'Invite code is required',
        valid: false,
      });
    }

    // Query the invite_codes table
    const { data: invite, error } = await supabaseAdmin
      .from('invite_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found
      throw error;
    }

    if (!invite) {
      return res.status(404).json({
        error: 'Invalid or expired invite code',
        valid: false,
      });
    }

    // Check if invite has been used
    if (invite.used_at) {
      return res.status(400).json({
        error: 'Invite code has already been used',
        valid: false,
      });
    }

    // Check if invite has expired
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({
        error: 'Invite code has expired',
        valid: false,
      });
    }

    // Invite is valid
    res.json({
      valid: true,
      code: invite.code,
      created_by:  invite.created_by,
      created_for: invite.created_for || null,
      created_at:  invite.created_at,
      expires_at:  invite.expires_at,
    });
  } catch (err) {
    console.error('Validate invite error:', err.message);
    next(err);
  }
});

// ── Send OTP ─────────────────────────────────────────────────
// POST /api/auth/send-otp
// Body: { phone|email, invite_code }
router.post('/send-otp', async (req, res, next) => {
  console.log('[auth.js] POST /send-otp hit, body:', req.body);
  try {
    const { phone, email, invite_code } = req.body;

    if (!phone && !email) {
      return res.status(400).json({ error: 'phone or email is required' });
    }

    // Validate invite code (required for closed beta)
    if (!invite_code) {
      return res.status(400).json({ error: 'invite_code is required' });
    }

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from('invite_codes')
      .select('*')
      .eq('code', invite_code.toUpperCase())
      .single();

    if (inviteError && inviteError.code !== 'PGRST116') throw inviteError;

    if (!invite) {
      return res.status(400).json({ error: 'Invalid invite code', valid: false });
    }
    if (invite.used_at) {
      return res.status(400).json({ error: 'Invite code has already been used', valid: false });
    }
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invite code has expired', valid: false });
    }

    // emailRedirectTo: null strips the magic-link redirect URL so Supabase
    // delivers a 6-digit code instead (requires "Enable OTP" in Supabase
    // dashboard → Authentication → Providers → Email).
    // There is no client-side `type` param to switch email→OTP vs magic link;
    // that toggle lives solely in the Supabase project settings.
    const otpPayload = phone
      ? { phone, options: { shouldCreateUser: true } }
      : { email, options: { shouldCreateUser: true, emailRedirectTo: null } };

    const { error } = await supabase.auth.signInWithOtp(otpPayload);

    if (error) {
      console.error('[auth.js] send-otp Supabase error:', error.message);
      return res.status(400).json({ error: error.message });
    }

    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (err) {
    next(err);
  }
});

// ── Get current user (session restore / validation) ──────────
// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const [{ data: profile }, { data: invite }] = await Promise.all([
      supabaseAdmin.from('profiles').select('*').eq('id', req.user.id).maybeSingle(),
      supabaseAdmin.from('invite_codes').select('code, created_for').eq('used_by', req.user.id).maybeSingle(),
    ]);
    res.json({
      user:        req.user,
      profile:     profile || null,
      created_for: invite?.created_for || null,
      invite_code: invite?.code || null,
    });
  } catch (err) {
    next(err);
  }
});

// ── Verify OTP ────────────────────────────────────────────────
// POST /api/auth/verify-otp
// Body: { email, token }
router.post('/verify-otp', async (req, res, next) => {
  console.log('[auth.js] POST /verify-otp hit');
  try {
    const { email, token } = req.body;

    if (!email || !token) {
      return res.status(400).json({ error: 'email and token are required' });
    }

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });

    if (error) {
      console.error('[auth.js] verify-otp error:', error.message);
      return res.status(400).json({ error: error.message });
    }

    const { session, user } = data;

    // Check whether this user already has a profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    res.json({ session, user, profile: profile || null, isNewUser: !profile });
  } catch (err) {
    next(err);
  }
});

// ── Register — new user profile setup ────────────────────────
// POST /api/auth/register
// Body: { full_name, phone?, invite_code }
router.post('/register', requireAuth, async (req, res, next) => {
  try {
    const { full_name, phone, invite_code } = req.body;

    if (!full_name || full_name.trim().length < 2) {
      return next(createError('full_name must be at least 2 characters'));
    }

    const AVATAR_COLORS = ['#F06030', '#3B82F6', '#22C55E', '#F59E0B', '#8B5CF6', '#EC4899'];
    const avatar_color  = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .upsert(
        { id: req.user.id, full_name: full_name.trim(), phone: phone || null, avatar_color },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (error) return next(createError(error.message));

    // Mark invite code as used (only if not already consumed)
    if (invite_code) {
      await supabaseAdmin
        .from('invite_codes')
        .update({ used_at: new Date().toISOString(), used_by: req.user.id })
        .eq('code', invite_code.toUpperCase())
        .is('used_at', null);
    }

    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
