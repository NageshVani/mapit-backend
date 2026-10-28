// ============================================================
// Listing alerts — email the shared admin mailbox (Zoho group
// listings@mapit.co.in, 2026-10-21) whenever a listing enters the review
// queue: a NEW listing (POST /api/listings) or an UPDATED one (PUT
// /api/listings/:id — every owner edit re-submits for review).
//
// Runs AI content moderation first so the email can say clean / flagged,
// then persists the verdict and sends the alert. Same fire-and-forget
// contract as notifySeller.js: never throws, never blocks the seller.
// No seller PII (name, phone, email) in the email — Rule 8; the admin
// page shows the seller.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { sendEmail, escapeHtml } = require('./email');
const { scoreListing } = require('./contentModeration');

const CATEGORY_LABELS = { re: 'Real Estate', veh: 'Vehicles', hh: 'Household', furn: 'Furniture (legacy)', electronics: 'Electronics' };

// Human labels for the "What changed" line on UPDATED alerts.
const FIELD_LABELS = {
  title: 'Title', description: 'Description', price: 'Price', price_label: 'Price label',
  address: 'Address', specs: 'Specs', details: 'Details', category: 'Category',
  subcategory: 'Subcategory', lat: 'Map pin', lng: 'Map pin',
  show_exact_location: 'Exact pin setting',
};

// The admin page of the environment that sent the alert — a UAT alert
// must never send you to the production admin page.
function adminUrl() {
  if (process.env.VERCEL_ENV === 'production') return 'https://www.mapit.co.in/admin.html';
  if (process.env.VERCEL_ENV === 'preview')    return 'https://uat.mapit.co.in/admin.html';
  return `http://localhost:${process.env.PORT || 3001}/admin.html`;
}

// The post form stores the short price ("₹1.2L") in price_label — only
// append labels that add something (legacy "/month", "Negotiable").
const fmtPrice = (price, label) => {
  const n = Number(price) || 0;
  const amount = n > 0 ? `₹${n.toLocaleString('en-IN')}` : 'No price';
  return label && !label.trim().startsWith('₹') ? `${amount} ${label}` : amount;
};

// Subjects are plain text (not HTML) — strip line breaks so seller text
// can't inject extra mail headers, and keep the subject short for phones.
const subjectSafe = s => String(s || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 60);

// Which fields an owner edit actually changed (the edit form re-sends every
// field, so compare values, not keys). Returns unique human labels.
function changedFields(before, updates) {
  const labels = new Set();
  for (const [field, next] of Object.entries(updates)) {
    if (!FIELD_LABELS[field]) continue;
    const prev = before[field];
    const same = (field === 'lat' || field === 'lng' || field === 'price')
      ? Number(prev) === Number(next)
      : JSON.stringify(prev ?? null) === JSON.stringify(next ?? null);
    if (!same) labels.add(FIELD_LABELS[field]);
  }
  return [...labels];
}

// ── Send the alert email ─────────────────────────────────────
// kind: 'new' | 'updated'. `before` (updated only) = the row as it was.
async function sendListingAlert(listing, kind, { verdict, reason, before } = {}) {
  const to = process.env.LISTINGS_NOTIFY_EMAIL;
  if (!to) { // UAT/local default: no alerts — say so, a silent skip looks like a bug
    console.info('LISTINGS_NOTIFY_EMAIL not set — listing alert skipped');
    return;
  }

  const isNew     = kind === 'new';
  const flagged   = verdict === 'flagged';
  const wasLive   = !isNew && before?.status === 'active';
  const category  = CATEGORY_LABELS[listing.category] || listing.category;
  const ref       = listing.reference_code || listing.id.slice(0, 8);
  const changes   = isNew ? [] : changedFields(before || {}, listing);

  // Subject starts with NEW / UPDATED so the inbox list tells them apart
  // at a glance; FLAGGED goes first because it needs a closer look.
  const subject = [
    flagged ? '⚠️ FLAGGED ·' : '',
    isNew ? '🆕 NEW listing' : `✏️ UPDATED listing${wasLive ? ' (was live)' : ''}`,
    `— "${subjectSafe(listing.title)}" · ${category} · ${ref}`,
  ].filter(Boolean).join(' ');

  const verdictLine = {
    clean:      '✅ AI check: looks clean',
    flagged:    `⚠️ AI check: flagged — ${escapeHtml(reason || 'no reason given')}`,
    unscreened: '➖ AI check: not run (review manually)',
  }[verdict] || '➖ AI check: not run (review manually)';

  const row = (label, value) => value
    ? `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;white-space:nowrap;">${label}</td><td style="padding:4px 0;">${value}</td></tr>`
    : '';

  const banner = isNew
    ? `<p style="margin:0 0 12px;padding:8px 12px;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:6px;color:#065f46;"><strong>🆕 New listing</strong> waiting for review.</p>`
    : `<p style="margin:0 0 12px;padding:8px 12px;background:#eff6ff;border:1px solid #93c5fd;border-radius:6px;color:#1e40af;"><strong>✏️ Updated listing</strong> waiting for review.${wasLive ? ' It was <strong>live</strong> and is now hidden from buyers until re-approved.' : ''}</p>`;

  const description = listing.description
    ? escapeHtml(listing.description.length > 300 ? listing.description.slice(0, 300) + '…' : listing.description).replace(/\n/g, '<br>')
    : '';

  await sendEmail({
    to,
    subject,
    html: `
      ${banner}
      <table style="border-collapse:collapse;font-size:14px;">
        ${row('Title', `<strong>${escapeHtml(listing.title)}</strong>`)}
        ${row('Category', `${escapeHtml(category)} · ${escapeHtml(listing.subcategory || '')}`)}
        ${row('Price', escapeHtml(fmtPrice(listing.price, listing.price_label)))}
        ${row('Area', listing.address ? escapeHtml(listing.address) : '')}
        ${row('Reference', escapeHtml(ref))}
        ${row('What changed', changes.length ? escapeHtml(changes.join(', ')) : (isNew ? '' : 'No field changes detected (re-saved)'))}
        ${row('Moderation', verdictLine)}
      </table>
      ${description ? `<blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #f06030;color:#444;">${description}</blockquote>` : ''}
      <p style="margin:16px 0;"><a href="${adminUrl()}" style="background:#f06030;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold;">Open admin to review</a></p>
      <p style="color:#888;font-size:12px;">Sent to listings@mapit.co.in — reply in Streams ("approved ✓") so the other person knows it's handled. Sellers are promised review within 4 hours.</p>
    `,
  });
}

// ── Moderate, persist the verdict, then alert ────────────────
// Fire-and-forget: the caller wraps this in waitUntil() and never awaits it.
// Never throws. `before` = the row before an edit (updated only); when the
// edit didn't touch title/description, the stored verdict is reused instead
// of paying for a fresh AI check.
async function moderateAndAlert(listing, kind, before) {
  let verdict, reason;
  try {
    const textChanged = kind === 'new'
      || before?.title !== listing.title
      || (before?.description ?? null) !== (listing.description ?? null)
      || !before?.moderation_verdict;

    if (textChanged) {
      ({ verdict, reason } = await scoreListing(listing.title, listing.description));
      // Single awaited call in try/catch — never a chained .catch() on a
      // Supabase builder (see the 64cfdff note in notifySeller.js).
      try {
        const { error } = await supabaseAdmin
          .from('listings')
          .update({ moderation_verdict: verdict, moderation_reason: reason, moderation_scored_at: new Date().toISOString() })
          .eq('id', listing.id);
        if (error) console.error('Moderation verdict persist failed:', error.message);
      } catch (err) {
        console.error('Moderation verdict persist failed:', err.message);
      }
    } else {
      verdict = before.moderation_verdict;
      reason  = before.moderation_reason;
    }
  } catch (err) {
    console.error('Content moderation pipeline failed:', err.message);
    verdict = 'unscreened';
  }

  try {
    await sendListingAlert(listing, kind, { verdict, reason, before });
  } catch (err) {
    // Listing id only — never seller details (Rule 8).
    console.error(`Listing alert email failed (${listing.id}):`, err.message);
  }
}

module.exports = { moderateAndAlert, sendListingAlert, changedFields };
