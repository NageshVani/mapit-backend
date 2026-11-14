// ============================================================
// Review queue reasons (Session 9L, plan section 6, decisions D4 + D11)
// One list for the server check, the /review page (sent via GET /api/review/me)
// and the seller's text. Add or reword here, based on real feedback — no
// migration: listing_reviews stores the code, listings.rejection_reason stores
// the sentence the seller sees. Codes must be unique across both groups.
//   group 'change' → "Needs change" button: fixable, seller edits + resubmits
//   group 'reject' → "Reject" button: not acceptable on MapIt
// Both keep listings.status = 'rejected' (option A, no new status); the
// group is derived from the reason code.
// ============================================================
const REVIEW_REASONS = [
  { group: 'change', code: 'photos',         label: 'Photos don\'t match the item or category' },
  { group: 'change', code: 'wrong_category', label: 'Wrong category' },
  { group: 'change', code: 'price',          label: 'Price missing or unrealistic' },
  { group: 'change', code: 'location',       label: 'Location looks wrong' },
  { group: 'change', code: 'contact_info',   label: 'Phone number, email or links in the title or description' },
  { group: 'change', code: 'misleading',     label: 'Details are incomplete or misleading' },
  { group: 'change', code: 'other_change',   label: 'Other', noteRequired: true },
  { group: 'reject', code: 'prohibited',     label: 'This item is not allowed on MapIt' },
  { group: 'reject', code: 'duplicate',      label: 'Duplicate of another listing' },
  { group: 'reject', code: 'spam',           label: 'Looks like spam or a fake listing' },
  { group: 'reject', code: 'other',          label: 'Other', noteRequired: true },
];

// Heading the seller sees in My Listings (and the part 2 email). The page
// reads the label from this prefix (reviewOutcome() in MapIt_MVP_v1.html):
// reword a heading there too, or old + new listings show "Not live".
const GROUP_HEADINGS = { change: 'Needs a small change', reject: 'Not approved' };

// Notes are shown to the seller.
const REVIEW_NOTE_MAX = 300;   // = listing_reviews_note_check (migration 019)

module.exports = { REVIEW_REASONS, GROUP_HEADINGS, REVIEW_NOTE_MAX };
