# 🧠 Session Context — MapIt Backend

> **How to use:** Ask Claude Code to update this file every 10–15 messages.
> Start a new session with: "Read CONTEXT.md and continue from where we left off."

---

## 📌 Project Overview
- **Project:** MapIt — Bangalore property/classifieds prototype (family beta)
- **Stack:** Node.js + Express (Vercel serverless) · Supabase (DB + Auth + Storage) · Resend (SMTP) · Leaflet.js (maps) · Single-file vanilla JS frontend
- **Root directory:** `c:\Users\Vanin\Documents\MapIt project\mapit-backend`
- **Last updated:** 2026-06-03 (Session 6 checkpoint)

---

## 🎯 Current Goal

Session 6 UX fixes applied. Ready to smoke-test locally, revert API_URL to production, and deploy to GitHub → Vercel.

---

## ✅ Completed This Session

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

- ✅ **Session 6 — UX fixes (all implemented):**
  - **Admin menu visibility root fix**: Added missing CSS rule `.uav-item.hide{display:none;}` — without it, `classList.toggle('hide')` had zero visual effect; Review Listings + View Feedbacks were always visible to ALL users regardless of invite code
  - **Invite code screen skipped for returning users**: `continueAs()` catch block now pre-fills invite code and email from stored session, calls `goToStep('step-email')` — expired-session re-auth only requires OTP entry
  - **Set location splash removed for returning users**: Removed the blocking "Please set your GPS location" splash branch; all post-first-login users auto-dismiss the splash; location manageable via My Locations in profile menu
  - **Map zoom buttons moved to bottom-right**: Changed Leaflet zoom control from `position:'topright'` to `position:'bottomright'` — no longer overlaps profile avatar menu
  - **Inbox badge clears on open**: Badge set to hidden immediately when inbox modal opens (optimistic clear); `apiPut('/api/messages/mark-all-read', {})` called after render to persist read status
  - **Backend `PUT /api/messages/mark-all-read`**: New endpoint in `src/routes/messages.js`; single DB UPDATE sets `is_read=true` for all unread messages where current user is receiver

---

## 🔧 In Progress

| Task | Status | File(s) Touched | Notes |
|------|--------|-----------------|-------|
| Local smoke test — full OTP flow | 🟡 Pending | — | Verify all Session 4+5+6 fixes end-to-end on localhost |
| Supabase OTP mode fix | 🟡 Pending | Supabase dashboard | Auth → Providers → Email → disable "Confirm email"; template must use `{{ .Token }}` |
| API_URL revert to production | 🟡 Pending | `MapIt_Demo 30052026.html` line ~652 | Switch from localhost:3001 back to https://api.mapit.co.in |

---

## 📂 Key Files Modified

```
MapIt_Demo 30052026.html   — Session 6: admin menu CSS fix; invite code skip; location splash removed; zoom bottomright; inbox badge fix; API_URL still localhost:3001 (REVERT before prod push)
src/routes/messages.js     — Session 6: added PUT /api/messages/mark-all-read endpoint
src/server.js              — app.listen() guarded; CORS includes mapit.co.in + localhost origins
src/routes/auth.js         — /api/auth/me: optional ?invite_code= fallback for created_for lookup
src/routes/users.js        — /feedback/all: joins invite_codes to include created_for per feedback entry
public/index.html          — API_URL set to https://api.mapit.co.in
```

---

## 🐛 Open Issues / Blockers

- **`MapIt_Demo 30052026.html` API_URL is currently on localhost:3001** — Must switch back to `https://api.mapit.co.in` before production push
- **Supabase OTP mode** — If not yet fixed, disable "Confirm email" under Auth → Providers → Email; update template to `{{ .Token }}`
- **Photo upload inconsistency** — Form UI says "up to 5 photos" but `MAX_PHOTOS_PER_LISTING` env var is `10`. Decide which is correct and align both
- **Multi-session first-run (Session 5)** — After deploy, each family member's first `continueAs` will refresh their stored name from `created_for`. WhoAmI may still show old name on that very first pick; correct from next time onward.
- **Arun's admin email not yet added** — Line ~1736: `ADMIN_EMAILS = ['nagesh.aadi@gmail.com']` — add Arun's email once known (admin menu for Arun now works via invite code MAPIT-A-01)
- **`invite_codes.used_by` may be null for early registrants** — Session 5 backend fallback handles this, but running a one-time Supabase SQL to backfill `used_by` would make it permanently clean

---

## 💡 Decisions Made

| Decision | Rationale |
|----------|-----------|
| Vercel serverless for backend | Zero-ops, free tier, works with `@vercel/node` |
| Supabase for DB + Auth + Storage | Managed Postgres, built-in OTP auth, S3-compatible storage |
| Resend as custom SMTP inside Supabase | Reliable transactional email, `mapit.co.in` domain, free tier sufficient |
| Separate Vercel project for frontend | Cleaner domain split: `mapit.co.in` (frontend) vs `api.mapit.co.in` (backend) |
| Invite-code gated auth | Closed beta — only family members with codes can register |
| OTP via email (not magic link) | `emailRedirectTo: null` + "Confirm email" disabled in Supabase forces 6-digit code |
| `app.listen()` guarded with `require.main === module` | Prevents Vercel cold-start failures |
| `API_URL` toggle comment in HTML | Easy one-line switch between localhost and production for testing |
| `mapit_sessions` multi-session store | Shared-device family use: all sessions stored; WhoAmI screen shows family picker; no OTP on switch |
| Per-user `mapit_welcomed_${userId}` flag | Welcome splash shown only at first registration per user, not on every login |
| Feedback submit button disabled on click | Prevent duplicate records from slow response + impatient taps |
| Admin menu via invite code + email dual-check | `localStorage.getItem('mapit_invite')` added as fallback so code is always resolved |
| `loadAndRenderPins()` syncs map state | Ensures GPS badge, red marker, and map view always reflect the active pin |
| `created_for` (invite code) as canonical display name | `profile.full_name` can be "Mapit User" placeholder; `invite_codes.created_for` is the reliable family member name |
| `/api/auth/me` accepts `?invite_code=` fallback | Ensures `created_for` resolves for users where `invite_codes.used_by` was never set (early registrants) |
| `created_for` stored as separate field in `mapit_sessions` | Allows WhoAmI to show correct name even if `name` field is stale; refreshed on every `continueAs` |
| Admin items hidden immediately in `continueAs` and `logout` | Prevents admin menu bleeding from a previous admin session when the next user's session is expired |
| `.uav-item.hide{display:none;}` CSS rule added | All existing `.hide` rules in this file are component-specific; without this rule, `classList.toggle('hide')` on menu items had zero visual effect |
| `continueAs` catch pre-fills invite code + email, skips to `step-email` | Expired sessions should not force re-entry of already-known invite code; user only needs OTP |
| Set-location splash removed for returning users | Blocking full-screen prompt for users who already completed onboarding is intrusive; My Locations in profile menu is sufficient |
| Zoom control moved to `bottomright` | `topright` position overlapped with profile avatar menu in header |
| Inbox badge cleared optimistically on open + `mark-all-read` backend call | Badge must clear when user views inbox; separate DB endpoint ensures persistence across sessions |

---

## 🔜 Next Steps (Queued)

1. **Fix OTP mode in Supabase** — Auth → Providers → Email → disable "Confirm email"; update email template to use `{{ .Token }}`
2. **Local smoke test** — invite code → OTP email → 6-digit verify → profile setup → map loads → post a listing; verify all Session 4+5+6 fixes (admin menu hidden for non-admins, zoom in bottom-right, inbox badge clears)
3. **Revert `API_URL` to production** — uncomment `https://api.mapit.co.in` line, comment out localhost line in `MapIt_Demo 30052026.html` (line ~652)
4. **Push to GitHub** — triggers Vercel redeploy (includes Session 4 + Session 5 + Session 6 fixes)
5. **Smoke test live API** — `GET https://api.mapit.co.in/health` and `GET https://api.mapit.co.in/api/auth/status`
6. **Update Supabase Auth URL config** — Site URL: `https://mapit.co.in`; Redirect URLs: `https://mapit.co.in/**` and `https://www.mapit.co.in/**`
7. **Deploy frontend at `mapit.co.in`** — create new Vercel project → add `mapit.co.in` + `www.mapit.co.in` → add CNAME in Namecheap
8. **Add Arun's email to ADMIN_EMAILS** — update line ~1736 in `MapIt_Demo 30052026.html` once known
9. **Optional: backfill `invite_codes.used_by`** — run Supabase SQL to join `profiles.email` → `auth.users` → `invite_codes` and set `used_by` for early registrants
10. **Resolve photo upload inconsistency** — align form UI ("up to 5") with env var (`MAX_PHOTOS_PER_LISTING=10`)
11. **Set up DEV/UAT/PROD Git branches** — `dev` → `uat` → `main`; Vercel preview URLs for dev and UAT

---

## 📎 Important Context / Constraints

- **Supabase project URL:** `https://jneoxwumccmjwaojfazh.supabase.co`
- **DNS:** `api.mapit.co.in` CNAME → `4bb267e12ef05e09.vercel-dns-017.com` (confirmed propagated 2026-06-01)
- **Registrar:** Namecheap
- **Admin detection:** dual check — invite codes `MAPIT-N-01` / `MAPIT-A-01` OR email `nagesh.aadi@gmail.com`
- **Auth flow:** invite code → email OTP → Bearer token in localStorage → `requireAuth` middleware validates JWT
- **CORS:** allows `mapit.co.in`, `www.mapit.co.in`, `localhost:3000`, `localhost:5500`, `127.0.0.1:5500`
- **OTP rate limit (Express):** `OTP_RATE_LIMIT=100` per hour per IP (Vercel env var)
- **Resend free tier:** 100 emails/day — sufficient for family beta
- **`MapIt_Demo 30052026.html`** is the live frontend (1971+ lines, single-file). `public/index.html` is a copy — keep them in sync.
- **Multi-session storage key:** `localStorage['mapit_sessions']` — JSON object keyed by Supabase user ID; contains `{ session, name, initials, invite_code, email, last_login }` per user
- **Messages API:** `GET /api/messages/inbox` returns conversations grouped by listing + other user; `POST /api/messages` accepts `{ receiver_id, content, listing_id? }` (listing_id optional for admin replies); `PUT /api/messages/mark-all-read` marks all received unread messages as read
- **Admin menu CSS:** `.uav-item.hide{display:none;}` is the critical rule — all other `.hide` rules in this file are component-specific (e.g. `.modal-overlay.hide`, `.whoami.hide`)
