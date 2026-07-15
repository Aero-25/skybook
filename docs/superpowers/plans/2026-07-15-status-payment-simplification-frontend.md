# Status & Payment Simplification — Plan 2: Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `assets/js/booking-admin.js`, `booking-admin.html`, and `assets/css/booking.css` in line with the backend's 4-status model (`provisional`/`finalised`/`cancelled`/`refunded`) and method-based payment model (`''`/`cash`/`card`/`eft`/`voucher`/`foc`), which is already merged to `main` (Plan 1, commit `e9e5f0a`).

**Architecture:** No new abstractions — this is a like-for-like migration of existing UI logic (forms, badges, filters, dashboard tiles, reservation workflow actions) to the new vocabulary, plus removing a translation layer that's no longer needed now that `payment_status` directly holds the method.

**Tech Stack:** Vanilla JS, no build step, no bundler, no local test runner besides a Playwright smoke test that needs live credentials (not available in this environment).

**Spec:** `docs/superpowers/specs/2026-07-15-skybook-status-payment-simplification-design.md`
**Backend plan (already merged):** `docs/superpowers/plans/2026-07-15-status-payment-simplification-backend-core.md`

**Scope of this plan:** `assets/js/booking-admin.js`, `booking-admin.html`, `assets/css/booking.css` only. The `repairStatusConflicts` data-migration tool, and updating `tests/skybook-admin.smoke.spec.js`, are Plan 3 (separate).

**Verification method:** No local test runner can meaningfully exercise this UI (Playwright needs live `SKYBOOK_ADMIN_USERNAME`/`SKYBOOK_ADMIN_PASSWORD`, not available here). Each task's steps include a `node --check` syntax verification (for `.js` changes) and a manual trace written out for the reviewer to verify by reading the code — matching how Plan 1 was verified. Real UI verification should happen by loading the page in a browser before this ships, which is out of reach in this environment.

---

### Task 1: Fix `isReviewReservation` — currently inverted for the new model

**Files:**
- Modify: `assets/js/booking-admin.js:1872-1882`

This is the single most important fix in this plan — Reservation Management routing, the reservation pipeline, and `handleBookingSave`'s post-save routing all depend on this function, and it currently treats `'provisional'` (the one real pre-review status in the new model) as explicitly NOT a reservation.

- [ ] **Step 1: Replace the function**

Current code:
```javascript
const isReviewReservation=booking=>{
  const status=normalizeText(booking?.status||'')
  // provisional bookings always go straight to Bookings regardless of source
  if(status==='provisional')return false
  // only draft/pending can be reservations
  if(!['draft','pending'].includes(status))return false
  // reservations are website-sourced only; admin-created bookings go to Bookings
  const source=normalizeText(booking?.source||booking?.metadata?.source||'website')
  if(source==='admin'||Boolean(booking?.metadata?.admin_created))return false
  return true
}
```

Replace with:
```javascript
const isReviewReservation=booking=>{
  const status=normalizeText(booking?.status||'')
  // Only a provisional booking needs review — admin-created bookings start finalised
  // directly (see fillBookingForm/handleBookingSave), so nothing else ever lands here.
  if(status!=='provisional')return false
  // Belt-and-braces: reservations are website-sourced only; a provisional booking
  // created directly by an admin (if that ever happens) still goes to Bookings.
  const source=normalizeText(booking?.source||booking?.metadata?.source||'website')
  if(source==='admin'||Boolean(booking?.metadata?.admin_created))return false
  return true
}
```

- [ ] **Step 2: Syntax check**

```bash
node --check assets/js/booking-admin.js
```
Expected: no output (success).

- [ ] **Step 3: Manual trace**

Read the edited function and confirm:
1. A website-submitted booking with `status:'provisional'`, `source:'website'` → `status!=='provisional'` is false → falls through → `source==='admin'` is false → returns `true` (is a reservation, correctly routed to Reservation Management).
2. An admin-created booking with `status:'finalised'` → `status!=='provisional'` is true → returns `false` immediately (correctly NOT a reservation, goes straight to Bookings).
3. A cancelled booking (declined reservation) with `status:'cancelled'` → `status!=='provisional'` is true → returns `false` (correctly falls out of the reservation queue once declined — it now shows in regular Bookings as cancelled, matching how "Reinstate Reservation" then brings it back to `provisional` to re-enter the queue).

- [ ] **Step 4: Commit**

```bash
git add assets/js/booking-admin.js
git commit -m "isReviewReservation: only provisional counts as a reservation needing review"
```

---

### Task 2: Simplify `handleBookingSave`'s payment/status logic

**Files:**
- Modify: `assets/js/booking-admin.js:8791-8849` (payment mapping + payload)

Now that the backend's `payment_status` directly holds the method value, the translation layer built as an interim stepping-stone (`selectedPaymentMethod`/`mappedPaymentStatus`/the `metadata.payment_method` shadow field) is no longer needed. Also fixes the bug (flagged during Plan 1's own review) where new admin bookings are hardcoded to `status:'provisional'`, silently overriding the backend's `finalised` default.

- [ ] **Step 1: Replace the payment-mapping block**

Current code:
```javascript
  const requestedStatus=nodes.bookingStatus.value
  const requestedPaymentField=nodes.bookingPaymentStatus.value
  const isReservationAcceptanceWorkflow=returnToReservationManagement&&wasEditing&&!isReviewReservation({status:requestedStatus})
  // Payment Process: the field captures HOW a booking was settled (cash/card/eft/voucher) or FOC.
  // Any method selection means payment is complete; the method itself is kept in metadata.payment_method
  // for record-keeping. Generic values this field can't produce itself (to_pay/paid/partially_paid, or
  // legacy invoice/invoiced/fully_paid set by other flows) pass through unchanged when left untouched —
  // otherwise the next unrelated save would silently corrupt them (e.g. wipe a "to_pay" booking to blank).
  const isFocSelected=requestedPaymentField==='foc'
  const selectedPaymentMethod=PAYMENT_PROCESS_METHODS.includes(requestedPaymentField) ? requestedPaymentField : ''
  const mappedPaymentStatus=isFocSelected ? 'foc'
    : selectedPaymentMethod ? 'paid'
    : PAYMENT_PROCESS_PRESERVED_STATUSES.includes(requestedPaymentField) ? requestedPaymentField
    : ''
  // Status 2 (payment): a freshly confirmed booking is "To Pay" unless finance recorded how it was settled.
  const finalPaymentStatus=!wasEditing ? '' : (requestedStatus==='confirmed'&&!mappedPaymentStatus ? 'to_pay' : mappedPaymentStatus)
```

Replace with:
```javascript
  const requestedStatus=nodes.bookingStatus.value
  const requestedPaymentField=nodes.bookingPaymentStatus.value
  const isReservationAcceptanceWorkflow=returnToReservationManagement&&wasEditing&&!isReviewReservation({status:requestedStatus})
  // payment_status now directly holds the settlement method (cash/card/eft/voucher/foc) or is blank —
  // no translation needed. A brand-new booking always starts unpaid regardless of what the field shows
  // (matches the backend's createBooking default), everything else passes the field's value straight through.
  const finalPaymentStatus=!wasEditing ? '' : requestedPaymentField
```

- [ ] **Step 2: Fix the new-booking status default and remove the now-unused `metadata.payment_method` field**

Current code:
```javascript
    status:!wasEditing ? 'provisional' : requestedStatus,
    payment_status:finalPaymentStatus,
```
Replace with:
```javascript
    status:requestedStatus,
    payment_status:finalPaymentStatus,
```
(A new booking's Status field already defaults to `'finalised'` via Task 4 of this plan, so there is no longer any need to hardcode `'provisional'` here — sending whatever the field shows is now correct for both create and edit.)

A few lines below, in the `metadata:{...}` object, current code:
```javascript
    metadata:{
      ...(existingBooking?.metadata||{}),
      // Keep the previously recorded method only while the field shows an untouched preserved value
      // (to_pay/paid/partially_paid/legacy); selecting a fresh method, FOC, or "— Not set —" all
      // deliberately overwrite/clear it rather than leaving a stale method behind.
      payment_method:selectedPaymentMethod||(PAYMENT_PROCESS_PRESERVED_STATUSES.includes(requestedPaymentField) ? (existingBooking?.metadata?.payment_method||'') : ''),
      custom_fields:collectBookingCustomFieldValues(),
```
Replace with:
```javascript
    metadata:{
      ...(existingBooking?.metadata||{}),
      custom_fields:collectBookingCustomFieldValues(),
```
(Delete the `payment_method:...` line entirely — `payment_status` alone is now the source of truth, so this shadow copy in metadata is redundant. Note `existingBooking?.metadata` may still carry an old `payment_method` key from before this change on already-edited bookings; that's harmless leftover data, not read by anything after this task.)

- [ ] **Step 3: Remove the now-unused constants**

Find and delete these two constants (they're no longer referenced anywhere after Steps 1-2):
```javascript
// Payment Process field: selecting one of these methods means the booking is paid in full.
const PAYMENT_PROCESS_METHODS=['cash','card','eft','voucher']
// Generic payment_status values the Payment Process field can't produce itself, but must still be
// able to display (and pass through unchanged) since other flows (Payments tab, confirm-booking,
// cruise-liner creation, legacy data) can set them directly on the booking.
const PAYMENT_PROCESS_PRESERVED_STATUSES=['to_pay','paid','partially_paid','invoice','invoiced','fully_paid']
```
**Before deleting, grep the whole file for both names** (`grep -n "PAYMENT_PROCESS_METHODS\|PAYMENT_PROCESS_PRESERVED_STATUSES" assets/js/booking-admin.js`) to confirm nothing else references them (Task 4, which touches `fillBookingForm`, currently uses `PAYMENT_PROCESS_METHODS` too — do this task and Task 4 together, or do Task 4 first, before deleting these constants, so you don't leave a dangling reference in between).

- [ ] **Step 4: Syntax check**

```bash
node --check assets/js/booking-admin.js
```

- [ ] **Step 5: Manual trace**

1. New booking, Payment Process left at "— Not set —" (`requestedPaymentField=''`): `finalPaymentStatus = !wasEditing ? '' : ... = ''`. Matches backend default.
2. Editing an existing `finalised` booking, admin picks "Cash" (`requestedPaymentField='cash'`): `finalPaymentStatus='cash'`. Sent to backend as-is — backend already accepts this directly (Plan 1, Task 4's `isUpdatePaymentStatusWorkflow`).
3. Editing a booking that's currently `partially_paid` (from the Payments tab) and the admin doesn't touch the Payment Process field at all: `requestedPaymentField` reads whatever `fillBookingForm` populated it with (Task 4 sets this to `String(booking.payment_status)` directly now) — i.e. `'partially_paid'` — so `finalPaymentStatus='partially_paid'`, unchanged. No corruption.

- [ ] **Step 6: Commit**

```bash
git add assets/js/booking-admin.js
git commit -m "handleBookingSave: payment_status is now the method directly, no translation needed"
```

---

### Task 4: Simplify `fillBookingForm`'s field population

**Files:**
- Modify: `assets/js/booking-admin.js:4969, 4973-4974`

- [ ] **Step 1: Replace the status default**

Current:
```javascript
  nodes.bookingStatus.value=booking?.status||'confirmed'
```
Replace with:
```javascript
  nodes.bookingStatus.value=booking?.status||'finalised'
```

- [ ] **Step 2: Simplify the payment field population**

Current:
```javascript
  // Payment Process shows the recorded settlement method when known; otherwise it falls back to
  // whatever generic payment_status the booking currently carries (e.g. partially_paid from the
  // Payments tab, or paid/foc recorded before a method was tracked) so existing data still displays.
  const bookingPaymentMethod=booking?.metadata?.payment_method||''
  nodes.bookingPaymentStatus.value=PAYMENT_PROCESS_METHODS.includes(bookingPaymentMethod) ? bookingPaymentMethod : String(booking?.payment_status||'')
```
Replace with:
```javascript
  // payment_status now directly holds the method (or a still-valid legacy value like partially_paid
  // from the Payments tab) — no metadata lookup needed, the column is the single source of truth.
  nodes.bookingPaymentStatus.value=String(booking?.payment_status||'')
```

- [ ] **Step 3: Syntax check**

```bash
node --check assets/js/booking-admin.js
```

- [ ] **Step 4: Now safe to remove `PAYMENT_PROCESS_METHODS`/`PAYMENT_PROCESS_PRESERVED_STATUSES` if Task 3 of this plan hasn't already removed them**

Run:
```bash
grep -n "PAYMENT_PROCESS_METHODS\|PAYMENT_PROCESS_PRESERVED_STATUSES" assets/js/booking-admin.js
```
If Task 2's Step 3 already deleted these constants, this should show zero matches (this file no longer uses them either). If it shows matches only at the constant's own declaration (not deleted yet), that means Task 2's Step 3 wasn't done yet — go delete the two constants now, per Task 2 Step 3's instructions, since after this task nothing references them.

- [ ] **Step 5: Manual trace**

1. `fillBookingForm(null)` (new booking): `nodes.bookingStatus.value` → `'finalised'` (was `'confirmed'`, a retired value that would have silently failed to match any option and shown blank before this fix — now correctly shows the one real enabled default).
2. `fillBookingForm({status:'provisional', payment_status:''})` (opening a website reservation for review): status field shows `'provisional'` (the disabled-but-displayable option), payment field shows `''` (blank, "— Not set —").
3. `fillBookingForm({status:'finalised', payment_status:'partially_paid'})`: payment field shows `'partially_paid'` (matches the disabled preserved option in the HTML), no crash, no blank fallback.

- [ ] **Step 6: Commit**

```bash
git add assets/js/booking-admin.js
git commit -m "fillBookingForm: default new bookings to finalised, read payment_status directly"
```

---

### Task 3: Update the Status and Payment Process `<select>` options in `booking-admin.html`

**Files:**
- Modify: `booking-admin.html:1511-1534`

- [ ] **Step 1: Simplify the Status select**

Current:
```html
              <select id="adminBookingStatusField">
                <option value="awaiting_details" disabled>Awaiting Details</option>
                <option value="provisional" disabled>Provisional</option>
                <option value="confirmed" disabled>Confirmed</option>
                <option value="finalised">Finalised</option>
                <option value="cancelled">Cancelled</option>
              </select>
```
Replace with:
```html
              <select id="adminBookingStatusField">
                <option value="provisional" disabled>Provisional (website, awaiting review)</option>
                <option value="finalised">Finalised</option>
                <option value="cancelled">Cancelled</option>
                <option value="refunded" disabled>Refunded</option>
              </select>
```
(`awaiting_details` and `confirmed` are fully retired — no code path produces them anymore, and the bookings table has been reset, so there's no existing data that needs them as a display fallback either. `provisional` stays as a disabled display-only option for website reservations being reviewed. `refunded` is added as a disabled display-only option — a booking only ever becomes `refunded` through the dedicated Refund action, never through this dropdown, so it stays visible-but-unselectable here for when you're viewing an already-refunded booking's details.)

- [ ] **Step 2: Simplify the Payment Process select**

Current:
```html
              <select id="adminBookingPaymentStatusField">
                <option value="">— Not set —</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="eft">EFT</option>
                <option value="voucher">Voucher</option>
                <option value="foc">FOC (Free of Charge)</option>
                <option value="to_pay" disabled>To Pay</option>
                <option value="paid" disabled>Paid (method not recorded)</option>
                <option value="partially_paid" disabled>Partially Paid</option>
                <option value="invoice" disabled>Invoice (legacy)</option>
                <option value="invoiced" disabled>Invoiced (legacy)</option>
                <option value="fully_paid" disabled>Fully Paid (legacy)</option>
              </select>
```
Replace with:
```html
              <select id="adminBookingPaymentStatusField">
                <option value="">— Not set —</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="eft">EFT</option>
                <option value="voucher">Voucher</option>
                <option value="foc">FOC (Free of Charge)</option>
                <option value="paid" disabled>Paid (method not recorded)</option>
                <option value="partially_paid" disabled>Partially Paid</option>
              </select>
```
(`to_pay`/`invoice`/`invoiced`/`fully_paid` are fully retired — no code path writes them anymore (Plan 1 removed every producer). `paid` and `partially_paid` stay: `partially_paid` is still actively written by the Payments-tab flow (`createManualBookingPayment`, tracked as a follow-up but currently live code), and `paid` can still appear on a booking recorded before method-tracking existed, or via that same flow once fully paid off.)

- [ ] **Step 3: Manual verification**

Read the two edited `<select>` blocks and confirm every `value` referenced matches a value the backend can actually produce (per Plan 1): `provisional`/`finalised`/`cancelled`/`refunded` for status; `''`/`cash`/`card`/`eft`/`voucher`/`foc`/`paid`/`partially_paid` for payment.

- [ ] **Step 4: Commit**

```bash
git add booking-admin.html
git commit -m "Simplify Status/Payment Process select options to the 4-status/method model"
```

---

### Task 5: Fix Reservation Accept/Decline/Reinstate PATCH bodies

**Files:**
- Modify: `assets/js/booking-admin.js:10033-10038` (accept-with-changes seed), `10076-10088` (Accept), `8215-8241` (Decline), `10054-10074` (Reinstate)

- [ ] **Step 1: Fix Accept**

Current:
```javascript
        await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(reservationId)}`,{
          method:'PATCH',
          headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
          body:{ workflow_action:'accept_reservation', status:'awaiting_payment', payment_status:'pending', reason:'Reservation accepted and moved to bookings.' }
        })
```
Replace with:
```javascript
        await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(reservationId)}`,{
          method:'PATCH',
          headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
          body:{ workflow_action:'accept_reservation', status:'finalised', reason:'Reservation accepted and moved to bookings.' }
        })
```
(Dropped `payment_status:'pending'` entirely — `'pending'` isn't a valid payment value anymore, and accepting a reservation shouldn't touch payment at all; it stays whatever it already was, to be set via the Payment Process field afterward.)

- [ ] **Step 2: Fix the accept-with-changes modal seed**

Current:
```javascript
  if(action==='edit'||action==='accept-with-changes'){
    const modalBooking=action==='accept-with-changes'
      ? {...booking,status:'awaiting_payment',payment_status:booking.payment_status||'pending',__statusWorkflow:'accept_reservation'}
      : booking
    openBookingModal(modalBooking)
    return
  }
```
Replace with:
```javascript
  if(action==='edit'||action==='accept-with-changes'){
    const modalBooking=action==='accept-with-changes'
      ? {...booking,status:'finalised',__statusWorkflow:'accept_reservation'}
      : booking
    openBookingModal(modalBooking)
    return
  }
```
(The modal now seeds the Status field with `'finalised'` and leaves `payment_status` exactly as the booking's real value — no more forcing it to `'pending'` or defaulting to `booking.payment_status||'pending'`.)

- [ ] **Step 3: Fix Decline — add the missing `workflow_action` and fix `payment_status`**

Current:
```javascript
      await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(state.selectedBookingId)}`,{
        method:'PATCH',
        headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
        body:{ status:'cancelled', payment_status:'cancelled', reason:values.reason, notes:values.reason }
      })
```
Replace with:
```javascript
      await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(state.selectedBookingId)}`,{
        method:'PATCH',
        headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
        body:{ workflow_action:'cancel_booking', status:'cancelled', payment_status:'', reason:values.reason, notes:values.reason }
      })
```
(This was a real, standing bug: without `workflow_action:'cancel_booking'`, the backend's `updateBooking` authorization gate has no matching workflow flag for this request — `isCancellationWorkflow` specifically requires `workflowAction==='cancel_booking'` — so every "Decline reservation" click was throwing "Booking status is controlled by SkyBook workflows..." Also fixed `payment_status:'cancelled'` → `''`, since `'cancelled'` isn't a valid payment value; blank matches how the regular `archiveBooking`/cancel flow already clears payment.)

- [ ] **Step 4: Fix Reinstate (reservation-stage, undo-decline)**

Current:
```javascript
        await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(bookingId)}`,{
          method:'PATCH',
          headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
          body:{status:'pending',payment_status:'pending',reason:values.reason,workflow_action:'reinstate'}
        })
```
Replace with:
```javascript
        await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(bookingId)}`,{
          method:'PATCH',
          headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
          body:{status:'provisional',payment_status:'',reason:values.reason,workflow_action:'reinstate'}
        })
```
(`'pending'` isn't a valid status or payment value anymore. Reinstating a declined reservation puts it back to `'provisional'` — awaiting review again — matching the backend's `isReinstateWorkflow`, which already accepts `cancelled→provisional` as one of its two valid targets, per Plan 1 Task 4.)

- [ ] **Step 5: Syntax check**

```bash
node --check assets/js/booking-admin.js
```

- [ ] **Step 6: Manual trace of all 3 actions against the backend's actual gates (from Plan 1, already merged)**

1. **Accept**: `workflow_action:'accept_reservation'`, `status:'finalised'`. Backend's `isReservationAcceptanceWorkflow` requires `existing.status==='provisional' && nextStatus==='finalised'` — matches. ✓
2. **Decline**: `workflow_action:'cancel_booking'`, `status:'cancelled'`, `reason` present. Backend's `isCancellationWorkflow` requires exactly `workflowAction==='cancel_booking' && nextStatus==='cancelled' && Boolean(reason)` — matches (this is the fix that makes Decline work at all). ✓
3. **Reinstate**: `workflow_action:'reinstate'`, `status:'provisional'`, `reason` present, called on a `cancelled` booking. Backend's `isReinstateWorkflow` requires `existing.status==='cancelled' && ['finalised','provisional'].includes(nextStatus) && reason` — matches. ✓

- [ ] **Step 7: Commit**

```bash
git add assets/js/booking-admin.js
git commit -m "Fix Reservation Accept/Decline/Reinstate to match the backend's 4-status workflows"
```

---

### Task 6: Fix `confirm-booking` inline action and no-show modal

**Files:**
- Modify: `assets/js/booking-admin.js:10248-10258` (confirm-booking), `8356-8393` (no-show)

- [ ] **Step 1: Fix confirm-booking**

Current:
```javascript
  if(inlineAction==='confirm-booking'){
    const booking=state.bookings.find(b=>b.id===state.selectedBookingId)
    if(!booking){setAdminStatus('No booking selected.',true);return}
    if(!canConfirmBooking(booking)){setAdminStatus('Complete guest name, tour, brand, and date before confirming.',true);return}
    const confirmPaymentStatus=['invoice','invoiced','partially_paid','fully_paid'].includes(normalizeText(booking.payment_status||''))?booking.payment_status:'to_pay'
    runDetailButtonAction(()=>bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(state.selectedBookingId)}`,{
      method:'PATCH',
      headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
      body:{status:'confirmed',payment_status:confirmPaymentStatus,workflow_action:'confirm_booking'}
    }).then(()=>createActivityNote(state.selectedBookingId,'Booking confirmed.')).then(()=>refreshAdmin('Booking confirmed.')),'Confirmation failed.','Confirming booking')
    return
  }
```
Replace with:
```javascript
  if(inlineAction==='confirm-booking'){
    const booking=state.bookings.find(b=>b.id===state.selectedBookingId)
    if(!booking){setAdminStatus('No booking selected.',true);return}
    if(!canConfirmBooking(booking)){setAdminStatus('Complete guest name, tour, brand, and date before confirming.',true);return}
    runDetailButtonAction(()=>bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(state.selectedBookingId)}`,{
      method:'PATCH',
      headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
      body:{status:'finalised',workflow_action:'confirm_booking'}
    }).then(()=>createActivityNote(state.selectedBookingId,'Booking confirmed.')).then(()=>refreshAdmin('Booking confirmed.')),'Confirmation failed.','Confirming booking')
    return
  }
```
(`'confirmed'` is retired; this action now finalises the booking directly, matching the backend's `isConfirmBookingWorkflow` which already targets `provisional→finalised` per Plan 1. Dropped the `confirmPaymentStatus` computation and `payment_status` from the payload entirely — this action only changes lifecycle status, payment is untouched, exactly like the Reservation Accept flow now does.)

- [ ] **Step 2: Fix the no-show modal**

Current:
```javascript
    onSubmit:async values=>{
      await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(booking.id)}`,{
        method:'PATCH',
        headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
        body:{
          workflow_action:'no_show',
          status:'no_show',
          reason:values.reason,
          notes:values.reason,
          metadata:{
            ...normalizeJsonRecord(booking.metadata),
            no_show:{
              reason:values.reason,
              recorded_at:new Date().toISOString()
            }
          }
        }
      })
      await refreshAdmin('Booking marked as no-show.')
    }
```
Replace with:
```javascript
    onSubmit:async values=>{
      await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(booking.id)}`,{
        method:'PATCH',
        headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
        body:{
          workflow_action:'no_show',
          status:'cancelled',
          reason:values.reason,
          notes:values.reason,
          metadata:{
            ...normalizeJsonRecord(booking.metadata),
            no_show:{
              reason:values.reason,
              recorded_at:new Date().toISOString()
            }
          }
        }
      })
      await refreshAdmin('Booking marked as no-show.')
    }
```
(Only `status:'no_show'` → `status:'cancelled'` changes — `workflow_action:'no_show'` stays the same string, since that's what the backend's `isNoShowWorkflow` matches on (`workflowAction==='no_show' && nextStatus==='cancelled'`, per Plan 1). The reason field was already required, and the `metadata.no_show` record-keeping block is untouched — a no-show is now a cancellation with a distinguishing metadata marker, matching the design's explicit decision.)

- [ ] **Step 3: Syntax check**

```bash
node --check assets/js/booking-admin.js
```

- [ ] **Step 4: Commit**

```bash
git add assets/js/booking-admin.js
git commit -m "Fix confirm-booking and no-show actions to match the backend's 4-status workflows"
```

---

### Task 7: Fix cruise-liner booking creation

**Files:**
- Modify: `assets/js/booking-admin.js:5242-5243`

- [ ] **Step 1: Replace the hardcoded status/payment**

Current:
```javascript
      status:'confirmed',
      payment_status:'invoice',
```
Replace with:
```javascript
      status:'finalised',
      payment_status:'',
```

- [ ] **Step 2: Syntax check and commit**

```bash
node --check assets/js/booking-admin.js
git add assets/js/booking-admin.js
git commit -m "Cruise-liner bookings: create as finalised/unpaid instead of confirmed/invoice"
```

---

### Task 8: Simplify badge helpers (`getStatusBadgeClass`, `getStatusRowClass`, `PAYMENT_STATUS_LABELS`)

**Files:**
- Modify: `assets/js/booking-admin.js:1543-1591`

- [ ] **Step 1: Replace `getStatusBadgeClass`**

Current:
```javascript
const getStatusBadgeClass=value=>{
  const normalized=String(value||'').toLowerCase()
  if(normalized==='awaiting_details')return 'is-awaiting-details'
  if(normalized==='to_pay')return 'is-to-pay'
  if(normalized==='provisional')return 'is-provisional'
  if(normalized==='confirmed')return 'is-confirmed'
  if(normalized==='invoice')return 'is-invoice'
  if(normalized==='invoiced')return 'is-invoiced'
  if(normalized==='partially_paid')return 'is-partially-paid'
  if(normalized==='fully_paid'||normalized==='paid')return 'is-fully-paid'
  if(normalized==='finalised')return 'is-confirmed'
  if(normalized==='foc')return 'is-foc'
  if(['cancelled','failed','refunded','no_show','inactive','blocked','critical','error'].includes(normalized))return 'is-bad'
  if(['draft','pending','awaiting_payment'].includes(normalized))return 'is-neutral'
  if(['active','default','issued','open','generated','processing','available','private','sent','info'].includes(normalized))return 'is-info'
  return 'is-neutral'
}
```
Replace with:
```javascript
const getStatusBadgeClass=value=>{
  const normalized=String(value||'').toLowerCase()
  if(normalized==='provisional')return 'is-provisional'
  if(normalized==='finalised')return 'is-finalised'
  if(normalized==='refunded')return 'is-refunded'
  if(normalized==='partially_paid')return 'is-partially-paid'
  if(normalized==='fully_paid'||normalized==='paid')return 'is-fully-paid'
  if(['cash','card','eft','voucher'].includes(normalized))return 'is-fully-paid'
  if(normalized==='foc')return 'is-foc'
  if(['cancelled','failed','no_show','inactive','blocked','critical','error'].includes(normalized))return 'is-bad'
  if(['active','default','issued','open','generated','processing','available','private','sent','info'].includes(normalized))return 'is-info'
  return 'is-neutral'
}
```
(Removed the retired-status branches (`awaiting_details`/`to_pay`/`invoice`/`invoiced`/`draft`/`pending`/`awaiting_payment`). `finalised` now gets its own `.is-finalised` class instead of reusing `.is-confirmed` (Task 9 renames the CSS class accordingly — do that task in the same pass as this one, or the badge will render unstyled in between). `refunded` moves out of the generic `.is-bad` bucket into its own `.is-refunded` class, matching the design's explicit decision to keep it distinct from cancelled (Task 9 adds this CSS class). The four method values (`cash`/`card`/`eft`/`voucher`) reuse `.is-fully-paid` — they all mean "settled," and `renderStatusBadge`'s label text (via `formatPaymentStatusLabel`, updated in Step 2 below) already shows which specific method it was, so a shared color is enough visual grouping.)

- [ ] **Step 2: Replace `getStatusRowClass`**

Current:
```javascript
const isCruiseLinerBooking=booking=>Boolean(booking?.metadata?.cruise_liner)
const getStatusRowClass=booking=>{
  if(isCruiseLinerBooking(booking))return 'is-cruise-liner'
  const status=normalizeText(booking?.status||'')
  const payment=normalizeText(booking?.payment_status||'')
  if(['cancelled','refunded','failed','no_show'].includes(status))return 'status-cancelled'
  if(status==='awaiting_details')return 'status-awaiting-details'
  if(status==='provisional')return 'status-provisional'
  if(status==='confirmed'||status==='finalised'){
    // Colour reflects payment progress.
    if(payment==='paid'||payment==='fully_paid')return 'status-confirmed-fully-paid'
    if(payment==='partially_paid')return 'status-confirmed-partially-paid'
    if(payment==='to_pay')return 'status-confirmed-to-pay'
    return 'status-confirmed'
  }
  return ''
}
```
Replace with:
```javascript
const isCruiseLinerBooking=booking=>Boolean(booking?.metadata?.cruise_liner)
const getStatusRowClass=booking=>{
  if(isCruiseLinerBooking(booking))return 'is-cruise-liner'
  const status=normalizeText(booking?.status||'')
  if(['cancelled','failed','no_show'].includes(status))return 'status-cancelled'
  if(status==='refunded')return 'status-refunded'
  if(status==='provisional')return 'status-provisional'
  if(status==='finalised')return 'status-finalised'
  return ''
}
```
(Row coloring no longer branches on payment progress — under the new model a `finalised` row is just `finalised`; how it was paid shows via the payment badge, not a separate row tint. `refunded` gets its own row class instead of being folded into `status-cancelled`. Task 9 provides the matching CSS.)

- [ ] **Step 3: Update `PAYMENT_STATUS_LABELS`**

Current:
```javascript
// Payment-status badges read on their own (e.g. "Invoice", "Invoiced") — never prefixed with
// "Payment ", which produced labels like "Payment invoice".
const PAYMENT_STATUS_LABELS={invoice:'Invoice',invoiced:'Invoiced',partially_paid:'Partially Paid',fully_paid:'Fully Paid',to_pay:'To Pay',foc:'FOC',paid:'Paid',pending:'Pending',unpaid:'Unpaid',refunded:'Refunded',cancelled:'Cancelled',failed:'Failed',payment_pending:'Payment Pending'}
const formatPaymentStatusLabel=status=>{
  const key=normalizeText(status)
  if(!key)return '—'
  return PAYMENT_STATUS_LABELS[key]||key.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())
}
```
Replace with:
```javascript
// Payment-status badges read on their own (e.g. "Cash", "Partially Paid") — never prefixed with
// "Payment ", which produced labels like "Payment cash".
const PAYMENT_STATUS_LABELS={partially_paid:'Partially Paid',fully_paid:'Fully Paid',foc:'FOC',paid:'Paid',refunded:'Refunded',cancelled:'Cancelled',failed:'Failed'}
const formatPaymentStatusLabel=status=>{
  const key=normalizeText(status)
  if(!key)return '—'
  if(['cash','card','eft','voucher'].includes(key))return getPaymentMethodLabel(key)
  return PAYMENT_STATUS_LABELS[key]||key.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())
}
```
(Removed retired entries (`invoice`/`invoiced`/`to_pay`/`pending`/`unpaid`/`payment_pending`). Added an explicit branch reusing `getPaymentMethodLabel` (already defined later in the file, at `booking-admin.js:7439-7448`) for the 4 method values, so a `payment_status:'eft'` badge reads "EFT" rather than the generic title-cased fallback "Eft".)

**Note:** `getPaymentMethodLabel` is defined at `booking-admin.js:7439`, AFTER `formatPaymentStatusLabel` (defined around line 1587) in file order. Since both are `const` arrow functions and JS module-level `const` declarations aren't hoisted for use, but this file's functions are only ever *called* later at runtime (during rendering, well after the whole script has parsed and all top-level `const`s are assigned) — not called at module-evaluation time — this ordering is safe. If you want to double check, grep for `getPaymentMethodLabel` to confirm it's never called during initial script evaluation (only inside event handlers / render functions).

- [ ] **Step 4: Syntax check**

```bash
node --check assets/js/booking-admin.js
```

- [ ] **Step 5: Manual trace**

1. `getStatusBadgeClass('finalised')` → `'is-finalised'`. `getStatusBadgeClass('refunded')` → `'is-refunded'`. `getStatusBadgeClass('cash')` → `'is-fully-paid'`.
2. `getStatusRowClass({status:'finalised'})` → `'status-finalised'`. `getStatusRowClass({status:'refunded'})` → `'status-refunded'`.
3. `formatPaymentStatusLabel('eft')` → calls `getPaymentMethodLabel('eft')` → `'EFT'`. `formatPaymentStatusLabel('partially_paid')` → `'Partially Paid'` (from the label map, unchanged). `formatPaymentStatusLabel('')` → `'—'`.

- [ ] **Step 6: Commit**

```bash
git add assets/js/booking-admin.js
git commit -m "Simplify badge helpers to the 4-status/method model"
```

---

### Task 9: Update CSS — rename/add classes for the new model, remove dead ones

**Files:**
- Modify: `assets/css/booking.css`

There are two near-duplicate badge-class blocks in this file (a base block and a second block) — both need the same treatment. Read the file first to find both exact locations before editing (they may have shifted slightly).

- [ ] **Step 1: Rename `.status-badge.is-confirmed` usage → add `.is-finalised`, add `.is-refunded`**

Find `.status-badge.is-confirmed{...}` (appears twice — base block and duplicate block). In BOTH places, add a new rule right after it reusing the exact same styling, renamed for `finalised`:
```css
.status-badge.is-confirmed{ /* ...existing declarations, unchanged... */ }
.status-badge.is-finalised{ /* copy the exact same declarations as .is-confirmed above */ }
```
(Keep `.is-confirmed` itself in place too — do not delete it — since `getStatusBadgeClass` no longer emits `'is-confirmed'` for anything after Task 8, but leaving the rule costs nothing and avoids a risky simultaneous rename-and-delete. This task ADDS `.is-finalised` as a genuine duplicate of `.is-confirmed`'s styling, it does not rename in place.)

Find `.status-badge.is-bad{...}` (the class `refunded` used to map to). In BOTH places, add a new rule right after it with a visually distinct but still "notable" tone (not full alarm-red like cancelled/failed — pick a neutral-but-clear color, e.g. a muted violet or blue-gray, distinct from the existing `.is-bad` red and `.is-fully-paid` blue):
```css
.status-badge.is-bad{ /* ...existing declarations, unchanged... */ }
.status-badge.is-refunded{background:#ede9fe;color:#5b21b6;border-color:#c4b5fd}
```
(Read the existing `.status-badge.is-*` rules' declaration style first — background/color/border-color trio — and match that exact pattern/format for consistency; the hex values above are a starting suggestion, adjust to fit the file's existing palette if there's already a similar violet/muted tone used elsewhere for "informational, not urgent" states.)

- [ ] **Step 2: Remove dead badge classes (both blocks)**

Delete these rules wherever they appear (base block and duplicate block — 2 occurrences of each):
```css
.status-badge.is-invoice{...}
.status-badge.is-invoiced{...}
.status-badge.is-awaiting-details{...}
.status-badge.is-to-pay{...}
```
Keep `.status-badge.is-partially-paid{...}` and `.status-badge.is-fully-paid{...}` — both still reachable (partially_paid from the Payments tab; fully-paid reused by the 4 method values per Task 8).

- [ ] **Step 3: Update row classes**

Find `.booking-row.status-confirmed{...}` and its `td:first-child`/`td:last-child` companion rules. Add matching new rules for `.booking-row.status-finalised` with identical declarations (same approach as Step 1 — additive, don't delete `.status-confirmed`).

Find `.booking-row.status-cancelled{...}` and its companions. Add matching new rules for `.booking-row.status-refunded` — reuse the same violet tone chosen in Step 1 rather than the red used for cancelled, so a refunded row doesn't look identical to a cancelled one in the list.

Delete these now-dead row rules:
```css
.booking-row.status-awaiting-details{...} /* + its td:first-child/td:last-child companions */
.booking-row.status-confirmed-partially-paid{...} /* + companions */
.booking-row.status-confirmed-to-pay{...} /* + companions */
.booking-row.status-confirmed-fully-paid{...} /* + companions */
```

- [ ] **Step 4: Update calendar variant classes**

For each of `.cal-day-block`, `.calendar-mini-card`, `.calendar-entry-card`: find the `.status-confirmed` and `.status-cancelled` variant rules, add matching `.status-finalised` (copy `.status-confirmed`'s declarations) and `.status-refunded` (new violet tone) variants. Delete the `.status-awaiting-details`, `.status-confirmed-partially-paid`, `.status-confirmed-to-pay`, `.status-confirmed-fully-paid` variants for all three selectors (12 rules total: 3 selectors × 4 dead variants).

- [ ] **Step 5: Update filter pill classes**

Find `.status-pill-filter`'s child option classes. Delete: `.status-pill-awaiting-details`, `.status-pill-payment-pending`, `.status-pill-invoice`, `.status-pill-invoiced`, `.status-pill-partially-paid`, `.status-pill-fully-paid`. Confirm `.status-pill-provisional`, `.status-pill-confirmed`, `.status-pill-cancelled`, `.status-pill-finalised` remain (Task 10 updates the HTML checkboxes that use these classes — if `.status-pill-confirmed` is no longer referenced by any checkbox after Task 10, it's fine to leave the CSS rule as harmless unused style; don't delete it speculatively here, let Task 10's own HTML changes determine what's actually dead).

- [ ] **Step 6: Handle `.to-pay-tag`**

Before touching this, run:
```bash
grep -n "renderToPayTag\|to-pay-tag" assets/js/booking-admin.js booking-admin.html
```
This tag is emitted by a JS function (`renderToPayTag`, referenced in the design research around `booking-admin.js:3794`) that currently checks `payment_status==='to_pay'` — a retired value nothing will ever produce again after this plan lands. Read `renderToPayTag`'s current definition: if it's a simple function only ever checking `payment_status==='to_pay'`, either (a) leave the CSS class alone but note the JS function is now dead code for a follow-up, or (b) if this task's time budget allows, also fix `renderToPayTag` itself to check for an empty/blank `payment_status` with an outstanding balance instead (mirroring `buildLifecycleTaskBlueprints`'s equivalent fix in the backend, Plan 1 Task 5). Prefer option (b) if the function is small and self-contained; otherwise flag it in your task report as a follow-up and leave the CSS class in place (harmless if unused).

- [ ] **Step 7: Verify no syntax errors**

CSS doesn't have a `node --check` equivalent; instead, do a basic brace-balance check:
```bash
python3 -c "
content = open('assets/css/booking.css', encoding='utf-8').read()
print('braces', content.count('{'), content.count('}'), content.count('{')-content.count('}'))
"
```
Expected: `0` difference.

- [ ] **Step 8: Commit**

```bash
git add assets/css/booking.css
git commit -m "Add finalised/refunded CSS classes, remove dead legacy-status/payment classes"
```

---

### Task 10: Update the quick filter bar, advanced status checkboxes, and remove the separate payment filter dropdown

**Files:**
- Modify: `booking-admin.html:629-639` (pills), `668-686` (advanced panel), `assets/js/booking-admin.js:2116-2157` (`bookingMatchesQuickFilter`/`updateBookingQuickFilterBar`)

- [ ] **Step 1: Update the quick filter pill buttons**

Current (`booking-admin.html:629-639`):
```html
              <div class="booking-quick-filter-bar" aria-label="Booking quick filters">
                <button type="button" class="booking-quick-filter is-active" data-booking-quick-filter="today">Today <span data-filter-count="today">0</span></button>
                <button type="button" class="booking-quick-filter" data-booking-quick-filter="">All <span data-filter-count="all">0</span></button>
                <button type="button" class="booking-quick-filter" data-booking-quick-filter="awaiting_details">Awaiting Details <span data-filter-count="awaiting_details">0</span></button>
                <button type="button" class="booking-quick-filter" data-booking-quick-filter="provisional">Provisional <span data-filter-count="provisional">0</span></button>
                <button type="button" class="booking-quick-filter" data-booking-quick-filter="confirmed">Confirmed <span data-filter-count="confirmed">0</span></button>
                <button type="button" class="booking-quick-filter" data-booking-quick-filter="to_pay">To Pay <span data-filter-count="to_pay">0</span></button>
                <button type="button" class="booking-quick-filter" data-booking-quick-filter="partially_paid">Part Paid <span data-filter-count="partially_paid">0</span></button>
                <button type="button" class="booking-quick-filter" data-booking-quick-filter="fully_paid">Paid <span data-filter-count="fully_paid">0</span></button>
                <button type="button" class="booking-quick-filter" data-booking-quick-filter="cancelled">Cancelled <span data-filter-count="cancelled">0</span></button>
                <button type="button" class="booking-quick-filter is-reset" data-booking-filter-reset>Reset</button>
              </div>
```
Replace with:
```html
              <div class="booking-quick-filter-bar" aria-label="Booking quick filters">
                <button type="button" class="booking-quick-filter is-active" data-booking-quick-filter="today">Today <span data-filter-count="today">0</span></button>
                <button type="button" class="booking-quick-filter" data-booking-quick-filter="">All <span data-filter-count="all">0</span></button>
                <button type="button" class="booking-quick-filter" data-booking-quick-filter="finalised">Finalised <span data-filter-count="finalised">0</span></button>
                <button type="button" class="booking-quick-filter" data-booking-quick-filter="cancelled">Cancelled <span data-filter-count="cancelled">0</span></button>
                <button type="button" class="booking-quick-filter" data-booking-quick-filter="refunded">Refunded <span data-filter-count="refunded">0</span></button>
                <button type="button" class="booking-quick-filter is-reset" data-booking-filter-reset>Reset</button>
              </div>
```
(`awaiting_details`/`provisional`/`confirmed` pills removed — provisional bookings belong to Reservation Management, not this list, per `isReviewReservation`'s fixed routing in Task 1; nothing is ever `confirmed`/`awaiting_details` anymore. `to_pay`/`partially_paid`/`fully_paid` payment pills removed — payment is now shown via badges, not a separate lifecycle-style filter pill; `refunded` added as a new pill since it's a real, distinct status admins will want to filter for.)

- [ ] **Step 2: Update the advanced-panel status checkboxes**

Current (`booking-admin.html:668-675`):
```html
                    <label>Status <span class="filter-status-hint" id="filterStatusHint"></span></label>
                    <div class="status-pill-filter" id="bookingFilterStatus">
                      <label class="status-pill-option"><input type="checkbox" value="awaiting_details"><span class="status-pill-label status-pill-awaiting-details">Awaiting Details</span></label>
                      <label class="status-pill-option"><input type="checkbox" value="provisional"><span class="status-pill-label status-pill-provisional">Provisional</span></label>
                      <label class="status-pill-option"><input type="checkbox" value="confirmed"><span class="status-pill-label status-pill-confirmed">Confirmed</span></label>
                      <label class="status-pill-option"><input type="checkbox" value="cancelled"><span class="status-pill-label status-pill-cancelled">Cancelled</span></label>
                    </div>
```
Replace with:
```html
                    <label>Status <span class="filter-status-hint" id="filterStatusHint"></span></label>
                    <div class="status-pill-filter" id="bookingFilterStatus">
                      <label class="status-pill-option"><input type="checkbox" value="finalised"><span class="status-pill-label status-pill-finalised">Finalised</span></label>
                      <label class="status-pill-option"><input type="checkbox" value="cancelled"><span class="status-pill-label status-pill-cancelled">Cancelled</span></label>
                      <label class="status-pill-option"><input type="checkbox" value="refunded"><span class="status-pill-label status-pill-refunded">Refunded</span></label>
                    </div>
```
(Note: `.status-pill-refunded` CSS class doesn't exist yet in the base stylesheet — if Task 9 didn't add it, add a small rule for it now alongside the other `.status-pill-*` label classes, matching their existing declaration style.)

- [ ] **Step 3: Remove the separate payment-state filter dropdown entirely**

Current (`booking-admin.html:676-686`):
```html
                  <div class="booking-field">
                    <label for="bookingFilterPaymentStatus">Payment</label>
                    <select id="bookingFilterPaymentStatus">
                      <option value="">All payment states</option>
                      <option value="to_pay">To Pay</option>
                      <option value="invoice">Invoice</option>
                      <option value="invoiced">Invoiced</option>
                      <option value="partially_paid">Partially Paid</option>
                      <option value="fully_paid">Fully Paid</option>
                    </select>
                  </div>
```
Delete this entire block. Before deleting, run:
```bash
grep -n "bookingFilterPaymentStatus" assets/js/booking-admin.js
```
and read every match — there will be a `nodes.bookingFilterPaymentStatus` reference and likely a change-event listener and a read of `.value` somewhere in the filtering logic (e.g. inside `renderBookings`/`getFilteredBookings` or similar). Remove the JS node reference and any code that reads this element's value as part of this same task (search broadly — this element may be referenced in more than one place, including the reservation-stage shortcuts fixed in Task 11 of this plan, which already handles its own reference to `nodes.bookingFilterPaymentStatus`).

- [ ] **Step 4: Update `bookingMatchesQuickFilter`**

Current (`assets/js/booking-admin.js:2116-2132`):
```javascript
const bookingMatchesQuickFilter=(booking,filter=state.bookingQuickFilter)=>{
  const key=normalizeText(filter)
  if(!key)return true
  if(key==='today'){
    const n=new Date()
    const todayStr=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`
    return String(booking?.preferred_date||'').slice(0,10)===todayStr
  }
  const status=normalizeText(booking?.status||'')
  const payment=normalizeText(booking?.payment_status||'')
  if(key==='cancelled')return ['cancelled','refunded','failed','no_show'].includes(status)
  if(key==='provisional')return status==='provisional'
  if(key==='confirmed')return status==='confirmed'
  if(key==='fully_paid'||key==='paid')return status==='confirmed'&&['paid','fully_paid'].includes(payment)
  if(['to_pay','partially_paid','foc'].includes(key))return status==='confirmed'&&payment===key
  return status===key||payment===key
}
```
Replace with:
```javascript
const bookingMatchesQuickFilter=(booking,filter=state.bookingQuickFilter)=>{
  const key=normalizeText(filter)
  if(!key)return true
  if(key==='today'){
    const n=new Date()
    const todayStr=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`
    return String(booking?.preferred_date||'').slice(0,10)===todayStr
  }
  const status=normalizeText(booking?.status||'')
  if(key==='cancelled')return ['cancelled','failed','no_show'].includes(status)
  if(key==='refunded')return status==='refunded'
  if(key==='finalised')return status==='finalised'
  return status===key
}
```
(Dropped the payment-status branches entirely — `'refunded'` is now its own filter key with its own status value, separate from the generic cancelled bucket; `'cancelled'` no longer folds `refunded` in, matching Task 9's decision to visually and now also filter-wise distinguish them.)

- [ ] **Step 5: Update `updateBookingQuickFilterBar`'s countMap**

Current (`assets/js/booking-admin.js:2134-2157`):
```javascript
const updateBookingQuickFilterBar=()=>{
  document.querySelectorAll('[data-booking-quick-filter]').forEach(button=>{
    const key=button.dataset.bookingQuickFilter||''
    button.classList.toggle('is-active',key===state.bookingQuickFilter)
  })
  const operationalBookings=getOperationalBookings()
  const countMap={
    today:operationalBookings.filter(booking=>bookingMatchesQuickFilter(booking,'today')).length,
    all:operationalBookings.length,
    awaiting_details:operationalBookings.filter(booking=>bookingMatchesQuickFilter(booking,'awaiting_details')).length,
    provisional:operationalBookings.filter(booking=>bookingMatchesQuickFilter(booking,'provisional')).length,
    confirmed:operationalBookings.filter(booking=>bookingMatchesQuickFilter(booking,'confirmed')).length,
    to_pay:operationalBookings.filter(booking=>bookingMatchesQuickFilter(booking,'to_pay')).length,
    invoice:operationalBookings.filter(booking=>bookingMatchesQuickFilter(booking,'invoice')).length,
    invoiced:operationalBookings.filter(booking=>bookingMatchesQuickFilter(booking,'invoiced')).length,
    partially_paid:operationalBookings.filter(booking=>bookingMatchesQuickFilter(booking,'partially_paid')).length,
    fully_paid:operationalBookings.filter(booking=>bookingMatchesQuickFilter(booking,'fully_paid')).length,
    cancelled:operationalBookings.filter(booking=>bookingMatchesQuickFilter(booking,'cancelled')).length
  }
  Object.entries(countMap).forEach(([key,count])=>{
    const node=document.querySelector(`[data-filter-count="${key}"]`)
    if(node)node.textContent=String(count)
  })
}
```
Replace with:
```javascript
const updateBookingQuickFilterBar=()=>{
  document.querySelectorAll('[data-booking-quick-filter]').forEach(button=>{
    const key=button.dataset.bookingQuickFilter||''
    button.classList.toggle('is-active',key===state.bookingQuickFilter)
  })
  const operationalBookings=getOperationalBookings()
  const countMap={
    today:operationalBookings.filter(booking=>bookingMatchesQuickFilter(booking,'today')).length,
    all:operationalBookings.length,
    finalised:operationalBookings.filter(booking=>bookingMatchesQuickFilter(booking,'finalised')).length,
    cancelled:operationalBookings.filter(booking=>bookingMatchesQuickFilter(booking,'cancelled')).length,
    refunded:operationalBookings.filter(booking=>bookingMatchesQuickFilter(booking,'refunded')).length
  }
  Object.entries(countMap).forEach(([key,count])=>{
    const node=document.querySelector(`[data-filter-count="${key}"]`)
    if(node)node.textContent=String(count)
  })
}
```

- [ ] **Step 6: Syntax check**

```bash
node --check assets/js/booking-admin.js
```

- [ ] **Step 7: Commit**

```bash
git add booking-admin.html assets/js/booking-admin.js
git commit -m "Simplify quick filters/advanced status checkboxes to the 4-status model, remove payment filter dropdown"
```

---

### Task 11: Fix the reservation pipeline and its stage shortcuts

**Files:**
- Modify: `assets/js/booking-admin.js:2986-2995` (`renderReservationPipeline`), `9662-9673` (stage-click shortcuts)

- [ ] **Step 1: Replace `renderReservationPipeline`**

Current:
```javascript
const renderReservationPipeline=()=>{
  if(!nodes.reservationPipeline)return
  const visible=getVisibleBookings().filter(booking=>!isTrashedBooking(booking))
  const stages=[
    {key:'new',label:'New Reservation',count:visible.filter(booking=>isReviewReservation(booking)).length,tone:'review'},
    {key:'awaiting',label:'Awaiting Payment',count:visible.filter(booking=>normalizeText(booking.status)==='awaiting_payment').length,tone:'warn'},
    {key:'paid',label:'Paid',count:visible.filter(booking=>normalizeText(booking.payment_status)==='paid'&&!['confirmed','completed'].includes(normalizeText(booking.status))).length,tone:'paid'},
    {key:'confirmed',label:'Confirmed',count:visible.filter(booking=>normalizeText(booking.status)==='confirmed').length,tone:'good'},
    {key:'completed',label:'Completed',count:visible.filter(booking=>normalizeText(booking.status)==='completed').length,tone:'done'}
  ]
```
Replace with:
```javascript
const renderReservationPipeline=()=>{
  if(!nodes.reservationPipeline)return
  const visible=getVisibleBookings().filter(booking=>!isTrashedBooking(booking))
  const stages=[
    {key:'new',label:'New Reservation',count:visible.filter(booking=>isReviewReservation(booking)).length,tone:'review'},
    {key:'unpaid',label:'Unpaid',count:visible.filter(booking=>normalizeText(booking.status)==='finalised'&&!normalizeText(booking.payment_status)).length,tone:'warn'},
    {key:'paid',label:'Paid',count:visible.filter(booking=>normalizeText(booking.status)==='finalised'&&Boolean(normalizeText(booking.payment_status))).length,tone:'paid'},
    {key:'finalised',label:'Finalised',count:visible.filter(booking=>normalizeText(booking.status)==='finalised').length,tone:'good'}
  ]
```
(Read the rest of this function — the part building the actual DOM for each stage tile — after this array; it should just iterate `stages` generically and shouldn't need further changes, but check for any hardcoded reference to the removed `'awaiting'`/`'confirmed'`/`'completed'` keys elsewhere in the same function before finishing this step. The new 4-stage model: **New** (needs review) → **Unpaid**/**Paid** (both `finalised`, split by whether a payment method is recorded) → **Finalised** (the total count, replacing the old separate "Confirmed"/"Completed" split which no longer exists as separate statuses).)

- [ ] **Step 2: Replace the stage-click shortcuts**

Current:
```javascript
nodes.reservationPipeline?.addEventListener('click',event=>{
  const stage=event.target.closest('[data-pipeline-stage]')?.dataset.pipelineStage
  if(!stage)return
  if(stage==='new')switchTab('reservations')
  else switchTab('bookings')
  if(stage==='reviewed')setStatusFilterValues(['invoice','invoiced'])
  if(stage==='awaiting')setStatusFilterValues(['invoice'])
  if(stage==='confirmed')setStatusFilterValues(['fully_paid'])
  if(stage==='completed')setStatusFilterValues(['fully_paid'])
  if(stage==='paid'&&nodes.bookingFilterPaymentStatus)nodes.bookingFilterPaymentStatus.value='paid'
  renderBookings()
})
```
Replace with:
```javascript
nodes.reservationPipeline?.addEventListener('click',event=>{
  const stage=event.target.closest('[data-pipeline-stage]')?.dataset.pipelineStage
  if(!stage)return
  if(stage==='new')switchTab('reservations')
  else switchTab('bookings')
  if(stage==='unpaid'||stage==='paid'||stage==='finalised')setStatusFilterValues(['finalised'])
  renderBookings()
})
```
(The old shortcuts set filter values for statuses/payment-dropdown values that no longer exist — `'invoice'`/`'invoiced'`/`'fully_paid'` as status filter values, and `nodes.bookingFilterPaymentStatus` which Task 10 removed entirely. All three remaining non-"new" stages now just filter the advanced-panel Status checkboxes (Task 10) to `finalised` — since "Unpaid"/"Paid"/"Finalised" are all sub-views of the same `finalised` bucket, there's no separate payment-state filter to also set anymore; the resulting list is the same either way, and an admin distinguishes unpaid-vs-paid visually via the payment badge on each row.)

- [ ] **Step 3: Syntax check**

```bash
node --check assets/js/booking-admin.js
```

- [ ] **Step 4: Commit**

```bash
git add assets/js/booking-admin.js
git commit -m "Fix reservation pipeline stages and shortcuts for the 4-status model"
```

---

### Task 12: Fix dashboard tiles/counters and chart color maps

**Files:**
- Modify: `assets/js/booking-admin.js:1855, 2098, 2112-2113, 2184, 2194, 3025-3027, 3056, 3059, 3067, 3384-3395, 3794, 6163, 6259-6296, 6261, 7468, 7601-7607, 7800, 7808`

This is a wide sweep of individually small fixes across the dashboard/finance/reporting code. Do NOT attempt to rewrite these areas from scratch — each one is a narrow, targeted update. Read each location's surrounding ~10 lines before editing, since some of these line numbers may have drifted from earlier tasks in this same plan touching the same file.

- [ ] **Step 1: Fix `pendingConfirmations`/`unpaidBookings` (booking-admin.js:3025-3027 area)**

Current:
```javascript
  const pendingConfirmations=dashboardBookings.filter(item=>item.status==='pending')
  const unpaidBookings=dashboardBookings.filter(item=>['invoice','invoiced','partially_paid'].includes(String(item.payment_status||'')) || Number(item.amount_due_later||0)>0)
```
Replace with:
```javascript
  const pendingConfirmations=dashboardBookings.filter(item=>isReviewReservation(item))
  const unpaidBookings=dashboardBookings.filter(item=>(item.status==='finalised' && !String(item.payment_status||'')) || Number(item.amount_due_later||0)>0)
```
(`'pending'` is retired — "pending confirmations" now means reservations awaiting review, reusing the already-fixed `isReviewReservation` from Task 1. `unpaidBookings` now checks for a `finalised` booking with a blank `payment_status`, instead of the retired `invoice`/`invoiced`/`partially_paid` list — note `partially_paid` is deliberately dropped from this specific check since a booking with `partially_paid` already has `amount_due_later>0` captured by the second half of the `||` condition, so it's still counted, just via the amount rather than the string.)

The two tile labels a few lines below (**3056**, **3059**, **3067**) reference these same variables and don't need their own text changes — just confirm they still read sensibly with the new semantics (e.g. "Pending confirmations" / "Bookings waiting for ops review" now correctly describes reservations awaiting review rather than a retired `'pending'` status).

- [ ] **Step 2: Fix `getStatusColor` (booking-admin.js:3384-3395 area)**

Current:
```javascript
const getStatusColor=(status,isCruise=false,paymentStatus='')=>{
  if(isCruise)return '#7c3aed'
  if(normalizeText(status)==='provisional')return '#ca8a04'
  if(['cancelled','refunded','failed','no_show'].includes(normalizeText(status)))return '#9ca3af'
  // confirmed — color by payment status background
  const pm=normalizeText(paymentStatus||status)
  if(pm==='invoice')return '#7c3aed'
  if(pm==='invoiced')return '#16a34a'
  if(pm==='partially_paid')return '#15803d'
  if(pm==='fully_paid')return '#2563eb'
  return '#1e293b'
}
```
Replace with:
```javascript
const getStatusColor=(status,isCruise=false,paymentStatus='')=>{
  if(isCruise)return '#7c3aed'
  if(normalizeText(status)==='provisional')return '#ca8a04'
  if(normalizeText(status)==='refunded')return '#5b21b6'
  if(['cancelled','failed','no_show'].includes(normalizeText(status)))return '#9ca3af'
  // finalised — color by payment progress
  const pm=normalizeText(paymentStatus)
  if(['cash','card','eft','voucher','paid','fully_paid'].includes(pm))return '#2563eb'
  if(pm==='partially_paid')return '#15803d'
  return '#1e293b'
}
```
(`refunded` split out of the generic gray cancelled-bucket into its own violet tone, matching Task 9's badge/row treatment. The payment-progress branch now checks the 4 method values plus the still-live legacy `paid`/`fully_paid`/`partially_paid` instead of retired `invoice`/`invoiced`.)

- [ ] **Step 3: Fix `statusColour` (booking-admin.js:7601-7607 area, arrivals print view)**

Current:
```javascript
  const statusColour=status=>{
    const s=normalizeText(status)
    if(s==='provisional')return '#ca8a04'
    if(s==='confirmed')return '#1e293b'
    if(['cancelled','refunded','failed','no_show'].includes(s))return '#9ca3af'
    return '#94a3b8'
  }
```
Replace with:
```javascript
  const statusColour=status=>{
    const s=normalizeText(status)
    if(s==='provisional')return '#ca8a04'
    if(s==='finalised')return '#1e293b'
    if(s==='refunded')return '#5b21b6'
    if(['cancelled','failed','no_show'].includes(s))return '#9ca3af'
    return '#94a3b8'
  }
```

- [ ] **Step 4: Fix the no-show counter (booking-admin.js:1855 area)**

Current:
```javascript
noShows:bookings.filter(booking=>normalizeText(booking.status)==='no_show').length
```
Replace with:
```javascript
noShows:bookings.filter(booking=>normalizeText(booking.status)==='cancelled'&&Boolean(booking.metadata?.no_show)).length
```
(`'no_show'` is a retired status — Task 6 already changed the no-show workflow to set `status:'cancelled'` with a `metadata.no_show` marker. This counter now recognizes that marker instead of a status value that will never occur again.)

- [ ] **Step 5: Sweep the remaining `['paid','partially_paid']`-style checks (booking-admin.js:6163, 6259-6296, 6261, 7468, 7800, 7808)**

For each location, read the surrounding code first. These are finance/report calculations checking whether a booking counts as "paid" for revenue/reconciliation purposes. Apply the same treatment as Plan 1's backend fix (Task 17, already merged) — extend each `['paid','partially_paid'].includes(...)`-style check (or bare `==='paid'`) to also recognize the 4 method values as "paid," WITHOUT changing how `'partially_paid'` itself is handled (it stays a distinct, real state from the Payments tab). For example, a pattern like:
```javascript
if(['paid','partially_paid'].includes(normalizeText(booking.payment_status)))
```
becomes:
```javascript
if(['paid','partially_paid','cash','card','eft','voucher'].includes(normalizeText(booking.payment_status)))
```
Apply this pattern-matching treatment individually at each of the 6 listed locations — do not attempt a single global find-replace, since the exact surrounding logic differs at each site (some are `.filter()` predicates, some are ternaries, some may already partially handle this). If any location doesn't match this simple pattern (e.g. it's structured differently), read it carefully and make the smallest correct change that achieves the same "recognize method values as paid" outcome — if you're not sure, report BLOCKED/NEEDS_CONTEXT for that specific location rather than guess.

- [ ] **Step 6: Handle `renderToPayTag` (booking-admin.js:3794 area)**

Current (approximately — verify by reading):
```javascript
... payment_status==='to_pay' ...
```
Since `'to_pay'` is fully retired, decide based on what you find: if this function's sole purpose is showing a small "To Pay" tag when a booking is unpaid, change its condition to check for a blank `payment_status` on a `finalised` booking instead (mirroring Step 1's `unpaidBookings` fix). If Task 9 already handled this (check its own Step 6), confirm consistency instead of re-doing it — do not implement this twice.

- [ ] **Step 7: Syntax check**

```bash
node --check assets/js/booking-admin.js
```

- [ ] **Step 8: Manual trace**

1. A `finalised` booking with `payment_status:''` and `amount_due_later=0`: `unpaidBookings` includes it (first condition: `finalised` + blank payment). `getStatusColor('finalised', false, '')` → falls through to `'#1e293b'` (no method matched, no partially_paid — the neutral finalised tone).
2. A `finalised` booking with `payment_status:'eft'`: `getStatusColor('finalised', false, 'eft')` → `'#2563eb'` (blue, matches the method-values branch).
3. A `cancelled` booking with `metadata.no_show={reason:'...'}`: counted in `noShows`. A plain `cancelled` booking with no `no_show` metadata: not counted (a real decline/cancellation, not a no-show).

- [ ] **Step 9: Commit**

```bash
git add assets/js/booking-admin.js
git commit -m "Fix dashboard tiles, chart colors, and finance report checks for the 4-status/method model"
```

---

### Task 13: Remove the orphaned automation settings UI

**Files:**
- Modify: `booking-admin.html:1368-1376`, `assets/js/booking-admin.js` (node refs ~553-555, state defaults ~85-94, render ~6133-6135, `buildAutomationRulesPayload` ~6140-6149)

Plan 1's backend work (Task 7, already merged) removed `runStatusAutomations` entirely — the two automations these checkboxes controlled (`autoConfirmPaidBookings`, `autoCompletePastConfirmedBookings`) no longer do anything. This task removes the now-meaningless UI.

- [ ] **Step 1: Remove the two checkboxes from the HTML**

Current:
```html
              <label class="booking-field-full inline-check">
                <input id="automationAutoConfirmPaid" type="checkbox">
                <span>Auto confirm bookings when payment is marked paid.</span>
              </label>
              <label class="booking-field-full inline-check">
                <input id="automationAutoCompletePast" type="checkbox">
                <span>Auto complete confirmed bookings after their service date.</span>
              </label>
```
Delete both `<label>` blocks entirely. Leave the `awaitingPaymentExpiryHours` field and the submit button in the same form untouched (that field feeds `autoCancelExpiredAwaitingPayment`, a different, still-referenced-but-separately-scoped setting not part of this fix).

- [ ] **Step 2: Remove the node references**

Current:
```javascript
  automationAutoConfirmPaid:document.getElementById('automationAutoConfirmPaid'),
  automationAutoCompletePast:document.getElementById('automationAutoCompletePast'),
```
Delete both lines.

- [ ] **Step 3: Remove from the render function**

Current:
```javascript
  nodes.automationAutoConfirmPaid.checked=Boolean(state.automationRules.autoConfirmPaidBookings)
  nodes.automationAutoCompletePast.checked=Boolean(state.automationRules.autoCompletePastConfirmedBookings)
```
Delete both lines (keep the `awaitingPaymentExpiryHours` line right after them, untouched).

- [ ] **Step 4: Remove from `buildAutomationRulesPayload`**

Current:
```javascript
const buildAutomationRulesPayload=()=>({
  autoConfirmPaidBookings:Boolean(nodes.automationAutoConfirmPaid?.checked),
  autoCompletePastConfirmedBookings:Boolean(nodes.automationAutoCompletePast?.checked),
  autoCancelExpiredAwaitingPayment:Boolean(state.automationRules.autoCancelExpiredAwaitingPayment),
  awaitingPaymentExpiryHours:Number(nodes.automationExpiryHours?.value||48),
  sendOnBookingMade:Boolean(nodes.emailTriggerBookingMade?.checked),
  sendOnBookingConfirmed:Boolean(nodes.emailTriggerBookingConfirmed?.checked),
  sendOnPaymentReceived:Boolean(nodes.emailTriggerPaymentReceived?.checked),
  sendOnCancellationRefund:Boolean(nodes.emailTriggerCancellationRefund?.checked)
})
```
Replace with:
```javascript
const buildAutomationRulesPayload=()=>({
  autoCancelExpiredAwaitingPayment:Boolean(state.automationRules.autoCancelExpiredAwaitingPayment),
  awaitingPaymentExpiryHours:Number(nodes.automationExpiryHours?.value||48),
  sendOnBookingMade:Boolean(nodes.emailTriggerBookingMade?.checked),
  sendOnBookingConfirmed:Boolean(nodes.emailTriggerBookingConfirmed?.checked),
  sendOnPaymentReceived:Boolean(nodes.emailTriggerPaymentReceived?.checked),
  sendOnCancellationRefund:Boolean(nodes.emailTriggerCancellationRefund?.checked)
})
```
(Removed the two dead keys entirely from the payload sent to the backend's settings endpoint — the backend no longer reads them for anything, per Plan 1, but there's no reason to keep sending stale `true`/`false` values either.)

- [ ] **Step 5: Update the state defaults (optional but recommended for cleanliness)**

Current:
```javascript
  automationRules:{
    autoConfirmPaidBookings:true,
    autoCompletePastConfirmedBookings:true,
    autoCancelExpiredAwaitingPayment:false,
    awaitingPaymentExpiryHours:48,
    sendOnBookingMade:true,
    sendOnBookingConfirmed:false,
    sendOnPaymentReceived:false,
    sendOnCancellationRefund:false
  },
```
You may leave this as-is (the two dead keys in the default state object are harmless — nothing reads them after Steps 1-4) OR remove the two dead keys for cleanliness:
```javascript
  automationRules:{
    autoCancelExpiredAwaitingPayment:false,
    awaitingPaymentExpiryHours:48,
    sendOnBookingMade:true,
    sendOnBookingConfirmed:false,
    sendOnPaymentReceived:false,
    sendOnCancellationRefund:false
  },
```
If you remove them here, grep the whole file for `autoConfirmPaidBookings` and `autoCompletePastConfirmedBookings` first to confirm zero remaining references anywhere (including the server-populated merge at `state.automationRules={...state.automationRules,...(payload.automation_rules||{})}` — that merge is fine either way since it just spreads whatever the server sends, which after Plan 1 no longer includes these keys).

- [ ] **Step 6: Syntax check**

```bash
node --check assets/js/booking-admin.js
```

- [ ] **Step 7: Commit**

```bash
git add booking-admin.html assets/js/booking-admin.js
git commit -m "Remove orphaned auto-confirm/auto-complete settings UI (automations removed in Plan 1)"
```

---

### Task 14: Bump cache-busting version strings and final verification

**Files:**
- Modify: `booking-admin.html` (script/link `?v=` query strings)
- Read-only verification across `assets/js/booking-admin.js`, `booking-admin.html`, `assets/css/booking.css`

- [ ] **Step 1: Bump versions**

Find the current `booking-admin.js?v=...` and `booking.css?v=...` query strings in `booking-admin.html` and bump both to a new date-based tag reflecting this change, e.g. `?v=20260715-frontend-4status`. Use today's actual date if different.

- [ ] **Step 2: Full retired-vocabulary sweep**

```bash
grep -n "status:'confirmed'\|status:'awaiting_details'\|status:'no_show'\|'draft'\|'pending'\|'awaiting_payment'\|'payment_pending'\|'invoice'\|'invoiced'\|'to_pay'\|'fully_paid'" assets/js/booking-admin.js
```
Read every match. Expect to find ONLY: (a) legacy-preserved values still deliberately kept displayable in the Payment Process select's disabled options and `PAYMENT_STATUS_LABELS`/badge-class logic (`fully_paid`, `paid`, `partially_paid` — all still-reachable, not retired), (b) the `repairStatusConflicts` function (explicitly out of scope for this plan — Plan 3's job), and (c) anything inside a comment explaining historical context. If you find a live code path (not inside `repairStatusConflicts`, not a comment, not one of the deliberately-preserved legacy display values) still producing/checking a genuinely retired value not covered by any task above, note it — don't fix it silently, flag it in your final report as a possible miss from this plan's task list.

- [ ] **Step 3: Syntax check everything**

```bash
node --check assets/js/booking-admin.js
python3 -c "
content = open('assets/css/booking.css', encoding='utf-8').read()
print('braces', content.count('{'), content.count('}'), content.count('{')-content.count('}'))
"
```

- [ ] **Step 4: Review the full diff against origin before pushing**

```bash
git log --oneline origin/main..HEAD
git diff origin/main..HEAD
```
Read through the full diff once, end to end.

- [ ] **Step 5: Commit the version bump**

```bash
git add booking-admin.html
git commit -m "Bump cache-busting versions for the frontend status/payment simplification"
```

- [ ] **Step 6: Note for the user**

This plan cannot be verified by loading the actual admin UI in a browser in this environment. Before this ships, someone should open `booking-admin.html`, sign in, and manually walk through: creating a new booking (confirm it defaults to Finalised), opening the Payment Process picker, reviewing a website reservation end-to-end (Accept/Decline/Reinstate), marking a booking as no-show, and checking the dashboard tiles render sensibly with no blank/broken counts.
