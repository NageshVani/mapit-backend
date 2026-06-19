-- Migration 002: MVP Listings Schema
-- Session: 3 — Posting a Listing — Full Flow
-- Run in: Supabase SQL Editor (uat project first, then production)
-- Description: Adds listing lifecycle columns for MVP — reference code, expiry,
--   phone visibility toggle, city reference, and view counter.

-- Step 1: Add new listings columns
ALTER TABLE listings ADD COLUMN IF NOT EXISTS reference_code TEXT UNIQUE;
-- Format: MP-BLR-XXXXXX (city prefix + 6 random alphanumeric) — generated in backend on creation

ALTER TABLE listings ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
-- Set to created_at + 30 days on insert; auto-expire via cron/Edge Function

ALTER TABLE listings ADD COLUMN IF NOT EXISTS show_phone TEXT DEFAULT 'always';
-- Values: 'always' | 'on_agreement' | 'never'

ALTER TABLE listings ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;
-- Incremented each time a listing detail is fetched

ALTER TABLE listings ADD COLUMN IF NOT EXISTS city_id UUID;
-- References cities(id) — to be added once cities table is created in Session 7
-- ALTER TABLE listings ADD CONSTRAINT fk_listings_city FOREIGN KEY (city_id) REFERENCES cities(id);

-- Step 2: Add feedback category column (Session 4 — Section 5.8 bug fix)
-- ALTER TABLE feedback ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
-- Values: 'bug' | 'suggestion' | 'praise' | 'complaint' | 'general'

-- Step 3: Verify
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'listings' ORDER BY ordinal_position;
