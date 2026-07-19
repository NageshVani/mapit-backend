-- Migration 007: User Suspension
-- Session 6 item 3 — Admin moderation queue, "one-click user suspension"
-- Run in: Supabase SQL Editor (uat project first, then production)
-- Description: Adds a flag so an admin can suspend a seller directly from
--   the new Reports tab in the Admin modal, instead of editing Supabase
--   Auth/profiles by hand.
--   Scope note (deliberate, per Nagesh's call 2026-07-19): this migration
--   only adds the flag and lets admin set it. It does NOT block a suspended
--   user anywhere yet (no requireAuth check, no route guard) — enforcement
--   is left for a later, explicitly-scoped session so the moderation queue
--   ships now without taking on that extra design decision (where to check
--   it, whether it adds a DB read to every request) unreviewed.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT false;

-- Verify:
-- SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'suspended';
