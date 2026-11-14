-- Rollback for migration 020 (review_invites). UAT first; production only
-- after an explicit go. Check the SQL Editor project picker before running.
-- Deletes all invites (used and unused). staff_members is NOT touched, so
-- approvers who joined with an invite keep their status.
-- Before rolling back production, the 9L code must not depend on the table
-- (POST /api/review/access-request would fail for non-admins).

BEGIN;
DROP TABLE IF EXISTS public.review_invites;
COMMIT;
