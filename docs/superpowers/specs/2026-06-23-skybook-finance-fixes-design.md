# SkyBook Finance & Reporting Fixes — Design

**Date:** 2026-06-23
**Scope:** 5 fixes to the SkyBook booking admin (`skybook-main`), each mirrored into the
canonical white-label copy `Skybook Final` (backend ported additively per the standing
sync rule). Push `skybook-main` to GitHub; `Skybook Final` stays local (commit only).

---

## Problem statement

1. **Overpayment is possible.** Manual payments accumulate without any ceiling, so an admin
   can record more money than the booking is worth (the reported double-payment).
2. **Refunds error out.** Typing a booking *reference* (e.g. `IV202622-973FE25F`) into the
   refund form sends it into a UUID column → `invalid input syntax for type uuid`.
3. **Changing pax doesn't update finances.** Reducing 2 pax → 1 leaves the total unchanged.
4. **Reports only export to PDF.** They must also export to Word and Excel, and look polished.
5. **No "FOC" (Free of Charge) payment status.** Need a status that zeroes the booking charge,
   gated by a confirmation popup when selected.

---

## Decisions (confirmed with user)

- **Overpayment:** Block by default, but allow a **deliberate override** (confirmation
  checkbox) for legitimate cases (tips/extras).
- **Existing data:** **Full bulk backfill** — a one-time, guarded pass recomputes
  `total_amount = base_price × pax` for bookings with **no deliberate price override**, plus
  the on-edit fix going forward.
- **Excel:** **SheetJS via CDN** (`<script>`), matching the existing `html2pdf` CDN pattern.
- **FOC:** New `foc` payment status; zeroes charge; confirmation popup on select.

---

## Root-cause map

| # | Root cause | Location |
|---|-----------|----------|
| 1 | `nextReceived = previousReceived + amount`, no cap vs `total_amount` | `booking-api/index.ts` `createManualBookingPayment` (~2376) |
| 2 | `createRefund` does `.eq('id', bookingId)` with a human reference | `booking-api/index.ts` `createRefund` (~3223) |
| 3 | `finalTotalAmount = priceOverride>0 ? priceOverride : pricing.totalAmount` pins total to a stale, auto-prefilled override | `booking-api/index.ts` `updateBooking` (~3916) |
| 4 | Reports render HTML → PDF only via `html2pdf` | `booking-admin.js` `printSkyBookReport`/`downloadSkyBookReportPdf` (~7340, 7431) |
| 5 | No `foc` value in the payment-status select or finance logic | `booking-admin.html` (~1520), `booking-api/index.ts` |

---

## Fix design

### 1. Block overpayment (with override)

**Backend** `createManualBookingPayment`:
- Compute `outstanding = max(0, totalAmount − previousReceived)`.
- If `previousReceived + 0.01 >= totalAmount` (already fully paid) **and** `payload.allow_overpayment !== true` → throw `"Booking is already fully paid (received X of Y). Tick 'Allow overpayment' to record an additional amount."`
- Else if `amount > outstanding + 0.01` **and** `payload.allow_overpayment !== true` → throw `"Payment of A exceeds the outstanding balance of B. Reduce the amount or tick 'Allow overpayment'."`
- When `allow_overpayment === true`, record as-is (current behaviour) — `nextReceived` may exceed total, status stays/goes `paid`, outstanding clamps to 0.
- FOC bookings (`payment_status==='foc'` or `total_amount===0`) reject any payment unless override is ticked (there is nothing to pay).

**Frontend** payment form:
- Add an **"Allow overpayment"** checkbox (default off) to the manual-payment modal.
- Pre-validate: if amount > outstanding and box unticked, show the outstanding figure and block before calling the API. Pass `allow_overpayment` in the body.

### 2. Refund by reference *or* UUID

**Backend** `createRefund(bookingId, …)`:
- Add `resolveBookingId(value)`: if `value` matches a UUID regex, look up by `id`; otherwise
  look up by `reference` (case-insensitive). Use the resolved row's real UUID for all
  subsequent writes. Throw `"No booking found for 'X'."` if neither matches.
- Cap refund: `amount = min(payload.amount, amountPaid)` where `amountPaid` is the payment's
  `amount_received`; if `amount <= 0` throw `"Nothing has been paid on this booking to refund."`

**Frontend**: relabel the field **"Booking ID or Reference"**; helper text noting either works.
(The workspace button already passes the UUID — unaffected.)

### 3. Pax change reprices finances

**Backend** `updateBooking`:
- Detect a **deliberate** override: `submittedOverride > 0 && |submittedOverride − existing.total_amount| > 0.01`.
  Only then honor `price_override`. A submitted override equal to the existing total is the
  auto-prefilled value and is treated as **stale** → reprice from `nextQuantity`.
- When repricing, clear the stale override in metadata (`price_override: 0`) so it doesn't
  re-pin on the next edit.
- Repricing already cascades to `amount_due_*`, `payment_status`, and the guest invoice via
  `syncInvoiceForBooking`. Confirm commissions/office invoices recompute (they key off
  `total_amount`).

### 3b. Bulk backfill (one-time migration)

New migration `…_skybook_recalculate_booking_finances.sql`:
- For every booking where there is **no deliberate override** (`metadata->>'price_override'` is
  null/`0`) **and** `payment_status NOT IN ('foc')` **and** status not cancelled/refunded:
  recompute `subtotal_amount = service.base_price × quantity`, reapply stored discount, and set
  `total_amount`, `amount_due_now`/`amount_due_later` (respecting `amount_received`).
- Skips bookings with a real override, FOC, cancelled, or refunded — preserves intentional values.
- Idempotent (re-running yields the same result). Wrapped in a transaction.
- **Verification:** before/after counts + a sample diff logged; reversible by restoring from the
  pre-migration snapshot (documented in the migration header).

### 4. Beautiful reports + PDF / Word / Excel

- **Restyle** the shared report shell (`SB_DOC_BASE_CSS` and the report `<header>`): branded
  header band, summary stat cards, zebra tables, section rules, print-safe page breaks.
- **Export picker:** replace the PDF-only modal with a format choice — **PDF**, **Word**, **Excel**.
  - **PDF** — existing `html2pdf` path, restyled.
  - **Word** — emit the same report HTML as a `.doc` Blob with the Word XML/`application/msword`
    header (dependency-free; preserves styling). `downloadReportAsWord(title, html, filename)`.
  - **Excel** — `.xlsx` via SheetJS (CDN `<script>`, lazy-loaded once). Each report exposes a
    structured `{ sheetName, columns, rows }[]` model so Excel gets real typed cells, not a
    screenshot. `downloadReportAsExcel(title, sheets, filename)`.
- Applies to **all** report types (bookings, financial, commissions, consultants, and the
  operational sheets where tabular).

### 5. FOC (Free of Charge) payment status

- **UI:** add `<option value="foc">FOC (Free of Charge)</option>` to the payment-status select.
  On selecting FOC, a **confirmation popup**: *"Set this booking to Free of Charge? The total
  and balance will be set to 0 and no payment will be due."* — Confirm/Cancel. Cancel reverts
  the select to its prior value.
- **Backend:** when `payment_status === 'foc'`:
  - Force `total_amount = 0`, `subtotal_amount = 0`, `tax_amount = 0`, `service_fee_amount = 0`,
    `amount_due_now = 0`, `amount_due_later = 0`.
  - `resolveOutstandingAmounts` returns `{0,0}` for `foc` (treat like settled).
  - Excluded from revenue in finance reports (gross 0; flagged as FOC, not cancelled).
  - Block manual payments on FOC bookings (see #1).
  - Add `foc` to status-badge styling and any payment-status display/label maps.
- **Backfill interaction:** the bulk recompute skips `foc` bookings.

---

## Files touched

**`skybook-main` (and mirrored to `Skybook Final`):**
- `supabase/functions/booking-api/index.ts` — #1, #2, #3, #5 (ported **additively** to Final).
- `supabase/migrations/2026…_skybook_recalculate_booking_finances.sql` — #3b (new).
- `supabase/migrations/2026…_skybook_foc_payment_status.sql` — #5 (any column/constraint/enum
  needs; new). *(If `payment_status` is a free-text column, may be a no-op/guard only.)*
- `assets/js/booking-admin.js` — #1 (checkbox + pre-validate), #2 (label), #4 (exports + styles),
  #5 (popup + display).
- `booking-admin.html` — #1 checkbox, #5 select option, report export controls.
- `assets/css/*` — report styling if not inlined in `SB_DOC_BASE_CSS`.

**`Skybook Final` backend** (`supabase/functions/booking-api/index.ts`): the two copies have
diverged ~227 lines; apply the same logic **by hand**, do not blind-copy. Frontend/HTML/CSS and
SheetJS loader are safe to apply identically.

---

## Deployment

1. Implement + verify locally (smoke tests where they exist).
2. Apply both migrations to Supabase (project token provided — **rotate after**).
3. Deploy the `booking-api` edge function.
4. Mirror everything into `Skybook Final`; commit there (no push — no remote).
5. Commit `skybook-main` and **push to GitHub**.

---

## Out of scope / risks

- Bulk backfill **rewrites historical totals** for non-overridden bookings — chosen by user;
  mitigated by skip-rules, idempotency, transaction, and a logged before/after sample.
- The Word `.doc` is HTML-based (opens in Word with styling) — not a native `.docx` part tree.
  Acceptable for branded reports; flagged here for transparency.
