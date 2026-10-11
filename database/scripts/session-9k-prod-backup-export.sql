-- Session 9K step 8 — pre-cleanup export (READ-ONLY)
-- Purpose : simple backup of every app table before deleting production test data,
--           without installing pg_dump. Run in Supabase SQL Editor, then use
--           "Download CSV" on the result grid. One row per table:
--           table_name | row_count | data (all rows as JSON).
-- Safe    : SELECT only — writes nothing. Works on any project (check the picker).
-- Note    : auth.users is exported WITHOUT password hashes / tokens. A restored
--           account would need a password reset — acceptable, everyone re-registers.
-- PII     : the CSV contains real emails/phones. Keep it OUTSIDE the repo
--           (C:\dev\mapit\backups\), never email/upload/commit it.

SELECT 'auth.users' AS table_name, count(*) AS row_count,
       COALESCE(jsonb_agg(to_jsonb(u)), '[]'::jsonb) AS data
FROM (SELECT id, email, phone, created_at, updated_at, last_sign_in_at,
             email_confirmed_at, phone_confirmed_at,
             raw_app_meta_data, raw_user_meta_data
      FROM auth.users) u
UNION ALL SELECT 'profiles',          count(*), COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.profiles t
UNION ALL SELECT 'listings',          count(*), COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.listings t
UNION ALL SELECT 'listing_photos',    count(*), COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.listing_photos t
UNION ALL SELECT 'saved_listings',    count(*), COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.saved_listings t
UNION ALL SELECT 'transactions',      count(*), COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.transactions t
UNION ALL SELECT 'messages_legacy',   count(*), COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.messages_legacy t
UNION ALL SELECT 'feedback',          count(*), COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.feedback t
UNION ALL SELECT 'user_pins',         count(*), COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.user_pins t
UNION ALL SELECT 'conversations',     count(*), COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.conversations t
UNION ALL SELECT 'chat_messages',     count(*), COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.chat_messages t
UNION ALL SELECT 'listing_reports',   count(*), COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.listing_reports t
UNION ALL SELECT 'report_chat_views', count(*), COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.report_chat_views t
UNION ALL SELECT 'grievances',        count(*), COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.grievances t
UNION ALL SELECT 'invite_codes',      count(*), COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.invite_codes t
UNION ALL SELECT 'audit_log',         count(*), COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.audit_log t
UNION ALL SELECT 'phone_otps',        count(*), COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.phone_otps t
UNION ALL SELECT 'storage.objects',   count(*), COALESCE(jsonb_agg(to_jsonb(o)), '[]')
FROM (SELECT id, bucket_id, name, owner, created_at, metadata FROM storage.objects) o;
