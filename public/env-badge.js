// ============================================================
// Test-environment watermark (2026-11-14, Nagesh's request)
// A large, faint, diagonal "UAT · TEST DATA" (uat + Vercel previews) or
// "LOCAL TEST" (localhost) across the whole screen, plus [UAT] / [LOCAL] in
// the tab title — so nobody has to read the URL to know where they are.
// Production NEVER shows it, two ways:
//   1. on www.mapit.co.in / mapit.co.in the script stops before any request;
//   2. elsewhere it only shows when /api/config says environment is NOT
//      'production' — and if that call fails, it shows nothing (fail-safe).
// pointer-events:none → taps and map drags pass straight through.
// Included by MapIt_MVP_v1.html (= public/index.html), review.html, admin.html.
// ============================================================
(function () {
  var h = location.hostname;
  if (h === 'www.mapit.co.in' || h === 'mapit.co.in') return;
  var api = (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:3001' : '';
  fetch(api + '/api/config', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (cfg) {
      var env = cfg && cfg.environment;
      if (!env || env === 'production') return;
      var uat = env === 'preview';
      var tag = uat ? '[UAT] ' : '[LOCAL] ';
      if (document.title.indexOf(tag) !== 0) document.title = tag + document.title;
      if (document.getElementById('env-watermark')) return;
      var el = document.createElement('div');
      el.id = 'env-watermark';
      el.setAttribute('aria-hidden', 'true');
      var t = document.createElement('span');
      t.textContent = uat ? 'UAT · TEST DATA' : 'LOCAL TEST';
      el.appendChild(t);
      el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;' +
        'display:flex;align-items:center;justify-content:center;overflow:hidden;';
      t.style.cssText = 'transform:rotate(-30deg);white-space:nowrap;user-select:none;' +
        'font:800 clamp(44px,11vw,150px)/1 system-ui,-apple-system,"Segoe UI",sans-serif;' +
        'letter-spacing:.04em;opacity:.14;color:' + (uat ? '#d32f2f' : '#5f6368') + ';' +
        '-webkit-text-stroke:1px ' + (uat ? '#d32f2f' : '#5f6368') + ';';
      document.body.appendChild(el);
    })
    .catch(function () { /* fail-safe: no watermark */ });
})();
