# Frontend Split (Option 1): Plan

Created 2026-11-15 (UAE). Approved by Nagesh on 2026-11-15: delete `MapIt_MVP_v1.html`, use 11 JS files.
Branch: `feat/frontend-split` (from main `21cf1ef`).

## What changes
`MapIt_MVP_v1.html` (5,891 lines) is split into `public/index.html` (HTML only), `public/css/app.css` and
11 `public/js/*.js` files, loaded with plain `<script>` tags in a fixed order. There is no build tool and the
URL stays the same. Functions stay global, so the 139 inline `onclick=` handlers keep working.
`public/` becomes the only frontend source, which ends the Two-File Rule.

## Rule: move code, change nothing
- The code is cut as consecutive slices, in the original order, only at the existing `// ════` section banners.
- `node scripts/frontend/split.js --check` rebuilds the original file from the pieces and compares it byte for
  byte with `MapIt_MVP_v1.html` at commit `21cf1ef` (a golden-master check).
- The check applies to this release only. After the first real edit, the pieces will (rightly) differ.

| File | Original lines | Contents |
|---|---|---|
| `css/app.css` | 35–818 | all styles |
| `js/config.js` | 1522–1956 | API_URL, tiles, categories, listing fields, auto-title |
| `js/core.js` | 1957–2157 | family switch, state (`ST`), utilities, API service |
| `js/auth.js` | 2158–3010 | sign-in (email / OTP / Google), profile, home location, sign out, sidebar chips |
| `js/map.js` | 3011–3408 | map, hover card, fetching listings |
| `js/listings.js` | 3409–3807 | saved, My Ads, categories, sidebar, listing selection |
| `js/chat.js` | 3808–4047 | chat + realtime, share link |
| `js/post.js` | 4048–4805 | post-listing modal (the wizard grows here) |
| `js/controls.js` | 4806–5194 | pins, map controls, Explore Area search, in-app dialog |
| `js/gallery.js` | 5195–5504 | photo viewer, welcome page |
| `js/account.js` | 5505–5849 | mark sold, feedback, view profile, report, inbox |
| `js/main.js` | 5850–5887 | keyword search, `init()` (must stay last) |

## Steps
1. Splitter and check script (`scripts/frontend/split.js`)
2. Run the split; tags carry `?v=split1` for cache-busting
3. Scan for code that runs at load time and uses something from a later file (it would now fail)
4. Retire the Two-File Rule: CLAUDE.md, smoke S-01 (compare every js/css file with main), docs, permissions
5. Test: uat:9c / uat:review / uat:photos, before/after screenshots, full localhost click-test (Nagesh)
6. Release: uat → family click-test → PR (Pull Request) to main → `smoke:prod`

## Risks
- Partial failure: an error now stops only its own file, so the app can half-work. The click-test must cover every area.
- Top-level `const`/`let` are shared between classic scripts but are not `window` properties. A function in a later
  file does not exist yet while an earlier file is still loading (step 3).
- Stale cache: bump `?v=` whenever a file changes. `express.static` revalidates with an ETag on every load.
- Rollback: frontend only, no database change → Vercel "Instant Rollback".
