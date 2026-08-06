-- Migration 013: listings_within_radius RPC — DB-side radius filtering
-- Fixes Rule 9 known gap: the backend fetched every active listing and
--   filtered by radius in JS (src/routes/listings.js haversineM()) instead
--   of using this RPC, because the RPC's old definition hardcoded an
--   explicit RETURNS TABLE column list that predated `subcategory` being
--   added to `listings` — any new column silently never reached the
--   frontend when the RPC was used, which is why it was abandoned rather
--   than fixed at the time.
-- Run in: Supabase SQL Editor (uat project first, then production)
-- Description: Redefines listings_within_radius to return ONLY (id,
--   distance_m) instead of full rows. The backend now does the radius
--   query via this RPC, then a plain `SELECT * ... IN (ids)` for the full
--   rows — same pattern already used everywhere else in listings.js, so
--   subcategory and every future column are included automatically and
--   this class of bug can't recur. Uses the built-in `cube`/`earthdistance`
--   contrib extensions (no PostGIS geography column needed — `lat`/`lng`
--   stay plain FLOAT columns, unchanged) with a GiST index for an index
--   scan instead of a sequential scan as the listings table grows (Rule 10).
--
-- Not currently called by any other code (confirmed via repo-wide grep) —
-- safe to redefine outright rather than version as a new function name.

CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;

-- Drop every existing overload of listings_within_radius first. Postgres
-- identifies functions by name + parameter TYPES, not just name — the old
-- function's radius_m was `integer`, so `CREATE OR REPLACE FUNCTION` below
-- (with radius_m as `double precision`) added a second overload instead of
-- replacing it, leaving PostgREST unable to pick between the two ("Could
-- not choose the best candidate function", PGRST203). This loop removes
-- every signature named listings_within_radius before recreating the one
-- true version, so reruns of this migration stay idempotent regardless of
-- what the old signature was.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = 'listings_within_radius'
  LOOP
    EXECUTE format('DROP FUNCTION %s', r.sig);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION listings_within_radius(
  user_lat  double precision,
  user_lng  double precision,
  radius_m  double precision
)
RETURNS TABLE(id uuid, distance_m double precision)
LANGUAGE sql
STABLE
AS $$
  SELECT
    listings.id,
    earth_distance(ll_to_earth(user_lat, user_lng), ll_to_earth(listings.lat, listings.lng)) AS distance_m
  FROM listings
  WHERE status = 'active'
    AND earth_box(ll_to_earth(user_lat, user_lng), radius_m) @> ll_to_earth(listings.lat, listings.lng)
    AND earth_distance(ll_to_earth(user_lat, user_lng), ll_to_earth(listings.lat, listings.lng)) <= radius_m
  ORDER BY distance_m;
$$;

CREATE INDEX IF NOT EXISTS idx_listings_ll_to_earth ON listings USING gist (ll_to_earth(lat, lng));

-- Verify:
-- SELECT * FROM listings_within_radius(12.9351, 77.6146, 5000) LIMIT 5;
-- EXPLAIN ANALYZE SELECT * FROM listings_within_radius(12.9351, 77.6146, 5000);
--   (confirm "Index Scan using idx_listings_ll_to_earth", not "Seq Scan" — Rule 10)
