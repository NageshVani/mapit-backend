// ============================================================
// Bangalore Areas — curated locality list for bucketing free-text
// listing addresses into a region for the admin Overview chart.
// This is the "curated Bangalore-areas database" stretch goal originally
// flagged and deferred in Session 04C (home-location text search) —
// closed out here since the Overview region chart needed it anyway.
// ============================================================
const BANGALORE_AREAS = [
  'Koramangala', 'Indiranagar', 'Whitefield', 'HSR Layout', 'Jayanagar',
  'JP Nagar', 'BTM Layout', 'Marathahalli', 'Electronic City', 'Banashankari',
  'Malleshwaram', 'Basavanagudi', 'Yelahanka', 'Hebbal', 'Bellandur',
  'Sarjapur', 'Kammanahalli', 'RT Nagar', 'Vijayanagar', 'Rajajinagar',
  'Frazer Town', 'Ulsoor', 'Domlur', 'CV Raman Nagar', 'Kalyan Nagar',
  'Yeshwanthpur', 'Peenya', 'Hennur',
];

// First matching area name wins (case-insensitive substring match against
// the free-text address); falls back to 'Other' if nothing matches.
function bucketAddress(address) {
  if (!address) return 'Other';
  const lower = address.toLowerCase();
  const hit = BANGALORE_AREAS.find(area => lower.includes(area.toLowerCase()));
  return hit || 'Other';
}

module.exports = { BANGALORE_AREAS, bucketAddress };
