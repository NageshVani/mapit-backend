# MapIt Prototype — UI Audit
**Session 1 | Conducted: June 2026**
**Auditor:** Claude Code (based on MapIt_MVP_v1.html source + family beta feedback)
**Purpose:** Document specific visual and typography issues to fix before MVP sessions build new screens.

---

## 1. Typography Hierarchy

### Current State
The prototype uses `font-size: 15px` as base with `Outfit` font. Font sizes in use:
- Logo: 24px (Playfair Display)
- Listing price: 20–22px (Playfair Display) — correct
- Category labels: 10px
- Sub-row pills: 11px
- Search dropdown items: 12px title / 10px meta
- Sidebar listing card title: ~13–14px
- Body/detail text: 13–14px
- Proximity header: 9.5px (UPPERCASE)

### Issues Found
| # | Issue | Location | Fix |
|---|---|---|---|
| T1 | Font size fragmentation — 7+ distinct sizes across the sidebar alone | Sidebar | Reduce to max 3 sizes: 16px (titles), 13px (body/meta), 10px (labels/caps) |
| T2 | Category label at 10px is too small at 100% zoom on laptop screens | `.cat-lbl` | Increase to 11px minimum |
| T3 | Proximity section header uses 9.5px uppercase — hard to read | `.rad-hd` | Increase to 10px or remove uppercase treatment |
| T4 | Listing card titles not visually distinct from meta text | Sidebar cards | Bump title to 14px bold; meta stays 12px muted |
| T5 | No consistent heading size for section headings inside listing detail | Detail panel | Establish: 16px for section titles, 13px for body |

### Recommended Type Scale
```
Listing title (card / detail)  : 16px — font-weight: 700
Price                          : 20px — Playfair Display, font-weight: 700
Section headings               : 13px — font-weight: 700, uppercase, letter-spacing
Body text / description        : 14px — font-weight: 400
Meta (distance, time, count)   : 12px — muted colour
Labels / chips                 : 11px — font-weight: 600
Micro labels (PROXIMITY, etc.) : 10px — font-weight: 700, letter-spacing: 1.5px
```

---

## 2. Colour Discipline

### Current State
CSS variables defined:
- `--orange: #F06030` / `--orange2: #FF7A50` (accent)
- `--blue: #3B82F6`, `--green: #22C55E`, `--gold: #F59E0B`, `--red: #EF4444` (status)
- Background: `--ink: #F7F9FC`, `--deep: #EDF0F5`, `--panel: #FFFFFF`

### Issues Found
| # | Issue | Location | Fix |
|---|---|---|---|
| C1 | Distance bar uses teal gradient (`#0d9488` → `#0284c7`) — second accent colour | `.ld-dist-bar` | Decide: keep teal for distance only OR replace with orange monochrome |
| C2 | Two orange shades (`--orange` and `--orange2`) used inconsistently | Hover states | Use `--orange` only; `--orange2` only for hover — document this rule |
| C3 | Active tab indicator (orange underline) disappears at small viewport widths | `.tab-btn.on` | Test at 320px width — ensure underline is always visible |
| C4 | Muted text (`--muted: #6B7280`) sometimes too low contrast on `--deep` background | Various | Run contrast check: minimum 4.5:1 for WCAG AA on body text |
| C5 | "BETA" tag border/text uses `--orange` but `demo-tag` CSS class named "demo" | `.demo-tag` | Rename class to `.beta-tag` in MVP version |

### Rule for MVP
- `--orange (#F06030)` = **sole** accent colour for interactive elements, CTAs, active states
- `--blue`, `--green`, `--gold`, `--red` = **status only** (chat new, approved, price, error)
- `teal` = distance bar only (acceptable single exception — visually tied to location/map)
- All other UI = near-monochromatic (whites, greys from existing CSS variables)

---

## 3. Spacing & Layout

### Issues Found
| # | Issue | Location | Fix |
|---|---|---|---|
| S1 | Listing cards have inconsistent internal padding — some 12px, some 10px | `.lr-*` classes | Standardise to 12px horizontal, 10px vertical for all cards |
| S2 | Sidebar width `--sb-w: 380px` — correct for desktop, but no responsive breakpoint | Root CSS | Add breakpoint at 768px: sidebar becomes full-width overlay on mobile |
| S3 | Category row scrollbar hidden (`::-webkit-scrollbar{display:none}`) — not obvious it scrolls | `.cat-row` | Add a subtle right-fade gradient to hint overflow; or show last-item partial clip |
| S4 | Proximity buttons too narrow at flex:1 when 6 buttons visible (1km–City–Region) | `.rbt` | Change to `min-width: 44px` + let row scroll if needed |
| S5 | Detail panel has no max-width on description text — long lines on wide monitors | `.ld-body` | Add `max-width: 480px` and `line-height: 1.6` to description container |
| S6 | No breathing room between listing cards — items feel cramped at density | `.lr-card` | Add `margin-bottom: 4px` or increase gap in flex container |

---

## 4. Listing Post Form

### Issues Found
| # | Issue | Location | Fix |
|---|---|---|---|
| F1 | Category form fields are shown as a single textarea — context-specific fields from `LISTING_FIELDS` need visual section headings | Post form | Add bold 13px section headings per group: "Property Details", "Pricing", "Location" |
| F2 | Manual lat/lng coordinate entry is the current location method — user-hostile | Post form | **Session 3 replaces this** with inline map picker + Nominatim reverse geocoding |
| F3 | Photo upload area has no minimum photo enforcement UI — Publish button active even with 0 photos | Post form | **Session 3 fix** — disable Publish button until ≥ 1 photo attached |
| F4 | "— Select type —" placeholder exists but visual styling doesn't make it distinct from a real value | Subcategory select | Style placeholder option in muted italic; mark as `disabled` |
| F5 | Price field label says "Price" — no currency context (₹ vs $) | Post form | Prefix price input with `₹` icon for India; make dynamic for future USA city |

---

## 5. Auth / Onboarding Screens

### Issues Found
| # | Issue | Location | Fix |
|---|---|---|---|
| A1 | Invite code screen is the current entry point — removed in MVP | Auth flow | **Session 2 replaces entire auth** with email+password + Google + SMS OTP |
| A2 | Welcome splash is per-user via `mapit_welcomed_${userId}` but is text-heavy | Onboarding | Redesign as 3-step visual card carousel in Session 2 |
| A3 | Profile avatar shows initials only — no fallback for missing name | Header `.uav` | Add "?" as default initials if name is empty |
| A4 | Profile menu has no "Notification Preferences" option | `.uav-menu` | **Session 4 adds this** |

---

## 6. Map & Interaction

### Issues Found
| # | Issue | Location | Fix |
|---|---|---|---|
| M1 | "BETA" tag in header is leftover from prototype — replace with app name only | Header | Remove `.demo-tag` in Session 2 (keep in prototype file only) |
| M2 | Radius circle is orange dashed — not visually distinct from listing pins | Map | Keep orange but increase opacity; or use a labelled ring instead of dashed circle |
| M3 | Pin count pill at bottom-centre overlaps map attribution (Leaflet footer) | Map | Move pin count to bottom-centre but add `margin-bottom: 24px` to clear attribution |
| M4 | List View toggle exists but shows toast "List view available in full app" | Header toggle | **Session 8 implements** full list view; keep toast for MVP Sessions 1–7 |
| M5 | No loading state when map pins are being fetched — map just shows empty | Map | Add a subtle loading overlay on the map tile while `loadAndRenderPins()` runs |

---

## 7. Priority Fix Order for MVP Sessions

| Priority | Issue IDs | Session |
|---|---|---|
| Critical (blocker) | A1, F2, F3 | Session 2–3 |
| High (UX clarity) | T1, T4, C1, S1, F1 | Session 2–3 (alongside feature work) |
| Medium (polish) | T2, T3, C2, S3, S6, F4, F5, M1, M5 | Session 4–5 |
| Low (nice to have) | C3, C4, S2, S4, S5, A2, A3, M2, M3, M4 | Session 8–9 |

---

## 8. What to Keep (Do Not Change)

The following prototype patterns are working well and should be **preserved in MVP**:

- Dark sidebar on light background — correct visual hierarchy
- Orange-only CTA buttons — consistent and distinctive
- Leaflet.js map integration — works reliably, no replacement needed
- `LISTING_FIELDS` JS object — correct approach for dynamic form; just needs visual section headings
- Category + subcategory two-level filter — good mental model, keep structure
- Sidebar tab pattern (Browse / Post / My Ads) — familiar and functional
- Playfair Display for price — premium feel, keep
- `Outfit` font — clean, modern, keep
- Orange → teal gradient for distance bar — acceptable; adds visual identity to the location-first brand
