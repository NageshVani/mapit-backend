-- Migration 017: Lock direct client writes to profiles
-- Session 9C UAT finding T-027 (2026-10-08).
-- Run in: Supabase SQL Editor (single project — covers both uat and production)
-- Description: The anon key is public (served by /api/config), so any
--   signed-in user can call Supabase directly with their own token. The
--   existing RLS policy lets a user update their OWN profiles row, but RLS
--   limits rows, not columns — so a user could set on their own row:
--     phone_verified = true   → skips WhatsApp OTP and the post gate (9C)
--     suspended      = false  → undoes an admin suspension (migration 007)
--     avg_rating / review_count / trust_badge
--   Nothing legitimate needs this: the frontend never writes profiles
--   directly, and the backend writes only through the service-role client
--   (supabaseAdmin), which is unaffected by these grants.
--
-- Approach: revoke table write privileges from the client roles instead of
--   a column-guard trigger — a trigger needs every future sensitive column
--   added to it; a revoke covers them all. SELECT is left unchanged.
--
-- Rollback (one line, if something unexpected breaks):
--   GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles FROM anon, authenticated;

-- Verify: anon and authenticated should show no INSERT/UPDATE/DELETE/TRUNCATE rows.
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND table_name = 'profiles'
--     AND grantee IN ('anon', 'authenticated') ORDER BY grantee, privilege_type;
