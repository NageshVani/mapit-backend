// ============================================================
// Public listing address = the AREA name only (pre-listing audit,
// 2026-10-24). The post form used to send "<seller's saved-location
// label> · Bangalore", so buyers saw e.g. "Home · Bangalore" — a private
// label made public — and every edit appended another " · Bangalore".
// The server now ignores the client's address and derives
// "<neighbourhood>, <city>" from the pin the buyer sees (the fuzzed
// display point unless the seller chose to show the exact pin), so the
// area name can't hint at which side of the fuzz the real spot is.
//
// OpenStreetMap Nominatim: free, no key; its usage policy needs an
// identifying User-Agent and ≤ 1 request/second (listing saves are rare).
// Never throws — a failed lookup falls back to the city name, so saving
// a listing never fails because of it.
// ============================================================
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const TIMEOUT_MS = 3000;
const FALLBACK = 'Bengaluru';

// "Koramangala 4th Block, Bengaluru 560034". The PIN code disambiguates
// small neighbourhood names that repeat across the city (Yelahanka has its
// own "Gandhinagar"); a PIN area spans several km², so it reveals no more
// than the 150–400 m fuzz.
function formatArea(a = {}) {
  const area = a.neighbourhood || a.quarter || a.suburb || a.village || a.town || a.city_district;
  const city = a.city || a.town || a.county || a.state_district;
  const parts = [area, city].filter(Boolean).filter((p, i, arr) => arr.indexOf(p) === i);
  if (!parts.length) return FALLBACK;
  const pin = /^\d{6}$/.test(a.postcode || '') ? ' ' + a.postcode : '';
  return parts.join(', ') + pin;
}

async function areaName(lat, lng) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${NOMINATIM_URL}?lat=${lat}&lon=${lng}&format=jsonv2&zoom=16&addressdetails=1&accept-language=en`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MapIt/1.0 (mapit.co.in)', 'Accept': 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) { console.error(`Nominatim reverse error ${res.status}`); return FALLBACK; }
    const data = await res.json();
    return formatArea(data.address);
  } catch (err) {
    console.error('Area name lookup failed:', err.message);
    return FALLBACK;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { areaName, formatArea };
