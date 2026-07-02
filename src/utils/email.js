// ============================================================
// Email — thin wrapper around the Resend REST API
// No SDK dependency: Node 18+ (our Vercel runtime) has global fetch,
// and Resend's send call is a single POST — an SDK buys us nothing here.
// ============================================================
const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM = `${process.env.EMAIL_FROM_NAME || 'MapIt'} <noreply@mapit.co.in>`;

// sendEmail() never throws for a missing key — callers use this in
// fire-and-forget paths where a misconfigured/unavailable email service
// must never break the feature (message send, listing post, etc).
async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — email skipped:', subject);
    return;
  }

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

// Escapes user-supplied text before it's interpolated into an HTML email body.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { sendEmail, escapeHtml };
