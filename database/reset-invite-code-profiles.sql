-- One-off data reset (not a schema migration) — Session 8 follow-up
-- Run in: Supabase SQL Editor (uat project first, then production, per Rule 6/10)
-- Purpose: family/friends who originally enrolled via the old invite-code flow
--   never went through the real nickname/full-name/home-location onboarding
--   (that flow didn't exist yet). Reset just those profile fields so the app's
--   existing needsProfile logic (MapIt_MVP_v1.html ~line 1464) routes them
--   straight back through the real onboarding on next login. Their listings,
--   messages, feedback, and auth account are all untouched — nothing else in
--   the app changes for them until they log in again.

-- Step 1: ALWAYS run this first — review exactly who this will affect before
-- touching anything (Rule 10).
SELECT id, nickname, full_name, home_address, invite_code_legacy, created_at
FROM profiles
WHERE invite_code_legacy IS NOT NULL;

-- Step 2: Reset — only run after reviewing Step 1's output.
-- WHERE clause scopes this strictly to invite-code-era profiles (Rule 10).
UPDATE profiles
SET nickname      = NULL,
    full_name     = NULL,
    home_lat      = NULL,
    home_lng      = NULL,
    home_address  = NULL
WHERE invite_code_legacy IS NOT NULL;

-- Step 3: Verify the reset applied to exactly the expected rows.
SELECT id, nickname, full_name, home_address, invite_code_legacy
FROM profiles
WHERE invite_code_legacy IS NOT NULL;
