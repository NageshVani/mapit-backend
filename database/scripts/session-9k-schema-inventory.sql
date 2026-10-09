-- Session 9K step 1 — read-only schema inventory of the LIVE (production) project
-- Run in: Supabase SQL Editor, production project (jneoxwumccmjwaojfazh)
-- Purpose: capture everything needed to rebuild the database in the new
--   mapit-uat project. Migrations 001–017 only ALTER the prototype's base
--   tables (profiles, listings, messages, feedback, ...), which were created by
--   hand and never recorded — this output is the source for 000-baseline.sql.
-- Read-only — SELECTs on system catalogs only, no data rows, no PII.
-- Output: ONE row, ONE cell of JSON. Copy the whole cell and save it as
--   C:\dev\mapit\schema-live.json  (outside the repo — do not commit it).
-- Objects owned by extensions (PostGIS, cube, earthdistance, ...) are excluded.

WITH user_tables AS (
  SELECT c.oid, c.relname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.classid = 'pg_class'::regclass
                      AND d.objid = c.oid AND d.deptype = 'e')
),
user_functions AS (
  SELECT p.oid, p.proname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind IN ('f', 'p')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.classid = 'pg_proc'::regclass
                      AND d.objid = p.oid AND d.deptype = 'e')
)
SELECT jsonb_pretty(jsonb_build_object(
  'generated_at', now(),
  'server_version', current_setting('server_version'),

  'extensions', (
    SELECT jsonb_agg(jsonb_build_object('name', e.extname, 'version', e.extversion,
                                        'schema', n.nspname) ORDER BY e.extname)
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace),

  'tables', (
    SELECT jsonb_agg(jsonb_build_object('table', c.relname,
                                        'rls', c.relrowsecurity,
                                        'force_rls', c.relforcerowsecurity) ORDER BY c.relname)
    FROM pg_class c JOIN user_tables ut ON ut.oid = c.oid),

  'columns', (
    SELECT jsonb_agg(jsonb_build_object('table', ut.relname, 'column', a.attname,
                                        'type', format_type(a.atttypid, a.atttypmod),
                                        'not_null', a.attnotnull,
                                        'default', pg_get_expr(ad.adbin, ad.adrelid),
                                        'identity', NULLIF(a.attidentity, ''))
                     ORDER BY ut.relname, a.attnum)
    FROM pg_attribute a
    JOIN user_tables ut ON ut.oid = a.attrelid
    LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
    WHERE a.attnum > 0 AND NOT a.attisdropped),

  'constraints', (
    SELECT jsonb_agg(jsonb_build_object('table', ut.relname, 'name', co.conname,
                                        'type', co.contype,
                                        'def', pg_get_constraintdef(co.oid))
                     ORDER BY ut.relname, co.conname)
    FROM pg_constraint co JOIN user_tables ut ON ut.oid = co.conrelid),

  'indexes', (
    SELECT jsonb_agg(jsonb_build_object('table', ut.relname, 'name', ic.relname,
                                        'def', pg_get_indexdef(i.indexrelid))
                     ORDER BY ut.relname, ic.relname)
    FROM pg_index i
    JOIN user_tables ut ON ut.oid = i.indrelid
    JOIN pg_class ic ON ic.oid = i.indexrelid),

  'policies', (
    SELECT jsonb_agg(jsonb_build_object('schema', schemaname, 'table', tablename,
                                        'name', policyname, 'permissive', permissive,
                                        'cmd', cmd, 'roles', roles,
                                        'using', qual, 'with_check', with_check)
                     ORDER BY schemaname, tablename, policyname)
    FROM pg_policies WHERE schemaname IN ('public', 'storage')),

  'table_grants', (
    SELECT jsonb_agg(g ORDER BY g->>'table', g->>'role')
    FROM (SELECT jsonb_build_object('table', table_name, 'role', grantee,
                                    'privileges', string_agg(privilege_type, ',' ORDER BY privilege_type)) AS g
          FROM information_schema.role_table_grants
          WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
            AND table_name IN (SELECT relname FROM user_tables)
          GROUP BY table_name, grantee) s),

  'functions', (
    SELECT jsonb_agg(jsonb_build_object('name', uf.proname,
                                        'args', pg_get_function_identity_arguments(uf.oid),
                                        'security_definer', p.prosecdef,
                                        'anon_execute', has_function_privilege('anon', uf.oid, 'EXECUTE'),
                                        'authenticated_execute', has_function_privilege('authenticated', uf.oid, 'EXECUTE'),
                                        'def', pg_get_functiondef(uf.oid))
                     ORDER BY uf.proname)
    FROM user_functions uf JOIN pg_proc p ON p.oid = uf.oid),

  'triggers', (
    SELECT jsonb_agg(jsonb_build_object('table', t.tgrelid::regclass::text,
                                        'name', t.tgname,
                                        'enabled', t.tgenabled,
                                        'def', pg_get_triggerdef(t.oid))
                     ORDER BY t.tgrelid::regclass::text, t.tgname)
    FROM pg_trigger t
    WHERE NOT t.tgisinternal
      AND (t.tgrelid IN (SELECT oid FROM user_tables) OR t.tgrelid = 'auth.users'::regclass)),

  'views', (
    SELECT jsonb_agg(jsonb_build_object('name', c.relname, 'kind', c.relkind,
                                        'def', pg_get_viewdef(c.oid, true)) ORDER BY c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.classid = 'pg_class'::regclass
                        AND d.objid = c.oid AND d.deptype = 'e')),

  'enum_types', (
    SELECT jsonb_agg(jsonb_build_object('name', t.typname,
                                        'labels', (SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
                                                   FROM pg_enum e WHERE e.enumtypid = t.oid))
                     ORDER BY t.typname)
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype = 'e'),

  'storage_buckets', (
    SELECT jsonb_agg(jsonb_build_object('id', id, 'public', public,
                                        'file_size_limit', file_size_limit,
                                        'allowed_mime_types', allowed_mime_types) ORDER BY id)
    FROM storage.buckets),

  'realtime_tables', (
    SELECT jsonb_agg(schemaname || '.' || tablename ORDER BY tablename)
    FROM pg_publication_tables WHERE pubname = 'supabase_realtime')
)) AS schema_inventory;
