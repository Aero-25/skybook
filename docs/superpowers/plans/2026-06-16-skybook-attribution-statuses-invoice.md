# SkyBook Attribution, Statuses & Invoice Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Agent/Reseller + Consultant attribution to bookings, a new "Awaiting details" booking status and "To Pay" payment status, and make the grid invoice tag generate & open the guest invoice — all additive and mirrored to `Skybook Final`.

**Architecture:** Extend the existing two-field status system (`bookings.status` enum + free-text `bookings.payment_status`) with one additive enum value; surface already-stored attribution (`getBookingConsultantOwnerName`, agent assignments) in the detail card and grid; reuse the existing `document:guest_invoice` html2pdf generator for the grid invoice action. The status presentation funnels through `getStatusBadgeClass`/`getStatusRowClass` + `admin.css`, so new states render consistently everywhere.

**Tech Stack:** Vanilla JS admin (`booking-admin.js`), HTML (`booking-admin.html`), CSS (`admin.css`), Supabase Postgres (enum migration), Playwright smoke test, html2pdf.

## Repos & mirror rule

- Primary: `skybook-main/`. Mirror: `Skybook Final/` (white-label). **Every change lands in both.**
- File mirror strategy (verified):
  - `assets/js/booking-admin.js` — **identical** across repos → edit in `skybook-main`, then **copy** the file to `Skybook Final`.
  - `assets/css/admin.css` — **identical** → edit then **copy**.
  - `booking-admin.html` — **differs** (white-label) → **hand-apply** the same edits to each repo's own file.
  - migrations — differ → **add the new migration file to both** repos' `supabase/migrations/` (identical content; it's additive).
- Migrations are authored only; the human applies them to the live DB.

## Conventions

```bash
SB="c:/Users/gerri/OneDrive/Desktop/Aero Projects/True Sky Ventures/skybook-main"
SF="c:/Users/gerri/OneDrive/Desktop/Aero Projects/True Sky Ventures/Skybook Final"
cd "$SB"
```
Work on branch `skybook-attribution-statuses-invoice` (already created in `skybook-main`). Create the same branch in `Skybook Final` in Task 1.

Smoke test (skybook-main has `playwright.config.cjs` + `tests/skybook-admin.smoke.spec.js`): `npx playwright test tests/skybook-admin.smoke.spec.js`.

---

## Task 1: Additive migration — `awaiting_details` booking status (both repos)

`bookings.payment_status` is already free-text, so `to_pay` needs **no** migration. Only the booking-status enum needs the new value.

**Files:**
- Create: `skybook-main/supabase/migrations/2026061601_skybook_awaiting_details_status.sql`
- Create: `Skybook Final/supabase/migrations/2026061601_skybook_awaiting_details_status.sql`

- [ ] **Step 1: Confirm the enum name** (expect `booking_status` with existing values incl. `provisional`)

```bash
grep -rn "add value if not exists 'provisional'" "$SB/supabase/migrations/"
```
Expected: matches `202606020001_skybook_new_status_system_and_infant_qty.sql` using `alter type public.booking_status`.

- [ ] **Step 2: Write the migration in `skybook-main`**

```sql
-- 2026061601_skybook_awaiting_details_status.sql
-- New first-stage booking status: captured but guest/logistics details still missing.
-- Lifecycle: awaiting_details -> provisional -> confirmed.
alter type public.booking_status add value if not exists 'awaiting_details';
```

- [ ] **Step 3: Confirm it sorts last in each repo**

```bash
ls "$SB/supabase/migrations" | tail -2
ls "$SF/supabase/migrations" | tail -2
```
Expected: `2026061601_skybook_awaiting_details_status.sql` is the last entry in `skybook-main` (and will be in `Skybook Final` after the next step). If an existing migration sorts later, bump the prefix (e.g. `2026061602`).

- [ ] **Step 4: Create the matching branch + identical file in `Skybook Final`**

```bash
git -C "$SF" rev-parse --is-inside-work-tree && git -C "$SF" checkout -b skybook-attribution-statuses-invoice
cp "$SB/supabase/migrations/2026061601_skybook_awaiting_details_status.sql" "$SF/supabase/migrations/2026061601_skybook_awaiting_details_status.sql"
diff "$SB/supabase/migrations/2026061601_skybook_awaiting_details_status.sql" "$SF/supabase/migrations/2026061601_skybook_awaiting_details_status.sql" && echo "ok: mirrored"
```
Expected: `ok: mirrored`. (If `Skybook Final` is on `master`, branch from there — the branch name is what matters.)

- [ ] **Step 5: Commit in both repos**

```bash
git -C "$SB" add supabase/migrations/2026061601_skybook_awaiting_details_status.sql
git -C "$SB" commit -m "feat(db): add awaiting_details booking status (additive)"
git -C "$SF" add supabase/migrations/2026061601_skybook_awaiting_details_status.sql
git -C "$SF" commit -m "feat(db): add awaiting_details booking status (additive)"
```

---

## Task 2: Status presentation — badge + row classes for `awaiting_details` and `to_pay`

**Files:**
- Modify: `skybook-main/assets/js/booking-admin.js` (`getStatusBadgeClass` ~L1513, `getStatusRowClass` ~L1528)
- Modify: `skybook-main/assets/css/admin.css` (add `.status-badge.is-awaiting-details`, `.is-to-pay`)

- [ ] **Step 1: Add badge classes in `getStatusBadgeClass`**

In `booking-admin.js`, immediately after `const normalized=String(value||'').toLowerCase()` inside `getStatusBadgeClass`, add the two new mappings BEFORE the `provisional` line:

```js
  if(normalized==='awaiting_details')return 'is-awaiting-details'
  if(normalized==='to_pay')return 'is-to-pay'
```

- [ ] **Step 2: Add row classes in `getStatusRowClass`**

In `getStatusRowClass`, add the awaiting-details lifecycle case (after the `cancelled/...` line, before the `provisional` line):

```js
  if(status==='awaiting_details')return 'status-awaiting-details'
```
And inside the `if(status==='confirmed'){ ... }` block, add a `to_pay` payment case before the final `return 'status-confirmed'`:

```js
    if(payment==='to_pay')return 'status-confirmed-to-pay'
```

- [ ] **Step 3: Add badge CSS in `admin.css`**

Find an existing `.status-badge.is-invoice{...}` rule to match its format, then add (reuse the same property set, only colours differ):

```css
.status-badge.is-awaiting-details{background:#fdecc8;color:#7a5b12;border:1px solid #e9c46a}
.status-badge.is-to-pay{background:#e7e0f7;color:#5b3fa0;border:1px solid #c4b5e8}
```
If the existing `.status-badge` rules use CSS variables instead of literal colours, match that pattern (add `--badge-*` overrides) rather than hard-coding.

- [ ] **Step 4: Verify the new states resolve to their classes**

```bash
cd "$SB"
node -e "const s=require('fs').readFileSync('assets/js/booking-admin.js','utf8'); ['is-awaiting-details','is-to-pay','status-awaiting-details','status-confirmed-to-pay'].forEach(c=>{if(!s.includes(c))throw new Error('missing '+c)}); console.log('ok: classes present')"
grep -q "is-awaiting-details" assets/css/admin.css && grep -q "is-to-pay" assets/css/admin.css && echo "ok: css present"
```
Expected: `ok: classes present` and `ok: css present`.

- [ ] **Step 5: Commit (skybook-main)**

```bash
cd "$SB" && git add assets/js/booking-admin.js assets/css/admin.css
git commit -m "feat(ui): badge + row styling for awaiting_details and to_pay states"
```

---

## Task 3: Filters & selectors — expose the two new states in `booking-admin.html`

`booking-admin.html` differs between repos, so apply the same edits to **each** repo's file by hand.

**Files:**
- Modify: `skybook-main/booking-admin.html` (quick filters ~L632, status pill options ~L670, payment-state select ~L678)
- Modify: `Skybook Final/booking-admin.html` (same regions; line numbers may differ)

- [ ] **Step 1: Add quick-filter chips (both repos)**

Near the existing quick-filter buttons (`data-booking-quick-filter="provisional"` … `="fully_paid"`), add an Awaiting-details chip BEFORE Provisional and a To-Pay chip BEFORE Invoice:

```html
<button type="button" class="booking-quick-filter" data-booking-quick-filter="awaiting_details">Awaiting Details <span data-filter-count="awaiting_details">0</span></button>
```
```html
<button type="button" class="booking-quick-filter" data-booking-quick-filter="to_pay">To Pay <span data-filter-count="to_pay">0</span></button>
```

- [ ] **Step 2: Add the booking-status pill option (both repos)**

Next to `<label class="status-pill-option"><input type="checkbox" value="provisional">…`, add before it:

```html
<label class="status-pill-option"><input type="checkbox" value="awaiting_details"><span class="status-pill-label status-pill-awaiting-details">Awaiting Details</span></label>
```

- [ ] **Step 3: Add the payment-state `<option>` (both repos)**

In the payment-state `<select>` (currently `<option value="invoice">Invoice</option>` first), add as the first real option:

```html
<option value="to_pay">To Pay</option>
```

- [ ] **Step 4: Verify both files contain the new controls**

```bash
for R in "$SB" "$SF"; do
  grep -q 'data-booking-quick-filter="awaiting_details"' "$R/booking-admin.html" \
   && grep -q 'data-booking-quick-filter="to_pay"' "$R/booking-admin.html" \
   && grep -q 'value="to_pay">To Pay' "$R/booking-admin.html" \
   && echo "ok: $R" || echo "MISSING in $R"
done
```
Expected: `ok:` for both repos.

- [ ] **Step 5: Wire the quick-filter counts/logic if not data-driven**

```bash
grep -n "data-booking-quick-filter\|filter-count\|quickFilter" "$SB/assets/js/booking-admin.js" | head
```
If the quick-filter handler matches `booking.status`/`booking.payment_status` generically against the chip's value, the new chips work with no JS change. If there is an explicit allow-list of filter keys, add `'awaiting_details'` and `'to_pay'` to it (edit `booking-admin.js`, which is identical across repos). Confirm by reading the handler; make the minimal edit needed so both chips filter and count.

- [ ] **Step 6: Commit (skybook-main; booking-admin.js too if edited in Step 5)**

```bash
cd "$SB" && git add booking-admin.html assets/js/booking-admin.js
git commit -m "feat(ui): awaiting_details and to_pay filters/selectors in booking admin"
```
(`Skybook Final/booking-admin.html` is committed in the mirror task, Task 8.)

---

## Task 4: Booking detail card — Agent/Reseller + Consultant rows

**Files:**
- Modify: `skybook-main/assets/js/booking-admin.js` (detail `addRow` block ~L1183; add a small agent-label helper near `getBookingConsultantOwnerName` ~L1885)

- [ ] **Step 1: Add an agent/reseller label helper**

Near `getBookingConsultantOwnerName` (~L1885), add:

```js
const getBookingAgentResellerLabel=booking=>{
  const assignment=getBookingAgentAssignment(booking?.id)
  const agent=assignment ? state.agents.find(item=>String(item.id)===String(assignment.agent_id)) : null
  const metadata=normalizeJsonRecord(booking?.metadata)
  return String(
    agent?.company || agent?.name || agent?.code
    || metadata.agent || booking?.agent
    || metadata.booked_by || booking?.booked_by
    || ''
  ).trim() || '—'
}
```
(Confirm `getBookingAgentAssignment` and `state.agents` exist — they do, referenced at ~L1761–1768. Confirm agent record fields by reading one agent in `state.agents`; use `company` first, falling back as above.)

- [ ] **Step 2: Add the two detail rows**

In the detail `addRow(...)` sequence, replace the existing `addRow('Booked by',metadata.booked_by||booking?.booked_by)` line with:

```js
  addRow('Booked by',metadata.booked_by||booking?.booked_by)
  addRow('Agent / Reseller',getBookingAgentResellerLabel(booking))
  addRow('Consultant',getBookingConsultantOwnerName(booking))
```

- [ ] **Step 3: Verify**

```bash
cd "$SB"
node -e "const s=require('fs').readFileSync('assets/js/booking-admin.js','utf8'); ['getBookingAgentResellerLabel',\"addRow('Agent / Reseller'\",\"addRow('Consultant'\"].forEach(t=>{if(!s.includes(t))throw new Error('missing '+t)}); console.log('ok')"
```
Expected: `ok`.

- [ ] **Step 4: Commit (skybook-main)**

```bash
cd "$SB" && git add assets/js/booking-admin.js
git commit -m "feat(ui): show Agent/Reseller and Consultant on booking detail card"
```

---

## Task 5: Grid rows — show the consultant on every booking row

**Files:**
- Modify: `skybook-main/assets/js/booking-admin.js` (the main booking row template; the `<tr class="booking-row" …>` around L3800–3812)

- [ ] **Step 1: Read the row template** to find the guest/reference cell

```bash
sed -n '3795,3815p' "$SB/assets/js/booking-admin.js"
```

- [ ] **Step 2: Add a consultant subline**

In the booking row's guest/customer `<td>` (the cell that already shows the guest name), append a subline showing the consultant. Add immediately after the guest-name markup inside that cell:

```js
<div class="table-subline booking-consultant">${bookingAdminShared.escapeHtml('By: '+getBookingConsultantOwnerName(booking))}</div>
```
(If the row uses a `data-label` guest cell, keep it inside that same `<td>` so the table layout is unchanged.)

- [ ] **Step 3: Verify**

```bash
grep -q "booking-consultant" "$SB/assets/js/booking-admin.js" && echo "ok"
```
Expected: `ok`.

- [ ] **Step 4: Commit (skybook-main)**

```bash
cd "$SB" && git add assets/js/booking-admin.js
git commit -m "feat(ui): show booking consultant on each grid row"
```

---

## Task 6: Grid invoice tag — click to generate & open the guest invoice

The grid status cell (L3808) is `${paymentBadge}${renderToPayTag(booking)}${renderOpenBookingLink(booking)}`. Make `paymentBadge` clickable when the payment state is `invoice`/`invoiced`, reusing the existing `document:guest_invoice` generation path (`buildDocumentMarkup('guest_invoice', booking)` → html2pdf renderer; the same code run by the detail button `data-booking-inline-action="document:guest_invoice"`).

**Files:**
- Modify: `skybook-main/assets/js/booking-admin.js` (row status cell L3800–3808; locate the `document:` inline-action handler)

- [ ] **Step 1: Locate the existing guest-invoice generation handler**

```bash
grep -n "document:" "$SB/assets/js/booking-admin.js" | head
grep -n "booking-inline-action" "$SB/assets/js/booking-admin.js" | head
grep -n "buildDocumentMarkup\|SB_PDF_LIB_URL\|html2pdf" "$SB/assets/js/booking-admin.js" | head
```
Identify the delegated handler that, for `data-booking-inline-action="document:guest_invoice"`, looks up the booking and renders `buildDocumentMarkup('guest_invoice', booking)` to PDF. Note its function name and how it resolves the booking + renders (the renderer using `SB_PDF_LIB_URL`).

- [ ] **Step 2: Make the invoice badge clickable in the row**

In the row template, replace the bare `paymentBadge` usage in the status `<td>` so that, when `['invoice','invoiced'].includes(normalizeText(booking.payment_status))`, the badge is wrapped in a clickable anchor/button carrying the booking id:

```js
const isInvoiceState=['invoice','invoiced'].includes(normalizeText(booking.payment_status||''))
const paymentBadgeCell=isInvoiceState
  ? `<button type="button" class="status-badge-action" data-grid-action="generate-guest-invoice" data-booking-id="${bookingAdminShared.escapeHtml(booking.id)}" title="Generate & open the guest invoice">${paymentBadge}</button>`
  : paymentBadge
```
Then use `${paymentBadgeCell}` instead of `${paymentBadge}` in the status `<td>`.

- [ ] **Step 3: Handle the click — reuse the guest-invoice generator**

Add a delegated click handler (next to the existing booking-grid click handling) that, on `[data-grid-action="generate-guest-invoice"]`, resolves the booking by `data-booking-id` from `state.bookings` and invokes the SAME function identified in Step 1 to generate and open `guest_invoice` for that booking. Do not duplicate the generator — call the existing one. Example shape (adapt the called function name to Step 1's actual handler):

```js
document.addEventListener('click',event=>{
  const trigger=event.target.closest('[data-grid-action="generate-guest-invoice"]')
  if(!trigger)return
  event.preventDefault(); event.stopPropagation()
  const booking=state.bookings.find(item=>String(item.id)===String(trigger.dataset.bookingId))
  if(!booking)return
  generateBookingDocument('guest_invoice',booking) // <- replace with the real handler/fn from Step 1
})
```
If the existing generation logic is inline inside another delegated handler rather than a named function, extract it into a named function (e.g. `generateBookingDocument(documentType, booking)`) and call that from BOTH the existing inline-action and this new grid action (DRY).

- [ ] **Step 4: Verify (non-mutating static checks + smoke test)**

```bash
cd "$SB"
grep -q 'data-grid-action="generate-guest-invoice"' assets/js/booking-admin.js && echo "ok: trigger"
npx playwright test tests/skybook-admin.smoke.spec.js 2>&1 | tail -4
```
Expected: `ok: trigger`; smoke test passes. (Do not submit real invoices against production during automated checks.)

- [ ] **Step 5: Commit (skybook-main)**

```bash
cd "$SB" && git add assets/js/booking-admin.js
git commit -m "feat(ui): generate & open guest invoice from grid invoice tag"
```

---

## Task 7: Default `to_pay` on confirm + reconcile the existing To-Pay CTA

**Files:**
- Modify: `skybook-main/assets/js/booking-admin.js` (`renderToPayTag` ~L3719; the confirm-booking inline-action handler)

- [ ] **Step 1: Suppress the derived CTA when the badge already shows To Pay**

At the top of `renderToPayTag` (~L3719), return empty when the status is already `to_pay` so the badge and CTA don't duplicate:

```js
const renderToPayTag=booking=>{
  if(normalizeText(booking?.payment_status||'')==='to_pay')return ''
  // …existing body unchanged…
```

- [ ] **Step 2: Default confirmed-not-invoiced bookings to `to_pay` in the confirm flow**

Find the confirm-booking handler (the code path behind `data-booking-inline-action="confirm-booking"`). When it sets the booking to `confirmed` and the booking has no invoice/payment progress yet (`payment_status` empty or not in `['invoice','invoiced','partially_paid','fully_paid']`), set `payment_status='to_pay'` in the same update payload sent to the API. Read the handler first:

```bash
grep -n "confirm-booking\|'confirmed'\|status:'confirmed'\|payment_status" "$SB/assets/js/booking-admin.js" | head -20
```
Apply the minimal change so confirming a booking with no invoice yields `status='confirmed', payment_status='to_pay'`. Do not change the booking-api/Edge Function; this is an admin-side default on the update payload.

- [ ] **Step 3: Verify**

```bash
cd "$SB"
node -e "const s=require('fs').readFileSync('assets/js/booking-admin.js','utf8'); if(!/payment_status[^a-zA-Z]+.*to_pay/.test(s))throw new Error('to_pay default not found'); if(!s.includes(\"==='to_pay')return ''\".replace(/\\\\/g,'')))console.log('note: verify CTA suppression manually'); console.log('ok')" || true
grep -q "to_pay" "$SB/assets/js/booking-admin.js" && echo "ok: to_pay referenced"
npx playwright test tests/skybook-admin.smoke.spec.js 2>&1 | tail -3
```
Expected: `ok: to_pay referenced`; smoke test passes.

- [ ] **Step 4: Commit (skybook-main)**

```bash
cd "$SB" && git add assets/js/booking-admin.js
git commit -m "feat: default confirmed-not-invoiced bookings to To Pay; dedupe To-Pay CTA"
```

---

## Task 8: Mirror everything into `Skybook Final` + verify both

`booking-admin.js` and `admin.css` were identical pre-change, so copy them. `booking-admin.html` edits were hand-applied in Task 3. The migration was added in Task 1.

**Files:**
- Overwrite: `Skybook Final/assets/js/booking-admin.js`, `Skybook Final/assets/css/admin.css`
- (Already edited in Task 3: `Skybook Final/booking-admin.html`)

- [ ] **Step 1: Copy the identical-origin files to the mirror**

```bash
cp "$SB/assets/js/booking-admin.js" "$SF/assets/js/booking-admin.js"
cp "$SB/assets/css/admin.css" "$SF/assets/css/admin.css"
```

- [ ] **Step 2: Confirm the mirror now matches for the copied files and has the HTML edits**

```bash
cmp -s "$SB/assets/js/booking-admin.js" "$SF/assets/js/booking-admin.js" && echo "js ok"
cmp -s "$SB/assets/css/admin.css" "$SF/assets/css/admin.css" && echo "css ok"
grep -q 'data-booking-quick-filter="to_pay"' "$SF/booking-admin.html" && grep -q 'value="to_pay">To Pay' "$SF/booking-admin.html" && echo "html ok"
```
Expected: `js ok`, `css ok`, `html ok`.

- [ ] **Step 3: Run the smoke test in `skybook-main` (full)**

```bash
cd "$SB" && npx playwright test tests/skybook-admin.smoke.spec.js 2>&1 | tail -4
```
Expected: pass. If `Skybook Final` has its own test config, run it there too; otherwise rely on the identical JS/CSS + the mirrored HTML controls.

- [ ] **Step 4: Commit the mirror (Skybook Final)**

```bash
git -C "$SF" add assets/js/booking-admin.js assets/css/admin.css booking-admin.html
git -C "$SF" commit -m "feat: mirror booking attribution, statuses, and invoice-tag changes"
```

- [ ] **Step 5: Final guard — both repos reference the new states**

```bash
for R in "$SB" "$SF"; do
  grep -q "awaiting_details" "$R/assets/js/booking-admin.js" && grep -q "to_pay" "$R/assets/js/booking-admin.js" \
   && grep -q "to_pay" "$R/booking-admin.html" \
   && ls "$R/supabase/migrations/2026061601_skybook_awaiting_details_status.sql" >/dev/null \
   && echo "ok: $R" || echo "INCOMPLETE: $R"
done
```
Expected: `ok:` for both.

---

## Self-review notes (author)

- **Spec coverage:** #1 Agent/Reseller (Task 4), #2 Consultant everywhere — detail (Task 4) + grid (Task 5), #3 Awaiting details — DB (Task 1) + presentation (Task 2) + filters (Task 3), #4 To Pay — presentation (Task 2) + filters (Task 3) + default/dedupe (Task 7), #5 invoice-tag generation (Task 6). Mirror to Skybook Final (Tasks 1, 3, 8). Smoke test (Tasks 6–8). All spec sections mapped.
- **No enum migration for `to_pay`:** justified — `bookings.payment_status` became free-text in `202606050001`. Confirmed in spec.
- **Reuse over rebuild:** #2 uses existing `getBookingConsultantOwnerName`; #5 reuses the existing `document:guest_invoice` generator (extract-to-named-function if inline). No duplicate invoice logic.
- **Name consistency:** new identifiers used identically across tasks — statuses `awaiting_details` / `to_pay`; classes `is-awaiting-details` / `is-to-pay` / `status-awaiting-details` / `status-confirmed-to-pay`; helper `getBookingAgentResellerLabel`; grid action `generate-guest-invoice`; extracted fn `generateBookingDocument`.
- **Live-DB safety:** migration authored, not applied; automated checks are non-mutating.
