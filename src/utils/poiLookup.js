// ============================================================
// POI Proximity — nearest school / mall / supermarket lookup via
// OpenStreetMap's Overpass API (free, no key). Fire-and-forget after
// listing creation: same rationale/shape as leadScoring.js and
// email.js — a single network call, raw fetch, fail open on any error
// so it can never block or fail listing creation.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { haversineM }    = require('./geo');

const OVERPASS_URL   = 'https://overpass-api.de/api/interpreter';
const SEARCH_RADIUS_M = 2000;
const TIMEOUT_MS      = 8000; // background path, but Overpass can be slow — keep it tight

const POI_TYPES = [
  { type: 'school',      tag: 'amenity=school' },
  { type: 'mall',        tag: 'shop=mall' },
  { type: 'supermarket', tag: 'shop=supermarket' },
];

function buildQuery(lat, lng) {
  const clauses = POI_TYPES.map(({ tag }) => {
    const [k, v] = tag.split('=');
    return `node["${k}"="${v}"](around:${SEARCH_RADIUS_M},${lat},${lng});
      way["${k}"="${v}"](around:${SEARCH_RADIUS_M},${lat},${lng});`;
  }).join('\n');
  return `[out:json][timeout:7];(${clauses});out center;`;
}

// Resolves the nearest *named* element per POI type from Overpass's raw
// `elements` array. Unnamed nodes (very common in OSM for shops/schools)
// aren't useful to show a buyer, so they're skipped entirely.
function nearestPerType(elements, lat, lng) {
  const results = [];
  for (const { type, tag } of POI_TYPES) {
    const [k, v] = tag.split('=');
    let best = null;
    for (const el of elements) {
      if (el.tags?.[k] !== v) continue;
      const name = el.tags?.name;
      if (!name) continue;
      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon ?? el.center?.lon;
      if (elLat == null || elLng == null) continue;
      const distance_m = Math.round(haversineM(lat, lng, elLat, elLng));
      if (!best || distance_m < best.distance_m) best = { type, name, distance_m };
    }
    if (best) results.push(best);
  }
  return results;
}

// Never throws — any failure (timeout, network error, non-2xx, empty/
// malformed response) resolves to an empty array so the caller can
// always proceed without special-casing errors.
async function fetchNearbyPois(lat, lng) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // Overpass's public instance 406s requests without an explicit Accept
        // and a non-default User-Agent (Node's default fetch UA gets rejected).
        'Accept': 'application/json',
        'User-Agent': 'MapIt/1.0 (mapit.co.in)',
      },
      body: 'data=' + encodeURIComponent(buildQuery(lat, lng)),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`Overpass API error ${res.status}`);
      return [];
    }

    const data = await res.json();
    if (!Array.isArray(data.elements)) return [];
    return nearestPerType(data.elements, lat, lng);
  } catch (err) {
    console.error('POI lookup failed:', err.message);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Looks up nearby POIs and merges them into the listing's existing
// `details` JSONB (re-fetched here, not the caller's in-memory copy, so
// this never clobbers dynamic category fields written at creation time).
async function lookupAndStoreNearbyPois(listingId, lat, lng) {
  const nearby_pois = await fetchNearbyPois(lat, lng);
  if (!nearby_pois.length) return; // nothing found within radius — leave details untouched

  const { data: current, error: fetchErr } = await supabaseAdmin
    .from('listings')
    .select('details')
    .eq('id', listingId)
    .single();
  if (fetchErr || !current) {
    console.error('POI lookup: could not re-fetch listing details before merge:', fetchErr?.message);
    return;
  }

  const { error: updateErr } = await supabaseAdmin
    .from('listings')
    .update({ details: { ...(current.details || {}), nearby_pois } })
    .eq('id', listingId);
  if (updateErr) console.error('POI lookup: failed to store nearby_pois:', updateErr.message);
}

module.exports = { lookupAndStoreNearbyPois };
