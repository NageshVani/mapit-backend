// ============================================================
// Auth Routes
// Routes for authentication endpoints
// ============================================================
console.log('[auth.js] Auth router loaded');

const crypto    = require('crypto');
const express   = require('express');
const rateLimit  = require('express-rate-limit');
const { supabase, supabaseAdmin } = require('../config/supabase');
const { requireAuth, isAdminEmail } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');
const { logAuditEvent } = require('../utils/auditLog');
const { sendWhatsAppOtp, normalizeIndianMobile, maskPhone } = require('../utils/whatsappOtp');

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

    // Fire-and-forget: IT Rules 2021 compliance record (migration 014).
    logAuditEvent('login', req, user.id);

    res.json({ session, user, profile: profile || null, isNewUser: !profile });
  } catch (err) {
    next(err);
  }
});

// ── Email + Password: Create Account ─────────────────────────
// POST /api/auth/signup
// Body: { email, password }
// IMPORTANT: this Supabase project auto-confirms every account at creation
// time regardless of the email_confirm flag passed to the admin API (found
// during Session 9a UAT — admin.createUser({email_confirm:false}) and even
// signInWithOtp({shouldCreateUser:true}) both left email_confirmed_at set
// immediately). That means confirmation status can't be used as the
// verification gate here. Instead: NO PASSWORD IS EVER SET ON THE ACCOUNT
// until after the OTP is verified. The chosen password is held client-side
// and applied via PUT /api/auth/password (existing route) once verify-otp
// returns a session. Until then, POST /api/auth/signin cannot succeed for
// this email — there's no password on the account to check against.
router.post('/signup', otpLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !isStrongPassword(password)) {
      return res.status(400).json({ error: PASSWORD_RULE_MSG });
    }
    const cleanEmail = email.trim().toLowerCase();

    // Works uniformly for brand-new AND existing emails — Supabase just
    // sends a code either way, never errors on "already exists". An existing
    // account's real password is never touched by this call.
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { shouldCreateUser: true },
    });
    if (otpError) return res.status(400).json({ error: otpError.message });

    res.json({ needsEmailVerification: true, email: cleanEmail });
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
      is_admin:    isAdminEmail(req.user.email),
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

    // Fire-and-forget: IT Rules 2021 compliance record (migration 014).
    logAuditEvent('login', req, user.id);

    res.json({ session, user, profile: profile || null, isNewUser: !profile });
  } catch (err) {
    next(err);
  }
});

// ── WhatsApp phone OTP (Session 9C) ──────────────────────────
// MapIt generates the code and stores only its sha256 hash in phone_otps
// (migration 016); MSG91 just delivers it. Proves the logged-in user owns
// the number — it is NOT a login method. India +91 only for MVP.
// phone_otps rows double as the per-user rate counter: the send route
// inserts its row FIRST, then counts, so two near-simultaneous taps can't
// both slip past the cooldown — the later one sees the earlier and backs out.
const PHONE_OTP_TTL_MS       = 10 * 60 * 1000;
const PHONE_OTP_COOLDOWN_MS  = 60 * 1000;
const PHONE_OTP_DAILY_CAP    = 5;
const PHONE_OTP_MAX_ATTEMPTS = 5;

// Per-IP backstop on top of the per-user limits above. Separate from
// otpLimiter so wrong guesses on verify don't eat into the email-OTP budget.
const phoneSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many code requests from this network. Please wait 1 hour.' },
});
const phoneVerifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { error: 'Too many attempts from this network. Please wait 1 hour.' },
});

// Bound to user + phone, so a hash from one row can't be replayed for another.
function hashPhoneOtp(userId, phone, code) {
  return crypto.createHash('sha256').update(`${userId}:${phone}:${code}`).digest('hex');
}

// POST /api/auth/otp/phone/send   body: { phone }
router.post('/otp/phone/send', phoneSendLimiter, requireAuth, async (req, res, next) => {
  try {
    if (!req.user.email_confirmed_at) {
      return res.status(403).json({ error: 'Please verify your email first.' });
    }
    const phone = normalizeIndianMobile(req.body?.phone);
    if (!phone) {
      return res.status(400).json({ error: 'Enter a valid Indian mobile number (10 digits, starting 6–9).' });
    }

    const { data: profile, error: profErr } = await supabaseAdmin
      .from('profiles').select('phone, phone_verified').eq('id', req.user.id).maybeSingle();
    if (profErr) return next(createError(profErr.message));
    if (!profile) return res.status(400).json({ error: 'Please complete your profile first.' });
    if (profile.phone_verified && profile.phone === phone) {
      return res.json({ success: true, already_verified: true, phone_masked: maskPhone(phone) });
    }

    const { data: taken, error: takenErr } = await supabaseAdmin
      .from('profiles').select('id')
      .eq('phone', phone).eq('phone_verified', true).neq('id', req.user.id)
      .limit(1);
    if (takenErr) return next(createError(takenErr.message));
    if (taken.length) {
      return res.status(409).json({ error: 'This number is already verified on another MapIt account.' });
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const { data: row, error: insErr } = await supabaseAdmin
      .from('phone_otps')
      .insert({
        user_id:    req.user.id,
        phone,
        code_hash:  hashPhoneOtp(req.user.id, phone, code),
        expires_at: new Date(Date.now() + PHONE_OTP_TTL_MS).toISOString(),
      })
      .select('id, created_at')
      .single();
    if (insErr) return next(createError(insErr.message));

    // Rate check AFTER our own insert (see header comment).
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent, error: recErr } = await supabaseAdmin
      .from('phone_otps').select('id, created_at')
      .eq('user_id', req.user.id).gte('created_at', dayAgo)
      .order('created_at', { ascending: false });
    if (recErr) return next(createError(recErr.message));

    const others    = recent.filter(r => r.id !== row.id);
    const lastOther = others[0] && new Date(others[0].created_at).getTime();
    const tooSoon   = lastOther && new Date(row.created_at).getTime() - lastOther < PHONE_OTP_COOLDOWN_MS;
    if (tooSoon || recent.length > PHONE_OTP_DAILY_CAP) {
      await supabaseAdmin.from('phone_otps').delete().eq('id', row.id);
      if (tooSoon) {
        const retry_after = Math.ceil((lastOther + PHONE_OTP_COOLDOWN_MS - Date.now()) / 1000);
        return res.status(429).json({ error: `Please wait ${Math.max(retry_after, 1)}s before requesting another code.`, retry_after });
      }
      return res.status(429).json({ error: 'Daily limit reached for WhatsApp codes. Try again tomorrow, or verify later.' });
    }

    const sent = await sendWhatsAppOtp(phone, code);
    if (!sent.ok) {
      // Keep the row (it still counts toward the cooldown/cap) but make it unusable.
      await supabaseAdmin.from('phone_otps')
        .update({ expires_at: new Date().toISOString() }).eq('id', row.id);
      return res.status(503).json({ error: 'Could not send the WhatsApp code right now. Please try again shortly, or verify later.' });
    }

    res.json({ success: true, phone_masked: maskPhone(phone), expires_in: PHONE_OTP_TTL_MS / 1000 });
  } catch (err) { next(err); }
});

// POST /api/auth/otp/phone/verify   body: { code }
// The phone is taken from the latest phone_otps row, never from the body —
// so a user can't receive a code on one number and claim another.
router.post('/otp/phone/verify', phoneVerifyLimiter, requireAuth, async (req, res, next) => {
  try {
    const code = String(req.body?.code ?? '').trim();
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Please enter the 6-digit code sent via WhatsApp.' });
    }

    const { data: otp, error: otpErr } = await supabaseAdmin
      .from('phone_otps').select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();
    if (otpErr) return next(createError(otpErr.message));
    if (!otp || otp.consumed_at || new Date(otp.expires_at) <= new Date()) {
      return res.status(400).json({ error: 'This code has expired. Please request a new one.' });
    }
    if (otp.attempts >= PHONE_OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many wrong attempts. Please request a new code.' });
    }

    // Count the attempt BEFORE comparing. The `.eq('attempts', …)` guard makes
    // parallel guesses race for the same slot — only one wins, the rest retry.
    const { data: bumped, error: bumpErr } = await supabaseAdmin
      .from('phone_otps')
      .update({ attempts: otp.attempts + 1 })
      .eq('id', otp.id).eq('attempts', otp.attempts)
      .select('id');
    if (bumpErr) return next(createError(bumpErr.message));
    if (!bumped.length) {
      return res.status(409).json({ error: 'Please try again.' });
    }

    const expected = Buffer.from(otp.code_hash, 'hex');
    const actual   = Buffer.from(hashPhoneOtp(req.user.id, otp.phone, code), 'hex');
    if (!crypto.timingSafeEqual(expected, actual)) {
      const left = PHONE_OTP_MAX_ATTEMPTS - (otp.attempts + 1);
      return res.status(400).json({
        error: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Incorrect code. Please request a new one.',
      });
    }

    const { data: profile, error: upErr } = await supabaseAdmin
      .from('profiles')
      .update({ phone: otp.phone, phone_verified: true })
      .eq('id', req.user.id)
      .select()
      .single();
    if (upErr) {
      // 23505 = uniq_profiles_verified_phone: another account verified this
      // number between our send-time check and now.
      if (upErr.code === '23505') {
        return res.status(409).json({ error: 'This number is already verified on another MapIt account.' });
      }
      return next(createError(upErr.message));
    }

    await supabaseAdmin.from('phone_otps')
      .update({ consumed_at: new Date().toISOString() }).eq('id', otp.id);

    // Fire-and-forget: IT Rules 2021 compliance record (migration 014).
    logAuditEvent('phone_verified', req, req.user.id);

    res.json({ success: true, profile });
  } catch (err) { next(err); }
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

    // Fire-and-forget: IT Rules 2021 compliance record (migration 014).
    logAuditEvent('signup', req, req.user.id);

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
