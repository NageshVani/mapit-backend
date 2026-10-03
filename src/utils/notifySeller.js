// ============================================================
// Seller notification on buyer interest — shared by messages.js
// (legacy one-tap flow) and conversations.js (real chat, Session 6)
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { sendEmail, escapeHtml } = require('./email');
const { scoreLead } = require('./leadScoring');

// ── Notify seller by email on a buyer's first message on a listing ────
// Fire-and-forget: called without await from scoreAndNotify() below. A Resend
// outage or missing RESEND_API_KEY must never fail the message send.
// `verdict` only changes cosmetic wording — the email always sends regardless.
// Only 'spam' adds the warning banner + subject prefix (Option C, 2026-10-03).
async function notifySellerOfInterest(listing, buyerId, messageContent, verdict = 'unscreened') {
  const [{ data: sellerAuth }, { data: buyerProfile }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(listing.seller_id),
    supabaseAdmin.from('profiles').select('nickname').eq('id', buyerId).single(),
  ]);

  const sellerEmail = sellerAuth?.user?.email;
  if (!sellerEmail) return;

  const buyerName = escapeHtml(buyerProfile?.nickname || 'A buyer');
  const title     = escapeHtml(listing.title);

  // Warn only on a positive 'spam' verdict. 'unscreened' (no key, timeout,
  // API error) stays silent — a warning on every email teaches sellers to ignore it.
  const isSpam = verdict === 'spam';
  const flagBanner = isSpam
    ? `<p style="margin:0 0 8px;padding:6px 10px;background:#fff7ed;border:1px solid #fdba74;border-radius:6px;color:#9a3412;font-size:12px;">⚠️ This message looks like possible spam — review it carefully before sharing any personal details.</p>`
    : '';
  const subjectPrefix = isSpam ? '[Possible spam] ' : '';

  await sendEmail({
    to:      sellerEmail,
    subject: `${subjectPrefix}${buyerName} is interested in your listing "${title}"`,
    html: `
      <p>Hi,</p>
      ${flagBanner}
      <p><strong>${buyerName}</strong> is interested in your MapIt listing <strong>"${title}"</strong>:</p>
      <blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #f06030;color:#444;">${escapeHtml(messageContent)}</blockquote>
      <p><a href="https://www.mapit.co.in">Open MapIt</a> to reply.</p>
      <p style="color:#888;font-size:12px;">You're receiving this because someone messaged you about your listing on MapIt.</p>
    `,
  });
}

// ── Score a buyer's note for spam/genuine, optionally persist the verdict, then notify ──
// Fire-and-forget: called without await from the caller. Never throws — a
// scoring/DB/email hiccup here must never surface to the buyer's request.
// `persistVerdict(verdict)` is optional — the legacy `messages` table has
// `lead_verdict`/`lead_scored_at` columns to persist to; `chat_messages`
// (Session 6) does not, so conversations.js omits it and the verdict is
// only used to word the email.
async function scoreAndNotify(listing, buyerId, messageContent, persistVerdict) {
  const { verdict } = await scoreLead(messageContent);

  if (persistVerdict) {
    // Single awaited call inside try/catch — NOT a chained .catch() on a
    // Supabase builder (that anti-pattern crashed every buyer's first message
    // in the bug fixed at commit 64cfdff; builders only implement .then()).
    try {
      await persistVerdict(verdict);
    } catch (err) {
      console.error('Lead verdict persist failed:', err.message);
    }
  }

  await notifySellerOfInterest(listing, buyerId, messageContent, verdict);
}

module.exports = { notifySellerOfInterest, scoreAndNotify };
