-- Session 9a item 3 — read-only RLS re-confirmation
-- Run in: Supabase SQL Editor (both uat and production project, per Rule 6)
-- Purpose: re-verify no RLS regressions since the Session 5 audit (2026-07-12),
--   across every table where a policy is expected. Read-only — no data touched.

-- Step 1: Confirm RLS is enabled (rowsecurity = true) on each table that
-- should have it. Expected: all rows show rowsecurity = t.
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('listings', 'profiles', 'conversations', 'chat_messages',
                     'listing_reports', 'grievances', 'invite_codes')
ORDER BY tablename;

-- Step 2: List every policy defined on those tables, so you can compare
-- against what was documented during the Session 5 audit and Session 6's
-- chat RLS build (Context.md — search "RLS policy full audit" and
-- "RLS policies for conversations/chat_messages").
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('listings', 'profiles', 'conversations', 'chat_messages',
                     'listing_reports', 'grievances', 'invite_codes')
ORDER BY tablename, policyname;

-- Expected findings (per Context.md history), flag anything that doesn't match:
--   listings           — scoped correctly (Session 5 audit, no changes needed)
--   profiles           — SELECT scoped to auth.uid() = id (fixed Session 5,
--                         was previously USING(true) — a real PII leak if regressed)
--   invite_codes       — SELECT policy dropped entirely (archived table,
--                         should have ZERO policies / default-deny for anon+authenticated)
--   conversations       — SELECT (buyer or seller only) + INSERT (buyer_id
--                         cross-checked against listing's real seller_id)
--   chat_messages       — SELECT + INSERT (participant only, via subquery) +
--                         UPDATE (read_at only, restricted to non-senders)
--   listing_reports     — INSERT/SELECT policies exist but the app never uses
--                         the anon-key path (known unresolved RLS puzzle,
--                         non-blocking — see Context.md Open Issues)
--   grievances          — no public policies expected; admin-only via
--                         requireAdmin + supabaseAdmin service-role, RLS is
--                         defense-in-depth only here
