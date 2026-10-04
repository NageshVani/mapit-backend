// ============================================================
// Phone-verification gate — Session 9C (decision 2026-10-04)
// Accounts created on/after the cutoff must verify their phone (WhatsApp
// OTP) before posting a listing. Older accounts are the family/friends
// test accounts — left alone; they re-register at launch.
// One function, used by both GET /api/auth/otp/phone/status (frontend
// pre-check) and POST /api/listings (server-side enforcement), so the
// rule can't drift between the two.
// ============================================================
// Newest pre-9C account was created 2026-10-03; everything from 4 Oct is gated.
const DEFAULT_CUTOFF = '2026-10-04T00:00:00+05:30';

function phoneVerifyCutoff() {
  const d = new Date(process.env.PHONE_VERIFY_REQUIRED_FROM || DEFAULT_CUTOFF);
  return isNaN(d) ? new Date(DEFAULT_CUTOFF) : d;
}

// user = Supabase auth user (req.user), profile = profiles row (may be null).
function needsPhoneVerification(user, profile) {
  if (profile?.phone_verified) return false;
  return new Date(user.created_at) >= phoneVerifyCutoff();
}

module.exports = { needsPhoneVerification };
