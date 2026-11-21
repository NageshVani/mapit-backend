-- Migration 022: Reason when a seller closes a listing (Mark as sold / Delete)
-- Release: 10C — close reasons (DRAFT 2026-11-21, NOT RUN)
-- Run in: Supabase SQL Editor — UAT FIRST (mapit-uat / xesekrkxbtybbxpsvxuz),
--   test there, then production (jneoxwumccmjwaojfazh) after an explicit go
--   and BEFORE the 10C code is merged to main (prod DB first, Rule 10).
--   Check the SQL Editor project picker before running.
--   After each run: database/scripts/session-9k-schema-inventory.sql on both
--   projects + compare-schema-inventory.js (unwrap "Copy as JSON" first;
--   they must stay identical).
--
-- Why (Nagesh 2026-11-15 / 2026-11-21): "sold on MapIt vs elsewhere" is the
--   most useful business number, and delete reasons show why sellers leave.
--   A reason is REQUIRED for both Mark as sold and Delete (seller's own
--   listing). Admin deletions are not recorded here (not a seller's reason).
--
-- Why a separate table (not a column on listings): Delete removes the
--   listings row, so a column would vanish with it. Soft delete would need a
--   filter on every listings query (risk of deleted listings leaking back).
--
-- Design notes:
--   - listing_id has NO foreign key ON PURPOSE: the reason must survive the
--     listing's deletion (an FK would cascade-delete it or block the delete).
--   - seller_id → auth.users ON DELETE SET NULL: if the account is deleted,
--     the anonymous business number stays.
--   - reason is a short code (e.g. 'sold_on_mapit'). The allowed list lives in
--     ONE place in code (src/config/listingRules.js) so new reasons need no
--     migration; the DB only checks the code's shape. No free text — free
--     text invites phone numbers / names (PII, Rule 8).
--   - category / subcategory are copied at close time so the numbers can be
--     split by category after the listing row is gone. No country-specific
--     values are hard-coded (new-market guardrail).
--   - No extra index yet: the backend only INSERTs. A report query later gets
--     its own index + EXPLAIN ANALYZE (Rule 10).
--
-- Safety: additive only — one new table, no existing data touched. RLS ON and
--   no client grants (018 deny-by-default); the backend uses the service role.
--
-- Rollback: database/scripts/022-rollback.sql
-- Atomic: one transaction; the verify block aborts everything on a mismatch.

BEGIN;

CREATE TABLE public.listing_close_reasons (
  id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  listing_id  UUID        NOT NULL,   -- no FK on purpose (see notes above)
  seller_id   UUID,
  category    TEXT        NOT NULL,
  subcategory TEXT,
  action      TEXT        NOT NULL,   -- 'sold' | 'deleted'
  reason      TEXT        NOT NULL,   -- code from listingRules.js
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT listing_close_reasons_pkey PRIMARY KEY (id),
  CONSTRAINT listing_close_reasons_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT listing_close_reasons_action_check CHECK (action IN ('sold', 'deleted')),
  CONSTRAINT listing_close_reasons_reason_check CHECK (reason ~ '^[a-z][a-z_]{1,39}$'),
  CONSTRAINT listing_close_reasons_category_check CHECK (char_length(category) BETWEEN 1 AND 20),
  CONSTRAINT listing_close_reasons_subcategory_check CHECK (subcategory IS NULL OR char_length(subcategory) <= 60)
);
ALTER TABLE public.listing_close_reasons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.listing_close_reasons FROM PUBLIC, anon, authenticated;

-- Verify — abort (roll back everything) if the table is missing or a client
--   role can reach it.
DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'listing_close_reasons') <> 8 THEN
    RAISE EXCEPTION '022 verify: listing_close_reasons columns missing';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.listing_close_reasons'::regclass) THEN
    RAISE EXCEPTION '022 verify: RLS is off';
  END IF;
  IF has_table_privilege('anon', 'public.listing_close_reasons', 'SELECT')
     OR has_table_privilege('authenticated', 'public.listing_close_reasons', 'SELECT')
     OR has_table_privilege('anon', 'public.listing_close_reasons', 'INSERT')
     OR has_table_privilege('authenticated', 'public.listing_close_reasons', 'INSERT')
     OR has_table_privilege('authenticated', 'public.listing_close_reasons', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.listing_close_reasons', 'DELETE') THEN
    RAISE EXCEPTION '022 verify: a client role can reach listing_close_reasons';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.listing_close_reasons', 'INSERT') THEN
    RAISE EXCEPTION '022 verify: service_role cannot insert into listing_close_reasons';
  END IF;
  RAISE NOTICE '022 verify: OK';
END $$;

COMMIT;
