-- Rollback for migration 022 (listing_close_reasons)
-- ⚠️ DESTRUCTIVE: drops the table AND every close reason recorded so far.
--   Export the rows first if they matter (SELECT * … → Download CSV).
-- Run ONLY after the 10C code is rolled back / not deployed — the 10C sold and
--   delete routes insert into this table.
-- Check the SQL Editor project picker before running.

BEGIN;

DROP TABLE IF EXISTS public.listing_close_reasons;

DO $$
BEGIN
  IF to_regclass('public.listing_close_reasons') IS NOT NULL THEN
    RAISE EXCEPTION '022 rollback: table still exists';
  END IF;
  RAISE NOTICE '022 rollback: OK';
END $$;

COMMIT;
