# SkyBook Mobile Experience — Design Spec

**Date:** 2026-06-10
**Status:** Approved design, pending implementation plan
**Author:** Brainstormed with Gerri (Aero Digital / True Sky Ventures)

## Goal

Make SkyBook's booking admin not just usable but genuinely beautiful and easy to
navigate on a phone — across the daily booking console, the admin hub, login, the
booking detail/editor, and finance views. Desktop must remain unchanged.

## Design Decisions (locked during brainstorming)

| Decision | Choice |
| --- | --- |
| Primary navigation | **Hybrid** — 3-tab bottom bar (Calendar · Bookings · More); "More" opens a polished drawer for all secondary destinations |
| Visual style | **Sky Blue Premium** — existing brand blue elevated: rich gradient headers, floating stat cards, soft depth |
| Scope | Full mobile experience (console, admin hub, login, booking detail/editor, finance) |
| Booking detail pattern | **Full-screen + scrollable tab strip** (replaces the current FAB drawer) |

## Constraints

1. **Pure HTML/CSS/vanilla JS.** No framework, no build step. Styling lives in
   `assets/css/booking.css` and `assets/css/admin.css`; behavior in
   `assets/js/booking-admin.js` (markup is template-string-rendered there).
2. **Desktop is untouched.** All mobile work is additive, gated behind media
   queries (≤768px primary mobile breakpoint, with ≤980px tablet adjustments).
   No desktop selector is modified in a way that changes desktop rendering.
3. **Standalone mirror.** Every change must be mirrored into `Skybook Final/`
   (the white-label Standalone product). CSS files and `booking-admin.js` are
   safe to mirror wholesale. `booking-shared.js`, `admin.html`, `login.html`,
   and `booking-admin.html` must be edited surgically in BOTH copies, never
   overwritten wholesale. Skybook Final stays local (commit only, no remote).
4. **Approach 1 — Responsive CSS layer + minimal additive JS.** Reuse existing
   DOM. No duplicate mobile markup. New behaviors are small, self-contained JS
   modules. This protects desktop, keeps one source of truth, and makes the
   Standalone mirror manageable.

## Architecture

The work decomposes into five independent units. Each has one clear purpose,
a well-defined interface (CSS classes + `data-` hooks + a small JS init), and
can be built and verified on its own.

### Unit 1 — Mobile Bottom Tab Bar (top-level nav)

**Purpose:** Replace the hamburger slide-in for the main app shell with a
thumb-reachable bottom bar.

**Current state:** `#adminAppShell .admin-sidebar-booking` holds a 6-section
accordion of ~26 `data-admin-tab` buttons
([booking-admin.html:36-104](../../../booking-admin.html#L36-L104)). Mobile
currently toggles the sidebar via `#mobileSidebarToggle` +
`#sidebarBackdrop`.

**Design:**
- A fixed bottom bar (`.sky-mobile-tabbar`), shown only ≤768px, with exactly
  three targets:
  - **Calendar** → activates `data-admin-tab="calendar"`
  - **Bookings** → activates `data-admin-tab="bookings"`
  - **More** → opens the existing sidebar as a bottom-anchored drawer exposing
    all 6 sections / 26 destinations.
- The bar reuses the existing tab-activation logic — each button dispatches the
  same action as clicking the corresponding `.admin-tab`. No routing changes.
- Active state syncs: when the current module changes, the matching tab
  highlights; if the active module isn't one of the three, "More" shows a subtle
  active dot.
- The "More" drawer reuses the existing `.admin-sidebar-booking` markup,
  restyled as a slide-up sheet with the Sky Premium treatment (grouped sections,
  large touch targets ≥44px, the existing accordion preserved).
- The legacy `#mobileSidebarToggle` hamburger is hidden on mobile (kept in DOM
  for ≤980px tablet, where the slide-in still makes sense) to avoid two ways of
  opening the same menu at the phone breakpoint.

**Interface:** `.sky-mobile-tabbar`, `.sky-tab`, `.sky-tab.is-active`,
`data-sky-tab="calendar|bookings|more"`; JS `initMobileTabBar()` bound once after
the app shell renders.

### Unit 2 — Booking Detail Tab Strip

**Purpose:** Replace the booking-detail FAB drawer with a horizontal scrollable
tab strip pinned under the detail header.

**Current state:** `.bm-shell` renders a detail view with `.bm-nav` items
(Client · Finance · Tasks · Documents · Commercial) shown as a slide-in drawer
toggled by `.bm-mobile-fab`
([booking-admin.js:4059-4068](../../../assets/js/booking-admin.js#L4059-L4068),
[:4734](../../../assets/js/booking-admin.js#L4734)).

**Design:**
- ≤768px: render `.bm-nav` items as a horizontal, scroll-snapping tab strip
  directly beneath `.bm-header` instead of inside the off-canvas drawer.
- The active tab auto-scrolls into view; tab badges (e.g. Tasks count) are
  preserved inline.
- Retire `.bm-mobile-fab` and the drawer/overlay at the phone breakpoint (markup
  stays for tablet). The existing `data-bm-nav` click handler is unchanged — only
  the container's layout/position changes via CSS, plus a tiny
  `scrollActiveTabIntoView()` helper.
- The detail header gets the Sky Premium gradient + a clear back affordance.

**Interface:** `.bm-nav.is-tabstrip` (mobile layout modifier), existing
`data-bm-nav` hooks untouched; JS `scrollActiveTabIntoView()` called on tab
change.

### Unit 3 — Sky Premium Visual Layer

**Purpose:** The shared visual vocabulary that makes every mobile screen feel
premium and on-brand.

**Design (CSS tokens + components, all mobile-scoped):**
- Gradient headers: `linear-gradient(160deg,#1a6dd8,#0d4fa8,#0a3d8a)` using
  existing `--sky-blue` family.
- Floating stat cards: white, `border-radius:12-16px`, soft blue-tinted shadow,
  often overlapping the gradient header by `-14px`.
- Status pills with the established semantic colors (`--sky-good`, `--sky-warn`,
  `--sky-bad`) for the 7-status system.
- Card list rows replacing dense tables on mobile (see Unit 4).
- Consistent ≥44px touch targets, 12px gutters, system font stack already in use
  (`Manrope`/`DM Sans`).

**Interface:** Utility classes `.sky-m-header`, `.sky-stat-card`,
`.sky-card-row`, `.sky-pill`. Pure CSS, no JS.

### Unit 4 — Mobile Data Views (lists, finance, reports)

**Purpose:** Make data-dense, table-heavy screens readable on a phone.

**Current state:** Wide tables (`min-width:720px`/`760px`) force horizontal
scroll on mobile ([booking.css:1492](../../../assets/css/booking.css#L1492),
[:3815](../../../assets/css/booking.css#L3815)).

**Design:**
- ≤768px, convert the primary booking list and finance/payment tables into
  stacked card rows using the existing `data-label` pattern (CSS
  `::before` labels) so no markup duplication is required where rows already
  carry cell labels; where they don't, add `data-label` attributes in the
  render functions.
- Finance Overview: the Amount Received / Outstanding cards (added earlier this
  session) become full-width stacked `.sky-stat-card`s.
- Record Payment / split-payment UI: single-column form, large inputs, the
  "Already received" callout and payment-history table reflow to cards.
- Reports: lead with summary stat cards; defer wide tables behind a
  horizontally-scrollable container with a visible scroll affordance rather than
  silent overflow.

**Interface:** `.sky-card-row` + `data-label` cells; CSS-only transformation
where labels exist, small render-function additions where they don't.

### Unit 5 — Admin Hub & Login Polish

**Purpose:** First-impression screens (`admin.html`, `login.html`) look
intentional on mobile.

**Design:**
- `login.html`: center the card, full-width on small screens, gradient backdrop,
  ≥44px fields and button, no horizontal overflow.
- `admin.html` (gateway hub): the link grid collapses to a single-column stack of
  large tappable cards with the Sky Premium treatment.
- Surgical edits only (these files are on the do-not-overwrite list for
  Standalone); changes are additive CSS plus minimal class hooks.

## Data Flow

No data-layer changes. Every unit is presentation-only:

- Bottom tab bar and tab strip dispatch the **same** activation actions as the
  existing nav (`data-admin-tab`, `data-bm-nav`). State (active module, active
  section) continues to live where it does today.
- No new API calls, no changes to `booking-shared.js` demo API or the live edge
  functions. The split-payment / status work from earlier this session is
  untouched; we only restyle its mobile presentation.

## Error Handling & Edge Cases

- **Breakpoint boundaries:** Verify 768px and 980px transitions don't leave both
  the bottom bar and the hamburger active simultaneously. Bottom bar = phone
  only; slide-in sidebar = tablet only.
- **Safe-area insets:** Bottom bar uses `padding-bottom: env(safe-area-inset-bottom)`
  so it clears the iOS home indicator.
- **Content padding:** `.admin-content` / `.bm-content` get bottom padding equal
  to the bar height so the last row isn't hidden behind the fixed bar.
- **Long section lists in "More":** The drawer scrolls; the existing accordion
  collapses sections to keep it scannable.
- **Tab strip overflow:** Horizontal scroll with momentum + snap; active tab
  scrolled into view on open and on change.
- **Landscape phones:** Bar remains usable; reduce vertical padding.
- **Electron desktop wrapper:** Renders at desktop widths → unaffected (media
  queries never trigger).

## Testing Strategy

Manual, device-emulation based (no automated UI test harness exists):

1. **Breakpoint sweep** at 360, 390, 414, 768, 980, 1100px — confirm each unit
   activates/deactivates at the right width and desktop ≥1101px is pixel-identical
   to before.
2. **Navigation flows:** bottom bar → each tab; "More" → every section; booking
   detail tab strip → every section; back affordance.
3. **Data views:** booking list, finance overview, record/split payment, reports
   — confirm no silent horizontal overflow and all data is reachable.
4. **First-impression:** login and admin hub on a 390px viewport.
5. **Regression:** desktop sidebar, booking detail desktop tabs, and the
   tablet (≤980px) slide-in still behave as before.
6. **Cross-check Standalone:** repeat the core flows in `Skybook Final/` after
   mirroring.

## Out of Scope (YAGNI)

- Bottom-sheet/draggable interactions (rejected in favor of tab strip).
- Warm/orange or slate visual themes (rejected in favor of Sky Premium).
- Any backend, API, schema, or status/payment logic changes.
- Desktop layout changes.
- Offline/PWA, push notifications, gestures beyond horizontal tab scroll.

## Mirroring Checklist (per change)

- [ ] Apply to `skybook-main/` (CSS / `booking-admin.js` / surgical HTML).
- [ ] Mirror to `Skybook Final/` — wholesale for CSS & `booking-admin.js`;
      surgical for `admin.html`, `login.html`, `booking-admin.html`,
      `booking-shared.js`.
- [ ] Verify the same flow in both copies.
- [ ] Commit skybook-main (push to GitHub) and Skybook Final (local commit only).
