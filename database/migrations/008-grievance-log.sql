-- Migration 008: Grievance Log
-- Session 8 item 3 — admin-page grievance tracking
-- Run in: Supabase SQL Editor (uat project first, then production)
-- Description: Arun is the named Grievance Officer (docs/terms-privacy-draft2.html
--   Section 19/15), and IT Rules 2021 Rule 3(2) requires acknowledging a
--   complaint within 24 hours and resolving it within 15 days. Right now
--   grievance emails land directly in Arun's personal Gmail with no in-app
--   record or deadline tracking at all — this table + the admin page's new
--   Grievances section closes that gap. Grievances are entered manually
--   (there's no automatic capture path — they arrive as external email),
--   so this table is written to only via the admin-only routes in
--   src/routes/grievances.js, never directly by a non-admin user.
--   The 24h/15-day deadlines are deliberately NOT stored as columns —
--   computed on the fly from received_at in the API response, so there's
--   no risk of a stored deadline drifting out of sync with received_at.

CREATE TABLE IF NOT EXISTS grievances (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  complainant_name     TEXT NOT NULL,
  complainant_contact  TEXT,
  note                 TEXT NOT NULL,
  acknowledged_at      TIMESTAMPTZ,
  status               TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_at          TIMESTAMPTZ,
  logged_by            UUID REFERENCES profiles(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE grievances ENABLE ROW LEVEL SECURITY;

-- Deliberately no policies at all — default-deny for both anon and
-- authenticated. Only the backend's service-role client (bypasses RLS)
-- ever touches this table, via the admin-only routes in grievances.js.
-- Same "no SELECT policy" treatment as listing_reports, just with no
-- INSERT/UPDATE-own policies either, since there's no "own" grievance —
-- these are always admin-entered on someone else's behalf.

-- Verify:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'grievances';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'grievances'; -- expect 0 rows
