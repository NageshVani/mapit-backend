// ============================================================
// Auth Middleware
// Verifies the Supabase JWT sent in the Authorization header.
// Attaches req.user and req.supabaseClient to the request.
// ============================================================
const { createClient } = require('@supabase/supabase-js');

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

    // Attach to request for use in route handlers
    req.user          = user;
    req.supabaseClient = userClient;

    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    res.status(500).json({ error: 'Authentication check failed.' });
  }
}

module.exports = { requireAuth };
