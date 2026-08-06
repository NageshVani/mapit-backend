-- Migration 011: Listing "Show Exact Location" Toggle
-- Session 9B — anti-doxxing fix, source: docs/Doxxing issue workaround.rtf
-- Run in: Supabase SQL Editor (uat project first, then production)
-- Description: Lets a seller opt IN to showing their exact lat/lng to
--   buyers instead of the fuzzed display_lat/display_lng added in
--   migration 010. Defaults to false (fuzzy) for every existing and new
--   listing — sellers must explicitly turn this on per listing.
--   Naming mirrors the existing `show_phone` column on this table: same
--   shape (per-listing opt-in boolean, default false), same convention.

ALTER TABLE listings ADD COLUMN IF NOT EXISTS show_exact_location BOOLEAN NOT NULL DEFAULT false;

-- Verify:
-- SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'show_exact_location';
