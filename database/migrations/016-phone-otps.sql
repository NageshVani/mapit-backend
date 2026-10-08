-- Migration 016: WhatsApp phone OTP codes + one verified phone per account
-- Session 9C build item 2 (send/verify routes), drafted 2026-10-04.
-- Run in: Supabase SQL Editor (single project — covers both uat and production)
-- Description: The backend generates a 6-digit code, stores ONLY its hash
--   here, and delivers the code via MSG91's WhatsApp Authentication template.
--   On a correct verify, profiles.phone / profiles.phone_verified (migration
--   012) are updated and the row is marked consumed. Codes live 10 minutes;
--   each row allows at most 5 wrong guesses. Rows also serve as the per-user
--   send-rate counter (60s resend cooldown, max 5 sends/day), so no extra
--   rate-limit table is needed.
--
-- Why a separate table, not otp_* columns on profiles: profiles rows are
--   read with select('*') and spread into API responses in several places,
--   so any new column there is public by default. This table is never read
--   by a user-facing query.
--
-- RLS: enabled with NO policies defined — default-deny for the `anon` and
--   `authenticated` roles. Only the backend's service-role client
--   (supabaseAdmin, bypasses RLS) can read or write it. Same as audit_log.
--
-- Additive only: no existing table or row is changed. The unique index
--   below covers verified phones only — every existing profile has
--   phone_verified = false (migration 012 default), so it cannot fail on
--   existing data, and unverified free-text phone values stay untouched.
--
-- Retention: rows are useless after 24h. No automated purge yet — Session 9H
--   (listing auto-expiry cron) will add one; until then run the purge below
--   occasionally.

CREATE TABLE IF NOT EXISTS phone_otps (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone        TEXT NOT NULL,              -- E.164, e.g. +919876543210 (India only for MVP)
  code_hash    TEXT NOT NULL,              -- sha256 hex, never the plain code
  expires_at   TIMESTAMPTZ NOT NULL,
  attempts     SMALLINT NOT NULL DEFAULT 0,
  consumed_at  TIMESTAMPTZ,                -- set on successful verify
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE phone_otps ENABLE ROW LEVEL SECURITY;
-- Deliberately no CREATE POLICY statements — see RLS note above.

-- Latest-code lookup and the per-user cooldown/daily-cap count.
CREATE INDEX IF NOT EXISTS idx_phone_otps_user_created ON phone_otps(user_id, created_at DESC);

-- One verified phone number per account. Partial index: only rows with
-- phone_verified = true take part, so unverified/legacy values can repeat.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_profiles_verified_phone
  ON profiles(phone) WHERE phone_verified = true;

-- Verify:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'phone_otps' ORDER BY ordinal_position;  -- 8 rows
-- SELECT * FROM pg_policies WHERE tablename = 'phone_otps';                                                                  -- 0 rows
-- SELECT indexname FROM pg_indexes WHERE indexname IN ('idx_phone_otps_user_created','uniq_profiles_verified_phone');        -- 2 rows

-- Manual purge (until Session 9H's cron automates it):
-- DELETE FROM phone_otps WHERE created_at < now() - interval '1 day';
