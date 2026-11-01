-- Migration 020: Personal invite links for the /review page
-- Session: 9L (DRAFT 2026-11-01, NOT RUN)
-- Run in: Supabase SQL Editor — UAT FIRST (mapit-uat / xesekrkxbtybbxpsvxuz),
--   test there, then production (jneoxwumccmjwaojfazh) after an explicit go.
--   Check the SQL Editor project picker before running.
--   After each run: database/scripts/session-9k-schema-inventory.sql on both
--   projects + compare-schema-inventory.js (they must stay identical).
--
-- Why (decision D16, Nagesh 2026-11-01): anyone who finds /review could sign
--   up and appear in the Team list as "requested". Now an admin (Nagesh/Arun)
--   creates a personal invite link in the Team panel; only a valid, unused,
--   unexpired invite lets an account request access. The invite does NOT
--   activate the account — an admin still taps Activate.
--   NOT the archived invite_codes table (Rule 9: archived, do not touch).
--
-- One-time use: the backend marks an invite used with ONE conditional UPDATE
--   (... WHERE used_at IS NULL AND cancelled_at IS NULL AND expires_at > now()),
--   used_at (not used_by) is the "used" flag: used_by becomes NULL if that
--   account is deleted, and the invite must stay used.
--   so two people opening the same link at once can't both use it.
-- Only a sha256 hash of the code is stored: a DB leak gives no usable link.
--
-- Safety: additive only — one new table, no existing data touched. RLS ON and
--   no client grants (018 deny-by-default); the backend uses the service role.
-- ⚠️ Release order: run on production BEFORE merging the 9L code (with 019).
--
-- Rollback: database/scripts/020-rollback.sql
-- Atomic: one transaction; the verify block aborts everything on a mismatch.

BEGIN;

CREATE TABLE public.review_invites (
  id           UUID        NOT NULL DEFAULT gen_random_uuid(),
  code_hash    TEXT        NOT NULL,
  display_name TEXT        NOT NULL,   -- who the invite is for (admin's label)
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  used_by      UUID,
  used_at      TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  CONSTRAINT review_invites_pkey PRIMARY KEY (id),
  CONSTRAINT review_invites_code_hash_key UNIQUE (code_hash),
  CONSTRAINT review_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT review_invites_used_by_fkey FOREIGN KEY (used_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT review_invites_display_name_check CHECK (char_length(display_name) BETWEEN 2 AND 40)
);
ALTER TABLE public.review_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.review_invites FROM PUBLIC, anon, authenticated;

-- Verify — abort (roll back everything) if the table is missing or a client
--   role can reach it.
DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'review_invites') <> 9 THEN
    RAISE EXCEPTION '020 verify: review_invites columns missing';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.review_invites'::regclass) THEN
    RAISE EXCEPTION '020 verify: RLS is off';
  END IF;
  IF has_table_privilege('anon', 'public.review_invites', 'SELECT')
     OR has_table_privilege('authenticated', 'public.review_invites', 'SELECT')
     OR has_table_privilege('anon', 'public.review_invites', 'INSERT')
     OR has_table_privilege('authenticated', 'public.review_invites', 'UPDATE') THEN
    RAISE EXCEPTION '020 verify: a client role can reach review_invites';
  END IF;
  RAISE NOTICE '020 verify: OK';
END $$;

COMMIT;
