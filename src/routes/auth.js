// ============================================================
// Auth Routes
// Routes for authentication endpoints
// ============================================================
console.log('[auth.js] Auth router loaded');

const express   = require('express');
const rateLimit  = require('express-rate-limit');
const { supabase, supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');

const router = express.Router();

// Min 8 chars, at least 1 uppercase letter, at least 1 special character
const PASSWORD_RULE_MSG = 'Password must be at least 8 characters and include an uppercase letter and a special character';
function isStrongPassword(password) {
  return typeof password === 'string'
    && password.length >= 8
    && /[A-Z]/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

// Strict limiter for OTP-only routes — prevents SMS/email OTP abuse.
// All other auth routes (signin, signup, register, me) use only the global limiter.
const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parseInt(process.env.OTP_RATE_LIMIT) || 10,
  message: { error: 'Too many OTP requests. Please wait 1 hour.' },
});

// ── Auth Status ───────────────────────────────────────────────
router.get('/status', (req, res) => {
  res.json({ status: 'ok', message: 'Auth service is running' });
});

// ── Validate Invite Code (legacy — kept for family session restore) ──
// GET /api/auth/validate-invite?code=MAPIT-A-01
router.get('/validate-invite', async (req, res, next) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'Invite code is required', valid: false });

    const { data: invite, error } = await supabaseAdmin
      .from('invite_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    if (!invite) return res.status(404).json({ error: 'Invalid or expired invite code', valid: false });
    if (invite.used_at) return res.status(400).json({ error: 'Invite code has already been used', valid: false });
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invite code has expired', valid: false });
    }

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

// ── Email + Password: Sign In ─────────────────────────────────
// POST /api/auth/signin
// Body: { email, password }
router.post('/signin', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) return res.status(400).json({ error: error.message });

    const { session, user } = data;
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('*').eq('id', user.id).maybeSingle();

    res.json({ session, user, profile: profile || null, isNewUser: !profile });
  } catch (err) {
    next(err);
  }
});

// ── Email + Password: Create Account ─────────────────────────
// POST /api/auth/signup
// Body: { email, password }
router.post('/signup', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !isStrongPassword(password)) {
      return res.status(400).json({ error: PASSWORD_RULE_MSG });
    }
    // Pre-create with confirmed email so no verification email fires (MVP: immediate access)
    // If user already exists this errors silently and we fall through to signInWithPassword
    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
    });
    if (createErr && !createErr.message.toLowerCase().includes('already')) {
      return res.status(400).json({ error: createErr.message });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) return res.status(400).json({ error: error.message });

    const { session, user } = data;
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('*').eq('id', user.id).maybeSingle();

    res.json({ session, user, profile: profile || null, isNewUser: !profile });
  } catch (err) {
    next(err);
  }
});

// ── Google OAuth: get redirect URL ───────────────────────────
// GET /api/auth/google?redirectTo=<encoded-origin>
const ALLOWED_OAUTH_ORIGINS = [
  'https://www.mapit.co.in',
  'https://mapit.co.in',
  'https://uat.mapit.co.in',
  'http://localhost:3001',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];
const isVercelPreview = (u) => /^https:\/\/mapit-backend-[a-z0-9-]+\.vercel\.app$/.test(u);

router.get('/google', async (req, res, next) => {
  try {
    const raw = req.query.redirectTo ? decodeURIComponent(req.query.redirectTo) : 'https://www.mapit.co.in';
    const redirectTo = (ALLOWED_OAUTH_ORIGINS.includes(raw) || isVercelPreview(raw))
      ? raw
      : 'https://www.mapit.co.in';

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    res.json({ url: data.url });
  } catch (err) {
    next(err);
  }
});

// ── Password Reset ────────────────────────────────────────────
// POST /api/auth/reset-password
// Body: { email, redirectTo? }
router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, redirectTo: rawRedirect } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    // Frontend appends a trailing '/' (required to satisfy Supabase's redirect URL
    // glob) — strip it only for allowlist comparison, not from the value we pass on.
    const originForCheck = typeof rawRedirect === 'string' ? rawRedirect.replace(/\/$/, '') : rawRedirect;

    // Use caller's origin if it's a trusted domain, else default to production
    const redirectTo = (ALLOWED_OAUTH_ORIGINS.includes(originForCheck) || isVercelPreview(originForCheck))
      ? rawRedirect
      : 'https://www.mapit.co.in';

    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo }
    );
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── Set New Password (after reset link) ───────────────────────
// PUT /api/auth/password
// Body: { password }
router.put('/password', requireAuth, async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!isStrongPassword(password)) {
      return res.status(400).json({ error: PASSWORD_RULE_MSG });
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, { password });
    if (error) return next(createError(error.message));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── Send OTP ──────────────────────────────────────────────────
// POST /api/auth/send-otp
// Body: { email } — invite code no longer required
router.post('/send-otp', otpLimiter, async (req, res, next) => {
  console.log('[auth.js] POST /send-otp hit');
  try {
    const { phone, email } = req.body;
    if (!phone && !email) {
      return res.status(400).json({ error: 'phone or email is required' });
    }

    // For email: pre-create the user so only the OTP email is sent (not a confirm-signup email too)
    if (email) {
      const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (createErr && !createErr.message.toLowerCase().includes('already')) {
        console.warn('[auth.js] admin.createUser warning:', createErr.message);
      }
    }

    const otpPayload = phone
      ? { phone, options: { shouldCreateUser: true } }
      : { email, options: { shouldCreateUser: false, emailRedirectTo: null } };

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

// ── Get current user ──────────────────────────────────────────
// GET /api/auth/me?invite_code=MAPIT-X-01 (optional legacy fallback)
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const [{ data: profile }, { data: invite }] = await Promise.all([
      supabaseAdmin.from('profiles').select('*').eq('id', req.user.id).maybeSingle(),
      supabaseAdmin.from('invite_codes').select('code, created_for').eq('used_by', req.user.id).maybeSingle(),
    ]);

    let resolvedInvite = invite;
    if (!resolvedInvite && req.query.invite_code) {
      const { data: byCode } = await supabaseAdmin
        .from('invite_codes')
        .select('code, created_for')
        .eq('code', req.query.invite_code.toUpperCase())
        .maybeSingle();
      resolvedInvite = byCode || null;
    }

    res.json({
      user:        req.user,
      profile:     profile || null,
      created_for: resolvedInvite?.created_for || null,
      invite_code: resolvedInvite?.code || null,
    });
  } catch (err) {
    next(err);
  }
});

// ── Verify OTP ────────────────────────────────────────────────
// POST /api/auth/verify-otp
// Body: { email, token }
router.post('/verify-otp', otpLimiter, async (req, res, next) => {
  console.log('[auth.js] POST /verify-otp hit');
  try {
    const { email, token } = req.body;
    if (!email || !token) {
      return res.status(400).json({ error: 'email and token are required' });
    }
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) {
      console.error('[auth.js] verify-otp error:', error.message);
      return res.status(400).json({ error: error.message });
    }
    const { session, user } = data;
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('*').eq('id', user.id).maybeSingle();

    res.json({ session, user, profile: profile || null, isNewUser: !profile });
  } catch (err) {
    next(err);
  }
});

// ── Register — new user profile setup ────────────────────────
// POST /api/auth/register
// Body: { full_name, nickname, phone?, invite_code?, auth_provider? }
// Sets agreed_tos_at at registration time (user has accepted ToS in the UI)
router.post('/register', requireAuth, async (req, res, next) => {
  try {
    const { full_name, nickname, phone, invite_code, auth_provider } = req.body;
    if (!full_name || full_name.trim().length < 2) {
      return next(createError('full_name must be at least 2 characters'));
    }
    if (!nickname || nickname.trim().length < 1) {
      return next(createError('nickname is required'));
    }

    const AVATAR_COLORS = ['#F06030', '#3B82F6', '#22C55E', '#F59E0B', '#8B5CF6', '#EC4899'];
    const avatar_color  = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id:            req.user.id,
          full_name:     full_name.trim(),
          nickname:      nickname.trim(),
          phone:         phone || null,
          avatar_color,
          auth_provider: auth_provider || 'email',
          agreed_tos_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (error) return next(createError(error.message));

    // Mark legacy invite code as used if provided
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

// ── Set Home Location ─────────────────────────────────────────
// PUT /api/auth/home-location
// Body: { home_lat, home_lng, home_address? }
router.put('/home-location', requireAuth, async (req, res, next) => {
  try {
    const { home_lat, home_lng, home_address } = req.body;
    if (typeof home_lat !== 'number' || typeof home_lng !== 'number') {
      return res.status(400).json({ error: 'home_lat and home_lng must be numbers' });
    }
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .update({ home_lat, home_lng, home_address: home_address || null })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) return next(createError(error.message));
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

// ── Update Nickname ───────────────────────────────────────────
// PUT /api/auth/nickname
// Body: { nickname }
router.put('/nickname', requireAuth, async (req, res, next) => {
  try {
    const { nickname } = req.body;
    if (!nickname || nickname.trim().length < 1) {
      return res.status(400).json({ error: 'nickname is required' });
    }
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .update({ nickname: nickname.trim() })
      .eq('id', req.user.id)
      .select()
      .single();
    if (error) return next(createError(error.message));
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

// ── Update Default View (map vs list) ─────────────────────────
// PUT /api/auth/default-view
// Body: { default_view: 'map' | 'list' }
router.put('/default-view', requireAuth, async (req, res, next) => {
  try {
    const { default_view } = req.body;
    if (!['map', 'list'].includes(default_view)) {
      return res.status(400).json({ error: "default_view must be 'map' or 'list'" });
    }
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .update({ default_view })
      .eq('id', req.user.id)
      .select()
      .single();
    if (error) return next(createError(error.message));
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

// ── Logout ────────────────────────────────────────────────────
// POST /api/auth/logout — no auth required; token may already be expired
router.post('/logout', async (req, res) => {
  try { await supabase.auth.signOut(); } catch (_) {}
  res.json({ success: true });
});

module.exports = router;
