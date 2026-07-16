# Status & Payment Simplification — Plan 3: Data Migration Tool, Dead Code Cleanup & Smoke Test

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the status/payment simplification effort: fix the `repairStatusConflicts` admin tool (currently broken and migrating in the wrong direction), remove now-confirmed-dead code and CSS left over from the migration, and rewrite the Playwright smoke test so it can actually run against the new 4-status model.

**Architecture:** No new abstractions. This is cleanup work on top of the already-merged Plan 1 (backend) and Plan 2 (frontend): one data-repair function gets corrected logic, some dead code gets deleted, one test gets rewritten to seed data through the real public intake path instead of a form flow that can no longer produce the scenario it needs.

**Tech Stack:** Vanilla JS/HTML/CSS (frontend), Deno Supabase Edge Function (backend, read-only reference in this plan — not modified), Playwright (`@playwright/test`).

**Spec:** `docs/superpowers/specs/2026-07-15-skybook-status-payment-simplification-design.md` (see "Affected subsystems (frontend)" item 9 for the `repairStatusConflicts` repurposing this plan implements).

**Scope of this plan:** `assets/js/booking-admin.js`, `booking-admin.html`, `assets/css/booking.css`, `tests/skybook-admin.smoke.spec.js`. Does not touch the backend (`supabase/functions/booking-api/index.ts`) — it's read-only reference material for understanding what the frontend must send.

**Verification method:** No local Deno/TypeScript compiler or JS test runner is available in this environment beyond `node --check` (syntax) and a Python brace-balance script (CSS). The Playwright test itself cannot be run here — it requires live `SKYBOOK_ADMIN_USERNAME`/`SKYBOOK_ADMIN_PASSWORD` credentials and a reachable Supabase project, neither available in this environment. Task 5's verification is therefore a careful manual trace against the backend's actual route/validation code (present in this repo), not an actual test run — flag this clearly to whoever can run Playwright before considering this plan fully done.

---

### Task 1: Fix `repairStatusConflicts` — currently detects the wrong bookings and can never succeed

**Files:**
- Modify: `assets/js/booking-admin.js:3790-3831`

**Why this is broken today, in detail** (read this before touching the code):

1. **Detection is backwards.** The current filter flags `status==='finalised'` as something needing repair — `finalised` is the CORRECT new value, not a legacy one. Every currently-finalised booking would be caught and "fixed" into a broken state if this ever ran.
2. **The migration targets are invalid.** Several branches set `newStatus='confirmed'` — `'confirmed'` is not a valid status under the new model (`BOOKING_STATUS_TRANSITIONS` in the backend only has `provisional`/`finalised`/`cancelled`/`refunded` as keys).
3. **It can never actually succeed against the live backend, for any input.** The PATCH sends `workflow_action:'system_automation'`. In `supabase/functions/booking-api/index.ts`, `system_automation` makes `isSystemActor` true (line ~3875), which bypasses the *authorization* gate (line ~3901) — but `validateBookingTransition` (line ~3905) still runs, because only `workflow_action:'admin_edit'` skips that (`if(!isAdminEditWorkflow)validateBookingTransition(...)`). `validateBookingTransition` looks up `BOOKING_STATUS_TRANSITIONS[fromStatus]`; for any legacy `fromStatus` (e.g. `'payment_pending'`, `'invoice'`) that key doesn't exist in the table at all, so `allowed=[]`, and the check `allowed.includes(to)` is false for literally any `to` value — the function throws `Cannot move a booking from X to Y.` every single time. In other words: **this repair tool has been completely non-functional (100% failure rate) since the backend was migrated**, silently reporting "0 fixed, N failed" if anyone ever clicks it.

**The fix:**

- [ ] **Step 1: Replace the whole function**

Current code:
```javascript
const repairStatusConflicts=async()=>{
  const btn=document.getElementById('repairStatusConflictsButton')
  // Find bookings with legacy statuses that need migrating to the new two-field system
  const conflicted=state.bookings.filter(b=>{
    const status=normalizeText(b.status||'')
    return['payment_pending','invoice','invoiced','partially_paid','fully_paid','finalised','pending','awaiting_payment','completed'].includes(status)
  })
  if(!conflicted.length){
    showToast('No legacy status conflicts found.','success')
    return
  }
  const doFix=window.confirm(`Found ${conflicted.length} booking${conflicted.length>1?'s':''} with legacy statuses. Migrate them to the new Booking / Payment status system?`)
  if(!doFix)return
  if(btn){btn.disabled=true;btn.textContent=`Repairing 0 / ${conflicted.length}...`}
  let fixed=0
  let errors=0
  for(const booking of conflicted){
    const s=normalizeText(booking.status||'')
    let newStatus='confirmed'
    let newPayment='invoice'
    if(s==='payment_pending'){newStatus='confirmed';newPayment='invoice'}
    else if(s==='invoice'){newStatus='confirmed';newPayment='invoice'}
    else if(s==='invoiced'){newStatus='confirmed';newPayment='invoiced'}
    else if(s==='partially_paid'){newStatus='confirmed';newPayment='partially_paid'}
    else if(s==='fully_paid'){newStatus='confirmed';newPayment='fully_paid'}
    else if(s==='finalised'||s==='completed'){newStatus='confirmed';newPayment='fully_paid'}
    else if(s==='pending'||s==='awaiting_payment'){newStatus='provisional';newPayment=''}
    try{
      await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(booking.id)}`,{
        method:'PATCH',
        headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
        body:{status:newStatus,payment_status:newPayment,workflow_action:'system_automation'}
      })
      fixed++
      if(btn)btn.textContent=`Repairing ${fixed} / ${conflicted.length}...`
    }catch{errors++}
  }
  if(btn){btn.disabled=false;btn.textContent='Repair Status Conflicts'}
  await loadAdminData()
  if(errors){showToast(`Migrated ${fixed} bookings. ${errors} failed.`,'error')}
  else{showToast(`Migrated ${fixed} booking${fixed>1?'s':''} to new status system.`,'success')}
}
```

Replace with:
```javascript
const repairStatusConflicts=async()=>{
  const btn=document.getElementById('repairStatusConflictsButton')
  // Legacy status values retired by the 4-status migration. Anything not in this map
  // (provisional/finalised/cancelled/refunded) is already correct and left untouched.
  const legacyStatusMap={
    confirmed:'finalised',
    awaiting_details:'provisional',
    no_show:'cancelled',
    rescheduled:'finalised',
    draft:'provisional',
    pending:'provisional',
    awaiting_payment:'finalised',
    payment_pending:'finalised',
    completed:'finalised'
  }
  // Legacy payment_status values retired by the method-based payment migration.
  // 'paid'/'partially_paid' are still live (written by the Payments tab) and untouched.
  const legacyPaymentMap={
    to_pay:'',
    invoice:'',
    invoiced:'',
    fully_paid:'paid'
  }
  const conflicted=state.bookings.filter(b=>{
    const status=normalizeText(b.status||'')
    const payment=normalizeText(b.payment_status||'')
    return Object.prototype.hasOwnProperty.call(legacyStatusMap,status)||Object.prototype.hasOwnProperty.call(legacyPaymentMap,payment)
  })
  if(!conflicted.length){
    showToast('No legacy status conflicts found.','success')
    return
  }
  const doFix=window.confirm(`Found ${conflicted.length} booking${conflicted.length>1?'s':''} with legacy statuses. Migrate them to the new Booking / Payment status system?`)
  if(!doFix)return
  if(btn){btn.disabled=true;btn.textContent=`Repairing 0 / ${conflicted.length}...`}
  let fixed=0
  let errors=0
  for(const booking of conflicted){
    const s=normalizeText(booking.status||'')
    const p=normalizeText(booking.payment_status||'')
    const newStatus=legacyStatusMap[s]||booking.status
    const newPayment=Object.prototype.hasOwnProperty.call(legacyPaymentMap,p) ? legacyPaymentMap[p] : (booking.payment_status||'')
    const body={
      status:newStatus,
      payment_status:newPayment,
      workflow_action:'admin_edit',
      reason:'Legacy status/payment migration to the 4-status model.'
    }
    if(s==='no_show'){
      body.metadata={
        ...normalizeJsonRecord(booking.metadata),
        no_show:{reason:'Migrated from legacy no_show status.',recorded_at:new Date().toISOString()}
      }
    }
    try{
      await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(booking.id)}`,{
        method:'PATCH',
        headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
        body
      })
      fixed++
      if(btn)btn.textContent=`Repairing ${fixed} / ${conflicted.length}...`
    }catch{errors++}
  }
  if(btn){btn.disabled=false;btn.textContent='Repair Status Conflicts'}
  await loadAdminData()
  if(errors){showToast(`Migrated ${fixed} bookings. ${errors} failed.`,'error')}
  else{showToast(`Migrated ${fixed} booking${fixed>1?'s':''} to new status system.`,'success')}
}
```

Notes on the design decisions baked into this mapping (documented here so you don't need to re-derive them, and so a reviewer can check them against the design spec rather than treat them as arbitrary):
- `confirmed`→`finalised`, `awaiting_details`→`provisional`, `rescheduled`→`finalised` come directly from the design spec's item 9.
- `no_show`→`cancelled` + a `metadata.no_show` marker, matching exactly how the live no-show workflow (already fixed in Plan 2) represents a no-show — a cancellation with a distinguishing marker, not its own status.
- `draft`/`pending`→`provisional` (not yet a real, accepted booking — closest new-model equivalent to "still being reviewed").
- `awaiting_payment`/`payment_pending`/`completed`→`finalised` (all three represent an already-accepted, active booking in the old model — payment being outstanding or the tour having already happened doesn't change that it's `finalised` under the new model, where "unpaid" is represented by a blank `payment_status`, not a separate status value).
- `workflow_action:'admin_edit'` is used instead of `'system_automation'` specifically because — per the backend code read in Step 3 below — only `admin_edit` bypasses `validateBookingTransition`, which is required here since the FROM status values are legacy ones with no entry in `BOOKING_STATUS_TRANSITIONS` at all (any `to` value would otherwise always be rejected).

- [ ] **Step 2: Syntax check**

```bash
node --check assets/js/booking-admin.js
```
Expected: no output.

- [ ] **Step 3: Verify the `admin_edit` bypass assumption against the actual backend code**

Read `supabase/functions/booking-api/index.ts` — search for `isAdminEditWorkflow`, `isSystemActor`, and `validateBookingTransition`. Confirm:
1. `workflow_action:'admin_edit'` sets `isAdminEditWorkflow=true`.
2. The big authorization gate (an `if` statement combining `!isSystemActor&&!isAdminEditWorkflow&&!isCancellationWorkflow&&...`) is satisfied (doesn't throw) when `isAdminEditWorkflow` is true, regardless of what workflow-specific conditions (`isCancellationWorkflow`, `isReinstateWorkflow`, etc.) would otherwise require.
3. `validateBookingTransition(existing.status,nextStatus,nextPaymentStatus)` is only called `if(!isAdminEditWorkflow)` — i.e. `admin_edit` skips it entirely, so an arbitrary `fromStatus`→`toStatus` pair (including ones with no entry in `BOOKING_STATUS_TRANSITIONS`) will not throw.

If your reading of the current backend code contradicts any of these three points, STOP and report BLOCKED with exactly what you found — this task's core fix (Step 1) depends on this assumption being correct, and if it's wrong, the whole approach needs to be reconsidered (e.g., a different, backend-side bypass might be needed instead, which would be out of this plan's frontend-only scope and need to be flagged back to the user).

- [ ] **Step 4: Manual trace**

Given a booking with `status:'payment_pending', payment_status:'invoice'`:
1. `legacyStatusMap['payment_pending']` → `'finalised'`.
2. `legacyPaymentMap['invoice']` → `''`.
3. PATCH body: `{status:'finalised',payment_status:'',workflow_action:'admin_edit',reason:'...'}`.
4. Per Step 3's confirmed backend behavior, this passes both the authorization gate and transition validation (since `admin_edit` skips `validateBookingTransition`) — no `Cannot move a booking from...` error.

Given a booking with `status:'no_show', payment_status:'paid'`:
1. `legacyStatusMap['no_show']` → `'cancelled'`.
2. `legacyPaymentMap` has no `'paid'` key → `newPayment` falls back to `booking.payment_status||''` → `'paid'` (unchanged — a no-show that was already paid stays marked paid).
3. `s==='no_show'` is true → `body.metadata` gets the `no_show` marker added, spread over the booking's existing metadata (nothing lost).

Given a booking with `status:'finalised', payment_status:'cash'` (already fully correct):
1. Neither map has a matching key for either field → `conflicted` filter excludes it entirely. Confirms the detection fix — this booking is no longer wrongly flagged.

- [ ] **Step 5: Commit**

```bash
git add assets/js/booking-admin.js
git commit -m "Fix repairStatusConflicts: correct detection, valid targets, and a workflow_action that actually bypasses transition validation"
```

---

### Task 2: Remove orphaned "Awaiting Payment Expiry Hours" automation setting

**Files:**
- Modify: `booking-admin.html` (the `automationRulesForm`, currently containing only the `automationExpiryHours` field after Plan 2's Task 13 removed its two sibling checkboxes)
- Modify: `assets/js/booking-admin.js` (node reference, render line, payload key, state default)

**Why:** Confirmed by reading `supabase/functions/booking-api/index.ts` — `autoCancelExpiredAwaitingPayment` and `awaitingPaymentExpiryHours` are persisted (round-tripped through `GET admin/bootstrap` and `PATCH admin/automation-rules`) but **no backend code anywhere reads or acts on them** — there is no cron/sweep job type for expiring unpaid bookings (`processSystemJob`'s `switch` only handles `email_notification`/`operator_settlement_check`/`payment_reminder`). This is the exact same class of orphan as `autoConfirmPaidBookings`/`autoCompletePastConfirmedBookings`, which Plan 2's Task 13 already removed from this same form — this task finishes that cleanup.

- [ ] **Step 1: Remove the field from `booking-admin.html`**

Read the current `#automationRulesForm` block (it should now contain just the `automationExpiryHours` field and a submit button, since Plan 2's Task 13 removed the two checkboxes). Find:
```html
            <form id="automationRulesForm" class="booking-form-grid admin-spacer" novalidate>
              <label class="booking-field">
                <span>Awaiting Payment Expiry Hours</span>
                <input id="automationExpiryHours" type="number" min="1" value="48">
              </label>
```
Replace with:
```html
            <form id="automationRulesForm" class="booking-form-grid admin-spacer" novalidate>
```
(Delete the `<label>` block entirely. Read a few lines further to confirm what follows — likely a submit `<button>` — and leave that untouched; if the form would become empty except for the submit button, that's fine, this whole settings section is now vestigial and a candidate for full removal in some future pass, but removing the *form* itself is out of scope here since `sendOnBookingMade`/`sendOnBookingConfirmed`/`sendOnPaymentReceived`/`sendOnCancellationRefund` email-trigger settings may also live in or near this form — check before assuming the form itself should go. If those email-trigger checkboxes are in a DIFFERENT form/section entirely, and this form would end up with literally nothing but a submit button, note that in your report as a possible further cleanup candidate, but do not remove the form/button in this task — only remove the one field specified.)

- [ ] **Step 2: Remove the node reference**

In `assets/js/booking-admin.js`, find:
```javascript
  automationExpiryHours:document.getElementById('automationExpiryHours'),
```
Delete this line.

- [ ] **Step 3: Remove from the render function**

Find:
```javascript
  nodes.automationExpiryHours.value=state.automationRules.awaitingPaymentExpiryHours||48
```
Delete this line entirely (it should be the only remaining automation-rules-specific render line in this function after Plan 2's Task 13 already removed its two siblings — confirm this before deleting, since if other automation-rule render lines are still present that weren't part of Plan 2's cleanup, leave them and only remove this one).

- [ ] **Step 4: Remove from `buildAutomationRulesPayload`**

Find:
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
Replace with:
```javascript
const buildAutomationRulesPayload=()=>({
  sendOnBookingMade:Boolean(nodes.emailTriggerBookingMade?.checked),
  sendOnBookingConfirmed:Boolean(nodes.emailTriggerBookingConfirmed?.checked),
  sendOnPaymentReceived:Boolean(nodes.emailTriggerPaymentReceived?.checked),
  sendOnCancellationRefund:Boolean(nodes.emailTriggerCancellationRefund?.checked)
})
```

- [ ] **Step 5: Remove from the state defaults**

Find the `automationRules:{...}` object in the initial `state` definition:
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
Replace with:
```javascript
  automationRules:{
    sendOnBookingMade:true,
    sendOnBookingConfirmed:false,
    sendOnPaymentReceived:false,
    sendOnCancellationRefund:false
  },
```

- [ ] **Step 6: Verification**

```bash
grep -n "automationExpiryHours\|autoCancelExpiredAwaitingPayment\|awaitingPaymentExpiryHours" booking-admin.html assets/js/booking-admin.js
```
Expected: zero matches in either file. Then:
```bash
node --check assets/js/booking-admin.js
```
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add booking-admin.html assets/js/booking-admin.js
git commit -m "Remove orphaned Awaiting Payment Expiry Hours setting (no backend consumer)"
```

---

### Task 3: Remove 3 confirmed-dead functions

**Files:**
- Modify: `assets/js/booking-admin.js`

Each of these three functions has been independently confirmed (via whole-file grep for the bare function name) to have **zero call sites** anywhere in the codebase — they are pure dead code, not referenced by any other function, event listener, or template.

- [ ] **Step 1: Delete `applyBookingFormValues`**

Find and delete the entire function (currently ~39 lines):
```javascript
const applyBookingFormValues=values=>{
  if(!values)return
  if(nodes.bookingBrand)nodes.bookingBrand.value=String(values.brand_code||nodes.bookingBrand.value||'')
  syncBookingReferenceField({
    reference:values.reference,
    brandCode:nodes.bookingBrand?.value||values.brand_code||'',
    forceNew:!state.selectedBookingId&&!values.reference
  })
  if(nodes.bookingSource)nodes.bookingSource.value=String(values.source||nodes.bookingSource.value||'admin')
  if(nodes.bookingService)nodes.bookingService.value=String(values.service_slug||'')
  if(nodes.bookingStatus)nodes.bookingStatus.value=String(values.status||nodes.bookingStatus.value||'confirmed')
  if(nodes.bookingPaymentStatus)nodes.bookingPaymentStatus.value=String(values.payment_status||nodes.bookingPaymentStatus.value||'')
  if(nodes.bookingDate)nodes.bookingDate.value=String(values.preferred_date||'')
  if(nodes.bookingQuantity)nodes.bookingQuantity.value=String(values.quantity||nodes.bookingQuantity.value||2)
  const prefillAdults=Number(values.adult_quantity||0),prefillChildren=Number(values.child_quantity||0),prefillInfants=Number(values.infant_quantity||values.metadata?.infant_quantity||0)
  const prefillTotal=Number(values.quantity||nodes.bookingQuantity?.value||0)
  // Infer adults from the head count minus children + infants so an under-4 is never treated as an adult.
  const prefillResolvedAdults=(prefillAdults<=0&&prefillChildren<=0&&prefillTotal>0)
    ? Math.max(0,prefillTotal-prefillChildren-prefillInfants)
    : prefillAdults
  if(nodes.bookingAdultQuantity)nodes.bookingAdultQuantity.value=String(prefillResolvedAdults>0||prefillChildren>0||prefillInfants>0 ? prefillResolvedAdults : (prefillTotal||2))
  if(nodes.bookingChildQuantity)nodes.bookingChildQuantity.value=String(prefillChildren)
  if(nodes.bookingInfantQuantity)nodes.bookingInfantQuantity.value=String(prefillInfants)
  if(nodes.bookingPriceOverride)nodes.bookingPriceOverride.value=String(values.price_override||values.metadata?.price_override||'')
  if(nodes.bookingAgent)nodes.bookingAgent.value=String(values.agent||values.metadata?.agent||'')
  if(nodes.bookingGuideName)nodes.bookingGuideName.value=String(values.guide_name||values.metadata?.guide_name||'')
  if(nodes.bookingNationality)nodes.bookingNationality.value=String(values.nationality||values.metadata?.nationality||'')
  if(nodes.bookingBookedBy)nodes.bookingBookedBy.value=String(values.booked_by||values.metadata?.booked_by||'')
  if(nodes.bookingDietary)nodes.bookingDietary.value=String(values.dietary_requirements||values.metadata?.dietary_requirements||values.metadata?.dietary||'')
  if(nodes.bookingPickupLocation)nodes.bookingPickupLocation.value=String(values.pickup_location||values.metadata?.pickup_location||values.metadata?.hotel||'')
  if(nodes.bookingPickupPoint)nodes.bookingPickupPoint.value=String(values.pickup_point||values.metadata?.pickup_point||'')
  if(nodes.bookingDropoffLocation)nodes.bookingDropoffLocation.value=String(values.dropoff_location||values.metadata?.dropoff_location||'')
  if(nodes.bookingCustomerName)nodes.bookingCustomerName.value=String(values.customer_name||'')
  if(nodes.bookingCustomerEmail)nodes.bookingCustomerEmail.value=String(values.customer_email||'')
  if(nodes.bookingCustomerPhone)nodes.bookingCustomerPhone.value=String(values.customer_phone||'')
  if(values.custom_fields)renderAdminBookingCustomFields(null,normalizeJsonRecord(values.custom_fields))
  if(nodes.bookingNotes)nodes.bookingNotes.value=String(values.notes||'')
  syncBookingQuantityMode()
}
```
Before deleting, run `grep -n "applyBookingFormValues" assets/js/booking-admin.js` to independently reconfirm zero other references (should show exactly 1 match: the declaration itself). If you find any other reference, STOP and report BLOCKED rather than delete a function that turns out to be used.

- [ ] **Step 2: Delete `bookingHasOpenOperationalWork`**

Find and delete:
```javascript
const bookingHasOpenOperationalWork=booking=>{
  const status=String(booking?.status||'').toLowerCase()
  const paymentStatus=String(booking?.payment_status||'').toLowerCase()
  if(['cancelled','completed','refunded'].includes(status)||['cancelled','refunded'].includes(paymentStatus))return false
  const openTasks=getBookingTasks(booking?.id).some(task=>String(task.status||'')==='open')
  const hasOutstanding=Number(booking?.amount_due_now||0)+Number(booking?.amount_due_later||0)>0
  const needsOperator=['pending','awaiting_payment','confirmed'].includes(status)&&getBookingOperatorName(booking)==='Unassigned'
  return openTasks||status==='pending'||status==='awaiting_payment'||needsOperator||hasOutstanding||['failed','to_pay','partially_paid'].includes(paymentStatus)
}
```
Same pre-deletion grep check: `grep -n "bookingHasOpenOperationalWork" assets/js/booking-admin.js` should show exactly 1 match before you delete.

- [ ] **Step 3: Delete `getStatusColor`**

Find and delete:
```javascript
const getStatusColor=(status,isCruise=false,paymentStatus='')=>{
  if(isCruise)return '#7c3aed'
  if(normalizeText(status)==='provisional')return '#ca8a04'
  if(normalizeText(status)==='refunded')return '#5b21b6'
  if(['cancelled','failed','no_show'].includes(normalizeText(status)))return '#9ca3af'
  // finalised — color by payment progress
  const pm=normalizeText(paymentStatus)
  if(['cash','card','eft','voucher','paid','fully_paid','foc'].includes(pm))return '#2563eb'
  if(pm==='partially_paid')return '#15803d'
  return '#1e293b'
}
```
Same pre-deletion grep check: `grep -n "getStatusColor" assets/js/booking-admin.js` should show exactly 1 match before you delete. (This function was already correctly updated to the new status model in a prior plan — it's being removed here purely because it has no callers, not because its logic is wrong.)

- [ ] **Step 4: Syntax check**

```bash
node --check assets/js/booking-admin.js
```
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add assets/js/booking-admin.js
git commit -m "Remove 3 confirmed-dead functions left over from the status/payment migration"
```

---

### Task 4: Remove dead CSS classes

**Files:**
- Modify: `assets/css/booking.css`

These class names are confirmed dead — nothing in `assets/js/booking-admin.js` or `booking-admin.html` ever emits them (verified against `getStatusBadgeClass`, `getStatusRowClass`, and the static filter-pill markup, none of which produce `is-confirmed`, `status-confirmed`, or `status-pill-provisional`).

- [ ] **Step 1: Remove `.status-pill-provisional`**

Find and delete the single rule (around line 454):
```css
.status-pill-provisional{background:#f87171;border-color:#7f1d1d;color:#1a0000}
```

- [ ] **Step 2: Remove `.status-badge.is-confirmed` (appears twice — base block and a later duplicate "reskin" block)**

Find and delete BOTH occurrences of:
```css
.status-badge.is-confirmed{background:#f1f5f9;color:#1e293b;border-color:#1e293b}
```
(one around line 1538, one around line 3902 — read the surrounding ~10 lines at each to confirm you're deleting the right rule and not accidentally touching its neighbor, `.status-badge.is-finalised`, which must stay.)

- [ ] **Step 3: Remove `.booking-row.status-confirmed` (3 lines, one occurrence)**

Find and delete:
```css
.booking-row.status-confirmed td{background:rgba(248,250,252,.75);border-top:2px solid #1e293b;border-bottom:2px solid #1e293b}
.booking-row.status-confirmed td:first-child{border-left:4px solid #1e293b}
.booking-row.status-confirmed td:last-child{border-right:2px solid #1e293b}
```

- [ ] **Step 4: Remove `.cal-day-block.status-confirmed`**

Find and delete:
```css
.cal-day-block.status-confirmed{border-color:#1e293b;background:#f8fafc}
```

- [ ] **Step 5: Verification**

```bash
grep -n "status-pill-provisional\|status-badge.is-confirmed\|booking-row.status-confirmed\|cal-day-block.status-confirmed" assets/css/booking.css
```
Expected: zero matches.

```bash
python3 -c "
content = open('assets/css/booking.css', encoding='utf-8').read()
print('css brace diff:', content.count('{') - content.count('}'))
"
```
Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git add assets/css/booking.css
git commit -m "Remove dead CSS classes (is-confirmed, status-confirmed, status-pill-provisional) left over from the status/payment migration"
```

---

### Task 5: Rewrite the Playwright smoke test to seed a website reservation via the public booking API

**Files:**
- Modify: `tests/skybook-admin.smoke.spec.js`

**Why:** The current test calls `page.locator('#adminBookingStatusField').selectOption('pending')` and `page.locator('#adminBookingPaymentStatusField').selectOption('pending')` — `'pending'` is not a valid `<option>` value in either `<select>` anymore (Plan 2 restricted both to the new 4-status/method vocabulary), so `.selectOption('pending')` will throw immediately (`Error: Element is not an <option>`). Beyond that surface bug, the test's entire premise — create a booking via the admin "New Booking" form, then find it in "Reservations" and Accept it — can no longer work at all: under the new model, `provisional` (the status required to appear in the Reservation Management review queue, per `isReviewReservation`) is reachable only for website-sourced bookings; the admin form's Status field has `provisional` as a `disabled` option specifically because admin-created bookings always start `finalised`. There is no way to create a reservation-awaiting-review through the admin UI anymore — by design.

The fix: seed a real website-sourced `provisional` booking directly through the same public API endpoint the actual booking widgets call (`POST .../booking-api/bookings`, no admin auth required), then drive the rest of the test (accept → trash → restore → edit → customer popup) through the admin UI exactly as before.

- [ ] **Step 1: Read the current file in full**

Read `tests/skybook-admin.smoke.spec.js` end to end before editing — it's short (107 lines) and this task replaces most of it. Confirm the current content matches what's shown below as "current" before proceeding; if it's drifted, adapt the replacement to preserve any other changes that may have landed in the meantime, but keep the core fix (API-seeded reservation instead of admin-form-created one).

- [ ] **Step 2: Replace the whole file**

Current file:
```javascript
const { test, expect } = require('@playwright/test')

const adminUsername=process.env.SKYBOOK_ADMIN_USERNAME || ''
const adminPassword=process.env.SKYBOOK_ADMIN_PASSWORD || ''

const futureDate=(offsetDays=5)=>{
  const date=new Date()
  date.setDate(date.getDate()+offsetDays)
  return date.toISOString().slice(0,10)
}

const uniqueGuestSeed=()=>Date.now().toString().slice(-8)

const signIn=async page=>{
  await page.goto('/login.html')
  await page.locator('input[name="username"]').fill(adminUsername)
  await page.locator('input[name="password"]').fill(adminPassword)
  await page.getByRole('button',{name:/sign in/i}).click()
  await expect.poll(()=>new URL(page.url()).pathname).toContain('booking-admin.html')
  await expect(page.locator('#adminAppShell')).toBeVisible()
}

const selectFirstRealOption=async pageSelector=>{
  const count=await pageSelector.locator('option').count()
  for(let index=0;index<count;index+=1){
    const option=pageSelector.locator('option').nth(index)
    const value=await option.getAttribute('value')
    if(value) return value
  }
  throw new Error('No selectable option was available.')
}

test.describe('SkyBook admin smoke flows',()=>{
  test.skip(!adminUsername || !adminPassword,'Set SKYBOOK_ADMIN_USERNAME and SKYBOOK_ADMIN_PASSWORD to run admin smoke tests.')

  test('reservation accept, trash recovery, booking edit, and customer popup',async({ page })=>{
    const seed=uniqueGuestSeed()
    const guestName=`Smoke Guest ${seed}`
    const guestEmail=`smoke.${seed}@example.com`
    const guestPhone=`+26481${seed}`
    const updatedPhone=`+26499${seed}`

    await signIn(page)

    await page.getByRole('button',{name:/new booking/i}).click()
    await expect(page.locator('#bookingModal')).toBeVisible()

    const serviceSelect=page.locator('#adminBookingService')
    await expect.poll(async()=>serviceSelect.locator('option').count()).toBeGreaterThan(1)
    const serviceValue=await selectFirstRealOption(serviceSelect)

    await serviceSelect.selectOption(serviceValue)
    await page.locator('#adminBookingStatusField').selectOption('pending')
    await page.locator('#adminBookingPaymentStatusField').selectOption('pending')
    await page.locator('#adminBookingDate').fill(futureDate())
    await page.locator('#adminBookingCustomerName').fill(guestName)
    await page.locator('#adminBookingCustomerEmail').fill(guestEmail)
    await page.locator('#adminBookingCustomerPhone').fill(guestPhone)
    await page.locator('#adminBookingNotes').fill('Playwright smoke reservation.')
    await page.locator('#adminBookingSaveButton').click()

    await expect.poll(()=>new URL(page.url()).searchParams.get('tab')).toBe('bookings')

    await page.locator('[data-admin-tab="reservations"]').click()
    await expect.poll(()=>new URL(page.url()).searchParams.get('tab')).toBe('reservations')
    await expect(page.locator('[data-reservation-id]').filter({ hasText: guestName }).first()).toBeVisible()
    await page.locator('[data-reservation-id]').filter({ hasText: guestName }).first().click()

    await expect.poll(()=>new URL(page.url()).searchParams.get('tab')).toBe('reservation-management')
    await page.locator('[data-reservation-action="accept"]').first().click()

    await expect.poll(()=>new URL(page.url()).searchParams.get('tab')).toBe('bookings')
    const bookingId=new URL(page.url()).searchParams.get('booking')
    expect(bookingId).toBeTruthy()

    await page.locator('[data-booking-inline-action="trash-booking"]').first().click()
    await expect(page.locator('#workflowModal')).toBeVisible()
    await page.locator('#workflowModal textarea[name="reason"]').fill('Playwright smoke archive test.')
    await page.locator('#workflowModalSubmitButton').click()

    await expect.poll(()=>new URL(page.url()).searchParams.get('tab')).toBe('booking-trash')
    const trashRow=page.locator('#adminBookingTrashTable tr').filter({ hasText: guestName }).first()
    await expect(trashRow).toBeVisible()
    await trashRow.getByRole('button',{name:/restore/i}).click()

    await page.goto(`/booking-admin.html?tab=bookings&booking=${bookingId}`)
    await expect.poll(()=>new URL(page.url()).searchParams.get('booking')).toBe(bookingId)
    await expect(page.locator('body')).toContainText(guestName)

    await page.locator('[data-booking-inline-action="edit-booking"]').first().click()
    await expect(page.locator('#bookingModal')).toBeVisible()
    await page.locator('#adminBookingCustomerPhone').fill(updatedPhone)
    await page.locator('#adminBookingSaveButton').click()
    await expect(page.locator('body')).toContainText(updatedPhone)

    await page.locator('[data-admin-tab="customers"]').click()
    await page.locator('#customerFilterSearch').fill(guestEmail)
    const customerRow=page.locator('[data-customer-id]').filter({ hasText: guestName }).first()
    await expect(customerRow).toBeVisible()
    await customerRow.click()

    await expect(page.locator('#customerModal')).toBeVisible()
    await expect(page.locator('#customerModal')).toContainText(guestName)
    await page.locator('#closeCustomerModalButton').click()
    await expect(page.locator('#customerModal')).toBeHidden()
  })
})
```

Replace with:
```javascript
const { test, expect } = require('@playwright/test')

const adminUsername=process.env.SKYBOOK_ADMIN_USERNAME || ''
const adminPassword=process.env.SKYBOOK_ADMIN_PASSWORD || ''
// The booking-api base URL and anon key are the same public, client-safe values already
// embedded in the shipped frontend (assets/js/shared.js DEFAULT_SUPABASE_CONFIG) — overridable
// via env vars for pointing this test at a different environment.
const bookingApiBaseUrl=process.env.SKYBOOK_BOOKING_API_URL || 'https://zegfirgyhdjyehvhlrnh.supabase.co/functions/v1/booking-api'
const bookingApiAnonKey=process.env.SKYBOOK_BOOKING_API_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplZ2Zpcmd5aGRqeWVodmhscm5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MTIwOTUsImV4cCI6MjA5MTk4ODA5NX0.1UB49GsmosKQzaLv05hHznVohzgVU0lMUAjzPKN9Jf8'

const futureDate=(offsetDays=5)=>{
  const date=new Date()
  date.setDate(date.getDate()+offsetDays)
  return date.toISOString().slice(0,10)
}

const uniqueGuestSeed=()=>Date.now().toString().slice(-8)

const signIn=async page=>{
  await page.goto('/login.html')
  await page.locator('input[name="username"]').fill(adminUsername)
  await page.locator('input[name="password"]').fill(adminPassword)
  await page.getByRole('button',{name:/sign in/i}).click()
  await expect.poll(()=>new URL(page.url()).pathname).toContain('booking-admin.html')
  await expect(page.locator('#adminAppShell')).toBeVisible()
}

// Seeds a real website-sourced reservation via the public booking API — the same endpoint the
// live booking widgets call. Admin-created bookings can never be 'provisional' under the current
// status model (see isReviewReservation in booking-admin.js), so the reservation-review flow can
// only be exercised against a real website-sourced booking, not one created through the admin form.
const seedWebsiteReservation=async(request,{guestName,guestEmail,guestPhone})=>{
  const servicesResponse=await request.get(`${bookingApiBaseUrl}/services`,{
    headers:{apikey:bookingApiAnonKey,'x-brand-code':'true-travel'}
  })
  if(!servicesResponse.ok())throw new Error(`Failed to fetch services: ${servicesResponse.status()} ${await servicesResponse.text()}`)
  const {services}=await servicesResponse.json()
  if(!services?.length)throw new Error('No active services available to seed a test reservation.')
  const serviceSlug=services[0].slug

  const bookingResponse=await request.post(`${bookingApiBaseUrl}/bookings`,{
    headers:{'content-type':'application/json',apikey:bookingApiAnonKey,'x-brand-code':'true-travel'},
    data:{
      service_slug:serviceSlug,
      brand_code:'true-travel',
      preferred_date:futureDate(10),
      quantity:2,
      accept_terms:true,
      customer:{full_name:guestName,email:guestEmail,phone:guestPhone},
      source:'true_travel_inline_reservation',
      notes:'Playwright smoke reservation.'
    }
  })
  if(!bookingResponse.ok())throw new Error(`Failed to seed reservation: ${bookingResponse.status()} ${await bookingResponse.text()}`)
  const {booking}=await bookingResponse.json()
  return booking
}

test.describe('SkyBook admin smoke flows',()=>{
  test.skip(!adminUsername || !adminPassword,'Set SKYBOOK_ADMIN_USERNAME and SKYBOOK_ADMIN_PASSWORD to run admin smoke tests.')

  test('reservation accept, trash recovery, booking edit, and customer popup',async({ page, request })=>{
    const seed=uniqueGuestSeed()
    const guestName=`Smoke Guest ${seed}`
    const guestEmail=`smoke.${seed}@example.com`
    const guestPhone=`+26481${seed}`
    const updatedPhone=`+26499${seed}`

    await seedWebsiteReservation(request,{guestName,guestEmail,guestPhone})

    await signIn(page)

    await page.locator('[data-admin-tab="reservations"]').click()
    await expect.poll(()=>new URL(page.url()).searchParams.get('tab')).toBe('reservations')
    await expect(page.locator('[data-reservation-id]').filter({ hasText: guestName }).first()).toBeVisible()
    await page.locator('[data-reservation-id]').filter({ hasText: guestName }).first().click()

    await expect.poll(()=>new URL(page.url()).searchParams.get('tab')).toBe('reservation-management')
    await page.locator('[data-reservation-action="accept"]').first().click()

    await expect.poll(()=>new URL(page.url()).searchParams.get('tab')).toBe('bookings')
    const bookingId=new URL(page.url()).searchParams.get('booking')
    expect(bookingId).toBeTruthy()

    await page.locator('[data-booking-inline-action="trash-booking"]').first().click()
    await expect(page.locator('#workflowModal')).toBeVisible()
    await page.locator('#workflowModal textarea[name="reason"]').fill('Playwright smoke archive test.')
    await page.locator('#workflowModalSubmitButton').click()

    await expect.poll(()=>new URL(page.url()).searchParams.get('tab')).toBe('booking-trash')
    const trashRow=page.locator('#adminBookingTrashTable tr').filter({ hasText: guestName }).first()
    await expect(trashRow).toBeVisible()
    await trashRow.getByRole('button',{name:/restore/i}).click()

    await page.goto(`/booking-admin.html?tab=bookings&booking=${bookingId}`)
    await expect.poll(()=>new URL(page.url()).searchParams.get('booking')).toBe(bookingId)
    await expect(page.locator('body')).toContainText(guestName)

    await page.locator('[data-booking-inline-action="edit-booking"]').first().click()
    await expect(page.locator('#bookingModal')).toBeVisible()
    await page.locator('#adminBookingCustomerPhone').fill(updatedPhone)
    await page.locator('#adminBookingSaveButton').click()
    await expect(page.locator('body')).toContainText(updatedPhone)

    await page.locator('[data-admin-tab="customers"]').click()
    await page.locator('#customerFilterSearch').fill(guestEmail)
    const customerRow=page.locator('[data-customer-id]').filter({ hasText: guestName }).first()
    await expect(customerRow).toBeVisible()
    await customerRow.click()

    await expect(page.locator('#customerModal')).toBeVisible()
    await expect(page.locator('#customerModal')).toContainText(guestName)
    await page.locator('#closeCustomerModalButton').click()
    await expect(page.locator('#customerModal')).toBeHidden()
  })
})
```

Key changes explained:
- Removed `selectFirstRealOption` (no longer needed — the test no longer picks a service from the admin form's `<select>`; the seeding helper picks the first service returned by the public `GET .../services` endpoint instead) and the "New Booking" admin-form section entirely (lines that opened `#bookingModal`, filled in the service/status/payment/date/customer fields, and saved).
- Added `seedWebsiteReservation`, called before `signIn`, using Playwright's built-in `request` fixture (destructured as a second test-callback parameter alongside `page` — no manual context creation/disposal needed).
- The rest of the test (Reservations tab → find by guest name → Accept → trash → restore → edit phone → customer popup) is **unchanged** — it now operates on the API-seeded booking instead of one created through the admin form, but the assertions and locators are identical since the booking's `customer_name`/reference still surface the same way in the UI regardless of how it was created.

- [ ] **Step 3: Syntax check**

```bash
node --check tests/skybook-admin.smoke.spec.js
```
Expected: no output.

- [ ] **Step 4: Manual trace (cannot run Playwright in this environment — trace by reading, and flag for a human to actually run this before relying on it)**

1. `seedWebsiteReservation` calls `GET {base}/services` with `apikey`+`x-brand-code` headers — per `supabase/functions/booking-api/index.ts`'s route table, `GET .../services` (no `id` segment) returns `{services:[...]}` with no auth required (`verify_jwt=false` in `supabase/config.toml`, and the route itself calls no `getAuthenticatedAdmin`). Confirm this by reading the route handler and `fetchServices` once more.
2. `POST {base}/bookings` with a body containing `service_slug`, `brand_code`, `preferred_date`, `quantity:2`, `accept_terms:true`, `customer:{full_name,email,phone}`, `source:'true_travel_inline_reservation'` — per `validatePublicBookingPayload`, all required fields for a non-admin booking are present. `createBooking` will default `status` to `'provisional'` (no `status` key sent) and `source` to the literal string given. Response is `{booking:{id,reference,status:'provisional',payment_status:'',...}}`.
3. Back in the admin UI: `isReviewReservation` (fixed in Plan 2) requires exactly `status==='provisional'` and non-admin `source` — both true for this seeded booking — so it appears in the Reservations tab, `data-reservation-id` row filterable by `guestName` (the row template renders `customer_name`, confirmed in Plan 2's research).
4. Clicking into it routes to `reservation-management` (per the existing click-handler logic, unchanged by this plan), where `data-reservation-action="accept"` is rendered (fixed in Plan 2's Task 5b) and its handler PATCHes `workflow_action:'accept_reservation',status:'finalised'` — matches the backend's `isReservationAcceptanceWorkflow` gate.
5. The rest of the flow (trash/restore/edit/customer popup) exercises functionality entirely unrelated to status/payment vocabulary and was not touched by Plan 2 or this plan — should behave exactly as it did before this rewrite, just against a booking that originated from the API instead of the admin form.

**Flag clearly in your task report:** this trace is a careful reading of the code, not an actual test run. Recommend the user (or a CI job with real credentials) run `npx playwright test tests/skybook-admin.smoke.spec.js` against a real environment before fully trusting this rewrite.

- [ ] **Step 5: Commit**

```bash
git add tests/skybook-admin.smoke.spec.js
git commit -m "Rewrite smoke test to seed reservations via the public booking API instead of the admin form"
```

---

### Task 6: Final verification sweep

- [ ] **Step 1: Full syntax/brace check**

```bash
node --check assets/js/booking-admin.js
node --check tests/skybook-admin.smoke.spec.js
python3 -c "
content = open('assets/css/booking.css', encoding='utf-8').read()
print('css brace diff:', content.count('{') - content.count('}'))
"
```
All should show no errors / a 0 diff.

- [ ] **Step 2: Confirm no other code references the functions/CSS classes removed in Tasks 2-4**

```bash
grep -rn "applyBookingFormValues\|bookingHasOpenOperationalWork\|getStatusColor\b" assets/js/ booking-admin.html
grep -n "status-pill-provisional\|status-badge.is-confirmed\|booking-row.status-confirmed\|cal-day-block.status-confirmed" assets/css/booking.css
grep -n "automationExpiryHours\|autoCancelExpiredAwaitingPayment\|awaitingPaymentExpiryHours" booking-admin.html assets/js/booking-admin.js
```
All three should return zero matches.

- [ ] **Step 3: Review the full branch diff once, end to end**

```bash
git log --oneline main..HEAD
git diff main..HEAD --stat
```
Confirm the file list matches this plan's stated scope (`assets/js/booking-admin.js`, `booking-admin.html`, `assets/css/booking.css`, `tests/skybook-admin.smoke.spec.js`) and nothing else was touched.
