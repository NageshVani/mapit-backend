-- Migration 019: Listing review queue (dedicated /review page for approvers)
-- Session: public release, review queue (DRAFT 2026-10-26, NOT RUN)
-- Run in: Supabase SQL Editor — UAT FIRST (mapit-uat / xesekrkxbtybbxpsvxuz),
--   test there, then production (jneoxwumccmjwaojfazh) after an explicit go.
--   Check the SQL Editor project picker before running.
--   After each run: database/scripts/session-9k-schema-inventory.sql on both
--   projects + compare-schema-inventory.js (they must stay identical).
--
-- Why: approvals move from the admin page to their own mobile page, used by
--   more people than the two hardcoded admins (Arun's wife, Nagesh's wife
--   now; outside approvers later). That needs three things the DB lacks:
--     1. a staff roster — who may approve (signing up alone grants nothing;
--        an admin must activate the account)
--     2. a claim (lease) per pending listing — so two approvers never open
--        the same listing at the same time
--     3. a review history — who approved/rejected what, when, and why
--        (quality checks on new approvers, rejection reasons for sellers)
--   listings.status 'rejected' and listings.rejection_reason ALREADY EXIST
--   (000-baseline) and are unused today; reject stops being a hard delete.
--
-- Safety: additive only. New nullable columns without defaults = metadata
--   change, no table rewrite, no lock worth noticing. No data is changed.
--   New tables get RLS ON and no client grants (018 deny-by-default); the
--   backend uses the service role.
--
-- Rollback: database/scripts/019-rollback.sql
-- Atomic: one transaction; the verify block aborts everything on a mismatch.

BEGIN;

-- Step 1: Staff roster. One row per approver account (auth.users).
--   Admins (Rule 9 hardcoded emails) do not need a row — the backend treats
--   them as approvers automatically.
--   status: requested (signed up, waiting) → active → revoked
--   role: only 'approver' today; the CHECK is widened when a new role is real.
CREATE TABLE public.staff_members (
  user_id      UUID        NOT NULL,
  display_name TEXT        NOT NULL,
  role         TEXT        NOT NULL DEFAULT 'approver',
  status       TEXT        NOT NULL DEFAULT 'requested',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by   UUID,
  decided_at   TIMESTAMPTZ,
  CONSTRAINT staff_members_pkey PRIMARY KEY (user_id),
  CONSTRAINT staff_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT staff_members_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT staff_members_role_check CHECK (role = ANY (ARRAY['approver'])),
  CONSTRAINT staff_members_status_check CHECK (status = ANY (ARRAY['requested', 'active', 'revoked'])),
  CONSTRAINT staff_members_display_name_check CHECK (char_length(display_name) BETWEEN 2 AND 40)
);
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

-- Step 2: Claim (lease) columns on listings. A claim expires by itself, so a
--   closed phone or lost signal never locks a listing for good.
ALTER TABLE public.listings
  ADD COLUMN review_claimed_by    UUID,
  ADD COLUMN review_claimed_until TIMESTAMPTZ,
  ADD CONSTRAINT listings_review_claimed_by_fkey FOREIGN KEY (review_claimed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Step 3: Review history. One row per decision; a listing that is rejected,
--   edited and resubmitted gets a second row.
CREATE TABLE public.listing_reviews (
  id          BIGSERIAL,
  listing_id  UUID        NOT NULL,
  reviewer_id UUID,
  decision    TEXT        NOT NULL,
  reason_code TEXT,
  reason_note TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT listing_reviews_pkey PRIMARY KEY (id),
  CONSTRAINT listing_reviews_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE,
  CONSTRAINT listing_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT listing_reviews_decision_check CHECK (decision = ANY (ARRAY['approved', 'rejected'])),
  CONSTRAINT listing_reviews_reason_check CHECK (decision = 'approved' OR reason_code IS NOT NULL),
  CONSTRAINT listing_reviews_note_check CHECK (char_length(reason_note) <= 300)
);
ALTER TABLE public.listing_reviews ENABLE ROW LEVEL SECURITY;
CREATE INDEX listing_reviews_listing_idx  ON public.listing_reviews USING btree (listing_id, created_at DESC);
CREATE INDEX listing_reviews_reviewer_idx ON public.listing_reviews USING btree (reviewer_id, created_at DESC);

-- Step 4: Queue index — only pending rows, oldest first (FIFO = the 4-hour
--   promise is kept for the seller who has waited longest).
CREATE INDEX listings_pending_queue_idx ON public.listings USING btree (created_at) WHERE status = 'pending';

-- Step 5: Claim the next listing, atomically.
--   FOR UPDATE SKIP LOCKED: two approvers pressing "next" in the same
--   millisecond get two DIFFERENT listings — the second one skips the row the
--   first has locked instead of waiting for it.
--   p_exclude_seller: an approver never reviews their own listing (the
--   backend passes NULL for admins, who proxy-post for sellers).
--   p_skip: listings this approver pressed "Skip" on in this session.
CREATE OR REPLACE FUNCTION public.claim_next_pending_listing(
  p_reviewer       UUID,
  p_lease_seconds  INTEGER DEFAULT 300,
  p_exclude_seller UUID    DEFAULT NULL,
  p_skip           UUID[]  DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_id UUID;
BEGIN
  -- Resume my own live claim first (page reload shows the same listing)
  SELECT id INTO v_id
    FROM listings
   WHERE status = 'pending'
     AND review_claimed_by = p_reviewer
     AND review_claimed_until > now()
     AND NOT (id = ANY (p_skip))
   ORDER BY created_at
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT id INTO v_id
    FROM listings
   WHERE status = 'pending'
     AND (review_claimed_until IS NULL OR review_claimed_until < now())
     AND (p_exclude_seller IS NULL OR seller_id <> p_exclude_seller)
     AND NOT (id = ANY (p_skip))
   ORDER BY created_at
   LIMIT 1
   FOR UPDATE SKIP LOCKED;
  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE listings
     SET review_claimed_by    = p_reviewer,
         review_claimed_until = now() + make_interval(secs => p_lease_seconds)
   WHERE id = v_id;
  RETURN v_id;
END;
$function$;

-- Only the backend (service role) may call it — 018 deny-by-default.
REVOKE ALL ON FUNCTION public.claim_next_pending_listing(UUID, INTEGER, UUID, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_pending_listing(UUID, INTEGER, UUID, UUID[]) TO service_role;

-- Step 6: Verify — abort (roll back everything) if anything is missing or a
--   client role can reach the new objects.
DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'listings'
         AND column_name IN ('review_claimed_by', 'review_claimed_until', 'rejection_reason')) <> 3 THEN
    RAISE EXCEPTION '019 verify: listings columns missing';
  END IF;
  IF has_table_privilege('anon', 'public.staff_members', 'SELECT')
     OR has_table_privilege('authenticated', 'public.staff_members', 'SELECT')
     OR has_table_privilege('anon', 'public.listing_reviews', 'SELECT')
     OR has_table_privilege('authenticated', 'public.listing_reviews', 'SELECT') THEN
    RAISE EXCEPTION '019 verify: a client role can read a new table';
  END IF;
  IF has_function_privilege('authenticated', 'public.claim_next_pending_listing(uuid, integer, uuid, uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.claim_next_pending_listing(uuid, integer, uuid, uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION '019 verify: a client role can call the claim function';
  END IF;
  RAISE NOTICE '019 verify: OK';
END $$;

COMMIT;
