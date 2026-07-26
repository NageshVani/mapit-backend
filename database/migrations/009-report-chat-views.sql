-- Migration 009: Report Chat Views (audit log)
-- Session 8 item 4 — reported-chat visibility
-- Run in: Supabase SQL Editor (uat project first, then production)
-- Description: Lets an admin view the read-only chat thread tied to a
--   listing report (GET /api/listings/reports/:reportId/chat), so Arun can
--   see what was actually said before deciding to act on a report. This is
--   the single most sensitive thing an admin can view in the app — real
--   private conversation content between two users — so every view is
--   logged here (who looked, which report, when), even though the feature
--   itself needs no confirmation dialog or extra friction to use. This
--   table is a paper trail, not an access-control mechanism; the real
--   gate is requireAdmin on the route itself.

CREATE TABLE IF NOT EXISTS report_chat_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   UUID REFERENCES listing_reports(id) ON DELETE CASCADE,
  admin_id    UUID REFERENCES profiles(id),
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE report_chat_views ENABLE ROW LEVEL SECURITY;

-- Deliberately no policies at all — default-deny for both anon and
-- authenticated. Only the backend's service-role client (bypasses RLS)
-- ever writes to or reads this table, via the admin-only route in
-- listings.js. Same "no policies" treatment as grievances — there's no
-- "own" row here, every entry is written on the admin's behalf by the
-- server, never directly by a client.

-- Verify:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'report_chat_views';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'report_chat_views'; -- expect 0 rows
