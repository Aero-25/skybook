# SkyBook — Booking Attribution, Statuses & Invoice Generation — Design

**Date:** 2026-06-16
**Status:** Approved (pending written-spec review)
**Owner:** Aero Digital

## Goal

Five targeted improvements to the SkyBook booking admin:

1. Show the **Agent / Reseller** on booking details.
2. Show **which SkyBook consultant (user) made each booking** everywhere.
3. Add a new booking status **"Awaiting details"** as the first lifecycle stage.
4. Add a new payment status **"To Pay"** as the initial payment state.
5. Make the **invoice tag in the booking grid generate & open the invoice**.

All changes are **additive** and must be applied to **both** `skybook-main/` and `Skybook Final/` (the canonical white-label mirror). Backend changes are added additively (new timestamped migrations; never edit existing ones).

## Current system (as found)

- **Booking status (lifecycle, `bookings.status` enum `booking_status`):** `provisional → confirmed → (cancelled | no_show | rescheduled)`.
- **Payment status (`bookings.payment_status`, now a free-text column):** `'' (while provisional) → invoice → invoiced → partially_paid → fully_paid`.
- **Attribution data already present:** `bookings.created_by` (UUID of the staff user who created the booking, set by the booking-api), `actor_user_id` in status history, a structured **agent** entity (`state.agents`, `getBookingAgentAssignment`), and a free-text `booked_by` / `metadata.booked_by`.
- **Booking detail card** is built by an `addRow(label, value)` sequence (`booking-admin.js` ~L1168–1193), currently including `addRow('Booked by', …)`.
- **Grid row status cell** (`booking-admin.js` L3808): `${paymentBadge}${renderToPayTag(booking)}${renderOpenBookingLink(booking)}`. `paymentBadge` comes from `renderStatusBadge` (L1544) → `getStatusBadgeClass` (L1515+).
- **A `renderToPayTag(booking)` already exists** (L3719) as a derived "To Pay" call-to-action link shown when there is an outstanding amount.
- **Invoice generation already exists**: admin loads `html2pdf` (`SB_PDF_LIB_URL`, L7213) and the booking detail panel has an "Invoice actions" section (L4356) — "Invoice the guest directly or move this booking to invoice status." Invoices carry `invoice_number` and live in `state.invoices`.

## Feature designs

### 1. Agent / Reseller on booking details
Add an **"Agent / Reseller"** row to the booking detail card, immediately after "Booked by". Value resolved from the existing agent assignment for the booking (`getBookingAgentAssignment(booking.id)` → `state.agents` → agent company/code, e.g. *ATC*); fall back to `metadata.agent` / `booked_by` if no structured assignment exists. Display-only. No schema change.

### 2. Consultant (SkyBook user) shown everywhere
Resolve `booking.created_by` to the staff member's display name and surface it as **"Consultant"**:
- Booking detail card (new `addRow('Consultant', …)`).
- Grid rows (a compact consultant label/column).
- Manifest / CSV exports where a booking is listed.

Resolution: map `created_by` against the already-loaded staff/profiles collection in admin state; cache in a `userId → name` lookup. Bookings with no `created_by` (guest/online self-service) display **"Online booking"**.

If the admin booking payload/overview does not currently expose `created_by` (and a resolvable name), extend it additively: include `created_by` on the admin booking records and ensure the staff list needed to resolve names is loaded. Prefer resolving names client-side from the existing staff list to avoid a view change; only touch the `booking_admin_overview` view / booking-api admin payload if `created_by` is not already returned.

### 3. "Awaiting details" booking status (new first stage)
- **DB:** additive migration `alter type public.booking_status add value if not exists 'awaiting_details';`
- **Meaning:** booking captured but guest/logistics details still missing. Sits before Provisional: *Awaiting details → Provisional → Confirmed*.
- **UI:** new badge class + colour (`getStatusBadgeClass` + CSS), a quick-filter chip with count, a checkbox/option in the booking status filter, and inclusion in any status `<select>` used to set booking status. Routing/visibility: treat like Provisional for "lives in the Bookings list" logic.
- **Default:** new incomplete bookings may be set to `awaiting_details`; existing behaviour for provisional bookings is unchanged (no data backfill required).

### 4. "To Pay" payment status (new initial payment state)
- **Model:** `bookings.payment_status` is free-text, so `to_pay` needs **no enum migration** for that column. If `payments.status` (enum `public.payment_status`) must also represent it, add `alter type public.payment_status add value if not exists 'to_pay';` in the same migration (additive) — include only if the codepath sets it on `payments`.
- **Meaning:** confirmed booking, no invoice issued yet. Flow: *To Pay → Invoice → Invoiced → Partially Paid → Fully Paid*.
- **UI:** new badge label/colour for `to_pay`, a quick-filter chip with count, and an option in the payment-state `<select>` (filters and the booking edit form). Default a confirmed-but-not-yet-invoiced booking's `payment_status` to `to_pay` instead of blank.
- **Reconcile with existing `renderToPayTag`:** the derived "To Pay" CTA (outstanding-amount link) must not visually duplicate the new `to_pay` status badge. Keep the badge as the status indicator; keep (or fold in) the CTA only where it adds the "load a payment" action, suppressing it when the badge already says To Pay.

### 5. Invoice tag generates & opens the invoice
Make the **payment badge clickable when it represents an invoice state** (`invoice` / `invoiced`) in the booking grid status cell (L3808). On click:
- Generate the guest invoice PDF for that booking by invoking the **existing** guest-invoice generator (the same path used by the detail panel "Invoice the guest directly" action, via `html2pdf`), and open/download it.
- If an `invoice_number` already exists for the booking, reuse it; otherwise generate as the existing flow does. Do not duplicate invoice records.
- Use a dedicated element/handler (e.g. a `data-invoice-action="generate-open"` on the badge) wired through the grid's existing delegated click handling, so row selection still works.

## Cross-cutting

- **Single source for status presentation:** add `awaiting_details` and `to_pay` to the central status→class/label/colour map and CSS once, so grid, filters, quick-filters, and detail render consistently.
- **Migrations:** one new additive migration (timestamp `2026061601…` or later so it sorts last) adding the `awaiting_details` (and, if needed, `to_pay`) enum value(s). Authored identically into **both** repos' `supabase/migrations/`. Not applied to the live DB by us — the human applies it (a go-live step).
- **Mirror discipline:** every frontend file changed in `skybook-main` (`booking-admin.js`, `booking-admin.html`, status CSS, and any booking-api change) is ported additively into `Skybook Final` with the same edits.

## Out of scope

- Reworking the existing 7-status workflow or its transitions beyond inserting the two new states.
- Agent commission / finance / settlement logic.
- The public marketing/booking sites (True Travel, Iventure).
- Applying migrations to the live database.

## Success criteria

1. Booking detail card shows **Agent / Reseller** and **Consultant** rows with correct values (and "Online booking" when no consultant).
2. Every booking grid row shows which consultant made the booking.
3. **Awaiting details** appears as a selectable/filterable booking status with its own tag, ordered before Provisional.
4. **To Pay** appears as a selectable/filterable payment status with its own tag, ordered before Invoice, and is the default for confirmed-but-not-invoiced bookings.
5. Clicking the invoice tag on a grid row generates and opens that booking's invoice PDF, reusing existing invoice numbering.
6. All schema/frontend changes are present and identical in both `skybook-main` and `Skybook Final`.
7. The SkyBook admin smoke test still passes.

## Open questions

None blocking. (Exact badge colours for the two new states will follow the existing palette conventions in `admin.css`.)
