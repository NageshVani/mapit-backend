-- Migration 014: IT Rules 2021 compliance audit log
-- Scoped 2026-07-16, built 2026-08-06.
-- Run in: Supabase SQL Editor (single project — covers both uat and production)
-- Description: IT Rules 2021 requires intermediaries to retain records of
--   user activity (who did what, when, from what IP) for a compliance
--   window, producible on a lawful request. Nothing in the app currently
--   captures this. Scoped to 4 event types only — signup, login,
--   listing_created, message_sent — not a full activity tracker.
--
-- RLS: enabled with NO policies defined — default-deny for the `anon` and
--   `authenticated` roles. Only the backend's service-role client
--   (supabaseAdmin, bypasses RLS) can read or write this table; no API
--   route will ever expose it.
--
-- Retention: 180 days. No automated purge yet (needs Vercel Pro Cron Jobs,
--   Rule 11/Rule 9) — run the purge query below manually on a periodic
--   basis until that lands.

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  event_type  TEXT NOT NULL,          -- 'signup' | 'login' | 'listing_created' | 'message_sent'
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address  TEXT,
  user_agent  TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- Deliberately no CREATE POLICY statements — see RLS note above.

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type);

-- Verify:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'audit_log' ORDER BY ordinal_position;
-- SELECT * FROM pg_policies WHERE tablename = 'audit_log'; -- should return 0 rows

-- Manual 180-day purge (run periodically until Vercel Pro Cron automates it):
-- DELETE FROM audit_log WHERE created_at < now() - interval '180 days';
