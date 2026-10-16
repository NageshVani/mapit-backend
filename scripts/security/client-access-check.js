// Client-access attack check — what the PUBLIC anon key and a signed-in
// user's own token can do directly against Supabase, bypassing the backend.
// Written for the pre-launch security audit / migration 018 (2026-10-16).
// Every check is phrased as the SAFE outcome: PASS = blocked (or, for chat
// Realtime, still working). Run before 018 to see the holes, after 018 to
// prove they are closed:
//   node -r dotenv/config scripts/security/client-access-check.js
//
// SAFETY
//   • UAT only: refuses to start unless the local .env points at the UAT
//     Supabase project. Talks to Supabase directly (no Vercel, no MSG91, no email).
//   • 3 throwaway @example.com accounts (admin-created, no emails sent), plus
//     test rows created by the service role (1 pending listing, 1 conversation,
//     1 message, 1 feedback row). Anything a check manages to create is
//     recorded and deleted by ID in `finally`, then the accounts are deleted.
const path = require('path'), crypto = require('crypto');
const ROOT = process.cwd();
const { createClient } = require(path.join(ROOT, 'node_modules/@supabase/supabase-js'));
const { supabaseAdmin } = require(path.join(ROOT, 'src/config/supabase'));

const UAT_REF = process.env.UAT_PROJECT_REF || 'xesekrkxbtybbxpsvxuz';
const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY;
const anon = () => createClient(URL, ANON, { auth: { persistSession: false } });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
function check(id, desc, pass, evidence, warn = false) {
  const status = pass ? 'PASS' : warn ? 'WARN' : 'FAIL';
  results.push({ id, status });
  const icon = { PASS: '✅', FAIL: '❌', WARN: '⚠️ ' }[status];
  console.log(`${icon} ${id}  ${desc}\n      → ${String(evidence ?? '').slice(0, 160)}`);
}
// "Blocked" = an error (42501 permission denied after 018) or zero rows (RLS).
const blockedRead = r => !!r.error || (r.data?.length || 0) === 0;
const readEvidence = r => r.error ? `error ${r.error.code || ''} ${r.error.message}` : `${r.data?.length || 0} row(s) visible`;
// Direct insert WITHOUT reading the row back (PostgREST insert+return also needs
// SELECT rights, which would make a refusal look like a block). Then the service
// role checks whether a row really landed; any row found is recorded for cleanup.
async function tryInsert(client, table, row, match) {
  const r = await client.from(table).insert(row);
  let q = supabaseAdmin.from(table).select('id');
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { data } = await q;
  (data || []).forEach(d => created[table].push(d.id));
  const landed = (data || []).length;
  return { pass: landed === 0, evidence: `client: ${r.error ? `refused ${r.error.code || ''} ${r.error.message}` : 'accepted'} · rows in DB: ${landed}` };
}

// ── Safety guard ──────────────────────────────────────────────
function guard() {
  const ref = (URL || '').split('//')[1]?.split('.')[0];
  if (ref !== UAT_REF) throw new Error(`ABORT: local .env points at "${ref}", not the UAT project "${UAT_REF}".`);
  console.log(`Target Supabase ${ref} (UAT) ✔\n`);
}

// ── Accounts + cleanup ────────────────────────────────────────
const users = [];
const created = { listings: [], conversations: [], chat_messages: [], feedback: [], listing_reports: [], saved_listings: [] };
async function makeUser(tag) {
  const email = `seccheck-${tag}-${Date.now()}@example.com`;
  const password = 'Sec!' + crypto.randomBytes(10).toString('hex');
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error('createUser: ' + error.message);
  const u = { tag, id: data.user.id };
  users.push(u);
  const { data: s, error: e2 } = await anon().auth.signInWithPassword({ email, password });
  if (e2) throw new Error('signIn: ' + e2.message);
  u.token = s.session.access_token;
  u.client = createClient(URL, ANON, {
    auth: { persistSession: false }, global: { headers: { Authorization: 'Bearer ' + u.token } },
  });
  return u;
}
async function cleanup() {
  // children first (FKs to profiles without ON DELETE CASCADE)
  for (const t of ['chat_messages', 'conversations', 'listing_reports', 'saved_listings', 'feedback', 'listings']) {
    if (created[t].length) await supabaseAdmin.from(t).delete().in('id', created[t]);
  }
  const ids = users.map(u => u.id);
  if (ids.length) {
    await supabaseAdmin.from('chat_messages').delete().in('sender_id', ids);
    await supabaseAdmin.from('conversations').delete().in('buyer_id', ids);
    await supabaseAdmin.from('feedback').delete().in('user_id', ids);
    await supabaseAdmin.from('audit_log').delete().in('user_id', ids);
  }
  for (const id of ids) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id); // cascades profile, listings, pins
    if (error) console.error(`cleanup: could not delete test user ${id}: ${error.message}`);
  }
  const { count } = await supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true })
    .in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  console.log(`\nCleanup: ${ids.length} test users + ${Object.values(created).flat().length} test rows deleted by ID; leftover profiles: ${count ?? '?'}`);
}

// ── Checks ────────────────────────────────────────────────────
async function run() {
  // A · Anonymous visitor (only the public anon key, no login)
  console.log('A · Anonymous visitor (public anon key)');
  const tables = ['listings', 'listing_photos', 'profiles', 'feedback', 'conversations', 'chat_messages',
    'listing_reports', 'saved_listings', 'user_pins', 'grievances', 'audit_log', 'phone_otps',
    'invite_codes', 'report_chat_views', 'transactions', 'messages_legacy'];
  let n = 0;
  for (const t of tables) {
    const r = await anon().from(t).select('*').limit(1);
    check(`A-${String(++n).padStart(2, '0')}`, `Anonymous cannot read ${t}`, blockedRead(r), readEvidence(r));
  }
  const rpc = await anon().rpc('listings_within_radius', { user_lat: 12.9352, user_lng: 77.6245, radius_m: 50000 });
  check('A-17', 'Anonymous cannot call the radius RPC', blockedRead(rpc), readEvidence(rpc));
  // PostGIS reference table (owned by supabase_admin, so 018 may not be able to
  // revoke it). Non-destructive probe: an UPDATE that matches no row (srid -1)
  // is refused only if the permission is gone; reading it is harmless.
  const srs = await anon().from('spatial_ref_sys').update({ auth_name: 'x' }).eq('srid', -1);
  check('A-18', 'Anonymous cannot write the PostGIS spatial_ref_sys table (no-op probe)', !!srs.error,
    srs.error ? `refused: ${srs.error.code || ''} ${srs.error.message}` : 'permission present (0 rows touched)', !srs.error);

  // Setup (service role): seller S with a PENDING listing, buyer B chatting with S, outsider X
  const S = await makeUser('seller'), B = await makeUser('buyer'), X = await makeUser('outsider');
  const { data: L, error: lErr } = await supabaseAdmin.from('listings').insert({
    seller_id: S.id, category: 'hh', subcategory: 'Furniture', title: 'SECCHECK pending listing',
    price: 100, lat: 12.9352, lng: 77.6245, status: 'pending',
  }).select('id').single();
  if (lErr) throw new Error('setup listing: ' + lErr.message);
  created.listings.push(L.id);
  const { data: C, error: cErr } = await supabaseAdmin.from('conversations')
    .insert({ listing_id: L.id, buyer_id: B.id, seller_id: S.id }).select('id').single();
  if (cErr) throw new Error('setup conversation: ' + cErr.message);
  created.conversations.push(C.id);
  const { data: M, error: mErr } = await supabaseAdmin.from('chat_messages')
    .insert({ conversation_id: C.id, sender_id: B.id, content: 'SECCHECK original text' }).select('id').single();
  if (mErr) throw new Error('setup message: ' + mErr.message);
  created.chat_messages.push(M.id);
  const { data: F, error: fErr } = await supabaseAdmin.from('feedback')
    .insert({ user_id: null, type: 'suggestion', description: 'SECCHECK anonymous feedback' }).select('id').single();
  if (fErr) throw new Error('setup feedback: ' + fErr.message);
  created.feedback.push(F.id);

  // B · Signed-in user going around the backend
  console.log('\nB · Signed-in user, own token, direct to Supabase');
  let r = await X.client.from('listings').select('id, lat, lng, status, moderation_reason').eq('id', L.id);
  check('B-01', "Another user cannot read a PENDING listing (exact lat/lng, status)", blockedRead(r), readEvidence(r));

  let w = await tryInsert(S.client, 'listings', {
    seller_id: S.id, category: 'hh', subcategory: 'Furniture', title: 'SECCHECK direct insert',
    price: 1, lat: 12.93, lng: 77.62, status: 'active',
  }, { seller_id: S.id, title: 'SECCHECK direct insert' });
  check('B-02', 'A user cannot insert an ACTIVE listing directly (skipping phone gate + moderation)', w.pass, w.evidence);

  r = await S.client.from('listings').update({ status: 'active' }).eq('id', L.id).select('id');
  const { data: lNow } = await supabaseAdmin.from('listings').select('status').eq('id', L.id).single();
  check('B-03', 'A seller cannot self-approve their pending listing', lNow?.status === 'pending',
    `client: ${r.error ? r.error.message : `${r.data?.length || 0} row(s) updated`} · DB status=${lNow?.status}`);
  if (lNow?.status !== 'pending') await supabaseAdmin.from('listings').update({ status: 'pending' }).eq('id', L.id);

  r = await X.client.from('listing_photos').select('id').limit(1);
  check('B-04', 'A user cannot list listing photo rows', blockedRead(r), readEvidence(r));

  r = await X.client.from('feedback').select('id, description').eq('id', F.id);
  check('B-05', 'A user cannot read anonymous (user_id empty) feedback', blockedRead(r), readEvidence(r));
  r = await X.client.from('feedback').update({ description: 'SECCHECK tampered' }).eq('id', F.id).select('id');
  const { data: fNow } = await supabaseAdmin.from('feedback').select('description').eq('id', F.id).single();
  check('B-06', 'A user cannot modify anonymous feedback', fNow?.description === 'SECCHECK anonymous feedback',
    `client: ${r.error ? r.error.message : `${r.data?.length || 0} row(s) updated`} · DB text unchanged=${fNow?.description === 'SECCHECK anonymous feedback'}`);

  w = await tryInsert(X.client, 'conversations', { listing_id: L.id, buyer_id: X.id, seller_id: S.id }, { buyer_id: X.id });
  check('B-07', 'A user cannot start a conversation directly (skipping spam screening + seller email)', w.pass, w.evidence);

  w = await tryInsert(B.client, 'chat_messages', { conversation_id: C.id, sender_id: B.id, content: 'SECCHECK direct send' },
    { conversation_id: C.id, content: 'SECCHECK direct send' });
  check('B-08', 'A participant cannot send a chat message directly', w.pass, w.evidence);

  r = await S.client.from('chat_messages').update({ content: 'SECCHECK tampered' }).eq('id', M.id).select('id');
  const { data: mNow } = await supabaseAdmin.from('chat_messages').select('content').eq('id', M.id).single();
  check('B-09', 'A recipient cannot edit the text of a message they received', mNow?.content === 'SECCHECK original text',
    `client: ${r.error ? r.error.message : `${r.data?.length || 0} row(s) updated`} · DB text unchanged=${mNow?.content === 'SECCHECK original text'}`);

  w = await tryInsert(X.client, 'listing_reports', { listing_id: L.id, reporter_id: X.id, reason: 'spam' }, { reporter_id: X.id });
  check('B-10', 'A user cannot file a listing report directly', w.pass, w.evidence);

  w = await tryInsert(X.client, 'saved_listings', { user_id: X.id, listing_id: L.id }, { user_id: X.id });
  check('B-11', 'A user cannot write saved_listings directly (backend only)', w.pass, w.evidence);

  // C · What must keep working: chat read + Realtime for participants only
  console.log('\nC · Chat (the one allowed direct path)');
  r = await S.client.from('chat_messages').select('id, content').eq('conversation_id', C.id);
  check('C-01', 'A participant CAN read messages in their own conversation', !r.error && !!r.data?.some(m => m.id === M.id), readEvidence(r));
  r = await X.client.from('chat_messages').select('id').eq('conversation_id', C.id);
  check('C-02', 'An outsider cannot read that conversation', blockedRead(r), readEvidence(r));

  // Realtime: seller subscribes, service role inserts a message, seller must receive it live
  const rt = createClient(URL, ANON, { auth: { persistSession: false } });
  rt.realtime.setAuth(S.token);
  let got = null, subStatus = '', wasSubscribed = false;
  const ch = rt.channel(`seccheck-${C.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${C.id}` },
      p => { got = p.new; })
    .subscribe(s => { subStatus = s; if (s === 'SUBSCRIBED') wasSubscribed = true; });
  for (let i = 0; i < 40 && subStatus !== 'SUBSCRIBED'; i++) await sleep(250);
  await sleep(1500); // let the server finish attaching the postgres_changes listener
  const { data: M2 } = await supabaseAdmin.from('chat_messages')
    .insert({ conversation_id: C.id, sender_id: B.id, content: 'SECCHECK realtime ping' }).select('id').single();
  if (M2?.id) created.chat_messages.push(M2.id);
  for (let i = 0; i < 40 && !got; i++) await sleep(250);
  await rt.removeChannel(ch);
  check('C-03', 'Chat Realtime still delivers a new message to the participant', got?.content === 'SECCHECK realtime ping',
    `channel ${wasSubscribed ? 'SUBSCRIBED' : subStatus || 'no status'} · ${got ? 'event received' : 'no event within 10 s'}`, !wasSubscribed);
}

(async () => {
  let crashed = null;
  try { guard(); await run(); }
  catch (e) { crashed = e; console.error('\n💥 ' + e.message); }
  finally { if (users.length) await cleanup(); }
  const c = s => results.filter(r => r.status === s).length;
  console.log(`\n${c('PASS')} PASS · ${c('FAIL')} FAIL · ${c('WARN')} WARN (of ${results.length})`);
  process.exit(crashed || c('FAIL') ? 1 : 0);
})();
