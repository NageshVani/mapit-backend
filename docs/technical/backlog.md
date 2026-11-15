# MapIt Backlog

Created 2026-11-15 (UAE) along with CLAUDE.md v5.0. Projects, ideas and leftovers that are not
operating rules live here. Order inside each section = rough priority.
Status: 🔜 planned · 💡 idea (needs a decision) · 🧹 small fix · 👤 manual (dashboard / person)

## 1. Planned releases (agreed order)
1. 🔄 **Frontend split (option 1)**: IN PROGRESS on `feat/frontend-split` (2026-11-15). Split the single HTML file into modules. Approved 14 Nov by Nagesh and Arun.
   New branch from a clean main, with no other frontend branch running at the same time. Vite comes later (v2).
   Replaces the Two-File Rule once it lands.
2. 🔜 **Views follow-up**: show 👁 views on My Listings, and stop counting the owner's own views.
3. 🔜 **Posting wizard with listing preview**: text-only draft; at least 1 photo required (except plots); full preview.
   Phone mockups first.

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
- 🧹 Multer errors (file over 5 MB, more than 5 files) return 500. Add error-mapping middleware that returns a friendly 400.
- 🧹 `compare-schema-inventory.js` reports a false "match" on wrapped input. Make it auto-unwrap, and fail if `tables` is missing.
- 🧹 Remove the unused `uuid` dependency (the last moderate `npm audit` finding).
- 🧹 Rename `Context.md` → `CONTEXT.md` in git (two-step via a temp name on Windows).
- 🧹 Delete the old admin "Pending" section (replaced by the 9L review queue).
- 🧹 Review Supabase Advisors: 15 Warnings / 14 Info.

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
