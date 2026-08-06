// ============================================================
// Geo helpers shared across routes/utils (listings radius filter,
// POI proximity lookup).
// ============================================================

// Haversine distance in metres between two lat/lng points
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Deterministic 0..1 float from a string, via a simple djb2-style hash.
// Used to derive the fuzz offset below — not cryptographic, just needs to
// be stable for the same input and roughly uniform.
function _hashToUnitFloat(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash / 4294967295;
}

// Computes a fuzzed "display" point 150-400m from the real (lat, lng),
// deterministically seeded by `seed` (the listing id) so the same listing
// always fuzzes to the same point. Call once at listing-creation time and
// store the result — do NOT call this per-request/per-page-load, since a
// point that re-randomizes on every view can be triangulated back to the
// real location by comparing multiple views.
function fuzzLocation(lat, lng, seed) {
  const angle = _hashToUnitFloat(`${seed}:angle`) * 2 * Math.PI;
  const distanceM = 150 + _hashToUnitFloat(`${seed}:dist`) * 250;
  const dLat = (distanceM * Math.cos(angle)) / 111320;
  const dLng = (distanceM * Math.sin(angle)) / (111320 * Math.cos(lat * Math.PI / 180));
  return { lat: lat + dLat, lng: lng + dLng };
}

module.exports = { haversineM, fuzzLocation };
