-- Migration 015: AI-Assisted Listing Moderation (Session 9E)
-- Session: 9E — Claude-based spam/fake/offensive screening on new listings
-- Run in: Supabase SQL Editor (uat project first, then production)
-- Description: Adds nullable columns to the existing `listings` table to
--   persist a passive moderation verdict computed server-side right after a
--   listing is created. Additive only — no defaults, no constraints, no
--   impact on existing rows or queries. Mirrors migration 004
--   (lead_verdict/lead_scored_at on `messages`) exactly, same rationale.

-- Step 1: Add verdict + reason + timestamp columns
ALTER TABLE listings ADD COLUMN IF NOT EXISTS moderation_verdict TEXT;
-- moderation_verdict values: 'clean' | 'flagged' | 'unscreened' | NULL (pre-migration rows, or never scored)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS moderation_reason TEXT;
-- moderation_reason is only ever populated when moderation_verdict = 'flagged'
-- — a short human-readable reason for the admin reviewer, never shown to
-- buyers/sellers, never used to auto-approve/auto-reject (flag is a sort
-- signal for the human reviewer, not a gate — see Session 9E scope).
ALTER TABLE listings ADD COLUMN IF NOT EXISTS moderation_scored_at TIMESTAMPTZ;

-- Step 2: Verify
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_name = 'listings' AND column_name LIKE 'moderation%' ORDER BY column_name;
