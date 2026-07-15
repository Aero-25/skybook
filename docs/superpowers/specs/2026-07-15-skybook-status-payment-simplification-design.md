# SkyBook Status & Payment Simplification — Design

**Date:** 2026-07-15
**Scope:** `skybook-main` only. Not ported to "Skybook Final" (per standing instruction — that's a separate batch decision for later).

## Motivation

The booking lifecycle has accumulated many intermediate statuses (Awaiting Details, Provisional, Confirmed, plus payment states To Pay/Partially Paid/Paid, plus Invoice/Invoiced which was already removed this session). The user wants this collapsed to the smallest possible model: a booking is either **Finalised** (active) or **Cancelled** — full stop — except for the one case that genuinely needs a holding state: a website submission awaiting a consultant's first look. Payment collapses similarly: no abstract payment *state*, just **which method was used** (or none yet).

## Target status model

**Correction after deeper research (see "Expanded scope" below): four status values remain, not three.** `refunded` stays as its own status per explicit decision — it is common/important enough not to fold into `cancelled`.

| Status | Meaning | Who sets it |
|---|---|---|
| `provisional` | Website-submitted booking, not yet reviewed by a consultant. Hidden from the main bookings list/badges — only surfaced in Reservation Management. | Public booking API only |
| `finalised` | The active/normal state for every other booking. Admin-created bookings get this **immediately on creation** — no waiting period. A reviewed website booking also becomes this the moment a consultant approves it. | Admin creation (default), Reservation Management approval |
| `cancelled` | Cancelled, or a no-show (folded in — no-show now requires a reason, same validation as a normal cancellation). Still requires a reason. | Cancel action, no-show action |
| `refunded` | A refund was issued for this booking. Kept distinct from `cancelled` (existing behavior, unchanged). | Refund action only |

**Retired entirely** (no code path will ever create these again): `awaiting_details`, `confirmed`, `no_show` (as its own status — folds into `cancelled`), `rescheduled` (folds away entirely — rescheduling only updates `preferred_date` + logs an audit note, it no longer changes `status`), and the older legacy values `draft`/`pending`/`awaiting_payment`/`payment_pending`/`completed` (all fold into `finalised`/`cancelled`/`provisional` per the mapping table below).

**`bookings.status` is a Postgres enum** (`public.booking_status`), not free text — enum values cannot be dropped without rebuilding the type. We do **not** rebuild it. Exactly like `invoice_status` earlier this session: the retired values stay defined in the enum (harmless, unused) — we only stop the application from ever writing them, and migrate existing rows off them.

## Expanded scope (found during pre-plan research)

A deeper pass turned up several more live workflows using legacy status/payment_status values that the original design above didn't account for. Mappings below follow the same principles already agreed (finalised = active, cancelled = didn't happen, provisional = website pre-review only):

| Workflow | Current behavior | New behavior |
|---|---|---|
| Reservation **Accept** (`assets/js/booking-admin.js:10076-10086`) | PATCH `status:'awaiting_payment', payment_status:'pending'` | PATCH `status:'finalised'` only — drop the `payment_status:'pending'` write entirely (payment stays whatever it already is, set later via Payment Process) |
| Reservation **Decline** (`booking-admin.js:8215-8240`) | PATCH `status:'cancelled', payment_status:'cancelled'` | PATCH `status:'cancelled', payment_status:''` (blank, matching how `archiveBooking` already does it) |
| Reservation **Reinstate** (`booking-admin.js:10054-10074`, a *different* action from "Reinstate Booking" on a cancelled booking) | PATCH `status:'pending', payment_status:'pending'` | PATCH `status:'provisional', payment_status:''` |
| **No-show** (`booking-admin.js:8356-8392`, workflow_action `no_show`) | PATCH `status:'no_show'` | PATCH `status:'cancelled'` with a required reason (same validation as cancellation) |
| **Reschedule** (`supabase/functions/booking-api/index.ts` `rescheduleBooking`, ~4253-4265) | Sets `status:'rescheduled'` | Only updates `preferred_date` + logs an audit note; status is left untouched |
| Trash **restore** (`index.ts` `restoreBooking`, ~4195-4221) | Falls back to `'confirmed'`/`'awaiting_payment'` when no original status recorded | Falls back to `'finalised'` / `''` (blank payment) |
| **Duplicate booking** (`index.ts` ~4239-4240) | Defaults `status`/`payment_status` to `'pending'` | Defaults `status:'finalised'`, `payment_status:''` (a duplicate is a fresh booking, starts unpaid) |
| Second sweep job (`index.ts` ~4712-4713, distinct from the 24h-unpaid sweep already removed this session) | Moves `draft`/`pending`/`payment_request_sent` bookings to `'awaiting_payment'` | Removed — its source statuses become unreachable once nothing creates them |
| `getStatusBadgeClass` (`booking-admin.js:1543-1559`) | Its own independent status/payment vocabulary, separate from `getStatusRowClass` | Updated in parallel with `getStatusRowClass` to the 4-status/method model |
| Payment-state filter dropdown (`booking-admin.html:679-684`, separate from the quick-filter pill buttons) | Options: to_pay/invoice/invoiced/partially_paid/fully_paid | Removed (redundant with Payment Process values) |
| Reservation-stage shortcuts (`booking-admin.js:9667-9670`) | Set the status filter to invoice/invoiced/fully_paid | Updated to the new vocabulary or removed if no longer meaningful |
| Dashboard tiles/counters (pending confirmations, unpaid bookings, chart colors — multiple locations) | Count/color by legacy values | Recomputed against the 4-status/method model (e.g. "pending confirmations" becomes "awaiting review" counting `provisional`) |

**Removed validation:** the current backend rule blocking Finalised unless "tour has departed AND is fully paid" is deleted. Finalised no longer means "the tour already happened" — it means "this booking is active." (No-show/cancel/refund remain the only ways to move a booking off Finalised; reschedule no longer touches status at all.)

## Target payment model

The Payment Process field (already built this session: Cash / Card / EFT / Voucher / FOC) becomes the **only** payment concept. The `payment_status` column stops holding abstract states (`to_pay`/`partially_paid`/`paid`) and instead directly holds the method value itself: `''` (not yet recorded), `'cash'`, `'card'`, `'eft'`, `'voucher'`, or `'foc'`. This retires the translation layer built earlier today (`metadata.payment_method` + a separate `payment_status` state) — it's no longer needed once `payment_status` *is* the method.

**Partially paid is dropped as a concept.** The Payments tab keeps recording individual payments with real amounts for accounting (invoices, balances, totals are untouched) — but no badge/status anywhere will say "Partially Paid." Once any method is recorded, the booking simply shows that method.

**Existing legacy data:** bookings already sitting on `paid`/`partially_paid`/`fully_paid`/`invoice`/`invoiced` (recorded before method-tracking existed) have no historical method to fall back to. These keep displaying via the graceful fallback already built this session ("Paid (method not recorded)" as a disabled/preserved option) rather than being force-migrated to a fabricated method.

## Affected subsystems (backend: `supabase/functions/booking-api/index.ts`)

1. **`BOOKING_STATUS_TRANSITIONS`** — collapses to `provisional → [finalised, cancelled]`, `finalised → [cancelled, refunded]`, `cancelled → [finalised]` (reinstate), `refunded → []`.
2. **`createBooking`** — admin default status becomes `finalised` (was `confirmed`); website default stays `provisional`. `payment_status` accepts method values directly, defaults to `''`.
3. **`updateBooking`** — remove the "must be departed + fully paid" Finalised gate entirely. `isConfirmBookingWorkflow` now targets `finalised` (reviewing a provisional website booking). `isReservationAcceptanceWorkflow` simplified to target `finalised` (accept) / `cancelled` (decline). `isReinstateWorkflow` targets `finalised`. `isNoShowWorkflow` now targets `cancelled` (with required reason) instead of `no_show`. `isRescheduleWorkflow`/`rescheduleBooking` no longer changes `status` at all — date-only update. `isUpdatePaymentStatusWorkflow` checks method values instead of to_pay/partially_paid/paid.
4. **`createManualBookingPayment`** — currently auto-promotes a pending booking to `confirmed` once paid. Since `confirmed` is retired and auto-promoting a still-unreviewed `provisional` booking would bypass the review requirement, this auto-promotion is **removed** — recording a payment no longer changes status by itself.
5. **`runStatusAutomations`** — `autoConfirmPaidBookings` and `autoCompletePastConfirmedBookings` both operated on the now-retired `confirmed` status and are **removed**, including their settings-UI checkboxes (`automationAutoConfirmPaid`/`automationAutoCompletePast` in booking-admin.html).
6. **`sweepPaymentPendingTransitions`** — currently sets `payment_status:'to_pay'` on imminent unpaid tours; `'to_pay'` no longer exists as a value. **Removed**, no replacement alert.
7. **Second sweep job** (~line 4712, `draft`/`pending`/`payment_request_sent` → `'awaiting_payment'`) — removed; its source statuses become unreachable once `createBooking` stops producing them.
8. **`restoreBooking`** (trash restore) — fallback when no original status recorded changes from `'confirmed'`/`'awaiting_payment'` to `'finalised'`/`''` (blank payment).
9. **`duplicateBooking`** — default `status`/`payment_status` changes from `'pending'`/`'pending'` to `'finalised'`/`''`.
10. Dashboard/report queries checking `['invoice','invoiced','partially_paid'].includes(payment_status)` update to checking "payment_status is blank" for unpaid.
11. Cruise-liner booking creation's hardcoded `payment_status:'invoice'` updates to `''` (unpaid) by default.

## Affected subsystems (frontend: `booking-admin.js` / `.html`)

1. **Status select** — no change needed to the field itself (already Finalised/Cancelled-only from this session); the disabled "Awaiting Details/Provisional/Confirmed" placeholder options become vestigial once migration runs, but are harmless to leave.
2. **Quick filter bar** — remove Awaiting Details/Provisional/Confirmed/To Pay/Partially Paid/Fully Paid pill buttons; keep Today/All/Finalised/Cancelled/Refunded. Remove the separate payment-state filter dropdown (to_pay/invoice/invoiced/partially_paid/fully_paid) entirely.
3. **Payment Process select** — simplify `handleBookingSave`'s mapping logic since `payment_status` now *is* the method (removes the translation layer added earlier today). Legacy disabled options (to_pay/paid/partially_paid/invoice/invoiced/fully_paid) stay as display-only fallbacks for old data.
4. **`fillBookingForm`** — new admin bookings default `status` to `finalised` (not force-set to `provisional`).
5. **Badges** (`renderStatusBadge`, `getStatusRowClass`, `getStatusBadgeClass`, `PAYMENT_STATUS_LABELS`) — both `getStatusRowClass` and the independently-maintained `getStatusBadgeClass` simplified in parallel to the 4-status/method-based world; reuse the existing `getPaymentMethodLabel` helper instead of a separate payment-status label map.
6. **Reservation Management screen** — Accept sets `finalised` (drops the `payment_status:'pending'` write). Decline sets `cancelled` + blank payment (was `'cancelled'`). Reinstate (undo-decline) sets `provisional` + blank payment (was `'pending'`/`'pending'`). Reservation-stage shortcuts (~9667-9670) updated off the invoice/invoiced/fully_paid vocabulary.
7. **No-show workflow modal** — now requires a reason (same as cancellation) and submits `status:'cancelled'` instead of `'no_show'`.
8. **Reschedule workflow** — no longer sends/expects a status change; only date + audit note.
9. **`repairStatusConflicts`** (the existing legacy-repair admin tool) — repurposed as the one-time migration for existing production data: `confirmed→finalised`, `awaiting_details→provisional`, `no_show→cancelled` (reason noted), `rescheduled→finalised`, `draft`/`pending`/`awaiting_payment`/`payment_pending`/`completed`→ nearest of `finalised`/`cancelled`/`provisional`. `refunded` is left untouched (still a valid target status).
10. **Dashboard tiles/counters** (pending confirmations, unpaid bookings, chart colors) — recomputed against the 4-status/method model rather than removed, since they're useful surfaces (e.g. "pending confirmations" becomes "awaiting review," counting `provisional`).
11. **CSS** — remove now-dead status/payment color classes (awaiting-details, provisional-admin-visible, confirmed, to-pay, partially-paid color variants), keep finalised/cancelled/refunded.

## Out of scope

- Skybook Final (separate decision, not part of this batch).
- The underlying `payments`/`invoices` amount-tracking tables and balance math — untouched, still accurate for accounting.
- Refund status itself (`refunded`) — stays exactly as it works today, just confirmed as a 4th first-class status rather than something to fold away.

## Decisions confirmed during brainstorming

1. Recording a payment no longer auto-changes booking status. ✅ confirmed
2. The two payment/finalise automations (`autoConfirmPaidBookings`, `autoCompletePastConfirmedBookings`) are removed outright, including their settings UI. ✅ confirmed
3. The 24h-unpaid-tour sweep job is removed with no replacement action. ✅ confirmed
4. Legacy `rescheduled` bookings get migrated to `finalised` (going forward, reschedule never changes status at all, so this only affects historical data during the one-time migration). ✅ confirmed
5. `refunded` stays as its own 4th status, not folded into `cancelled`. ✅ confirmed
6. No-show requires a reason, same as any cancellation. ✅ confirmed
