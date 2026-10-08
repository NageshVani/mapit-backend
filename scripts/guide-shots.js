// User Guide phone screenshots (390px) + step markers (Session 9J).
// Retake after any UI change. Needs the local server running (npm run dev, port 3001)
// and a .env with Supabase keys. Run from the project root:
//   npm run guide:shots                 (all 16 topics)
//   npm run guide:shots -- search view  (only these topics)
// Windows Git Bash: no extra flags needed here (topic ids don't start with '/').
// Chrome path: set CHROME_PATH if Chrome isn't at the default Windows location.
// Writes public/guide/<topic>.webp and public/guide/shots.js (window.GUIDE_SHOTS).
// Creates ONE throwaway account (+ one PENDING listing it owns, for My Listings);
// both deleted by ID at the end. Detail/contact/report shots use an in-browser-only
// demo copy of a listing (no real seller name, nothing written to the DB).
const path = require('path'), fs = require('fs'), crypto = require('crypto'), { spawn } = require('child_process');
const ROOT = process.cwd();
const { createClient } = require(path.join(ROOT, 'node_modules/@supabase/supabase-js'));
const { supabaseAdmin } = require(path.join(ROOT, 'src/config/supabase'));
const ONLY = process.argv.slice(2);
const OUT = path.join(ROOT, 'public/guide');
const BASE = 'http://localhost:3001';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const W = 390, H = 844;
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const SHOTS_JS = path.join(OUT, 'shots.js');
const shots = fs.existsSync(SHOTS_JS) ? JSON.parse(fs.readFileSync(SHOTS_JS, 'utf8').replace(/^[^{]*/, '').replace(/;\s*$/, '')) : {};

let uid = null, listingId = null, proc = null;
async function setup() {
  const email = `guide9j-${Date.now()}@example.com`, password = 'Guide9j!' + crypto.randomBytes(6).toString('hex');
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  uid = data.user.id;
  const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error: e2 } = await c.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.session.access_token };
  await fetch(BASE + '/api/auth/register', { method: 'POST', headers: h, body: JSON.stringify({ full_name: 'Demo User', nickname: 'Demo User' }) });
  await fetch(BASE + '/api/auth/home-location', { method: 'PUT', headers: h, body: JSON.stringify({ home_lat: 12.9352, home_lng: 77.6245, home_address: 'Koramangala, Bengaluru' }) });
  // Fake verified number so Post a Listing opens (deleted with the account)
  const { error: e3 } = await supabaseAdmin.from('profiles').update({ phone: '+916000000097', phone_verified: true }).eq('id', uid);
  if (e3) throw e3;
  // One PENDING listing (never shown to the public) for the My Listings shot
  const { data: L, error: e4 } = await supabaseAdmin.from('listings').insert({
    seller_id: uid, category: 'hh', subcategory: 'Furniture', title: 'Demo: Wooden study table', description: 'Demo listing for the User Guide.',
    price: 3500, lat: 12.9352, lng: 77.6245, display_lat: 12.9361, display_lng: 77.6232, address: 'Koramangala',
    status: 'pending', show_phone: 'on_agreement', details: { total_price: 3500 },
    expires_at: new Date(Date.now() + 30 * 86400e3).toISOString() }).select('id').single();
  if (e4) throw e4;
  listingId = L.id;
  return s.session;
}

async function browser() {
  const port = 9300 + Math.floor(Math.random() * 500);
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'guide9j-'));
  proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let tgt;
  for (let i = 0; i < 40 && !tgt; i++) { await sleep(250); try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch {} }
  const ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {};
  ws.onmessage = m => { const j = JSON.parse(m.data); if (j.id && pend[j.id]) { pend[j.id](j); delete pend[j.id]; } };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 160)); return r.result?.result?.value; };
  return { send, ev };
}

// In-page: ring + marker position for each [n, selector], as % of the viewport
const MARKS = list => `(() => { const out = [];
  for (const [n, sel] of ${JSON.stringify(list)}) {
    const el = [...document.querySelectorAll(sel)].find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    if (!el) { out.push({ n, missing: sel }); continue; }
    const r = el.getBoundingClientRect(), pad = 3;
    const x = Math.max(0, r.left - pad), y = Math.max(0, r.top - pad), w = Math.min(${W}, r.right + pad) - x, h = Math.min(${H}, r.bottom + pad) - y;
    if (w <= 0 || h <= 0 || y >= ${H}) { out.push({ n, missing: sel + ' (off-screen)' }); continue; }
    const p = v => Math.round(v * 1000) / 10;
    out.push({ n, x: p(x / ${W}), y: p(y / ${H}), w: p(w / ${W}), h: p(h / ${H}) });
  } return out; })()`;

(async () => {
  try {
    const session = await setup();
    const { send, ev } = await browser();
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
    const store = `localStorage.clear(); localStorage.setItem('mapit_seen_landing','1'); localStorage.setItem('mapit_welcomed_${uid}','1');
      localStorage.setItem('mapit_sessions', JSON.stringify({'${uid}':{session:${JSON.stringify(session)},nickname:'Demo User',last_login:new Date().toISOString()}}));`;
    const fresh = async (loggedIn = true) => {
      await send('Page.navigate', { url: BASE + '/' }); await sleep(1200);
      await ev(loggedIn ? store : `localStorage.clear(); 1`);
      await send('Page.navigate', { url: BASE + '/' }); await sleep(1800);
      if (loggedIn) { await ev(`continueAs('${uid}')`); await sleep(7000); await ev(`setViewMode('list', false); 1`); await sleep(600); }
    };
    // Demo listing: a copy of the nearest real one with demo text, held only in this page
    const demo = `(() => { const src = ST.listings.find(l => l.category === 're') || ST.listings[0];
      const d = { ...src, id: 'demo-guide-listing', title: '2BHK Apartment for Rent (demo)', price: 28000, price_label: 'per month',
        description: 'Bright 2BHK near the main road, semi-furnished, 2 bathrooms, covered parking. (Demo listing for the User Guide.)',
        seller: { full_name: 'Demo Seller' }, address: 'Koramangala, Bengaluru', seller_id: 'demo-seller', reference_code: 'DEMO01', photos: [], cover_photo: null, views_count: 12,
        created_at: new Date(Date.now() - 2 * 86400e3).toISOString() };
      ST.listings = [d, ...ST.listings.filter(l => l.id !== d.id)]; return src ? 1 : 0; })()`;
    const capture = async (topic, marks) => {
      if (ONLY.length && !ONLY.includes(topic)) return;
      const m = await ev(MARKS(marks));
      const r = await send('Page.captureScreenshot', { format: 'webp', quality: 80 });
      fs.writeFileSync(path.join(OUT, `${topic}.webp`), Buffer.from(r.result.data, 'base64'));
      const missing = m.filter(x => x.missing);
      shots[topic] = { w: W, h: H, v: Date.now().toString(36), marks: m.filter(x => !x.missing) };
      console.log(`${topic}.webp`, Math.round(Buffer.from(r.result.data, 'base64').length / 1024) + ' KB', missing.length ? 'MISSING ' + JSON.stringify(missing) : '');
    };
    const want = t => !ONLY.length || ONLY.includes(t);

    // ── Signed-out screens ──
    if (want('start') || want('phone')) {
      await fresh(false);
      await ev(`goToStep('step-auth'); 1`); await sleep(500);
      await ev(`(() => { const t = [...document.querySelectorAll('#step-auth *')].find(e => e.children.length === 0 && /^\\s*Create Account\\s*$/.test(e.textContent)); if (t) t.click(); return !!t; })()`); await sleep(500);
      await capture('start', [[1, '#googleBtn']]);
      await ev(`goToStep('step-phone-number'); 1`); await sleep(500);
      await capture('phone', [[1, '#step-phone-number input'], [3, '#step-phone-number .modal-link']]);
    }

    // ── Signed-in screens ──
    await fresh(true);
    console.log('listings loaded:', await ev(`ST.listings.length`));
    await capture('browse', [[2, '#catRow'], [3, '#sb-content .lr-row'], [1, '#viewToggle']]);
    await ev(`(() => { const i = document.getElementById('srchIn'); i.value = '2BHK'; i.dispatchEvent(new Event('input')); return 1; })()`); await sleep(700);
    await capture('search', [[1, '#srchIn'], [3, '#srchClear']]);
    await ev(`clearKeyword(); 1`); await sleep(400);

    await ev(`setViewMode('map', false); 1`); await sleep(1500);
    await ev(`toggleRadMenu({ stopPropagation(){} }); 1`); await sleep(500);
    await capture('radius', [[1, '#radChip'], [2, '#radMenu']]);
    await ev(`document.getElementById('radMenu').classList.remove('open'); setSearchMode('explore'); 1`); await sleep(1200);
    await capture('explore', [[1, '#smExplore'], [2, '#exploreSearchBox'], [3, '#smPin']]);
    await ev(`setSearchMode('pin'); setViewMode('list', false); 1`); await sleep(1200);

    await ev(`openPinsModal(); 1`); await sleep(1500);
    await ev(`(window.addPinMap || window._addPinMap)?.invalidateSize?.(); 1`); await sleep(4000);
    await capture('home', [[2, '#addPinSearchIn']]);
    await fresh(true);

    if (await ev(demo)) {
      await ev(`renderSidebar(); selListing('demo-guide-listing', true); 1`); await sleep(2500);
      await capture('view', [[1, '.ld-info-top'], [2, '.ld-dist-bar'], [3, '#interestBtn']]);
      await capture('save', [[1, '#favBtn'], [2, '#tab-fav']]);
      await ev(`openInterestNote(); 1`); await sleep(600);
      await capture('contact', [[1, '#interestBtn'], [2, '#interestBox']]);
      await ev(`openReportModal('demo-guide-listing'); 1`); await sleep(600);
      await capture('report', [[2, '#reportReasons'], [3, '#reportNote']]);
      await ev(`closeReportModal(); 1`);
    } else console.log('no listings in range — detail shots skipped');

    await fresh(true);
    await ev(`openPostModal(); 1`); await sleep(2000);
    await ev(`document.getElementById('postPickerMap').scrollIntoView({block:'end'}); 1`); await sleep(800);
    await capture('post', [[2, '#postCat, #postCategory, .post-body select'], [3, '#postPickerMap']]);
    await fresh(true);
    await ev(`switchTab('mine'); 1`); await sleep(2500);
    await capture('myads', [[1, '#tab-mine'], [2, '.fav-card']]);
    await ev(`switchTab('browse'); 1`); await sleep(800);

    await ev(`toggleAvatarMenu(); 1`); await sleep(500);
    await capture('profile', [[1, '#uavMenu .uav-item[onclick*=openProfileModal]'], [2, '#uavMenu .uav-item[onclick*=changeNickname]'], [3, '#uavMenu .uav-signout']]);
    await capture('legal', [[1, '#uavMenu a[href="/terms"]']]);
    await ev(`toggleAvatarMenu(); openFeedbackModal(); 1`); await sleep(600);
    await capture('feedback', [[2, '#fbTypeRow'], [3, '#feedbackModal .modal-btn, #feedbackModal button[onclick*=submit]']]);

    fs.writeFileSync(SHOTS_JS, '// Generated by scripts/guide-shots.js — positions are % of a 390×844 phone screen.\nwindow.GUIDE_SHOTS = ' + JSON.stringify(shots, null, 1) + ';\n');
    console.log('wrote shots.js with', Object.keys(shots).length, 'topics');
    await send('Browser.close').catch(() => {});
  } catch (e) { console.log('ERROR', e.message || e); }
  finally {
    if (proc) try { proc.kill(); } catch {}
    if (listingId) { const { error } = await supabaseAdmin.from('listings').delete().eq('id', listingId); console.log('cleanup: pending demo listing deleted by ID', error ? 'ERROR ' + error.message : 'OK'); }
    if (uid) { const { error } = await supabaseAdmin.auth.admin.deleteUser(uid); console.log('cleanup: throwaway user deleted by ID', error ? 'ERROR ' + error.message : 'OK'); }
    process.exit(0);
  }
})();
