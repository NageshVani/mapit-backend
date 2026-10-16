-- Session 9 pre-launch security audit — step 1: read-only check of client access
-- Run in: Supabase SQL Editor, UAT project FIRST (mapit-uat / xesekrkxbtybbxpsvxuz).
--   Later, the same script on production (jneoxwumccmjwaojfazh) to confirm both match.
-- Purpose: list everything the PUBLIC anon key (served by /api/config) and a
--   signed-in user's token can reach directly, bypassing the backend:
--   RLS on/off, policies, table grants, column-only grants, default privileges
--   for FUTURE tables, functions (SECURITY DEFINER + search_path + EXECUTE),
--   storage policies, realtime tables. Input for migration 018.
-- Read-only — SELECTs on system catalogs only, no data rows, no PII.
-- Output: ONE result grid (section | object | detail), ordered. Use "Export → CSV"
--   (or copy all rows) and paste/save it for James.

WITH user_tables AS (
  SELECT c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.classid = 'pg_class'::regclass
                      AND d.objid = c.oid AND d.deptype = 'e')
),
rows AS (
  -- 1. RLS status per table (views have no RLS — flagged separately)
  SELECT 1 AS ord, '1 rls' AS section, relname AS object,
         CASE WHEN relrowsecurity THEN 'RLS on' ELSE '⚠ RLS OFF' END
         || CASE WHEN relforcerowsecurity THEN ', forced' ELSE '' END AS detail
  FROM user_tables
  WHERE oid IN (SELECT oid FROM pg_class WHERE relkind IN ('r', 'p'))

  UNION ALL
  SELECT 1, '1 rls', relname, '⚠ VIEW/MATVIEW (no RLS; check grants)'
  FROM user_tables
  WHERE oid IN (SELECT oid FROM pg_class WHERE relkind IN ('v', 'm'))

  -- 2. Policies (public + storage)
  UNION ALL
  SELECT 2, '2 policy', schemaname || '.' || tablename || ' · ' || policyname,
         cmd || ' to ' || array_to_string(roles, ',')
         || ' | USING ' || COALESCE(qual, '—')
         || ' | CHECK ' || COALESCE(with_check, '—')
  FROM pg_policies
  WHERE schemaname IN ('public', 'storage')

  -- 3. Table-level grants to client roles
  UNION ALL
  SELECT 3, '3 table grant', table_name || ' → ' || grantee,
         string_agg(privilege_type, ',' ORDER BY privilege_type)
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    AND table_name IN (SELECT relname FROM user_tables)
  GROUP BY table_name, grantee

  -- 4. Column-only grants (exist even if the table grant is revoked)
  UNION ALL
  SELECT 4, '4 column grant', c.relname || '.' || a.attname, a.attacl::text
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN user_tables ut ON ut.oid = c.oid
  WHERE a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL

  -- 5. Default privileges — what NEW tables/functions get automatically
  UNION ALL
  SELECT 5, '5 default acl',
         pg_get_userbyid(d.defaclrole) || ' · ' ||
         CASE d.defaclobjtype WHEN 'r' THEN 'tables' WHEN 'S' THEN 'sequences'
              WHEN 'f' THEN 'functions' WHEN 'T' THEN 'types' ELSE d.defaclobjtype::text END,
         d.defaclacl::text
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
  WHERE n.nspname = 'public'

  -- 6. Functions in public: SECURITY DEFINER, search_path, who may EXECUTE
  UNION ALL
  SELECT 6, '6 function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'invoker' END
         || ' | config ' || COALESCE(array_to_string(p.proconfig, ','), '⚠ none (no search_path)')
         || ' | anon exec ' || has_function_privilege('anon', p.oid, 'EXECUTE')
         || ' | auth exec ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.classid = 'pg_proc'::regclass
                      AND d.objid = p.oid AND d.deptype = 'e')

  -- 7. Storage buckets
  UNION ALL
  SELECT 7, '7 bucket', id,
         'public=' || public || ' | size_limit=' || COALESCE(file_size_limit::text, '—')
         || ' | mime=' || COALESCE(array_to_string(allowed_mime_types, ','), '—')
  FROM storage.buckets

  -- 8. Realtime publication
  UNION ALL
  SELECT 8, '8 realtime', schemaname || '.' || tablename, 'in supabase_realtime'
  FROM pg_publication_tables WHERE pubname = 'supabase_realtime'

  -- 9. Which project is this? (no secrets — just a sanity row)
  UNION ALL
  SELECT 9, '9 meta', 'server_version', current_setting('server_version')
)
SELECT section, object, detail
FROM rows
ORDER BY ord, object;
