// ============================================================
// WhatsApp OTP delivery — thin wrapper around MSG91's WhatsApp API
// Session 9C. MapIt generates and verifies the code itself (hash stored in
// phone_otps, migration 016); MSG91 only delivers it via the approved
// Authentication template. No SDK: same rationale as utils/email.js —
// Node 18+ has global fetch, and this is a single POST.
// ============================================================
const MSG91_URL  = 'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/';
const TIMEOUT_MS = 8000; // user is waiting on this one, but never hang a request

// Not secrets — the sender number and template name are visible to every
// recipient. Env vars only so they can change without a code change.
const WA_NUMBER = () => process.env.MSG91_WA_NUMBER    || '917892400329';
const TEMPLATE  = () => process.env.MSG91_OTP_TEMPLATE || 'mapit';

// India-only for MVP (decision 2026-10-04). Accepts "98765 43210",
// "+91-98765-43210", "919876543210", "09876543210". Returns E.164
// ("+919876543210") or null. Indian mobiles start with 6–9.
function normalizeIndianMobile(input) {
  if (typeof input !== 'string') return null;
  let digits = input.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

// "+919876543210" → "+91 ••••••3210" — safe to show back to the user.
function maskPhone(e164) {
  return `+91 ••••••${e164.slice(-4)}`;
}

// sendWhatsAppOtp() never throws — resolves { ok: true } or
// { ok: false, reason } so the route decides what the user sees.
async function sendWhatsAppOtp(e164, code) {
  // Local-dev dry run: no message, no cost. Ignored in production so a
  // stray env var can never turn real verification into a no-op.
  if (process.env.MSG91_DRY_RUN === 'true' && process.env.NODE_ENV !== 'production') {
    console.log(`[whatsappOtp] DRY RUN — code ${code} not sent`);
    return { ok: true, dryRun: true };
  }
  if (!process.env.MSG91_AUTH_KEY) {
    console.warn('MSG91_AUTH_KEY not set — WhatsApp OTP not sent');
    return { ok: false, reason: 'not_configured' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(MSG91_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authkey: process.env.MSG91_AUTH_KEY,
      },
      body: JSON.stringify({
        integrated_number: WA_NUMBER(),
        content_type: 'template',
        payload: {
          messaging_product: 'whatsapp',
          type: 'template',
          template: {
            name: TEMPLATE(),
            language: { code: 'en', policy: 'deterministic' },
            namespace: null,
            to_and_components: [{
              to: [e164.slice(1)], // MSG91 wants "919876543210", no "+"
              // UNCONFIRMED until the first live test (9C step 3): MSG91's
              // sample curl left `components` empty. Authentication templates
              // carry the code in the body ({{1}}) and in the copy-code button.
              components: {
                body_1:   { type: 'text', value: code },
                button_1: { subtype: 'url', type: 'text', value: code },
              },
            }],
          },
        },
      }),
      signal: controller.signal,
    });

    const body = await res.json().catch(() => null);
    // MSG91 can answer HTTP 200 with an error inside the body.
    if (!res.ok || !body || body.hasError === true || body.status === 'fail') {
      // Rule 8: log MSG91's error only — never the request (it holds the phone).
      console.error(`MSG91 WhatsApp error ${res.status}:`, JSON.stringify(body?.errors ?? body?.message ?? body));
      return { ok: false, reason: 'provider_error' };
    }
    return { ok: true };
  } catch (err) {
    console.error('MSG91 WhatsApp request failed:', err.name === 'AbortError' ? 'timeout' : err.message);
    return { ok: false, reason: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { sendWhatsAppOtp, normalizeIndianMobile, maskPhone };
