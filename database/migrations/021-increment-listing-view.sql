-- Migration 021: Atomic view counter for listings
-- Release: 10B — view counts (DRAFT 2026-11-20, NOT RUN)
-- Run in: Supabase SQL Editor — UAT FIRST (mapit-uat / xesekrkxbtybbxpsvxuz),
--   test there, then production (jneoxwumccmjwaojfazh) after an explicit go
--   and BEFORE the 10B code is merged to main (prod DB first, Rule 10).
--   Check the SQL Editor project picker before running.
--   After each run: database/scripts/session-9k-schema-inventory.sql on both
--   projects + compare-schema-inventory.js (they must stay identical).
--
-- Why: POST /api/listings/:id/view reads views_count in Node, adds 1 and
--   writes it back. Two visitors at the same moment both read N and both
--   write N+1, so one view is lost (read-modify-write race). This function
--   does the +1 inside ONE UPDATE statement, so the row lock serialises
--   concurrent views and none are lost.
--   It also stops counting:
--     - the seller's own views   (seller_id IS DISTINCT FROM p_viewer_id;
--                                  NULL viewer = logged-out visitor → counted)
--     - views of non-active listings (pending / rejected / sold — reviewer
--                                  and admin opens must not inflate counts)
--
-- Uses the EXISTING column listings.views_count (000-baseline). The unused
--   legacy column listings.view_count is NOT touched (expand-then-contract;
--   clean-up is a later release — see docs/technical/backlog.md).
--
-- Note: the listings_updated_at trigger still bumps updated_at on each
--   counted view (same as today's code). Nothing reads updated_at yet;
--   tracked in the backlog.
--
-- Safety: additive only — one new function, no table or data change.
--   Security: SECURITY INVOKER (default) like 019; only service_role (the
--   backend) may execute it — 018 deny-by-default.
--
-- Rollback: database/scripts/021-rollback.sql
-- Atomic: one transaction; the verify block aborts everything on a mismatch.

BEGIN;

-- Step 1: The function. Returns the new count, or NULL when nothing was
--   counted (owner, not active, or unknown id) — the route ignores it today,
--   but it makes testing in the SQL Editor easy.
CREATE OR REPLACE FUNCTION public.increment_listing_view(
  p_listing_id UUID,
  p_viewer_id  UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
SET search_path = public
AS $function$
  UPDATE listings
     SET views_count = COALESCE(views_count, 0) + 1
   WHERE id = p_listing_id
     AND status = 'active'
     AND seller_id IS DISTINCT FROM p_viewer_id
  RETURNING views_count;
$function$;

-- Step 2: Only the backend (service role) may call it.
REVOKE ALL ON FUNCTION public.increment_listing_view(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_listing_view(UUID, UUID) TO service_role;

-- Step 3: Verify — abort (roll back everything) if the function is missing
--   or a client role can execute it.
DO $$
BEGIN
  IF to_regprocedure('public.increment_listing_view(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION '021 verify: function increment_listing_view missing';
  END IF;
  IF has_function_privilege('anon', 'public.increment_listing_view(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.increment_listing_view(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '021 verify: a client role can execute increment_listing_view';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.increment_listing_view(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '021 verify: service_role cannot execute increment_listing_view';
  END IF;
  RAISE NOTICE '021 verify: OK';
END;
$$;

COMMIT;
