-- Rollback for migration 021 (increment_listing_view)
-- Run ONLY after the 10B code is rolled back / not deployed — the 10B /view
--   route calls this function (the route swallows errors, so the page keeps
--   working, but views stop being counted).
-- Check the SQL Editor project picker before running.

BEGIN;

DROP FUNCTION IF EXISTS public.increment_listing_view(UUID, UUID);

DO $$
BEGIN
  IF to_regprocedure('public.increment_listing_view(uuid, uuid)') IS NOT NULL THEN
    RAISE EXCEPTION '021 rollback: function still exists';
  END IF;
  RAISE NOTICE '021 rollback: OK';
END;
$$;

COMMIT;
