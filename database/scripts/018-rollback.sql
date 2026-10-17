-- Rollback for migration 018 (deny client access by default)
-- Run in: Supabase SQL Editor — ONLY the project where 018 caused a problem.
--   Check the project picker first.
-- Restores grants, policies and default privileges exactly as in
--   000-baseline.sql (= production 2026-10-09 + migration 017). This RE-OPENS the
--   holes 018 closed (public listings read etc.) — use only to unblock, then fix
--   forward with a new migration.
-- Atomic: one transaction.

BEGIN;

-- Grants (Supabase defaults), keeping migration 017's profiles revoke
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles FROM anon, authenticated;
DO $$
BEGIN
  GRANT ALL ON public.spatial_ref_sys, public.geometry_columns, public.geography_columns TO anon, authenticated;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'rollback: PostGIS grant skipped: %', SQLERRM;
END $$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL     ON TABLES    TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL     ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

ALTER FUNCTION public.handle_new_user() RESET search_path;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listings_within_radius(double precision, double precision, double precision)
  TO PUBLIC, anon, authenticated;

-- Policies (copied from 000-baseline.sql)
ALTER POLICY "Participants can view their conversations"             ON public.conversations TO public;
ALTER POLICY "Participants can view messages in their conversations" ON public.chat_messages TO public;

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow public read" ON public.listings
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow users to insert their own rows" ON public.listings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Allow users to update their own rows" ON public.listings
  FOR UPDATE TO authenticated WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Sellers can delete own listings" ON public.listings
  FOR DELETE TO authenticated USING (auth.uid() = seller_id);

CREATE POLICY "Photos viewable by all logged-in users" ON public.listing_photos
  FOR SELECT TO authenticated USING (auth.role() = 'authenticated'::text);
CREATE POLICY "Sellers can manage photos for own listings" ON public.listing_photos
  FOR ALL TO authenticated
  USING (auth.uid() = (SELECT listings.seller_id FROM public.listings WHERE listings.id = listing_photos.listing_id))
  WITH CHECK (auth.uid() = (SELECT listings.seller_id FROM public.listings WHERE listings.id = listing_photos.listing_id));

CREATE POLICY "Users can manage own saved listings" ON public.saved_listings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert transactions" ON public.transactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "Users can read own transactions" ON public.transactions
  FOR SELECT TO authenticated USING ((auth.uid() = buyer_id) OR (auth.uid() = seller_id));
CREATE POLICY "Users can update own transactions" ON public.transactions
  FOR UPDATE TO authenticated USING ((auth.uid() = buyer_id) OR (auth.uid() = seller_id));

CREATE POLICY "Users can delete own messages" ON public.messages_legacy
  FOR DELETE TO authenticated USING (auth.uid() = sender_id);
CREATE POLICY "Users can insert messages" ON public.messages_legacy
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users can read own messages" ON public.messages_legacy
  FOR SELECT TO authenticated USING ((auth.uid() = sender_id) OR (auth.uid() = receiver_id));

CREATE POLICY "Users can submit and view own feedback" ON public.feedback
  FOR ALL TO authenticated
  USING ((auth.uid() = user_id) OR (user_id IS NULL))
  WITH CHECK ((auth.uid() = user_id) OR (user_id IS NULL));

CREATE POLICY "Allow users to update their own rows" ON public.user_pins
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own pins" ON public.user_pins
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Buyers can start a conversation on a listing" ON public.conversations
  FOR INSERT
  WITH CHECK ((auth.uid() = buyer_id) AND (buyer_id <> seller_id)
              AND (seller_id = (SELECT listings.seller_id FROM public.listings WHERE listings.id = conversations.listing_id)));

CREATE POLICY "Participants can send messages in their conversations" ON public.chat_messages
  FOR INSERT
  WITH CHECK ((auth.uid() = sender_id) AND (EXISTS (SELECT 1 FROM public.conversations c
              WHERE c.id = chat_messages.conversation_id AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid()))));
CREATE POLICY "Recipients can mark messages as read" ON public.chat_messages
  FOR UPDATE
  USING ((sender_id <> auth.uid()) AND (EXISTS (SELECT 1 FROM public.conversations c
         WHERE c.id = chat_messages.conversation_id AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid()))))
  WITH CHECK ((sender_id <> auth.uid()) AND (EXISTS (SELECT 1 FROM public.conversations c
              WHERE c.id = chat_messages.conversation_id AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid()))));

CREATE POLICY "listing_reports_insert_own" ON public.listing_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "listing_reports_update_own" ON public.listing_reports
  FOR UPDATE USING (auth.uid() = reporter_id);

COMMIT;
