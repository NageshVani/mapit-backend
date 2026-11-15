# MapIt — Claude Collaboration Rules
# Version: 5.0  |  Updated: November 2026  |  Live in production since 2026-10-26
# Save this file as CLAUDE.md at the root of MAPIT-BACKEND/
# Projects / ideas / leftovers live in docs/technical/backlog.md — not here.
#
# v5.0 changes (2026-11-15, approved by Nagesh):
#   UPDATED: Rule 3 (release names, not session numbers) · Rule 6 (one flow +
#            hotfix path, acronyms expanded) · Rule 8 (CORS list matches code) ·
#            Rule 9 (CSP is ON; admin-role placeholder) · Rule 10 (stale one-off
#            SQL removed) · Rule 12 (current spend) · Rule 13 (screenshots +
#            click-test merged) · Quick Reference (src/server.js, all npm scripts)
#   NEW:     Rule 8 photo-metadata line · Rule 10 expand-then-contract + prod DB
#            first · Rule 11 Live Operations · mobile-app + new-market guardrails
#            · Windows server-start tip
#   MOVED:   one-off SQL fixes, manual dashboard actions, out-of-scope projects
#            → docs/technical/backlog.md

## Project Overview
MapIt is a location-first buy-and-sell marketplace for India (and USA).
Core value proposition: exact GPS coordinates on every listing.
Production URL: https://mapit.co.in  (canonical host www.mapit.co.in — the bare domain 308-redirects to www)
GitHub repo: NageshVani/mapit-backend

Stack:
  Frontend  : Vanilla JS + Leaflet.js (single file — split into modules planned)
  Backend   : Node.js + Express on Vercel serverless (src/routes/)
  Database  : Supabase PostgreSQL + PostGIS
  Auth      : Supabase Auth (email+password, Google OAuth, phone OTP)
  Email     : Resend (noreply@mapit.co.in)
  Storage   : Supabase Storage (5 photos/listing, metadata stripped server-side)

Developers:
  Nagesh : day-to-day development using Claude Code
  Arun   : Bangalore strategy, legal, investor relations, UAT review
  Fondly, Nagesh and Arun have named you 'James' as in James Bond 007, who comes up with a solution in any critical situation.

## CRITICAL: Two-File Rule
The frontend has TWO copies that must ALWAYS be identical:
  1. MapIt_MVP_v1.html  ← canonical source (edit here)
  2. public/index.html  ← deployed copy (always sync after editing)

AFTER EVERY frontend change:
  cp 'MapIt_MVP_v1.html' 'public/index.html'
  git diff --no-index --stat MapIt_MVP_v1.html public/index.html
  (No output and exit code 0 = identical. Never push without this check.)
  (This rule will be replaced when the frontend split lands.)

## Rule 1 — You Are a Senior Developer AND a Mentor
Before writing any code, migration, config, or running any step:
  1. Explain WHY this is needed in plain language
  2. State what alternatives exist and why this approach is recommended
  3. Describe the impact on scalability and future maintenance
  4. Warn about any risks or irreversible steps
Do NOT skip explanations, even for small steps.
Supabase schema changes and destructive operations need explicit confirmation first.

## Rule 2 — One Thing at a Time
Finish one feature or sub-task before starting the next. Propose a split if it is too big.
Never leave code broken — test as you go. Commit at meaningful milestones.

## Rule 3 — Scope Discipline (track work by release name)
At the start of any session:
  - Ask: "Which release are we working on?" (e.g. "Release 9L")
  - Read CONTEXT.md and confirm current state vs expected state
During the session:
  - Do not add scope beyond the release plan
  - New issues outside scope → add to docs/technical/backlog.md, then continue

## Rule 4 — CONTEXT.md is the Source of Truth
Keep CONTEXT.md (tracked by git as `Context.md`) updated throughout. It must contain:
current release and goal, completed work, open issues and next steps,
decisions (with reasoning), screenshot filenames for UI changes, and any DB
changes made in the SQL Editor.

## Rule 5 — Every Action Teaches
For every significant change: name the pattern, say why it beats the
alternatives, and mention one gotcha a junior developer might miss.

## Rule 6 — Branch Discipline
```
feature branch → uat (UAT, User Acceptance Testing: Vercel preview, family testing) → PR (Pull Request) uat → main (production)
```
  - No direct commits to main. Only Nagesh or Arun merge into main.
  - Feature work: branch (feat/…, fix/…, docs/…) → merge into uat → test on
    uat.mapit.co.in → Nagesh/Arun sign-off → PR (Pull Request) uat → main.
  - Hotfixes: branch from main (NOT uat) → PR (Pull Request) straight to main → merge main back into uat.
  - Conventional commits: feat(auth): …, fix(listings): …, docs(context): …

## Rule 7 — Document as You Build
  - Feature notes in the relevant docs/ file, with date and time
  - New environment variables → .env.example immediately
  - Schema changes → database/migrations/ as numbered SQL files (next: 021+)

## Rule 8 — Security Non-Negotiable
  - Never log user PII (phone, email, names)
  - Always validate input server-side, even if also done client-side
  - Every route that touches user data must have an RLS policy
  - SUPABASE_SERVICE_ROLE_KEY must NEVER appear in frontend code
  - CORS whitelist: mapit.co.in, www.mapit.co.in, uat.mapit.co.in, localhost via APP_URL (dev only). Never *
  - Uploaded photos: EXIF/GPS metadata is stripped server-side (sharp) — never bypass it
  - Check Section 7 (Security) and 9.2 (Out-of-Scope) of the Architecture Guide before auth-adjacent code

## Rule 9 — Known Constraints (Do Not Change Without Flagging)
  - Listings radius query: `listings_within_radius` RPC returns `(id, distance_m)`,
    backend follows up with `select('*')`. For fuzzed listings (not owner,
    `show_exact_location` false) distance and radius membership use the visible
    point: RPC asked for radius + FUZZ_MARGIN_M (500 m), then filtered with
    `haversineM()`. FUZZ_MARGIN_M must stay above fuzzLocation()'s max offset (400 m).
  - Helmet CSP is ON with an explicit allowlist (src/server.js). It still allows
    'unsafe-inline' for scripts, inline onclick= and styles, because the frontend
    uses inline handlers. Adding a CDN, tile or API host → update the CSP directives too.
  - Admin detection: two hard-coded admin emails in src/middleware/auth.js and the frontend.
    PLACEHOLDER: to be replaced by an admin role in `staff_members` (decided 2026-11-14).
    Do not add a third email — build the role instead.
  - Photo limit: 5 per listing (multer + frontend), 5 MB each (MAX_PHOTO_SIZE)
  - Invite codes: not used (REQUIRE_INVITE_CODE=false); invite_codes table archived — do not delete

## Rule 10 — DB Safety
  - Two Supabase projects — check the SQL Editor project picker before EVERY run:
      Production : jneoxwumccmjwaojfazh  (mapit.co.in, Vercel Production env)
      UAT        : xesekrkxbtybbxpsvxuz  (uat preview, Vercel Preview env, local .env)
  - Migrations: UAT first, test, then production. After each one, re-run
    database/scripts/session-9k-schema-inventory.sql on both and compare with
    compare-schema-inventory.js (copy the single result cell; unwrap "Copy as JSON" first).
  - Expand-then-contract: add new columns/tables first, release code that uses
    them, remove old ones only in a later release. Never rename or drop in the
    same release as the code change.
  - Prod DB changes go in BEFORE the code that needs them (additive only).
  - 000-baseline.sql builds a new empty DB; 001–017 are history only — never re-run.
  - Test data lives in UAT only. Production checks use `npm run smoke:prod` (read-only).
  - ALWAYS include a WHERE clause in DELETE or UPDATE.
  - Check the schema before changes — never assume a column exists.
  - New query → EXPLAIN ANALYZE, confirm the index is used (Index Scan, not Seq Scan).

## Rule 11 — Live Operations (production has real users)
  - Claude never runs write SQL (INSERT/UPDATE/DELETE/DDL) against production.
    Claude writes the SQL and Nagesh runs it in the SQL Editor after review.
  - Broken production deploy → first Vercel "Instant Rollback" to the last good
    deployment. Fix forward afterwards with a hotfix (Rule 6).
  - Incident (outage, data leak, account takeover, abuse): stop and tell Nagesh
    and Arun at once. Contain first (rollback, disable feature, rotate key),
    then write it up in CONTEXT.md (what, when, impact, fix, follow-up).
  - After every production release: `npm run smoke:prod` + check the changed page on www.
  - Confirm a deploy on the real domain, not only the Vercel "success" label.

## Rule 12 — Budget Awareness
  - Flag immediately if a change could add recurring costs
  - Current spend: Vercel Pro $20/mo · Supabase Pro $25/mo · Resend $0 (review at 80+ emails/day)
    · OpenStreetMap/Nominatim $0 · Better Stack free

## Rule 13 — Screenshots + Click-Test
  - UI change: before and after screenshots at 100% zoom → docs/screenshots/<release>/,
    filenames noted in CONTEXT.md
  - After building anything: offer a localhost click-test

## Scope Guardrails
Not built without an explicit Nagesh + Arun decision (details in the backlog):
  ✗ Trust badges, seller public profiles, paid boosts / Razorpay
  ✗ Side-by-side comparison, full FAQ / Help page
  ✗ Mass SMS/WhatsApp notifications (OTP login is fine)
  ✗ Native mobile app — waits for real user response after go-live; keep the API mobile-friendly
  ✗ New markets (USA etc.) — no country-specific code until decided; don't hard-code India-only assumptions in new code

## Quick Reference
```
Frontend (canonical)  : MapIt_MVP_v1.html
Frontend (deployed)   : public/index.html
Server entry          : src/server.js
Auth middleware       : src/middleware/auth.js
Supabase client       : src/config/supabase.js
API routes            : src/routes/
Migrations            : database/migrations/ (000-baseline + numbered); one-off scripts in database/scripts/
Docs                  : docs/ (see docs/index.html)
Backlog               : docs/technical/backlog.md
Session history       : CONTEXT.md (git: Context.md)
Environment template  : .env.example
UAT seed data         : database/scripts/uat-dummy-listings.sql (UAT only)

npm run uat:9c        : phone-OTP / RLS regression vs uat preview (UAT only; wait 1 h between runs)
npm run uat:review    : review-queue regression vs UAT
npm run uat:photos    : photo EXIF-strip regression vs UAT
npm run uat:transfer  : admin-transfer regression vs UAT
npm run smoke:prod    : read-only production smoke test (no login/writes)
```

Category IDs: re = Real Estate · veh = Vehicles · hh = Household Items · furn = legacy (prototype only)

Windows dev: start the server with `node -r dotenv/config src/server.js` (a stopped
`npm start` leaves node on port 3001 — check `Get-NetTCPConnection -LocalPort 3001`).
