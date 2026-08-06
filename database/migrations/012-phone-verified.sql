-- Migration 012: Mandatory Phone Verification — phone_verified flag
-- Session 9C — WhatsApp Business API OTP (see docs/research/WhatsApp OTP principle.rtf)
-- Run in: Supabase SQL Editor (uat project first, then production)
-- Description: `profiles.phone` already exists (migration 001) as a free-text
--   optional field used only for the listing "show phone" toggle — it has
--   never been verified as belonging to the account holder. This adds
--   `phone_verified`, defaulting to false for every existing and new row,
--   which the not-yet-built send/verify OTP routes (Session 9C build item 2)
--   will flip to true once a user completes WhatsApp OTP verification.
--   Existing `phone` values are untouched — they predate verification and
--   should not be trusted as pre-verified.
--
-- Deliberately NOT in this migration (flagged for a later decision, not an
-- oversight): a UNIQUE constraint on `phone` to stop one number being reused
-- across multiple accounts. Skipped for now because (a) existing free-text
-- values may already contain duplicates/inconsistent formats that would
-- break the constraint, and (b) it only matters once phone is enforced at
-- signup — revisit alongside build item 2 (OTP routes), not before.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false;

-- Verify:
-- SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'phone_verified';
