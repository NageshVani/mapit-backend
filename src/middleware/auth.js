// ============================================================
// Auth Middleware
// Verifies the Supabase JWT sent in the Authorization header.
// Attaches req.user and req.supabaseClient to the request.
// ============================================================
const { createClient } = require('@supabase/supabase-js');
const { supabaseAdmin } = require('../config/supabase');

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing or invalid authorization header. Format: Bearer <token>',
      });
    }

    const token = authHeader.split(' ')[1];

    // Create a Supabase client scoped to this user's token
    const userClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          headers: { Authorization: `Bearer ${token}` },
        },
      }
    );

    // Verify the token by fetching the user
    const { data: { user }, error } = await userClient.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }

    // Suspension check — real-time, not just at login: an already-signed-in
    // suspended user is rejected on their very next request, not just kept
    // out of future sign-ins. Fail-open on a missing profile row — a brand
    // new user's row doesn't exist yet at the moment POST /api/auth/register
    // (itself requireAuth-gated) runs.
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('suspended')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.suspended) {
      return res.status(403).json({
        error: 'Your account has been suspended. Contact MapIt support if you believe this is a mistake.',
        suspended: true,
      });
    }

    // Attach to request for use in route handlers
    req.user          = user;
    req.supabaseClient = userClient;

    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    res.status(500).json({ error: 'Authentication check failed.' });
  }
}

// Admin gate — CLAUDE.md Rule 9: hardcoded admin emails, no invite codes in MVP.
// Same hardcoded-array convention as the CORS allowedOrigins list in server.js.
const ADMIN_EMAILS = ['nagesh.aadi@gmail.com', 'arun.bn1@gmail.com'];

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes((email || '').toLowerCase());
}

function requireAdmin(req, res, next) {
  if (!isAdminEmail(req.user?.email)) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, isAdminEmail };
