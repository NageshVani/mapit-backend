# MapIt Backlog

Created 2026-11-15 (UAE) along with CLAUDE.md v5.0. Projects, ideas and leftovers that are not
operating rules live here. Order inside each section = rough priority.
Status: 🔜 planned · 💡 idea (needs a decision) · 🧹 small fix · 👤 manual (dashboard / person)

## 1. Planned releases (agreed order)
1. ✅ **Frontend split (option 1)**: LIVE 2026-11-15 (PR #37, `df04cd5`); smoke:prod 16/16, S-16 12/12.
2a. ✅ **Release 10A.1, map preview card cut off on phones**: LIVE 2026-11-16 (PR #39, `7962967`; smoke:prod 16/16). (found in the 10A family check, 2026-11-15;
   pre-existing on prod, not a 10A regression). `showHoverCard` / `showStackHoverCard` / `showClusterHoverCard`
   in `public/js/map.js` flip the card to the left of the pin with no left-edge check → negative `left` on a
   ~390 px map. Fix: one shared helper that clamps the card inside the map (both sides + top/bottom) using
   its real width. Frontend only. Branch from main after 10A ships → uat → phone check → main. Before 10B.
2. ✅ **Release 10A, quick UX fixes**: LIVE 2026-11-15 (PR #38, `a392d9e`); Nagesh phone check on www 4/4 2026-11-16 (from Nagesh's UAT observations, 2026-11-15). Frontend only, no DB:
   - **Back button closes the photo viewer** (obs. 1): opening the viewer adds a browser-history entry,
     so Back closes it and stays in MapIt. Recommended over a new window (popup blockers; a new tab
     loses the listing context on phones). Same fix later for other full-screen modals.
   - **Admin navigation** (obs. 4): a small top bar on /review and /admin with "MapIt map · Admin ·
     Review", so no page needs the browser Back button.
   - **Vehicle year** (obs. 3): a year dropdown (newest first) instead of a number box, which removes the
     need for 4-digit checks and input masks. Server-side check too (Rule 8). Lower limit TBD (decision below).
     The posting wizard reuses the same field config, so this work is not lost.
3. 🔜 **Release 10B, view counts** (obs. 5, extends the planned "views follow-up"). `views_count` already exists
   and goes up on every open, but is never shown:
   - show 👁 count to the seller (My Listings) and to buyers (listing detail)
   - stop counting the owner's own views
   - make the counter safe for two visitors at once (one atomic DB update instead of read-then-write):
     needs migration 021 (a small RPC), UAT first
4. 🔜 **Release 10C, reason when closing a listing** (obs. 2): dropdown on "Mark as sold" and "Delete".
   Delete removes the row today, so reasons need their own small table (migration 022, RLS deny-by-default).
   The "sold on MapIt vs elsewhere" answer is the most useful business number here. Reason list TBD (decision below).
5a. ⏳ **[PLACEHOLDER] Release 10D, price filter in the left panel** (production user feedback, 2026-11-16).
   Request: a "Price" filter in the left panel for ALL categories (Real Estate, Vehicles, Household).
   Not designed yet. Questions to settle first (James explains options, Rule 1):
   - rent (per month) vs sale (total) prices are not comparable → one range per category / sub-mode?
   - input style: min/max boxes, preset ranges (e.g. under ₹10K / ₹10K–50K / …), or a slider
   - ₹ units: K / L / Cr presets for Real Estate; keep currency-neutral code (new-market guardrail)
   - server-side filter (min_price / max_price on the listings query, validated — Rule 8) vs client-side only;
     EXPLAIN ANALYZE if it touches the query (Rule 10)
   - how the filter shows on the map pins + list count, and on phones (left panel is a separate view)
   Order vs 10C / posting wizard: Nagesh + Arun to decide.
5. 🔜 **Posting wizard with listing preview**: text-only draft; at least 1 photo required (except plots); full preview.
   Phone mockups first. New code goes in its own `public/js/` file.

### Decisions for 10A–10C (Nagesh, 2026-11-15)
- **Vehicle year:** the field filters the suggested years as the user types. Years older than 15 are ALLOWED,
  and the listing shows a "15+ years old" note.
- **Close reasons:** the proposed lists are approved (Sold: Sold on MapIt / Sold elsewhere / Sold offline;
  Delete: No longer selling / Posted by mistake / Wrong details, will re-post / Too many calls or spam / Other).
  More reasons may be added later, so keep the list in one config place. Still open: required, or optional?
- **Views:** sellers see the exact count from 1; buyers see it only from 10 views.

## 2. Ideas waiting for a decision
- 💡 **Alert on a mistaken review decision**: (A) seller "Ask for a second look" button → admin email;
  (B) daily admin digest with one-tap reopen; (C) random spot-check of approvals; (D) rule checks
  before Approve. James recommends A + B. Decide after the split.
- 💡 **Admin role in `staff_members`** to replace the two hard-coded admin emails (backend + page source).
  Decided in principle 2026-11-14. Needs its own release.
- 💡 **Nonce-based CSP**: remove the inline onclick= handlers and style= attributes so 'unsafe-inline' can go.
  Easier after the split.
- 💡 **DB-aware `/health`**: today it does not call Supabase, so the uptime monitor misses DB outages.
- 💡 **Native mobile app**: wait for real user response after go-live.
- 💡 **New market (USA)**: only after a decision based on response in India.
- 💡 Out of scope until agreed: trust badges, seller public profiles, paid boosts / Razorpay,
  side-by-side comparison, full FAQ / Help page, mass SMS/WhatsApp notifications.

## 3. Small fixes (🧹)
- 🧹 **MapIt never renews its sign-in token** (about 1 hour), so after an hour "Who's using MapIt?" and
  "Back to MapIt" from Admin ask for the password again. Fix: renew with the refresh token in ONE place
  (and keep /review's borrowed session read-only). Found 2026-11-15 in 10A.
- 🧹 Multer errors (file over 5 MB, more than 5 files) return 500. Add error-mapping middleware that returns a friendly 400.
- 🧹 `compare-schema-inventory.js` reports a false "match" on wrapped input. Make it auto-unwrap, and fail if `tables` is missing.
- 🧹 Remove the unused `uuid` dependency (the last moderate `npm audit` finding).
- 🧹 Rename `Context.md` → `CONTEXT.md` in git (two-step via a temp name on Windows).
- ✅ Old admin "Pending" section deleted in Release 10A (orphaned-photos clean-up moved to Cleanup).
- 🧹 Transfer removed from the Admin page in 10A (Nagesh: no listings posted on behalf of others). Its server route
  `/api/admin/handover/*` and `uat:transfer` suite are now unused; remove them in a later clean-up.
- 🧹 Review Supabase Advisors: 15 Warnings / 14 Info.
- 🧹 (found in 10B, 2026-11-20) `listings` has two view columns: `views_count` (used) and `view_count`
  (never used, 000-baseline). Drop `view_count` in a later clean-up release (contract step; never in the
  same release as a code change). Check nothing reads it first.
- 🧹 (found in 10B, 2026-11-20) The `listings_updated_at` trigger bumps `updated_at` on every counted view,
  so `updated_at` means "last touched", not "last edited". Nothing reads it today. Fix before anything
  sorts or shows by it (e.g. `WHEN` clause on the trigger that ignores views_count-only updates).
- 💡 (10B follow-up) Count each viewer once per day (a `listing_views` table, viewer or IP hash + day) if
  inflated counts appear. Today `/view` is only limited by the `/api/` rate limiter.

## 4. Security / ops clean-up (post-9L)
- 🔜 Swap the Resend full-access key for a sending-only key.
- 🔜 Production auth redirect URLs: exact www and bare-domain entries.
- 🔜 Remove `SUPABASE_DB_PASSWORD` from the Vercel env.
- 👤 Gmail filter: forward Sentry alerts from mapit.backend@ to Nagesh.
- 👤 Arun: reconsider naming the Grievance Officer (IT Rules 2021 r.3(2)).

## 5. Manual leftovers (👤)
- 👤 9L: production review invites for both reviewers → incognito test → send → Activate.
- 👤 Revoke the uat Vercel Shareable Link.
- 👤 Delete the disabled Sentry monitor "MapIt prod /health" (id 10889098).
- 👤 Namecheap: confirm Auto-Renew is ON for mapit.co.in.
- 👤 Better Stack: invite Arun if the free plan allows it.
- 👤 Confirm these v4 "manual actions" are done, then delete this line: the broken old frontend
  Vercel project is deleted; Google OAuth redirect URIs include the www and uat callbacks.

## History (moved out of CLAUDE.md v4.1, done long ago)
- `UPDATE invite_codes SET code = trim(code) WHERE code != trim(code);`: prototype clean-up, done.
- `ALTER TABLE listings DROP CONSTRAINT listings_condition_check;`: done (not in 000-baseline).
- uat.mapit.co.in subdomain set up on the uat branch: done.
- Session numbers replaced by release names ("Release 9L") from v5.0.
