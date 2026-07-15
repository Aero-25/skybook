# SkyBook Status & Payment Simplification — Design

**Date:** 2026-07-15
**Scope:** `skybook-main` only. Not ported to "Skybook Final" (per standing instruction — that's a separate batch decision for later).

## Motivation

The booking lifecycle has accumulated many intermediate statuses (Awaiting Details, Provisional, Confirmed, plus payment states To Pay/Partially Paid/Paid, plus Invoice/Invoiced which was already removed this session). The user wants this collapsed to the smallest possible model: a booking is either **Finalised** (active) or **Cancelled** — full stop — except for the one case that genuinely needs a holding state: a website submission awaiting a consultant's first look. Payment collapses similarly: no abstract payment *state*, just **which method was used** (or none yet).

## Target status model

Three status values remain meaningful anywhere in the system:

| Status | Meaning | Who sets it |
|---|---|---|
| `provisional` | Website-submitted booking, not yet reviewed by a consultant. Hidden from the main bookings list/badges — only surfaced in Reservation Management. | Public booking API only |
| `finalised` | The active/normal state for every other booking. Admin-created bookings get this **immediately on creation** — no waiting period. A reviewed website booking also becomes this the moment a consultant approves it. | Admin creation (default), Reservation Management approval |
| `cancelled` | Cancelled, or a no-show (folded in — see below). Still requires a reason (unchanged validation). | Cancel action, no-show action |

**Retired entirely** (no code path will ever create these again): `awaiting_details`, `confirmed`, `no_show` (as its own status — folds into `cancelled` with a reason noting "no-show"), `rescheduled` (folds away entirely — rescheduling only updates `preferred_date` + logs an audit note, it no longer changes `status`).

**Removed validation:** the current backend rule blocking Finalised unless "tour has departed AND is fully paid" is deleted. Finalised no longer means "the tour already happened" — it means "this booking is active." (Reschedule/no-show/cancel remain the only ways to move a booking off Finalised.)

**Reinstate** (undo a cancellation) now targets `finalised` directly (there's no `confirmed`/`provisional` to reinstate into for an admin-created booking).

## Target payment model

The Payment Process field (already built this session: Cash / Card / EFT / Voucher / FOC) becomes the **only** payment concept. The `payment_status` column stops holding abstract states (`to_pay`/`partially_paid`/`paid`) and instead directly holds the method value itself: `''` (not yet recorded), `'cash'`, `'card'`, `'eft'`, `'voucher'`, or `'foc'`. This retires the translation layer built earlier today (`metadata.payment_method` + a separate `payment_status` state) — it's no longer needed once `payment_status` *is* the method.

**Partially paid is dropped as a concept.** The Payments tab keeps recording individual payments with real amounts for accounting (invoices, balances, totals are untouched) — but no badge/status anywhere will say "Partially Paid." Once any method is recorded, the booking simply shows that method.

**Existing legacy data:** bookings already sitting on `paid`/`partially_paid`/`fully_paid`/`invoice`/`invoiced` (recorded before method-tracking existed) have no historical method to fall back to. These keep displaying via the graceful fallback already built this session ("Paid (method not recorded)" as a disabled/preserved option) rather than being force-migrated to a fabricated method.

## Affected subsystems (backend: `supabase/functions/booking-api/index.ts`)

1. **`BOOKING_STATUS_TRANSITIONS`** — collapses to `provisional → [finalised, cancelled]`, `finalised → [cancelled]`, `cancelled → [finalised]` (reinstate).
2. **`createBooking`** — admin default status becomes `finalised` (was `confirmed`); website default stays `provisional`. `payment_status` accepts method values directly, defaults to `''`.
3. **`updateBooking`** — remove the "must be departed + fully paid" Finalised gate entirely. `isConfirmBookingWorkflow` now targets `finalised` (reviewing a provisional website booking). `isReservationAcceptanceWorkflow` simplified to target `finalised`/`cancelled` only. `isReinstateWorkflow` targets `finalised`. `isUpdatePaymentStatusWorkflow` checks method values instead of to_pay/partially_paid/paid.
4. **`createManualBookingPayment`** — **decision point:** currently auto-promotes a pending booking to `confirmed` once paid. Since `confirmed` is retired and auto-promoting a still-unreviewed `provisional` booking would bypass the review requirement, this auto-promotion is **removed** — recording a payment no longer changes status by itself.
5. **`runStatusAutomations`** — `autoConfirmPaidBookings` and `autoCompletePastConfirmedBookings` both operated on the now-retired `confirmed` status and are **removed** (nothing will ever sit in a state they'd act on).
6. **`sweepPaymentPendingTransitions`** — currently sets `payment_status:'to_pay'` on imminent unpaid tours; `'to_pay'` no longer exists as a value. **Removed** (no replacement action proposed — flag if you still want an "unpaid tour is imminent" alert of some kind, just without touching the field).
7. Dashboard/report queries checking `['invoice','invoiced','partially_paid'].includes(payment_status)` update to checking "payment_status is blank" for unpaid.
8. Cruise-liner booking creation's hardcoded `payment_status:'invoice'` updates to `''` (unpaid) by default.

## Affected subsystems (frontend: `booking-admin.js` / `.html`)

1. **Status select** — no change needed to the field itself (already Finalised/Cancelled-only from this session); the disabled "Awaiting Details/Provisional/Confirmed" placeholder options become vestigial once migration runs, but are harmless to leave.
2. **Quick filter bar** — remove Awaiting Details/Provisional/Confirmed/To Pay/Partially Paid/Fully Paid filter buttons; keep Today/All/Finalised/Cancelled.
3. **Payment Process select** — simplify `handleBookingSave`'s mapping logic since `payment_status` now *is* the method (removes the translation layer added earlier today). Legacy disabled options (to_pay/paid/partially_paid/invoice/invoiced/fully_paid) stay as display-only fallbacks for old data.
4. **`fillBookingForm`** — new admin bookings default `status` to `finalised` (not force-set to `provisional`).
5. **Badges** (`renderStatusBadge`, `getStatusRowClass`, `PAYMENT_STATUS_LABELS`) — simplified to the 3-status/method-based world; reuse the existing `getPaymentMethodLabel` helper instead of a separate payment-status label map.
6. **Reservation Management screen** — "accept" action sets `finalised` instead of `confirmed`.
7. **`repairStatusConflicts`** (the existing legacy-repair admin tool) — repurposed as the actual one-time migration for existing production data: `confirmed→finalised`, `awaiting_details→provisional`, `no_show→cancelled` (reason noted), `rescheduled→finalised`, and any other legacy status values mapped to the nearest of the two.
8. **CSS** — remove now-dead status/payment color classes (awaiting-details, provisional, confirmed, to-pay, partially-paid color variants), keep finalised/cancelled.

## Out of scope

- Skybook Final (separate decision, not part of this batch).
- The underlying `payments`/`invoices` amount-tracking tables and balance math — untouched, still accurate for accounting.

## Open decisions flagged above (please confirm or correct)

1. Recording a payment no longer auto-changes booking status (item 4 above) — correct?
2. The two payment/finalise automations are removed outright rather than repurposed (item 5) — correct?
3. The 24h-unpaid-tour sweep job is removed with no replacement action (item 6) — correct, or do you want some other alert kept?
4. Legacy `rescheduled` bookings get migrated to `finalised` (can't recover their pre-reschedule status) — acceptable?
