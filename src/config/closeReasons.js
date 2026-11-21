// ============================================================
// Close reasons (Release 10C, Nagesh 2026-11-15 / 2026-11-21)
// Why a listing left the map. One list for the server check, the page
// (sent via GET /api/config → closeReasons) and listing_close_reasons
// (migration 022 stores the CODE only — no free text, so no PII).
// Add or reword here — no migration. Codes must be unique across groups and
// match listing_close_reasons_reason_check: ^[a-z][a-z_]{1,39}$.
// A reason is REQUIRED for every close (Nagesh 2026-11-21).
//   group 'sold'    → seller taps ✅ Sold          → action 'sold'
//   group 'deleted' → seller deletes own listing  → action 'deleted'
//   group 'admin'   → admin removes someone else's listing → action 'admin_removed'
//     admin_report_removed / admin_cleanup are filled in by the server
//     (report "Remove listing", Cleanup bulk delete) — auto: true, never
//     offered in a dropdown.
// ============================================================
const CLOSE_REASONS = [
  { group: 'sold',    code: 'sold_on_mapit',        label: 'Sold on MapIt' },
  { group: 'sold',    code: 'sold_elsewhere',       label: 'Sold elsewhere (another website or app)' },
  { group: 'sold',    code: 'sold_offline',         label: 'Sold offline (friends, family, walk-in)' },

  { group: 'deleted', code: 'no_longer_selling',    label: 'No longer selling' },
  { group: 'deleted', code: 'posted_by_mistake',    label: 'Posted by mistake' },
  { group: 'deleted', code: 'wrong_details_repost', label: 'Wrong details, will re-post' },
  { group: 'deleted', code: 'too_many_calls_spam',  label: 'Too many calls or spam' },
  { group: 'deleted', code: 'other',                label: 'Other' },

  { group: 'admin',   code: 'admin_spam_or_fake',   label: 'Spam or fake listing' },
  { group: 'admin',   code: 'admin_against_rules',  label: 'Against MapIt rules' },
  { group: 'admin',   code: 'admin_seller_asked',   label: 'Seller asked us to remove it' },
  { group: 'admin',   code: 'admin_other',          label: 'Other' },
  { group: 'admin',   code: 'admin_report_removed', label: 'Removed after a user report', auto: true },
  { group: 'admin',   code: 'admin_cleanup',        label: 'Removed in admin Cleanup',    auto: true },
];

const ACTION_OF_GROUP = { sold: 'sold', deleted: 'deleted', admin: 'admin_removed' };

// True when `code` is a reason a person may pick for this group.
function isValidCloseReason(group, code) {
  return CLOSE_REASONS.some(r => r.group === group && r.code === code && !r.auto);
}

// What the page needs: pickable reasons per group, { code, label } only.
function closeReasonsForPage() {
  const out = { sold: [], deleted: [], admin: [] };
  for (const r of CLOSE_REASONS) if (!r.auto) out[r.group].push({ code: r.code, label: r.label });
  return out;
}

// Write one listing_close_reasons row BEFORE the close (so every close has a
// reason). Returns the new row id, or throws — the caller then stops and the
// listing stays as it was. `listing` needs id, seller_id, category, subcategory.
async function recordCloseReason(supabaseAdmin, listing, { group, reason, closedBy }) {
  const { data, error } = await supabaseAdmin
    .from('listing_close_reasons')
    .insert({
      listing_id:  listing.id,
      seller_id:   listing.seller_id || null,
      closed_by:   closedBy || null,
      category:    listing.category,
      subcategory: listing.subcategory || null,
      action:      ACTION_OF_GROUP[group],
      reason,
    })
    .select('id')
    .single();
  if (error) throw new Error(`close reason not saved: ${error.message}`);
  return data.id;
}

// The close itself failed after the reason was written → remove that row so
// the numbers only count real closes. Best-effort (logged, never thrown).
async function undoCloseReason(supabaseAdmin, rowId) {
  if (!rowId) return;
  const { error } = await supabaseAdmin.from('listing_close_reasons').delete().eq('id', rowId);
  if (error) console.error('Close reason undo failed:', error.message);
}

module.exports = { CLOSE_REASONS, isValidCloseReason, closeReasonsForPage, recordCloseReason, undoCloseReason };
