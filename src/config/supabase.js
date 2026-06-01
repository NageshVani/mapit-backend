// ============================================================
// Supabase Client Configuration
// Two clients:
//   supabase     — uses anon key (respects Row Level Security)
//   supabaseAdmin — uses service_role key (bypasses RLS, backend only)
// ============================================================
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL              = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY         = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌  Missing Supabase environment variables. Check your .env file.');
  process.exit(1);
}

// Public client — used when acting on behalf of a logged-in user
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

// Admin client — used for invite code validation, photo uploads, admin tasks
// NEVER expose this key to the frontend
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

module.exports = { supabase, supabaseAdmin };
