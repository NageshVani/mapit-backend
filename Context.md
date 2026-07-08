# 🧠 Session Context — MapIt Backend

> **How to use:** Ask Claude Code to update this file every 10–15 messages.
> Start a new session with: "Read CONTEXT.md and continue from where we left off."

---

## 📌 Project Overview
- **Project:** MapIt — location-first buy-and-sell marketplace for India (and USA)
- **Stack:** Node.js + Express (Vercel serverless) · Supabase (DB + Auth + Storage) · Resend (SMTP) · Leaflet.js (maps) · Single-file vanilla JS frontend
- **Root directory:** `/Users/nageshnagarajarao/Documents/Mapit project/mapit-backend` *(MacBook Air — migrated from Windows 2026-06-08)*
- **Last updated:** 2026-07-08 (new branch `fix/session-04b-uat-fixes` cut from `main`, pushed to `origin` for Arun's UAT retest — see 🎯 Current Goal for full status; Session 5 item #2 remains parked on `feat/session-05-lead-scoring`, still blocked on `ANTHROPIC_API_KEY`)

---

## 🎯 Current Goal

**Session 04B — Arun's follow-up UAT fixes on Session 4, branch `fix/session-04b-uat-fixes` (2026-07-08) — CODE COMPLETE, COMMITTED, PUSHED TO `origin` for UAT retest, not yet merged to `uat`/`main`.** Cut from `main` (not from the still-parked `feat/session-05-lead-scoring`) so this fix batch stays isolated from the Anthropic-key-blocked Session 5 work. Addressed Arun's Session 4 UAT re-test findings:
- **A3 (Fail → Fixed):** keyword-search clear (×) button now actually appears — the show-logic set `style.display=''` which fell back to the base CSS `display:none` instead of overriding it; now sets `'block'` explicitly.
- **F17 (Fail → Fixed):** password-reset email was still linking to production instead of the UAT preview URL — the frontend appends a trailing `/` to satisfy Supabase's redirect glob, but the backend's allowlist/regex check in `src/routes/auth.js` didn't account for that trailing slash and always fell back to `https://www.mapit.co.in`. Fixed by normalizing the trailing slash only for the comparison (security check itself unchanged, Rule 8 preserved).
- **E14 (observation):** profile-step "Continue" button now stays `disabled` until the ToS checkbox is ticked.
- **E14 (observation):** home-location map enlarged 200px → 500px (2.5x, as requested); `.modal-box` gained `max-height:90vh; overflow-y:auto` since the taller map would otherwise clip the Save/Skip controls off-screen on phones.
- **F16 (observation, treated as its own step):** "Add New Location" (Profile → My Locations) rebuilt to mirror the first-login home-location flow exactly — tap-to-drop-pin map with drag-to-adjust and reverse-geocoded address — replacing the old "Use My Current Location" / "Enter GPS Coordinates" radio choice. The label input is the only addition on top of that flow, per Arun's instruction. Also: the "Remove" button is now hidden entirely when only one saved location exists, and disabled (with an explanatory tooltip) for the currently active location. Confirmed via code review that the backend `DELETE /api/pins/:id` already handles removing the default pin gracefully (auto-promotes another to default), so no backend change was made — this is a frontend-only UX guardrail.
- **Not in scope / not touched:** the general feedback that `docs/session-04-uat-checklist-Arun.html` doesn't persist pass/fail state across reloads — that's a bug in the standalone checklist document's own local-storage logic, not MapIt app code; flagged in Open Issues below, not yet fixed.
- **Verification done:** Two-File sync clean on every change; all `<script>` blocks in `MapIt_MVP_v1.html` parse without syntax errors (Node `new Function()` smoke check — no browser available in this environment, so manual click-through by Nagesh/Arun still needed before sign-off, especially the new Add-Location map init/teardown on repeated modal open/close).
- **Branch hygiene:** Nagesh's ~20 unrelated pre-existing uncommitted/untracked files, plus an in-progress uncommitted fix on `feat/session-05-lead-scoring` (interest-note listing lookup now also checks `ST.favListings`/`ST.myListings`), were stashed before cutting this branch and restored immediately after — same safety procedure used for prior branch switches.
- **Next:** push already done (`origin/fix/session-04b-uat-fixes`); awaiting Nagesh/Arun retest on this branch before promoting to `uat` then `main` (Rule 6 flow).

**Session 5 item #1 (seller notification email on "I'm Interested") is LIVE ON PRODUCTION (2026-07-06).** Sequence completed that day: `RESEND_API_KEY` confirmed in Vercel → merged to `uat` → live test on deployed `uat` preview surfaced a real bug (`.catch()` chained on a Supabase query builder, crashing the whole message-send on a buyer's first contact) → bug fixed (`64cfdff`) and re-pushed to `uat` → Nagesh re-tested, confirmed the notification email arrived and was readable in the inbox → `uat → main` merged (`d441152`) and pushed to production on Nagesh's own sign-off (chose not to wait for Arun this time). All of Session 4 + Explore Area toggle + Session 5 #1 are now live at `https://mapit.co.in`.

**Production smoke test passed (2026-07-06):** Nagesh tapped "I'm Interested" live on `mapit.co.in`; new `messages` row confirmed via Supabase and notification email confirmed received. Session 5 #1 is now fully closed out on production.

`public/og-image.png` created (2026-07-06) — see Completed section.

**Session 5 item #2 — Claude-based spam/lead-qualifying check — CODE COMPLETE, LOCALLY VERIFIED, NOT YET COMMITTED (2026-07-06).** Design spec agreed with Nagesh (see Decisions Made), built on new branch `feat/session-05-lead-scoring` (cut from `main`, which already has Session 5 #1). Key discovery during design: the "I'm Interested" tap sent identical fixed boilerplate text with no buyer-authored content for any classifier to read — fixed by replacing the one-tap send with an inline editable note box (placeholder hint, not pre-filled value; Send disabled until the buyer types something). Backend adds `src/utils/leadScoring.js` (Claude Haiku classification, fails open to `unscreened` on any error/timeout/missing key — never blocks or drops the seller email) and a `scoreAndNotify()` wrapper in `src/routes/messages.js`. New migration `004-lead-scoring.sql` (nullable `lead_verdict`/`lead_scored_at` on `messages`) already run by Nagesh in Supabase. End-to-end tested locally (after fixing an unrelated stale `.env` `APP_URL` port mismatch that was blocking local login with a CORS error) — confirmed `lead_verdict='unscreened'` persists correctly and the seller email arrives with the `[Unscreened]` flag, since no `ANTHROPIC_API_KEY` is configured yet.

**Blocked on:** `ANTHROPIC_API_KEY` — Nagesh wants Arun's sign-off first since it's a new recurring cost (Rule 11), however small. The feature is safe to leave in this state indefinitely (fails open, never breaks message sending) — real spam/genuine classification simply won't happen until the key is added. Committed (`cd74c99`) but not yet pushed to `uat`, not merged to `main`.

---

## ✅ Completed This Session

- ✅ **Session 04B — Arun's follow-up UAT fixes on Session 4 (2026-07-08, branch `fix/session-04b-uat-fixes`, commit `5d6b932`, pushed to `origin`):**
  - Cut from `main` (not `feat/session-05-lead-scoring`) to keep this fix batch isolated from the Anthropic-key-blocked Session 5 work; Nagesh's uncommitted working-tree files and Session 5's in-progress uncommitted fix were stashed/restored safely around the branch switch.
  - **A3 fix** — keyword-search clear (×) button: `document.getElementById('srchClear').style.display = ST.q ? '' : 'none'` → `'block'`; empty string doesn't override the base CSS `.srch-clear{display:none}` rule, so the button was silently staying hidden even when a keyword was typed.
  - **F17 fix** (`src/routes/auth.js`) — password-reset redirect validation now strips the trailing `/` (which the frontend appends to satisfy Supabase's `/**` redirect glob) before comparing against `ALLOWED_OAUTH_ORIGINS`/`isVercelPreview()`, but still passes the original value with the slash to Supabase. Previously the trailing slash caused every comparison to fail, silently falling back to production for both the UAT preview URL and any other trusted origin.
  - **E14 fix** — profile step "Continue" button (`#profileContinueBtn`) now starts `disabled`; new `updateProfileContinueState()` enables it only once `#tosCheck` is ticked. Existing `.modal-btn:disabled` CSS already covered the dimmed/not-allowed visual.
  - **E14 fix** — `#homeLocMap` height `200px → 500px` (2.5x). Added `max-height:90vh; overflow-y:auto` to `.modal-box` as a direct consequence — without it the taller map would push the Save/Skip controls off-screen on phones with limited viewport height.
  - **F16 fix** — "Add New Location" flow in the My Locations modal rebuilt from a "Use My Current Location" / "Enter GPS Coordinates" radio choice to a tap-to-drop-pin map (new `#addPinMap`, mirrors `initHomeLocMap()`'s pattern: draggable marker, reverse-geocoded address via Nominatim, Save button disabled until a pin is placed). New JS: `initAddPinMap()`, `_resolveAddPinAddr()`, rewritten `saveNewLocation()`; removed dead `toggleLocMethod()`, `addCurrentLocationPin()`, `addGpsLocationPin()`. Map initializes on `openPinsModal()` and tears down on `closePinsModal()` (same leak-avoidance pattern as the home-location map). `renderPinsList()` now omits the Remove button entirely when only one pin exists, and disables it (new `.pin-action-btn:disabled` CSS + tooltip) for the active pin — frontend-only guardrail; backend `DELETE /api/pins/:id` already promotes another pin to default gracefully, so no backend change was needed.
  - Two-File sync clean after every change; all `<script>` blocks verified to parse via a Node `new Function()` smoke check (no browser available in this environment — manual click-through still needed before sign-off).
  - **Not addressed:** the general feedback that the UAT checklist HTML doesn't persist pass/fail state across reloads — that's a separate bug in `docs/session-04-uat-checklist-Arun.html`'s own client-side logic, not app code; noted in Open Issues, not yet scheduled.
  - **Pushed** to `origin/fix/session-04b-uat-fixes` (2026-07-08) for Nagesh/Arun retest — not yet merged to `uat` or `main`.

- ✅ **Session 5 #2 — Claude-based spam/lead-qualifying check built, locally verified, and committed (2026-07-06, branch `feat/session-05-lead-scoring`, commit `cd74c99`):**
  - **Design decisions locked in with Nagesh** (all via explicit confirmation): check runs passively server-side, no separate Q&A gate; whatever the verdict, the seller email **always sends** (never silently dropped/blocked), only flagged `[Unscreened]` when not confirmed genuine; scoring criteria universal (not per-category); new additive-only migration approved.
  - **Blocking discovery**: today's "I'm Interested" tap sent identical fixed boilerplate text (`Hi! I'm interested in your listing "X". Please get in touch.`) — no buyer-authored content existed for any classifier to read. Resolved by making the note editable in place (small inline textarea, not a modal/separate gate) instead of a single-tap fixed send.
  - **New `src/utils/leadScoring.js`**: `scoreLead(noteText)` calls Anthropic's Messages API directly via raw `fetch` (no SDK, matches `email.js`'s lean-dependency pattern), model `claude-haiku-4-5-20251001`, `max_tokens:5` (one-word answer only). Buyer text passed as user-turn content wrapped in `<buyer_note>`, never concatenated into the system prompt — basic prompt-injection hygiene, since the model's output only ever narrows to a hard-validated enum (`spam`/`genuine`/`unscreened`), never trusted or interpolated directly. 4s timeout via `AbortController`. Never throws — missing key, network error, timeout, non-2xx, or unexpected output all resolve to `unscreened`.
  - **`src/routes/messages.js`**: new `scoreAndNotify(message, listing, buyerId, messageContent)` helper — awaits `scoreLead()`, persists the verdict with a single `await`-ed `.update()` inside try/catch (explicitly not a chained `.catch()` on the Supabase builder — the exact anti-pattern that caused the `64cfdff` bug), then calls `notifySellerOfInterest()`. That function gained a 4th `verdict` param: `genuine` path is byte-identical to before; any other verdict prepends an orange warning banner + `[Unscreened] ` subject prefix. Call site swapped one line: `notifySellerOfInterest(...).catch(...)` → `scoreAndNotify(...).catch(...)`, same fire-and-forget shape.
  - **New migration `database/migrations/004-lead-scoring.sql`**: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS lead_verdict TEXT` + `lead_scored_at TIMESTAMPTZ` — additive, nullable, no `CHECK` constraint (enum already enforced in app code per Rule 10). **Already run by Nagesh in Supabase** — confirmed via REST query.
  - **`.env.example`**: new `ANTHROPIC_API_KEY` entry added, matching the `RESEND_API_KEY` 2-line comment style.
  - **Frontend (`MapIt_MVP_v1.html`)**: `expressInterest()` split into `openInterestNote()` / `cancelInterestNote()` / `sendInterestNote()`. New `#interestBox` sibling `<div>` (inside `.ld-info-bar`, below `.ld-info-top` — avoids fighting the fixed-width 3-button `.ld-info-actions` row) with a `<textarea maxlength="500">` + Cancel/Send buttons, shown/hidden via this file's existing per-id `.hide` convention.
  - **UX refinement (post-review with Nagesh)**: textarea starts empty with the old boilerplate as a `placeholder` hint (not a pre-filled `value`) so every sent message is buyer-authored; Send button starts `disabled` and only enables once the textarea has non-empty content (`oninput="updateInterestSendState()"`). Rationale discussed: doesn't stop a scripted bot hitting the API directly, but raises the bar against low-effort drive-by taps and guarantees the classifier always has real content to work with.
  - Two-File sync done — `public/index.html` diff clean.
  - **Local CORS bug found + fixed (unrelated to this feature)**: local `.env` had a stale `APP_URL=http://localhost:3000` left over from an old dev setup, but the server actually runs on `PORT=3001` and serves the frontend itself via `express.static` — so the browser's `Origin: http://localhost:3001` wasn't in the CORS allowlist, blocking local login entirely. Fixed by correcting `APP_URL` to `http://localhost:3001` in the local (never-committed) `.env`.
  - **End-to-end verified locally** (no `ANTHROPIC_API_KEY` set yet): sent two real test messages via the new inline note box; confirmed via direct Supabase REST query that both rows got `lead_verdict='unscreened'` + `lead_scored_at` populated; Nagesh confirmed the seller notification email arrived with the `[Unscreened]` subject prefix and warning banner. This also re-validates the missing-key fail-open path (tested standalone via a throwaway script: missing key → `unscreened` with a console warning, never throws; invalid key → Anthropic 401 → `unscreened`, never throws).
  - **Deliberately not yet done**: `ANTHROPIC_API_KEY` creation — Nagesh wants Arun's financial sign-off first (new recurring cost, however small, per Rule 11). Feature is fully safe to leave in this state — everything fails open to `unscreened`, nothing is blocked or silently dropped.

- ✅ **`uat → main` merged and pushed to production (2026-07-06, merge commit `d441152`):** Nagesh chose to proceed on his own verification (message received + notification email read in inbox) rather than wait for Arun's separate sign-off. `git merge uat -m "..."` from `main` (real merge commit, matching the style of the prior `cec7848` promotion, not a fast-forward) — 8 files changed including `MapIt_MVP_v1.html` + `public/index.html` + `src/routes/messages.js` + `src/utils/email.js` + `src/server.js` + `src/middleware/errorHandler.js`. Pushed to `origin/main` — Vercel will deploy Session 4 (search redesign, CORS hardening), Explore Area toggle, and Session 5 #1 (seller notification) all to `https://mapit.co.in` together. Same stash-before-switch / stash-pop-after safety procedure used to protect ~20 unrelated uncommitted files in the working tree.
- ✅ **Bug found + fixed — `.catch()` chained on Supabase query builder crashed first-message sends (2026-07-06, commit `64cfdff`, pushed to `uat`):** Manual retest of the seller-notification flow on the deployed `uat` preview returned the error toast `Could not send: supabaseAdmin.from(...).select(...).eq(...).single(...).catch is not a function`. Root cause: `src/routes/messages.js` (pre-existing code from commit `96642c9`, unrelated to Session 5) chained `.catch(() => ({data:null}))` directly onto a `.single()` Postgrest query builder inside the inquiry-count-increment block, which only runs on a buyer's **first** message on a listing — i.e. every "I'm Interested" tap. The installed `supabase-js`/`postgrest-js` builder only implements `.then()`, not `.catch()`, so the chained call threw a `TypeError` that propagated up and failed the *entire* `POST /api/messages` request before the message was even inserted — meaning first-time "I'm Interested" sends have likely been silently broken in production this whole time, not just something introduced by the new email feature. **Fix:** wrapped the two Postgrest calls in a plain `try/catch` block instead of chaining `.catch()` on the builder (`src/routes/messages.js:168-182`); confirmed no other file in the codebase has the same anti-pattern (`grep -rn "\.catch(" src/`). Verified `node -c`, re-pushed to `uat`, Nagesh re-tested and confirmed the fix — message sent successfully and notification email received.
- ✅ **Session 5 #1 seller-notification verified end-to-end on deployed `uat` preview (2026-07-06):** After the hotfix above, Nagesh re-ran the "I'm Interested" test on the `uat` Vercel preview (`https://mapit-backend-git-uat-nagesh-n-arun.vercel.app`) — confirmed the message sent successfully and the seller-notification email arrived and was readable in the inbox. This is the first verification against the actual deployed environment (the 2026-07-02 test was local/dev only).
- ✅ **Session 5 #1 — merged to `uat` (2026-07-06):** Nagesh confirmed `RESEND_API_KEY` added to Vercel (Production + Preview scopes). Verified `origin/uat` was a direct ancestor of `feat/session-05-seller-notification` (clean fast-forward, no conflicts possible) before touching branches. Working tree had ~20 unrelated pre-existing uncommitted/untracked files (settings, skills, docs, session logs) not part of this feature — stashed with `git stash push -u` before switching branches, restored via `git stash pop` immediately after, to avoid mixing unrelated in-progress work into the merge. Merged `feat/session-05-seller-notification` (`df714d8`) → `uat` via `git merge --ff-only` (4 files: `.env.example`, `Context.md`, `src/routes/messages.js`, `src/utils/email.js`), pushed to `origin/uat`. Session 5 item #1 is now code-complete, live-send-verified, and live on the `uat` deployment.
- ✅ **Session 5 #1 — Seller notification email on "I'm Interested" (2026-07-02, branch `feat/session-05-seller-notification`, commit `df714d8`):**
  - New `src/utils/email.js` — `sendEmail({to,subject,html})` posts directly to the Resend REST API via native `fetch` (Node 18+, no SDK dependency added); `escapeHtml()` helper for interpolating buyer-supplied text into HTML email bodies safely
  - `src/routes/messages.js` — `notifySellerOfInterest(listing, buyerId, messageContent)` added; fires only on a buyer's **first** message per listing (reuses the existing inquiry-count `count === 0` check) so it won't spam the seller once Session 6 real-time chat exists; looks up seller email via `supabaseAdmin.auth.admin.getUserById()` (same admin-API pattern already used in `auth.js`) and buyer nickname via `profiles`
  - Called fire-and-forget (not awaited) after the message insert succeeds — a Resend outage or missing key can never fail the message send or the API response; errors are caught and logged without PII
  - `.env.example` — `RESEND_API_KEY` uncommented (was documented but inactive)
  - **Resend API key setup (2026-07-02):** the pre-existing `mapit-supabase` Resend key (used by Supabase's own SMTP integration for OTP/password-reset emails) could not be reused — Resend only ever shows a key's value once, at creation, and that one was created a month prior with no saved copy. Nagesh created a **new, separate key** (`mapit-backend`, "Sending access" only) — deliberate choice for blast-radius isolation: if this key is ever rotated/revoked, Supabase's auth emails keep working untouched, and vice versa. Added to local `.env` (value never shared in chat, only existence-checked via `grep -c`)
  - **Live send test (2026-07-02):** ran a one-off diagnostic script (scratchpad, not committed) that exercised the real `supabaseAdmin.auth.admin.getUserById()` + `sendEmail()` path against real Supabase data (a real UAT listing "MTB bike for fitness freaks", seller = Nagesh, buyer nickname = Arun) — Resend accepted the send, and **Nagesh confirmed the email was received** in `nagesh.aadi@gmail.com`. Feature is functionally proven end-to-end
  - Verified: `node -c` on both files, local server boots clean, `POST /api/messages` still correctly 401s unauthenticated requests — no regression to existing message-send flow
  - **Still not done (see 🎯 Current Goal for the 2 remaining steps):** `RESEND_API_KEY` not yet added to Vercel (Production + Preview); branch not yet merged to `uat`

- ✅ **Explore Area search mode toggle (2026-07-02, commit `efabd47`, pushed to `uat`, Arun-approved):**
  - New "Search Mode" toggle added to Browse sidebar between category filter and radius buttons
  - **"📍 My Locations"** (default): unchanged — searches from saved pin, orange dashed radius circle
  - **"🗺 Explore Area"**: blue dot marker tracks map centre in real-time; blue dashed radius circle follows pan; listings auto-reload 800ms after pan stops (`moveend` debounce)
  - `activeLoc()` returns `map.getCenter()` when `ST.exploreMode=true` — affects `loadListings()`, `updateCircle()`, hover card distances, and `renderFavs()` distances
  - `_onExploreMove()` wired to `map.on('move')` — moves `_exploreMarker` and shifts `radCircle.setLatLng()` for performance (no full re-create on every frame)
  - `_onExploreMoveEnd()` wired to `map.on('moveend')` — 800ms debounced `loadListings()`
  - Toggle greyed out (disabled class) on Saved and My Ads tabs via `switchTab()`
  - Radius label changes "Proximity Radius" → "Search Radius" in explore mode
  - Toast: "🗺 Explore mode — pan the map to search any area" on mode entry
  - Discussed and agreed in PDF: `docs/Search option MVP.pdf` — Nagesh's design, James (Claude) recommendation
  - Arun tested and commended: "That was really good"
  - Note: Claude has been fondly named **"James"** by Nagesh and Arun (reference: James Bond 007)

- ✅ **Session 4 UAT checklist updated for search redesign (2026-07-02):**
  - `docs/session-04-uat-checklist-Arun.html` rewritten — Block A (was "Location Search" 4 tests) → "Header Keyword Search" (3 tests); Block B (was "Keyword Filter sidebar" 2 tests) → "Explore Area Search Mode" (4 tests); Blocks C–G renumbered; total **19 checks** (was 18)
  - Block A tests: (1) 🔍 icon + instant keyword filter; (2) keyword + map pan = viewport-constrained results; (3) × clear restores all listings
  - Block B tests: (4) toggle visible in Browse sidebar; (5) Explore → blue dot + blue circle + toast + "Search Radius" label; (6) pan auto-reloads listings; (7) toggle greyed out on Saved/My Ads

- ✅ **Session 4 UAT report updated — automated UAT run on search redesign (2026-07-02):**
  - `docs/session-04-uat-report.html` updated: Block C entirely replaced with "Search Redesign — Keyword Header & Explore Area Mode" (17 new automated checks, all PASS)
  - Old Block B satellite tests (T-004/T-005/T-006) marked REPLACED — satellite toggle removed in `093d49f`; CartoDB Voyager now hardcoded; T-008 updated to test `_exploreMarker`
  - 5 new CHANGE entries added explaining Nominatim removal, keyword search, Explore Area, and satellite simplification
  - Summary: **44 PASS / 0 FAIL / 1 WARN / 3 REPLACED** across 48 total checks; footer updated to commit `efabd47`
  - Key finding: keyword search + Explore Area compose correctly — pan to area, type keyword, get viewport-filtered results from new centre

- ✅ **Arun UAT observation 2 — Post form 2-column layout (2026-06-30, commit `093d49f`, pushed to `uat`):**
  - `.post-box` widened from `max-width:520px → 840px`
  - `.post-body` is now a CSS grid: `grid-template-columns:1fr 1fr`
  - **Left column:** Category + Subcategory (inner `.form-row`), Transaction Type (RE only), Dynamic category fields (2-col subgrid via `#dynamicFields` grid), Title
  - **Right column:** Location, Photos, Phone visibility (radio stacked vertically)
  - **Full-width footer:** Description textarea + Submit button
  - `.dyn-section-hd` gets `grid-column:1/-1` so the "X Details" header spans both dyn-field columns
  - Responsive `@media(max-width:640px)` collapses everything back to 1 column
  - No JS changes needed — all `id` attributes preserved

- ✅ **Arun UAT observation 1 — Keyword search restored in header (2026-06-30, commit `093d49f`, pushed to `uat`):**
  - `srchIn` icon `📍→🔍`, placeholder `"Search listings by keyword…"`, clear button wired to `clearKeyword()`
  - Removed `srchDD` dropdown div from HTML; removed entire Nominatim block (~90 lines): `placeSearchPin`, `clearSearchCenter`, `fetchLocSuggestions`, `renderLocDD`, `pickLocResult`, `_locTimer`, `srchInEl` Nominatim listeners
  - Removed sidebar `#kwrdBox` / `#kwrdIn` and their CSS (`.kwrd-box`, `.kwrd-box.disabled`, `.srch-dd*`)
  - `ST.searchCenter` state removed; `activeLoc()` reverted to `ST.activePin` / `DEFAULT_LOC` only; `_searchMarker` removed
  - `filtered()` updated: when `ST.q` is set, also filters by `map.getBounds().contains([lat,lng])` — results respect the current map viewport and zoom
  - `switchTab()` now inlines keyword-state reset (no `clearKeyword()` call) to avoid double `renderFavs`/`renderMyAds` API calls
  - New `clearKeyword()` function for standalone use (× button and any future callers)

- ✅ **`uat → main` merged (2026-06-29, merge commit `cec7848`):** Arun confirmed sign-off on A9/C4/I3 fixes; all Session 3 + Arun-UAT fixes now on production at `https://mapit.co.in`

- ✅ **Session 4 — Unified Location Search (2026-06-29, commit `e1d4e7e`, pushed to `uat`):**
  - Header `srchIn` bar replaced: now does Nominatim forward geocoding (place name → coordinates)
  - Dropdown shows up to 5 place suggestions from `nominatim.openstreetmap.org` (400ms debounce)
  - Selecting a result: sets `ST.searchCenter`, drops a blue pin (`_searchMarker`) on map, re-centers radius circle, calls `loadListings()` from new center
  - `×` clear button resets `ST.searchCenter` → restores home-pin behaviour
  - `activeLoc()` updated to use `ST.searchCenter` when set (priority over home pin)
  - Keyword filter `#kwrdIn` added to sidebar between rad-box and tab-bar; filters `ST.listings` in place; disabled on Saved/My Ads tabs
  - `countrycodes=in` Nominatim param limits suggestions to India (correct for Bangalore MVP)

- ✅ **Session 4 — Satellite Toggle + Map UX (2026-06-29, commit `772e7bf`, pushed to `uat`):**
  - 🛰 button top-right of map: toggles between CartoDB Voyager and ESRI WorldImagery (free, no API key)
  - `_voyagerLayer` / `_satLayer` / `_satOn` variables; `toggleSatellite()` swaps tile layers on map
  - `selListing()`: changed `panTo` → `flyTo(zoom 16)` for My Ads / Saved tabs — pin always flies into view
  - For Browse tab: `flyTo(max(currentZoom, 14))` preserves context without over-zooming
  - Min 1 photo: frontend toast guard before submit + uploads route already rejects empty payloads
  - Canvas renderer: `L.canvas()` passed to `L.map()` — lighter on low-end Android (no per-pin DOM nodes)
  - `step-homeloc` UX: tap-instruction label (orange), orange map border, draggable marker, "drag to adjust" hint on pin-place, CartoDB Voyager tiles, `_resolveHomeLocAddr()` shared helper for click + dragend
  - OG / Twitter meta tags: `og:title`, `og:description`, `og:image`, `twitter:card` in `<head>` — WhatsApp rich preview cards when link shared
  - Perf: Leaflet `rel="preload"` hint; Google Fonts `media="print" onload` non-blocking
  - Page title: "MapIt — Buy & Sell Near You" (was "Bangalore Beta")

- ✅ **Session 4 — CORS Security Hardening (2026-06-29, commit `dc8199a`, pushed to `uat`):**
  - All hardcoded localhost/127.0.0.1 origins removed from `allowedOrigins` in `src/server.js`
  - Local dev uses `APP_URL` env var only (set in `.env`, never committed)
  - **BUG fixed:** CORS rejection was returning HTTP 500 → now correctly returns 403
  - **BUG fixed:** Stack trace was included in 4xx error responses in dev mode → gated to 5xx-only
  - Both fixes found + applied during Session 4 UAT automated testing

- ✅ **Session 4 UAT (2026-06-29) — 30/30 automated tests PASS:**
  - `docs/session-04-uat-report.html` written
  - 2 inline security fixes: CORS 500→403; errorHandler stack trace gate for 4xx
  - Manual checklist pending (tester name not yet received)

- ✅ **Arun Session 2 UAT failures fixed (2026-06-29, commit `7919558`, pushed to `uat`):**
  - **A9 — Home location showed "Koramangala" instead of saved address:** Root cause: `step-homeloc` saved to `profiles.home_*` only; `initApp()` reads `user_pins` for the header badge; new users had no pins so the hardcoded HTML default "Koramangala" in `activePinLabel` was never replaced. Fix: `saveHomeLocation()` now also calls `POST /api/pins` with the saved coordinates + `is_default:true`; backend already handles unsetting other defaults.
  - **C4 — Password reset email linked to production (www.mapit.co.in) not UAT:** Root cause: Supabase redirect URL allowlist entry `https://mapit-backend-*.vercel.app/**` requires a path (`/**` glob); bare `window.location.origin` has no path so Supabase silently dropped `redirect_to` and fell back to Site URL. Fix: `sendPasswordReset()` now sends `window.location.origin + '/'` (trailing slash satisfies `/**`); Nagesh also added bare-origin entry `https://mapit-backend-*.vercel.app` in Supabase Dashboard → Auth → Redirect URLs. Supabase email template confirmed correct (`{{ .ConfirmationURL }}`).
  - **I3 — Sign-in page flashed briefly during Google OAuth new-user flow:** Root cause: `authModal` had no `hide` class in the HTML — it was visible from first render with `step-auth` as the active step; the ~100–300ms between HTML render and JS execution caused the flash. Fix: added `hide` to `authModal` in HTML; all code paths that need to show it already call `classList.remove('hide')` explicitly.

- ✅ **UAT docs updated — session-03 report + checklist (2026-06-27, commit `83d4a34`, pushed to `uat`):**
  - **18 automated checks run** against `MapIt_MVP_v1.html` — all 18 PASS; results embedded in both docs
  - **`docs/session-03-uat-report.html` UPDATED** — total auto-tests 27 → 47 (+20); Block G (10 tests: tab ghosting CSS, active-tab border/tint/font, `white-space:nowrap`, views_count display, vehicle placeholders, `default:1` owners, 🔗 icon, `step-landing`); Block H (10 tests: `.rad-box.disabled` CSS, `switchTab` toggle, `selListing` re-enable, `openMyAds→switchTab` refactor, `ST.favListings` state, `renderFavs→drawMarkers`, `drawMarkers` fav branch, `fitBounds` auto-fit, `viewFav keepTab`, `listingRow` runtime keepTab); OBS-07/08/09 added; files-changed updated
  - **`docs/session-03-uat-checklist-nagesh.html` UPDATED** — 10 new manual tests: Block G (3: tab dimming, active-tab visual, view count), Block H (2: vehicle placeholders, default owners), Block I (5: radius greyed out on Saved/My Ads, all saved pins on map, pin click stays on Saved tab, panel card click stays on Saved tab, returning to Listings restores browse)
  - Header commit reference updated to `634e1f7 + be19c4e + d4226b4`; sign-off footer updated

- ✅ **listingRow keepTab fix (2026-06-27, commit `d4226b4`, pushed to `uat`):**
  - **Root cause:** `listingRow()` hardcoded `onclick="selListing('${l.id}')"` with no `keepTab` — clicking any listing row (including "Other saved listings" section) switched to browse tab
  - **Fix:** onclick now evaluates `ST.tab` at click time: `selListing('${l.id}', ST.tab==='fav'||ST.tab==='mine')` — browse tab unaffected (`keepTab=false`); Saved and My Ads stay on current tab

- ✅ **Proximity radius disabled on Saved/My Ads tabs + Saved tab map redesign (2026-06-27, commit `be19c4e`, pushed to `uat`):**
  - **`.rad-box.disabled` CSS** — `opacity:.4; pointer-events:none;` greyes out and blocks the entire radius section
  - **`switchTab()` updated** — toggles `disabled` class on `.rad-box` when `tab !== 'browse'`; also calls `drawMarkers()` on every tab switch to immediately update map
  - **`openMyAds()` refactored** — now calls `switchTab('mine')` instead of setting `ST.tab` directly; side-effect: fixes bug where "My Ads" tab button was never highlighted when opened from profile menu
  - **`selListing(!keepTab)` re-enables radius** — safety guard for when `selListing` forces browse tab without going through `switchTab`
  - **`ST.favListings[]` added to state** — separate array for saved listings with lat/lng; independent of `ST.listings` (browse) and `ST.myListings`
  - **`renderFavs()` updated** — stores fetched listings into `ST.favListings`; calls `drawMarkers()` after both success and empty-state paths
  - **`drawMarkers()` updated** — `const isFav = ST.tab === 'fav'`; uses `ST.favListings` on fav tab; calls `fitBounds(padding:[50,50], maxZoom:14)` when fav tab open and no listing selected; `cnt-badge` not updated when on fav tab
  - **`viewFav()` updated** — no longer calls `switchTab('browse')`; looks up in `ST.favListings`; calls `selListing(id, true)` (keepTab=true)
  - **`selListing()` updated** — looks up `ST.favListings` as additional fallback; icon update loop also looks up `ST.favListings`; full-detail fetch merges back into `ST.favListings` on fav tab
  - **`renderSidebar()` updated** — `if(ST.tab==='fav' && !ST.selId)` (was `if(ST.tab==='fav')`); `fl` now includes `ST.favListings` branch; listing lookup also checks `ST.favListings`; nav arrows pass `keepTab=true` for fav tab; "other" section uses "❤ Other saved listings" header on fav tab

- ✅ **Tester-6 family feedback — value proposition landing + share icon (2026-06-27, commit `5cc2dfe`, pushed to `uat`):**
  - **`step-landing` added** — new first modal step shown only to visitors with no stored sessions AND `mapit_seen_landing` not set in localStorage; 3 value bullets (📍 exact GPS pin, 🗺 live map browse, 🤝 free to post/browse)
  - **`startOnboarding()` added** — sets `mapit_seen_landing` flag and routes to `step-auth`; returning users skip landing entirely
  - **Share icon changed** — `⤴` → `🔗` in listing detail action bar; tooltip updated to "Copy link to share"; `shareListingUrl()` toast already used 🔗 so this is now consistent
  - **Deferred from Tester-6:** address search (forward geocoding via Nominatim — next session) and onboarding category prefs (pre-public-launch)

- ✅ **Session 3 UAT manual-checklist fixes (2026-06-27, commits `94054d1`→`a15d396`, pushed to `uat`):**
  - **E1 — view count bug FIXED (root cause: `requireAuth` on view endpoint):** JWT expiry caused the fire-and-forget `apiPost` to silently fail; removed `requireAuth` from `POST /api/listings/:id/view` — view counting now works for all authenticated and unauthenticated viewers
  - **Views count display added:** `👁 N views` shown in listing detail `ld-dist-bar` subtitle line (appears after full `GET /api/listings/:id` fetch resolves)
  - **Tab ghosting:** `.tab-btn:not(.on){ opacity:.45; }` — inactive tabs dimmed to 45% opacity; active tab gets light orange tint background `rgba(240,96,48,.1)`, `border-radius:6px 6px 0 0`, `1.5px solid orange` border, and `font-size:15px`
  - **Tab height jump fixed:** Added `white-space:nowrap; overflow:hidden` to `.tab-btn` base — prevents "📍 Listings [badge]" from wrapping when active font grows, keeping tab bar height constant across all three tabs
  - **Vehicle Brand/Model placeholders:** Added India-relevant `placeholder` examples to all 4 vehicle subcategories in `LISTING_FIELDS` (Cars: Maruti/Hyundai/Honda; 2 Wheelers: Honda/TVS/Hero; Cycles: Hero/BSA/Trek; Trucks: Tata/Mahindra)
  - **Default previous owners = 1:** Added `default:1` to `owners` field in Cars, 2 Wheelers, Trucks & Commercial; `renderDynamicFields()` now emits `value="${f.default}"` when defined

- ✅ **MVP Session 3 — Listing lifecycle (2026-06-24, commit `634e1f7`, pushed to `uat`):**
  - **Migration 002 applied** to Supabase (2026-06-24): `reference_code TEXT UNIQUE`, `expires_at TIMESTAMPTZ`, `show_phone TEXT DEFAULT 'always'`, `views_count INTEGER DEFAULT 0` — all 4 columns confirmed present
  - **`generateRefCode()`** added to `listings.js` — format `MP-BLR-XXXXXX` (6 chars from unambiguous alphabet: no 0/O/1/I)
  - **`POST /api/listings`** now sets `reference_code`, `expires_at` (now + 30 days), `show_phone` (validated: always/on_agreement/never)
  - **`PUT /api/listings/:id`** now accepts `show_phone` in allowed fields
  - **`POST /api/listings/:id/view`** fixed: was referencing `view_count` (no 's') — now correctly uses `views_count` to match migration 002 column
  - **Post form** — new "📞 Show My Phone Number to Buyers" radio group (Always / On Agreement / Never); `show_phone` sent in `submitListing()` payload
  - **Listing detail** — `Ref: MP-BLR-XXXXXX` shown in `ld-dist-bar` alongside address + time; buyers can quote when calling seller
  - **My Ads cards** — expiry countdown: `Expires in Xd` (muted) → orange warning at ≤5 days → red "⚠️ Expired"
  - **Delete button** (`🗑️ Del`) added to My Ads cards — `deleteListing()` with confirm dialog → `DELETE /api/listings/:id` → removes card from list without reload
  - **`.del-btn` CSS** added (red-tinted, matches `.sold-btn` style pattern)
  - `MapIt_MVP_v1.html` → `public/index.html` synced (diff clean)

- ✅ **Session 1 — Retrospective UAT report + checklist (2026-06-22, no commit yet):**
  - **Ran 37 automated checks** via file-system grep, diff, curl, dig, and node require — all passed; results embedded in both docs
  - **`docs/session-01-uat-report.html`** CREATED (82 KB, 1,426 lines) — dark-themed developer UAT report with sidebar nav; blocks A–G auto-verified (full result tables with exact values); blocks H–L manual check summaries; 6 observations (OBS-01 through OBS-06); 7 key architectural decisions; 10 files-created ledger; 9 next steps
  - **`docs/session-01-uat-checklist-nagesh.html`** CREATED (86 KB, 1,610 lines) — interactive 66-test checklist (same format as Session 2 Arun checklist); tester = Nagesh Nagaraja Rao; 37 tests pre-marked green (auto-verified); 29 manual tests in Blocks H–L with Supabase SQL, Vercel dashboard, and browser instructions; live progress bar + sign-off section
  - **Key observations documented:** uat.mapit.co.in → production (Vercel free tier limitation); migration 001 columns were missing until 2026-06-21 re-apply; single Supabase project (UAT + prod); OTP_RATE_LIMIT=100 locally (verify 10 in Vercel); invite_codes.used_by all NULL; 4 invite_codes with " 1" suffix on created_for names
  - **Explained why Session 1 has no curl-tested API routes** — housekeeping session; Session 2 introduced first testable routes; appropriate verification = file + live infra checks + manual dashboards

- ✅ **MVP Session 2 — UAT automated tests + 4 frontend bug fixes (2026-06-22, no new commit yet):**
  - **41 backend endpoint tests** via curl against local server: all passed — input validation, auth enforcement (JWT rejection), OAuth redirect allowlist (open-redirect blocked), CORS (7 origins tested), password reset, OTP rate limiting, logout graceful, invite-code validation
  - **BUG-01 (Critical) FIXED:** `verifyOtp()` lacked `needsProfile` check — OTP-fallback users with `nickname='MapIt User'` bypassed profile setup entirely; added same 5-condition check as `submitAuth()` with profile field pre-fill
  - **BUG-02 (Medium) FIXED:** `_refreshStaleSessionNames()` filter `!u.nickname` was truthy for `'MapIt User'` — stale sessions with placeholder nickname were never background-refreshed; changed filter to `(!u.nickname || u.nickname === 'MapIt User')`
  - **BUG-03 (Medium) FIXED:** `submitAuth()` Sign-In path didn't pre-fill `profileNicknameInput` from existing profile when routing to `step-profile`; added `else if` fallback from `data.profile?.nickname`
  - **BUG-04 (Minor) FIXED:** `handleOAuthCallback()` only routed to `step-profile` when `!data.profile` — Google OAuth users with existing placeholder profiles slipped through; added full `needsProfile` check
  - `MapIt_MVP_v1.html` → `public/index.html` synced after all fixes (diff clean)
  - **Created `docs/session-02-uat-report.html`** (53 KB) — full developer handover document: dark-themed, sidebar nav, all 41 test results, 4 bug cards with code diffs, 5 observations, files changed, next steps
  - **Created `docs/session-02-uat-checklist-arun.html`** (58 KB) — interactive 51-test checklist for Arun: Pass/Fail buttons, live progress bar, note fields on failures, tester info, sign-off section

- ✅ **MVP Session 2 — Nickname system (2026-06-21, commit `71dfba7`):**
  - **Create Account tab** now shows Full Name + Nickname fields (hidden on Sign In tab); both mandatory; validated before submit
  - **Nickname** is the primary display name everywhere: Who's using MapIt? buttons, header chip, profile menu `uavName`
  - `switchAuthTab()` shows/hides `registerNameFields` div; `submitAuth()` validates + stores `ST._pendingFullName`/`ST._pendingNickname`; pre-fills `step-profile` inputs automatically
  - `step-profile` also has a `profileNicknameInput` field (for OTP-path users who skip Create Account form)
  - `saveProfile()` sends `nickname` to backend; `ST.createdFor` now set to nickname (not full_name)
  - **"✏️ Change Nickname"** added to profile dropdown; calls `PUT /api/auth/nickname`; updates header chip + uavName live without reload
  - `showApp()` display name resolution: `profile.nickname → createdFor → full_name → email`
  - All `saveToMultiSessions()` calls now store `nickname`; `renderWhoamiScreen()` prefers `u.nickname`
  - Backend: `POST /api/auth/register` now accepts + validates + stores `nickname`; new `PUT /api/auth/nickname` route
  - `profiles.nickname TEXT` column already existed from migration 001 — no DB change needed

- ✅ **MVP Session 2 — Password reset flow (2026-06-21, commit `71dfba7`):**
  - **`redirectTo` fix**: `sendPasswordReset()` passes `window.location.origin`; backend validates against `ALLOWED_OAUTH_ORIGINS` + Vercel regex — same pattern as OAuth; reset link now goes to correct environment (UAT → UAT, prod → prod)
  - **Confirmation modal**: clicking "Send reset link" now shows `step-reset-sent` (📧 icon, email address, 1-hour expiry note, OK button) instead of a toast
  - **`handleOAuthCallback()`** now reads `type` param from URL hash; if `type=recovery` → shows `step-new-password` form instead of signing user in
  - **`step-new-password`**: new password + confirm field + show/hide toggle; calls `PUT /api/auth/password`
  - **New `PUT /api/auth/password`** backend route: uses `supabaseAdmin.auth.admin.updateUserById()` to set new password; requires auth (recovery token in ST.session)
  - Password reset flow is now end-to-end: request → email → click link → new password form → sign in

- ✅ **MVP Session 2 — Splash flash fix (2026-06-21, commit `71dfba7`):**
  - **Root cause**: main content (z-index 900) was briefly visible between modal dismissal and `initApp()` showing the splash (z-index 1200)
  - **Fix**: `showLoadingSplash()` helper shows splash immediately BEFORE hiding any modal; called in 5 places: `continueAs()`, `submitAuth()` (existing user), `verifyOtp()` (existing user), `handleOAuthCallback()` (existing user), `_closeAuthModal()` (new user after home location)
  - z-index stack: main ~900 → modals 1000 → splash 1200 → whoami 1300; splash correctly covers all main content

- ✅ **MVP Session 2 — Onboarding splash UX (2026-06-21, commit `71dfba7`):**
  - Font size: `.splash-msg` 13px → 16px; "Welcome to MapIt!" heading 15px → 18px; line-height increased
  - Removed "🤝 Tap I'm Interested…" bullet (5 bullets remain: GPS, map pins, filter, post listing, heart save)

- ✅ **MVP Session 2 — Rate limit fix (2026-06-21, commit `b1cdc56`, pushed to `uat`):**
  - **Root cause 1 (global limiter)**: `app.set('trust proxy', 1)` was missing — Vercel edge IP was used for rate limiting so ALL users shared one 100-req bucket, exhausted quickly during testing; now uses real client IP from `X-Forwarded-For`
  - **Root cause 2 (auth limiter)**: `authLimiter` (max 5/hr, named `OTP_RATE_LIMIT`) was applied to ALL `/api/auth` routes — signup + me + register = 3 calls per test cycle, 2 cycles → blocked; it should only guard OTP routes
  - **Fix**: `app.set('trust proxy', 1)` added before rate limiter setup in `server.js`; global limit raised 100→200 (per real IP); `authLimiter` removed from `/api/auth` bulk route
  - **Fix**: `otpLimiter` (10/hr, same `OTP_RATE_LIMIT` env var) added directly to `/send-otp` and `/verify-otp` in `auth.js` — only OTP endpoints are now rate-limited strictly

- ✅ **MVP Session 2 — "MapIt User" root cause fixed in submitAuth() (2026-06-21, commit `3d100ab`):**
  - **Root cause**: Old OTP-flow accounts already had a profile row (`full_name = nickname = 'MapIt User'`) so `isNewUser = false`; `step-profile` was skipped entirely on email+password sign-in → names never updated in DB
  - **Fix**: Added `needsProfile` flag in `submitAuth()` that also routes to `step-profile` when `data.profile.nickname` is missing or equals `'MapIt User'`; pre-fills from `ST._pendingFullName`/`ST._pendingNickname` or falls back to existing (non-placeholder) profile value
  - **DB join analysis**: `invite_code_legacy` was NULL for all profiles; `invite_codes` has no email column; joined via `auth.users` (SELECT p.id, u.email FROM profiles JOIN auth.users ON u.id=p.id) — Nagesh manually updated correct rows with real names, deleted remaining "MapIt User" rows
  - **localStorage diagnosis**: Clearing Chrome cookies/cache does NOT clear localStorage; stale "MapIt User" buttons in "Who's using MapIt?" were from `mapit_sessions` localStorage; fix: run `localStorage.clear()` in DevTools console, reload

- ✅ **MVP Session 2 — "Who's using MapIt?" nickname display fix (2026-06-21, commits `b1cdc56` + `55b9859`):**
  - **Root cause**: Old `mapit_sessions` localStorage entries had `name: 'Mapit User'` and `nickname: ''` from pre-MVP code; `renderWhoamiScreen()` falls through nickname → created_for → name → shows 'Mapit User'
  - **Fix 1 (`b1cdc56`)**: `continueAs()` now falls back to `data.profile?.full_name` when `data.profile?.nickname` is null — existing accounts without nickname set will get their full_name after first click-through
  - **Fix 2 (`55b9859`)**: `_refreshStaleSessionNames()` added — on `init()`, background-fetches `/api/auth/me` in parallel for every stored session with no nickname, updates localStorage cache, re-renders list automatically within ~1 second (no click required)
  - **Fix 3 (Supabase SQL, 2026-06-21)**: Migration 001 re-run; `nickname`, `home_lat`, `home_lng`, `home_address`, `agreed_tos_at` columns confirmed MISSING from profiles table and added; `UPDATE profiles SET nickname = full_name WHERE nickname IS NULL` backfilled all existing users

- ✅ **MVP Session 2 — Migration 001 re-applied (2026-06-21):**
  - Confirmed columns that existed: `auth_provider`, `default_view`, `phone`, `invite_code_legacy`
  - Confirmed columns that were MISSING (not actually applied previously): `nickname`, `home_lat`, `home_lng`, `home_address`, `agreed_tos_at`
  - All 5 missing columns added via single BEGIN/COMMIT block in Supabase SQL Editor
  - Nickname backfilled: `UPDATE profiles SET nickname = full_name WHERE (nickname IS NULL OR nickname = '') AND full_name IS NOT NULL`

- ✅ **MVP Session 2 — Supabase delete FK diagnosis (2026-06-21):**
  - User could not delete test account from Supabase Authentication dashboard
  - Root cause: FK constraint `feedback_user_id_fkey` on `feedback` table references `profiles.id`; `feedback → profiles` chain blocks profile delete, which blocks auth.users delete
  - Workaround: use Gmail `+alias` pattern (e.g. `nagesh.aadi+test1@gmail.com`) for test accounts — avoids cleanup entirely
  - User confirmed Create Account flow works with +alias email

- ✅ **MVP Session 2 — Auth modal fully rebuilt (2026-06-20):**
  - **New `step-auth`** replaces `step-invite` as the first screen: Sign In / Create Account tabs, email+password form, show/hide password toggle, Google OAuth button, "Use email OTP →" fallback
  - **`step-profile`** updated: ToS checkbox added; `agreed_tos_at` now written to DB on submission; `auth_provider` sent from frontend
  - **New `step-homeloc`**: inline Leaflet map picker after profile setup; tap to drop marker, reverse-geocodes via Nominatim; Save or Skip; writes `home_lat`/`home_lng`/`home_address` to profile
  - **New JS functions**: `switchAuthTab()`, `togglePwd()`, `submitAuth()`, `signInWithGoogle()`, `handleOAuthCallback()`, `sendPasswordReset()`, `initHomeLocMap()`, `saveHomeLocation()`, `skipHomeLocation()`
  - **`handleOAuthCallback()`** called at startup in `init()` — detects `#access_token=...` hash from Google redirect, restores session, routes to profile setup or app
  - **`sendOtp()`** updated: invite code removed from payload (open access)
  - **`continueAs()`** updated: session-expired path now pre-fills email in auth form, routes to `step-auth` (not `step-invite`)
  - **`signInAsSomeoneElse()`** updated: resets `ST.authProvider`, calls `goToStep('step-auth')`
  - **Backend — new routes in `src/routes/auth.js`**:
    - `POST /api/auth/signin` — email+password sign in via `signInWithPassword`
    - `POST /api/auth/signup` — admin.createUser (email_confirm:true) + signInWithPassword; returns `isNewUser`
    - `GET /api/auth/google` — returns Supabase OAuth URL; `?redirectTo=<encoded-origin>` param (was `?uat=1`, changed in `cddfcb6`)
    - `POST /api/auth/reset-password` — sends Supabase password reset email
    - `PUT /api/auth/home-location` — writes `home_lat`/`home_lng`/`home_address` to profile
    - `POST /api/auth/logout` — no auth required (token may be expired)
  - **Backend — updated routes**:
    - `POST /api/auth/register`: now writes `agreed_tos_at: new Date().toISOString()` and `auth_provider` to profiles upsert
    - `POST /api/auth/send-otp`: invite code validation block removed; pre-create logic preserved
  - `public/index.html` synced from `MapIt_MVP_v1.html` — diff verified clean

- ✅ **MVP Session 2 — Google OAuth `redirectTo` fix (2026-06-20, commits `99baa73` + `cddfcb6`, pushed to `uat`):**
  - **Root cause 1**: `uat.mapit.co.in` points to Production branch in Vercel (free tier limitation — branch-specific custom domains require Pro); new code only on Vercel preview URL
  - **Root cause 2**: `signInWithGoogle()` used `hostname.includes('uat')` to decide `?uat=1`; Vercel preview URL hostname (`mapit-backend-git-uat-nagesh-n-arun.vercel.app`) doesn't contain "uat" → `?uat=1` never sent → backend hardcoded `redirectTo: https://www.mapit.co.in` → Google came back to production (old code) → invite code screen
  - **Root cause 3**: Supabase Redirect URLs allowlist lacked `uat.mapit.co.in` and Vercel preview pattern → Supabase silently dropped any non-allowlisted `redirectTo` and fell back to Site URL (`www.mapit.co.in`)
  - **Fix (frontend)**: `signInWithGoogle()` now sends `?redirectTo=<encoded window.location.origin>` — works for any hostname
  - **Fix (backend)**: `GET /api/auth/google` validates `redirectTo` against `ALLOWED_OAUTH_ORIGINS` array + `/^https:\/\/mapit-backend-[a-z0-9-]+\.vercel\.app$/` regex; falls back to `www.mapit.co.in` if invalid
  - **Fix (Supabase — pending)**: user must add `https://mapit-backend-*.vercel.app/**` to Supabase → Auth → URL Configuration → Redirect URLs (4 entries already present; adding 1 more)
  - `public/index.html` synced from `MapIt_MVP_v1.html` — diff clean

- ✅ **MVP Session 2 — Migration 001 applied to Supabase production (2026-06-20):**
  - Reviewed `database/migrations/001-mvp-auth-schema.sql` — confirmed safe; all statements use `IF NOT EXISTS`
  - `phone` column confirmed already existing (written by `/register` route since Session 8)
  - `auth_provider TEXT DEFAULT 'email' CHECK (auth_provider IN ('email', 'google', 'phone'))` — added to `profiles`
  - `default_view TEXT DEFAULT 'map' CHECK (default_view IN ('map', 'list'))` — added to `profiles`
  - `invite_code` column renamed to `invite_code_legacy` in `profiles` (historical data preserved)
  - `home_lat`, `home_lng`, `home_address`, `agreed_tos_at`, `nickname` confirmed added (from migration script)
  - All existing rows auto-backfilled: `auth_provider='email'`, `default_view='map'` via DEFAULT — no manual backfill needed
  - Confirmed `user_pins.lat` / `user_pins.lng` are `float8` (= `DOUBLE PRECISION`) — consistent with new `home_lat`/`home_lng` columns
  - **Only one Supabase project exists** (`map it-backend`) — no separate UAT DB; decision made to keep single project for MVP family-beta phase
  - `spatial_ref_sys` table flagged as "unrestricted" — confirmed PostGIS system table; no RLS needed or safe to add; no action taken

- ✅ **MVP Session 1 — Foundation & Housekeeping (2026-06-19, commit `c7f86e8`, pushed to `uat`):**
  - Fixed git global email — removed literal quote chars; now correctly `nagesh.aadi@gmail.com`
  - Created `MapIt_MVP_v1.html` from `MapIt_Demo 30052026.html` (prototype → canonical MVP frontend, 2603 lines)
  - Synced `MapIt_MVP_v1.html` → `public/index.html` — diff verified clean (byte-identical)
  - Created `CLAUDE.md` v4.0 with all 12 collaboration rules (mentor role, scope discipline, two-file rule, branch strategy, security, DB safety, budget, screenshots, MVP boundary)
  - Created `docs/architecture.md` — stack table, branch strategy, key architectural decisions, budget plan
  - Created `docs/ux-audit.md` — 30-issue audit across typography, colour, spacing, forms, auth, and map interaction
  - Created `docs/screenshots/session-01/` (empty folder for session captures)
  - Created `database/migrations/001-mvp-auth-schema.sql` — profiles table additions for Session 2
  - Created `database/migrations/002-mvp-listings-schema.sql` — listings additions for Session 3
  - Created `database/migrations/003-chat-schema.sql` — conversations + chat_messages schema for Session 6
  - Created `.env.example` — all current + upcoming MVP env vars documented with comments
  - Committed and pushed all above to `uat` branch (`c7f86e8`)

- ✅ **Session 14 — "Express Interest" buyer→seller messaging (2026-06-07, commit `02eb030`, live on `main`):**
  - **Problem**: `💬 Chat with Seller` button was a fully simulated local mock — no messages ever reached the seller; backend `/api/messages` was never called
  - **Fix**: Replaced `openChat()` stub with `expressInterest()` async function; single tap sends real `POST /api/messages` with `receiver_id=l.seller_id`, `listing_id`, and pre-filled message *"Hi! I'm interested in your listing "[title]". Please get in touch."*
  - Button disables and shows `✅ Sent!` immediately after send to prevent duplicates; seller sees message in their existing Inbox with unread badge
  - Button label changed to `🤝 I'm Interested`; added `.ld-chat-btn:disabled` CSS; onboarding copy updated to match
  - No backend changes needed — `POST /api/messages` already existed and handles listing inquiry count increment automatically

- ✅ **Session 14 — Supabase DB fix: `listings_category_check` constraint updated (2026-06-07):**
  - **Root cause**: `hh` (Household Items) was missing from the Supabase `listings_category_check` constraint — it was added as a category in Session 10 but the DB constraint was never updated; any Household Items listing failed at the DB level regardless of GPS method (user happened to hit it during manual GPS posting)
  - **Fix**: dropped old constraint and recreated with `CHECK (category IN ('re', 'veh', 'hh', 'furn'))` via Supabase SQL Editor — no code changes needed
  - **3 new invite codes added** to Supabase `invite_codes` table (user added rows manually: code + created_for columns; used_by/email left null)

- ✅ **Session 14 — UAT Phase 4: 07-June-2026 feedback (commits `142c228`, `0555037` on `uat`; merged to `main`):**
  - **Sub-row pills no longer clipped**: subcategory pills (Apartment, Trucks & Commercial, Commercial Building) were cut off at the right edge because `overflow-x:auto` clips the last pill visually; replaced with `flex-wrap:wrap` so all pills always render fully visible
  - **Removed 1 km proximity button**: radius now starts at 3 km per UAT feedback; updated `setRad` index array from `[1,3,5,10,999]` to `[3,5,10,999]`
  - **Added "Region" proximity button** (50 km radius) after City — covers listings in towns around Bangalore (Tumkur, Kolar, Ramanagara, Channapatna direction); uses orange dashed circle + fitBounds to zoom map to 50 km area
  - **Fixed City map zoom**: was `setView(..., zoom 12)` which shows only ~10 km from center — any pin 18+ km away was off-screen; replaced with `fitBounds` on a 25 km box from the user's pin so all city-area listings are visible on the map
  - Promoted `uat` → `main` (production); all Sessions 10–14 changes now live at `https://mapit.co.in`

- ✅ **Session 13 — UAT Phase 4: family-testing bug reports (commit `3150cfa` on `uat`, pushed 2026-06-06):**
  - **Search dropdown**: typing in the search bar now shows a clickable type-ahead dropdown (`#srchDD`) instead of immediately filtering the left panel; only clicking a result opens that listing — other matches are then labelled "🔍 Other listings matching '...'" (not "nearby", since search results may be geographically far)
  - **Search match count**: right-justified, light-colored count of total matches shown next to results
  - **"Posted X ago" relative time**: new `timeAgo(dateStr)` util (`just now` / `Xm ago` / `X.Xhr ago` / `X.Xd ago`); wired into listing cards (`lr-meta`) and detail view (`ld-dist-sub`)
  - **Fixed My Ads cross-contamination bug**: other sellers' listings were appearing inside My Ads (with a working-looking "✏️ Edit Listing" button). Root causes: (1) `renderSidebar`/`selListing` computed prev/next nav and merges from `ST.listings` (the browse array, which explicitly excludes the user's own listings) instead of a dedicated My Ads array, and prev/next nav called `selListing()` without `keepTab=true`, silently flipping back to the browse tab; (2) `switchTab()` never cleared `ST.selId`, so a listing opened via map-pin click while on Browse stayed "selected" after switching to My Ads, skipping `renderMyAds()` and rendering that listing's detail under the `ST.tab==='mine'` context — which unconditionally showed the Edit button. Fixed by adding `ST.myListings` (populated in `renderMyAds`), making `renderSidebar`/`selListing` tab-aware end to end, clearing `ST.selId` in `switchTab`, and gating the Edit button on `l.seller_id===ST.user?.id`
  - `public/index.html` re-synced and verified byte-identical to `MapIt_Demo 30052026.html`

- ✅ **Session 17 — Schema analysis: `profiles` ↔ `invite_codes` join (2026-06-16):**
  - Join key confirmed: `invite_codes.used_by = profiles.id` (populated when a user registers with a code)
  - **Blocker**: `invite_codes.used_by` is NULL for all rows — no family member has fully registered via code yet, or `used_by` was never backfilled
  - SQL provided: `UPDATE profiles SET full_name = ic.created_for FROM invite_codes ic WHERE profiles.id = ic.used_by` (will work once `used_by` is populated)
  - Alternative approaches identified: join via `auth.users.email` if `invite_codes` has email column; or manual row-by-row mapping using a helper SELECT with row numbers

- ✅ **Session 16 — Invite code MAPIT-F-12 whitespace fix (2026-06-15, Supabase SQL Editor):**
  - **Problem**: family member reported "Invalid or expired invite code" for `MAPIT-F-12`; other codes worked fine
  - **Root cause**: NOT RLS — `validate-invite` endpoint uses `supabaseAdmin` (service role) which bypasses RLS entirely; error path `!invite` means row not found; leading/trailing space in `code` column from manual table-editor insert caused `.eq('code', 'MAPIT-F-12')` to miss the row
  - **Fix**: `UPDATE invite_codes SET code = trim(code) WHERE code LIKE '%F-12%'` removed the whitespace; verified all rows now have exactly 10-char codes (`SELECT code, length(code), created_for FROM invite_codes ORDER BY created_at DESC`)
  - **Preventive**: run `UPDATE invite_codes SET code = trim(code) WHERE code != trim(code)` after any future manual batch insert

- ✅ **Session 15 — MacBook Air migration verified (2026-06-08):**
  - Confirmed Node.js was not installed on Mac; Homebrew also missing
  - User installed Homebrew → Node.js v26.0.0 (arm64) → npm 11.16.0
  - Deleted Windows `node_modules` and ran `npm install` fresh for Mac arm64 binaries
  - Verified: `~/.zprofile` has correct `eval "$(/opt/homebrew/bin/brew shellenv)"` line
  - Verified: `.env` file present with all values set; git remote correct; production unaffected
  - Identified CRLF line endings in source files (harmless, optional to fix)
  - Identified git global email stored with extra literal quotes: `"nagesh.aadi@gmail.com"` — fix pending

- ✅ **Session 1** — Vercel backend setup, Supabase DB/Auth/Storage, Resend SMTP configured, CORS wired
- ✅ **Session 2** — `app.listen()` guarded with `require.main === module` for Vercel serverless; `API_URL` updated to `https://api.mapit.co.in` in both HTML files; DNS confirmed propagated (`api.mapit.co.in` CNAME → Vercel)
- ✅ **Session 3** — 6 fixes to `MapIt_Demo 30052026.html`: title, API_URL toggle comment, onboarding copy, resolved filter bug, "Mark as Resolved" visibility, Back button always visible
- ✅ **Session 3** — Fixed Resend sender domain to `noreply@mapit.co.in`; OTP root cause diagnosed (Supabase was using resend.dev test domain)
- ✅ **Session 5 — Name display & admin menu fixes (all implemented):**
  - `created_for` (invite-code name) now takes priority over `profile.full_name` everywhere; root fix for "Mapit User" display
  - WhoAmI screen now shows actual family member name (`u.created_for || u.name`) and correct initials
  - `continueAs()` passes stored invite code to `/api/auth/me` as fallback so `created_for` resolves even when `used_by` isn't set in DB
  - `continueAs()` immediately hides admin items before API call (prevents bleed from previous admin session); always writes `mapit_invite` to localStorage
  - `logout()` now explicitly hides admin menu items before page reload
  - Backend `/api/auth/me` accepts optional `?invite_code=` param and falls back to code-based lookup
  - Backend `/feedback/all` now JOINs `invite_codes` to return `created_for` per feedback; feedback viewer shows actual names
  - Session store updated: `created_for` saved as separate field; refreshed on every successful `continueAs`
- ✅ **Session 4 — 10 UX/logic fixes (all implemented):**
  - Admin menu (Review Listings / View Feedbacks) now only visible for MAPIT-N-01 and MAPIT-A-01 (localStorage fallback for invite code added)
  - Pending listings review: subcategory-correct icon (🛵 for 2-Wheelers etc.) + person's name from `seller.full_name`
  - GPS badge in header + map now auto-center to registered location after pin added/changed (`loadAndRenderPins` syncs `ST.activePin`, header label, user marker, and `map.setView`)
  - **Multi-user session switch**: `mapit_sessions` localStorage store holds all family sessions; WhoAmI screen is now a family-picker list; switching to a known user restores session instantly (no OTP); graceful fallback to OTP on session expiry
  - Pin count ("X pins visible") moved from top-right (behind zoom buttons) to bottom-center pill
  - GPS badge in header no longer navigates to My Locations (click removed); My Locations stays only in profile menu
  - My Locations "Set Active": confirm dialog before activating, toast confirmation, auto-close modal
  - Share Feedback button disabled + spinner on click to prevent duplicate submissions
  - Welcome splash now per-user (`mapit_welcomed_${userId}`) — each family member sees onboarding only at first-ever registration
  - **Inbox** added to profile menu: loads `/api/messages/inbox`, shows admin replies with sender, preview, time, unread orange dot + badge count
- ✅ **Session 7 — Full go-live (Phases 1–5 complete):**
  - Imported 6 historical session entries into `session-log.html` (Sessions 1–6); entries renumbered; total 9 entries
  - Reverted `API_URL` from `localhost:3001` → `https://api.mapit.co.in` in `MapIt_Demo 30052026.html` (line 678)
  - Synced `public/index.html` with `MapIt_Demo 30052026.html` — was 150 lines short (missing all Sessions 4-6 fixes)
  - Committed Sessions 4-6 changes as `96642c9`; synced `public/index.html` as `98fa40f`; pushed to `github.com/NageshVani/mapit-backend`
  - Diagnosed Vercel frontend `FUNCTION_INVOCATION_FAILED`: root `vercel.json` always read regardless of Root Directory setting, routing everything to Express
  - Fixed by serving frontend from Express itself: added `express.static(path.join(__dirname, '../public'))` to `src/server.js`
  - Disabled Helmet CSP (`contentSecurityPolicy: false`) to allow inline scripts and external CDN resources (Leaflet, Font Awesome, Google Fonts)
  - Added `mapit.co.in` + `www.mapit.co.in` as domains on the backend Vercel project (commit `f6200ae`)
  - Phase 3 (Supabase OTP + Auth URLs) confirmed complete by user; OTP template already had `{{ .Token }}`
  - **Phase 5 smoke test passed**: auth flow, map UI, admin menu gating, inbox badge — all verified live at `https://mapit.co.in`
  - Final live check: `mapit.co.in` → 308→www, `www.mapit.co.in` → 200 HTML, both API endpoints → 200
- ✅ **Session 6 — UX fixes (all implemented):**
  - **Admin menu visibility root fix**: Added missing CSS rule `.uav-item.hide{display:none;}` — without it, `classList.toggle('hide')` had zero visual effect; Review Listings + View Feedbacks were always visible to ALL users regardless of invite code
  - **Invite code screen skipped for returning users**: `continueAs()` catch block now pre-fills invite code and email from stored session, calls `goToStep('step-email')` — expired-session re-auth only requires OTP entry
  - **Set location splash removed for returning users**: Removed the blocking "Please set your GPS location" splash branch; all post-first-login users auto-dismiss the splash; location manageable via My Locations in profile menu
  - **Map zoom buttons moved to bottom-right**: Changed Leaflet zoom control from `position:'topright'` to `position:'bottomright'` — no longer overlaps profile avatar menu
  - **Inbox badge clears on open**: Badge set to hidden immediately when inbox modal opens (optimistic clear); `apiPut('/api/messages/mark-all-read', {})` called after render to persist read status
  - **Backend `PUT /api/messages/mark-all-read`**: New endpoint in `src/routes/messages.js`; single DB UPDATE sets `is_read=true` for all unread messages where current user is receiver
- ✅ **Session 12 — UAT Phase 3 (commits `29c80e1`→`3cdfa22` on `uat`):**
  - **Listing detail Block A redesign (per UAT PDF)**: removed 140px `ld-img` block; `ld-info-bar` expanded to column layout; large 64px emoji icon always shown (no photo thumbnail); photo thumbnails strip `ld-photo-strip` at bottom of Block A; teal gradient distance bar `ld-dist-bar` at very top of Block A; price font changed to JetBrains Mono; "Mapit User" seller row removed from `ld-body`
  - **Category icon root cause fixed**: `listings_within_radius` Postgres RPC was not returning `subcategory` column → all listings fell back to generic 🚗; replaced RPC with JS haversine `SELECT *` in `listings.js` so all DB columns always returned
  - **Photos in detail view fixed**: list API only returns `cover_photo`, not `photos[]`; `selListing()` made async — renders immediately then fetches `/api/listings/:id` to populate `photos[]` and re-renders
  - **Subcategory form fix**: `updatePostSubcats()` now adds "— Select type —" disabled placeholder as first option so 'Cars' is never silently default; `submitListing()` validates subcategory is selected
  - **My Ads tab overhaul**: "📋 Displaying only your ads" header; ✏️ Edit + ✅ Sold buttons per card; clicking a listing keeps mine tab (no tab switch); detail view shows "Edit Listing" instead of Chat/Save; "Other nearby listings" suppressed entirely; `editListing(id)` pre-fills post form; `submitListing()` sends `PUT /api/listings/:id` in edit mode and resets `status='pending'`; backend PUT expanded to allow `category`, `subcategory`, `details`, `lat`, `lng`, `address`
  - **Supabase data fix needed**: existing TVS SCOOTY listing likely has `subcategory='Cars'` — user needs to run `UPDATE listings SET subcategory='2 Wheelers' WHERE title ILIKE '%TVS%'` in Supabase SQL Editor
- ✅ **Session 11 — UAT bug fixes + listing detail redesign (commits `13feb2f`, `735db81`, `8a6e494`):**
  - **CORS fix**: Vercel preview URLs (`mapit-backend-*.vercel.app`) now allowed in CORS regex — was blocking OTP email step on UAT; applied to `main` + merged into `uat` (commit `13feb2f`)
  - **Listing detail redesign (per PDF)**: removed standalone orange distance pill and duplicate title/price section; removed "Verified" badge and star rating from seller card; added compact `.ld-info-bar` below image with thumbnail | title + price | 📷 photo count | 💬 Chat with Seller | ♡ save | ⤴ share; image height increased to 140px; seller shown as simple name only
  - **Title placeholder per subcategory**: `TITLE_PLACEHOLDER` JS object maps category+subcategory to realistic example text; updates dynamically when form category/subcategory changes
  - **Manual GPS location for posting**: location dropdown always shows "📍 Enter GPS coordinates manually…" option at bottom; auto-selected when no saved pins; shows coord + label inputs; `submitListing()` validates and parses manual coords; Google Maps tip shown
- ✅ **Session 10 — Arun review: major UX + feature overhaul (on `dev`/`uat`, commit `27393b7`):**
  - **Font/readability**: base font 15px, form labels 12px, inputs 14px
  - **Category restructure**: Real Estate (Plots/Individual House/Builder Flat/Apartment/Commercial Building), Vehicles (Cars/2 Wheelers/Cycles/Trucks & Commercial), Household Items (Electronic Appliances/Furniture/Home Decor)
  - **Dynamic listing form**: `LISTING_FIELDS` data structure; fields render dynamically per category+subcategory per PDF spec
  - **Photo gallery viewer**: tap listing image to open full-screen viewer; ‹ › arrows + dot nav + counter
  - **My Locations**: radio (Use My Current Location / Enter GPS Coordinates) + single "Save Location" button
  - **Backend**: `details` JSONB stored; `hh` added to `VALID_CATEGORIES`; `condition` field removed; `price` derived from `details.total_price`
- ✅ **Session 9 — Environments + onboarding prep:**
  - `API_URL` now auto-detects environment via `window.location.hostname`; UAT branch wired to Vercel preview
  - All 12 family invite codes entered in Supabase `invite_codes` table
- ✅ **Session 8 — Branch strategy + bug fixes:**
  - Added `arun.bn1@gmail.com` to `ADMIN_EMAILS`; photo limit lowered from 10 → 5
  - **Fixed double-email bug**: pre-create user via `supabaseAdmin.auth.admin.createUser({ email_confirm: true })` before `signInWithOtp`
  - Created `dev` and `uat` branches from `main`, pushed to GitHub

---

## 🔧 In Progress

| Task | Status | File(s) Touched | Notes |
|------|--------|-----------------|-------|
| Migration 001 — apply to Supabase | ✅ Done | Supabase SQL Editor | Re-run 2026-06-21: nickname/home_lat/home_lng/home_address/agreed_tos_at were missing; added now. auth_provider/default_view already existed. Nickname backfilled from full_name for all existing rows. |
| MVP Session 2 — Build auth modal | ✅ Done | `MapIt_MVP_v1.html`, `public/index.html`, `src/routes/auth.js` | email+password, Google OAuth, OTP fallback, ToS, home location picker — all built |
| MVP Session 2 — Home location map picker | ✅ Done | `MapIt_MVP_v1.html`, `src/routes/auth.js` | Inline Leaflet map (`step-homeloc`); `PUT /api/auth/home-location` route added |
| MVP Session 2 — `agreed_tos_at` + `auth_provider` backend | ✅ Done | `src/routes/auth.js` | `POST /api/auth/register` now writes both fields on profile creation |
| MVP Session 2 — Push to UAT + test | ✅ Done | git | CORS fix `50dd9dd` pushed; signup confirmed partially working (duplicate email error returned correctly) |
| MVP Session 2 — Google OAuth Supabase config | ✅ Done | Supabase Dashboard | Google provider enabled; all redirect URLs set including `https://mapit-backend-*.vercel.app/**`; OAuth confirmed working |
| MVP Session 2 — CORS fix | ✅ Done | `src/server.js`, `.gitignore` | Added `uat.mapit.co.in` + `localhost:3001` to allowedOrigins; case-insensitive Vercel regex; commit `50dd9dd` |
| MVP Session 2 — Nickname system | ✅ Done | `MapIt_MVP_v1.html`, `public/index.html`, `src/routes/auth.js` | Full name + nickname in Create Account; Change Nickname in menu; display name priority; commit `71dfba7` |
| MVP Session 2 — Password reset flow | ✅ Done | `MapIt_MVP_v1.html`, `public/index.html`, `src/routes/auth.js` | redirectTo fix; step-reset-sent modal; step-new-password; PUT /api/auth/password; commit `71dfba7` |
| MVP Session 2 — Splash flash fix | ✅ Done | `MapIt_MVP_v1.html`, `public/index.html` | showLoadingSplash() at 5 transition points; commit `71dfba7` |
| MVP Session 2 — Onboarding UX | ✅ Done | `MapIt_MVP_v1.html`, `public/index.html` | Font size increased; "I'm Interested" bullet removed; commit `71dfba7` |
| MVP Session 2 — Who's using MapIt? nickname fix | ✅ Done | `MapIt_MVP_v1.html`, `public/index.html`, `src/server.js`, `src/routes/auth.js` | Rate limit + trust proxy + nickname fallback (`b1cdc56`); background session refresh (`55b9859`); Supabase migration re-applied |
| MVP Session 2 — Full auth flow test (automated) | ✅ Done | Local server (curl) | 41 backend tests passed 2026-06-22; 4 frontend bugs found + fixed in same session |
| MVP Session 2 — Full auth flow test (manual/Arun) | 🟡 Pending | UAT Vercel preview | 51-test checklist created; send to Arun for browser-based sign-off |
| MVP Session 2 — "MapIt User" root-cause fix | ✅ Done | `MapIt_MVP_v1.html`, `public/index.html` | `needsProfile` check in `submitAuth()`; commit `3d100ab` pushed to `uat` |
| Vercel: set up `uat.mapit.co.in` | ✅ Done | Vercel dashboard | Valid Configuration confirmed (2026-06-20) |
| Vercel: delete broken frontend project | ✅ Done | Vercel dashboard | `mapit-frontend` project deleted (2026-06-20) |
| Supabase SQL cleanup: trim invite_codes | ✅ Done | Supabase SQL Editor | Ran successfully (2026-06-20) |
| Supabase SQL cleanup: drop condition_check constraint | ✅ Done | Supabase SQL Editor | Ran successfully (2026-06-20) |
| Arun UAT obs-1: keyword search | ✅ Done | `MapIt_MVP_v1.html`, `public/index.html` | Nominatim removed; header srchIn → keyword filter with map bounds; commit `093d49f` |
| Arun UAT obs-2: post form 2-col | ✅ Done | `MapIt_MVP_v1.html`, `public/index.html` | 2-col CSS grid; dynamic fields 2-col subgrid; responsive ≤640px; commit `093d49f` |
| Explore Area search mode toggle | ✅ Done | `MapIt_MVP_v1.html`, `public/index.html` | My Locations/Explore Area toggle; blue dot + blue circle; moveend debounce; commit `efabd47`; Arun-approved |
| Session 4 manual UAT checklist | ✅ Done (updated 2026-07-02) | `docs/session-04-uat-checklist-Arun.html` | Rewritten for search redesign: 19 checks (was 18); Blocks A+B replaced to cover keyword search + Explore Area mode; Arun verbal sign-off received |
| `uat → main` merge (post Session 4 + explore toggle) | 🟡 Pending | git | Awaiting explicit merge instruction — all changes Arun-approved |
| Create `public/og-image.png` | ✅ Done (2026-07-06) | `public/og-image.png` | 1200×630px PNG generated (Python/Pillow, MapIt orange #F06030 wordmark + pin motif + tagline); resolves OBS-01 from Session 4 UAT |
| Run SQL cleanup for empty-`details` listings | 🟡 Pending | Supabase SQL Editor | `DELETE FROM listings WHERE details IS NULL OR details = '{}'::jsonb` |
| Fix TVS SCOOTY subcategory in Supabase | 🟡 Pending | Supabase SQL Editor | `UPDATE listings SET subcategory='2 Wheelers' WHERE title ILIKE '%TVS%'` |
| Backfill `invite_codes.used_by` | 🔴 Deferred | Supabase table editor | ALL rows have `used_by = NULL`; invite codes no longer used in MVP auth — archived |
| Session 5 #1 — Add `RESEND_API_KEY` to Vercel | ✅ Done (2026-07-06) | Vercel dashboard | Nagesh confirmed added to Production + Preview scopes |
| Session 5 #1 — Merge `feat/session-05-seller-notification` → `uat` | ✅ Done (2026-07-06) | git, `.env.example`, `src/routes/messages.js`, `src/utils/email.js` | Fast-forward merge `df714d8`, pushed to `origin/uat` |
| Session 5 #1 — Verify email fires on deployed `uat` preview | ✅ Done (2026-07-06) | `uat` Vercel preview | Failed first attempt (surfaced `.catch()` bug); passed after hotfix — message sent + email read in inbox |
| Bug fix — `.catch()` chained on Postgrest builder in `messages.js` | ✅ Done (2026-07-06) | `src/routes/messages.js` | Was crashing every buyer's first-message send; fixed with plain try/catch; commit `64cfdff` |
| `uat → main` merge (Session 4 + Explore Area + Session 5 #1) | ✅ Done (2026-07-06) | git | Merge commit `d441152`; Nagesh sign-off (own verification, did not wait for Arun) |
| Smoke-test "I'm Interested" on production `mapit.co.in` | ✅ Done (2026-07-06) | production | Nagesh tapped "I'm Interested" live on mapit.co.in; verified server-side via Supabase (new `messages` row `aee3b0bb`, sent_at 16:08:43, listing "Ninety One (91) MTB bike"); Nagesh confirmed the notification email arrived |
| Session 5 #2 — Design spec + decisions (spam/lead-qualifying check) | ✅ Done (2026-07-06) | — | Passive server-side check, always-send-flagged-unscreened, universal criteria, migration approved; see Decisions Made |
| Session 5 #2 — Migration `004-lead-scoring.sql` | ✅ Done (2026-07-06) | `database/migrations/004-lead-scoring.sql`, Supabase | Written and run by Nagesh in Supabase SQL Editor; nullable `lead_verdict`/`lead_scored_at` on `messages` |
| Session 5 #2 — `src/utils/leadScoring.js` (Claude Haiku classifier) | ✅ Done (2026-07-06) | `src/utils/leadScoring.js` | Fails open to `unscreened` on any error/timeout/missing key; enum-validated output |
| Session 5 #2 — `messages.js` wiring (`scoreAndNotify`) | ✅ Done (2026-07-06) | `src/routes/messages.js` | Persists verdict via awaited `.update()` in try/catch (not chained `.catch()`); email always sends |
| Session 5 #2 — Frontend inline note box + UX refinement | ✅ Done (2026-07-06) | `MapIt_MVP_v1.html`, `public/index.html` | Placeholder hint (not pre-filled value); Send disabled until typed; synced, diff clean |
| Session 5 #2 — End-to-end local verification | ✅ Done (2026-07-06) | local + Supabase | Two real test sends confirmed `lead_verdict='unscreened'` persists + seller email flagged `[Unscreened]` received |
| Session 5 #2 — `ANTHROPIC_API_KEY` creation | 🟡 Pending | Vercel + local `.env` | Blocked on Arun's financial sign-off (Rule 11 — new recurring cost); feature safe to leave in fail-open state indefinitely |
| Session 5 #2 — Commit to `feat/session-05-lead-scoring` | ✅ Done (2026-07-06) | git | Commit `cd74c99` — 8 files (migration, leadScoring.js, messages.js, MapIt_MVP_v1.html + public/index.html, og-image.png, Context.md); unrelated WIP left uncommitted in working tree |
| Session 5 #2 — Push to `uat`, merge to `main` | 🟡 Pending | git | Not started — awaiting Anthropic key decision before promoting |

---

## 📂 Key Files Modified

```
src/utils/leadScoring.js   — NEW (2026-07-06, cd74c99, branch feat/session-05-lead-scoring): scoreLead() — Claude Haiku classification via raw fetch, fails open to 'unscreened' on any error/timeout/missing key, enum-validated output
src/routes/messages.js     — Session 5 #2 (2026-07-06, cd74c99): scoreAndNotify() helper added; notifySellerOfInterest() gains verdict param (flags email when not 'genuine'); call site swapped to scoreAndNotify(...).catch(...)
database/migrations/004-lead-scoring.sql — NEW (2026-07-06, cd74c99): nullable lead_verdict/lead_scored_at columns on messages; run by Nagesh in Supabase
.env.example               — Session 5 #2 (2026-07-06, cd74c99): ANTHROPIC_API_KEY entry added (key not yet created — pending Arun's sign-off)
MapIt_MVP_v1.html          — Session 5 #2 (2026-07-06, cd74c99): expressInterest() split into openInterestNote()/cancelInterestNote()/sendInterestNote(); new #interestBox inline note UI; placeholder-not-value + Send disabled until typed
public/index.html          — Session 5 #2 (2026-07-06, cd74c99): synced from MapIt_MVP_v1.html (diff clean)
public/og-image.png        — NEW (2026-07-06, cd74c99): 1200×630 PNG generated via Python/Pillow (throwaway venv); MapIt wordmark + pin motif + brand orange #F06030
src/routes/messages.js     — Bug fix (2026-07-06, 64cfdff): removed invalid .catch() chained on Postgrest .single() builder in inquiry-count-increment block; wrapped in try/catch instead; was crashing every buyer's first-message send
(merge)                    — uat → main (2026-07-06, d441152): promoted Session 4 + Explore Area toggle + Session 5 #1 seller notification + hotfix to production; 8 files (MapIt_MVP_v1.html, public/index.html, src/routes/messages.js, src/utils/email.js, src/server.js, src/middleware/errorHandler.js, Context.md, .env.example)
MapIt_MVP_v1.html          — Explore Area toggle (2026-07-02, efabd47): Search Mode toggle HTML+CSS; setSearchMode(); _placeExploreMarker(); _onExploreMove/End(); activeLoc() explore branch; updateCircle() blue/orange; switchTab() smBox disabled; ST.exploreMode state
public/index.html          — Explore Area toggle (2026-07-02, efabd47): synced from MapIt_MVP_v1.html (diff clean)
MapIt_MVP_v1.html          — Arun UAT feedback (2026-06-30, 093d49f): keyword search in header (replaces Nominatim); post form 2-col CSS grid layout; ~90 lines of Nominatim code removed
public/index.html          — Arun UAT feedback (2026-06-30, 093d49f): synced from MapIt_MVP_v1.html (diff clean)
MapIt_MVP_v1.html          — Session 4 CORS/security fix (2026-06-29, dc8199a): committed alongside src/server.js fix; diff clean
public/index.html          — Session 4 (2026-06-29, dc8199a): synced from MapIt_MVP_v1.html (diff clean)
MapIt_MVP_v1.html          — Session 4 map UX (2026-06-29, 772e7bf): satellite toggle (satBtn CSS+HTML+toggleSatellite); canvas renderer L.canvas(); flyTo in selListing (zoom-16 mine/fav, max-14 browse); 1-photo frontend validation toast; step-homeloc: homeLocHint label + orange border + draggable marker + dragend + _resolveHomeLocAddr helper + Voyager tiles; OG+Twitter meta tags; Leaflet preload + Google Fonts non-blocking; page title updated
public/index.html          — Session 4 map UX (2026-06-29, 772e7bf): synced from MapIt_MVP_v1.html (diff clean)
MapIt_MVP_v1.html          — Session 4 location search (2026-06-29, e1d4e7e): header srch placeholder→location search; srchClear × button; kwrd-box + kwrdIn sidebar input; ST.searchCenter state; activeLoc() searchCenter priority; _searchMarker + _voyagerLayer + _satLayer + _satOn vars; placeSearchPin / clearSearchCenter / fetchLocSuggestions / renderLocDD / pickLocResult functions; switchTab kwrdBox disabled toggle; replaced old srchInEl listeners + searchMatches/renderSearchDD/pickSearchResult/hideSearchDD removed
public/index.html          — Session 4 location search (2026-06-29, e1d4e7e): synced from MapIt_MVP_v1.html (diff clean)
src/server.js              — Session 4 CORS hardening (2026-06-29, dc8199a): removed all hardcoded localhost/127.0.0.1 from allowedOrigins; APP_URL env var spread for local dev; CORS cb now sets statusCode=403 on rejection
src/middleware/errorHandler.js — Session 4 security fix (2026-06-29, dc8199a): stack trace gated to 5xx-only in dev mode (never 4xx)
docs/session-04-uat-report.html — CREATED (2026-06-29); UPDATED (2026-07-02): Block C replaced with "Search Redesign" (17 new tests: keyword search KW-1..7 + Explore Area EX-1..10); Block B T-004/T-005/T-006 satellite tests marked REPLACED; T-008 updated to _exploreMarker; 5 CHANGE entries; summary 44 PASS/0 FAIL/1 WARN/3 REPLACED; 5 observations (was 4)
docs/session-04-uat-checklist-Arun.html — UPDATED (2026-07-02): Block A rewritten (keyword search, 3 tests); Block B rewritten (Explore Area mode, 4 tests); blocks C–G renumbered to items 8–19; total 19 checks (was 18); subtitle + progress bar + TOTAL JS updated
MapIt_MVP_v1.html          — Arun UAT fixes (2026-06-29, 7919558): authModal starts with hide class (I3 flash fix); sendPasswordReset() redirectTo += '/' (C4 fix); saveHomeLocation() calls POST /api/pins after profile save (A9 fix)
public/index.html          — Arun UAT fixes (2026-06-29, 7919558): synced from MapIt_MVP_v1.html (diff clean)
MapIt_MVP_v1.html          — Saved tab + radius (2026-06-27, be19c4e): .rad-box.disabled CSS; ST.favListings[] state; drawMarkers fav branch + fitBounds; renderFavs→favListings + drawMarkers; viewFav keepTab; selListing favListings lookup + icon update + merge-back; renderSidebar fav detail branch + fl + listing lookup + nav arrows + "other saved" header; switchTab disabled toggle + drawMarkers; openMyAds→switchTab; selListing !keepTab re-enables radius
public/index.html          — Saved tab + radius (2026-06-27, be19c4e): synced from MapIt_MVP_v1.html (diff clean)
MapIt_MVP_v1.html          — listingRow keepTab fix (2026-06-27, d4226b4): onclick now passes ST.tab==='fav'||ST.tab==='mine' as keepTab at click time
public/index.html          — listingRow fix (2026-06-27, d4226b4): synced from MapIt_MVP_v1.html (diff clean)
docs/session-03-uat-report.html   — Updated (2026-06-27, 83d4a34): total tests 27→47; Block G (10 tab/form checks); Block H (10 saved tab/radius checks); OBS-07/08/09; files-changed table; footer date
docs/session-03-uat-checklist-nagesh.html — Updated (2026-06-27, 83d4a34): 10 new manual tests in Blocks G (tab UX), H (post form), I (saved tab map); header commit reference updated
MapIt_MVP_v1.html          — Tester-6 (2026-06-27, 5cc2dfe): step-landing added (CSS + HTML + JS startOnboarding()); init() updated to show landing for first-time visitors; share icon ⤴→🔗
public/index.html          — Tester-6 (2026-06-27, 5cc2dfe): synced from MapIt_MVP_v1.html (diff clean)
src/routes/listings.js     — Session 3 UAT (2026-06-27, 94054d1): removed requireAuth from POST /:id/view so view count increments regardless of token expiry
MapIt_MVP_v1.html          — Session 3 UAT (2026-06-27, 94054d1→a15d396): views count in ld-dist-bar; tab ghosting + active tab bg/border/font (15px); white-space:nowrap on .tab-btn; Brand/Model placeholders + owners default:1 in LISTING_FIELDS; renderDynamicFields wired for placeholder+default
public/index.html          — Session 3 UAT (2026-06-27): synced from MapIt_MVP_v1.html (diff clean)
docs/session-01-uat-report.html     — CREATED 2026-06-22: developer UAT report for Session 1 (dark-themed, 82 KB): blocks A–G auto-verified results; blocks H–L manual summaries; 6 observations; 7 architectural decisions; 10 files-created ledger; 9 next steps
docs/session-01-uat-checklist-nagesh.html — CREATED 2026-06-22: Nagesh's interactive 66-test Session 1 UAT checklist (86 KB): 37 auto-pre-marked green; 29 manual Blocks H–L; live progress bar; sign-off section; same format as session-02-uat-checklist-arun.html
MapIt_MVP_v1.html          — Session 2 UAT (2026-06-22): BUG-01 verifyOtp() needsProfile check added; BUG-03 submitAuth() nickname pre-fill from existing profile; BUG-04 handleOAuthCallback() needsProfile check added; BUG-02 _refreshStaleSessionNames() filter extended to catch 'MapIt User' placeholder
public/index.html          — Session 2 UAT (2026-06-22): synced from MapIt_MVP_v1.html (diff clean)
docs/session-02-uat-report.html    — CREATED 2026-06-22: developer handover UAT report (dark-themed, 53 KB): 41 test results, 4 bug cards with code diffs, observations, next steps
docs/session-02-uat-checklist-arun.html — CREATED 2026-06-22: Arun's interactive 51-test manual UAT checklist (58 KB): Pass/Fail buttons, live progress bar, sign-off section
MapIt_MVP_v1.html          — Session 2 (3d100ab): submitAuth() now checks needsProfile (isNewUser OR nickname missing/placeholder); routes 'MapIt User' accounts to step-profile on first email+password login
public/index.html          — Session 2 (3d100ab): synced from MapIt_MVP_v1.html (diff clean)
MapIt_MVP_v1.html          — Session 2 (71dfba7): nickname system (registerNameFields, profileNicknameInput, changeNickname()); password reset modal (step-reset-sent, step-new-password, setNewPassword()); showLoadingSplash() at 5 transition points; splash font/bullet UX; display name priority updated to prefer nickname
public/index.html          — Session 2 (71dfba7): synced from MapIt_MVP_v1.html (diff clean)
src/routes/auth.js         — Session 2 (71dfba7): POST /register now accepts nickname; new PUT /api/auth/nickname; new PUT /api/auth/password; POST /reset-password now uses dynamic redirectTo validated against allowlist
                           — Session 2 (b1cdc56): authLimiter removed from all /api/auth routes; otpLimiter (10/hr) added to /send-otp and /verify-otp only; rateLimit require added at top of file
src/server.js              — Session 2 CORS fix (50dd9dd): added https://uat.mapit.co.in + http://localhost:3001 to allowedOrigins; Vercel regex made case-insensitive [a-z0-9-]→[a-zA-Z0-9-]
                           — Session 2 (b1cdc56): app.set('trust proxy', 1) added before rate limiter; global limit raised 100→200; authLimiter definition and /api/auth usage removed
MapIt_MVP_v1.html          — Session 2 (b1cdc56): continueAs() nickname fallback now uses data.profile?.full_name when nickname is null in DB
                           — Session 2 (55b9859): _refreshStaleSessionNames() added; init() calls it after renderWhoamiScreen() to auto-correct stale 'Mapit User' entries in background
.gitignore                 — Session 2 (50dd9dd): added client_secret_*.json rule to prevent accidental commit of Google OAuth credentials
MapIt_MVP_v1.html          — MVP Session 2: Auth modal rebuilt — new step-auth (email+password+Google), step-homeloc (map picker), ToS checkbox, new JS functions for all auth paths; sendOtp no longer sends invite code
public/index.html          — MVP Session 2: Synced from MapIt_MVP_v1.html (diff clean)
src/routes/auth.js         — MVP Session 2: Added POST /signin, POST /signup, GET /google, POST /reset-password, PUT /home-location, POST /logout; updated POST /register (agreed_tos_at + auth_provider); removed invite code check from POST /send-otp
                           — OAuth fix (cddfcb6): GET /google now reads ?redirectTo=<encoded-origin>; validates against ALLOWED_OAUTH_ORIGINS + Vercel preview regex before using; falls back to www.mapit.co.in
MapIt_MVP_v1.html          — OAuth fix (cddfcb6): signInWithGoogle() now sends ?redirectTo=encodeURIComponent(window.location.origin) instead of ?uat=1 flag
public/index.html          — OAuth fix (cddfcb6): synced from MapIt_MVP_v1.html (diff clean)
database/migrations/001-mvp-auth-schema.sql — MVP Session 2: Reviewed and applied; auth_provider + default_view added with CHECK; invite_code renamed to invite_code_legacy; all columns now live in Supabase
CLAUDE.md                  — MVP Session 1: CREATED v4.0 — 12 collaboration rules, security rules, scope boundary, file paths quick ref
.env.example               — MVP Session 1: CREATED — all current + upcoming env vars with comments; safe to commit
MapIt_MVP_v1.html          — MVP Session 1: CREATED — canonical MVP frontend (copy of prototype; all future frontend edits go here)
docs/architecture.md       — MVP Session 1: CREATED — stack table, branch strategy, architectural decisions, budget
docs/ux-audit.md           — MVP Session 1: CREATED — 30-issue audit across typography, colour, spacing, forms, auth, map
docs/screenshots/session-01/.gitkeep — MVP Session 1: CREATED — placeholder for session screenshots
database/migrations/001-mvp-auth-schema.sql — MVP Session 1: CREATED — profiles table additions for Session 2 (nickname, phone, home_lat/lng, auth_provider, default_view)
database/migrations/002-mvp-listings-schema.sql — MVP Session 1: CREATED — listings additions for Session 3 (reference_code, expires_at, show_phone, views_count, city_id)
database/migrations/003-chat-schema.sql — MVP Session 1: CREATED — conversations + chat_messages tables for Session 6
public/index.html          — MVP Session 1: Synced from MapIt_MVP_v1.html (diff clean)
MapIt_Demo 30052026.html   — Session 14 update 3: expressInterest() replaces openChat(); button label → 🤝 I'm Interested; disabled CSS; onboarding copy updated
                           — Session 6: admin menu CSS fix; invite code skip; location splash removed; zoom bottomright; inbox badge fix
                           — Session 7: API_URL reverted to https://api.mapit.co.in — PRODUCTION READY
                           — Session 8: ADMIN_EMAILS updated to include arun.bn1@gmail.com
                           — Session 9: API_URL replaced with auto-detect IIFE
                           — Session 10: major overhaul — dynamic form, categories, photo gallery, UX polish
                           — Session 11: listing detail redesign (info bar), title placeholder, manual GPS location for posting
                           — Session 12: Block A redesign; selListing async + full fetch; subcategory placeholder fix; My Ads header + Edit btn + keepTab; editListing(); submitListing() edit mode
                           — Session 13: search dropdown (#srchDD), match count, timeAgo() util, ST.myListings, tab-aware renderSidebar/selListing, switchTab clears ST.selId, Edit button gated on seller_id
                           — Session 14: .sub-row flex-wrap:wrap (pills no longer clip); removed 1km button; added Region (50km) button; City zoom fixed to fitBounds 25km box
src/routes/uploads.js      — Session 8: photo limit lowered to 5 (multer, array, DB check, error message)
src/routes/listings.js     — Session 10: `hh` added to VALID_CATEGORIES; POST accepts `details` JSONB; `condition` removed
                           — Session 12: replaced listings_within_radius RPC with JS haversine SELECT *; expanded PUT allowed fields; haversineM() helper
src/routes/auth.js         — Session 8: pre-create user via admin API before signInWithOtp to suppress confirm email
                           — Session 5: /api/auth/me: optional ?invite_code= fallback for created_for lookup
src/routes/messages.js     — Session 6: added PUT /api/messages/mark-all-read endpoint
src/routes/users.js        — Session 5: /feedback/all: joins invite_codes to include created_for per feedback entry
src/server.js              — Session 7: added express.static for public/; disabled Helmet CSP; added path require
                           — Session 11: CORS regex added to allow all mapit-backend-*.vercel.app preview URLs
public/index.html          — Session 7: fully synced with MapIt_Demo (was 150 lines short, missing Sessions 4-6)
                           — Sessions 8-14: synced after every frontend change
public/vercel.json         — Session 7: added (cleanUrls/trailingSlash static config)
session-log.html           — Session 7: 6 historical session entries imported; 9 total entries
                           — Session 12: entry #15 added (session resume)
                           — Session 16: entries #16–#22 added (invite code whitespace diagnosis and fix); 22 total entries
```

---

## 🐛 Open Issues / Blockers

- **`fix/session-04b-uat-fixes` not yet merged to `uat`/`main`** — 🟡 Pushed to `origin` (2026-07-08, commit `5d6b932`) for Nagesh/Arun retest of A3, F17, E14 (x2), F16. Awaiting sign-off before promoting per Rule 6.
- **UAT checklist HTML doesn't persist pass/fail state across reloads** — 🟡 Not fixed. Arun reported `docs/session-04-uat-checklist-Arun.html` resets all entered pass/fail marks and comments when reopened. This is a bug in the standalone checklist document's own client-side save logic (likely missing/broken localStorage persistence), not MapIt application code — not yet scoped or scheduled.
- **`ANTHROPIC_API_KEY` not yet created (Session 5 #2)** — 🟡 Blocked on Arun's financial sign-off before creating the key and adding it to local `.env` + Vercel (new recurring cost, however small — Rule 11). Code is fully built, committed (`cd74c99`), and safe to leave in this state indefinitely: `scoreLead()` fails open to `unscreened` when the key is absent, so messages keep sending normally, just always flagged `[Unscreened]` until the key exists.
- **`feat/session-05-lead-scoring` not yet pushed to `uat`** — 🟡 Pending, waiting on the Anthropic key decision before promoting (or could push as-is in its safe fail-open state if Nagesh wants `uat` testing to start regardless)
- **Local `.env` had stale `APP_URL=http://localhost:3000`** — ✅ FIXED (2026-07-06): server actually runs on `PORT=3001` and serves the frontend itself; corrected locally to `http://localhost:3001`. Local-only file, never committed, no production impact.
- **`RESEND_API_KEY` in Vercel** — ✅ DONE (2026-07-06): Nagesh confirmed added to Production + Preview scopes
- **`feat/session-05-seller-notification` → `uat` merge** — ✅ DONE (2026-07-06): fast-forward merge `df714d8`, pushed to `origin/uat`
- **Session 5 #1 verified on deployed `uat`** — ✅ DONE (2026-07-06): message sent + notification email read in inbox, after the `.catch()` hotfix below
- **`.catch()` chained on Supabase Postgrest builder crashed first-message sends** — ✅ FIXED (2026-07-06, commit `64cfdff`): `src/routes/messages.js` inquiry-count-increment block (pre-existing code from `96642c9`, unrelated to Session 5) called `.catch()` directly on a `.single()` query builder; that builder only implements `.then()` in the installed client version, so it threw `TypeError: ...catch is not a function` and failed the *entire* `POST /api/messages` request whenever a buyer sent their first message on a listing — i.e. every "I'm Interested" tap was silently broken before this fix, not just something Session 5 introduced. Fixed by wrapping in a plain `try/catch` instead of chaining `.catch()` on the builder; confirmed via grep this was the only occurrence of the anti-pattern in the codebase
- **`uat → main` merge** — ✅ DONE (2026-07-06, merge commit `d441152`): Session 4 + Explore Area toggle + Session 5 #1 (+ hotfix) all now live on production `https://mapit.co.in`
- **Production smoke test** — ✅ DONE (2026-07-06): Nagesh tapped "I'm Interested" live on `mapit.co.in`; new `messages` row confirmed via Supabase REST query (service role) and notification email confirmed received. Session 5 #1 fully closed out end-to-end on production.
- **AI spam/lead-qualifying bot** — ✅ DESIGNED + BUILT (2026-07-06, Session 5 #2, commit `cd74c99`): see Completed This Session for full detail. Blocked only on the `ANTHROPIC_API_KEY` creation (Arun's sign-off) before real classification is live — code path is fully safe without it.
- **`uat → main` merge PENDING** — commits `093d49f` + `efabd47` both Arun-approved (2026-07-02); merge to kick off Session 5
- **`public/og-image.png`** — ✅ DONE (2026-07-06): 1200×630px PNG generated programmatically (Python/Pillow venv, discarded after use) — MapIt wordmark, pin icon, brand orange `#F06030` (matched from existing CSS), tagline "Buy & Sell Near You", description line, `mapit.co.in`, decorative scattered pins. This is a functional placeholder, not final brand design — swap for polished artwork whenever a designer is available. File committed at `public/og-image.png`; OG/Twitter tags already pointed at this path so no HTML change needed.
- **Nominatim location search is India-only** — `countrycodes=in` param in `fetchLocSuggestions()`; remove restriction before USA launch
- **Arun Session 2 UAT — A9, C4, I3 all FIXED** — commit `7919558` on `uat` (2026-06-29); ✅ merged to main (2026-06-29, cec7848)
- **Session 1 UAT docs created but not yet committed** — `docs/session-01-uat-report.html` + `docs/session-01-uat-checklist-nagesh.html` are local only; commit to uat branch (see Next Steps 18)
- **Session 1 UAT manual checks pending (Nagesh)** — 29 checks in Blocks H–L of the checklist require Vercel Dashboard, Supabase SQL Editor, and browser; OTP_RATE_LIMIT=10 in Vercel must be verified (local .env has 100); 4 invite_codes.created_for names have " 1" suffix (Chirag 1, Kalpith 1, Srikanth 1, Vijay 1) — fix before those members log in
- **"Who's using MapIt?" showed "Mapit User"** — ✅ FULLY FIXED (2026-06-22): (1) `submitAuth()` needsProfile check (`3d100ab`); (2) `verifyOtp()` needsProfile check added (BUG-01, UAT 2026-06-22); (3) `_refreshStaleSessionNames()` now also refreshes sessions where `nickname === 'MapIt User'` (BUG-02, UAT 2026-06-22); (4) DB rows manually corrected; localStorage.clear() guidance documented for testers. All 3 auth paths now protected.
- **BUG-01 `verifyOtp()` missing needsProfile** — ✅ FIXED (2026-06-22): OTP-fallback users with placeholder nickname now correctly routed to step-profile; same 5-condition check as submitAuth()
- **BUG-02 `_refreshStaleSessionNames()` missed 'MapIt User'** — ✅ FIXED (2026-06-22): filter changed from `!u.nickname` to `(!u.nickname || u.nickname === 'MapIt User')`
- **BUG-03 `submitAuth()` Sign-In path nickname pre-fill missing** — ✅ FIXED (2026-06-22): `profileNicknameInput` now pre-filled from `data.profile?.nickname` when `_pendingNickname` is null
- **BUG-04 `handleOAuthCallback()` missing needsProfile** — ✅ FIXED (2026-06-22): Google OAuth users with existing placeholder profiles now caught and routed to step-profile
- **OTP_RATE_LIMIT=100 in local .env** — ⚠ Observation: local env has 100/hr; verify Vercel env var is set to 10 in production; Supabase 60s cooldown provides adequate local protection
- **Rate limit "Too many requests" after few test cycles** — ✅ FIXED (2026-06-21, commit `b1cdc56`): trust proxy added (real client IPs now used); authLimiter moved off all /api/auth routes; only OTP routes have strict limit now; pending UAT retest
- **Migration 001 columns were MISSING from Supabase** — ✅ FIXED (2026-06-21): `nickname`, `home_lat`, `home_lng`, `home_address`, `agreed_tos_at` were never actually added despite CONTEXT.md saying they were; re-applied via SQL Editor; CONTEXT.md updated
- **Google OAuth Supabase Redirect URL** — ✅ FIXED (2026-06-20): `https://mapit-backend-*.vercel.app/**` added; OAuth confirmed working end-to-end
- **Only one Supabase project** — `map it-backend` is both UAT and production DB; no separate staging DB; accepted for family-beta MVP phase (see Decisions)
- **`agreed_tos_at` write not yet in backend** — ✅ FIXED (2026-06-20): `POST /api/auth/register` now writes `agreed_tos_at: new Date().toISOString()`
- **Git global email** — ✅ FIXED (2026-06-19): `git config --global user.email nagesh.aadi@gmail.com` — quotes removed
- **CRLF line endings in source files** — carried over from Windows (e.g. `src/server.js`); harmless for Node/Vercel but not Mac-native; optional fix via `.gitattributes`
- **Listings with empty/missing `details` not yet cleaned up** — criterion: `details IS NULL OR details = '{}'::jsonb`; SQL not yet run by user
- **`listings` table `details` column** — added in Supabase (confirmed); backend writes it; existing listings have `details: {}`
- **Some invite code names have "1" appended** — `Chirag 1`, `Kalpith 1`, `Srikanth 1`, `Vijay 1`; fix in Supabase table editor before those members log in if unintentional
- **`invite_codes.used_by` NULL for ALL rows** — confirmed 2026-06-16; blocks automatic `profiles.full_name` update; need to either: (a) check if `invite_codes` has an email column to join via `auth.users`, or (b) manually map each profile UUID to its invite code row in Supabase table editor
- **`invite_codes.email` column existence unknown** — if it exists, can auto-join: `UPDATE profiles SET full_name = ic.created_for FROM invite_codes ic JOIN auth.users u ON u.email = ic.email WHERE profiles.id = u.id`
- **`uat.mapit.co.in` always points to Production (main) branch** — Vercel free tier limitation; branch-specific custom domains require Pro plan; UAT testing must use Vercel preview URL `https://mapit-backend-git-uat-nagesh-n-arun.vercel.app`
- **CORS was blocking email auth on UAT** — ✅ FIXED (2026-06-21, commit `50dd9dd`): browsers send `Origin` header even for same-origin POST requests; Vercel regex `[a-z0-9-]` was case-sensitive (could miss uppercase in deployment hash); `uat.mapit.co.in` and `localhost:3001` were missing from allowedOrigins
- **Google OAuth client_secret JSON file was untracked** — ✅ FIXED (2026-06-21): `client_secret_*.json` added to `.gitignore`
- **`invite_codes` TABLE naming confusion** — TABLE is still `invite_codes` (correct, never renamed); only the COLUMN `profiles.invite_code` was renamed to `profiles.invite_code_legacy` in migration 001
- **Test account re-use for signup testing** — delete from Supabase Auth Dashboard (Authentication → Users → ⋮ → Delete), then `DELETE FROM profiles WHERE id = '<uuid>'` in SQL Editor
- **Broken frontend Vercel project** — ✅ FIXED (2026-06-20): `mapit-frontend` project deleted
- **Supabase SQL cleanup** — ✅ FIXED (2026-06-20): both statements ran successfully
- **TVS SCOOTY listing has `subcategory='Cars'` in DB** — needs manual SQL update: `UPDATE listings SET subcategory='2 Wheelers' WHERE title ILIKE '%TVS%'`
- **Edit listing does not replace photos** — intentional for now; photo management not implemented
- **`listings_condition_check` constraint still exists** — checks `condition IN ('New', 'Like New', 'Good', ...)` but `condition` field was removed in Session 10; harmless (NULL satisfies the constraint) but can be cleaned up with `ALTER TABLE listings DROP CONSTRAINT listings_condition_check`
- **⚠️ PRE-PUBLIC-LAUNCH: Email verification not implemented** — `POST /api/auth/signup` uses `email_confirm: true` (admin API) which skips all email verification; anyone can register with another person's email. Before public launch: change to `email_confirm: false` and add an email OTP verification step (`step-verify-email`) after account creation. Noted 2026-06-21.
- **Supabase test account cleanup** — cannot delete `nagesh.aadi@gmail.com` auth user because `feedback.user_id` FK blocks `profiles` delete; use `+alias` emails for all future test signups to avoid this entirely
- **Password reset `redirectTo` in Supabase email template** — Supabase's built-in password reset email template uses `{{ .SiteURL }}` (set to `www.mapit.co.in`) for the link; our backend `POST /api/auth/reset-password` overrides this correctly via `redirectTo` param — but only if Supabase is configured to allow the dynamic redirectTo; confirm in Supabase → Auth → URL Configuration → Redirect URLs that `https://mapit-backend-*.vercel.app/**` is listed (already done for OAuth — same list covers reset links)

---

## 💡 Decisions Made

| Decision | Rationale |
|----------|-----------|
| Nagesh's own verification treated as sufficient sign-off for `uat → main` (2026-07-06) | Asked explicitly whether to wait for Arun; Nagesh chose to proceed now rather than block on a second reviewer for this merge — differs from the Session 4 items which had explicit Arun approval first |
| Fixed `.catch()`-on-Postgrest-builder by wrapping in try/catch, not by adding a `.catch()` polyfill or switching query style (2026-07-06) | Simplest fix consistent with existing code shape; Postgrest builders resolve to `{data,error}` and don't reject except on network failure, so a plain try/catch around the `await` is both correct and minimal |
| Real merge commit (not fast-forward) used for `uat → main` (2026-07-06) | Matches the existing repo convention from the prior `cec7848` promotion commit — keeps a clear, labeled merge point in `main`'s history distinguishing production promotions from regular feature work |
| AI spam/lead-qualifying bot deferred to its own session, split from the plain notification email (2026-07-02) | Nagesh wants sellers to only get emailed about genuine buyers — combining spam screening + a qualifying Q&A before the email sends. That's a real sub-project (LLM call = new recurring cost per Rule 11, new conversational frontend step, spam-scoring design, storage design) not a ~1.5hr add-on. Decision: ship the plain "email on first message" now to close the conversion gap immediately, spec the bot properly as a separate follow-on item |
| Resend called via raw `fetch` to the REST API, no `resend` npm package (2026-07-02) | One call type (`POST /emails`); Node 18+ has global fetch; avoids adding and maintaining a dependency for something ~15 lines of code covers, consistent with the project's lean-dependency style |
| Seller notification fires only on buyer's first message per listing (2026-07-02) | Reuses the existing `count === 0` inquiry-count check in `POST /api/messages`; prevents the seller getting one email per chat bubble once Session 6 real-time chat ships |
| Explore Area uses `map.getCenter()` as search origin (2026-07-02) | Nagesh's design brief (Search option MVP.pdf): buyer pans to any area without saving a pin; `activeLoc()` returns live map centre when `ST.exploreMode=true`; all existing callers (loadListings, updateCircle, dist, renderFavs) automatically derive from the new origin |
| Blue dot + blue dashed circle for explore mode (2026-07-02) | Visual distinction from orange home-pin system; `L.divIcon` 14px circle with white border + blue halo; `radCircle.setLatLng()` on move for performance (no recreate per frame); colour switches via `circleColor` in `updateCircle()` |
| 800ms debounce on `moveend` for explore reload (2026-07-02) | `moveend` fires once on pan stop; debounce prevents double-fire if Leaflet emits spurious events; 800ms feels responsive without hammering the API on every micro-pan |
| Toggle toggle label "My Locations / Explore Area" (2026-07-02) | Agreed in PDF discussion: labels describe intent not mechanism; "My Locations" defaults on so existing UX is unchanged for all current users |
| Satellite toggle removed; CartoDB Voyager hardcoded as sole tile layer (2026-07-02, confirmed by automated UAT) | `toggleSatellite()`, `_voyagerLayer`, `_satLayer`, `_satOn`, `satBtn` all absent from current code; Explore Area mode provides equivalent discovery value; no action needed — documented in UAT report as CHANGE-S4-05 |
| Keyword search + Explore Area compose correctly (2026-07-02) | When both modes active: `activeLoc()` returns map centre (Explore), `filtered()` also constrains by `getBounds()` (keyword) — results are keyword-matching listings visible in panned viewport |
| Keyword search uses `map.getBounds()` to constrain results (2026-06-30) | Arun's feedback: "results should consider current map position and zoom level"; `filtered()` now checks `bounds.contains([lat,lng])` when `ST.q` is set — user pans/zooms to area, types keyword, sees only matching pins in that viewport |
| `switchTab()` inlines keyword-state reset instead of calling `clearKeyword()` (2026-06-30) | `clearKeyword()` calls `drawMarkers()+renderSidebar()`; calling it from `switchTab` (which also calls them) would double-invoke `renderFavs()`/`renderMyAds()` — async API calls fired twice; inline reset avoids the extra render |
| Post form 2-col layout: description in full-width footer, not left column (2026-06-30) | Left col (category+fields+title) and right col (location+photos+phone) are balanced; putting description in a full-width footer prevents the left col from being disproportionately long on Real Estate (8+ dynamic fields) |
| Nominatim for unified buyer location search (Session 4) | Free, no API key, same library already used for reverse geocoding; Geoapify/Google Places upgrade path available before public launch if coverage gaps found |
| CartoDB Voyager + ESRI satellite toggle for map tiles (Session 4) | Voyager: free, no key, shows POI labels at zoom 14+ (shops, restaurants, schools); ESRI WorldImagery: free satellite layer; both are significant UX improvements over plain OSM with zero added cost |
| Header search bar repurposed as location search (not keyword) | Nominatim place search is the higher-value action; keyword filter moved to sidebar where it filters already-loaded listings in-place — no API call needed |
| `ST.searchCenter` as a separate location state from `ST.activePin` | User's home pin should persist while they browse around different locations; `activeLoc()` priority chain: searchCenter > activePin > DEFAULT_LOC |
| `selListing()` uses `flyTo` (not `panTo`) | My Ads listings can be geographically far from the browse view; `flyTo(zoom 16)` guarantees the pin is visible regardless of current viewport; Browse tab uses `max(currentZoom, 14)` to preserve context |
| Google Fonts loaded with `media="print" onload` trick | Eliminates render-blocking font CSS; browser initially ignores `media=print` then applies after load; `<noscript>` fallback for JS-disabled browsers; standard technique, zero risk |
| CORS allowedOrigins: APP_URL env var instead of hardcoded localhost | Hardcoded localhost is a security smell on a production server; dev adds `APP_URL=http://localhost:3001` in `.env` (gitignored); production Vercel never sets APP_URL so it's never in the allowlist |
| CORS errors return 403 (not 500) | 500 triggers monitoring alerts and confuses WAFs; 403 is semantically correct for "forbidden by access policy" |
| Stack traces gated to 5xx-only in errorHandler | 4xx errors (including CORS, validation, auth) are client-facing; they should never reveal internal file paths or stack frames regardless of NODE_ENV |
| OpenStreetMap Overpass API for POI proximity (Session 5) | Free, no API key; fire-and-forget async after listing creation; results stored in details.nearby_pois JSONB; upgrade to Geoapify/Google Places before public launch if Bangalore coverage gaps found in UAT |
| Side-by-side listing comparison deferred to post-MVP | Explicitly out of scope per CLAUDE.md; complexity doesn't justify at family-beta scale |
| Full FAQ/Help page deferred; lightweight help modal in Session 5 | Full FAQ is out of scope; 5–6 bullet help modal in a simple overlay covers the UAT need (Tester-4c) without the overhead |
| Marker clustering deferred to Session 8 | At 20 family-beta listings clustering adds zero value; build it in Session 8 before public launch when listing density will be higher |
| `saveHomeLocation()` creates a `user_pin` in addition to saving `profiles.home_*` | `profiles.home_*` and `user_pins` are separate data stores; the header badge reads from `user_pins` (ST.activePin); without a pin entry the badge shows the HTML placeholder "Koramangala" forever; the backend POST /api/pins already handles is_default correctly |
| `authModal` starts hidden in HTML (`class="hide"`) | Prevents sign-in page flash during Google OAuth page load — the ~100–300ms before JS runs was enough to show step-auth; all code paths that show the modal already call classList.remove('hide') explicitly |
| Password reset `redirectTo` sends `window.location.origin + '/'` | Supabase's redirect URL `/**` glob requires at least one path character; bare origin with no path silently failed validation and fell back to Site URL; trailing `/` satisfies the glob; also added bare-origin entry in Supabase dashboard as belt-and-suspenders |
| `listingRow()` keepTab evaluated at runtime (not render time) | `onclick="selListing(id, ST.tab==='fav'||ST.tab==='mine')"` — `ST.tab` is read at click time; ensures "Other saved listings" rows always stay on the Saved tab regardless of when they were rendered |
| `openMyAds()` refactored to call `switchTab('mine')` | Was setting `ST.tab` directly and missing the disabled-class toggle; routing through `switchTab` also fixed the pre-existing bug where "My Ads" tab button was never highlighted when opened from the profile menu |
| `ST.favListings[]` separate from `ST.listings` | Saved listings are user-curated and must be visible regardless of proximity radius; separate array keeps fav map state independent of browse state |
| `drawMarkers()` checks `ST.tab` at call time | Single function handles all three tab contexts; `isFav` flag switches between `ST.favListings` and `filtered()` — no separate `drawFavMarkers()` needed |
| `fitBounds(padding:[50,50], maxZoom:14)` for Saved tab | Ensures all saved pins visible at highest appropriate zoom; `maxZoom:14` prevents over-zoom when only one pin; fires only when no listing is selected (not on zoom-to-pin after selection) |
| Saved tab detail view stays on Saved tab context | `viewFav` → `selListing(keepTab=true)`; `renderSidebar` condition changed to `tab==='fav' && !ST.selId`; "other listings" labelled "❤ Other saved listings" not "📍 Other nearby listings" |
| UAT docs updated on session-03 report (not new file) | Today's changes are extensions of Session 3 scope; adding Blocks G and H to the existing report keeps all listing/sidebar UAT in one place; session-02 report left unchanged (covers auth flow only) |
| `step-landing` gated on `mapit_seen_landing` localStorage flag | Only first-time visitors (no stored sessions + flag absent) see the value proposition; returning users go directly to `step-auth`; `startOnboarding()` sets flag on CTA click so they never see it twice |
| Address entry (Tester-6 item 2) deferred to next session | Forward geocoding via Nominatim is straightforward (same API already used for reverse geocoding) but deserves its own session slot; tagged for Session 4 scope |
| Onboarding category prefs (Tester-6 item 4) deferred to pre-launch | Low value at MVP/family-beta scale (~20 listings); requires DB migration + new auth step; revisit before public launch |
| `POST /api/listings/:id/view` has no `requireAuth` | View counting is semantically public — every visitor should count; requiring auth meant expired JWTs silently blocked increments with no visible error (fire-and-forget `.catch(()=>{})`); supabaseAdmin (service role) handles the update safely without needing user identity |
| Tab active state uses opacity+background+border (not just underline) | UAT feedback requested clear visual distinction; opacity .45 ghosts inactive tabs; orange tint + border + 15px font makes active tab unmistakable; `white-space:nowrap` on base keeps tab bar height constant as font scales |
| Session 1 UAT uses file/curl/dig checks (not curl API tests) | Session 1 was housekeeping — no new Express routes; appropriate verification = file-system diffs, live curl/dig infra checks, and manual dashboard walkthroughs. Session 2 onwards uses curl for API routes. |
| Session 1 UAT checklist tester = Nagesh (not Arun) | Session 1 covers git config, Vercel dashboard, Supabase schema, Namecheap DNS — all developer-facing infra; not a user-facing feature test appropriate for Arun |
| `needsProfile` check applied to ALL 3 auth paths (submitAuth, verifyOtp, handleOAuthCallback) | UAT 2026-06-22 found that only submitAuth() had it; verifyOtp() (OTP fallback) and handleOAuthCallback() (Google OAuth) both missed it — all 3 now consistent |
| `needsProfile` replaces bare `isNewUser` check in `submitAuth()` | Old OTP accounts have profile rows with placeholder names; `isNewUser` alone misses them; `needsProfile = isNewUser OR !nickname OR nickname==='MapIt User'` catches all stale cases and re-routes to step-profile |
| UAT documentation created as standalone HTML files | Developer handover report + Arun checklist as self-contained HTML with embedded CSS/JS; no server needed; can be opened directly from file system or hosted |
| DB cleanup: deleted "MapIt User" profile rows, manually set real names | No automatic join path (invite_code_legacy NULL, invite_codes has no email column); joined via `auth.users` to identify UUIDs; going forward `needsProfile` prevents placeholder names persisting |
| Chrome localStorage ≠ cookies/cache/history | Clearing Chrome browsing data does NOT clear localStorage; `mapit_sessions` persists; must use DevTools console `localStorage.clear()` for UAT test resets — instruct testers accordingly |
| email+password as primary auth (not OTP) | OTP was family-beta only; email+password is the standard UX for a public marketplace; OTP kept as fallback via "Use email OTP →" link |
| Invite code screen removed entirely | `REQUIRE_INVITE_CODE=false`; invite codes are archived not deleted; family members restore via multi-session store (no re-OTP needed) |
| ToS accepted at profile creation (not account creation) | Only shown once to new users after auth; `agreed_tos_at` timestamp written on `POST /api/auth/register`; existing users unaffected |
| Home location as separate `step-homeloc` (not bundled in profile step) | Keeps profile step short; map needs visible DOM to init (requires its own step); "Skip for now" always available |
| `auth_provider` written to profiles table on registration | Allows future analytics on sign-up method; CHECK constraint enforces `'email' | 'google' | 'phone'` |
| MVP signup skips email verification (`email_confirm: true` in admin.createUser) | Avoids friction of a verification email for immediate marketplace access; acceptable for MVP; can add verification before public launch |
| Google OAuth URL fetched from backend (`GET /api/auth/google`) | Keeps Supabase client secret server-side; frontend never sees it; backend returns only the redirect URL |
| `handleOAuthCallback()` called at `init()` start | Google redirects back with `#access_token=` in URL hash; must intercept before the who-am-I / auth modal logic runs |
| Single Supabase project for UAT + production | No separate staging DB for MVP family-beta; 12 family users, no paying customers — overhead of maintaining two schemas not justified yet; revisit before public launch |
| `auth_provider` CHECK constraint added at column creation | Prevents silent bad values ('gmail' instead of 'google'); enforced at DB level; valid values: 'email', 'google', 'phone' |
| `default_view` CHECK constraint added at column creation | Enforces 'map' or 'list' only; existing rows default to 'map' (matches current app behaviour) |
| `invite_code` renamed to `invite_code_legacy` (not dropped) | Historical data preserved for debugging/auditing; column no longer written by any active code path |
| `spatial_ref_sys` left unrestricted | PostGIS system table — read-only coordinate reference data; adding RLS can break spatial queries; no user PII present |
| `float8` / `DOUBLE PRECISION` for `home_lat`/`home_lng` | Consistent with `user_pins.lat`/`user_pins.lng`; 15 sig-digit precision far exceeds GPS needs (~7 digits); simpler than PostGIS geography for a single saved location |
| `agreed_tos_at` NULL by default (no DEFAULT value) | NULL = user has not yet agreed; gates feature access in future; must be explicitly set at registration time |
| Homebrew for Node.js on Mac | Standard Mac package manager; installs to `/opt/homebrew` on Apple Silicon; PATH wired via `~/.zprofile` |
| Fresh `npm install` after Mac migration | Windows `node_modules` contain x64 binaries that don't run on Mac arm64; must always reinstall on new platform |
| Vercel serverless for backend | Zero-ops, free tier, works with `@vercel/node` |
| Supabase for DB + Auth + Storage | Managed Postgres, built-in OTP auth, S3-compatible storage |
| Resend as custom SMTP inside Supabase | Reliable transactional email, `mapit.co.in` domain, free tier sufficient |
| Frontend served from backend Express (not separate Vercel project) | Vercel always reads `vercel.json` from repo root regardless of Root Directory setting — root config routes everything to Express, making a separate static Vercel project impossible without a separate repo |
| Helmet CSP disabled (`contentSecurityPolicy: false`) | Frontend uses inline `<script>` blocks and loads Leaflet/Font Awesome/Google Fonts from CDNs — default Helmet CSP would break all of these |
| Invite-code gated auth | Closed beta — only family members with codes can register |
| OTP via email (not magic link) | `emailRedirectTo: null` + "Confirm email" disabled in Supabase forces 6-digit code |
| `app.listen()` guarded with `require.main === module` | Prevents Vercel cold-start failures |
| `API_URL` auto-detect via `window.location.hostname` IIFE | Eliminates manual comment/uncomment before every commit |
| `details` JSONB column on `listings` table | Stores all category-specific fields; flexible — new categories need no schema changes |
| Dynamic form fields via `LISTING_FIELDS` JS object | Single source of truth for all category/subcategory fields; drives form, hover card, and detail panel |
| Photo gallery as full-screen overlay | Tap image in detail panel to view all photos; ‹ › nav + dots + counter |
| Sell/Rent as radio (not subcategory) for Real Estate | Property type is subcategory; transaction type stored in `details.transaction_type` |
| CORS regex for Vercel previews | `mapit-backend-*.vercel.app` pattern instead of fixed list |
| Replace listings RPC with JS haversine | `listings_within_radius` RPC didn't return `subcategory`; JS `SELECT *` + haversineM() guarantees all columns |
| Block A always shows emoji, never cover photo | Category identity is more important than photo preview in the detail header |
| Subcategory "— Select type —" placeholder | Prevents Cars silently defaulting for all vehicle listings |
| My Ads detail stays on mine tab (keepTab) | User's own listing detail should remain in My Ads context; suppresses nearby listings and shows Edit |
| Edit listing always re-submits for review | Any owner edit changes status to 'pending'; ensures admin sees updated content before it goes live |
| Search dropdown defers filtering until a result is clicked | Left panel undisturbed while typing; clicking a result opens it directly |
| Dropdown labels other matches "Other listings" not "nearby" | Search results can be geographically far; "nearby" would be misleading |
| Dedicated `ST.myListings` array (separate from `ST.listings`) | `ST.listings` excludes own listings — reusing it for My Ads caused cross-tab leakage |
| `switchTab()` clears `ST.selId` | Prevents stale-selection leakage when switching tabs |
| Edit Listing button gated on `l.seller_id===ST.user?.id` | Defense-in-depth even if a non-owned listing ever appears in My Ads context |
| `.sub-row` uses `flex-wrap:wrap` instead of `overflow-x:auto` | Horizontal scroll clipped last pills visually; wrapping ensures all subcategory options are always fully visible |
| Removed 1 km proximity option | Too close for meaningful results per UAT feedback; minimum now 3 km |
| "Region" as label for 50 km proximity | Short (fits button), professional, neutral — implies broader metropolitan area without city-boundary ambiguity |
| City zoom uses `fitBounds` with 25 km box | Previous `setView(..., zoom 12)` only showed ~10 km from center, hiding 18+ km listings; 25 km box ensures all Bangalore-area pins are visible on the map |
| "Express Interest" pre-filled message instead of free-text chat | Family beta context — one-tap UX is enough signal; seller knows who is interested and can follow up via phone/WhatsApp; avoids building a full real-time chat for a prototype |
| `listings_category_check` recreated with `hh` | `hh` was missing from original Supabase constraint (added as a new category in Session 10 but DB never updated); all Household Items listings were silently rejected at DB level |
| New invite codes added via Supabase table editor | Only `code` and `created_for` columns needed; backend handles `used_by`/`email` via fallback on first login |
| Pre-create user via admin API before signInWithOtp | `shouldCreateUser:true` fires both confirm-signup + OTP emails; pre-creating with `email_confirm:true` then `shouldCreateUser:false` sends only OTP |
| `dev`/`uat`/`main` branch strategy | `dev` = local work; `uat` = Vercel preview for family sign-off; `main` = production auto-deploy |
| Trim invite codes after manual Supabase insert | Table editor can silently introduce leading/trailing spaces; run `UPDATE invite_codes SET code = trim(code) WHERE code != trim(code)` after any batch insert to avoid "Invalid or expired invite code" errors |
| MVP canonical frontend is now `MapIt_MVP_v1.html` | Prototype file (`MapIt_Demo 30052026.html`) kept as read-only reference; all MVP edits go to `MapIt_MVP_v1.html` → synced to `public/index.html` |
| CLAUDE.md v4.0 adopted for MVP | 12 rules covering mentor role, scope discipline, two-file rule, security, DB safety, budget, MVP boundary; replaces older inline rules |
| Migration SQL files pre-written in `database/migrations/` | Sessions 2, 3, 6 SQL staged as `.sql` files; run each in Supabase SQL Editor at the start of the relevant session |
| `invite_codes` table archived, not deleted | No longer used for auth in MVP; `REQUIRE_INVITE_CODE=false`; historical data preserved |
| `app.set('trust proxy', 1)` added to Express | Without it, Vercel edge IP used for rate limiting → all users share one bucket; with it, `X-Forwarded-For` gives real client IP per person |
| `authLimiter` scoped to OTP routes only (not all /api/auth) | Variable name `OTP_RATE_LIMIT` was always intended for OTP; applying 5/hr to signup+me+register blocked testing after 2 cycles |
| `_refreshStaleSessionNames()` background refresh on init() | Avoids requiring click-through to fix stale 'Mapit User' localStorage sessions; uses each session's own stored access_token; re-renders list after parallel fetches complete |
| `continueAs()` falls back to `profile.full_name` for nickname display | Existing accounts without nickname column set (pre-migration) now show their full name instead of stale 'Mapit User' from old localStorage |
| Migration 001 re-run was safe (IF NOT EXISTS) | All ALTER TABLE statements used IF NOT EXISTS so re-running skipped already-present columns (auth_provider, default_view) and only added the 5 missing ones |
| Pass `window.location.origin` as OAuth `redirectTo` (not `?uat=1` flag) | Works for any hostname — Vercel preview, UAT domain, production, localhost — without special-casing each environment |
| Backend validates OAuth `redirectTo` against allowlist + Vercel regex | Security: prevents open-redirect attack; allowlist = known app domains; regex = `^https://mapit-backend-[a-z0-9-]+\.vercel\.app$` |
| Vercel free tier: `uat.mapit.co.in` points to production only | Branch-specific custom domains require Vercel Pro; accepted for MVP; UAT testing uses the Vercel preview URL; revisit if Vercel Pro is upgraded |
| Nickname as primary display name (not full_name) | Full name is stored for legal/contact purposes; nickname is what the user wants to be called; prevents "Nagesh Nagaraja Rao" showing where "Nagesh" is cleaner |
| Nickname mandatory at account creation | Display name without nickname falls back to full_name (ugly); better to enforce it upfront than patch it later |
| `showLoadingSplash()` called before modal dismiss (not after) | Calling it inside `initApp()` had a race — modal dismissal exposed main content for ~100–500ms before `initApp()` ran; calling before dismiss closes the gap entirely |
| Gmail `+alias` pattern for test accounts | Avoids FK cascade issues from FK `feedback_user_id_fkey`; disposable but deliverable to real inbox; no Supabase cleanup needed between test runs |
| `PUT /api/auth/password` uses admin API | Recovery token in `ST.session` is set at `handleOAuthCallback()` when `type=recovery`; `requireAuth` validates it; admin API updates the password without needing the old password |
| Password reset `redirectTo` validated same as OAuth | Reuses `ALLOWED_OAUTH_ORIGINS` + `isVercelPreview()` already defined in auth.js; consistent security model; prevents open-redirect |

---

## 💻 Migration Note

**Migration to MacBook Air COMPLETE (2026-06-08)** — development has moved from Windows 11 to MacBook Air (Apple Silicon, arm64, macOS 26.5.1). Homebrew installed, Node.js v26.0.0 + npm 11.16.0 confirmed working, `node_modules` reinstalled fresh for arm64. `.env` file present with all values. Git remote correct. One pending fix: git global email has literal quote chars — run `git config --global user.email nagesh.aadi@gmail.com`.

---

## 🔜 Next Steps (Queued)

**Sessions 1–3 — ALL COMPLETE ✅**
- Session 1: Foundation, housekeeping, CLAUDE.md, migrations pre-written
- Session 2: Auth modal (email+password, Google OAuth, OTP, ToS, home location, nickname, password reset)
- Session 3: Listing lifecycle (reference codes, expiry, show_phone, views_count, delete, edit, UAT fixes, landing screen)

---

**⬅ Immediate:**
1. **Nagesh/Arun retest `fix/session-04b-uat-fixes`** — A3, F17, E14 (ToS-gated Continue + bigger map), F16 (Add-Location flow + Remove gating); branch pushed to `origin`, not yet on `uat`
2. **Merge `fix/session-04b-uat-fixes` → `uat` → `main`** once retest passes (Rule 6 promotion flow)
3. **Get Arun's sign-off + create `ANTHROPIC_API_KEY`** — console.anthropic.com/settings/keys; add to local `.env` first for a real genuine/spam test, then to Vercel (Production + Preview) before promoting past `uat`
4. **Test real classification** — with the key in place, send one genuine-sounding note and one spam-like note locally, confirm `lead_verdict` differs correctly and email wording matches
5. **Push `feat/session-05-lead-scoring` → `uat`** for Nagesh/Arun sign-off, then merge to `main` (standard Rule 6 promotion flow)

**✅ Session 04B — Arun's follow-up UAT fixes — CODE COMPLETE, COMMITTED, PUSHED (2026-07-08):**
- Built on `fix/session-04b-uat-fixes` (commit `5d6b932`), cut from `main`; awaiting UAT retest before promotion — see Completed section for full detail.

**✅ Session 5 #2 — Claude-based spam/lead-qualifying check — CODE COMPLETE, COMMITTED, LOCALLY VERIFIED (2026-07-06):**
- Built on `feat/session-05-lead-scoring` (commit `cd74c99`); fails open to `unscreened` — safe to leave as-is indefinitely. Only the Anthropic key + `uat`/`main` promotion remain — see Completed section for full detail.

**✅ Session 5 #1 — FULLY COMPLETE AND LIVE ON PRODUCTION (2026-07-06):**
- Seller notification email, the `.catch()` hotfix, `uat` verification, and `uat → main` promotion (`d441152`) all done — see Completed section for full detail

**✅ Session 1–4 — ALL COMPLETE:**
- Session 1: Foundation, housekeeping, CLAUDE.md, migrations pre-written
- Session 2: Auth modal (email+password, Google OAuth, OTP, ToS, home location, nickname, password reset)
- Session 3: Listing lifecycle (reference codes, expiry, show_phone, views_count, delete, edit, UAT fixes, landing screen)
- Session 4: Location search (Nominatim), satellite toggle (ESRI), flyTo UX, 1-photo validation, canvas renderer, step-homeloc UX, OG tags, CORS hardening (2 security fixes)

**✅ UAT dummy listings seeded (2026-06-28):**
- Script: `database/uat-dummy-listings.sql` — run in Supabase SQL Editor, all 20 rows confirmed present
- 12 listings under Nagesh · 8 under Arun · spread across Bangalore
- 3 listings at 12.9352, 77.6245 (Koramangala 5th Block) — overlap test for T7-1
- Expiry states: +20-28d (normal) · +4d (orange) · +2d (red) · −3d (expired) · sold · pending
- Cleanup when done: `DELETE FROM listings WHERE reference_code LIKE 'MP-BLR-UAT%'`

---

**✅ SESSION 4 — ALL FEATURES COMPLETE (2026-06-29, commits e1d4e7e → dc8199a)**
- Unified location search, satellite toggle, flyTo, 1-photo validation, canvas renderer, step-homeloc UX, OG tags, perf hints, CORS hardening — see Completed section for full detail

**✅ UAT dummy listings seeded (2026-06-28):**
- Script: `database/uat-dummy-listings.sql` — run in Supabase SQL Editor, all 20 rows confirmed present
- 12 listings under Nagesh · 8 under Arun · spread across Bangalore
- 3 listings at 12.9352, 77.6245 (Koramangala 5th Block) — overlap test for T7-1
- Expiry states: +20-28d (normal) · +4d (orange) · +2d (red) · −3d (expired) · sold · pending
- Cleanup when done: `DELETE FROM listings WHERE reference_code LIKE 'MP-BLR-UAT%'`

---

**✅ SESSION 4 — COMPLETE (2026-06-29) — Location Search + Map UX + Security**
> All 12 planned items built and tested (30/30 automated UAT PASS). Manual UAT checklist pending.
> Email verification (item 4) deferred to Session 5 by user — Resend already configured, no new subscription needed.

**Core feature — Unified Location + Category + Keyword Search (Tester-1, Tester-6, Family feedback F1):**
1. **Buyer search experience** — replace the simple address-entry concept with a full location-based search bar:
   - Location field: buyer types a place name (e.g. "Kumaraswamy Layout 2nd Stage") → Nominatim forward-geocodes → drops a distinct blue "search pin" on the map (separate from the user's green home pin)
   - Category + subcategory dropdowns alongside the location field (same as existing filter pills but in the search context)
   - Optional keyword field to refine results (e.g. "2BHK", "Honda", "leather sofa") — searches listing title + details
   - Search button → recenters map on geocoded location, applies radius (default 5km), filters by category/subcategory/keyword
   - Radius buttons still work from the new search center point
   - Hint label: "Use radius buttons to adjust search area"
   - Nominatim: free, no API key required
   ~3 hrs.

**Map experience upgrade (Family feedback F3):**
2. **CartoDB Voyager tile provider** — replace default OpenStreetMap tiles (`tile.openstreetmap.org`) with CartoDB Voyager (`basemaps.cartocdn.com/rastertiles/voyager`). Shows shops, restaurants, landmarks at zoom 14+; warmer colours; more professional look. Single URL change. ~10 min.
3. **Satellite / Hybrid map toggle** — add a 🛰 button in the map UI to switch between Voyager (street view) and ESRI WorldImagery (satellite/hybrid) tile layers. Free, no API key needed. ~45 min.

**Security — CRITICAL (must complete in this session):**
4. 🔴 **Email verification (`step-verify-email`)** — change `POST /api/auth/signup` from `email_confirm: true` (admin API, skips verification) to `email_confirm: false`; add new `step-verify-email` modal step after account creation that accepts a 6-digit OTP sent via Resend; currently anyone can register with another person's email — this is the highest-risk pre-launch gap. ~3 hrs.
5. 🔴 **PostGIS GiST index verification** — run `EXPLAIN ANALYZE` on the listings haversine query; confirm "Index Scan" not "Seq Scan" on `lat`/`lng`; if missing, add: `CREATE INDEX ON listings USING gist(ll_to_earth(lat, lng))`. ~15 min.

**UAT feedback quick wins (Testers 2, 7):**
6. **My Ads pin visible on map (Tester-2a)** — when a listing is selected in My Ads tab, `map.flyTo([lat, lng], zoom)` so the listing's pin is visible on the map. Currently the map stays static when opening a My Ads listing. ~30 min.
7. **Minimum 1 photo required (Tester-2b)** — validate in `submitListing()` (frontend) and `POST /api/listings` (backend) that at least 1 photo is attached; show inline error "At least 1 photo is required" if empty. ~20 min.
8. **Canvas renderer for map pins (Tester-7)** — switch Leaflet from default SVG DOM renderer to Canvas: `L.map('map', {renderer: L.canvas()})`. Dramatically lighter on low-end Android devices — each pin is drawn to `<canvas>` rather than a separate DOM node. ~10 min.
9. **Simpler pin-drop UX — step-homeloc (Tester-3b)** — add "Tap anywhere on the map to drop your pin 📍" instruction label; subtle pulsing animation on first load to draw attention to the map; "Drag marker to adjust" hint text after pin is placed. ~30 min.

**Additional quick wins:**
10. **CORS localhost removal** — remove `localhost:3000`, `localhost:3001`, `localhost:5500`, `127.0.0.1:5500` from the allowlist in `src/server.js`; these are dev-only origins that must not exist on the production server. ~5 min.
11. **Open Graph / WhatsApp share meta tags** — add `og:title`, `og:description`, `og:image`, `og:url` to `<head>` of `MapIt_MVP_v1.html`; when a listing link is shared on WhatsApp a rich preview card appears instead of a bare URL. ~20 min.
12. **Leaflet preload + Google Fonts non-blocking** — add `rel="preload"` for Leaflet CDN JS; change Google Fonts `<link>` to `media="print" onload="this.media='all'"`. Eliminates two render-blocking resources for slow 4G Indian mobile users. ~10 min.

---

**📋 SESSION 5 — Notifications, POI, Map UX Depth + Platform Hardening** ⭐ NEW SESSION (inserted 2026-06-27)
> This session did not exist in the original plan. It was added after the pre-launch ops review.
> Updated scope (2026-06-28): added POI proximity feature (F2) and remaining UAT map/UX items (Testers 2, 3, 4, 7).
> Purpose: close the biggest conversion gap (no seller notifications), add the POI proximity differentiator, improve map UX depth, and audit security.

**Critical:**
1. 🟡 **Seller notification email on "I'm Interested"** — built + committed + live-send-verified 2026-07-02 on `feat/session-05-seller-notification` (see Completed section). **Resume tomorrow with exactly 2 steps:** (1) add `RESEND_API_KEY` to Vercel Production + Preview env vars, (2) merge branch → `uat`. **Follow-on (separate, unscoped item):** AI spam/lead-qualifying bot gating this email — see Open Issues.
2. 🔴 **Listing expiry notification email (3 days before)** — add a Vercel Cron Job (requires Vercel Pro from Session 7; build the route now, wire the cron after upgrade): `SELECT * FROM listings WHERE expires_at BETWEEN NOW() AND NOW() + INTERVAL '3 days' AND status='active'` → Resend email per seller: "Your MapIt listing '[title]' expires in 3 days." ~2 hrs.
3. 🔴 **RLS policy full audit** — systematically verify RLS is enabled and correctly scoped on every table: `listings`, `profiles`, `messages`, `user_pins`, `invite_codes`. For each: confirm RLS enabled, read policy definition, test that an unauthenticated Supabase client cannot read private data. `spatial_ref_sys` is intentionally unrestricted (PostGIS system table) — leave it. ~2 hrs.

**Location & Map UX depth (Family feedback F2, Testers 2, 3, 7):**
4. **POI proximity on listing post — OpenStreetMap Overpass API (Family feedback F2)** — when a listing is created, fire an async background call to the Overpass API to find the nearest school, mall, and supermarket within 2km of the listing's GPS coordinates. Store result in `details.nearby_pois` JSONB (e.g. `[{type:"school", name:"JSS School", distance_m:450}, ...]`). Display in listing detail view as a "📍 Nearby" section below the address. Fire-and-forget pattern: listing creation succeeds immediately; POI data appears within a few seconds. Overpass API: free, no key required. Upgrade path: Geoapify or Google Places before public launch if OSM coverage gaps found in UAT. ~4 hrs.
5. **Same-location pin popup — multiple listings at exact GPS point (Tester-7)** — when ≥2 listings share identical lat/lng (e.g. apartment complex, bazaar), clicking the stacked pin shows a scrollable mini-list card: "3 listings at this location" with title + price for each; clicking one opens it normally in the side panel. ~2 hrs.
6. **GPS confirmation preview map in post form (Tester-2c)** — when a seller enters GPS coordinates in the post-listing form, a small inline Leaflet map (~180px tall) shows a pin at those exact coordinates so the seller can visually confirm the location before submitting. Updates on every input event. ~1.5 hrs.
7. **Pin tooltip on first tap — scan UX (Tester-7)** — first tap on a map pin shows a compact floating tooltip card (title + price + distance, ~60px); second tap or "View" button on the card opens the full side panel. Reduces taps needed to scan multiple listings. ~1.5 hrs.
8. **Default view preference — map vs list (Tester-3a)** — wire the existing `profiles.default_view` DB column (already added in migration 001) to a UI toggle in profile settings; `PUT /api/auth/profile` saves it; `initApp()` reads the value from `/api/auth/me` and sets the initial view on load. ~1 hr.

**High value additions:**
9. **Help modal — lightweight (Tester-4c)** — add a `?` icon to the header; tapping opens a simple modal with 5–6 bullet points: how to browse, how to post, how to save, how to contact a seller, how to delete a listing. No server route needed — pure frontend. ~30 min.
10. **Orphaned photo cleanup job** — build a route or trigger that deletes Supabase Storage objects where the listing row no longer exists; prevents Storage filling silently after months of deletions and expiries. ~1 hr.
11. **Structured feedback form upgrade (Tester-4d)** — add `category` dropdown (Bug / Content Report / Suggestion / Other) and 1–5 star `rating` field to the feedback form; add columns to `feedback` table via migration; makes post-launch feedback triage 5× faster than free-text. ~1 hr.
12. **Supabase Auth email template branding** — update OTP email templates in Supabase Dashboard → Auth → Email Templates; replace default "Supabase Auth" subject with "Your MapIt verification code is [OTP]"; add MapIt 📍 branding. Supabase Dashboard task, not code. ~20 min.

---

**📋 SESSION 6 — Real-Time Chat + Content Moderation Layer**
> Original scope: apply pre-written `003-chat-schema.sql` migration and build in-app messaging

**Original planned work:**
1. **Real-time chat** — apply `database/migrations/003-chat-schema.sql` in Supabase SQL Editor (conversations + chat_messages tables); build chat UI; wire up Supabase Realtime subscriptions for live buyer↔seller messaging. ~4 hrs.

**Added scope:**
2. **"Report Listing" button** — add flag icon to listing detail action bar; tapping shows reason dropdown (Fake / Wrong price / Spam / Offensive) + optional note; calls new `POST /api/listings/:id/report` endpoint writing to a `listing_reports` table; without this, all spam reports come via WhatsApp to Nagesh/Arun personally. ~1.5 hrs.
3. **Admin content moderation API enhancements** — extend admin menu to support: reject listing with reason code, view listing_reports queue, one-click user suspension (`UPDATE profiles SET suspended=true`); moves moderation off Supabase Dashboard into the app itself. ~2 hrs.

---

**📋 SESSION 7 — Vercel Pro + Security Hardening**
> Original scope: Vercel Pro upgrade ($20/mo, budget approved — upgrade before this session per architecture.md)

**Original planned work:**
1. **Vercel Free → Pro upgrade** — unlocks: Vercel Cron Jobs (needed for the Session 5 expiry cron), branch-specific custom domains (`uat.mapit.co.in` will finally point to UAT branch not production), higher function limits. ~30 min.

**Added — CRITICAL:**
2. 🔴 **Legal pages — Privacy Policy + Terms of Service** — create `public/privacy.html` and `public/terms.html`; add Express static routes `GET /privacy` and `GET /terms`; link both from the ToS checkbox in `step-profile`; content must cover: data collected, Supabase storage location, user rights, grievance officer contact (mandatory under Indian IT Act SPDI Rules). Google OAuth consent screen requires a live Privacy Policy URL or the Sign in with Google button is disabled for new users. Have Arun review before publishing. ~2 hrs + legal review.

**Added — high value:**
3. **Sentry error monitoring** — `npm install @sentry/node`; add `Sentry.init({ dsn: process.env.SENTRY_DSN })` to `server.js`; wrap Express error handler; free tier = 5,000 errors/month with email alerts; add `SENTRY_DSN` to `.env.example` and Vercel env vars. Closes the biggest operational blind spot: silent 500 errors currently go undetected until a user reports them. ~30 min.
4. **Helmet CSP re-enablement** — once email verification (`step-verify-email`) is in place (Session 4), inline `<script>` blocks are reduced; write an explicit CSP allowlist for Leaflet CDN, Font Awesome, Google Fonts, and any remaining inline scripts using nonces or `sha256-` hashes. ~1.5 hrs.
5. **Vercel + Sentry alert configuration** — set Vercel email alerts for failed deployments and function error rate spikes; configure Sentry to alert on first occurrence of any new error type. ~15 min.

**External action for Arun (after legal pages are live):**
6. **Google OAuth consent screen** — update Google Cloud Console → OAuth consent screen → Privacy Policy URL field with the live `/privacy` URL; without this, new users see a Google warning: "This app hasn't been verified" which kills sign-ups.

---

**📋 SESSION 8 — Admin Dashboard + Performance + UX Polish**
> Original scope: unplanned placeholder; now anchored to admin tooling, performance audit, and UX polish (Testers 4, 5).

1. **Proper admin dashboard page** — replace hardcoded email check with a dedicated `/admin` route (Express middleware guards to admin emails); page shows: listings by status (pending/active/expired/sold), new users today/week, messages sent today, listing reports queue, recent feedback. ~3 hrs.
2. **Supabase PgBouncer connection pooler** — swap direct DB connection string for the Supabase pooler string in `.env` and Vercel env vars; prevents connection exhaustion at 50+ concurrent users (Supabase Free = 20 direct connections limit). One-line config change after Supabase Pro upgrade (Session 7). ~20 min.
3. **Performance audit — Lighthouse mobile** — run Lighthouse on `mapit.co.in` → Mobile → Performance; target First Contentful Paint <2s on simulated 4G; identify and fix top 2–3 opportunities (preload hints already done in Session 4; focus on image quality cap at upload, unused CSS). ~1 hr.
4. **`robots.txt` + `sitemap.xml`** — add `public/robots.txt` (Allow: /, Disallow: /api/, Sitemap: https://mapit.co.in/sitemap.xml) and `public/sitemap.xml` with root URL; add Express static route for `/sitemap.xml`. ~20 min.
5. **Marker clustering — Leaflet.markercluster (Tester-5)** — add `Leaflet.markercluster` CDN; wrap pin rendering in `L.markerClusterGroup()`; nearby pins merge into a numbered circle at low zoom levels, fan out on click. Addresses the scalability concern raised by Tester-5 for high-density listing scenarios (apartment complexes, bazaars at public-launch scale). Free, open source. ~2 hrs.
6. **Visual aesthetics UX polish pass (Tester-4a)** — select top 5 issues from `docs/ux-audit.md` with highest visible impact (visual hierarchy, spacing, typography weights, colour consistency); implement as a focused batch. Keep changes minimal and measurable. ~2 hrs.

---

**📋 SESSION 9 — Supabase Pro + Public Launch Gate**
> Original scope: Supabase Pro upgrade ($25/mo, budget approved — upgrade before this session per architecture.md)

**Original planned work:**
1. **Supabase Free → Pro upgrade** — unlocks: daily automated backups (7-day retention), Point-in-Time Recovery (PITR), higher connection limits, Storage CDN, compute upgrade, no row-count limits. Before upgrading: run the SQL cleanup tasks below. ~30 min.

**Added scope:**
2. **Enable Supabase Storage CDN** — toggle CDN on in Supabase Dashboard → Storage → CDN after Pro upgrade; also enable Image Transformations for thumbnail-quality photos (reduces bandwidth ~60%). Dashboard toggle, not code. ~10 min.
3. **Verify backup and PITR configuration** — confirm daily backups scheduled in Supabase → Settings → Backups; do a test restore of one table to a temporary DB to confirm restorability — the one disaster-recovery check always skipped until it is needed. ~30 min.
4. 🔴 **Pre-launch security and readiness checklist** — final automated check: (1) CORS allows only production + UAT, no localhost; (2) Helmet CSP active in response headers; (3) RLS enabled on all tables; (4) Sentry receiving test errors; (5) legal pages live at `/privacy` and `/terms`; (6) email verification flow works end-to-end; (7) expiry notification cron firing correctly; (8) Google OAuth redirect URLs in Supabase; (9) `SUPABASE_SERVICE_ROLE_KEY` absent from all client-visible responses. All 9 must pass before public launch. ~1.5 hrs.
5. **Soft-open (48 hrs before public announcement)** — share the live URL with 10–20 people outside family test group; monitor Sentry for new error types, Vercel logs for unexpected patterns; proceed with public announcement only after soft-open is clean.

---

**🗃️ Data cleanup (run in Supabase SQL Editor any time before Session 9):**
- `DELETE FROM listings WHERE details IS NULL OR details = '{}'::jsonb`
- `UPDATE listings SET subcategory='2 Wheelers' WHERE title ILIKE '%TVS%'`

---

**📌 External / non-code tasks (assign to Nagesh or Arun — cannot be done via code):**
- 🔴 **Twilio DLT registration (TRAI)** — register entity at traidlt.com (company name, PAN, contact); link approved DLT header to Twilio; required for Indian SMS OTP delivery post-2021 TRAI mandate. Owner: Nagesh. ~2 days processing.
- **Resend plan upgrade → Starter ($20/mo)** — upgrade before Session 9 launch; free tier (100/day) is exhausted by ~50 daily active users with seller notifications + expiry + OTP emails. Owner: Nagesh. 2 min in Resend dashboard.
- **Geoapify API key** (if chosen over Nominatim in Session 4) — create free Geoapify account, get API key, add to `.env.example` and Vercel. Owner: Nagesh. During Session 4.
- **UAT on real low-end Android device** — test full listing post + browse + "I'm Interested" flow on Redmi or Samsung Galaxy A-series; use Chrome on Android not desktop emulation; focus on: touch targets, keyboard pushing map, photo upload from camera roll, GPS accuracy indoors. Owner: Nagesh + family member. Before Session 9 launch gate.
- **Legal pages content review** — have Arun review Privacy Policy and Terms of Service content before publishing (after Session 7 builds the pages). Owner: Arun. Before Session 9.

---

## 📎 Important Context / Constraints

- **Supabase project URL:** `https://jneoxwumccmjwaojfazh.supabase.co`
- **DNS:** `api.mapit.co.in` CNAME → Vercel (confirmed); `mapit.co.in` A → `76.76.21.21`, `www.mapit.co.in` CNAME → Vercel (both live as of 2026-06-03)
- **Registrar:** Namecheap
- **Admin detection:** dual check — invite codes `MAPIT-N-01` / `MAPIT-A-01` OR email `nagesh.aadi@gmail.com` / `arun.bn1@gmail.com`
- **Auth flow (new MVP):** email+password OR Google OAuth OR email OTP → Bearer token in ST.session → `requireAuth` middleware validates JWT; profile setup + home location on first login
- **Auth flow (family legacy):** existing family sessions restored from `mapit_sessions` localStorage; session expiry shows `step-auth` with email pre-filled
- **CORS:** allows `mapit.co.in`, `www.mapit.co.in`, `uat.mapit.co.in`, `localhost:3000`, `localhost:3001`, `localhost:5500`, `127.0.0.1:5500`, `mapit-backend-*.vercel.app` (case-insensitive regex). Localhost origins to be removed in Session 4 before public launch.
- **OTP rate limit (Express):** `OTP_RATE_LIMIT=100` per hour per IP (Vercel env var)
- **Resend free tier:** 100 emails/day — sufficient for family beta
- **`MapIt_MVP_v1.html`** is the canonical MVP frontend (2603 lines, single-file). `public/index.html` is the deployed copy — **always sync both after any frontend change** with `cp MapIt_MVP_v1.html public/index.html && diff MapIt_MVP_v1.html public/index.html`. `MapIt_Demo 30052026.html` is the prototype reference — do NOT edit it.
- **Two-file rule:** `MapIt_MVP_v1.html` ↔ `public/index.html` must always be byte-identical. Diff must show NOTHING before any commit.
- **Vercel `vercel.json` behaviour:** Root `vercel.json` is always read regardless of "Root Directory" project setting. Frontend served via `express.static` in `src/server.js`.
- **Helmet CSP:** Disabled globally (`contentSecurityPolicy: false`) — required for inline scripts and CDN resources. Planned re-enablement in Session 7 once `step-verify-email` (Session 4) reduces inline scripts.
- **Multi-session storage key:** `localStorage['mapit_sessions']` — JSON object keyed by Supabase user ID
- **Messages API:** `GET /api/messages/inbox`; `POST /api/messages`; `PUT /api/messages/mark-all-read`
- **Admin menu CSS:** `.uav-item.hide{display:none;}` is the critical rule
- **Branch strategy:** `dev` (local only) → `uat` (Vercel preview, family sign-off) → `main` (production); `API_URL` auto-detects
- **UAT URL:** `https://mapit-backend-git-uat-nagesh-n-arun.vercel.app` — Vercel Deployment Protection disabled for preview
- **Photo limit:** 5 per listing — enforced in both frontend (slice) and backend (multer + DB check)
- **`listings.details` JSONB**: stores all category-specific fields; `total_price` inside details is used as the canonical price
- **Category IDs:** `re` = Real Estate, `veh` = Vehicles, `hh` = Household Items; `furn` kept in VALID_CATEGORIES for legacy data only
- **`LISTING_FIELDS` JS object**: canonical field definitions per cat+subcat; drives form, hover card, and detail panel; vehicle subcategories now have `placeholder` for Brand/Model and `default:1` for owners field
- **`ST.favListings[]`**: separate from `ST.listings` — populated by `renderFavs()` via `GET /api/listings/saved/all`; used by `drawMarkers()` when `ST.tab==='fav'`; `fitBounds(padding:[50,50],maxZoom:14)` auto-fits map to all saved pins on Saved tab open; `viewFav()` uses `keepTab=true` so detail stays on Saved tab
- **Proximity radius (`.rad-box`)**: disabled (opacity .4, pointer-events:none) when `ST.tab !== 'browse'`; toggled by `switchTab()` and `selListing(!keepTab)`
- **Listing detail Block A layout (Session 12):** `ld-info-bar` is `flex-direction:column`; first child is `ld-dist-bar` (full-bleed teal gradient); second is `ld-info-top`; third is `ld-photo-strip`
- **`selListing(id, keepTab=false)`:** second param prevents tab switch when called from My Ads; `ST.editingId` tracks edit mode
- **Listings API list endpoint:** uses `SELECT *` + JS haversineM() filter; returns `distance_m` field; frontend maps `distance_m → d` (km)
- **Proximity buttons:** 3 km · 5 km · 10 km · City (999 km / City-wide) · Region (50 km); default 5 km
- **City map zoom:** `fitBounds` with 25 km box from user's active pin (not fixed zoom 12); Region uses `radCircle.getBounds()` fitBounds
- **SUBCAT_MAP vs CATS.subs:** `SUBCAT_MAP` (for post form) has no 'All Types'; `CATS[].subs` (for filter bar) includes 'All Types' — intentionally different

---

## UAT Status — Session 04

- **Report:** `docs/session-04-uat-report.html`
- **Automated:** 40 PASS / 0 FAIL / 1 WARN (og-image.png missing — known pending)
- **Manual checklist:** `docs/session-04-uat-checklist-Arun.html`
- **Tester:** Arun
- **Status:** Pending manual sign-off from Arun
- **Blocks:** A (Location Search, 4) · B (Keyword Filter, 2) · C (Satellite Toggle, 2) · D (flyTo, 3) · E (Photo Validation, 2) · F (Home Loc UX, 3) · G (Arun Bug Fix Verification, 3) · H (WhatsApp Preview, 1) = 20 manual checks
- **After sign-off:** merge `uat → main`, create `public/og-image.png` (1200×630px), begin Session 5
