-- Migration 004: Lead Scoring (Spam/Genuine Classification)
-- Session: 5 — Claude-based lead scoring on "I'm Interested" messages
-- Run in: Supabase SQL Editor (uat project first, then production)
-- Description: Adds nullable columns to the existing `messages` table to
--   persist the passive spam/genuine verdict computed server-side after a
--   buyer's first message on a listing. Additive only — no defaults, no
--   constraints, no impact on existing rows or queries.

-- Step 1: Add verdict + timestamp columns
ALTER TABLE messages ADD COLUMN IF NOT EXISTS lead_verdict TEXT;
-- lead_verdict values: 'spam' | 'genuine' | 'unscreened' | NULL (pre-migration rows, or never scored)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS lead_scored_at TIMESTAMPTZ;

-- Step 2: Verify
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_name = 'messages' ORDER BY column_name;
