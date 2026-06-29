# MapIt — Architecture Reference

## Stack
| Layer | Technology | Notes |
|---|---|---|
| Frontend | Vanilla JS + Leaflet.js | Single file — `MapIt_MVP_v1.html`. Always sync to `public/index.html`. |
| Backend | Node.js + Express | Vercel serverless functions in `src/routes/` |
| Database | Supabase PostgreSQL + PostGIS | `jneoxwumccmjwaojfazh.supabase.co` |
| Auth | Supabase Auth | Email+password, Google OAuth, SMS OTP (MVP) |
| Email | Resend | `noreply@mapit.co.in` — 100 emails/day free |
| Storage | Supabase Storage | 5 photos per listing |
| Maps | Leaflet.js + Nominatim | No API key required |
| Hosting | Vercel | Free tier → Pro before Session 7 |

## URL Structure
- Production: `https://mapit.co.in`
- API: `https://api.mapit.co.in` (CNAME → Vercel)
- UAT: `https://uat.mapit.co.in` (to be configured)
- GitHub: `NageshVani/mapit-backend`

## Branch Strategy
```
dev (local) → uat (Vercel preview) → main (production auto-deploy)
```
- Feature branches: `feat/session-02-auth`, `fix/nominatim-geocoding`
- Never commit directly to `main`

## Key Architectural Decisions

| Decision | Rationale |
|---|---|
| Single-file vanilla JS frontend | Working in production; no Next.js migration during MVP (3–4 sessions cost, high risk) |
| Listings query via JS haversineM() | `listings_within_radius` RPC did not return `subcategory`; JS SELECT * guarantees all columns |
| Helmet CSP disabled | Inline scripts + CDN resources (Leaflet, Font Awesome, Google Fonts) require it |
| Admin via email check | `nagesh.aadi@gmail.com` / `arun.bn1@gmail.com` — no invite codes in MVP |
| 5 photos per listing | Enforced in multer (backend) AND frontend slice |
| `details` JSONB column | Stores all category-specific fields; flexible for new categories without schema changes |
| Frontend served from Express | Vercel always reads root `vercel.json` regardless of Root Directory setting |
| `express.static` for public/ | Simplest deployment model; no separate Vercel project needed |

## Approved Monthly Spend (MVP)
| Service | Plan | Cost | Upgrade Trigger |
|---|---|---|---|
| Vercel | Free → Pro | $0 → $20/mo | Before Session 7 (multi-city) |
| Supabase | Free → Pro | $0 → $25/mo | Before Session 9 (public launch) |
| Resend | Free | $0 | Review at 80+ emails/day |
| Twilio SMS | Pay-as-you-go | ~$0.0075/SMS | OTP only |

## MVP Scope Boundary — OUT OF SCOPE (Sessions 1–9)
- Trust Badge System
- Seller Public Profile Page
- Paid Boost Tiers / Razorpay
- Invite-code authentication (legacy — `invite_codes` table archived, not deleted)
- Side-by-side listing comparison
- Full FAQ / Help page
- Native mobile app
- SMS notifications (SMS OTP only is fine)
