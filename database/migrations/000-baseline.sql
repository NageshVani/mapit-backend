-- Migration 000: Baseline — full schema snapshot of production as of 2026-10-09
-- Session: 9K — separate UAT Supabase project
-- Run in: Supabase SQL Editor — ONLY on a NEW, EMPTY project (mapit-uat).
--   NEVER on production (jneoxwumccmjwaojfazh / "mapit-prototype"). A guard at
--   the top aborts the whole script if public.listings already exists.
--
-- Why this exists: migrations 001–017 never built the database from empty —
--   the prototype's base tables were created by hand and only ALTERed later,
--   and two hand changes were never recorded (messages → messages_legacy
--   rename; listings.city_id dropped). This file is a "squashed baseline":
--   it reproduces production exactly as captured by
--   database/scripts/session-9k-schema-inventory.sql on 2026-10-09 16:29 UTC
--   (Postgres 17.6), i.e. it ALREADY INCLUDES the effect of 001–017.
--   A new database runs 000 only; 001–017 are history. 018+ run everywhere.
--
-- Fidelity rule: everything below mirrors production, including the policies
--   flagged for the pre-launch security audit (listings "Allow public read",
--   listings UPDATE policy without USING, handle_new_user without
--   search_path). Fixes go in 018+ and are applied to BOTH projects, so UAT
--   keeps behaving like production.
--
-- Grants: Supabase's default privileges give anon/authenticated/service_role
--   full table privileges on new public tables — identical to production —
--   so only migration 017's REVOKE on profiles is repeated here.
-- Atomic: wrapped in one transaction — any error rolls back everything.

BEGIN;

-- Step 0: Guard — refuse to run on a database that already has the schema
DO $$
BEGIN
  IF to_regclass('public.listings') IS NOT NULL THEN
    RAISE EXCEPTION 'public.listings already exists — this is not an empty project (production?). Aborting, nothing changed.';
  END IF;
END $$;

-- Step 1: Extensions (production: postgis/cube/earthdistance in public;
--   uuid-ossp/pgcrypto in extensions — those two ship with every project)
CREATE EXTENSION IF NOT EXISTS postgis       WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS cube          WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS earthdistance WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"   WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto      WITH SCHEMA extensions;

-- Step 2: Trigger functions
CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_listing_location()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.location = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::GEOGRAPHY;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'MapIt User'),
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL)
  );
  RETURN NEW;
END;
$function$;

-- Step 3: Tables (column order and constraint names match production)
CREATE TABLE public.profiles (
  id                 UUID NOT NULL,
  full_name          TEXT NOT NULL,
  phone              TEXT,
  avatar_color       TEXT DEFAULT '#E8602F',
  trust_badge        TEXT DEFAULT 'Verified',
  avg_rating         NUMERIC(3,1) DEFAULT 0.0,
  review_count       INTEGER DEFAULT 0,
  invite_code_legacy TEXT,
  is_active          BOOLEAN DEFAULT true,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  auth_provider      TEXT DEFAULT 'email',
  default_view       TEXT DEFAULT 'map',
  nickname           TEXT,
  home_lat           DOUBLE PRECISION,
  home_lng           DOUBLE PRECISION,
  home_address       TEXT,
  agreed_tos_at      TIMESTAMPTZ,
  suspended          BOOLEAN NOT NULL DEFAULT false,
  phone_verified     BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_trust_badge_check CHECK (trust_badge = ANY (ARRAY['Verified', 'Trusted', 'Power Seller', 'Flagged'])),
  CONSTRAINT profiles_auth_provider_check CHECK (auth_provider = ANY (ARRAY['email', 'google', 'phone'])),
  CONSTRAINT profiles_default_view_check CHECK (default_view = ANY (ARRAY['map', 'list']))
);

-- Archived (invite codes no longer used) — kept for parity, do not delete
CREATE TABLE public.invite_codes (
  id          UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  code        TEXT NOT NULL,
  created_for TEXT,
  used_by     UUID,
  used_at     TIMESTAMPTZ,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT invite_codes_pkey PRIMARY KEY (id),
  CONSTRAINT invite_codes_code_key UNIQUE (code),
  CONSTRAINT invite_codes_used_by_fkey FOREIGN KEY (used_by) REFERENCES public.profiles(id)
);

CREATE TABLE public.listings (
  id                   UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  seller_id            UUID NOT NULL,
  category             TEXT NOT NULL,
  subcategory          TEXT NOT NULL,
  title                TEXT NOT NULL,
  description          TEXT,
  price                NUMERIC(12,2) NOT NULL,
  price_label          TEXT,
  condition            TEXT DEFAULT 'Used',
  lat                  DOUBLE PRECISION NOT NULL,
  lng                  DOUBLE PRECISION NOT NULL,
  address              TEXT,
  location             geography(Point,4326),
  specs                JSONB DEFAULT '[]'::jsonb,
  status               TEXT DEFAULT 'pending',
  rejection_reason     TEXT,
  view_count           INTEGER DEFAULT 0,
  inquiry_count        INTEGER DEFAULT 0,
  expires_at           TIMESTAMPTZ DEFAULT (now() + '30 days'::interval),
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  details              JSONB DEFAULT '{}'::jsonb,
  reference_code       TEXT,
  show_phone           TEXT DEFAULT 'always',
  views_count          INTEGER DEFAULT 0,
  display_lat          DOUBLE PRECISION,
  display_lng          DOUBLE PRECISION,
  show_exact_location  BOOLEAN NOT NULL DEFAULT false,
  moderation_verdict   TEXT,
  moderation_reason    TEXT,
  moderation_scored_at TIMESTAMPTZ,
  CONSTRAINT listings_pkey PRIMARY KEY (id),
  CONSTRAINT listings_reference_code_key UNIQUE (reference_code),
  CONSTRAINT listings_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT listings_category_check CHECK (category = ANY (ARRAY['re', 'veh', 'hh', 'furn'])),
  CONSTRAINT listings_title_check CHECK (char_length(title) <= 80),
  CONSTRAINT listings_description_check CHECK (char_length(description) <= 1000),
  CONSTRAINT listings_price_check CHECK (price >= 0::numeric),
  CONSTRAINT listings_status_check CHECK (status = ANY (ARRAY['pending', 'active', 'sold', 'expired', 'rejected']))
);

CREATE TABLE public.listing_photos (
  id           UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  listing_id   UUID NOT NULL,
  storage_path TEXT NOT NULL,
  public_url   TEXT NOT NULL,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT listing_photos_pkey PRIMARY KEY (id),
  CONSTRAINT listing_photos_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE
);

CREATE TABLE public.saved_listings (
  id         UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  user_id    UUID NOT NULL,
  listing_id UUID NOT NULL,
  saved_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT saved_listings_pkey PRIMARY KEY (id),
  CONSTRAINT saved_listings_user_id_listing_id_key UNIQUE (user_id, listing_id),
  CONSTRAINT saved_listings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT saved_listings_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE
);

CREATE TABLE public.transactions (
  id             UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  listing_id     UUID NOT NULL,
  buyer_id       UUID NOT NULL,
  seller_id      UUID NOT NULL,
  original_price NUMERIC(12,2) NOT NULL,
  agreed_price   NUMERIC(12,2),
  status         TEXT DEFAULT 'pending',
  buyer_rating   SMALLINT,
  seller_rating  SMALLINT,
  buyer_review   TEXT,
  seller_review  TEXT,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id),
  CONSTRAINT transactions_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.profiles(id),
  CONSTRAINT transactions_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.profiles(id),
  CONSTRAINT transactions_status_check CHECK (status = ANY (ARRAY['pending', 'completed', 'cancelled'])),
  CONSTRAINT transactions_buyer_rating_check CHECK (buyer_rating >= 1 AND buyer_rating <= 5),
  CONSTRAINT transactions_seller_rating_check CHECK (seller_rating >= 1 AND seller_rating <= 5),
  CONSTRAINT transactions_buyer_review_check CHECK (char_length(buyer_review) <= 300),
  CONSTRAINT transactions_seller_review_check CHECK (char_length(seller_review) <= 300)
);

-- Originally "messages" (prototype); renamed by hand, so constraint and
-- index names still say messages_*. Lead columns are migration 004.
CREATE TABLE public.messages_legacy (
  id             UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  listing_id     UUID,
  sender_id      UUID NOT NULL,
  receiver_id    UUID NOT NULL,
  content        TEXT NOT NULL,
  is_read        BOOLEAN DEFAULT false,
  sent_at        TIMESTAMPTZ DEFAULT now(),
  lead_verdict   TEXT,
  lead_scored_at TIMESTAMPTZ,
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE,
  CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT messages_content_check CHECK (char_length(content) <= 500)
);

CREATE TABLE public.feedback (
  id             UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  user_id        UUID,
  type           TEXT NOT NULL,
  description    TEXT NOT NULL,
  screenshot_url TEXT,
  status         TEXT DEFAULT 'new',
  submitted_at   TIMESTAMPTZ DEFAULT now(),
  rating         SMALLINT,
  CONSTRAINT feedback_pkey PRIMARY KEY (id),
  CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT feedback_type_check CHECK (type = ANY (ARRAY['suggestion', 'bug', 'complaint', 'praise'])),
  CONSTRAINT feedback_status_check CHECK (status = ANY (ARRAY['new', 'reviewed', 'resolved'])),
  CONSTRAINT feedback_rating_check CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5))
);

CREATE TABLE public.user_pins (
  id         UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  user_id    UUID NOT NULL,
  label      TEXT NOT NULL,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT user_pins_pkey PRIMARY KEY (id),
  CONSTRAINT user_pins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- Migration 003
CREATE TABLE public.conversations (
  id         UUID NOT NULL DEFAULT gen_random_uuid(),
  listing_id UUID,
  buyer_id   UUID,
  seller_id  UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT conversations_pkey PRIMARY KEY (id),
  CONSTRAINT conversations_listing_id_buyer_id_seller_id_key UNIQUE (listing_id, buyer_id, seller_id),
  CONSTRAINT conversations_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE,
  CONSTRAINT conversations_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.profiles(id),
  CONSTRAINT conversations_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.profiles(id)
);

CREATE TABLE public.chat_messages (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  conversation_id UUID,
  sender_id       UUID,
  content         TEXT,
  message_type    TEXT DEFAULT 'text',
  sent_at         TIMESTAMPTZ DEFAULT now(),
  read_at         TIMESTAMPTZ,
  CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE,
  CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id)
);

-- Migration 006
CREATE TABLE public.listing_reports (
  id          UUID NOT NULL DEFAULT gen_random_uuid(),
  listing_id  UUID,
  reporter_id UUID,
  reason      TEXT NOT NULL,
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT listing_reports_pkey PRIMARY KEY (id),
  CONSTRAINT listing_reports_listing_id_reporter_id_key UNIQUE (listing_id, reporter_id),
  CONSTRAINT listing_reports_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE,
  CONSTRAINT listing_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.profiles(id),
  CONSTRAINT listing_reports_reason_check CHECK (reason = ANY (ARRAY['fake', 'wrong_price', 'spam', 'offensive', 'other'])),
  CONSTRAINT listing_reports_status_check CHECK (status = ANY (ARRAY['open', 'resolved']))
);

-- Migration 009
CREATE TABLE public.report_chat_views (
  id        UUID NOT NULL DEFAULT gen_random_uuid(),
  report_id UUID,
  admin_id  UUID,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT report_chat_views_pkey PRIMARY KEY (id),
  CONSTRAINT report_chat_views_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.listing_reports(id) ON DELETE CASCADE,
  CONSTRAINT report_chat_views_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.profiles(id)
);

-- Migration 008
CREATE TABLE public.grievances (
  id                  UUID NOT NULL DEFAULT gen_random_uuid(),
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  complainant_name    TEXT NOT NULL,
  complainant_contact TEXT,
  note                TEXT NOT NULL,
  acknowledged_at     TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'open',
  resolved_at         TIMESTAMPTZ,
  logged_by           UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT grievances_pkey PRIMARY KEY (id),
  CONSTRAINT grievances_logged_by_fkey FOREIGN KEY (logged_by) REFERENCES public.profiles(id),
  CONSTRAINT grievances_status_check CHECK (status = ANY (ARRAY['open', 'resolved']))
);

-- Migration 014
CREATE TABLE public.audit_log (
  id         BIGSERIAL,
  event_type TEXT NOT NULL,
  user_id    UUID,
  ip_address TEXT,
  user_agent TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Migration 016
CREATE TABLE public.phone_otps (
  id          BIGSERIAL,
  user_id     UUID NOT NULL,
  phone       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    SMALLINT NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT phone_otps_pkey PRIMARY KEY (id),
  CONSTRAINT phone_otps_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Step 4: Indexes (primary key / unique indexes come from the constraints above)
CREATE UNIQUE INDEX uniq_profiles_verified_phone ON public.profiles USING btree (phone) WHERE (phone_verified = true);
CREATE INDEX idx_listings_ll_to_earth ON public.listings USING gist (ll_to_earth(lat, lng));
CREATE INDEX listings_category_idx ON public.listings USING btree (category);
CREATE INDEX listings_location_idx ON public.listings USING gist (location);
CREATE INDEX listings_seller_idx ON public.listings USING btree (seller_id);
CREATE INDEX listings_status_idx ON public.listings USING btree (status);
CREATE INDEX photos_listing_idx ON public.listing_photos USING btree (listing_id);
CREATE INDEX saved_listing_idx ON public.saved_listings USING btree (listing_id);
CREATE INDEX saved_user_idx ON public.saved_listings USING btree (user_id);
CREATE INDEX transactions_buyer_idx ON public.transactions USING btree (buyer_id);
CREATE INDEX transactions_listing_idx ON public.transactions USING btree (listing_id);
CREATE INDEX transactions_seller_idx ON public.transactions USING btree (seller_id);
CREATE INDEX messages_listing_idx ON public.messages_legacy USING btree (listing_id);
CREATE INDEX messages_receiver_idx ON public.messages_legacy USING btree (receiver_id);
CREATE INDEX messages_sender_idx ON public.messages_legacy USING btree (sender_id);
CREATE INDEX messages_sent_at_idx ON public.messages_legacy USING btree (sent_at DESC);
CREATE UNIQUE INDEX one_default_pin_per_user ON public.user_pins USING btree (user_id) WHERE (is_default = true);
CREATE INDEX idx_audit_log_created_at ON public.audit_log USING btree (created_at);
CREATE INDEX idx_audit_log_event_type ON public.audit_log USING btree (event_type);
CREATE INDEX idx_phone_otps_user_created ON public.phone_otps USING btree (user_id, created_at DESC);

-- Step 5: Triggers (incl. the auth.users → profiles row on signup)
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE TRIGGER listings_location_sync BEFORE INSERT OR UPDATE OF lat, lng ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.sync_listing_location();
CREATE TRIGGER listings_updated_at BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Step 6: Row Level Security — enabled on every table. audit_log, grievances,
--   invite_codes, phone_otps and report_chat_views deliberately have NO
--   policies (default-deny; the backend uses the service role).
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_photos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_listings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages_legacy   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_pins         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_reports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_chat_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grievances        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_otps        ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- listings (security audit: public read exposes all rows/columns; UPDATE has no USING)
CREATE POLICY "Allow public read" ON public.listings
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow users to insert their own rows" ON public.listings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Allow users to update their own rows" ON public.listings
  FOR UPDATE TO authenticated WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Sellers can delete own listings" ON public.listings
  FOR DELETE TO authenticated USING (auth.uid() = seller_id);

-- listing_photos
CREATE POLICY "Photos viewable by all logged-in users" ON public.listing_photos
  FOR SELECT TO authenticated USING (auth.role() = 'authenticated'::text);
CREATE POLICY "Sellers can manage photos for own listings" ON public.listing_photos
  FOR ALL TO authenticated
  USING (auth.uid() = (SELECT listings.seller_id FROM public.listings WHERE listings.id = listing_photos.listing_id))
  WITH CHECK (auth.uid() = (SELECT listings.seller_id FROM public.listings WHERE listings.id = listing_photos.listing_id));

-- saved_listings
CREATE POLICY "Users can manage own saved listings" ON public.saved_listings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- transactions
CREATE POLICY "Users can insert transactions" ON public.transactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "Users can read own transactions" ON public.transactions
  FOR SELECT TO authenticated USING ((auth.uid() = buyer_id) OR (auth.uid() = seller_id));
CREATE POLICY "Users can update own transactions" ON public.transactions
  FOR UPDATE TO authenticated USING ((auth.uid() = buyer_id) OR (auth.uid() = seller_id));

-- messages_legacy
CREATE POLICY "Users can delete own messages" ON public.messages_legacy
  FOR DELETE TO authenticated USING (auth.uid() = sender_id);
CREATE POLICY "Users can insert messages" ON public.messages_legacy
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users can read own messages" ON public.messages_legacy
  FOR SELECT TO authenticated USING ((auth.uid() = sender_id) OR (auth.uid() = receiver_id));

-- feedback
CREATE POLICY "Users can submit and view own feedback" ON public.feedback
  FOR ALL TO authenticated
  USING ((auth.uid() = user_id) OR (user_id IS NULL))
  WITH CHECK ((auth.uid() = user_id) OR (user_id IS NULL));

-- user_pins
CREATE POLICY "Allow users to update their own rows" ON public.user_pins
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own pins" ON public.user_pins
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- conversations (roles = public in production, i.e. no TO clause)
CREATE POLICY "Buyers can start a conversation on a listing" ON public.conversations
  FOR INSERT
  WITH CHECK ((auth.uid() = buyer_id) AND (buyer_id <> seller_id)
              AND (seller_id = (SELECT listings.seller_id FROM public.listings WHERE listings.id = conversations.listing_id)));
CREATE POLICY "Participants can view their conversations" ON public.conversations
  FOR SELECT USING ((auth.uid() = buyer_id) OR (auth.uid() = seller_id));

-- chat_messages (roles = public)
CREATE POLICY "Participants can send messages in their conversations" ON public.chat_messages
  FOR INSERT
  WITH CHECK ((auth.uid() = sender_id) AND (EXISTS (SELECT 1 FROM public.conversations c
              WHERE c.id = chat_messages.conversation_id AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid()))));
CREATE POLICY "Participants can view messages in their conversations" ON public.chat_messages
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.conversations c
         WHERE c.id = chat_messages.conversation_id AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())));
CREATE POLICY "Recipients can mark messages as read" ON public.chat_messages
  FOR UPDATE
  USING ((sender_id <> auth.uid()) AND (EXISTS (SELECT 1 FROM public.conversations c
         WHERE c.id = chat_messages.conversation_id AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid()))))
  WITH CHECK ((sender_id <> auth.uid()) AND (EXISTS (SELECT 1 FROM public.conversations c
              WHERE c.id = chat_messages.conversation_id AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid()))));

-- listing_reports (roles = public)
CREATE POLICY "listing_reports_insert_own" ON public.listing_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "listing_reports_update_own" ON public.listing_reports
  FOR UPDATE USING (auth.uid() = reporter_id);

-- Step 7: Migration 017 — clients may read but never write profiles
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles FROM anon, authenticated;

-- Step 8: Radius RPC (migration 013)
CREATE OR REPLACE FUNCTION public.listings_within_radius(user_lat double precision, user_lng double precision, radius_m double precision)
 RETURNS TABLE(id uuid, distance_m double precision)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    listings.id,
    earth_distance(ll_to_earth(user_lat, user_lng), ll_to_earth(listings.lat, listings.lng)) AS distance_m
  FROM listings
  WHERE status = 'active'
    AND earth_box(ll_to_earth(user_lat, user_lng), radius_m) @> ll_to_earth(listings.lat, listings.lng)
    AND earth_distance(ll_to_earth(user_lat, user_lng), ll_to_earth(listings.lat, listings.lng)) <= radius_m
  ORDER BY distance_m;
$function$;

-- Step 9: Realtime (chat) and Storage (public photo bucket; uploads go
--   through the backend's service role, so no storage policies — as in production)
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
INSERT INTO storage.buckets (id, name, public) VALUES ('listing-photos', 'listing-photos', true);

COMMIT;

-- Step 10: Verify — run database/scripts/session-9k-schema-inventory.sql on
--   mapit-uat, save as C:\dev\schema-uat.json, and compare with
--   C:\dev\schema-live.json (only generated_at should differ).
