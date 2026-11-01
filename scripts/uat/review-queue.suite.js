// Review queue (/api/review, Session 9L) regression suite — UAT ONLY.
// Needs the local server running (node src/server.js, port 3001), .env
// pointing at the UAT project, and migration 019 on UAT.
// Run from the project root:  npm run uat:review
// Admin session: a magic-link token for the UAT admin account, verified
// in-script (no email sent, password untouched).
// Creates 3 throwaway users (@example.com — sendEmail skips them, so no
// seller emails) + 5 PENDING listings dated 2000-01-01 so they sit at the
// FRONT of the FIFO queue, ahead of any real UAT pending listings.
// Side effect: R26 makes a real seller edit → ONE "UPDATED" alert email to
// listings@ (UAT-labelled; price-only edit, so no AI moderation call).
// Everything is deleted by ID at the end.
// Part 2 adds: /api/auth/refresh (F), seller emails (E — @example.com, so
// skipped; a real one is a manual check), two approvers at once.
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
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

async function adminToken() {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email: ADMIN_EMAIL });
  if (error) throw error;
  const { data: s, error: e2 } = await anon().auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  if (e2) throw e2;
  return { token: s.session.access_token, id: s.user.id };
}

async function makeUser(tag, fullName) {
  const email = `review-${tag}-${Date.now()}@example.com`, password = 'Rvw!' + crypto.randomBytes(8).toString('hex');
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const id = data.user.id; created.users.push(id);
  const phone = '+9160001' + String(Math.floor(1000 + Math.random() * 8999));
  const { error: pErr } = await supabaseAdmin.from('profiles').upsert({ id, full_name: fullName, phone, phone_verified: true });
  if (pErr) throw pErr;
  const { data: s, error: sErr } = await anon().auth.signInWithPassword({ email, password });
  if (sErr) throw sErr;
  return { id, email, token: s.session.access_token, refresh: s.session.refresh_token };
}

async function makeListing(sellerId, title, minute) {
  const { data, error } = await supabaseAdmin.from('listings').insert({
    seller_id: sellerId, category: 'hh', subcategory: 'Furniture', title, description: 'Review suite test listing.',
    price: 1000, lat: 12.9352, lng: 77.6245, display_lat: 12.9361, display_lng: 77.6232, address: 'Koramangala',
    status: 'pending', show_phone: 'never', details: { total_price: 1000 }, moderation_verdict: 'clean',
    created_at: `2000-01-01T00:0${minute}:00Z` }).select('id').single();
  if (error) throw error;
  created.listings.push(data.id);
  return data.id;
}

const listingRow = async id =>
  (await supabaseAdmin.from('listings').select('status, rejection_reason, review_claimed_by, review_claimed_until, expires_at').eq('id', id).single()).data;
const reviewRows = async id =>
  (await supabaseAdmin.from('listing_reviews').select('decision, reason_code, reason_note, reviewer_id').eq('listing_id', id)).data || [];

(async () => {
  try {
    const admin = await adminToken();
    const P = await makeUser('approver', 'Priya Approver Test');   // future approver
    const S = await makeUser('seller', 'Suresh Seller Test');      // seller
    const X = await makeUser('stranger', 'Xavier Stranger Test');  // never requests access
    const Lown = await makeListing(P.id, 'Review test: approver\'s own', 0);
    const L1 = await makeListing(S.id, 'Review test 1', 1);
    const L2 = await makeListing(S.id, 'Review test 2', 2);
    const L3 = await makeListing(S.id, 'Review test 3', 3);
    const L4 = await makeListing(S.id, 'Review test 4', 4);
    const Ladm = await makeListing(admin.id, 'Review test: admin\'s own', 5);
    await supabaseAdmin.from('listing_photos').insert([
      { listing_id: L1, storage_path: 'suite/b.jpg', public_url: 'https://example.com/b.jpg', sort_order: 1 },
      { listing_id: L1, storage_path: 'suite/a.jpg', public_url: 'https://example.com/a.jpg', sort_order: 0 },
    ]);

    // ── Access ──
    let r = await call(null, 'GET', '/api/review/me');
    check('R01 /me without login → 401', r.status === 401, r.status);
    r = await call(X.token, 'GET', '/api/review/me');
    check('R02 stranger /me → access none + 11 reasons in 2 groups', r.status === 200 && r.data.access === 'none' && r.data.reasons?.length === 11
      && r.data.reasons.filter(x => x.group === 'change').length === 7, JSON.stringify(r.data.access));
    r = await call(X.token, 'POST', '/api/review/next', {});
    check('R03 stranger /next → 403 (none)', r.status === 403 && r.data.access === 'none', r.status);
    r = await call(P.token, 'POST', '/api/review/access-request', { display_name: 'P' });
    check('R04 name too short → 400', r.status === 400, r.status);
    r = await call(P.token, 'POST', '/api/review/access-request', { display_name: '  Priya   T ' });
    check('R05 access request → requested, name tidied', r.status === 200 && r.data.access === 'requested' && r.data.display_name === 'Priya T', JSON.stringify(r.data));
    r = await call(P.token, 'POST', '/api/review/next', {});
    check('R06 requested approver /next → 403 (requested)', r.status === 403 && r.data.access === 'requested', r.status);
    r = await call(P.token, 'POST', '/api/review/access-request', { display_name: 'Someone Else' });
    check('R07 second request changes nothing', r.data.display_name === 'Priya T' && r.data.access === 'requested', JSON.stringify(r.data));
    r = await call(P.token, 'GET', '/api/review/team');
    check('R08 non-admin /team → 403', r.status === 403, r.status);
    r = await call(admin.token, 'GET', '/api/review/team');
    const row = (r.data.team || []).find(m => m.user_id === P.id);
    check('R09 admin /team shows the request with email', r.status === 200 && row?.status === 'requested' && row.email === P.email);
    r = await call(admin.token, 'POST', `/api/review/team/${P.id}`, { status: 'boss' });
    check('R10 bad status → 400', r.status === 400, r.status);
    r = await call(admin.token, 'POST', `/api/review/team/${P.id}`, { status: 'active' });
    check('R11 admin activates approver', r.status === 200 && r.data.member?.status === 'active', r.status);
    r = await call(P.token, 'GET', '/api/review/me');
    check('R12 approver /me → active', r.data.access === 'active', r.data.access);

    // ── Queue ──
    r = await call(P.token, 'POST', '/api/review/next', {});
    const card = r.data.listing || {};
    check('R13 approver gets oldest NOT-own listing (L1)', r.status === 200 && card.id === L1, card.id);
    check('R14 card: first name only, photos sorted, remaining ≥ 5', card.seller_name === 'Suresh'
      && card.photos?.[0] === 'https://example.com/a.jpg' && r.data.remaining >= 5, `${card.seller_name} / ${r.data.remaining}`);
    check('R15 card has no lat/lng/seller_id/phone', !('lat' in card) && !('lng' in card) && !('seller_id' in card) && !JSON.stringify(card).includes('+9160001'));
    r = await call(P.token, 'POST', '/api/review/next', {});
    check('R16 /next again resumes the same claim (L1)', r.data.listing?.id === L1, r.data.listing?.id);
    r = await call(admin.token, 'POST', '/api/review/next', {});
    check('R17 admin gets a different listing (Lown), full name', r.data.listing?.id === Lown && r.data.listing.seller_name === 'Priya Approver Test', r.data.listing?.id);
    await call(admin.token, 'POST', `/api/review/${Lown}/release`);

    // ── Decisions ──
    r = await call(admin.token, 'POST', `/api/review/${L1}/approve`, {});
    check('R18 approve a listing claimed by someone else → 409', r.status === 409, r.status);
    r = await call(P.token, 'POST', `/api/review/${L1}/needs-change`, {});
    check('R19a needs-change without reason → 400', r.status === 400, r.status);
    r = await call(P.token, 'POST', `/api/review/${L1}/needs-change`, { reason_code: 'other_change' });
    check('R19b "Other" without note → 400', r.status === 400, r.status);
    r = await call(P.token, 'POST', `/api/review/${L1}/needs-change`, { reason_code: 'photos', note: 'x'.repeat(301) });
    check('R19c note over 300 → 400', r.status === 400, r.status);
    r = await call(P.token, 'POST', '/api/review/not-a-uuid/needs-change', { reason_code: 'photos' });
    check('R19d bad listing id → 400', r.status === 400, r.status);
    r = await call(P.token, 'POST', `/api/review/${L1}/reject`, { reason_code: 'photos' });
    check('R19e reject with a needs-change reason → 400 (groups never mix)', r.status === 400, r.status);
    r = await call(P.token, 'POST', `/api/review/${L1}/needs-change`, { reason_code: 'spam' });
    check('R19f needs-change with a reject reason → 400', r.status === 400, r.status);
    r = await call(P.token, 'POST', `/api/review/${L1}/needs-change`, { reason_code: 'photos', note: 'Photo shows a car; this is a two-wheeler listing.' });
    let db = await listingRow(L1), hist = await reviewRows(L1);
    check('R20 needs-change → kept, "Needs a small change: …" for seller, claim cleared, history row', r.status === 200
      && db.status === 'rejected' && db.rejection_reason === "Needs a small change: Photos don't match the item or category: Photo shows a car; this is a two-wheeler listing."
      && !db.review_claimed_by && hist.length === 1 && hist[0].reason_code === 'photos' && hist[0].reviewer_id === P.id, db.rejection_reason);
    r = await call(P.token, 'POST', `/api/review/${L1}/needs-change`, { reason_code: 'photos' });
    check('R21 decide the same listing again → 409', r.status === 409, r.status);

    r = await call(P.token, 'POST', '/api/review/next', {});
    check('R22 next → L2', r.data.listing?.id === L2, r.data.listing?.id);
    r = await call(P.token, 'POST', `/api/review/${L2}/release`);
    db = await listingRow(L2);
    check('R23 Skip releases the claim', r.status === 200 && !db.review_claimed_by);
    r = await call(P.token, 'POST', '/api/review/next', { skip: [L2] });
    check('R24 next with skip [L2] → L3', r.data.listing?.id === L3, r.data.listing?.id);
    r = await call(P.token, 'POST', '/api/review/next', { skip: ['nope'] });
    check('R25 bad skip list → 400', r.status === 400, r.status);

    // Decision 1: the seller edits while the card is open → 409 for the approver
    r = await call(S.token, 'PUT', `/api/listings/${L3}`, { price: 1200 });
    db = await listingRow(L3);
    check('R26 seller edit clears the review claim', r.status === 200 && db.status === 'pending' && !db.review_claimed_by, r.status);
    r = await call(P.token, 'POST', `/api/review/${L3}/approve`, {});
    check('R27 approve after the seller edited → 409 "just changed"', r.status === 409 && /just changed/.test(r.data.error), r.status);

    // Approve
    r = await call(P.token, 'POST', '/api/review/next', { skip: [L2] });
    check('R28 next → L3 again (re-queued after the edit)', r.data.listing?.id === L3, r.data.listing?.id);
    await call(P.token, 'POST', `/api/review/${L3}/release`);
    r = await call(P.token, 'POST', '/api/review/next', { skip: [L2, L3] });
    check('R29 next → L4', r.data.listing?.id === L4, r.data.listing?.id);
    r = await call(P.token, 'POST', `/api/review/${L4}/approve`, {});
    db = await listingRow(L4); hist = await reviewRows(L4);
    check('R30 approve → active, 30-day expiry, claim cleared, history row', r.status === 200 && db.status === 'active'
      && new Date(db.expires_at) > new Date(Date.now() + 29 * 86400e3) && !db.review_claimed_by
      && hist.length === 1 && hist[0].decision === 'approved' && hist[0].reviewer_id === P.id, JSON.stringify(db));

    // Nobody reviews their own listing — admins included (2026-10-31)
    r = await call(admin.token, 'POST', '/api/review/next', { skip: [Lown, L2, L3] });
    check('R31 admin is never given their own listing', r.status === 200 && r.data.listing?.id !== Ladm, r.data.listing?.id || 'queue empty');
    if (r.data.listing) await call(admin.token, 'POST', `/api/review/${r.data.listing.id}/release`);

    // Reject (admin, on the approver's own listing — oldest unclaimed)
    r = await call(admin.token, 'POST', '/api/review/next', {});
    check('R31b admin next → Lown', r.data.listing?.id === Lown, r.data.listing?.id);
    r = await call(admin.token, 'POST', `/api/review/${Lown}/reject`, { reason_code: 'spam' });
    db = await listingRow(Lown); hist = await reviewRows(Lown);
    check('R31c reject → "Not approved: …" for seller, history reason spam', r.status === 200 && db.status === 'rejected'
      && db.rejection_reason === 'Not approved: Looks like spam or a fake listing' && hist[0]?.reason_code === 'spam', db.rejection_reason);

    // ── Revoke ──
    r = await call(admin.token, 'POST', `/api/review/team/${P.id}`, { status: 'revoked' });
    await new Promise(res => setTimeout(res, 1500));   // audit row is fire-and-forget
    const { data: audit } = await supabaseAdmin.from('audit_log').select('id, metadata')
      .eq('event_type', 'staff_status_change').eq('user_id', admin.id).order('created_at', { ascending: false }).limit(5);
    const mine = (audit || []).filter(a => a.metadata?.staff_user_id === P.id);
    created.auditIds = (audit || []).filter(a => a.metadata?.staff_user_id === P.id).map(a => a.id);
    check('R32 audit rows for activate + revoke (IDs only)', mine.length === 2 && !JSON.stringify(mine).includes('@'), mine.length);
    r = await call(P.token, 'POST', '/api/review/next', {});
    check('R33 revoked approver /next → 403 at once', r.status === 403 && r.data.access === 'revoked', r.status);
    r = await call(P.token, 'POST', '/api/review/access-request', { display_name: 'Priya Again' });
    check('R34 revoked approver cannot re-request their way back', r.data.access === 'revoked', r.data.access);
    r = await call(admin.token, 'POST', `/api/review/team/${X.id}`, { status: 'active' });
    check('R35 activate someone with no request → 404', r.status === 404, r.status);

    // ── Session refresh (part 2 A) ──
    // "Old refresh token is rejected" is NOT checked: Supabase accepts a used
    // token for ~10 s (reuse grace period), so that check would be flaky.
    r = await call(null, 'POST', '/api/auth/refresh', {});
    check('F1 refresh without a token → 400', r.status === 400, r.status);
    r = await call(null, 'POST', '/api/auth/refresh', { refresh_token: 'not-a-real-token' });
    check('F2 refresh with a made-up token → 401', r.status === 401, r.status);
    r = await call(null, 'POST', '/api/auth/refresh', { refresh_token: X.refresh });
    const s1 = r.data.session || {};
    const me = await call(s1.access_token, 'GET', '/api/auth/me');
    check('F3 refresh → new tokens, new access token works on /me', r.status === 200 && s1.access_token && s1.access_token !== X.token
      && s1.refresh_token && s1.refresh_token !== X.refresh && s1.expires_at && me.status === 200, `${r.status}/${me.status}`);
    r = await call(null, 'POST', '/api/auth/refresh', { refresh_token: s1.refresh_token });
    check('F4 the rotated refresh token works for the next refresh', r.status === 200 && r.data.session?.access_token, r.status);

    // ── Seller emails (part 2 B) — must never throw, or a decision could fail ──
    const { notifySellerListingReviewed } = require(path.join(ROOT, 'src/utils/notifySeller'));
    let threw = false;
    try { await notifySellerListingReviewed({ id: 'suite-e1', seller_id: crypto.randomUUID(), title: 'x' }, 'change'); } catch { threw = true; }
    check('E1 email for an unknown seller → no throw, nothing sent', !threw);
    threw = false;
    try { await notifySellerListingReviewed({ id: 'suite-e2', seller_id: X.id, title: 'x', rejection_reason: 'Not approved: test' }, 'reject'); } catch { threw = true; }
    check('E2 email for an @example.com seller → skipped, no throw', !threw);
  } catch (e) {
    fail++; console.error('ERROR', e.message);
  } finally {
    if (created.listings.length) await supabaseAdmin.from('listings').delete().in('id', created.listings);
    if (created.auditIds?.length) await supabaseAdmin.from('audit_log').delete().in('id', created.auditIds);
    for (const id of created.users) await supabaseAdmin.auth.admin.deleteUser(id);
    console.log(`\n${pass} passed, ${fail} failed. Cleaned up ${created.listings.length} listings, ${created.users.length} users.`);
    process.exit(fail ? 1 : 0);
  }
})();
