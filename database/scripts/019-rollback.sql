-- Rollback for migration 019 (listing review queue). DRAFT 2026-10-26.
-- Run in the SAME project 019 was run in (check the SQL Editor picker).
-- Loses: the staff roster, review history and live claims. Rejected listings
--   keep status 'rejected' + rejection_reason (columns from 000-baseline).
BEGIN;
DROP FUNCTION IF EXISTS public.claim_next_pending_listing(UUID, INTEGER, UUID, UUID[]);
DROP INDEX IF EXISTS public.listings_pending_queue_idx;
DROP TABLE IF EXISTS public.listing_reviews;
ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_review_claimed_by_fkey,
  DROP COLUMN IF EXISTS review_claimed_until,
  DROP COLUMN IF EXISTS review_claimed_by;
DROP TABLE IF EXISTS public.staff_members;
COMMIT;
