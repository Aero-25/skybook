# SkyBook Mobile Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SkyBook's booking admin beautiful and easy to navigate on a phone — bottom tab bar, full-screen booking-detail tab strip, Sky Premium visuals, card-based data views, and polished hub/login — without changing desktop.

**Architecture:** Approach 1 from the spec — a responsive CSS layer plus small additive JS. All new CSS goes in one marked block at the end of `assets/css/booking.css`, gated behind `@media(max-width:768px)`. New JS is appended near the existing event bindings in `assets/js/booking-admin.js`. The existing DOM and `switchTab`/`data-bm-nav` actions are reused — no duplicate markup, no routing changes. Every change is mirrored into `Skybook Final/`.

**Tech Stack:** Pure HTML, CSS, vanilla JS (no framework, no build step). Single stylesheet `assets/css/booking.css` is loaded by `booking-admin.html`, `admin.html`, and `login.html`. There is **no automated test runner** — "verification" steps are manual checks in browser DevTools device emulation (Chrome: F12 → Ctrl+Shift+M).

**Spec:** `docs/superpowers/specs/2026-06-10-skybook-mobile-design.md`

---

## File Structure

| File | Role | Change type |
| --- | --- | --- |
| `assets/css/booking.css` | All styling. New mobile rules appended in one block at EOF (currently 6052 lines). | Append-only |
| `booking-admin.html` | Main console markup. Add bottom-tab-bar markup as last child of `#adminAppShell` (between line 1360 `</main>` and 1361 `</div>`). | Surgical insert |
| `assets/js/booking-admin.js` | App behavior. Add bottom-bar init + tab-strip helper near existing bindings (~line 9781). Reuses `switchTab`, `openMobileSidebar`, `closeMobileSidebar`. | Surgical insert |
| `admin.html` | Gateway hub. Class hooks only; styling in booking.css. | Surgical (protected) |
| `login.html` | Login. Already uses `.skybook-login-*` classes; styling in booking.css. | CSS-only |
| `Skybook Final/...` | Standalone mirror of every change above. | Mirror (see Task 9) |

**Key existing anchors (verified):**
- `switchTab(tab)` — activates a module — `assets/js/booking-admin.js:2755`
- `openMobileSidebar()` / `closeMobileSidebar()` / `isMobileSidebarViewport()` (`<=1100`) — `assets/js/booking-admin.js:636-650`, `:600`
- `state.activeTab` holds current module id
- Top-level nav buttons: `[data-admin-tab="..."]`; current mobile hamburger `#mobileSidebarToggle` + `#sidebarBackdrop`
- Booking detail nav: `.bm-shell` › `.bm-nav` › `.bm-nav-item[data-bm-nav]`; FAB `.bm-mobile-fab` — `assets/js/booking-admin.js:4059-4068`, `:4734`
- Existing mobile media block (drawer/FAB) ends at `assets/css/booking.css:2733`

**All new CSS in this plan is appended under one sentinel at EOF of `booking.css`:**

```css
/* ============================================================
   MOBILE EXPERIENCE 2026-06 — see docs/superpowers/specs/2026-06-10-skybook-mobile-design.md
   All rules below are phone-scoped. Desktop (>=769px) is untouched.
   ============================================================ */
```

Add that sentinel comment once (Task 1, Step 1). Every later CSS step appends BELOW it.

---

## Task 1: Mobile foundation — tokens, safe-area, content padding

**Files:**
- Modify: `assets/css/booking.css` (append at EOF, after line 6052)

- [ ] **Step 1: Append the sentinel + foundation block to `booking.css`**

```css
/* ============================================================
   MOBILE EXPERIENCE 2026-06 — see docs/superpowers/specs/2026-06-10-skybook-mobile-design.md
   All rules below are phone-scoped. Desktop (>=769px) is untouched.
   ============================================================ */
:root{
  --sky-tabbar-h:60px;
}
@media(max-width:768px){
  /* Reserve space so fixed bottom bar never hides the last row */
  body.skybook-admin-page .admin-content{
    padding-bottom:calc(var(--sky-tabbar-h) + env(safe-area-inset-bottom) + 12px);
  }
  /* The legacy hamburger is redundant once the bottom bar exists at phone width */
  body.skybook-admin-page .admin-toolbar-sidebar-toggle{display:none;}
}
```

- [ ] **Step 2: Verify desktop is unchanged**

Open `booking-admin.html` in a browser at desktop width (≥1101px). Confirm the layout, sidebar, and toolbar look identical to before (the new rules are all inside `@media(max-width:768px)` except the `:root` token, which is inert until used).

- [ ] **Step 3: Verify nothing breaks at 390px**

DevTools device mode, 390px wide. The console still renders; the toolbar hamburger is now hidden. (The bottom bar doesn't exist yet — that's Task 2.) No console errors.

- [ ] **Step 4: Commit**

```bash
git add assets/css/booking.css
git commit -m "feat(mobile): add mobile CSS foundation block + content padding"
```

---

## Task 2: Bottom tab bar — markup, CSS, and JS wiring

**Files:**
- Modify: `booking-admin.html:1360-1361` (insert markup)
- Modify: `assets/css/booking.css` (append below sentinel)
- Modify: `assets/js/booking-admin.js` (append near line 9781 bindings)

- [ ] **Step 1: Insert the bottom-bar markup as the last child of `#adminAppShell`**

In `booking-admin.html`, between `</main>` (line 1360) and the `</div>` that closes `#adminAppShell` (line 1361), insert:

```html
    <nav class="sky-mobile-tabbar" id="skyMobileTabbar" aria-label="Primary">
      <button type="button" class="sky-tab" data-sky-tab="calendar">
        <span class="sky-tab-ico" aria-hidden="true">🗓</span>
        <span class="sky-tab-label">Calendar</span>
      </button>
      <button type="button" class="sky-tab" data-sky-tab="bookings">
        <span class="sky-tab-ico" aria-hidden="true">📋</span>
        <span class="sky-tab-label">Bookings</span>
      </button>
      <button type="button" class="sky-tab" data-sky-tab="more">
        <span class="sky-tab-ico" aria-hidden="true">⋯</span>
        <span class="sky-tab-label">More</span>
      </button>
    </nav>
```

- [ ] **Step 2: Append bottom-bar CSS below the sentinel in `booking.css`**

```css
@media(max-width:768px){
  .sky-mobile-tabbar{
    display:grid;grid-template-columns:repeat(3,1fr);
    position:fixed;left:0;right:0;bottom:0;z-index:480;
    height:calc(var(--sky-tabbar-h) + env(safe-area-inset-bottom));
    padding-bottom:env(safe-area-inset-bottom);
    background:rgba(255,255,255,.92);
    -webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);
    border-top:1px solid rgba(26,109,216,.14);
    box-shadow:0 -6px 24px rgba(20,52,83,.10);
  }
  .sky-tab{
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
    border:none;background:none;cursor:pointer;color:#8aabcc;
    font-family:inherit;min-height:44px;padding:6px 4px;position:relative;
  }
  .sky-tab-ico{font-size:20px;line-height:1;}
  .sky-tab-label{font-size:10.5px;font-weight:700;letter-spacing:.02em;}
  .sky-tab.is-active{color:var(--sky-blue,#1769aa);}
  .sky-tab.is-active::before{
    content:"";position:absolute;top:0;left:50%;transform:translateX(-50%);
    width:26px;height:3px;border-radius:0 0 3px 3px;background:var(--sky-blue,#1769aa);
  }
  /* "More" gets a subtle dot when the active module isn't Calendar/Bookings */
  .sky-tab[data-sky-tab="more"].has-active-dot .sky-tab-ico::after{
    content:"";position:absolute;top:4px;right:calc(50% - 16px);
    width:7px;height:7px;border-radius:50%;background:var(--sky-blue,#1769aa);
  }
}
/* Bar is desktop-hidden by default; only the media query above shows it */
.sky-mobile-tabbar{display:none;}
```

- [ ] **Step 3: Append the bottom-bar JS near the existing bindings**

In `assets/js/booking-admin.js`, immediately after line 9782 (`nodes.sidebarBackdrop?.addEventListener('click',closeMobileSidebar)`), add:

```javascript
// ----- Mobile bottom tab bar -----
const skyTabbar=document.getElementById('skyMobileTabbar')
const syncSkyTabbar=()=>{
  if(!skyTabbar)return
  const active=state.activeTab
  const primary={calendar:'calendar',bookings:'bookings'}
  skyTabbar.querySelectorAll('.sky-tab').forEach(btn=>{
    const key=btn.dataset.skyTab
    const isActive=key==='more'
      ? !(active in primary)
      : active===primary[key]
    btn.classList.toggle('is-active',isActive)
    if(key==='more')btn.classList.toggle('has-active-dot',!(active in primary))
  })
}
skyTabbar?.addEventListener('click',event=>{
  const btn=event.target.closest('.sky-tab')
  if(!btn)return
  const key=btn.dataset.skyTab
  if(key==='more'){openMobileSidebar();return}
  switchTab(key)
  syncSkyTabbar()
})
```

- [ ] **Step 4: Keep the bar in sync when the module changes elsewhere**

`switchTab` (`assets/js/booking-admin.js:2787`) already calls `closeMobileSidebar()` at its end. Add a sync call right after it. Change:

```javascript
  closeMobileSidebar()
```
to:
```javascript
  closeMobileSidebar()
  if(typeof syncSkyTabbar==='function')syncSkyTabbar()
```

(The `typeof` guard is required because `switchTab` is defined at line 2755, before `syncSkyTabbar`; the guard avoids a ReferenceError if `switchTab` ever fires before the binding block runs.)

- [ ] **Step 5: Verify the bar appears and navigates at 390px**

DevTools 390px. Confirm: a 3-item bar is pinned to the bottom; tapping **Calendar** shows the calendar module and highlights Calendar; tapping **Bookings** shows bookings and highlights Bookings; tapping **More** slides in the existing sidebar. When on any other module (e.g. open Reports via the sidebar), **More** shows the active dot. No content is hidden behind the bar (scroll to the last row).

- [ ] **Step 6: Verify desktop unaffected**

At ≥1101px the bar is absent (`display:none` default) and the sidebar behaves as before.

- [ ] **Step 7: Commit**

```bash
git add booking-admin.html assets/css/booking.css assets/js/booking-admin.js
git commit -m "feat(mobile): add bottom tab bar (Calendar/Bookings/More) wired to switchTab"
```

---

## Task 3: "More" drawer — Sky Premium restyle as a bottom sheet

**Files:**
- Modify: `assets/css/booking.css` (append below sentinel)

The "More" button reuses the existing `.admin-sidebar-booking` slide-in (via `openMobileSidebar`, which sets `body.is-sidebar-open`). At phone width, restyle it as a bottom-anchored sheet with the Sky Premium look. The existing ≤1100px slide-in for tablets stays as-is — these rules are scoped to ≤768px only.

- [ ] **Step 1: Append the drawer-as-sheet CSS**

```css
@media(max-width:768px){
  /* Turn the left slide-in into a bottom sheet on phones */
  body.skybook-admin-page.is-sidebar-open .admin-sidebar-booking{
    position:fixed;left:0;right:0;bottom:0;top:auto;
    width:100%;max-height:82vh;border-radius:20px 20px 0 0;
    padding:8px 14px calc(20px + env(safe-area-inset-bottom));
    background:linear-gradient(180deg,#ffffff 0%,#f3f9ff 100%);
    box-shadow:0 -10px 40px rgba(10,30,70,.28);
    overflow-y:auto;z-index:520;animation:skySheetUp .26s cubic-bezier(.3,0,.2,1);
  }
  @keyframes skySheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
  /* Grab handle */
  body.skybook-admin-page.is-sidebar-open .admin-sidebar-booking::before{
    content:"";display:block;width:36px;height:4px;border-radius:99px;
    background:#cbd9ea;margin:4px auto 12px;
  }
  /* Larger touch targets for every destination */
  body.skybook-admin-page.is-sidebar-open .admin-sidebar-booking .admin-tab{
    min-height:46px;font-size:14px;
  }
  body.skybook-admin-page.is-sidebar-open .admin-sidebar-booking .admin-menu-section summary{
    min-height:44px;display:flex;align-items:center;font-size:13px;
  }
  /* Sheet backdrop reuses the existing backdrop element */
  body.skybook-admin-page.is-sidebar-open .skybook-sidebar-backdrop{
    position:fixed;inset:0;z-index:510;background:rgba(5,15,40,.45);
    -webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);
  }
}
```

- [ ] **Step 2: Verify the sheet at 390px**

DevTools 390px → tap **More**. Confirm: the menu rises from the bottom with a grab handle and rounded top; backdrop dims the page; each section/destination is comfortably tappable; tapping a destination navigates and closes the sheet (existing `switchTab` → `closeMobileSidebar`); tapping the backdrop closes it.

- [ ] **Step 3: Verify tablet (≤980px) slide-in still works**

At 900px, **More** isn't present (bar is phone-only), and the hamburger slide-in from the left still works as before — these sheet rules don't apply above 768px.

- [ ] **Step 4: Commit**

```bash
git add assets/css/booking.css
git commit -m "feat(mobile): restyle More drawer as Sky Premium bottom sheet"
```

---

## Task 4: Booking detail — full-screen tab strip

**Files:**
- Modify: `assets/css/booking.css` (append below sentinel)
- Modify: `assets/js/booking-admin.js` (tab-change handler ~line 9397-9405; add helper)

Replace the booking-detail FAB drawer (`.bm-mobile-fab` + off-canvas `.bm-nav`) with a horizontal scrollable tab strip pinned under `.bm-header`. The `data-bm-nav` click handler is unchanged — only layout/position changes, plus auto-scrolling the active tab into view.

- [ ] **Step 1: Append the tab-strip CSS**

```css
@media(max-width:768px){
  /* Booking-detail nav becomes a top tab strip, not a drawer */
  .bm-shell .bm-nav{
    position:static;transform:none!important;width:auto;height:auto;
    inset:auto;border-radius:0;box-shadow:none;background:#fff;
    border-bottom:1px solid #e2ecf8;padding:0;overflow:visible;
  }
  .bm-shell .bm-nav .bm-nav-mobile-hdr{display:none;}
  .bm-shell .bm-nav-card{
    display:flex;gap:4px;overflow-x:auto;scroll-snap-type:x proximity;
    -webkit-overflow-scrolling:touch;padding:8px 10px;scrollbar-width:none;
  }
  .bm-shell .bm-nav-card::-webkit-scrollbar{display:none;}
  .bm-shell .bm-nav-item{
    flex:0 0 auto;scroll-snap-align:start;white-space:nowrap;
    min-height:38px;padding:6px 14px;border-radius:9px;font-size:13px;
    background:#f0f7ff;color:#5a80aa;border:1px solid transparent;
  }
  .bm-shell .bm-nav-item.is-active{
    background:var(--sky-blue,#1769aa);color:#fff;
  }
  /* Retire the FAB + overlay on phones */
  .bm-shell .bm-mobile-fab{display:none!important;}
  .bm-shell .bm-nav-overlay{display:none!important;}
  /* Sky Premium detail header */
  .bm-shell .bm-header{
    background:linear-gradient(160deg,#1a6dd8 0%,#0d4fa8 60%,#0a3d8a 100%);
    color:#fff;
  }
  .bm-shell .bm-header-name strong,
  .bm-shell .bm-header-name small{color:#fff;}
  .bm-shell .bm-header-name small{opacity:.7;}
}
```

- [ ] **Step 2: Add the `scrollActiveTabIntoView` helper**

In `assets/js/booking-admin.js`, immediately after line 9782 binding block (same area as Task 2 — place it after the Task 2 block), add:

```javascript
// ----- Booking-detail tab strip: keep active tab visible on phones -----
const scrollActiveTabIntoView=()=>{
  if(window.innerWidth>768)return
  const active=nodes.bookingDetail?.querySelector('.bm-nav-item.is-active')
  active?.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'})
}
```

- [ ] **Step 3: Call the helper when a detail tab is selected**

The `data-bm-nav` handler sets the active class at `assets/js/booking-admin.js:9401`:

```javascript
    nodes.bookingDetail.querySelectorAll('.bm-nav-item').forEach(el=>el.classList.toggle('is-active',el.dataset.bmNav===tab))
```

Immediately after that line, add:

```javascript
    scrollActiveTabIntoView()
```

- [ ] **Step 4: Verify the tab strip at 390px**

Open a booking → its detail view. Confirm: a horizontal strip (Client · Finance · Tasks · Documents · Commercial) sits directly under a blue gradient header; no FAB is visible; tapping a tab switches sections and the tapped tab scrolls toward center; the Tasks badge count still shows. Swiping the strip scrolls it.

- [ ] **Step 5: Verify desktop detail unchanged**

At ≥1101px the booking detail nav looks and behaves exactly as before (card list, no strip, no gradient override).

- [ ] **Step 6: Commit**

```bash
git add assets/css/booking.css assets/js/booking-admin.js
git commit -m "feat(mobile): booking detail uses scrollable tab strip + gradient header"
```

---

## Task 5: Sky Premium visual layer — dashboard stat cards & status pills

**Files:**
- Modify: `assets/css/booking.css` (append below sentinel)

Apply the floating-card + pill treatment to the mobile dashboard/overview so the landing screen feels premium. These are CSS-only refinements over existing markup (`.detail-card`, status badge classes). Reuse the established status colors.

- [ ] **Step 1: Identify the existing card/badge classes to style**

Run:
```bash
grep -nE "detail-card|status-badge|renderStatusBadge|\.booking-chip" assets/css/booking.css | head
```
Expected: matches for `.detail-card` and status/badge classes already used by the Finance overview and dashboard. Note the exact class names returned; the rules below target `.detail-card` (adjust if your grep shows a different card class in the dashboard region).

- [ ] **Step 2: Append the Sky Premium card/pill CSS**

```css
@media(max-width:768px){
  /* Floating stat cards */
  .detail-card{
    border-radius:14px;border:1px solid #e2ecf8;
    box-shadow:0 4px 16px rgba(26,109,216,.08);
    background:linear-gradient(180deg,#ffffff 0%,#f8fbff 100%);
  }
  .detail-card strong{color:#0d2d6e;}
  /* Status pills: rounded, bold, semantic */
  .status-badge,.booking-chip{
    border-radius:999px;font-weight:700;letter-spacing:.01em;
  }
  /* Section titles get the brand accent */
  .bm-content h3,.detail-card span:first-child{
    color:var(--sky-blue,#1769aa);
  }
}
```

- [ ] **Step 3: Verify the dashboard at 390px**

DevTools 390px on the Command Center / dashboard and on a booking's Finance tab. Confirm cards have soft depth and rounded corners, the Amount Received / Outstanding cards (from the earlier split-payment work) look like floating cards, and status pills are pill-shaped with the right semantic colors.

- [ ] **Step 4: Verify desktop unaffected**

≥1101px: cards/badges look as before.

- [ ] **Step 5: Commit**

```bash
git add assets/css/booking.css
git commit -m "feat(mobile): Sky Premium stat cards and status pills"
```

---

## Task 6: Mobile data views — tables become card rows

**Files:**
- Modify: `assets/css/booking.css` (append below sentinel)
- Modify: `assets/js/booking-admin.js` (add `data-label` to booking-list row cells in the render function)

Wide tables (`min-width:720/760px`) force horizontal scroll. On phones, convert the primary booking-list table into stacked card rows using the `data-label`/`::before` pattern. Tables that already overflow but are secondary (reports) get a clean scroll container instead.

- [ ] **Step 1: Locate the booking-list table render function**

Run:
```bash
grep -nE "renderBookings|<table|<td|<th|bookingTableBody|data-label" assets/js/booking-admin.js | head -30
```
Expected: the function that builds the bookings table rows (look for `<td>` template strings inside `renderBookings` or a `renderBookingRows` helper). Note the file/line of the `<td>` cells.

- [ ] **Step 2: Add `data-label` to each booking-row `<td>`**

In the booking-row template found in Step 1, add a `data-label` attribute naming each column to every `<td>`. Example transformation (apply the same pattern to the actual cells in your render function):

```javascript
// Before:
`<td>${bookingAdminShared.escapeHtml(ref)}</td>
 <td>${bookingAdminShared.escapeHtml(guestName)}</td>
 <td>${bookingAdminShared.escapeHtml(travelDate)}</td>
 <td>${renderStatusBadge(booking.status)}</td>
 <td>${bookingAdminShared.formatMoney(total,currency)}</td>`

// After:
`<td data-label="Ref">${bookingAdminShared.escapeHtml(ref)}</td>
 <td data-label="Guest">${bookingAdminShared.escapeHtml(guestName)}</td>
 <td data-label="Travel">${bookingAdminShared.escapeHtml(travelDate)}</td>
 <td data-label="Status">${renderStatusBadge(booking.status)}</td>
 <td data-label="Total">${bookingAdminShared.formatMoney(total,currency)}</td>`
```

Use the actual column names from the table header (`<th>` text) so labels match.

- [ ] **Step 3: Append the card-row CSS**

```css
@media(max-width:768px){
  /* Booking list: table → stacked cards */
  .booking-table-wrap table,
  .booking-table-wrap thead,
  .booking-table-wrap tbody,
  .booking-table-wrap tr,
  .booking-table-wrap td{display:block;width:auto;min-width:0;}
  .booking-table-wrap thead{position:absolute;left:-9999px;}
  .booking-table-wrap tr{
    background:#fff;border:1px solid #e2ecf8;border-radius:14px;
    box-shadow:0 4px 16px rgba(26,109,216,.07);
    margin:0 0 10px;padding:10px 14px;
  }
  .booking-table-wrap td{
    display:flex;justify-content:space-between;align-items:center;gap:12px;
    border:none;padding:5px 0;font-size:13px;
  }
  .booking-table-wrap td::before{
    content:attr(data-label);font-weight:700;color:#5a80aa;
    font-size:11px;text-transform:uppercase;letter-spacing:.04em;flex:0 0 auto;
  }
  .booking-table-wrap td:empty{display:none;}
  /* Secondary/report tables: graceful horizontal scroll with affordance */
  .report-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;}
  .report-table-wrap::after{
    content:"→ scroll";display:block;text-align:right;
    font-size:10px;color:#8aabcc;padding:4px 2px 0;
  }
}
```

> **Note:** Replace `.booking-table-wrap` with the actual wrapper class around the bookings table (find it via the grep in Step 1 — it is the element with `min-width:720px` near `assets/css/booking.css:1492`). If the table has no wrapper, wrap it in the render function with `<div class="booking-table-wrap">…</div>`.

- [ ] **Step 4: Verify the booking list at 390px**

DevTools 390px → Bookings. Confirm each booking is a self-contained card with labeled fields (Ref, Guest, Travel, Status, Total) stacked vertically, no horizontal scrolling, status pill visible. Tapping a row still opens the detail.

- [ ] **Step 5: Verify finance/reports**

Finance Overview and Record Payment: single-column, no overflow. Reports: wide table scrolls horizontally with the "→ scroll" hint rather than clipping silently.

- [ ] **Step 6: Verify desktop tables unchanged**

≥1101px: the bookings table renders as a normal table (the `data-label` attributes are inert on desktop).

- [ ] **Step 7: Commit**

```bash
git add assets/css/booking.css assets/js/booking-admin.js
git commit -m "feat(mobile): booking list as card rows; report tables scroll cleanly"
```

---

## Task 7: Admin hub & login polish

**Files:**
- Modify: `assets/css/booking.css` (append below sentinel)
- Modify: `admin.html` (only if a hook class is missing — see Step 1)

`login.html` already uses `.skybook-login-shell/-card/-form`; `admin.html` uses `.admin-gateway-grid` + `.admin-gateway-card`. Both just need mobile CSS.

- [ ] **Step 1: Confirm the hook classes exist**

Run:
```bash
grep -nE "admin-gateway-grid|admin-gateway-card|skybook-login-card|skybook-login-form" admin.html login.html
```
Expected: `admin.html` contains `.admin-gateway-grid` and `.admin-gateway-card`; `login.html` contains `.skybook-login-card` and `.skybook-login-form`. If `.admin-gateway-grid` is absent, add it to the wrapping element around the gateway cards in `admin.html` (surgical, protected file).

- [ ] **Step 2: Append hub + login mobile CSS**

```css
@media(max-width:768px){
  /* Gateway hub: single-column tappable cards */
  .admin-gateway-grid{grid-template-columns:1fr!important;gap:14px;}
  .admin-gateway-card{
    padding:20px;border-radius:16px;min-height:84px;
    box-shadow:0 6px 20px rgba(26,109,216,.10);
  }
  .admin-gateway-hero{flex-direction:column;align-items:flex-start;gap:12px;}
  /* Login: centered full-width card, large fields */
  .skybook-login-shell{padding:18px;min-height:100dvh;align-items:center;}
  .skybook-login-card{width:100%;max-width:420px;border-radius:18px;}
  .skybook-login-form input{min-height:46px;font-size:16px;} /* 16px avoids iOS zoom */
  .skybook-login-form .booking-button{min-height:48px;font-size:15px;}
}
```

- [ ] **Step 3: Verify login at 390px**

Open `login.html` at 390px. Confirm: card is centered, full-width with margins, fields and button are large, no horizontal overflow, focusing a field does not zoom the viewport (16px font).

- [ ] **Step 4: Verify hub at 390px**

Open `admin.html` at 390px. Confirm: gateway cards stack one per row, each is a large tappable card, hero stacks vertically.

- [ ] **Step 5: Verify desktop unchanged**

≥1101px: hub is a 2-column grid; login card is its normal size.

- [ ] **Step 6: Commit**

```bash
git add assets/css/booking.css admin.html
git commit -m "feat(mobile): polish admin gateway hub and login for phones"
```

---

## Task 8: Cross-breakpoint regression sweep

**Files:** none (verification + fixes only)

- [ ] **Step 1: Breakpoint sweep**

In DevTools, check 360, 390, 414, 768, 769, 980, 1100, 1101, 1280px on `booking-admin.html`:
- ≤768: bottom bar visible, hamburger hidden, sheets/strip/cards active.
- 769–1100: bottom bar hidden, tablet slide-in sidebar works, tables/detail in desktop form.
- ≥1101: full desktop, pixel-identical to pre-change.

Confirm there is never a width where BOTH the bottom bar and the toolbar hamburger are visible.

- [ ] **Step 2: Navigation flow check**

At 390px: bottom bar → Calendar, Bookings, More → every section; open a booking → every detail tab via strip → back. No dead ends, no hidden content behind the bar.

- [ ] **Step 3: Fix any issues inline, then commit (if changes were needed)**

```bash
git add -A
git commit -m "fix(mobile): breakpoint regression fixes from sweep"
```

(If the sweep is clean, skip the commit.)

---

## Task 9: Mirror everything to Skybook Final (Standalone)

**Files:**
- `Skybook Final/assets/css/booking.css` — wholesale-safe
- `Skybook Final/assets/js/booking-admin.js` — wholesale-safe
- `Skybook Final/booking-admin.html` — **surgical** (do not overwrite)
- `Skybook Final/admin.html` — **surgical** (do not overwrite)
- `Skybook Final/login.html` — uses CSS only; no JS/markup change needed unless Step 1 added a class

> **Constraint (from memory + spec):** In Standalone, `booking-shared.js`, `admin.html`, `login.html`, and `booking-admin.html` must NEVER be overwritten wholesale. `booking-admin.js` and the CSS files ARE safe to copy wholesale. Skybook Final stays local — commit only, no remote.

- [ ] **Step 1: Copy the two wholesale-safe files**

```bash
cp "skybook-main/assets/css/booking.css" "Skybook Final/assets/css/booking.css"
cp "skybook-main/assets/js/booking-admin.js" "Skybook Final/assets/js/booking-admin.js"
```

- [ ] **Step 2: Apply the `booking-admin.html` bottom-bar insert surgically**

Open `Skybook Final/booking-admin.html`, find its `</main>` immediately followed by the `#adminAppShell` closing `</div>` (structure mirrors skybook-main), and insert the SAME `<nav class="sky-mobile-tabbar">…</nav>` block from Task 2 Step 1 between them. Do not replace the file.

- [ ] **Step 3: Apply the `admin.html` hook (only if Task 7 Step 1 added `.admin-gateway-grid`)**

If you added the class in skybook-main's `admin.html`, make the identical surgical edit in `Skybook Final/admin.html`. Otherwise skip.

- [ ] **Step 4: Verify Standalone at 390px**

Open `Skybook Final/booking-admin.html`, `admin.html`, `login.html` at 390px. Run the Task 8 Step 2 navigation flow. Confirm parity with skybook-main.

- [ ] **Step 5: Commit Standalone locally**

```bash
cd "Skybook Final"
git add assets/css/booking.css assets/js/booking-admin.js booking-admin.html admin.html
git commit -m "feat(mobile): mirror mobile experience from skybook-main"
cd ..
```

- [ ] **Step 6: Push skybook-main to GitHub**

```bash
cd skybook-main
git push origin main
cd ..
```

---

## Self-Review

**Spec coverage:**
- Hybrid bottom bar → Tasks 1–3 ✓
- Booking-detail tab strip → Task 4 ✓
- Sky Premium visual layer → Tasks 4 (header) + 5 (cards/pills) ✓
- Mobile data views (lists/finance/reports) → Task 6 ✓
- Admin hub & login → Task 7 ✓
- Desktop untouched / breakpoint integrity → enforced per task + Task 8 sweep ✓
- Standalone mirror with protected-file rules → Task 9 ✓
- No data/API/schema changes → no task touches `booking-shared.js` or edge functions ✓

**Placeholder scan:** No TBD/TODO. Two tasks (6, 7) intentionally include a grep step because the exact wrapper/column class must be read from the live file before styling — the steps specify exactly what to look for and how to adapt, with concrete fallbacks (wrap the table; add the class).

**Type/name consistency:** `syncSkyTabbar` (defined Task 2 Step 3, guarded-called Task 2 Step 4), `scrollActiveTabIntoView` (defined Task 4 Step 2, called Task 4 Step 3), `.sky-mobile-tabbar`/`.sky-tab`/`data-sky-tab` consistent across markup (Task 2 Step 1), CSS (Step 2), JS (Step 3). Reused existing `switchTab`, `openMobileSidebar`, `closeMobileSidebar`, `state.activeTab`, `nodes.bookingDetail` verified against current source.
