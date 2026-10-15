-- Session 9 config — backup test-restore check (2026-10-15)
-- Run in: Supabase SQL Editor, on BOTH production (jneoxwumccmjwaojfazh) and the
--   temporary restored copy ("mapit-restore-test"), then compare the two outputs.
-- Read-only: counts only, no rows, no PII. Safe on production.
-- Output: ONE row, ONE cell of JSON {table: row count, ...} plus auth.users and
--   the newest listing / profile timestamps (shows which day the backup is from).
-- Counts can differ only by changes made on production after the backup was taken.

SELECT jsonb_pretty(
  (SELECT jsonb_object_agg(t.relname,
            (xpath('/row/c/text()',
                   query_to_xml(format('SELECT count(*) AS c FROM public.%I', t.relname), false, true, '')))[1]::text::bigint
          ORDER BY t.relname)
     FROM pg_class t
     JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relkind IN ('r', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.classid = 'pg_class'::regclass AND d.objid = t.oid AND d.deptype = 'e'))
  || jsonb_build_object(
       'auth.users',              (SELECT count(*) FROM auth.users),
       'newest_listing_created',  (SELECT max(created_at) FROM public.listings),
       'newest_profile_created',  (SELECT max(created_at) FROM public.profiles),
       'newest_audit_log',        (SELECT max(created_at) FROM public.audit_log))
) AS restore_check;
