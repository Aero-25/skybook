# Status & Payment Simplification — Plan 1: Backend Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the booking lifecycle in `supabase/functions/booking-api/index.ts` down to four statuses (`provisional`/`finalised`/`cancelled`/`refunded`) and a method-based `payment_status` (`''`/`cash`/`card`/`eft`/`voucher`/`foc`), fixing every backend code path that currently reads, writes, or gates on the statuses being retired.

**Architecture:** No schema changes. `bookings.status` is a Postgres enum (`public.booking_status`) — retired values (`awaiting_details`, `confirmed`, `no_show`, `rescheduled`, `draft`, `pending`, `awaiting_payment`, `payment_pending`, `invoice`, `invoiced`, `partially_paid`, `fully_paid`, `completed`) stay defined in the enum but the application stops writing them. `bookings.payment_status` is already free text, no enum concerns.

**Tech Stack:** Deno Edge Function (TypeScript), Supabase JS client. No local Deno/tsc available in this environment — verification is a brace/paren-balance check plus manual trace-through of each changed branch; real syntax validation happens at `supabase functions deploy` time.

**Spec:** `docs/superpowers/specs/2026-07-15-skybook-status-payment-simplification-design.md`

**Scope of this plan:** `supabase/functions/booking-api/index.ts` only. Frontend (`booking-admin.js`/`.html`/CSS), the data migration for existing rows, and the Playwright smoke test are separate plans, sequenced after this one lands and is verified.

---

### Task 1: Simplify `BOOKING_STATUS_TRANSITIONS`

**Files:**
- Modify: `supabase/functions/booking-api/index.ts:117-135`

- [ ] **Step 1: Replace the transitions map**

Current code (lines 117-135):
```typescript
const BOOKING_STATUS_TRANSITIONS:Record<string,string[]>={
  // New two-field system
  // First stage: captured but guest/logistics details still missing → provisional → confirmed.
  awaiting_details:['provisional','confirmed','cancelled'],
  provisional:['awaiting_details','confirmed','cancelled','finalised'],
  confirmed:['awaiting_details','provisional','cancelled','finalised'],
  cancelled:['awaiting_details','provisional','confirmed'],
  // Legacy statuses kept for backwards-compat during migration
  payment_pending:['invoice','invoiced','partially_paid','fully_paid','finalised','cancelled','confirmed'],
  invoice:['invoiced','payment_pending','partially_paid','fully_paid','finalised','cancelled','confirmed'],
  invoiced:['partially_paid','fully_paid','finalised','cancelled','confirmed'],
  partially_paid:['fully_paid','finalised','cancelled','confirmed'],
  fully_paid:['finalised','cancelled','confirmed'],
  finalised:['cancelled','confirmed'],
  draft:['provisional','payment_pending','cancelled'],
  pending:['provisional','confirmed','payment_pending','invoice','invoiced','partially_paid','fully_paid','finalised','cancelled'],
  awaiting_payment:['provisional','confirmed','payment_pending','invoice','invoiced','partially_paid','fully_paid','finalised','cancelled'],
  completed:['finalised','cancelled','confirmed']
}
```

Replace with:
```typescript
const BOOKING_STATUS_TRANSITIONS:Record<string,string[]>={
  // Four statuses only: a website booking starts provisional, an admin-created one starts
  // finalised directly. Cancelled and refunded are the only ways off finalised (besides no-show,
  // which is a cancellation with a reason — see isNoShowWorkflow).
  provisional:['finalised','cancelled'],
  finalised:['cancelled','refunded'],
  cancelled:['finalised','provisional'],
  refunded:[]
}
```

- [ ] **Step 2: Verify brace balance**

Run:
```bash
cd "c:/Users/gerri/OneDrive/Desktop/Aero Projects/True Sky Ventures/skybook-main"
python3 -c "
content = open('supabase/functions/booking-api/index.ts', encoding='utf-8').read()
for a,b,name in [('{','}','braces'),('(',')','parens'),('[',']','brackets')]:
    print(name, content.count(a), content.count(b), content.count(a)-content.count(b))
"
```
Expected: all three counts show `0` difference (matches before/after this task, since braces were replaced 1:1).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/booking-api/index.ts
git commit -m "Simplify BOOKING_STATUS_TRANSITIONS to provisional/finalised/cancelled/refunded"
```

---

### Task 2: Update `createBooking` defaults and accepted status list

**Files:**
- Modify: `supabase/functions/booking-api/index.ts:3717-3719`

- [ ] **Step 1: Replace the status/payment default logic**

Current code (lines 3717-3719):
```typescript
  const bookingStatus=(['awaiting_details','provisional','confirmed','cancelled'].includes(desiredStatus) ? desiredStatus : null) || (isAdmin ? 'confirmed' : 'provisional')
  // Status 2 (payment_status): a confirmed booking is To Pay; pre-confirmed stays blank until confirmed.
  const paymentStatus=desiredPaymentStatus || (bookingStatus==='confirmed' ? 'to_pay' : '')
```

Replace with:
```typescript
  const bookingStatus=(['provisional','finalised','cancelled'].includes(desiredStatus) ? desiredStatus : null) || (isAdmin ? 'finalised' : 'provisional')
  // Payment Process: payment_status now directly holds the settlement method (cash/card/eft/voucher/foc)
  // or blank if not yet recorded. New bookings — admin or website — always start unpaid unless the
  // caller explicitly supplied a method.
  const paymentStatus=desiredPaymentStatus || ''
```

- [ ] **Step 2: Check the `confirmed_date` field a few lines below still makes sense**

Read `supabase/functions/booking-api/index.ts:3728-3732` (the `buildBookingInsert` object) — find this line:
```typescript
    confirmed_date:bookingStatus==='confirmed' ? (normalizeText(payload.preferred_date)||null) : null,
```
Replace with:
```typescript
    confirmed_date:bookingStatus==='finalised' ? (normalizeText(payload.preferred_date)||null) : null,
```

- [ ] **Step 3: Verify with a manual trace**

Trace these three scenarios by reading the edited code:
1. Admin creates a booking, no `status`/`payment_status` in payload → `desiredStatus=''`, not in `['provisional','finalised','cancelled']` → falls to `isAdmin ? 'finalised' : 'provisional'` → `'finalised'`. `paymentStatus=''`. Matches design.
2. Website submits a booking (`isAdmin=false`), no `status` in payload → same fallback → `'provisional'`. `paymentStatus=''`. Matches design.
3. `duplicateBooking` (Task 10, not yet updated) calls `createBooking` with `status:'pending'` (today) — `'pending'` is not in the accepted list, so it falls through to the `isAdmin` default (`duplicateBooking` always passes `isAdmin:true`) → `'finalised'`. Confirms Task 10's fix isn't even strictly required for correctness here, but is still done for clarity (see Task 10).

- [ ] **Step 4: Verify brace balance (same command as Task 1 Step 2) and commit**

```bash
git add supabase/functions/booking-api/index.ts
git commit -m "createBooking: default admin bookings to finalised, payment_status to blank"
```

---

### Task 3: Remove the "must be departed + fully paid" Finalised gate

**Files:**
- Modify: `supabase/functions/booking-api/index.ts:3965-3975`

- [ ] **Step 1: Delete the gate**

Current code (inside `updateBooking`, right after `validateBookingTransition`):
```typescript
  if(nextStatus==='finalised'&&normalizeText(existing.status)!=='finalised'){
    const preferredDate=parseDateValue(normalizeText(existing.preferred_date))
    const hasDeparted=preferredDate && preferredDate < new Date()
    if(!hasDeparted){
      throw new Error('A booking can only be finalised after the tour has departed.')
    }
    const isFullyPaid=['fully_paid','paid'].includes(nextPaymentStatus)||['fully_paid','paid'].includes(normalizeText(existing.payment_status))
    if(!isFullyPaid){
      throw new Error('A booking can only be finalised once it is fully paid.')
    }
  }
  if(nextStatus==='cancelled'&&normalizeText(existing.status)!=='cancelled'&&!normalizeText(payload.reason)){
```

Delete the entire `if(nextStatus==='finalised'&&...)` block (the 9 lines from `if(nextStatus==='finalised'...` through its closing `}`), leaving the file reading:
```typescript
  if(nextStatus==='cancelled'&&normalizeText(existing.status)!=='cancelled'&&!normalizeText(payload.reason)){
```
directly after `if(!isAdminEditWorkflow)validateBookingTransition(existing.status,nextStatus,nextPaymentStatus)`.

- [ ] **Step 2: Verify brace balance and commit**

```bash
cd "c:/Users/gerri/OneDrive/Desktop/Aero Projects/True Sky Ventures/skybook-main"
python3 -c "
content = open('supabase/functions/booking-api/index.ts', encoding='utf-8').read()
for a,b,name in [('{','}','braces'),('(',')','parens'),('[',']','brackets')]:
    print(name, content.count(a), content.count(b), content.count(a)-content.count(b))
"
git add supabase/functions/booking-api/index.ts
git commit -m "Remove departed+fully-paid gate on marking a booking Finalised"
```

---

### Task 4: Simplify `updateBooking`'s workflow flags

**Files:**
- Modify: `supabase/functions/booking-api/index.ts:3941-3961`

- [ ] **Step 1: Replace the whole workflow-flag block**

Current code (lines 3941-3961):
```typescript
  const isCancellationWorkflow=workflowAction==='cancel_booking'&&nextStatus==='cancelled'&&Boolean(normalizeText(payload.reason))
  const isNoShowWorkflow=workflowAction==='no_show'&&nextStatus==='no_show'&&Boolean(normalizeText(payload.reason))
  const isRescheduleWorkflow=workflowAction==='reschedule'&&nextStatus==='rescheduled'&&Boolean(normalizeText(payload.reason))
  const isReservationAcceptanceWorkflow=workflowAction==='accept_reservation'
    && ['draft','pending','provisional'].includes(normalizeText(existing.status))
    && ['payment_pending','invoice','invoiced','partially_paid','fully_paid','finalised','awaiting_payment','confirmed'].includes(nextStatus)
  const isReinstateWorkflow=workflowAction==='reinstate'
    && normalizeText(existing.status)==='cancelled'
    && ['pending','provisional','awaiting_payment'].includes(nextStatus)
    && Boolean(normalizeText(payload.reason))
  const isProvisionalWorkflow=workflowAction==='save_provisional'
    && nextStatus==='provisional'
  const isConfirmBookingWorkflow=workflowAction==='confirm_booking'
    && ['provisional','pending','awaiting_payment'].includes(normalizeText(existing.status))
    && nextStatus==='confirmed'
  const isUpdatePaymentStatusWorkflow=workflowAction==='update_payment_status'
    && normalizeText(existing.status)==='confirmed'
    && ['to_pay','partially_paid','paid','foc'].includes(nextPaymentStatus)
  const isAdminEditWorkflow=workflowAction==='admin_edit'
  if((statusChangeRequested||paymentStatusChangeRequested)&&!isSystemActor&&!isAdminEditWorkflow&&!isCancellationWorkflow&&!isNoShowWorkflow&&!isRescheduleWorkflow&&!isReservationAcceptanceWorkflow&&!isReinstateWorkflow&&!isProvisionalWorkflow&&!isConfirmBookingWorkflow&&!isUpdatePaymentStatusWorkflow){
    throw new Error('Booking status is controlled by SkyBook workflows. Use payment, cancellation, reschedule, reservation acceptance, reinstate, or automation actions.')
  }
```

Replace with:
```typescript
  // isNoShowWorkflow now targets 'cancelled' (no-show folds into cancellation, same reason requirement).
  const isCancellationWorkflow=workflowAction==='cancel_booking'&&nextStatus==='cancelled'&&Boolean(normalizeText(payload.reason))
  const isNoShowWorkflow=workflowAction==='no_show'&&nextStatus==='cancelled'&&Boolean(normalizeText(payload.reason))
  // Reschedule no longer changes status at all (see rescheduleBooking) — no flag needed for it here;
  // a reschedule PATCH never includes `status`, so statusChangeRequested is false and this whole
  // authorization block is skipped for that call entirely.
  // isReservationAcceptanceWorkflow now only ever targets 'finalised' (accepting a website booking).
  // Declining one goes through isCancellationWorkflow instead (nextStatus:'cancelled', reason).
  const isReservationAcceptanceWorkflow=workflowAction==='accept_reservation'
    && ['provisional'].includes(normalizeText(existing.status))
    && nextStatus==='finalised'
  // isReinstateWorkflow now serves two callers: reinstating a cancelled booking back to active
  // (finalised), and reinstating a declined reservation back to needing review (provisional).
  const isReinstateWorkflow=workflowAction==='reinstate'
    && normalizeText(existing.status)==='cancelled'
    && ['finalised','provisional'].includes(nextStatus)
    && Boolean(normalizeText(payload.reason))
  const isConfirmBookingWorkflow=workflowAction==='confirm_booking'
    && normalizeText(existing.status)==='provisional'
    && nextStatus==='finalised'
  const isUpdatePaymentStatusWorkflow=workflowAction==='update_payment_status'
    && normalizeText(existing.status)==='finalised'
    && ['','cash','card','eft','voucher','foc'].includes(nextPaymentStatus)
  const isAdminEditWorkflow=workflowAction==='admin_edit'
  if((statusChangeRequested||paymentStatusChangeRequested)&&!isSystemActor&&!isAdminEditWorkflow&&!isCancellationWorkflow&&!isNoShowWorkflow&&!isReservationAcceptanceWorkflow&&!isReinstateWorkflow&&!isConfirmBookingWorkflow&&!isUpdatePaymentStatusWorkflow){
    throw new Error('Booking status is controlled by SkyBook workflows. Use payment, cancellation, reservation acceptance, reinstate, or automation actions.')
  }
```

Note what changed: `isRescheduleWorkflow` and `isProvisionalWorkflow` are deleted entirely (the former because reschedule no longer sends `status`, so the whole gate is skipped for it — see Task 11; the latter because `grep -n "save_provisional" assets/js/booking-admin.js` returns no results, confirming no frontend caller exists — it was dead code).

- [ ] **Step 2: Verify brace balance**

Run the same brace/paren/bracket check as Task 1 Step 2.

- [ ] **Step 3: Manual trace of the 4 real workflows**

Read the edited block and confirm:
1. **Accept**: `workflow_action:'accept_reservation'`, `existing.status==='provisional'`, `nextStatus==='finalised'` → `isReservationAcceptanceWorkflow=true` → PATCH allowed.
2. **Decline** (sends `workflow_action:'cancel_booking'`, `status:'cancelled'`, a `reason` — see Plan 2 Task for the frontend fix that adds the missing `workflow_action`): `isCancellationWorkflow=true` → PATCH allowed.
3. **No-show**: `workflow_action:'no_show'`, `nextStatus:'cancelled'`, reason present → `isNoShowWorkflow=true` → PATCH allowed.
4. **Reschedule**: payload has no `status` key at all (Task 11) → `statusChangeRequested=false` → outer `if` never evaluates the workflow flags at all → PATCH allowed unconditionally for the date-only change (as intended — reschedule never needed status authorization once it stopped touching status).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/booking-api/index.ts
git commit -m "Simplify updateBooking workflow flags to the 4-status model"
```

---

### Task 5: Update remaining `confirmed`/`completed`/`draft`/`pending`-dependent gates

**Files:**
- Modify: `supabase/functions/booking-api/index.ts:819, 2957, 2970-2977, 2983, 2996, 3510, 4028, 4143`

These are independent fixes scattered through the file — each currently gates a real feature on statuses the new model will never produce, which would silently stop that feature firing (not error — just quietly never trigger again).

- [ ] **Step 1: Tour memories upload gate (line 819)**

Current:
```typescript
  if(normalizeText(booking.status)!=='completed')throw new Error('Tour memories can only be uploaded after the booking is finalised.')
```
Replace with:
```typescript
  if(normalizeText(booking.status)!=='finalised')throw new Error('Tour memories can only be uploaded after the booking is finalised.')
```

- [ ] **Step 2: `buildLifecycleTaskBlueprints` follow-up task blueprints (lines 2957, 2970-2977)**

This function auto-generates operational follow-up tasks. Two of its conditions check statuses/payment values the new model never produces, which would silently stop generating those tasks entirely (not error — the `if` just never becomes true again).

Current (line 2957):
```typescript
  if(['draft','pending'].includes(status)){
```
Replace with:
```typescript
  if(status==='provisional'){
```
(A provisional — unreviewed website — booking is exactly the case that needs a "review and confirm" follow-up task; `finalised`/`cancelled`/`refunded` bookings don't.)

Current (lines 2970-2980):
```typescript
  if(['pending','unpaid','partially_paid','authorized'].includes(paymentStatus) && outstanding>0){
    blueprints.push({
      auto_key:'payment_chase',
      task_type:'payment_chase',
      title:'Chase outstanding payment',
      description:`Outstanding balance of ${outstanding.toFixed(2)} is still open on the booking.`,
      team:'finance',
      priority:status==='awaiting_payment' ? 'critical' : 'high',
      due_at:addHours(now,12),
      sort_order:20
    })
  }
```
Replace with:
```typescript
  // A "chase outstanding payment" task is only about the balance, not which payment_status string is
  // set — under the new method-only model, an unpaid booking simply has payment_status:'' (blank),
  // which doesn't need special-casing here: any outstanding balance warrants the task.
  if(outstanding>0){
    blueprints.push({
      auto_key:'payment_chase',
      task_type:'payment_chase',
      title:'Chase outstanding payment',
      description:`Outstanding balance of ${outstanding.toFixed(2)} is still open on the booking.`,
      team:'finance',
      priority:'high',
      due_at:addHours(now,12),
      sort_order:20
    })
  }
```

- [ ] **Step 3: Operational readiness checks (lines 2983, 2996)**

Current:
```typescript
  if(status==='confirmed' && !hasOperator){
```
and
```typescript
  if(status==='confirmed' && preferredDate && !hasResources){
```
Replace both occurrences of `status==='confirmed'` with `status==='finalised'` in these two lines (leave the rest of each line unchanged).

- [ ] **Step 4: Automated office settlement gate (line 3510)**

Current:
```typescript
  if(!['confirmed','completed'].includes(normalizeText(booking.status)))return null
```
Replace with:
```typescript
  if(normalizeText(booking.status)!=='finalised')return null
```

- [ ] **Step 5: `confirmed_date` tracking on update (line 4028)**

Current:
```typescript
    confirmed_date:['confirmed','completed'].includes(String(nextStatus)) ? (nextPreferredDate || existing.confirmed_date) : existing.confirmed_date,
```
Replace with:
```typescript
    confirmed_date:nextStatus==='finalised' ? (nextPreferredDate || existing.confirmed_date) : existing.confirmed_date,
```

- [ ] **Step 6: Operator settlement job dispatch (line 4143)**

Current:
```typescript
  if(['confirmed','completed'].includes(String(updatePayload.status))){
```
Replace with:
```typescript
  if(String(updatePayload.status)==='finalised'){
```

- [ ] **Step 7: Verify brace balance and commit**

```bash
cd "c:/Users/gerri/OneDrive/Desktop/Aero Projects/True Sky Ventures/skybook-main"
python3 -c "
content = open('supabase/functions/booking-api/index.ts', encoding='utf-8').read()
for a,b,name in [('{','}','braces'),('(',')','parens'),('[',']','brackets')]:
    print(name, content.count(a), content.count(b), content.count(a)-content.count(b))
"
git add supabase/functions/booking-api/index.ts
git commit -m "Point tour-memories/operational-readiness/settlement gates at finalised"
```

---

### Task 6: Remove `createManualBookingPayment`'s auto-promotion to `confirmed`

**Files:**
- Modify: `supabase/functions/booking-api/index.ts:2462-2463`

- [ ] **Step 1: Remove the promotion**

Current:
```typescript
  const lifecyclePromotes=['draft','pending','provisional','payment_pending','awaiting_payment','payment_request_sent'].includes(currentStatus)
  const nextBookingStatus=(nextPaymentStatus==='paid'||nextPaymentStatus==='partially_paid') && lifecyclePromotes ? 'confirmed' : currentStatus
```
Replace with:
```typescript
  // Recording a payment no longer changes the lifecycle status by itself — a still-unreviewed
  // provisional website booking must go through Reservation Management before it becomes finalised,
  // and a finalised booking simply stays finalised regardless of payment activity.
  const nextBookingStatus=currentStatus
```

- [ ] **Step 2: Check for now-unused variables**

Search the function body (a few lines below, inside the same `createManualBookingPayment` function) for any other reference to `lifecyclePromotes` — there should be none after this edit (it was only used in the deleted line). If a linter/type-checker is run at deploy time and flags an unused variable, that's expected and harmless — Deno does not fail builds on unused `const` by default, so this is not blocking, but confirm no other code path reads it.

- [ ] **Step 3: Verify brace balance and commit**

```bash
cd "c:/Users/gerri/OneDrive/Desktop/Aero Projects/True Sky Ventures/skybook-main"
python3 -c "
content = open('supabase/functions/booking-api/index.ts', encoding='utf-8').read()
for a,b,name in [('{','}','braces'),('(',')','parens'),('[',']','brackets')]:
    print(name, content.count(a), content.count(b), content.count(a)-content.count(b))
"
git add supabase/functions/booking-api/index.ts
git commit -m "Stop auto-promoting a booking's status when a payment is recorded"
```

---

### Task 7: Remove `runStatusAutomations` and its dispatch

**Files:**
- Modify: `supabase/functions/booking-api/index.ts:2203-2234` (function body), `2244-2246` (switch case), `3853-3859` and `4134-4142` (enqueue call sites)

- [ ] **Step 1: Read the full function to confirm exact bounds**

Run:
```bash
grep -n "runStatusAutomations\|^const processSystemJob" "c:/Users/gerri/OneDrive/Desktop/Aero Projects/True Sky Ventures/skybook-main/supabase/functions/booking-api/index.ts"
```
Confirm the function still starts at `const runStatusAutomations=async(job:Json)=>{` and ends before `const processSystemJob=async(job:Json)=>{` (there should be exactly one blank line and the closing `}` of `runStatusAutomations` between them, per the earlier read of this file at lines 2203-2236).

- [ ] **Step 2: Delete the function**

Delete the entire block from `const runStatusAutomations=async(job:Json)=>{` through its matching closing `}` (lines 2203-2234 as last read — re-confirm exact end line from Step 1's grep output before deleting, since line numbers may have shifted slightly from earlier tasks in this plan).

- [ ] **Step 3: Delete the dispatch case**

Current (inside `processSystemJob`'s switch statement):
```typescript
      case 'status_automation':
        await runStatusAutomations(job)
        break
```
Delete these 3 lines entirely.

- [ ] **Step 4: Delete the first enqueue call site**

Current (inside `createBooking`, right after the WhatsApp alert):
```typescript
  void sendWhatsAppMessage(consultantWhatsApp,waBody).catch(err=>console.error('WhatsApp alert failed:',err?.message))
  await enqueueSystemJob({
    job_type:'status_automation',
    job_group:'operations',
    priority:'normal',
    booking_id:bookingId,
    created_by:userId || null
  })
  await processDueSystemJobs()
```
Replace with:
```typescript
  void sendWhatsAppMessage(consultantWhatsApp,waBody).catch(err=>console.error('WhatsApp alert failed:',err?.message))
  await processDueSystemJobs()
```

- [ ] **Step 5: Delete the second enqueue call site**

Current (inside `updateBooking`, right after `syncReconciliationRecordForBooking`):
```typescript
  await syncReconciliationRecordForBooking(id,userId)
  if(String(updatePayload.payment_status)==='paid' || String(updatePayload.status)!==String(existing.status)){
    await enqueueSystemJob({
      job_type:'status_automation',
      job_group:'operations',
      priority:String(updatePayload.payment_status)==='paid' ? 'high' : 'normal',
      booking_id:id,
      created_by:userId
    })
  }
  if(['confirmed','completed'].includes(String(updatePayload.status))){
```
Replace with:
```typescript
  await syncReconciliationRecordForBooking(id,userId)
  if(String(updatePayload.status)==='finalised'){
```
(Note: this merges with Task 5 Step 5's edit to the operator-settlement gate — if Task 5 was completed first, the line will already read `if(String(updatePayload.status)==='finalised'){` at this point; this step is only deleting the `status_automation` enqueue block that sits immediately above it. If you're applying tasks out of order, make sure the net result is: the `status_automation` enqueue block is gone, and the very next `if` checks `updatePayload.status==='finalised'` for the `operator_settlement_check` job.)

- [ ] **Step 6: Verify brace balance and commit**

```bash
cd "c:/Users/gerri/OneDrive/Desktop/Aero Projects/True Sky Ventures/skybook-main"
python3 -c "
content = open('supabase/functions/booking-api/index.ts', encoding='utf-8').read()
for a,b,name in [('{','}','braces'),('(',')','parens'),('[',']','brackets')]:
    print(name, content.count(a), content.count(b), content.count(a)-content.count(b))
"
git add supabase/functions/booking-api/index.ts
git commit -m "Remove the auto-confirm/auto-finalise automations (runStatusAutomations)"
```

---

### Task 8: Remove `sweepPaymentPendingTransitions`

**Files:**
- Modify: `supabase/functions/booking-api/index.ts:2286-2311` (function body), `2327` (call site inside `processDueSystemJobs`)

- [ ] **Step 1: Delete the call site**

Current (inside `processDueSystemJobs`, right before its `return processed`):
```typescript
  void sweepPaymentPendingTransitions().catch(()=>{})
  return processed
```
Replace with:
```typescript
  return processed
```

- [ ] **Step 2: Delete the function**

Delete the entire `const sweepPaymentPendingTransitions=async()=>{ ... }` block (as last read, lines 2286-2311 — re-confirm exact bounds with `grep -n "const sweepPaymentPendingTransitions\|^const processDueSystemJobs" supabase/functions/booking-api/index.ts` before deleting, since prior tasks shift line numbers).

- [ ] **Step 3: Verify brace balance and commit**

```bash
cd "c:/Users/gerri/OneDrive/Desktop/Aero Projects/True Sky Ventures/skybook-main"
python3 -c "
content = open('supabase/functions/booking-api/index.ts', encoding='utf-8').read()
for a,b,name in [('{','}','braces'),('(',')','parens'),('[',']','brackets')]:
    print(name, content.count(a), content.count(b), content.count(a)-content.count(b))
"
git add supabase/functions/booking-api/index.ts
git commit -m "Remove the to_pay sweep automation (sweepPaymentPendingTransitions)"
```

---

### Task 9: Fix `restoreBooking`'s fallback logic

**Files:**
- Modify: `supabase/functions/booking-api/index.ts:4195-4222`

- [ ] **Step 1: Replace the fallback computation**

Current:
```typescript
const restoreBooking=async(bookingId:string,userId:string)=>{
  const booking=await safeMaybeSingle<Json>(adminClient.from('bookings').select('*').eq('id',bookingId).maybeSingle())
  if(!booking)throw new Error('Booking not found.')
  const metadata=normalizeJsonRecord(booking.metadata)
  const originalStatus=normalizeText(metadata.trash?.original_status)
  const originalPaymentStatus=normalizeText(metadata.trash?.original_payment_status)
  const fallbackPaymentStatus=normalizeText(booking.payment_status)==='cancelled' ? 'pending' : normalizeText(booking.payment_status) || 'pending'
  const nextStatus=originalStatus && originalStatus!=='cancelled'
    ? originalStatus
    : (fallbackPaymentStatus==='paid' ? 'confirmed' : 'awaiting_payment')
  const nextPaymentStatus=originalPaymentStatus || fallbackPaymentStatus
  const recordScope=normalizeText(metadata.trash?.scope) || (['draft','pending'].includes(nextStatus) ? 'reservation' : 'booking')
```

Replace with:
```typescript
const restoreBooking=async(bookingId:string,userId:string)=>{
  const booking=await safeMaybeSingle<Json>(adminClient.from('bookings').select('*').eq('id',bookingId).maybeSingle())
  if(!booking)throw new Error('Booking not found.')
  const metadata=normalizeJsonRecord(booking.metadata)
  const originalStatus=normalizeText(metadata.trash?.original_status)
  const originalPaymentStatus=normalizeText(metadata.trash?.original_payment_status)
  // A trashed record's original status is only ever 'provisional' (only reservations can be trashed —
  // see archiveBooking) — restoring it goes back to provisional for review, or finalised as a safe
  // fallback if no original status was recorded at all.
  const nextStatus=(originalStatus && originalStatus!=='cancelled') ? originalStatus : 'finalised'
  const nextPaymentStatus=originalPaymentStatus || (normalizeText(booking.payment_status)==='cancelled' ? '' : normalizeText(booking.payment_status))
  const recordScope=normalizeText(metadata.trash?.scope) || (nextStatus==='provisional' ? 'reservation' : 'booking')
```

- [ ] **Step 2: Verify brace balance and commit**

```bash
cd "c:/Users/gerri/OneDrive/Desktop/Aero Projects/True Sky Ventures/skybook-main"
python3 -c "
content = open('supabase/functions/booking-api/index.ts', encoding='utf-8').read()
for a,b,name in [('{','}','braces'),('(',')','parens'),('[',']','brackets')]:
    print(name, content.count(a), content.count(b), content.count(a)-content.count(b))
"
git add supabase/functions/booking-api/index.ts
git commit -m "restoreBooking: fall back to finalised/blank instead of confirmed/awaiting_payment"
```

---

### Task 10: Fix `duplicateBooking`'s defaults

**Files:**
- Modify: `supabase/functions/booking-api/index.ts:4239-4240`

- [ ] **Step 1: Update the defaults**

Current:
```typescript
    status:normalizeText(payload.status) || 'pending',
    payment_status:normalizeText(payload.payment_status) || 'pending',
```
Replace with:
```typescript
    status:normalizeText(payload.status) || 'finalised',
    payment_status:normalizeText(payload.payment_status) || '',
```

- [ ] **Step 2: Verify brace balance and commit**

```bash
cd "c:/Users/gerri/OneDrive/Desktop/Aero Projects/True Sky Ventures/skybook-main"
python3 -c "
content = open('supabase/functions/booking-api/index.ts', encoding='utf-8').read()
for a,b,name in [('{','}','braces'),('(',')','parens'),('[',']','brackets')]:
    print(name, content.count(a), content.count(b), content.count(a)-content.count(b))
"
git add supabase/functions/booking-api/index.ts
git commit -m "duplicateBooking: default to finalised/blank instead of pending/pending"
```

---

### Task 11: Fix `rescheduleBooking` to stop changing status

**Files:**
- Modify: `supabase/functions/booking-api/index.ts:4253-4266`

- [ ] **Step 1: Remove the status computation and the status field from the PATCH**

Current:
```typescript
const rescheduleBooking=async(bookingId:string,payload:Json,userId:string)=>{
  const preferredDate=normalizeText(payload.preferred_date)
  if(!preferredDate)throw new Error('A new preferred date is required to reschedule.')
  const existing=await safeMaybeSingle<Json>(adminClient.from('bookings').select('status').eq('id',bookingId).maybeSingle())
  if(!existing)throw new Error('Booking not found.')
  const existingStatus=normalizeText(existing.status)
  const nextStatus=['completed','cancelled','refunded'].includes(existingStatus) ? existingStatus : 'rescheduled'
  return updateBooking(bookingId,{
    preferred_date:preferredDate,
    status:nextStatus,
    reason:normalizeText(payload.reason) || 'Booking rescheduled in SkyBook',
    workflow_action:'reschedule'
  },userId)
}
```

Replace with:
```typescript
const rescheduleBooking=async(bookingId:string,payload:Json,userId:string)=>{
  const preferredDate=normalizeText(payload.preferred_date)
  if(!preferredDate)throw new Error('A new preferred date is required to reschedule.')
  const existing=await safeMaybeSingle<Json>(adminClient.from('bookings').select('status').eq('id',bookingId).maybeSingle())
  if(!existing)throw new Error('Booking not found.')
  // Rescheduling only ever changes the tour date — status is left exactly as it was. No `status`
  // key is included in the PATCH below, so updateBooking's workflow-authorization check (which only
  // fires when a status/payment_status change is requested) never triggers for this call.
  return updateBooking(bookingId,{
    preferred_date:preferredDate,
    reason:normalizeText(payload.reason) || 'Booking rescheduled in SkyBook',
    workflow_action:'reschedule'
  },userId)
}
```

- [ ] **Step 2: Verify brace balance**

Run the same check as prior tasks.

- [ ] **Step 3: Manual trace**

Confirm by reading `updateBooking`'s top (around where `statusChangeRequested` is computed): `statusChangeRequested=Object.prototype.hasOwnProperty.call(payload,'status')&&nextStatus!==normalizeText(existing.status)`. Since the reschedule payload no longer has a `status` key, `hasOwnProperty.call(payload,'status')` is `false`, so `statusChangeRequested=false` regardless of what `nextStatus` defaults to (`normalizeText(payload.status)||existing.status` → `existing.status`, i.e. unchanged). This confirms the booking's status is left untouched and the authorization gate is bypassed correctly for this call.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/booking-api/index.ts
git commit -m "rescheduleBooking: only update the tour date, never change status"
```

---

### Task 12: Fix `generateBookingPaymentLink`'s payment_status bug

**Files:**
- Modify: `supabase/functions/booking-api/index.ts:4710-4716`

- [ ] **Step 1: Replace the status/payment mutation**

Current:
```typescript
  const currentStatus=normalizeText(booking.status)
  const currentPaymentStatus=normalizeText(booking.payment_status)
  const nextStatus=['draft','pending','payment_request_sent'].includes(currentStatus) ? 'awaiting_payment' : currentStatus
  const nextPaymentStatus=['paid','partially_paid'].includes(currentPaymentStatus) ? currentPaymentStatus : 'pending'
  const { error }=await adminClient.from('bookings').update({
    status:nextStatus,
    payment_status:nextPaymentStatus,
```

Replace with:
```typescript
  // Generating a payment link never changes the booking's lifecycle status, and must not clobber a
  // real recorded payment method with a placeholder value — only touch payment_status if nothing
  // has been recorded yet.
  const currentPaymentStatus=normalizeText(booking.payment_status)
  const nextPaymentStatus=currentPaymentStatus || ''
  const { error }=await adminClient.from('bookings').update({
    payment_status:nextPaymentStatus,
```

- [ ] **Step 2: Verify brace balance**

Run the same check as prior tasks.

- [ ] **Step 3: Manual trace**

Before this fix: generating a payment link for an unpaid booking (`currentPaymentStatus=''`) set `payment_status:'pending'` — `'pending'` is a retired value under the new model, so this would have silently corrupted the field on every click. After the fix: `nextPaymentStatus=''||'' =''` — stays blank, correctly representing "still unpaid." For a booking already marked `payment_status:'cash'`: `nextPaymentStatus='cash'||''='cash'` — unchanged, correct.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/booking-api/index.ts
git commit -m "generateBookingPaymentLink: stop writing a placeholder payment_status/status"
```

---

### Task 13: Fix `archiveBooking`'s trash-eligibility gate

**Files:**
- Modify: `supabase/functions/booking-api/index.ts:4160`

- [ ] **Step 1: Update the gate**

Current:
```typescript
  if(!['draft','pending'].includes(currentStatus)){
    throw new Error('Only reservations may be moved to trash. Cancel bookings with a valid reason instead.')
  }
```
Replace with:
```typescript
  if(currentStatus!=='provisional'){
    throw new Error('Only reservations may be moved to trash. Cancel bookings with a valid reason instead.')
  }
```

- [ ] **Step 2: Verify brace balance and commit**

```bash
cd "c:/Users/gerri/OneDrive/Desktop/Aero Projects/True Sky Ventures/skybook-main"
python3 -c "
content = open('supabase/functions/booking-api/index.ts', encoding='utf-8').read()
for a,b,name in [('{','}','braces'),('(',')','parens'),('[',']','brackets')]:
    print(name, content.count(a), content.count(b), content.count(a)-content.count(b))
"
git add supabase/functions/booking-api/index.ts
git commit -m "archiveBooking: only provisional reservations are trashable"
```

---

### Task 14: Update the `statusBreakdown` reporting array

**Files:**
- Modify: `supabase/functions/booking-api/index.ts:3616`

- [ ] **Step 1: Update the array**

Current:
```typescript
  const statusBreakdown=['provisional','payment_pending','invoice','invoiced','partially_paid','fully_paid','finalised','cancelled'].map(status=>({
```
Replace with:
```typescript
  const statusBreakdown=['provisional','finalised','cancelled','refunded'].map(status=>({
```

- [ ] **Step 2: Verify brace balance and commit**

```bash
cd "c:/Users/gerri/OneDrive/Desktop/Aero Projects/True Sky Ventures/skybook-main"
python3 -c "
content = open('supabase/functions/booking-api/index.ts', encoding='utf-8').read()
for a,b,name in [('{','}','braces'),('(',')','parens'),('[',']','brackets')]:
    print(name, content.count(a), content.count(b), content.count(a)-content.count(b))
"
git add supabase/functions/booking-api/index.ts
git commit -m "Report status breakdown against the 4-status model"
```

---

### Task 15: Final full-file verification

**Files:**
- Read-only verification across `supabase/functions/booking-api/index.ts`

- [ ] **Step 1: Confirm no remaining writes of retired status values**

Run:
```bash
cd "c:/Users/gerri/OneDrive/Desktop/Aero Projects/True Sky Ventures/skybook-main"
grep -n "status:'confirmed'\|status:'awaiting_details'\|status:'no_show'\|status:'rescheduled'\|status:'draft'\|status:'pending'\|status:'awaiting_payment'\|status:'payment_pending'\|status:'completed'" supabase/functions/booking-api/index.ts
```
Expected: no output (empty). If anything appears, it's a missed write site from this plan — go back and fix it before continuing.

- [ ] **Step 2: Confirm no remaining writes of retired payment_status values**

Run:
```bash
grep -n "payment_status:'to_pay'\|payment_status:'pending'\|payment_status:'invoice'\|payment_status:'invoiced'\|payment_status:'fully_paid'\|payment_status:'cancelled'" supabase/functions/booking-api/index.ts
```
Expected: no output. (`payment_status:'paid'` and `payment_status:'partially_paid'` are expected to still appear inside `createManualBookingPayment`'s own amount-based calculation — that's a different, untouched code path per the spec's "Out of scope" section; this grep intentionally excludes those two values.)

- [ ] **Step 3: Final brace/paren/bracket balance check**

```bash
python3 -c "
content = open('supabase/functions/booking-api/index.ts', encoding='utf-8').read()
for a,b,name in [('{','}','braces'),('(',')','parens'),('[',']','brackets')]:
    print(name, content.count(a), content.count(b), content.count(a)-content.count(b))
"
```
Expected: all three show `0` difference.

- [ ] **Step 4: Review the full diff against origin before pushing**

```bash
git log --oneline origin/main..HEAD
git diff origin/main..HEAD -- supabase/functions/booking-api/index.ts
```
Read through the full diff once, end to end, checking each hunk against the corresponding task above.

- [ ] **Step 5: Note for the user**

This plan does not push to `origin/main` or run a real Deno type-check — there's no local Deno/tsc available in this environment. Real syntax/type validation happens the next time this function is deployed via `supabase functions deploy` (see `reference_skybook_supabase_deploy.md` in memory for the deploy command). Recommend deploying to a staging/preview project (or running `deno check` locally if available) before this reaches production, given the size of this change.
