-- Migration 005: Feedback Rating
-- Session 5 item 9 — Structured feedback form upgrade (Tester-4d)
-- Run in: Supabase SQL Editor (uat project first, then production)
-- Description: Adds an optional 1-5 star rating to feedback submissions.
--   The category piece of this item was already covered by the existing
--   `type` column (suggestion/bug/complaint/praise) — this migration only
--   adds what was missing: the rating.

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS rating SMALLINT;
ALTER TABLE feedback ADD CONSTRAINT feedback_rating_check CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5));
-- Nullable — not every feedback type needs a star rating (e.g. a bug report);
-- the frontend treats it as an optional add-on, not a required field.

-- Verify:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'feedback' ORDER BY ordinal_position;
