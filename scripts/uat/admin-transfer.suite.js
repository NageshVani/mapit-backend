// Admin 🔁 Transfer (listing handover) regression suite — UAT ONLY.
// Needs the local server running (npm run dev, port 3001) and .env pointing
// at the UAT project. Run from the project root:  npm run uat:transfer
// Admin session: a magic-link token for the UAT admin account, verified
// in-script (no email sent, password untouched).
// Creates 3 throwaway users + 3 PENDING listings (never public, no listing
// alert — inserted directly, not via the API); everything deleted by ID at the end.
const path = require('path'), crypto = require('crypto');
const ROOT = process.cwd();
const { createClient } = require(path.join(ROOT, 'node_modules/@supabase/supabase-js'));
const { supabaseAdmin } = require(path.join(ROOT, 'src/config/supabase'));
const BASE = 'http://localhost:3001';
const UAT_REF = 'xesekrkxbtybbxpsvxuz';
const ADMIN_EMAIL = 'nagesh.aadi@gmail.com';

if (!(process.env.SUPABASE_URL || '').includes(UAT_REF)) {
  console.error('ABORT: .env is not the UAT project. This suite writes test data.');
  process.exit(1);
}

const anon = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const created = { users: [], listings: [] };
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

async function call(token, method, url, body) {
  const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

async function adminToken() {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email: ADMIN_EMAIL });
  if (error) throw error;
  const { data: s, error: e2 } = await anon().auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  if (e2) throw e2;
  return { token: s.session.access_token, id: s.user.id };
}

async function makeUser(tag, { confirmed, phone }) {
  const email = `transfer-${tag}-${Date.now()}@example.com`, password = 'Trf!' + crypto.randomBytes(8).toString('hex');
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: confirmed });
  if (error) throw error;
  const id = data.user.id; created.users.push(id);
  const { error: pErr } = await supabaseAdmin.from('profiles').upsert({ id, full_name: `Transfer Test ${tag}`, phone: phone || null, phone_verified: !!phone });
  if (pErr) throw pErr;
  let token = null;
  if (confirmed) {
    const { data: s, error: sErr } = await anon().auth.signInWithPassword({ email, password });
    if (sErr) throw sErr;
    token = s.session.access_token;
  }
  return { id, email, token };
}

async function makeListing(sellerId, title) {
  const { data, error } = await supabaseAdmin.from('listings').insert({
    seller_id: sellerId, category: 'hh', subcategory: 'Furniture', title, description: 'Transfer suite test listing.',
    price: 1000, lat: 12.9352, lng: 77.6245, display_lat: 12.9361, display_lng: 77.6232, address: 'Koramangala',
    status: 'pending', show_phone: 'never', details: { total_price: 1000 },
    expires_at: new Date(Date.now() + 30 * 86400e3).toISOString() }).select('id').single();
  if (error) throw error;
  created.listings.push(data.id);
  return data.id;
}

(async () => {
  try {
    const admin = await adminToken();
    const phoneA = '+9160000' + String(Math.floor(10000 + Math.random() * 89999));
    const A = await makeUser('a', { confirmed: true, phone: phoneA });     // the seller
    const B = await makeUser('b', { confirmed: false });                  // unconfirmed email
    const C = await makeUser('c', { confirmed: true });                   // another real user
    const L1 = await makeListing(admin.id, 'Transfer test 1');
    const L2 = await makeListing(admin.id, 'Transfer test 2');
    const LC = await makeListing(C.id, 'Transfer test owned by C');

    // Listing list
    let r = await call(admin.token, 'GET', '/api/admin/handover/listings');
    const ids = (r.data.listings || []).map(l => l.id);
    check('T01 list shows admin-owned listings', r.status === 200 && ids.includes(L1) && ids.includes(L2));
    check('T02 list hides other users\' listings', !ids.includes(LC));

    // Lookups
    r = await call(admin.token, 'POST', '/api/admin/handover/lookup', { phone: phoneA.slice(3) });
    check('T03 lookup by verified phone (10 digits) → seller', r.status === 200 && r.data.account?.id === A.id && r.data.account.matched_by.includes('phone'));
    check('T04 phone is masked in response', r.data.account?.phone_masked?.includes('••') && !JSON.stringify(r.data).includes(phoneA));
    r = await call(admin.token, 'POST', '/api/admin/handover/lookup', { email: A.email.toUpperCase() });
    check('T05 lookup by confirmed email (case-insensitive) → seller', r.status === 200 && r.data.account?.id === A.id);
    check('T06 email is masked in response', !JSON.stringify(r.data).includes(A.email));
    r = await call(admin.token, 'POST', '/api/admin/handover/lookup', { email: B.email });
    check('T07 unconfirmed email does NOT match', r.status === 404, r.status);
    r = await call(admin.token, 'POST', '/api/admin/handover/lookup', { phone: phoneA, email: C.email });
    check('T08 phone + email of different accounts → 409', r.status === 409, r.status);
    r = await call(admin.token, 'POST', '/api/admin/handover/lookup', { phone: '12345' });
    check('T09 invalid phone → 400', r.status === 400, r.status);
    r = await call(admin.token, 'POST', '/api/admin/handover/lookup', {});
    check('T10 empty lookup → 400', r.status === 400, r.status);
    r = await call(admin.token, 'POST', '/api/admin/handover/lookup', { email: ADMIN_EMAIL });
    check('T11 admin account refused', r.status === 400 || r.status === 404, r.status);
    r = await call(A.token, 'POST', '/api/admin/handover/lookup', { phone: phoneA });
    check('T12 non-admin caller → 403', r.status === 403, r.status);

    // Transfers
    r = await call(admin.token, 'POST', '/api/admin/handover/transfer', { listing_ids: [L1], account_id: C.id, phone: phoneA });
    check('T13 account_id not matching phone → 409', r.status === 409, r.status);
    r = await call(admin.token, 'POST', '/api/admin/handover/transfer', { listing_ids: [LC], account_id: A.id, phone: phoneA });
    check('T14 listing not owned by admin → 400', r.status === 400, r.status);
    r = await call(admin.token, 'POST', '/api/admin/handover/transfer', { listing_ids: ['not-a-uuid'], account_id: A.id, phone: phoneA });
    check('T15 bad listing id → 400', r.status === 400, r.status);
    r = await call(admin.token, 'POST', '/api/admin/handover/transfer', { listing_ids: [L1, L2, LC], account_id: A.id, phone: phoneA });
    check('T16 transfer moves 2, skips the non-admin one', r.status === 200 && r.data.moved === 2 && r.data.skipped === 1, JSON.stringify(r.data));
    const { data: rows } = await supabaseAdmin.from('listings').select('id, seller_id').in('id', [L1, L2, LC]);
    const owner = Object.fromEntries((rows || []).map(x => [x.id, x.seller_id]));
    check('T17 DB: L1 + L2 now owned by seller, LC untouched', owner[L1] === A.id && owner[L2] === A.id && owner[LC] === C.id);
    const { data: audit } = await supabaseAdmin.from('audit_log').select('id, metadata')
      .eq('event_type', 'listing_transfer').eq('user_id', admin.id).order('created_at', { ascending: false }).limit(1);
    const meta = audit?.[0]?.metadata;
    check('T18 audit row written, IDs only (no phone/email)', meta?.to_seller_id === A.id && meta.listings?.length === 2
      && !JSON.stringify(meta).includes(phoneA) && !JSON.stringify(meta).includes('@'));
    if (audit?.[0]) created.auditId = audit[0].id;
    r = await call(admin.token, 'POST', '/api/admin/handover/transfer', { listing_ids: [L1], account_id: A.id, phone: phoneA });
    check('T19 second transfer of same listing → 400', r.status === 400, r.status);
    r = await call(A.token, 'GET', '/api/listings/mine/all');
    const mine = (r.data.listings || []).map(l => l.id);
    check('T20 seller sees both in My Listings', mine.includes(L1) && mine.includes(L2), `status ${r.status}`);
  } catch (e) {
    fail++; console.error('ERROR', e.message);
  } finally {
    if (created.listings.length) await supabaseAdmin.from('listings').delete().in('id', created.listings);
    if (created.auditId) await supabaseAdmin.from('audit_log').delete().eq('id', created.auditId);
    for (const id of created.users) await supabaseAdmin.auth.admin.deleteUser(id);
    console.log(`\n${pass} passed, ${fail} failed. Cleaned up ${created.listings.length} listings, ${created.users.length} users.`);
    process.exit(fail ? 1 : 0);
  }
})();
