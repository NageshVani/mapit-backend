---
Runs automated UAT testing on the just-completed Claude Code session, produces a dark-themed HTML UAT report (session-xx-uat-report.html), then asks for the tester's name and produces a printable UAT checklist (session-xx-uat-checklist-<name>.html). Invoke with /run-uat at the end of any development session./run-uat — UAT Test Runner + Report Generator
---

You are acting as a QA engineer. Your job is to:

Determine the current session number
Run automated UAT tests on everything built/changed this session
Produce a styled HTML UAT report
Ask for the manual tester's name
Produce a styled HTML UAT checklist for that person

Work through each phase below in order. Do not skip phases.

0. PHASE 0 — Determine Session Number
Read session-log.html from the project root (if it exists) and count the distinct
session blocks to determine the current session number N. If session-log.html does
not exist, set N = 1. All output files will use this number formatted as two digits
(e.g. session-01, session-07, session-12).
Also read CONTEXT.md to understand what was built or changed this session before
running any tests.

1. PHASE 1 — Automated UAT Testing
Identify every feature, API route, UI flow, and database rule that was created or
modified this session from CONTEXT.md and the conversation history. Then test each
one systematically using the methods below.
Testing methods (use whichever apply)
API / Backend tests

Use curl or Node.js fetch to call each affected route
Test with: authenticated user, unauthenticated user, wrong user (another uid)
Assert correct HTTP status codes and response shape
Check error messages are descriptive and not leaking internals

Supabase / RLS tests

For each table touched this session, run SQL via supabase db execute or direct
psql to verify policies using:

sql  SELECT tablename, policyname, cmd, roles, qual, with_check
  FROM pg_policies WHERE tablename = '<table>';

Confirm SELECT / INSERT / UPDATE / DELETE policies exist for authenticated role
Confirm no {public} role on write operations
Verify a request from a different auth.uid() is rejected

File / config checks

Verify no hardcoded secrets, IPs, or Windows paths remain
Check .env references are consistent with actual env vars in use
Confirm server starts cleanly: node src/server.js (or npm run dev) with no errors

Regression check

Re-run any existing test scripts (npm test / Playwright / Jest) if present
If no test suite exists, manually curl the three most critical routes and assert 200

Record results
For every test, record:

id — T-001, T-002 … in order tested
area — e.g. "RLS / listings", "API / auth", "Config / env"
description — one sentence of what was tested
method — how it was tested (curl, SQL, file read, etc.)
expected — what should happen
actual — what actually happened
status — PASS | FAIL | WARN | SKIP
evidence — the raw output snippet (≤ 6 lines), or "see report" if too long
fix_applied — YES / NO (did you fix it inline right now?)


2. PHASE 2 — Generate UAT Report
Create the file session-{NN}-uat-report.html in the project root.
Design spec
As per earlier reports, created for session-01 and session-02 etc

3. PHASE 3 — Ask for Tester Name
After writing the report file, output this message exactly in your chat response:

✅ UAT report saved → session-{NN}-uat-report.html

{n} tests run: {pass} passed · {fail} failed · {warn} warnings · {skip} skipped
Overall verdict: [PASS / FAIL / PARTIAL]

Now generating the manual UAT checklist.
👤 Who will be carrying out the manual UAT test? (Enter their first name)

Wait for the user's reply before proceeding to Phase 4. Do not generate the checklist
until you have the tester's name.

4. PHASE 4 — Generate UAT Checklist
Once the name {TesterName} is received, create the file:
session-{NN}-uat-checklist-{TesterName}.html in the project root.
Design spec
As per earlier uat check list, created for session-01 and session-02 etc

5. PHASE 5 — Confirm Completion
After writing both files, output this message in chat:
✅ Files created in project root:

  📄 session-{NN}-uat-report.html      ← automated test results
  📋 session-{NN}-uat-checklist-{TesterName}.html  ← manual test guide

Share the checklist file with {TesterName} to complete UAT.
Run /checkpoint to save this session's UAT status to CONTEXT.md.
Then update CONTEXT.md by appending a UAT Status block:
markdown## UAT Status — Session {NN}
- Report: session-{NN}-uat-report.html
- Automated: {pass} PASS / {fail} FAIL / {warn} WARN
- Manual checklist: session-{NN}-uat-checklist-{TesterName}.html
- Tester: {TesterName}
- Status: Pending manual sign-off

IMPORTANT RULES

Never skip Phase 3 (asking for the name). The checklist filename requires it.
If tests reveal a critical FAIL, fix it inline before writing the report — mark
fix_applied: YES and note what was changed.
If CONTEXT.md is missing or empty, ask the user to run /resume first.
Session number NN always has a leading zero for single digits (01, 02 … 09, 10, 11).
Both HTML files are standalone — no CDN, no external fonts, no JS imports.
The checklist Steps to Test column must be written in plain language a non-developer
(e.g. a family member beta tester) can follow without technical knowledge.