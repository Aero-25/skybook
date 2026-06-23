# SkyBook Finance & Reporting Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 SkyBook issues — block overpayment, fix refund-by-reference, reprice on pax change, add FOC payment status, and add Word/Excel report exports with a polished look — then backfill existing bookings, mirror to `Skybook Final`, and push `skybook-main` to GitHub.

**Architecture:** Most logic lives in the Supabase edge function `booking-api/index.ts` (Deno) and the admin SPA `assets/js/booking-admin.js` + `booking-admin.html`. There is no unit-test harness for the edge function; verification is via the existing Playwright smoke (`tests/skybook-admin.smoke.spec.js` + `scripts/smoke-server.mjs`) and manual reproduction of each reported bug. `bookings.payment_status` is a free-text column (migration 202606050001), so FOC needs no schema change; only the bulk backfill is a migration.

**Tech Stack:** Deno/Supabase edge functions, vanilla JS admin SPA, Postgres (Supabase), `html2pdf` (existing CDN) + SheetJS (new CDN) for exports.

**Mirror rule:** every change below is also applied to `Skybook Final/`. Frontend/HTML/CSS apply identically; the `Skybook Final` backend has diverged ~227 lines and must be edited **by hand (additively)**, never blind-copied.

---

## File structure

- `supabase/functions/booking-api/index.ts` — backend logic for #1, #2, #3, #5.
- `supabase/migrations/202606230001_skybook_recalculate_booking_finances.sql` — backfill (#3b), new.
- `assets/js/booking-admin.js` — overpayment checkbox + pre-validate (#1), refund label (#2), FOC popup + display (#5), report restyle + Word/Excel exports (#4).
- `booking-admin.html` — overpayment checkbox (#1), FOC option (#5), export controls (#4).
- Mirror targets under `Skybook Final/` for each of the above.

---

## Task 1: Block overpayment in `createManualBookingPayment` (#1, backend)

**Files:**
- Modify: `skybook-main/supabase/functions/booking-api/index.ts` (`createManualBookingPayment`, ~2360–2380)

- [ ] **Step 1: Add the overpayment guard** after `const outstandingAmount` is known. Replace the block computing `nextReceived`/`totalAmount` (lines ~2375–2379) with:

```ts
  const previousReceived=Number(existingPayment?.amount_received || 0)
  const totalAmount=Number(booking.total_amount || existingPayment?.amount || 0)
  const allowOverpayment=payload.allow_overpayment===true
  const outstandingBeforeThis=Number(Math.max(0,(totalAmount-previousReceived)).toFixed(2))
  if(!allowOverpayment){
    if(normalizeText(booking.payment_status)==='foc' || totalAmount<=0){
      throw new Error('This booking is Free of Charge — there is nothing to pay. Tick "Allow overpayment" only if you must record money against it.')
    }
    if(previousReceived+0.01>=totalAmount && totalAmount>0){
      throw new Error(`Booking is already fully paid (received ${previousReceived.toFixed(2)} of ${totalAmount.toFixed(2)}). Tick "Allow overpayment" to record an additional amount.`)
    }
    if(amount>outstandingBeforeThis+0.01){
      throw new Error(`Payment of ${amount.toFixed(2)} exceeds the outstanding balance of ${outstandingBeforeThis.toFixed(2)}. Reduce the amount or tick "Allow overpayment".`)
    }
  }
  const nextReceived=Number((previousReceived+amount).toFixed(2))
  const nextPaymentStatus=nextReceived>0 && nextReceived+0.01>=totalAmount ? 'paid' : 'partially_paid'
  const outstandingAmount=Math.max(0,Number((totalAmount-nextReceived).toFixed(2)))
```

(Keep the rest of the function unchanged. Note `amount` is already validated `>0` above this block.)

- [ ] **Step 2: Verify it compiles** — run `deno check supabase/functions/booking-api/index.ts` (from `skybook-main`). Expected: no type errors. If `deno` is unavailable, do a manual read-through for balanced braces.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/booking-api/index.ts
git commit -m "fix(booking-api): block manual overpayment unless explicitly allowed"
```

---

## Task 2: Refund by reference-or-UUID + cap to amount paid (#2, backend)

**Files:**
- Modify: `skybook-main/supabase/functions/booking-api/index.ts` (`createRefund`, ~3222)

- [ ] **Step 1: Add a UUID-or-reference resolver** immediately above `const createRefund`:

```ts
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const resolveBookingByIdOrReference=async(value:string):Promise<Json>=>{
  const raw=String(value||'').trim()
  if(!raw)throw new Error('A booking ID or reference is required.')
  if(UUID_RE.test(raw)){
    const byId=await safeMaybeSingle<Json>(adminClient.from('bookings').select('*').eq('id',raw).maybeSingle())
    if(byId)return byId
  }
  const byRef=await safeMaybeSingle<Json>(adminClient.from('bookings').select('*').ilike('reference',raw).maybeSingle())
  if(byRef)return byRef
  throw new Error(`No booking found for "${raw}".`)
}
```

- [ ] **Step 2: Use the resolver and cap the amount** — replace the first three lines of `createRefund` (the `booking`/`payment`/`amount` setup, ~3223–3226) with:

```ts
const createRefund=async(bookingIdOrRef:string,payload:Json,userId:string)=>{
  const booking=await resolveBookingByIdOrReference(bookingIdOrRef)
  const bookingId=String(booking.id)
  const payment=await safeMaybeSingle<Json>(adminClient.from('payments').select('*').eq('booking_id',bookingId).maybeSingle())
  const amountPaid=Number(Math.max(0,Number(payment?.amount_received || payment?.amount || 0)))
  const requested=Math.max(0,Number(payload.amount || booking.total_amount || 0))
  if(amountPaid<=0)throw new Error('Nothing has been paid on this booking, so there is nothing to refund.')
  const amount=Number(Math.min(requested,amountPaid).toFixed(2))
```

All later references to `bookingId` in the function now resolve correctly (they already use the `bookingId` variable). Remove the now-duplicated old `const booking=`/`const payment=`/`const amount=` lines.

- [ ] **Step 3: Verify** — `deno check supabase/functions/booking-api/index.ts`. Expected: no errors. Manually confirm there is exactly one declaration each of `booking`, `bookingId`, `payment`, `amount` in `createRefund`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/booking-api/index.ts
git commit -m "fix(booking-api): resolve refunds by reference or UUID and cap to amount paid"
```

---

## Task 3: Reprice on pax change; ignore stale price override (#3, backend)

**Files:**
- Modify: `skybook-main/supabase/functions/booking-api/index.ts` (`updateBooking`, ~3911–3917 + `updatePayload`)

- [ ] **Step 1: Detect deliberate vs stale override.** Replace the override resolution (~3916–3917):

```ts
  const submittedOverride=Number(payload.price_override||requestMetadata.price_override||0)
  const previousTotal=Number(existing.total_amount||0)
  // A submitted override equal to the existing total is the auto-prefilled value, not a
  // deliberate one — treat it as stale so a pax change reprices instead of pinning the total.
  const overrideIsDeliberate=submittedOverride>0 && Math.abs(submittedOverride-previousTotal)>0.01
  const priceOverride=overrideIsDeliberate ? submittedOverride : 0
  const finalTotalAmount=priceOverride>0 ? priceOverride : pricing.totalAmount
```

- [ ] **Step 2: Clear the stale override in metadata** so it does not re-pin next edit. In the `metadata` assignment inside `updatePayload`, ensure `price_override` is written from `priceOverride` (the resolved value), not the raw submitted one. Find the metadata merge in `updatePayload` and set:

```ts
      price_override:priceOverride,
```

(If the existing metadata spread also carried `price_override`, this overwrite is sufficient because the explicit key comes after the spread.)

- [ ] **Step 3: Verify** — `deno check …`. Expected: no errors. Confirm `priceOverride` is referenced (not the old `Number(payload.price_override||…)`) everywhere downstream in `updateBooking` (search the function for `price_override`).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/booking-api/index.ts
git commit -m "fix(booking-api): reprice booking on pax change instead of pinning a stale override"
```

---

## Task 4: FOC payment status zeroes the charge (#5, backend)

**Files:**
- Modify: `skybook-main/supabase/functions/booking-api/index.ts` (`resolveOutstandingAmounts` ~2480; `updateBooking` `updatePayload` ~3946–3951)

- [ ] **Step 1: Treat FOC as settled in `resolveOutstandingAmounts`** — change the early-return list (line 2481):

```ts
  if(['paid','refunded','cancelled','foc'].includes(normalized)){
    return { amountDueNow:0, amountDueLater:0 }
  }
```

- [ ] **Step 2: Zero all charge fields when FOC in `updateBooking`.** Just before building `updatePayload` (after `finalTotalAmount` is known, ~3927), add:

```ts
  const isFoc=normalizeText(nextPaymentStatus)==='foc'
  const focTotal=isFoc ? 0 : finalTotalAmount
  const focSubtotal=isFoc ? 0 : (priceOverride>0 ? priceOverride : pricing.subtotalAmount)
  const focTax=isFoc ? 0 : (priceOverride>0 ? 0 : pricing.taxAmount)
  const focServiceFee=isFoc ? 0 : (priceOverride>0 ? 0 : pricing.serviceFeeAmount)
  const focDueNow=isFoc ? 0 : outstandingAmounts.amountDueNow
  const focDueLater=isFoc ? 0 : outstandingAmounts.amountDueLater
```

Then in `updatePayload` replace the six finance fields to use these:

```ts
    subtotal_amount:focSubtotal,
    tax_amount:focTax,
    service_fee_amount:focServiceFee,
    total_amount:focTotal,
    amount_due_now:focDueNow,
    amount_due_later:focDueLater,
```

- [ ] **Step 3: Exclude FOC from report revenue.** FOC bookings have `total_amount=0` so they contribute 0 to gross automatically; no extra change needed server-side. (Display handled in Task 8.)

- [ ] **Step 4: Verify** — `deno check …`. Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/booking-api/index.ts
git commit -m "feat(booking-api): add FOC payment status that zeroes the booking charge"
```

---

## Task 5: Bulk backfill migration (#3b)

**Files:**
- Create: `skybook-main/supabase/migrations/202606230001_skybook_recalculate_booking_finances.sql`

- [ ] **Step 1: Write the migration.** Recompute totals for non-overridden, non-FOC, non-cancelled bookings, respecting amount received:

```sql
-- Recalculate booking finances for bookings whose total drifted from base_price x quantity.
-- SKIPS: deliberate price overrides, FOC, cancelled/refunded. Idempotent. Transactional.
-- Reversible: snapshot bookings before running (pg_dump of public.bookings) per deploy runbook.
begin;

with recalculated as (
  select
    b.id,
    round(s.base_price * greatest(1, coalesce(b.quantity,1)), 2) as new_subtotal,
    round(
      greatest(
        0,
        (round(s.base_price * greatest(1, coalesce(b.quantity,1)), 2)
          + coalesce(b.tax_amount,0)
          + coalesce(b.service_fee_amount,0))
        - greatest(
            0,
            (coalesce(b.subtotal_amount,0)+coalesce(b.tax_amount,0)+coalesce(b.service_fee_amount,0))
            - coalesce(b.total_amount,0)
          )
      ), 2
    ) as new_total
  from public.bookings b
  join public.services s on s.id = b.service_id
  where coalesce(nullif(b.metadata->>'price_override',''),'0')::numeric = 0
    and coalesce(b.payment_status,'') <> 'foc'
    and coalesce(b.status::text,'') not in ('cancelled')
    and coalesce(b.payment_status,'') not in ('refunded','cancelled')
)
update public.bookings b
set
  subtotal_amount = r.new_subtotal,
  total_amount = r.new_total,
  amount_due_now = greatest(0, round(r.new_total - coalesce(p.amount_received,0), 2)),
  amount_due_later = 0,
  updated_at = now()
from recalculated r
left join lateral (
  select amount_received from public.payments p2 where p2.booking_id = b.id
  order by p2.created_at asc limit 1
) p on true
where b.id = r.id
  and abs(coalesce(b.total_amount,0) - r.new_total) > 0.01;

commit;
```

- [ ] **Step 2: Dry-run review.** Before applying, run the inner `with recalculated … select b.reference, b.total_amount, r.new_total from …` form against the database (Supabase SQL editor) to see the count and a sample of rows that will change. Expected: only drifted, non-overridden bookings listed. Record before/after counts in the deploy notes.

- [ ] **Step 3: Commit** (apply happens in Task 11)

```bash
git add supabase/migrations/202606230001_skybook_recalculate_booking_finances.sql
git commit -m "feat(db): backfill migration to recalculate drifted booking finances"
```

---

## Task 6: Overpayment checkbox + pre-validate (#1, frontend)

**Files:**
- Modify: `skybook-main/booking-admin.html` (manual payment form/modal)
- Modify: `skybook-main/assets/js/booking-admin.js` (manual payment submit handler)

- [ ] **Step 1: Find the manual payment form** — grep `booking-admin.js` for the payment submit handler (the call that POSTs to `admin/.../payments` or `createManualBookingPayment`). Identify the form node and the amount input node.

- [ ] **Step 2: Add the checkbox** to the payment modal/form in `booking-admin.html`, after the amount field:

```html
<label class="booking-field booking-field--inline">
  <input type="checkbox" id="adminPaymentAllowOverpayment">
  <span>Allow overpayment (record more than the outstanding balance)</span>
</label>
```

- [ ] **Step 3: Pre-validate and send the flag** in the payment handler. Before the `apiRequest`, compute the booking outstanding and block when over and unchecked:

```js
const allowOverpayment=document.getElementById('adminPaymentAllowOverpayment')?.checked===true
const outstanding=Number(booking?.amount_due_now||0)+Number(booking?.amount_due_later||0)
if(!allowOverpayment && Number(amount)>outstanding+0.01){
  setAdminStatus(`Amount ${Number(amount).toFixed(2)} exceeds the outstanding balance of ${outstanding.toFixed(2)}. Tick "Allow overpayment" to proceed.`,true)
  return
}
```

Add `allow_overpayment:allowOverpayment` to the request `body`.

- [ ] **Step 4: Verify** — load the admin app via `node scripts/smoke-server.mjs` (or open `booking-admin.html`), open a paid booking, try to add an extra payment: expect a block message; tick the box: expect it to proceed.

- [ ] **Step 5: Commit**

```bash
git add booking-admin.html assets/js/booking-admin.js
git commit -m "feat(admin): allow-overpayment checkbox and client-side overpayment guard"
```

---

## Task 7: Refund field relabel (#2, frontend)

**Files:**
- Modify: `skybook-main/booking-admin.html` (refund form, "Booking ID" label)

- [ ] **Step 1: Relabel.** Change the refund form's *Booking ID* label to "Booking ID or Reference" and add helper text: "Enter the booking UUID or its reference, e.g. IV202622-973FE25F."

- [ ] **Step 2: Verify** — refund form shows the new label; submitting with a reference now succeeds (backend Task 2). Reproduce the original screenshot case (`IV202622-973FE25F`) → expect success, not a UUID error.

- [ ] **Step 3: Commit**

```bash
git add booking-admin.html
git commit -m "fix(admin): clarify refund accepts booking reference or UUID"
```

---

## Task 8: FOC option + confirmation popup + display (#5, frontend)

**Files:**
- Modify: `skybook-main/booking-admin.html` (`adminBookingPaymentStatusField` select, ~1520)
- Modify: `skybook-main/assets/js/booking-admin.js` (status select change handler, badge/label maps)

- [ ] **Step 1: Add the option** to the payment-status select in `booking-admin.html`:

```html
                <option value="foc">FOC (Free of Charge)</option>
```

- [ ] **Step 2: Confirmation popup on select.** Add a `change` listener on `nodes.bookingPaymentStatus` that, when the new value is `foc`, asks to confirm and reverts on cancel:

```js
let lastPaymentStatusValue=nodes.bookingPaymentStatus?.value||''
nodes.bookingPaymentStatus?.addEventListener('focus',()=>{lastPaymentStatusValue=nodes.bookingPaymentStatus.value})
nodes.bookingPaymentStatus?.addEventListener('change',()=>{
  if(nodes.bookingPaymentStatus.value==='foc'){
    const ok=window.confirm('Set this booking to Free of Charge? The total and balance will be set to 0 and no payment will be due.')
    if(!ok){nodes.bookingPaymentStatus.value=lastPaymentStatusValue;return}
  }
  lastPaymentStatusValue=nodes.bookingPaymentStatus.value
})
```

- [ ] **Step 3: Display.** Add `foc` to status badge styling/label so it renders as "FOC" with a distinct tone. In the badge class resolver (~1533–1539) add `if(normalized==='foc')return 'is-foc'`, and add a matching CSS rule (grey/teal "free" tone) near the other `is-*` payment styles. Ensure label maps render `foc` → `FOC`.

- [ ] **Step 4: Verify** — select FOC on a booking: popup appears; confirm → save → total/balance show 0; cancel on popup → reverts to previous status. Badge shows "FOC".

- [ ] **Step 5: Commit**

```bash
git add booking-admin.html assets/js/booking-admin.js
git commit -m "feat(admin): FOC payment status with confirmation popup and badge"
```

---

## Task 9: Beautiful reports + PDF / Word / Excel exports (#4)

**Files:**
- Modify: `skybook-main/assets/js/booking-admin.js` (`SB_DOC_BASE_CSS` ~7348, `openReportPrintModal` ~7987, new export helpers)
- Modify: `skybook-main/booking-admin.html` (SheetJS CDN script tag)

- [ ] **Step 1: Add SheetJS, lazy-loaded.** Add a loader near the other vendor helpers in `booking-admin.js`:

```js
const SB_XLSX_LIB_URL='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
let _xlsxPromise=null
const ensureXlsx=()=>{
  if(window.XLSX)return Promise.resolve(window.XLSX)
  if(_xlsxPromise)return _xlsxPromise
  _xlsxPromise=new Promise((resolve,reject)=>{
    const s=document.createElement('script')
    s.src=SB_XLSX_LIB_URL
    s.onload=()=>resolve(window.XLSX)
    s.onerror=()=>reject(new Error('Could not load the Excel export library. Check your connection.'))
    document.head.appendChild(s)
  })
  return _xlsxPromise
}
```

- [ ] **Step 2: Restyle the report shell.** Upgrade `SB_DOC_BASE_CSS` with a branded header band, stat cards, zebra-striped tables, section rules, and print-safe page breaks (keep existing class names `.meta`, `.card`, `.pill`, `table`). Example additions: `tbody tr:nth-child(even){background:#f7fbff}`, `thead th{background:#0f4fa8;color:#fff}`, `section{page-break-inside:avoid}`, branded `header` with logo/title block.

- [ ] **Step 3: Word export helper.** Add:

```js
const downloadReportAsWord=(title,bodyHtml,filename)=>{
  const html='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>'+bookingAdminShared.escapeHtml(title)+'</title><style>'+SB_DOC_BASE_CSS+'</style></head><body>'+bodyHtml+'</body></html>'
  const blob=new Blob(['﻿',html],{type:'application/msword'})
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a');a.href=url;a.download=filename.replace(/\.pdf$/,'.doc');a.click();a.remove()
  window.setTimeout(()=>URL.revokeObjectURL(url),15000)
}
```

- [ ] **Step 4: Excel export helper.** Build real sheets from a structured model:

```js
const downloadReportAsExcel=async(title,sheets,filename)=>{
  const XLSX=await ensureXlsx()
  const wb=XLSX.utils.book_new()
  sheets.forEach(sheet=>{
    const aoa=[sheet.columns,...sheet.rows]
    const ws=XLSX.utils.aoa_to_sheet(aoa)
    XLSX.utils.book_append_sheet(wb,ws,(sheet.sheetName||'Sheet').slice(0,31))
  })
  XLSX.writeFile(wb,filename.replace(/\.(pdf|doc)$/,'.xlsx'))
}
```

- [ ] **Step 5: Build a structured report model.** Refactor `printSkyBookReport` so the data it already computes (summary, payments-by-type, debtors, revenue-by-brand/tour/source, booking/consultant/commission detail) is also returned as a `{html, sheets, title, filename}` object via a new `buildSkyBookReport(type, period)`. `printSkyBookReport` keeps calling it for the PDF; the new exports reuse the same model. Each `sheets[]` entry is `{sheetName, columns:[…], rows:[[…]]}`.

- [ ] **Step 6: 3-way export picker.** In `openReportPrintModal`, add a `format` select (`PDF` / `Word` / `Excel`) alongside the period. On submit, build the model once and dispatch: PDF → existing `downloadSkyBookReportPdf`; Word → `downloadReportAsWord(model.title, model.html, model.filename)`; Excel → `downloadReportAsExcel(model.title, model.sheets, model.filename)`.

- [ ] **Step 7: Verify** — for each report type, export all three formats: PDF opens styled; `.doc` opens in Word with styling; `.xlsx` opens with real columns/rows and correct totals.

- [ ] **Step 8: Commit**

```bash
git add booking-admin.html assets/js/booking-admin.js
git commit -m "feat(admin): restyle reports and add Word + Excel exports alongside PDF"
```

---

## Task 10: Mirror everything to `Skybook Final`

**Files:**
- Modify under `Skybook Final/`: `booking-admin.html`, `assets/js/booking-admin.js`, `supabase/migrations/202606230001_skybook_recalculate_booking_finances.sql` (new), `supabase/functions/booking-api/index.ts` (by hand).

- [ ] **Step 1: Apply frontend/HTML/migration identically.** Copy the `booking-admin.html`, `booking-admin.js`, and the new migration changes into the `Skybook Final` paths. These are kept in sync and are safe to apply wholesale **for the changed regions** (do not clobber any `tenant.js` tag in `booking-admin.html` — keep it).

- [ ] **Step 2: Port the backend by hand.** Open `Skybook Final/supabase/functions/booking-api/index.ts`. Apply the same logic from Tasks 1–4 **additively**, matching that copy's existing function shapes (coupon logic differs ~227 lines). Re-implement: overpayment guard, `resolveBookingByIdOrReference` + refund cap, deliberate-vs-stale override, FOC zeroing + `resolveOutstandingAmounts` foc case. Do NOT copy skybook-main's file over it.

- [ ] **Step 3: Verify** — diff the two backend files to confirm only the intended logic was added to Final; confirm `tenant.js` tag still present in `Skybook Final/booking-admin.html`.

- [ ] **Step 4: Commit (Skybook Final — local only, no push)**

```bash
cd "../Skybook Final" && git add -A && git commit -m "fix: mirror SkyBook finance/reporting fixes (overpay, refund, pax reprice, FOC, exports)"
```

---

## Task 11: Deploy + push

- [ ] **Step 1: Apply migration to Supabase.** Run the dry-run select (Task 5 Step 2), record counts, then apply `202606230001_skybook_recalculate_booking_finances.sql` via the Supabase SQL editor / CLI using the provided project token. Capture before/after row counts.

- [ ] **Step 2: Deploy the edge function.** Deploy `booking-api` to Supabase (`supabase functions deploy booking-api`) so the backend fixes go live.

- [ ] **Step 3: Smoke-test live.** Reproduce all five issues against the deployed app: overpayment blocked + override works; refund by reference succeeds; pax 2→1 drops the total; FOC zeroes + popup; report exports in all three formats.

- [ ] **Step 4: Push `skybook-main` to GitHub.**

```bash
cd skybook-main && git push origin <current-branch>
```

- [ ] **Step 5: Remind the user to rotate the Supabase token** (it was shared in chat).

---

## Notes / risks

- The bulk backfill rewrites historical totals for non-overridden bookings (user-approved); skip-rules + idempotency + transaction + dry-run sample mitigate. Snapshot `public.bookings` before applying.
- The Word export is HTML-based `.doc` (opens in Word with full styling), not a native `.docx` part tree — acceptable for branded reports.
- If `deno` is not installed locally, substitute a careful manual brace/identifier review for the `deno check` steps.
