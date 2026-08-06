-- Migration 010: Listing Display Location (Progressive Location Disclosure)
-- Session 9B — anti-doxxing fix, source: docs/Doxxing issue workaround.rtf
-- Run in: Supabase SQL Editor (uat project first, then production)
-- Description: Adds a fuzzed "display" location per listing, separate from
--   the seller's exact lat/lng. Buyer-facing views will be switched (in a
--   later step of this session) to read display_lat/display_lng instead of
--   the exact lat/lng — the exact columns stay, unchanged, and remain the
--   source of truth for the seller's own edit view and for radius search.
--   display_lat/display_lng are computed once at listing-creation time by
--   the backend (a fixed 150-400m offset, seeded by listing id) and stored
--   here — never re-randomized on read, since re-fuzzing per request would
--   let repeated views be triangulated back to the real point.
--   This migration only adds the columns. It does NOT yet change what any
--   route returns — that's the next step in this session, done separately
--   so each step can be tested on its own (Rule 2).

ALTER TABLE listings ADD COLUMN IF NOT EXISTS display_lat DOUBLE PRECISION;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS display_lng DOUBLE PRECISION;

-- Verify:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'listings' AND column_name IN ('display_lat', 'display_lng');
