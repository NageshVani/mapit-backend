-- Session 9K step 8 — production test-data clean-up: DRY RUN (READ-ONLY)
-- Purpose : show exactly what the clean-up would delete, and anything that would
--           block it, BEFORE any DELETE is written or run.
-- Scope   : ALL listings (all are friends-and-family dummy data) + ALL accounts
--           except the two admin accounts (CLAUDE.md Rule 9).
-- Safe    : SELECT only. One result grid (SQL Editor shows only the last one).
--           Emails are masked (abc***@domain) so the output can be shared.
-- Run on  : production (jneoxwumccmjwaojfazh) — check the project picker.

WITH admins AS (
  SELECT id FROM auth.users
  WHERE lower(email) IN ('nagesh.aadi@gmail.com', 'arun.bn1@gmail.com')
),
del_users AS (
  SELECT u.id, u.email, u.created_at FROM auth.users u
  WHERE u.id NOT IN (SELECT id FROM admins)
),
del_listings AS (SELECT * FROM public.listings)
-- 1 · summary counts
SELECT 1 AS sort, '1 SUMMARY' AS section, 'admin accounts KEPT (expect 2)' AS item,
       (SELECT count(*) FROM admins)::text AS detail
UNION ALL SELECT 1, '1 SUMMARY', 'accounts to DELETE',          (SELECT count(*) FROM del_users)::text
UNION ALL SELECT 1, '1 SUMMARY', 'listings to DELETE',          (SELECT count(*) FROM del_listings)::text
UNION ALL SELECT 1, '1 SUMMARY', 'listings by status',
       (SELECT string_agg(status || '=' || n, ', ' ORDER BY status)
        FROM (SELECT status, count(*) n FROM del_listings GROUP BY status) s)
UNION ALL SELECT 1, '1 SUMMARY', 'storage files (listing-photos) to remove',
       (SELECT count(*) FROM storage.objects WHERE bucket_id = 'listing-photos')::text
-- 2 · rows removed automatically by ON DELETE CASCADE
UNION ALL SELECT 2, '2 CASCADE', 'listing_photos',   (SELECT count(*) FROM public.listing_photos)::text
UNION ALL SELECT 2, '2 CASCADE', 'saved_listings',   (SELECT count(*) FROM public.saved_listings)::text
UNION ALL SELECT 2, '2 CASCADE', 'messages_legacy',  (SELECT count(*) FROM public.messages_legacy)::text
UNION ALL SELECT 2, '2 CASCADE', 'conversations',    (SELECT count(*) FROM public.conversations)::text
UNION ALL SELECT 2, '2 CASCADE', 'chat_messages',    (SELECT count(*) FROM public.chat_messages)::text
UNION ALL SELECT 2, '2 CASCADE', 'user_pins of deleted users',
       (SELECT count(*) FROM public.user_pins WHERE user_id IN (SELECT id FROM del_users))::text
UNION ALL SELECT 2, '2 CASCADE', 'phone_otps of deleted users',
       (SELECT count(*) FROM public.phone_otps WHERE user_id IN (SELECT id FROM del_users))::text
UNION ALL SELECT 2, '2 KEPT',    'audit_log rows whose user_id becomes NULL (IT Rules — kept)',
       (SELECT count(*) FROM public.audit_log WHERE user_id IN (SELECT id FROM del_users))::text
-- 3 · BLOCKERS: FKs to profiles/listings WITHOUT cascade — must be 0 or handled first
UNION ALL SELECT 3, '3 BLOCKER', 'transactions (listing or deleted user)',
       (SELECT count(*) FROM public.transactions)::text
UNION ALL SELECT 3, '3 BLOCKER', 'feedback by deleted users',
       (SELECT count(*) FROM public.feedback WHERE user_id IN (SELECT id FROM del_users))::text
UNION ALL SELECT 3, '3 BLOCKER', 'grievances logged_by deleted users',
       (SELECT count(*) FROM public.grievances WHERE logged_by IN (SELECT id FROM del_users))::text
UNION ALL SELECT 3, '3 BLOCKER', 'invite_codes used_by deleted users (archived table)',
       (SELECT count(*) FROM public.invite_codes WHERE used_by IN (SELECT id FROM del_users))::text
UNION ALL SELECT 3, '3 BLOCKER', 'listing_reports by deleted users',
       (SELECT count(*) FROM public.listing_reports WHERE reporter_id IN (SELECT id FROM del_users))::text
UNION ALL SELECT 3, '3 BLOCKER', 'report_chat_views by deleted users',
       (SELECT count(*) FROM public.report_chat_views WHERE admin_id IN (SELECT id FROM del_users))::text
-- 4 · accounts to delete (masked)
UNION ALL SELECT 4, '4 ACCOUNT', left(split_part(u.email, '@', 1), 3) || '***@' || split_part(u.email, '@', 2),
       'created ' || to_char(u.created_at, 'YYYY-MM-DD') ||
       ' · listings ' || (SELECT count(*) FROM public.listings l WHERE l.seller_id = u.id)
FROM del_users u
-- 5 · listings to delete
UNION ALL SELECT 5, '5 LISTING', COALESCE(l.reference_code, '(no ref)') || ' · ' || l.title,
       l.category || '/' || l.subcategory || ' · ' || l.status ||
       ' · ' || to_char(l.created_at, 'YYYY-MM-DD') ||
       CASE WHEN l.seller_id IN (SELECT id FROM admins) THEN ' · by admin' ELSE '' END
FROM del_listings l
ORDER BY 1, 2, 3;
