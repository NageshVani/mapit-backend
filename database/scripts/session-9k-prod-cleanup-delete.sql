-- Session 9K step 8 — production test-data clean-up: DELETE (DESTRUCTIVE)
-- Run ONLY on production (jneoxwumccmjwaojfazh), ONLY after:
--   1. backup export verified  (C:/dev/mapit/backups/prod-before-cleanup-2026-10-10.csv, 18/18 OK)
--   2. dry run reviewed         (session-9k-prod-cleanup-dryrun.sql, 2026-10-10)
--   3. Nagesh's explicit go-ahead
--
-- What it does (one transaction — any failed check rolls back EVERYTHING):
--   a. delete ALL feedback (expect 7 rows — all Nagesh's dummy test input)
--   b. delete all listings created before the cut-off (expect 41)
--        → cascades listing_photos, saved_listings, messages_legacy,
--          conversations → chat_messages, listing_reports
--   c. delete all accounts except the two admins, created before the cut-off (expect 32)
--        → cascades profiles, user_pins, phone_otps; audit_log.user_id → NULL (kept)
-- Guards: exact expected counts from the dry run, so it aborts on UAT, on a
-- changed database, or if anything new appeared. The cut-off protects any
-- listing/account created after the dry run.
-- NOT included: photo files in Storage (bucket listing-photos) — delete those in
-- Dashboard → Storage afterwards (Supabase blocks direct SQL deletes on storage).

DO $$
DECLARE
  cutoff  CONSTANT timestamptz := '2026-10-10 00:00:00+04';
  admin_emails CONSTANT text[] := ARRAY['nagesh.aadi@gmail.com', 'arun.bn1@gmail.com'];
  n int;
BEGIN
  -- Guard 1: both admin accounts exist
  SELECT count(*) INTO n FROM auth.users WHERE lower(email) = ANY (admin_emails);
  IF n <> 2 THEN RAISE EXCEPTION 'ABORT: expected 2 admin accounts, found %', n; END IF;

  -- Guard 2: counts match the reviewed dry run
  SELECT count(*) INTO n FROM public.listings WHERE created_at < cutoff;
  IF n <> 41 THEN RAISE EXCEPTION 'ABORT: expected 41 listings, found % — wrong project or data changed', n; END IF;

  SELECT count(*) INTO n FROM auth.users
  WHERE NOT (lower(COALESCE(email, '')) = ANY (admin_emails)) AND created_at < cutoff;
  IF n <> 32 THEN RAISE EXCEPTION 'ABORT: expected 32 test accounts, found %', n; END IF;

  -- a. delete ALL feedback (Nagesh, 2026-10-10: all 7 rows are his own test input)
  DELETE FROM public.feedback WHERE submitted_at < cutoff;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 7 THEN RAISE EXCEPTION 'ABORT: expected to delete 7 feedback rows, got %', n; END IF;

  -- b. listings
  DELETE FROM public.listings WHERE created_at < cutoff;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 41 THEN RAISE EXCEPTION 'ABORT: expected to delete 41 listings, got %', n; END IF;

  -- c. test accounts (admins excluded)
  DELETE FROM auth.users
  WHERE NOT (lower(COALESCE(email, '')) = ANY (admin_emails)) AND created_at < cutoff;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 32 THEN RAISE EXCEPTION 'ABORT: expected to delete 32 accounts, got %', n; END IF;
END $$;

-- Verification (read-only) — this is the grid the SQL Editor shows
SELECT 'listings (expect 0)'              AS check_item, count(*)::text AS value FROM public.listings
UNION ALL SELECT 'auth.users (expect 2)',          count(*)::text FROM auth.users
UNION ALL SELECT 'admin accounts (expect 2)',      count(*)::text FROM auth.users
          WHERE lower(email) IN ('nagesh.aadi@gmail.com', 'arun.bn1@gmail.com')
UNION ALL SELECT 'profiles (expect 2)',            count(*)::text FROM public.profiles
UNION ALL SELECT 'conversations (expect 0)',       count(*)::text FROM public.conversations
UNION ALL SELECT 'chat_messages (expect 0)',       count(*)::text FROM public.chat_messages
UNION ALL SELECT 'listing_photos (expect 0)',      count(*)::text FROM public.listing_photos
UNION ALL SELECT 'feedback (expect 0)',            count(*)::text FROM public.feedback
UNION ALL SELECT 'invite_codes (expect 15, kept)', count(*)::text FROM public.invite_codes
UNION ALL SELECT 'audit_log (expect >= 355, kept)', count(*)::text FROM public.audit_log
UNION ALL SELECT 'storage files (12 → delete in Dashboard)', count(*)::text
          FROM storage.objects WHERE bucket_id = 'listing-photos';
