// ============================================================
// Review queue reject reasons (Session 9L, plan section 6, decision D4)
// One list for the server check, the /review page (sent via GET /api/review/me)
// and the seller's "Not approved" text. Add or reword here — no migration:
// listing_reviews stores the code, listings.rejection_reason stores the label.
// ============================================================
const REJECT_REASONS = [
  { code: 'contact_info',   label: 'Phone number, email or links in the title or description' },
  { code: 'photos',         label: 'Photos missing, unclear or not of the item' },
  { code: 'wrong_category', label: 'Wrong category' },
  { code: 'price',          label: 'Price missing or unrealistic' },
  { code: 'location',       label: 'Location looks wrong' },
  { code: 'duplicate',      label: 'Duplicate of another listing' },
  { code: 'misleading',     label: 'Details are incomplete or misleading' },
  { code: 'prohibited',     label: 'This item is not allowed on MapIt' },
  { code: 'other',          label: 'Other', noteRequired: true },
];

// Notes (reject reason or approve note) are shown to the seller.
const REVIEW_NOTE_MAX = 300;   // = listing_reviews_note_check (migration 019)

module.exports = { REJECT_REASONS, REVIEW_NOTE_MAX };
