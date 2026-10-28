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

module.exports = { LISTING_EXPIRY_ENABLED };
