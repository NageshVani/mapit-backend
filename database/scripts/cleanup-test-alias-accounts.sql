-- One-off cleanup (not a schema migration) — email verification UAT test accounts
-- Run in: Supabase SQL Editor
-- Purpose: remove throwaway nagesh.aadi+xxxx@gmail.com test accounts created
--   while building/testing email verification (Session 9a). The '+' after
--   "nagesh.aadi" in the pattern below ensures this can NEVER match the real
--   account (nagesh.aadi@gmail.com, no plus) — only +alias variants.
--
-- Revised after Step 2 first failed on 2026-07-26 with:
--   ERROR 23503: update or delete on table "profiles" violates foreign key
--   constraint "feedback_user_id_fkey" on table "feedback"
-- This version clears every table that can reference profiles(id) — most
-- will affect 0 rows for these throwaway accounts, that's expected and fine.

-- Step 1: ALWAYS run this first — review exactly who this will affect
-- before touching anything (Rule 10).
SELECT id, email, email_confirmed_at, created_at
FROM auth.users
WHERE email LIKE 'nagesh.aadi+%@gmail.com'
ORDER BY created_at;

-- Step 2: Clear every table that can reference these profiles, most
-- specific/likely-populated first, before touching profiles/auth.users.
DELETE FROM feedback
WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'nagesh.aadi+%@gmail.com');

DELETE FROM chat_messages
WHERE sender_id IN (SELECT id FROM auth.users WHERE email LIKE 'nagesh.aadi+%@gmail.com');

DELETE FROM conversations
WHERE buyer_id IN (SELECT id FROM auth.users WHERE email LIKE 'nagesh.aadi+%@gmail.com')
   OR seller_id IN (SELECT id FROM auth.users WHERE email LIKE 'nagesh.aadi+%@gmail.com');

DELETE FROM listing_reports
WHERE reporter_id IN (SELECT id FROM auth.users WHERE email LIKE 'nagesh.aadi+%@gmail.com');

DELETE FROM grievances
WHERE logged_by IN (SELECT id FROM auth.users WHERE email LIKE 'nagesh.aadi+%@gmail.com');

DELETE FROM saved_listings
WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'nagesh.aadi+%@gmail.com');

DELETE FROM user_pins
WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'nagesh.aadi+%@gmail.com');

DELETE FROM listings
WHERE seller_id IN (SELECT id FROM auth.users WHERE email LIKE 'nagesh.aadi+%@gmail.com');

-- Step 3: Now safe to remove the profiles rows.
DELETE FROM profiles
WHERE id IN (SELECT id FROM auth.users WHERE email LIKE 'nagesh.aadi+%@gmail.com');

-- Step 4: Delete the auth accounts themselves. Supabase's own auth-schema
-- tables (identities, sessions, refresh_tokens) are set up with ON DELETE
-- CASCADE against auth.users, so this cleans those up automatically.
DELETE FROM auth.users
WHERE email LIKE 'nagesh.aadi+%@gmail.com';

-- Step 5: Verify — should return zero rows.
SELECT id, email FROM auth.users WHERE email LIKE 'nagesh.aadi+%@gmail.com';
