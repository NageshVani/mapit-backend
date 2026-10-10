// Session 9C regression suite — WhatsApp phone OTP + post gate + View Profile
// privacy (35 checks, same IDs as docs/uat/session-09c-uat-report.html).
// Saved in Session 9K (2026-10-10) so it can be re-run after any auth / RLS /
// grants change, e.g. the pre-launch security audit.
//
// Run from the project root (local .env must point at the UAT project):
//   npm run uat:9c                         (target = uat preview)
//   npm run uat:9c -- http://localhost:3001 (target = local server)
//
// SAFETY
//   • Refuses to start unless BOTH the local .env and the target's /api/config
//     point at the UAT Supabase project — it can never write to production.
//   • Sends ZERO WhatsApp messages: every send call is refused before MSG91
//     (401 / 400 / 409 / already-verified / cooldown / daily cap). Codes for the
//     verify checks are inserted directly with a known hash (service role).
//     Only fake +91 60000000xx numbers are ever used.
//   • 3 throwaway @example.com accounts (admin-created, no emails sent) + 1
//     listing; all deleted by ID in `finally`, even if a check crashes.
//   • The send route has a per-IP limit of 10/hour. This suite uses 9, so
//     wait an hour between runs against the same target.
const path = require('path'), crypto = require('crypto');
const ROOT = process.cwd();
const { createClient } = require(path.join(ROOT, 'node_modules/@supabase/supabase-js'));
const { supabaseAdmin } = require(path.join(ROOT, 'src/config/supabase'));
const { needsPhoneVerification } = require(path.join(ROOT, 'src/utils/phoneGate'));

const UAT_REF = process.env.UAT_PROJECT_REF || 'xesekrkxbtybbxpsvxuz';
const BASE = (process.argv[2] || process.env.UAT_BASE_URL || 'https://mapit-backend-git-uat-nagesh-n-arun.vercel.app').replace(/\/$/, '');
const P = n => `+9160000000${String(n).padStart(2, '0')}`; // fake numbers only
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hash = (uid, phone, code) => crypto.createHash('sha256').update(`${uid}:${phone}:${code}`).digest('hex');
const anon = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const results = [];
function check(id, area, desc, pass, evidence) {
  results.push({ id, area, desc, status: pass ? 'PASS' : 'FAIL', evidence: String(evidence ?? '').slice(0, 160) });
  console.log(`${pass ? '✅' : '❌'} ${id}  ${desc}${pass ? '' : `\n      → ${evidence}`}`);
}

async function api(method, route, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + route, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body: json };
}
const send   = (u, phone) => api('POST', '/api/auth/otp/phone/send', u?.token, phone === undefined ? {} : { phone });
const verify = (u, code)  => api('POST', '/api/auth/otp/phone/verify', u?.token, { code });
const status = u          => api('GET',  '/api/auth/otp/phone/status', u.token);

async function seedCode(u, phone, code, { createdAgoMs = 0, expired = false } = {}) {
  const created = Date.now() - createdAgoMs;
  const { error } = await supabaseAdmin.from('phone_otps').insert({
    user_id: u.id, phone, code_hash: hash(u.id, phone, code),
    expires_at: new Date(expired ? created - 1000 : Date.now() + 10 * 60 * 1000).toISOString(),
    created_at: new Date(created).toISOString(),
  });
  if (error) throw new Error('seedCode: ' + error.message);
}
async function otpCount(u) {
  const { count, error } = await supabaseAdmin.from('phone_otps').select('id', { count: 'exact', head: true }).eq('user_id', u.id);
  if (error) throw new Error('otpCount: ' + error.message);
  return count;
}
async function profile(u) {
  const { data } = await supabaseAdmin.from('profiles').select('phone, phone_verified').eq('id', u.id).maybeSingle();
  return data;
}

// ── Safety guard ──────────────────────────────────────────────
async function guard() {
  const localRef = (process.env.SUPABASE_URL || '').split('//')[1]?.split('.')[0];
  if (localRef !== UAT_REF) throw new Error(`ABORT: local .env points at "${localRef}", not the UAT project "${UAT_REF}".`);
  const cfg = await api('GET', '/api/config');
  const targetRef = cfg.body?.supabaseUrl?.split('//')[1]?.split('.')[0];
  if (cfg.status !== 200 || targetRef !== UAT_REF) {
    throw new Error(`ABORT: ${BASE}/api/config → HTTP ${cfg.status}, project "${targetRef}" — not UAT (or the deployment is protected/down).`);
  }
  console.log(`Target ${BASE} → Supabase ${targetRef} (UAT) ✔\n`);
}

// ── Accounts ──────────────────────────────────────────────────
const users = [];
async function makeUser(tag) {
  const email = `uat9c-${tag}-${Date.now()}@example.com`;
  const password = 'Uat9c!' + crypto.randomBytes(8).toString('hex');
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error('createUser: ' + error.message);
  const u = { tag, id: data.user.id };
  users.push(u);
  const { data: s, error: e2 } = await anon().auth.signInWithPassword({ email, password });
  if (e2) throw new Error('signIn: ' + e2.message);
  u.token = s.session.access_token;
  u.client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false }, global: { headers: { Authorization: 'Bearer ' + u.token } },
  });
  u.register = await api('POST', '/api/auth/register', u.token, { full_name: `UAT 9C ${tag}`, nickname: `uat9c${tag}` });
  return u;
}

let listingId = null;
async function cleanup() {
  const ids = users.map(u => u.id);
  if (listingId) await supabaseAdmin.from('listings').delete().eq('id', listingId);
  if (ids.length) await supabaseAdmin.from('audit_log').delete().in('user_id', ids);
  for (const id of ids) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id); // cascades profile, listings, phone_otps
    if (error) console.error(`cleanup: could not delete test user ${id}: ${error.message}`);
  }
  const { count } = await supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  console.log(`\nCleanup: ${ids.length} test users + ${listingId ? 1 : 0} listing deleted by ID; leftover profiles: ${count ?? '?'}`);
}

// ── Checks ────────────────────────────────────────────────────
async function run() {
  // A · Login required
  for (const [id, label, r] of [
    ['T-001', 'Phone status', await api('GET', '/api/auth/otp/phone/status')],
    ['T-002', 'Send-code', await send(null, P(1))],
    ['T-003', 'Verify-code', await verify(null, '123456')],
  ]) check(id, 'API / auth', `${label} without a login is refused (401)`, r.status === 401, `${r.status} ${JSON.stringify(r.body)}`);

  // B · Sign-up & status
  const A = await makeUser('a'), B = await makeUser('b'), C = await makeUser('c');
  const regOk = [A, B, C].every(u => u.register.status === 200);
  const profs = await Promise.all([A, B, C].map(profile));
  check('T-004', 'API / register', 'Three throwaway accounts register and get a profile row', regOk && profs.every(Boolean),
    `register: ${[A, B, C].map(u => u.register.status).join(', ')} · profiles: ${profs.filter(Boolean).length}/3`);
  let s = await status(C);
  check('T-005', 'API / status', 'New account: not verified, must verify before posting, no phone shown',
    s.status === 200 && s.body.phone_verified === false && s.body.required === true && s.body.phone_masked === null, JSON.stringify(s.body));

  // C · Number checks & 409  (B pre-verified on P(9) via service role = "another account")
  const { error: preErr } = await supabaseAdmin.from('profiles').update({ phone: P(9), phone_verified: true }).eq('id', B.id);
  if (preErr) throw new Error('pre-verify B: ' + preErr.message);
  const badMsg = 'Enter a valid Indian mobile number';
  for (const [id, desc, phone] of [
    ['T-006', 'Too-short number rejected', '98765'],
    ['T-007', 'Number starting with 5 rejected (Indian mobiles start 6–9)', '5876543210'],
    ['T-008', 'Missing number rejected', undefined],
  ]) {
    const r = await send(A, phone);
    check(id, 'API / send', desc, r.status === 400 && r.body?.error?.startsWith(badMsg), `${r.status} ${r.body?.error}`);
  }
  let r = await send(A, P(9));
  check('T-009', 'API / send 409', "A number already verified on another account is refused", r.status === 409, `${r.status} ${r.body?.error}`);
  let n = await otpCount(A);
  check('T-010', 'API / send 409', 'The 409 creates no code row, so nothing is sent or billed', n === 0, `phone_otps rows for A: ${n}`);

  // D · Code checks
  r = await verify(A, '123456');
  check('T-012', 'API / verify', 'A code when none was requested → "expired, request a new one"', r.status === 400 && /expired/.test(r.body?.error), `${r.status} ${r.body?.error}`);
  await seedCode(A, P(1), '111111');
  r = await verify(A, 'abc');
  check('T-011', 'API / verify', 'Non-numeric code rejected', r.status === 400 && /6-digit/.test(r.body?.error), `${r.status} ${r.body?.error}`);
  r = await verify(A, '000000');
  check('T-014', 'API / verify', 'Wrong code → "Incorrect code. 4 attempts left."', r.status === 400 && r.body?.error === 'Incorrect code. 4 attempts left.', `${r.status} ${r.body?.error}`);
  r = await verify(B, '111111');
  check('T-015', 'API / wrong user', "Account B cannot use account A's code", r.status === 400 && (await profile(B)).phone === P(9), `${r.status} ${r.body?.error}`);
  r = await verify(A, '111111');
  let pa = await profile(A);
  check('T-016', 'API / verify', 'The correct code verifies the phone', r.status === 200 && pa.phone_verified === true && pa.phone === P(1), `${r.status} · DB phone_verified=${pa.phone_verified}`);
  r = await verify(A, '111111');
  check('T-017', 'API / verify', 'The same code cannot be used twice', r.status === 400 && /expired/.test(r.body?.error), `${r.status} ${r.body?.error}`);
  s = await status(A);
  check('T-018', 'API / status', 'After verifying: verified, not required, phone shown masked',
    s.body?.phone_verified === true && s.body?.required === false && s.body?.phone_masked === '+91 ••••••0001', JSON.stringify(s.body));
  const before = await otpCount(A);
  r = await send(A, P(1));
  n = await otpCount(A);
  check('T-019', 'API / send', 'Code for your own verified number short-circuits (no WhatsApp sent)', r.status === 200 && r.body?.already_verified === true && n === before, `${r.status} already_verified=${r.body?.already_verified} · rows ${before}→${n}`);

  // C (cont.) · B cannot claim A's number
  r = await send(B, P(1));
  check('T-020', 'API / send 409', "Account B cannot claim A's verified number", r.status === 409, `${r.status} ${r.body?.error}`);

  // F · Database & security (part 1)
  let audit = 0;
  for (let i = 0; i < 6 && !audit; i++) {
    const { count } = await supabaseAdmin.from('audit_log').select('id', { count: 'exact', head: true }).eq('user_id', A.id).eq('event_type', 'phone_verified');
    audit = count || 0; if (!audit) await sleep(1000);
  }
  check('T-022', 'DB / audit_log', 'A phone_verified event is recorded (IT Rules 2021)', audit >= 1, `audit rows: ${audit}`);
  const { error: dupErr } = await supabaseAdmin.from('profiles').update({ phone: P(1), phone_verified: true }).eq('id', B.id);
  check('T-023', 'DB / unique index', 'The database refuses a second verified account on the same number', dupErr?.code === '23505', dupErr ? `${dupErr.code} ${dupErr.message}` : 'update succeeded');

  // D (cont.) · attempt cap on B, expiry on C
  await seedCode(B, P(2), '222222');
  let last;
  for (let i = 0; i < 5; i++) last = await verify(B, '000000');
  const sixth = await verify(B, '222222');
  check('T-029', 'API / verify', 'After 5 wrong codes, even the right code is refused',
    last.body?.error === 'Incorrect code. Please request a new one.' && sixth.status === 429, `5th: ${last.status} ${last.body?.error} · 6th (correct): ${sixth.status} ${sixth.body?.error}`);
  await seedCode(C, P(3), '333333', { createdAgoMs: 3 * 3600e3, expired: true });
  r = await verify(C, '333333');
  check('T-030', 'API / verify', 'A code older than 10 minutes is refused', r.status === 400 && /expired/.test(r.body?.error), `${r.status} ${r.body?.error}`);

  // E · Post-a-listing gate
  const listing = { category: 'hh', subcategory: 'Furniture', title: 'UAT 9C suite — throwaway listing', price: 100, lat: 12.9352, lng: 77.6245 };
  r = await api('POST', '/api/listings', C.token, listing);
  check('T-013', 'API / post gate', 'A new, unverified account cannot post a listing', r.status === 403 && r.body?.phone_verification_required === true, `${r.status} ${JSON.stringify(r.body)}`);
  r = await api('POST', '/api/listings', A.token, listing);
  listingId = r.body?.listing?.id || null;
  check('T-021', 'API / post gate', 'A verified account passes the gate (listing created, deleted at cleanup)', r.status === 201 && !!listingId, `${r.status} ${r.body?.error || 'listing created'}`);

  // F · Database & security (part 2) — public key, as a browser would
  const own = await A.client.from('phone_otps').select('id');
  check('T-024', 'RLS / phone_otps', 'A logged-in user cannot read even their own code rows', (own.data?.length || 0) === 0, `rows visible: ${own.data?.length ?? 0}${own.error ? ' · ' + own.error.message : ''}`);
  const anonRead = await anon().from('phone_otps').select('id');
  check('T-025', 'RLS / phone_otps', 'An anonymous visitor cannot read code rows', (anonRead.data?.length || 0) === 0, `rows visible: ${anonRead.data?.length ?? 0}${anonRead.error ? ' · ' + anonRead.error.message : ''}`);
  const ins = await A.client.from('phone_otps').insert({ user_id: A.id, phone: P(1), code_hash: hash(A.id, P(1), '999999'), expires_at: new Date(Date.now() + 600e3).toISOString() });
  check('T-026', 'RLS / phone_otps', 'A logged-in user cannot insert their own code row', !!ins.error, ins.error ? ins.error.message : 'insert succeeded');
  const upd = await C.client.from('profiles').update({ phone_verified: true }).eq('id', C.id).select();
  const pc = await profile(C);
  check('T-027', 'RLS / profiles', 'A user cannot mark themselves verified by writing to profiles directly', pc.phone_verified === false,
    `client update: ${upd.error ? upd.error.message : (upd.data?.length ? 'returned a row' : 'no row')} · DB phone_verified=${pc.phone_verified}`);
  r = await api('GET', `/api/users/${B.id}`, A.token);
  const keys = Object.keys(r.body?.profile || {});
  check('T-028', 'API / privacy', "Viewing another user's profile does not include their phone number", r.status === 200 && !keys.includes('phone') && keys.length > 0, `${r.status} keys: ${keys.join(', ')}`);

  // G · Abuse limits
  await seedCode(B, P(2), '444444', { createdAgoMs: 10e3 });
  n = await otpCount(B);
  r = await send(B, P(2));
  let n2 = await otpCount(B);
  check('T-031', 'API / send', 'A second code within 60 s is refused; no WhatsApp sent, no row left behind', r.status === 429 && /wait/i.test(r.body?.error) && n2 === n, `${r.status} ${r.body?.error} · rows ${n}→${n2}`);
  for (let i = 0; i < 4; i++) await seedCode(C, P(3), '55555' + i, { createdAgoMs: (2 + i) * 3600e3, expired: true });
  n = await otpCount(C);
  r = await send(C, P(3));
  n2 = await otpCount(C);
  check('T-032', 'API / send', 'The 6th code in 24 hours is refused (daily cap of 5); no WhatsApp sent', r.status === 429 && /Daily limit/.test(r.body?.error) && n2 === n, `${r.status} ${r.body?.error} · rows ${n}→${n2}`);

  // H · Phone change & gate rule
  r = await api('PUT', '/api/users/me/profile', A.token, { phone: P(99) });
  pa = await profile(A);
  check('T-033', 'API / profile', 'Changing the phone via profile edit clears "verified"', r.status === 200 && pa.phone_verified === false, `${r.status} · DB phone_verified=${pa.phone_verified}`);
  s = await status(A);
  check('T-034', 'API / status', 'After the change, posting requires verification again', s.body?.required === true && s.body?.phone_verified === false, JSON.stringify(s.body));
  const g1 = needsPhoneVerification({ created_at: '2026-10-03T12:00:00+05:30' }, null);
  const g2 = needsPhoneVerification({ created_at: '2026-10-04T00:00:00+05:30' }, null);
  const g3 = needsPhoneVerification({ created_at: '2026-10-05T00:00:00+05:30' }, { phone_verified: true });
  check('T-035', 'Unit / phoneGate', 'Before 4 Oct exempt; from 4 Oct gated; verified never gated', g1 === false && g2 === true && g3 === false, `3 Oct→${g1} · 4 Oct→${g2} · verified→${g3}`);
}

(async () => {
  let crashed = null;
  try {
    await guard();
    await run();
  } catch (err) {
    crashed = err;
    console.error('\n💥 ' + err.message);
  } finally {
    await cleanup();
  }
  const pass = results.filter(x => x.status === 'PASS').length;
  const fail = results.length - pass;
  console.log(`\n${pass}/${results.length} PASS · ${fail} FAIL${crashed ? ' · suite stopped early' : ''}`);
  if (process.env.UAT_JSON) require('fs').writeFileSync(process.env.UAT_JSON, JSON.stringify({ base: BASE, ranAt: new Date().toISOString(), results }, null, 2));
  process.exit(fail || crashed ? 1 : 0);
})();
