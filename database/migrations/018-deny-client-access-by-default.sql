-- Migration 018: Deny direct client access by default (pre-launch security audit)
-- Session: 9 pre-launch security audit (2026-10-16)
-- Run in: Supabase SQL Editor — UAT FIRST (mapit-uat / xesekrkxbtybbxpsvxuz),
--   test there, then production (jneoxwumccmjwaojfazh) after an explicit go.
--   Check the SQL Editor project picker before running.
--
-- Why: the anon key is public (served by /api/config). Before this migration,
--   database/scripts/session-9-security-audit-grants.sql showed on UAT that
--   anon/authenticated held FULL privileges on every public table, and that
--   new tables get them automatically (default privileges). Combined with the
--   prototype policies this let anyone, bypassing the backend:
--     • read ALL listings (pending/rejected, exact lat/lng, moderation_reason)
--     • insert listings directly (skips phone gate, validation, AI moderation)
--     • possibly update their own listing (e.g. status = 'active')
--     • edit the text of chat messages they received (report evidence)
--     • start conversations / send messages (skips spam screening, emails)
--     • read/modify feedback rows with user_id IS NULL
--     • read photo rows of every listing incl. pending/rejected
--
-- Approach — deny by default, allow by exception (least privilege):
--   The backend does every legitimate table read/write with the service role
--   (supabaseAdmin), which these grants do not affect. The browser touches the
--   database directly only for chat Realtime (receive-only, chat_messages,
--   whose policy reads conversations). So: revoke everything from the client
--   roles, re-grant SELECT on exactly those two tables, drop the policies that
--   would come back to life with a future grant, and close default privileges.
--
-- Not changed: storage (uploads go through the backend; bucket stays public
--   for photo URLs), RLS stays ON everywhere (defense in depth), service_role.
--
-- Rollback: database/scripts/018-rollback.sql (restores the pre-018 grants,
--   policies and default privileges exactly as in 000-baseline.sql).
-- Atomic: one transaction; the verify block at the end aborts (rolls back
--   everything) if any client grant is left that should not be there.

BEGIN;

-- Step 1: Remove all client privileges on existing tables, sequences
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
--   PostGIS objects in public are owned by supabase_admin, so the line above
--   skips them (only the owner/grantor can revoke). Try explicitly; if we lack
--   the right, Postgres WARNs (or errors — caught here, the migration goes on).
--   Leftovers are reported by the verify step.
DO $$
BEGIN
  REVOKE ALL ON public.spatial_ref_sys, public.geometry_columns, public.geography_columns FROM anon, authenticated;
EXCEPTION WHEN others THEN
  RAISE NOTICE '018: PostGIS revoke skipped: %', SQLERRM;
END $$;

-- Step 2: The one exception — chat Realtime (MapIt_MVP_v1.html subscribeChatChannel).
--   Realtime checks RLS as the signed-in user, so it needs SELECT on
--   chat_messages, and the chat_messages policy subquery needs SELECT on
--   conversations. RLS still limits both to the user's own conversations.
GRANT SELECT ON public.chat_messages, public.conversations TO authenticated;

-- Step 3: Drop policies that no client path uses any more. Without grants they
--   are inert today, but a future GRANT would silently re-open them.
-- listings
DROP POLICY IF EXISTS "Allow public read"                     ON public.listings;
DROP POLICY IF EXISTS "Allow users to insert their own rows"  ON public.listings;
DROP POLICY IF EXISTS "Allow users to update their own rows"  ON public.listings;
DROP POLICY IF EXISTS "Sellers can delete own listings"       ON public.listings;
-- listing_photos
DROP POLICY IF EXISTS "Photos viewable by all logged-in users"      ON public.listing_photos;
DROP POLICY IF EXISTS "Sellers can manage photos for own listings"  ON public.listing_photos;
-- profiles (writes already revoked by 017; reads go through the backend)
DROP POLICY IF EXISTS "Users can insert own profile"  ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile"    ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"  ON public.profiles;
-- saved_listings, user_pins, feedback
DROP POLICY IF EXISTS "Users can manage own saved listings"     ON public.saved_listings;
DROP POLICY IF EXISTS "Allow users to update their own rows"    ON public.user_pins;
DROP POLICY IF EXISTS "Users can manage own pins"               ON public.user_pins;
DROP POLICY IF EXISTS "Users can submit and view own feedback"  ON public.feedback;
-- transactions, messages_legacy (prototype tables, unused by the app)
DROP POLICY IF EXISTS "Users can insert transactions"      ON public.transactions;
DROP POLICY IF EXISTS "Users can read own transactions"    ON public.transactions;
DROP POLICY IF EXISTS "Users can update own transactions"  ON public.transactions;
DROP POLICY IF EXISTS "Users can delete own messages"      ON public.messages_legacy;
DROP POLICY IF EXISTS "Users can insert messages"          ON public.messages_legacy;
DROP POLICY IF EXISTS "Users can read own messages"        ON public.messages_legacy;
-- conversations / chat_messages: writes go through the backend
DROP POLICY IF EXISTS "Buyers can start a conversation on a listing"           ON public.conversations;
DROP POLICY IF EXISTS "Participants can send messages in their conversations"  ON public.chat_messages;
DROP POLICY IF EXISTS "Recipients can mark messages as read"                   ON public.chat_messages;
-- listing_reports: reports go through the backend
DROP POLICY IF EXISTS "listing_reports_insert_own"  ON public.listing_reports;
DROP POLICY IF EXISTS "listing_reports_update_own"  ON public.listing_reports;

-- Step 4: Keep the two read policies Realtime needs, limited to signed-in users
--   (they were "to public", i.e. also evaluated for anon).
ALTER POLICY "Participants can view their conversations"             ON public.conversations TO authenticated;
ALTER POLICY "Participants can view messages in their conversations" ON public.chat_messages TO authenticated;

-- Step 5: Close default privileges for objects that `postgres` (SQL Editor) creates
--   from now on. A new table is closed to clients unless a migration grants it.
--   (supabase_admin's defaults cannot be changed by us; we never create objects as it.)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL     ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL     ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- Step 6: Functions
--   handle_new_user is SECURITY DEFINER: pin search_path so nobody can shadow
--   objects it uses (it already writes public.profiles fully qualified).
ALTER FUNCTION public.handle_new_user() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
--   The radius RPC is called only by the backend (service role keeps EXECUTE).
REVOKE EXECUTE ON FUNCTION public.listings_within_radius(double precision, double precision, double precision)
  FROM PUBLIC, anon, authenticated;

-- Step 7: Verify — abort (roll back everything) if anything unexpected is left
DO $$
DECLARE
  bad_grants  text;
  ext_grants  text;
  bad_cols    int;
  n_policies  int;
BEGIN
  -- Strict check on OUR tables/views (not owned by an extension)
  SELECT string_agg(g.table_name || '→' || g.grantee || ':' || g.privilege_type, ', ')
    INTO bad_grants
  FROM information_schema.role_table_grants g
  WHERE g.table_schema = 'public' AND g.grantee IN ('anon', 'authenticated')
    AND NOT (g.grantee = 'authenticated' AND g.privilege_type = 'SELECT'
             AND g.table_name IN ('chat_messages', 'conversations'))
    AND NOT EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.classid = 'pg_class'::regclass AND d.deptype = 'e'
                      AND d.objid = ('public.' || quote_ident(g.table_name))::regclass);
  IF bad_grants IS NOT NULL THEN
    RAISE EXCEPTION '018 verify: unexpected client grants left: %', bad_grants;
  END IF;

  -- Extension-owned leftovers (PostGIS): report only — see Step 1
  SELECT string_agg(DISTINCT g.table_name || '→' || g.grantee, ', ')
    INTO ext_grants
  FROM information_schema.role_table_grants g
  WHERE g.table_schema = 'public' AND g.grantee IN ('anon', 'authenticated')
    AND EXISTS (SELECT 1 FROM pg_depend d
                WHERE d.classid = 'pg_class'::regclass AND d.deptype = 'e'
                  AND d.objid = ('public.' || quote_ident(g.table_name))::regclass);
  IF ext_grants IS NOT NULL THEN
    RAISE NOTICE '018 verify: extension-owned objects still granted (not ours to revoke): %', ext_grants;
  END IF;

  SELECT count(*) INTO bad_cols
  FROM information_schema.column_privileges c
  WHERE c.table_schema = 'public' AND c.grantee IN ('anon', 'authenticated')
    AND c.table_name NOT IN ('chat_messages', 'conversations')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.classid = 'pg_class'::regclass AND d.deptype = 'e'
                      AND d.objid = ('public.' || quote_ident(c.table_name))::regclass);
  IF bad_cols > 0 THEN
    RAISE EXCEPTION '018 verify: % column-level client grants left', bad_cols;
  END IF;

  SELECT count(*) INTO n_policies FROM pg_policies WHERE schemaname = 'public';
  IF n_policies <> 2 THEN
    RAISE EXCEPTION '018 verify: expected 2 policies in public, found %', n_policies;
  END IF;

  IF has_function_privilege('anon', 'public.listings_within_radius(double precision, double precision, double precision)', 'EXECUTE') THEN
    RAISE EXCEPTION '018 verify: anon can still execute listings_within_radius';
  END IF;

  RAISE NOTICE '018 verify: OK — clients keep only SELECT on chat_messages + conversations (RLS-limited)';
END $$;

COMMIT;

-- After running (UAT):
--   1. node -r dotenv/config scripts/security/client-access-check.js   → all PASS
--   2. npm run uat:9c                                                  → 35/35
--   3. Localhost: two accounts chat — message appears live (Realtime)
--   4. Re-run database/scripts/session-9-security-audit-grants.sql and
--      session-9k-schema-inventory.sql (later: diff UAT vs prod after prod run)
