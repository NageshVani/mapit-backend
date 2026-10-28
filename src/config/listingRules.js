// ============================================================
// Listing rules shared by routes and /api/config (the page reads the
// same values from there, so there is one switch, not two copies).
// ============================================================

// 30-day listing expiry — OFF for now (seller feedback FB-06, 2026-10-28).
// While false: browse ignores expires_at, admin Cleanup lists no "stale"
// listings, and My Listings hides the expiry label + Renew button.
// expires_at is still written (approval / renew) so the data stays meaningful.
// Before turning this back on, push expires_at forward for active listings,
// or every listing older than 30 days disappears at once (plan with 9H).
const LISTING_EXPIRY_ENABLED = false;

// Real Estate types that can only be rented (PG, feedback FB-04, 2026-10-28).
// The page greys out "Sell" for these; the server is the real rule and stores
// details.transaction_type = 'Rent' whatever the client sent.
// Keep in sync with RENT_ONLY_SUBCATS in MapIt_MVP_v1.html.
const RENT_ONLY_SUBCATEGORIES = ['PG'];

function enforceRentOnly(category, subcategory, details) {
  if (category !== 're' || !RENT_ONLY_SUBCATEGORIES.includes(subcategory)) return details;
  const d = details && typeof details === 'object' && !Array.isArray(details) ? details : {};
  return { ...d, transaction_type: 'Rent' };
}

// Detail fields a subcategory must have (Nagesh 2026-10-28). The page marks
// them required:true in LISTING_FIELDS; keep the two in sync.
const REQUIRED_DETAILS = {
  're/PG': { total_price: 'Monthly Rent per Bed', pg_for: 'PG For', meals: 'Meals Included', food_type: 'Food Type' },
};

// Returns the label of the first missing required field, or null.
function missingRequiredDetail(category, subcategory, details) {
  const req = REQUIRED_DETAILS[`${category}/${subcategory}`];
  if (!req) return null;
  const d = details && typeof details === 'object' ? details : {};
  const id = Object.keys(req).find(k => !String(d[k] ?? '').trim());
  return id ? req[id] : null;
}

module.exports = { LISTING_EXPIRY_ENABLED, RENT_ONLY_SUBCATEGORIES, enforceRentOnly, missingRequiredDetail };
