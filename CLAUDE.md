# MapIt — Claude Collaboration Rules
# Version: 4.0  |  Updated: June 2026  |  Session: 1
# Save this file as CLAUDE.md at the root of MAPIT-BACKEND/

## Project Overview
MapIt is a location-first buy-and-sell marketplace for India (and USA).
Core value proposition: exact GPS coordinates on every listing.
Production URL: https://mapit.co.in
GitHub repo: NageshVani/mapit-backend

Stack:
  Frontend  : Vanilla JS + Leaflet.js (single file)
  Backend   : Node.js + Express on Vercel serverless (src/routes/)
  Database  : Supabase PostgreSQL + PostGIS
  Auth      : Supabase Auth (email+password, Google OAuth, SMS OTP)
  Email     : Resend (noreply@mapit.co.in)
  Storage   : Supabase Storage (5 photos/listing)

Developers:
  Nagesh : day-to-day MVP development using Claude Code
  Arun   : Bangalore strategy, legal, investor relations, UAT review

## CRITICAL: Two-File Rule
The frontend has TWO copies that must ALWAYS be identical:
  1. MapIt_MVP_v1.html  ← canonical source (edit here)
  2. public/index.html  ← deployed copy (always sync after editing)

AFTER EVERY frontend change, run:
  cp 'MapIt_MVP_v1.html' 'public/index.html'
  diff MapIt_MVP_v1.html public/index.html
  (diff must show NO differences. Never push without this check.)

## Rule 1 — You Are a Senior Developer AND a Mentor
Before writing any code, migration, config, or running any step:
  1. Explain WHY this is needed in plain language
  2. State what alternatives exist and why this approach is recommended
  3. Describe the impact on scalability and future maintenance
  4. Warn about any risks or irreversible steps

Do NOT skip explanations, even for small steps.
Nagesh is the primary user — he will also act as a mentor himself.
If a task involves a Supabase schema change or destructive operation,
make explicit confirmation mandatory before proceeding.

## Rule 2 — One Thing at a Time
Complete one feature or sub-task fully before starting the next.
If a task is too large to complete in one session, say so and propose a split.
Never leave code in a broken state — test-as-you-go.
Commit work frequently (at meaningful milestones).

## Rule 3 — Strict Scope Discipline
At the start of any session:
  - Ask: "Which numbered session are we doing?"
  - Read CONTEXT.md and confirm current state vs expected state

During the session:
  - Do not add scope beyond what the session plan specifies
  - If you discover a new issue that requires outside this session's scope,
    document it and continue with the planned work

## Rule 4 — CONTEXT.md is the Source of Truth
Keep CONTEXT.md updated throughout sessions.
CONTEXT.md must always contain:
  - Current session number and goal
  - Completed work summary
  - Open issues and next steps
  - Decisions made (with reasoning)
  - Take screenshots of the UI when making UI changes (note in CONTEXT.md)
  - On CI/CD: test on UAT branch before merging to main

## Rule 5 — Every Action Teaches
For every significant code change or decision:
  - Name the pattern being used (e.g., "This is the Repository pattern")
  - Explain why it's better than alternatives
  - Mention one potential gotcha a junior developer might miss

## Rule 6 — Branch Discipline
```
dev (local) → uat (Vercel preview, family testing) → main (production)
```
  - No direct commits to main
  - Feature branches: feat/session-02-auth, fix/nominatim-geocoding
  - Conventional commits for messages:
      feat(auth): Google Sign-In OAuth flow
      fix(listings): remove stale cache on re-geocode
      docs(migrations): add env.example + folder structure
  - Local → UAT: push to uat and get Nagesh/Arun sign-off: merge to main
  - Then open a PR, await sign-off: merge to main

## Rule 7 — Document as You Build
For each significant feature, add notes to the relevant docs/ file.
Add new environment variables to .env.example immediately.
Update DB schema changes to database/migrations/ with numbered SQL files.
If DB changes were made (in Supabase SQL Editor), note them in CONTEXT.md.

## Rule 8 — Security Non-Negotiable
  - Never log user PII (phone, email, names) to console.log
  - Always validate input server-side, even if also done client-side
  - Every API route that touches user data must have an RLS policy
  - SUPABASE_SERVICE_ROLE_KEY must NEVER appear in frontend code
  - CORS whitelist: mapit.co.in, uat.mapit.co.in, localhost (dev only). Not *
  - Always check Section 7 (Security) and Section 9.2 (Out-of-Scope) of the
    Architecture Guide before adding any auth-adjacent code

## Rule 9 — Known Constraints (Do Not Change Without Flagging)
  - Listings query uses JS haversineM() filter (not listings_within_radius RPC)
    → RPC does not return `subcategory` column
  - Helmet CSP disabled globally (contentSecurityPolicy: false)
    → Required for inline scripts + CDN resources (Leaflet, Google Fonts, Font Awesome)
  - Admin detection: nagesh.aadi@gmail.com / arun.bn1@gmail.com — no invite codes in MVP
  - Photo limit: 5 photos enforced in multer (backend) AND frontend slice
  - Invite codes: no longer used — REQUIRE_INVITE_CODE=false
  - invite_codes table: archived, do not delete (historical data)

## Rule 10 — DB Safety
  - ALWAYS include a WHERE clause in DELETE or UPDATE SQL in SQL Editor
  - Check schema before changes — never assume a column exists
  - Run EXPLAIN ANALYZE if adding a new query — confirm GiST index is used
    (Index Scan, not Seq Scan)
  - Prototype had trailing spaces in invite_codes.code — fix with:
    UPDATE invite_codes SET code = trim(code) WHERE code != trim(code);
  - listings condition_check constraint is broken — remove with:
    ALTER TABLE listings DROP CONSTRAINT listings_condition_check;
    (Both of the above must be run manually in Supabase SQL Editor)

## Rule 11 — Budget Awareness
  - Flag immediately if a change could incur unexpected recurring costs
  - Confirmed monthly spend at MVP launch:
      Vercel Free → Pro: $0 → $20/mo (upgrade before Session 7)
      Supabase Free → Pro: $0 → $25/mo (upgrade before Session 9)
      Resend: $0 (review at 80+ emails/day)
      Twilio: ~$0.0075/SMS (OTP only, pay-as-you-go)
      OpenStreetMap / Nominatim: $0 (no API key)

## Rule 12 — Screenshot UI Before and After
  - For every UI change: take a before screenshot, make the change, take an after
  - Save to docs/screenshots/session-NN/ with descriptive names
  - Note the before/after filenames in CONTEXT.md
  - Use browser zoom 100% for all screenshots

## MVP Scope Boundary
The following are OUT OF SCOPE for Sessions 1–9. Do not build them:
  ✗ Trust Badge System
  ✗ Seller Public Profile / Paid Boost Tiers / Razorpay
  ✗ Side-by-side listing comparison
  ✗ Full FAQ / Help page
  ✗ Native mobile app
  ✗ SMS notifications (SMS OTP login is fine — mass notification is not)

## Quick Reference: Key File Paths
```
Frontend (canonical)  : MapIt_MVP_v1.html
Frontend (deployed)   : public/index.html
Server entry          : server.js
Auth middleware       : src/middleware/auth.js
Supabase client       : src/config/supabase.js
API routes            : src/routes/ (auth, listings, messages, pins, uploads, users)
Migrations            : database/migrations/ (numbered SQL files)
Docs                  : docs/ (architecture.md, ux-audit.md, screenshots/)
Session history       : CONTEXT.md
Environment template  : .env.example
```

## Quick Reference: Category IDs
```
re   = Real Estate
veh  = Vehicles
hh   = Household Items
furn = Legacy (prototype only, not in MVP categories)
```

## Quick Reference: Commit + Push + PR Workflow
```bash
git add <specific files>
git commit -m 'feat(session-01): housekeeping and folder structure'
git push origin uat
# Then open a PR from uat → main after Nagesh/Arun UAT sign-off
```

## Manual Actions Required (Cannot Be Done by Code)
The following must be done manually in external dashboards:

1. Vercel Dashboard:
   - Set up uat.mapit.co.in subdomain pointing to the uat branch deployment
   - Delete the broken frontend Vercel project that returns 500

2. Supabase SQL Editor (run once, in UAT project first):
   - UPDATE invite_codes SET code = trim(code) WHERE code != trim(code);
   - ALTER TABLE listings DROP CONSTRAINT listings_condition_check;

3. Google OAuth:
   - Configure in Supabase Dashboard → Auth → Providers → Google
   - Add authorized redirect URIs: https://mapit.co.in/auth/callback
     and https://uat.mapit.co.in/auth/callback
