#!/usr/bin/env node
// One-off splitter for the frontend split (Option 1, 2026-11-15).
// Cuts MapIt_MVP_v1.html into public/index.html + public/css/app.css + public/js/*.js,
// moving code only (consecutive slices, original order, cut at section banners).
//
//   node scripts/frontend/split.js           → write the files
//   node scripts/frontend/split.js --check   → rebuild the original from public/ and compare it
//                                              byte for byte with MapIt_MVP_v1.html at BASE_COMMIT
// The --check only holds for the split release itself; after the first real edit the pieces
// will (rightly) differ. See docs/technical/frontend-split-plan.md.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PUB = path.join(ROOT, 'public');
const BASE_COMMIT = '21cf1ef';
const VERSION = 'split1';

const STYLE = { open: 34, close: 819 };   // <style> … </style> (1-based line numbers)
const SCRIPT = { open: 1521, close: 5888 }; // inline <script> … </script>
// [file, first line] — each slice runs to the line before the next one starts.
const JS = [
  ['config.js', 1522], ['core.js', 1957], ['auth.js', 2158], ['map.js', 3011],
  ['listings.js', 3409], ['chat.js', 3808], ['post.js', 4048], ['controls.js', 4806],
  ['gallery.js', 5195], ['account.js', 5505], ['main.js', 5850],
];

const header = (file, a, b) =>
  `// MapIt frontend: ${file}. Split from MapIt_MVP_v1.html lines ${a}-${b} on 2026-11-15. ` +
  `Load order is set in public/index.html. Functions are global on purpose (inline onclick=).\n`;
const cssHeader = `/* MapIt frontend styles. Split from MapIt_MVP_v1.html lines ${STYLE.open + 1}-${STYLE.close - 1} on 2026-11-15. */\n`;

function original() {
  const s = execSync(`git show ${BASE_COMMIT}:MapIt_MVP_v1.html`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 50e6 });
  if (s.includes('\r\n')) throw new Error('expected LF line endings');
  return s;
}

function split() {
  const src = original();
  const L = src.split('\n'); // L[i] = line i+1; last element '' after the final newline
  const line = n => L[n - 1];
  if (line(STYLE.open) !== '<style>' || line(STYLE.close) !== '</style>') throw new Error('style markers moved');
  if (line(SCRIPT.open) !== '<script>' || line(SCRIPT.close) !== '</script>') throw new Error('script markers moved');
  const slice = (a, b) => L.slice(a - 1, b).join('\n') + '\n'; // lines a..b inclusive

  fs.mkdirSync(path.join(PUB, 'css'), { recursive: true });
  fs.mkdirSync(path.join(PUB, 'js'), { recursive: true });
  fs.writeFileSync(path.join(PUB, 'css', 'app.css'), cssHeader + slice(STYLE.open + 1, STYLE.close - 1));

  const tags = [];
  JS.forEach(([file, a], i) => {
    const b = (JS[i + 1] ? JS[i + 1][1] : SCRIPT.close) - 1;
    const first = line(a);
    if (i > 0 && !first.startsWith('// ═')) throw new Error(`${file}: line ${a} is not a section banner`);
    fs.writeFileSync(path.join(PUB, 'js', file), header(file, a, b) + slice(a, b));
    tags.push(`<script src="/js/${file}?v=${VERSION}"></script>`);
  });

  const html =
    slice(1, STYLE.open - 1) +
    `<link rel="stylesheet" href="/css/app.css?v=${VERSION}">\n` +
    slice(STYLE.close + 1, SCRIPT.open - 1) +
    tags.join('\n') + '\n' +
    L.slice(SCRIPT.close).join('\n'); // rest of the file, keeps the final newline
  fs.writeFileSync(path.join(PUB, 'index.html'), html);
  console.log(`split done: index.html + css/app.css + ${JS.length} js files (v=${VERSION})`);
}

function check() {
  const strip = s => s.slice(s.indexOf('\n') + 1); // drop the one-line header
  let html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
  const css = strip(fs.readFileSync(path.join(PUB, 'css', 'app.css'), 'utf8'));
  html = html.replace(`<link rel="stylesheet" href="/css/app.css?v=${VERSION}">\n`, `<style>\n${css}</style>\n`);
  const js = JS.map(([f]) => strip(fs.readFileSync(path.join(PUB, 'js', f), 'utf8'))).join('');
  const tags = JS.map(([f]) => `<script src="/js/${f}?v=${VERSION}"></script>\n`).join('');
  if (!html.includes(tags)) { console.error('✗ script tags missing or out of order in index.html'); process.exit(1); }
  html = html.replace(tags, `<script>\n${js}</script>\n`);
  const ok = html === original();
  console.log(ok ? `✓ pure move: rebuilt file is byte-identical to MapIt_MVP_v1.html @ ${BASE_COMMIT}`
                 : '✗ NOT identical: something other than a move changed');
  process.exit(ok ? 0 : 1);
}

process.argv.includes('--check') ? check() : split();
