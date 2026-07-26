-- Migration 006: Listing Reports
-- Session 6 item 2 — "Report Listing" button
-- Run in: Supabase SQL Editor (uat project first, then production)
-- Description: Lets a buyer flag a listing (Fake / Wrong price / Spam /
--   Offensive) + optional note. Previously the only reporting path was
--   WhatsApp to Nagesh/Arun personally — nothing was recorded anywhere.
--   RLS is locked down like `audit_log` (see CONTEXT.md item 14): users can
--   insert their own report, but there is no public SELECT policy — the
--   admin moderation queue (a separate, later item) reads this table via
--   the backend's service-role client, same pattern as every other admin
--   read in this app.

CREATE TABLE IF NOT EXISTS listing_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  UUID REFERENCES listings(id) ON DELETE CASCADE,
  reporter_id UUID REFERENCES profiles(id),
  reason      TEXT NOT NULL CHECK (reason IN ('fake', 'wrong_price', 'spam', 'offensive', 'other')),
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(listing_id, reporter_id)
  -- One report per user per listing — a second tap updates the existing row
  -- (new reason/note) instead of creating a duplicate; keeps the queue clean.
);

ALTER TABLE listing_reports ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may report a listing, as themselves only.
CREATE POLICY "listing_reports_insert_own" ON listing_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- A user may update their own report (covers the same-user re-report case,
-- since the UNIQUE constraint means the backend will UPSERT on conflict).
CREATE POLICY "listing_reports_update_own" ON listing_reports
  FOR UPDATE USING (auth.uid() = reporter_id);

-- Deliberately no SELECT policy — default-deny. Only the backend's
-- service-role client (bypasses RLS) reads this table, via the admin
-- moderation queue built in a later item. No API route ever exposes raw
-- report data to non-admin users.

-- Verify:
-- SELECT table_name, rowsecurity FROM pg_tables WHERE tablename = 'listing_reports';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'listing_reports';
