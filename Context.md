# 🧠 Session Context — MapIt Backend

> **How to use:** Ask Claude Code to update this file every 10–15 messages.
> Start a new session with: "Read CONTEXT.md and continue from where we left off."

---

## 📌 Project Overview
- **Project:** MapIt — Bangalore property/classifieds prototype (family beta)
- **Stack:** Node.js + Express (Vercel serverless) · Supabase (DB + Auth + Storage) · Resend (SMTP) · Leaflet.js (maps) · Single-file vanilla JS frontend
- **Root directory:** `c:\Users\Vanin\Documents\MapIt project\mapit-backend`
- **Last updated:** 2026-06-07 (Session 14 checkpoint — update 3)

---

## 🎯 Current Goal

**UAT Phase 4 ongoing — "Express Interest" buyer→seller messaging live on production (commit `02eb030`).** Buyers can now tap "🤝 I'm Interested" on any listing to send a real in-app message to the seller's Inbox. Awaiting next round of family testing feedback.

---

## ✅ Completed This Session

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
| Continue UAT iteration cycle | 🟡 Pending | — | Awaiting next round of family testing feedback |
| Run SQL cleanup for listings with empty/missing `details` | 🟡 Pending | Supabase SQL Editor | `DELETE FROM listings WHERE details IS NULL OR details = '{}'::jsonb` — needed for clean UAT testing |
| Fix TVS SCOOTY subcategory in Supabase | 🟡 Pending | Supabase SQL Editor | `UPDATE listings SET subcategory='2 Wheelers' WHERE title ILIKE '%TVS%'`; existing bad-data listing from early test |
| Fix "1" suffix names in Supabase | 🟡 Pending | Supabase table editor | `Chirag 1`, `Kalpith 1`, `Srikanth 1`, `Vijay 1` — confirm if intentional; fix before those members log in |
| Onboard family members | 🟡 Pending | — | Share `https://mapit.co.in` + individual codes |
| Delete broken frontend Vercel project | 🟡 Optional | Vercel dashboard | Separate project returning 500 — no longer needed |
| Backfill `invite_codes.used_by` + `email` | 🟡 Optional | Supabase table editor | Fill once family emails collected; backend fallback handles null |

---

## 📂 Key Files Modified

```
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
```

---

## 🐛 Open Issues / Blockers

- **Listings with empty/missing `details` not yet cleaned up** — criterion: `details IS NULL OR details = '{}'::jsonb`; SQL not yet run by user
- **`listings` table `details` column** — added in Supabase (confirmed); backend writes it; existing listings have `details: {}`
- **Some invite code names have "1" appended** — `Chirag 1`, `Kalpith 1`, `Srikanth 1`, `Vijay 1`; fix in Supabase table editor before those members log in if unintentional
- **`invite_codes.used_by` + `email` null for all members** — backend fallback handles it; backfill once emails collected
- **`uat.mapit.co.in` custom domain not yet set** — UAT at `mapit-backend-git-uat-nagesh-n-arun.vercel.app`; optional to add stable subdomain
- **TVS SCOOTY listing has `subcategory='Cars'` in DB** — needs manual SQL update: `UPDATE listings SET subcategory='2 Wheelers' WHERE title ILIKE '%TVS%'`
- **Edit listing does not replace photos** — intentional for now; photo management not implemented
- **`listings_condition_check` constraint still exists** — checks `condition IN ('New', 'Like New', 'Good', ...)` but `condition` field was removed in Session 10; harmless (NULL satisfies the constraint) but can be cleaned up with `ALTER TABLE listings DROP CONSTRAINT listings_condition_check`

---

## 💡 Decisions Made

| Decision | Rationale |
|----------|-----------|
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

---

## 💻 Migration Note

**Migrating to MacBook Air** — development is moving from Windows 11 to a new MacBook Air. Push all local changes before switching machines. On the Mac, clone `github.com/NageshVani/mapit-backend` and set up Node.js + npm. Environment variables (Supabase, Resend, etc.) will need to be re-added to the local `.env` file — refer to Vercel project env vars as the source of truth.

---

## 🔜 Next Steps (Queued)

1. **Continue UAT iteration cycle** — implement/fix items from ongoing family-testing feedback rounds; production now at commit `02eb030`
2. **Run SQL cleanup for empty-`details` listings** — `DELETE FROM listings WHERE details IS NULL OR details = '{}'::jsonb` in Supabase SQL Editor
3. **Fix TVS SCOOTY subcategory in Supabase** — `UPDATE listings SET subcategory='2 Wheelers' WHERE title ILIKE '%TVS%'`
4. **Fix "1" suffix names in Supabase** — confirm if `Chirag 1`, `Kalpith 1`, `Srikanth 1`, `Vijay 1` are intentional; fix in table editor if not
5. **Optional: drop `listings_condition_check`** — `ALTER TABLE listings DROP CONSTRAINT listings_condition_check` (harmless but stale since condition field was removed)
6. **Onboard family members** — share `https://mapit.co.in` + individual codes (3 new codes now added)
7. **Delete broken frontend Vercel project** (optional cleanup)
8. **Optional: backfill `invite_codes.used_by` + `email`** — collect family emails; fill via Supabase table editor

---

## 📎 Important Context / Constraints

- **Supabase project URL:** `https://jneoxwumccmjwaojfazh.supabase.co`
- **DNS:** `api.mapit.co.in` CNAME → Vercel (confirmed); `mapit.co.in` A → `76.76.21.21`, `www.mapit.co.in` CNAME → Vercel (both live as of 2026-06-03)
- **Registrar:** Namecheap
- **Admin detection:** dual check — invite codes `MAPIT-N-01` / `MAPIT-A-01` OR email `nagesh.aadi@gmail.com` / `arun.bn1@gmail.com`
- **Auth flow:** invite code → email OTP → Bearer token in localStorage → `requireAuth` middleware validates JWT
- **CORS:** allows `mapit.co.in`, `www.mapit.co.in`, `localhost:3000`, `localhost:5500`, `127.0.0.1:5500`, `mapit-backend-*.vercel.app`
- **OTP rate limit (Express):** `OTP_RATE_LIMIT=100` per hour per IP (Vercel env var)
- **Resend free tier:** 100 emails/day — sufficient for family beta
- **`MapIt_Demo 30052026.html`** is the canonical frontend (~2120 lines, single-file). `public/index.html` is the deployed copy — **always sync both when making frontend changes**.
- **Vercel `vercel.json` behaviour:** Root `vercel.json` is always read regardless of "Root Directory" project setting. Frontend served via `express.static` in `src/server.js`.
- **Helmet CSP:** Disabled globally (`contentSecurityPolicy: false`) — required for inline scripts and CDN resources.
- **Multi-session storage key:** `localStorage['mapit_sessions']` — JSON object keyed by Supabase user ID
- **Messages API:** `GET /api/messages/inbox`; `POST /api/messages`; `PUT /api/messages/mark-all-read`
- **Admin menu CSS:** `.uav-item.hide{display:none;}` is the critical rule
- **Branch strategy:** `dev` (local only) → `uat` (Vercel preview, family sign-off) → `main` (production); `API_URL` auto-detects
- **UAT URL:** `https://mapit-backend-git-uat-nagesh-n-arun.vercel.app` — Vercel Deployment Protection disabled for preview
- **Photo limit:** 5 per listing — enforced in both frontend (slice) and backend (multer + DB check)
- **`listings.details` JSONB**: stores all category-specific fields; `total_price` inside details is used as the canonical price
- **Category IDs:** `re` = Real Estate, `veh` = Vehicles, `hh` = Household Items; `furn` kept in VALID_CATEGORIES for legacy data only
- **`LISTING_FIELDS` JS object**: canonical field definitions per cat+subcat; drives form, hover card, and detail panel
- **Listing detail Block A layout (Session 12):** `ld-info-bar` is `flex-direction:column`; first child is `ld-dist-bar` (full-bleed teal gradient); second is `ld-info-top`; third is `ld-photo-strip`
- **`selListing(id, keepTab=false)`:** second param prevents tab switch when called from My Ads; `ST.editingId` tracks edit mode
- **Listings API list endpoint:** uses `SELECT *` + JS haversineM() filter; returns `distance_m` field; frontend maps `distance_m → d` (km)
- **Proximity buttons:** 3 km · 5 km · 10 km · City (999 km / City-wide) · Region (50 km); default 5 km
- **City map zoom:** `fitBounds` with 25 km box from user's active pin (not fixed zoom 12); Region uses `radCircle.getBounds()` fitBounds
- **SUBCAT_MAP vs CATS.subs:** `SUBCAT_MAP` (for post form) has no 'All Types'; `CATS[].subs` (for filter bar) includes 'All Types' — intentionally different
