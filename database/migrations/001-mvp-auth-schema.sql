-- Migration 001: MVP Auth Schema
-- Session: 2 — Registration, Authentication & Map Interactions
-- Run in: Supabase SQL Editor (uat project first, then production)
-- Description: Adds MVP auth columns to the profiles table.
--   Replaces invite-code-based auth with email+password, Google OAuth, SMS OTP.
--   DO NOT drop the legacy invite_code column — rename it to preserve history.

-- Step 1: Add new auth columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS home_lat FLOAT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS home_lng FLOAT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS home_address TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS agreed_tos_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'email';
-- auth_provider values: 'email' | 'google' | 'phone'

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS default_view TEXT DEFAULT 'map';
-- default_view values: 'map' | 'list' (Tester 3 request — Section 5.6)

-- Step 2: Archive invite_code column (do NOT drop — historical data)
-- Only run this once. Check first: SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name='invite_code';
-- ALTER TABLE profiles RENAME COLUMN invite_code TO invite_code_legacy;

-- Step 3: Verify
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'profiles' ORDER BY ordinal_position;
