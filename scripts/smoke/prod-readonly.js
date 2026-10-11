// Production smoke test — READ-ONLY (Session 9K, 2026-10-10).
// Run after every uat → main release, or after any Vercel env change:
//   npm run smoke:prod
// No login, no accounts, no writes: production data is real user data since
// the 9K UAT/prod split, so a smoke test must never create anything there.
// The radius check calls the public listings_within_radius RPC with prod's
// public anon key (exactly what a browser can do) and only counts the ids.
// Needs no .env. Uses git to compare the served page with origin/main.
const crypto = require('crypto'), { execSync } = require('child_process');

// Canonical host is www: Vercel 308-redirects the bare domain to it.
const PROD = 'https://www.mapit.co.in';
const UAT  = process.env.UAT_BASE_URL || 'https://mapit-backend-git-uat-nagesh-n-arun.vercel.app';
const PROD_REF = 'jneoxwumccmjwaojfazh', UAT_REF = 'xesekrkxbtybbxpsvxuz';
const ref = url => url?.split('//')[1]?.split('.')[0];
const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
const jwtPayload = t => { try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()); } catch { return {}; } };

const results = [];
function check(id, desc, pass, evidence) {
  results.push({ id, pass });
  console.log(`${pass ? '✅' : '❌'} ${id}  ${desc}\n      ${evidence}`);
}
async function get(url, opts = {}) {
  const t = Date.now();
  const res = await fetch(url, { redirect: 'manual', ...opts });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, headers: res.headers, text, json, ms: Date.now() - t };
}

(async () => {
  // S-01 · homepage is the code on main
  const home = await get(PROD + '/');
  let mainHtml = '';
  try {
    execSync('git fetch -q origin main', { stdio: 'ignore' });
    mainHtml = execSync('git show origin/main:public/index.html', { encoding: 'utf8', maxBuffer: 50e6 });
  } catch { /* git unavailable */ }
  const norm = s => s.replace(/\r\n/g, '\n');
  check('S-01', 'Homepage loads and is exactly public/index.html from origin/main',
    home.status === 200 && mainHtml && norm(home.text) === norm(mainHtml),
    `HTTP ${home.status} · ${home.ms} ms · served ${sha(norm(home.text))} vs main ${mainHtml ? sha(norm(mainHtml)) : 'n/a'}`);

  // S-02 · bare domain and http:// end up on https://www
  const apex = await get('https://mapit.co.in/');
  const http = await get('http://mapit.co.in/');
  const apexTo = apex.headers.get('location') || '', httpTo = http.headers.get('location') || '';
  check('S-02', 'mapit.co.in → https://www.mapit.co.in and http:// → https:// (permanent redirects)',
    [301, 308].includes(apex.status) && apexTo.startsWith(PROD) && [301, 308].includes(http.status) && httpTo.startsWith('https://'),
    `mapit.co.in → ${apex.status} ${apexTo} · http → ${http.status} ${httpTo}`);

  // S-03 · prod config points at the PROD Supabase project
  const cfg = await get(PROD + '/api/config');
  const claims = jwtPayload(cfg.json?.supabaseAnonKey || '');
  check('S-03', 'Production /api/config → prod Supabase project, anon (public) key',
    cfg.status === 200 && ref(cfg.json?.supabaseUrl) === PROD_REF && claims.role === 'anon' && claims.ref === PROD_REF,
    `project ${ref(cfg.json?.supabaseUrl)} · key role=${claims.role} ref=${claims.ref}`);

  // S-04 · uat preview points at the UAT project (the split, seen from both sides)
  const ucfg = await get(UAT + '/api/config');
  check('S-04', 'uat preview /api/config → separate UAT project',
    ref(ucfg.json?.supabaseUrl) === UAT_REF, `uat → ${ref(ucfg.json?.supabaseUrl)} (HTTP ${ucfg.status})`);

  // S-05 · API up
  const st = await get(PROD + '/api/auth/status');
  check('S-05', 'API is up (/api/auth/status)', st.status === 200 && st.json?.status === 'ok', `HTTP ${st.status} · ${st.ms} ms`);

  // S-06 · protected routes refuse anonymous calls
  const prot = await Promise.all([
    get(PROD + '/api/listings?lat=12.97&lng=77.59'),
    get(PROD + '/api/auth/me'),
    get(PROD + '/api/auth/otp/phone/status'),
    get(PROD + '/api/listings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
  ]);
  check('S-06', 'Protected routes return 401 without a login (incl. POST /api/listings)',
    prot.every(r => r.status === 401), prot.map(r => r.status).join(' · '));

  // S-07 · radius search on prod data (ids only, counted)
  let rpc = { status: 0, json: null };
  if (cfg.json?.supabaseUrl) {
    rpc = await get(`${cfg.json.supabaseUrl}/rest/v1/rpc/listings_within_radius`, {
      method: 'POST',
      headers: { apikey: cfg.json.supabaseAnonKey, Authorization: 'Bearer ' + cfg.json.supabaseAnonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_lat: 12.9716, user_lng: 77.5946, radius_m: 10000 }),
    });
  }
  // 0 is valid: prod test data was cleared on 2026-10-10 (Session 9K step 8), so
  // the map starts empty until real users post. This checks the RPC works.
  check('S-07', 'Radius search (RPC) answers within 10 km of central Bangalore (0+ listings)',
    rpc.status === 200 && Array.isArray(rpc.json),
    `HTTP ${rpc.status} · ${Array.isArray(rpc.json) ? rpc.json.length + ' listings' : JSON.stringify(rpc.json)?.slice(0, 120)}`);

  // S-08 · CORS whitelist (Rule 8): mapit.co.in allowed, others not
  const good = await get(PROD + '/api/auth/status', { headers: { Origin: PROD } });
  const bad  = await get(PROD + '/api/auth/status', { headers: { Origin: 'https://evil.example' } });
  const acaoGood = good.headers.get('access-control-allow-origin'), acaoBad = bad.headers.get('access-control-allow-origin');
  check('S-08', 'CORS allows www.mapit.co.in and refuses other origins (never *)',
    acaoGood === PROD && !acaoBad, `www.mapit.co.in → ${acaoGood} · evil.example → ${acaoBad || '(none)'} (HTTP ${bad.status})`);

  // S-09 · security headers (helmet; CSP intentionally off — Rule 9)
  const h = home.headers;
  check('S-09', 'Security headers present (HSTS, nosniff, frame protection)',
    !!h.get('strict-transport-security') && h.get('x-content-type-options') === 'nosniff' && !!h.get('x-frame-options'),
    `HSTS=${!!h.get('strict-transport-security')} · nosniff=${h.get('x-content-type-options')} · x-frame-options=${h.get('x-frame-options')}`);

  // S-10 · no secrets in the served page (Rule 8)
  const SECRET_PATTERNS = [/service_role/, /SUPABASE_SERVICE_ROLE_KEY/, /MSG91_AUTH_KEY/, /ANTHROPIC_API_KEY/, /sk-ant-[A-Za-z0-9]/, /\bre_[A-Za-z0-9]{20,}/];
  const leaks = SECRET_PATTERNS.filter(p => p.test(home.text)).map(String);
  check('S-10', 'Served page contains no server secrets', leaks.length === 0, leaks.length ? 'found: ' + leaks.join(', ') : 'none found');

  // S-11 · static assets (User Guide screenshots) served
  const shots = await get(PROD + '/guide/shots.js');
  check('S-11', 'Static assets served (/guide/shots.js)', shots.status === 200 && shots.text.includes('GUIDE_SHOTS'), `HTTP ${shots.status} · ${shots.text.length} bytes`);

  // S-12 · responsiveness (warm)
  const warm = await get(PROD + '/api/config');
  check('S-12', 'Warm API response under 1.5 s', warm.ms < 1500, `/api/config ${warm.ms} ms (first call ${cfg.ms} ms — includes any cold start)`);

  const pass = results.filter(r => r.pass).length;
  console.log(`\n${pass}/${results.length} PASS — read-only, nothing written to production.`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(err => { console.error('💥 ' + err.message); process.exit(1); });
