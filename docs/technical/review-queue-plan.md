# Listing Review Queue: plan

*Draft 2026-10-26 (UAE). Status: PLAN, nothing built or run. Owner: Nagesh. Reviewer: Arun. Session 9L.*

**Decisions (Nagesh, 2026-10-26)**
- **D1 ✅** Reject keeps the listing (`status='rejected'` + reason). The seller can edit and resubmit. No more hard delete.
- **D2 ✅** The admin Pending tab becomes a link to `/review`, but only when the new page is released. Approvers
  (Nagesh's wife, Arun's wife) register on `/review` themselves.
- **🔒 Production untouched until the new page is tested on UAT and approved.** No migration 019 on prod, no code
  on `main`. Prod keeps today's admin Pending tab (approve / remove) as it is.
- **D3 ✅** Sellers get an email when a listing is rejected, with the reason and a link to edit and resubmit.
- **D4 ✅** Reject reasons in section 6 accepted for now. They may be added to or reworded later (a code setting, no migration).
- **Admin page:** `public/admin.html` (with the Transfer tab, live on prod since PR #28) is the real source.
  `MapIt_Admin_v1.html` is an older copy. Decide what to do with it later, during the build.

## 1. Goal

MapIt is going public. Pending listings need clearing fast, by more people than the two admins.
Approvals move out of the admin page into their own page, **`www.mapit.co.in/review`**:

- built for phones first (it still works on a laptop)
- approvers have their own sign-up and sign-in (email + strong password + email OTP)
- one listing at a time, with big **Approve** and **Reject** buttons and a reason for each reject
- after each decision the next listing loads, until the queue is empty
- several approvers can work at once without opening the same listing

First users: Arun, Arun's wife, Nagesh, Nagesh's wife. Later: hired approvers.

## 2. What exists today (checked in the code)

| Piece | Today | Problem for the new page |
|---|---|---|
| Who may approve | `requireAdmin` = 2 hardcoded emails (`src/middleware/auth.js`) | Can't add the wives or hires without a code change each time |
| Queue | `GET /api/listings/pending/all` returns **every** pending listing, newest first, flagged first | Everyone sees the same list → two people open the same listing |
| Approve | `PUT /api/listings/:id/approve`, no check that it is still pending | A second approver can "approve" it again; no record of who approved it |
| Reject | Admin page calls `DELETE /api/listings/:id` → **hard delete** | Seller never learns why, and the listing and photos are gone |
| Reject reason | `listings.status = 'rejected'` and `listings.rejection_reason` **already exist** in the DB, unused | Good news: no new column is needed for this |
| Sign-up | `/api/auth/signup` → `/verify-otp` → `PUT /password` → `/signin` (strong password + email OTP) | Reused as-is. No new auth code is needed |
| Session | Supabase token lasts 1 hour; the apps never refresh it | An approver would be signed out every hour. Needs a small refresh route |

## 3. Architecture

```
Phone browser
  public/review.html  (own small file: sign-in, sign-up, queue card)
        │  Bearer token (own localStorage key, separate from the main app)
        ▼
Express on Vercel
  /api/auth/*            existing: signup, verify-otp, password, signin  (+ new: refresh)
  /api/review/*          NEW router, src/routes/review.js
        │  requireAuth → requireReviewer (admin email OR staff_members.status='active')
        ▼
Supabase (service role)
  staff_members           NEW  who may approve
  listings                + review_claimed_by, review_claimed_until
  listing_reviews         NEW  every decision, with reason
  claim_next_pending_listing()  NEW  atomic "give me the next listing"
```

**Pattern: work queue with leases.** When an approver asks for the next listing, the database
picks the oldest pending listing that nobody holds and marks it as theirs for 5 minutes
(`FOR UPDATE SKIP LOCKED`). Two approvers asking at the same moment get two different listings.
If a phone dies, the claim runs out by itself and the listing goes back into the queue.

**Second safety net: conditional update.** Approve and reject only change a listing
`WHERE status = 'pending'`. If someone else already decided (for example from the admin page),
the request returns **409 "Already reviewed"** and the page loads the next one.

**Why not other options**

| Option | Why not |
|---|---|
| Keep everything in the admin page, add more admin emails | Every new approver = code change + deploy; approvers would also see costs, users and transfers |
| Supabase custom claims / JWT roles | Needs an auth hook. A role change only takes effect after the token refreshes, so revoking access is slow |
| Show the full list and let people pick | Duplicate work and race conditions as soon as 2+ people are active |
| Separate Supabase project for staff | Double the cost and setup for 4 people |

## 4. Access model (the important security part)

- **Signing up does NOT give access.** Sign-up creates the account and a `staff_members` row
  with `status = 'requested'`. The page then shows "Waiting for approval".
- An **admin** (Nagesh/Arun) opens the **Team** panel on `/review` (admins only) and taps
  **Activate**. **Revoke** works at once, on the approver's next request.
- Admins (Rule 9 emails) are approvers automatically; they have no roster row.
- An approver is never given their **own** listings. Admins are exempt, because they post for sellers.
- **Data minimisation (Rule 8)**: approvers see the seller's **first name only**; admins see the full name.
  No phone, no email, no exact pin (the area-name address only). This matters most once outside hires join.
- **Not on the review page**: suspend user, transfers, costs, reports. These stay on `/admin`.
- `/review` is `noindex` and not in `sitemap.xml`.

⚠️ **Rule 9 flag:** this adds a second kind of privileged user next to the hardcoded admin
emails. The admin list itself does not change.

## 5. Database changes: migration 019 (draft)

File: `database/migrations/019-listing-review-queue.sql`. Rollback: `database/scripts/019-rollback.sql`.

| Change | Purpose |
|---|---|
| `staff_members` table (user_id, display_name, role, status, requested_at, decided_by, decided_at) | Who may approve |
| `listings.review_claimed_by`, `listings.review_claimed_until` | 5-minute claim |
| `listing_reviews` table (listing_id, reviewer_id, decision, reason_code, reason_note, created_at) | History: who decided what and why |
| Partial index `listings (created_at) WHERE status='pending'` | Fast "oldest pending" lookup |
| Function `claim_next_pending_listing(reviewer, lease, exclude_seller, skip[])` | Atomic claim, callable by the service role only |

- **Additive only.** No data changes. New nullable columns have no default, so Postgres does not
  rewrite the table.
- RLS is ON for the new tables, with no client grants (same deny-by-default as 018). A verify block
  inside the migration rolls everything back if any client role can reach the new objects.
- Order of runs: **UAT → test → prod**, then the schema-inventory diff on both projects.

## 6. API: new `src/routes/review.js`

All routes go through `requireAuth`. All except `access-request` and `me` also go through `requireReviewer`.

| Route | What it does |
|---|---|
| `GET  /api/review/me` | `{ access: 'admin' \| 'active' \| 'requested' \| 'revoked' \| 'none', display_name }` |
| `POST /api/review/access-request` `{display_name}` | After sign-up: creates the `requested` row. It never changes an existing row |
| `POST /api/review/next` `{skip:[ids]}` | Claims and returns the next listing (fields below) + `remaining` count. Returns `{listing:null}` when the queue is empty |
| `POST /api/review/:id/approve` | `status='active'`, `expires_at = +30 days`, history row. 409 if no longer pending |
| `POST /api/review/:id/reject` `{reason_code, note}` | `status='rejected'`, `rejection_reason` = the reason label (+ note), history row. 409 if no longer pending |
| `POST /api/review/:id/release` | Skip: hand the listing back to the queue |
| `GET  /api/review/team` *(admin)* | Roster with status |
| `POST /api/review/team/:userId` `{status}` *(admin)* | Activate / revoke |
| `POST /api/auth/refresh` `{refresh_token}` | New: keeps approvers signed in beyond 1 hour |

**Listing fields shown** (as on the admin "Pending listings" tab): photos (up to 5), title, 🚩 flag +
reason, category/subcategory, price, seller (first name only for approvers), area address, posted
date + "waiting 2 h 10 m". New on this page: the **full** description (needed to spot phone numbers;
the admin page cuts it at 120 characters) and the details/specs.

**Reject reasons** (fixed codes, seller-friendly labels):

| Code | Label shown to the seller |
|---|---|
| `contact_info` | Phone number, email or links in the title or description |
| `photos` | Photos missing, unclear or not of the item |
| `wrong_category` | Wrong category |
| `price` | Price missing or unrealistic |
| `location` | Location looks wrong |
| `duplicate` | Duplicate of another listing |
| `misleading` | Details are incomplete or misleading |
| `prohibited` | This item is not allowed on MapIt |
| `other` | Other (a note is **required**) |

The server checks the code against this list and limits the note to 300 characters (Rule 8: validate on the server).

**Seller side.** "My Listings" shows **Not approved: *reason*** with **Edit & resubmit**. Editing
already sets the listing back to `pending` (`PUT /api/listings/:id`), so it re-enters the queue.

## 7. Frontend: `public/review.html` (mobile-first)

```
┌──────────────────────────────┐
│ MapIt Review   12 left  ⋮    │  sticky header: queue count, menu (Team*, Sign out)
├──────────────────────────────┤
│ [ photo 1 / 5  ← swipe → ]   │  full-width, scroll-snap carousel, tap = full screen
│ 🚩 Flagged: phone in text     │
│ 🚗 Honda City 2018 · ₹6.5L    │
│ Cars · Indiranagar            │
│ Seller: Ramesh · waiting 2h  │
│ Full description …           │
│ Details: km, fuel, owners …  │
│                              │
├──────────────────────────────┤
│ [ ✕ Reject ]   [ ✓ Approve ] │  sticky bottom bar, 56 px tall, thumb zone
│            Skip              │
└──────────────────────────────┘
```

- **Reject** opens a bottom sheet with reason chips + an optional note. "Other" needs a note.
- **Approve** has no confirm dialog (speed). Gotcha guard: both buttons stay disabled for 0.8 s after a
  new card appears, so a double tap can't approve the *next* listing by accident.
- After a decision: "✓ Approved" toast, then the next card. When empty: "All clear 🎉" + "Check again".
- The claim has 5 minutes. After 4 minutes idle the card shows "Still reviewing? Tap to keep it."
- Single file, vanilla JS, no framework, no map library (photos + text only), so it loads fast on
  mobile data. Escape helper on everything from the DB (T-014 lesson).
- Its own localStorage key (`mapit_review_session`), so it never mixes with a buyer account in
  the same browser.
- Admin page: the Pending tile becomes a link **"Open review queue →"** (one code path, not two).

## 8. Build order (Rule 2: one at a time, each with a test)

| Step | What | Test | Est. |
|---|---|---|---|
| 1 | Migration 019 on **UAT** | Verify NOTICE, EXPLAIN on the claim query, schema diff | 30 m |
| 2 | Backend `review.js` + `requireReviewer` + `/auth/refresh` | New `npm run uat:review` suite incl. **two approvers claiming at the same time** | 3 h |
| 3 | Mockup of `review.html` on a phone (screenshot) → Nagesh OK | — | 45 m |
| 4 | `review.html` build | Localhost click-test on phone width + real iPhone via uat | 4 h |
| 5 | Seller "Not approved" + resubmit; admin Pending tile → link | Localhost | 1 h |
| 6 | uat → wives sign up, Arun activates → PR `uat → main` → migration 019 on **prod** first → merge → `smoke:prod` | — | 1 h |

Total ≈ 10–11 h, so **two sessions**: (A) steps 1–2, (B) steps 3–6.

## 9. Cost (Rule 11)

₹0 recurring. No new services. Supabase OTP emails already go through Resend (4 sign-ups is nothing).
If sellers get a rejection email (open decision D3), that is one Resend email per rejection, so watch
the 80/day review line.

## 10. Risks / gotchas

- **Open sign-up page.** Anyone can create a "requested" account. That is harmless (no access),
  but the Team panel needs a Reject/Ignore action. Sign-up has the same OTP rate limit as the main app.
- **Signing up with an existing MapIt buyer email** verifies by OTP and then **sets a new password**
  on that account (same behaviour as the main app today). Tell the wives to expect this.
- **Claim updates bump `listings.updated_at`** (trigger). Nothing reads it today; noted in case that changes.
- **Approving from the old admin page** during the switch-over is safe: the conditional update gives a 409 on the review page.
- `listing_reviews` rows are deleted with their listing (CASCADE). Fine for now. If hires need audits
  that outlive listings, change it to keep the rows.
