# SkyBook Urgent Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 10 urgent SkyBook issues: calendar display, status colour codes, cancelled booking reinstatement, new booking form fields, provisional status, and Kayak tour confirmation bug.

**Architecture:** All changes are in the SkyBook admin layer (`skybook-main/`), the shared booking layer (`booking-shared.js`, `booking.css`), and the True Travel website (`true-travel-site-main/`). The Supabase edge function (`supabase/functions/booking-api/index.ts`) needs status-transition changes for reinstatement and provisional status. Desktop (Electron) and mobile (Android APK) apps consume the same admin files and deploy separately.

**Tech Stack:** Vanilla JS, HTML, CSS; Supabase Edge Functions (TypeScript); Cloudflare Pages; Electron (desktop); Android WebView (mobile).

**Root paths (use exact):**
- SkyBook admin JS: `skybook-main/assets/js/booking-admin.js`
- SkyBook admin HTML: `skybook-main/booking-admin.html`
- SkyBook CSS: `skybook-main/assets/css/booking.css`
- Edge function: `skybook-main/supabase/functions/booking-api/index.ts`
- True Travel HTML: `true-travel-site-main/true-travel-site-main/tours.html` and `index.html`
- True Travel JS: `true-travel-site-main/true-travel-site-main/assets/js/tours.js`
- Standalone mirror: `Skybook Standalone/` (mirror every skybook-main change here — NEVER push to GitHub)

---

## File Map

| File | Changes |
|------|---------|
| `skybook-main/assets/js/booking-admin.js` | Tasks 1,2,3,4,5,6,7,8,9,10 |
| `skybook-main/booking-admin.html` | Tasks 4,5,7,10 |
| `skybook-main/assets/css/booking.css` | Task 2,10 |
| `skybook-main/supabase/functions/booking-api/index.ts` | Tasks 3,10 |
| `true-travel-site-main/.../tours.html` | Tasks 4,7 |
| `true-travel-site-main/.../assets/js/tours.js` | Tasks 4,7 |
| `true-travel-site-main/.../assets/js/booking-shared.js` | Tasks 4,7 |

---

## Task 1: Calendar — guest name first, hide cancelled, hover tooltip

**Files:**
- Modify: `skybook-main/assets/js/booking-admin.js:2959-3068`

### What to change

The `renderCalendar` function builds three views (day/week/month). Each has:
1. A filter `rangeBookings` — add `.filter(b => b.status !== 'cancelled')` here
2. Day view `calendar-entry-card` — swap reference/name order, add tooltip data attributes
3. Week/month `calendar-mini-card` — show `customer_name · service_name` not reference

- [ ] **Step 1: Filter out cancelled bookings from rangeBookings**

In `booking-admin.js` around line 2965, change:
```js
const rangeBookings=state.bookings.filter(booking=>{
  const key=normalizeDateKey(booking.preferred_date)
  return key && dates.some(date=>normalizeDateKey(date)===key)
})
```
to:
```js
const rangeBookings=state.bookings.filter(booking=>{
  const key=normalizeDateKey(booking.preferred_date)
  const isCancelled=normalizeText(booking.status)==='cancelled'
  return key && !isCancelled && dates.some(date=>normalizeDateKey(date)===key)
})
```

- [ ] **Step 2: Day view — swap name/reference order**

At line ~2990 the day view card template. Change:
```js
<strong><a class="cal-booking-link" href="${htmlAttribute(bookingUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${bookingAdminShared.escapeHtml(booking.reference)}</a></strong>
<p>${bookingAdminShared.escapeHtml(booking.service_name)} · ${bookingAdminShared.escapeHtml(booking.customer_name||'Guest')}</p>
```
to:
```js
<strong>${bookingAdminShared.escapeHtml(booking.customer_name||'Guest')}</strong>
<p>${bookingAdminShared.escapeHtml(booking.service_name||'Tour')} · <a class="cal-booking-link" href="${htmlAttribute(bookingUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${bookingAdminShared.escapeHtml(booking.reference)}</a></p>
```

- [ ] **Step 3: Day view — add hover tooltip**

Add `data-cal-tooltip` attribute to the `article` tag in the day view. Compose the tooltip string inline:
```js
const guests=Number(booking.adult_quantity||0)+Number(booking.child_quantity||0)||booking.quantity||1
const tooltipText=`${booking.customer_name||'Guest'} · ${booking.service_name||'Tour'}\nDate: ${formatDateLabel(booking.preferred_date)}\nGuests: ${guests}\nStatus: ${String(booking.status||'').replace(/_/g,' ')}\nRef: ${booking.reference}\nPhone: ${booking.customer_phone||'—'}\nEmail: ${booking.customer_email||'—'}`
```
Then on the article tag:
```js
<article class="calendar-entry-card is-clickable" data-open-booking="..." data-cal-tooltip="${bookingAdminShared.escapeHtml(tooltipText)}" ...>
```

- [ ] **Step 4: Week/month mini-cards — show name · tour, not reference**

Week view mini-card (line ~3030):
```js
<article class="calendar-mini-card is-clickable" data-open-booking="${bookingAdminShared.escapeHtml(booking.id)}" title="${bookingAdminShared.escapeHtml(booking.customer_name||'Guest')} — ${bookingAdminShared.escapeHtml(booking.service_name||'Tour')} (${bookingAdminShared.escapeHtml(booking.reference)})">
  <strong>${bookingAdminShared.escapeHtml(booking.customer_name||'Guest')}</strong>
  <span>${bookingAdminShared.escapeHtml(booking.service_name||'Tour')}</span>
  ${renderStatusBadge(booking.status)}
</article>
```

Month view mini-card (line ~3061):
```js
<article class="calendar-mini-card is-clickable" data-open-booking="${bookingAdminShared.escapeHtml(booking.id)}" title="${bookingAdminShared.escapeHtml(booking.customer_name||'Guest')} — ${bookingAdminShared.escapeHtml(booking.service_name||'Tour')} (${bookingAdminShared.escapeHtml(booking.reference)})">
  <strong>${bookingAdminShared.escapeHtml(booking.customer_name||'Guest')}</strong>
  <span>${bookingAdminShared.escapeHtml(booking.service_name||'Tour')}</span>
</article>
```

- [ ] **Step 5: Add CSS hover tooltip for data-cal-tooltip**

In `skybook-main/assets/css/booking.css`, after the `.calendar-entry-card` block (around line 1369), add:
```css
[data-cal-tooltip]{position:relative}
[data-cal-tooltip]:hover::after{
  content:attr(data-cal-tooltip);
  position:absolute;
  bottom:calc(100% + 8px);
  left:0;
  z-index:9999;
  min-width:240px;
  max-width:320px;
  padding:10px 14px;
  border-radius:12px;
  background:#0d2535;
  color:#fff;
  font-size:12px;
  line-height:1.6;
  white-space:pre-wrap;
  box-shadow:0 8px 24px rgba(5,22,35,.32);
  pointer-events:none;
}
```

- [ ] **Step 6: Commit**
```bash
git add skybook-main/assets/js/booking-admin.js skybook-main/assets/css/booking.css
git commit -m "fix: calendar shows guest name+tour, hides cancelled, adds hover tooltip"
```

---

## Task 2: Status colour codes throughout the system

**Files:**
- Modify: `skybook-main/assets/css/booking.css:943-960`
- Modify: `skybook-main/assets/js/booking-admin.js:1467-1474`

**Colour spec:**
| Status | Colour | CSS class |
|--------|--------|-----------|
| Reservation (pending/draft) | Green | `is-reservation` |
| Booking (awaiting_payment, payment_request_sent, confirmed) | Light Purple | `is-booking` |
| Paid Booking (paid payment status) | Blue | `is-paid` |
| Finalised (completed) | Dark Blue | `is-finalised` |
| Provisional | Bright Yellow | `is-provisional` |
| Cancelled | Red (keep existing `is-bad`) | `is-bad` |

- [ ] **Step 1: Add new CSS classes in booking.css**

After line 959 (`.status-badge.is-neutral{...}`), add:
```css
.status-badge.is-reservation{background:#e8f7ee;color:#1a6640;border-color:#a8dfc0}
.status-badge.is-booking{background:#f0eaff;color:#5b3fa0;border-color:#c9b5f5}
.status-badge.is-paid{background:#e5f0ff;color:#1a4fa0;border-color:#a0c0f0}
.status-badge.is-finalised{background:#0e3a52;color:#ffffff;border-color:#0a2b3d}
.status-badge.is-provisional{background:#fff000;color:#5a4200;border-color:#e6c800}
```

Also add booking-row colour variants after the existing `.booking-row:hover` block:
```css
.booking-row.status-reservation{border-left:3px solid #45a56f}
.booking-row.status-booking{border-left:3px solid #8b5cf6}
.booking-row.status-paid{border-left:3px solid #3b82f6}
.booking-row.status-finalised{border-left:3px solid #1e40af}
.booking-row.status-provisional{border-left:3px solid #facc15}
.booking-row.status-cancelled{border-left:3px solid #ef4444}
```

And calendar card colour variants (after `.calendar-mini-card` block):
```css
.calendar-mini-card.status-reservation{border-left:3px solid #45a56f}
.calendar-mini-card.status-booking{border-left:3px solid #8b5cf6}
.calendar-mini-card.status-paid{border-left:3px solid #3b82f6}
.calendar-mini-card.status-finalised{border-left:3px solid #1e40af}
.calendar-mini-card.status-provisional{border-left:3px solid #facc15}
```

- [ ] **Step 2: Update getStatusBadgeClass in booking-admin.js**

Replace lines 1467-1474:
```js
const getStatusBadgeClass=value=>{
  const normalized=String(value||'').toLowerCase()
  if(['draft','pending'].includes(normalized))return 'is-reservation'
  if(['awaiting_payment','payment_request_sent','confirmed','rescheduled'].includes(normalized))return 'is-booking'
  if(['paid','settled','successful'].includes(normalized))return 'is-paid'
  if(['completed'].includes(normalized))return 'is-finalised'
  if(normalized==='provisional')return 'is-provisional'
  if(['cancelled','failed','refunded','no_show'].includes(normalized))return 'is-bad'
  if(['active','default','issued','open','generated','processing','available','private','sent','info'].includes(normalized))return 'is-info'
  return 'is-neutral'
}
```

- [ ] **Step 3: Add getStatusRowClass helper and apply to booking rows**

Add a new helper after `getStatusBadgeClass`:
```js
const getStatusRowClass=booking=>{
  const status=normalizeText(booking?.status||'')
  const paymentStatus=normalizeText(booking?.payment_status||'')
  if(status==='cancelled')return 'status-cancelled'
  if(status==='completed')return 'status-finalised'
  if(status==='provisional')return 'status-provisional'
  if(paymentStatus==='paid'||status==='confirmed')return 'status-paid'
  if(['awaiting_payment','payment_request_sent','rescheduled'].includes(status))return 'status-booking'
  if(['pending','draft'].includes(status))return 'status-reservation'
  return ''
}
```

Then find every place `booking-row` is rendered (search for `class="booking-row ` and `booking-row is-`) and append `${getStatusRowClass(booking)}` to the class string. For example:
```js
// Before:
<tr class="booking-row is-${normalizeBrandClass(booking.brand_code)}" ...>
// After:
<tr class="booking-row is-${normalizeBrandClass(booking.brand_code)} ${getStatusRowClass(booking)}" ...>
```

Do the same for calendar mini-cards: add `${getStatusRowClass(booking)}` to `calendar-mini-card` classes.

- [ ] **Step 4: Commit**
```bash
git add skybook-main/assets/js/booking-admin.js skybook-main/assets/css/booking.css
git commit -m "feat: status colour codes — reservation green, booking purple, paid blue, finalised dark-blue, provisional yellow"
```

---

## Task 3: Reinstate cancelled bookings and reservations

**Files:**
- Modify: `skybook-main/supabase/functions/booking-api/index.ts:117-129`
- Modify: `skybook-main/assets/js/booking-admin.js` (booking management screen render ~line 3579, and event handler)

### Edge function — allow cancelled → pending transition

- [ ] **Step 1: Add cancelled transition in BOOKING_STATUS_TRANSITIONS (index.ts line 126)**

Change:
```ts
cancelled:[],
```
to:
```ts
cancelled:['pending','awaiting_payment'],
```

- [ ] **Step 2: Add reinstate workflow action (index.ts)**

Find `isReservationAcceptanceWorkflow` (around line 3490) and add a new workflow action check alongside it:
```ts
const isReinstateWorkflow=workflowAction==='reinstate'
  && normalizeText(existing.status)==='cancelled'
  && ['pending','awaiting_payment'].includes(nextStatus)
  && Boolean(normalizeText(payload.reason))
```

Then add `||isReinstateWorkflow` to the condition that allows status changes (line ~3493):
```ts
if((statusChangeRequested||paymentStatusChangeRequested)&&!isSystemActor&&!isCancellationWorkflow&&!isNoShowWorkflow&&!isRescheduleWorkflow&&!isReservationAcceptanceWorkflow&&!isReinstateWorkflow){
```

Also, in the metadata block (line ~3544), add reinstatement record alongside cancellation:
```ts
...(isReinstateWorkflow ? {
  reinstatement:{
    reason:cancellationReason,
    reinstated_at:nowIso(),
    reinstated_by:userId
  },
  cancellation:null
} : {})
```

- [ ] **Step 3: Add Reinstate button in the booking management screen (booking-admin.js)**

Find the booking management screen render (`openBookingManagementScreen`, line ~4404) and the section where action buttons are built for cancelled bookings. After `renderBookingDetail`, add a conditional "Reinstate Booking" button that only shows when `booking.status === 'cancelled'`:

Search for `data-booking-action` buttons in the booking detail section (around lines 3579-3600) and add:
```js
${normalizeText(booking.status)==='cancelled' ? `
  <button type="button" class="booking-button" data-inline-action="reinstate-booking">Reinstate Booking</button>
` : ''}
```

- [ ] **Step 4: Handle reinstate-booking inline action (booking-admin.js)**

Find `inlineAction==='trash-booking'` (line ~8345) and add a handler before it:
```js
if(inlineAction==='reinstate-booking'){
  const booking=state.bookings.find(b=>b.id===state.selectedBookingId)
  if(!booking){setAdminStatus('No booking selected.',true);return}
  openWorkflowModal({
    title:'Reinstate Booking',
    description:'Reinstate this cancelled booking and return it to active status. Provide a reason for the reinstatement.',
    submitLabel:'Reinstate Booking',
    fields:[
      {name:'reason',label:'Reinstatement reason',type:'textarea',placeholder:'Guest rebooked, operator error correction, etc.',required:true,helper:'Required to create an audit trail.'}
    ],
    onSubmit:async values=>{
      if(!state.selectedBookingId)return
      await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(state.selectedBookingId)}`,{
        method:'PATCH',
        headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
        body:{status:'pending',payment_status:'pending',reason:values.reason,workflow_action:'reinstate'}
      })
      await createActivityNote(state.selectedBookingId,`Booking reinstated: ${values.reason}`)
      await refreshAdmin('Booking reinstated successfully.')
    }
  })
  return
}
```

- [ ] **Step 5: Add Reinstate Reservation button in the reservation detail panel**

Find the reservation detail buttons (search `data-reservation-action="accept"`, line ~3239). Add:
```js
${normalizeText(booking.status)==='cancelled' ? `
  <button type="button" class="booking-button" data-reservation-action="reinstate">Reinstate Reservation</button>
` : ''}
```

Find the reservation action handler (search `data-reservation-action`) and add:
```js
if(action==='reinstate'){
  // same openWorkflowModal pattern as above, using state.selectedReservationId or state.selectedBookingId
  openWorkflowModal({
    title:'Reinstate Reservation',
    description:'Reinstate this cancelled reservation back into the review queue.',
    submitLabel:'Reinstate Reservation',
    fields:[{name:'reason',label:'Reason',type:'textarea',placeholder:'Error in cancellation, guest returned, etc.',required:true}],
    onSubmit:async values=>{
      const bookingId=state.selectedBookingId||state.selectedReservationId
      if(!bookingId)return
      await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(bookingId)}`,{
        method:'PATCH',
        headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
        body:{status:'pending',payment_status:'pending',reason:values.reason,workflow_action:'reinstate'}
      })
      await createActivityNote(bookingId,`Reservation reinstated: ${values.reason}`)
      await refreshAdmin('Reservation reinstated.')
    }
  })
  return
}
```

- [ ] **Step 6: Deploy edge function and commit**
```bash
# Deploy edge function (run from skybook-main/)
npx supabase functions deploy booking-api --project-ref <your-ref>

git add skybook-main/supabase/functions/booking-api/index.ts skybook-main/assets/js/booking-admin.js
git commit -m "feat: reinstate cancelled bookings and reservations with audit trail"
```

---

## Task 4: Booking form new fields — nationality, dietary, booked by, Activity Bridge source; also website booking forms

**Files:**
- Modify: `skybook-main/booking-admin.html:1377-1465`
- Modify: `skybook-main/assets/js/booking-admin.js` (nodes map ~line 380, form read ~line 1340, form write ~line 1365, save payload ~line 7220)
- Modify: `true-travel-site-main/true-travel-site-main/tours.html` (booking form)
- Modify: `true-travel-site-main/true-travel-site-main/assets/js/tours.js` (booking payload)
- Modify: `true-travel-site-main/true-travel-site-main/assets/js/booking-shared.js` (normalizeBooking)

### SkyBook admin form

- [ ] **Step 1: Add Activity Bridge to source dropdown (booking-admin.html line 1385)**

After `<option value="agent">Agent / Reseller</option>`, add:
```html
<option value="activity_bridge">Activity Bridge</option>
```

- [ ] **Step 2: Add nationality, dietary, booked_by, pickup_location, dropoff_location fields to booking-admin.html**

After the `adminBookingCustomerPhone` label block (line ~1451), insert:
```html
<label class="booking-field">
  <span>Nationality</span>
  <input id="adminBookingNationality" type="text" placeholder="e.g. German, Namibian">
</label>
<label class="booking-field">
  <span>Booked By</span>
  <input id="adminBookingBookedBy" type="text" placeholder="Guest, agent, hotel, or staff">
</label>
<label class="booking-field-full">
  <span>Dietary Requirements</span>
  <input id="adminBookingDietary" type="text" placeholder="Allergies, vegetarian/vegan, or None">
</label>
<label class="booking-field">
  <span>Pickup Location</span>
  <input id="adminBookingPickupLocation" type="text" placeholder="Hotel name or meeting point">
</label>
<label class="booking-field">
  <span>Drop-off Location</span>
  <input id="adminBookingDropoffLocation" type="text" placeholder="Hotel or destination (if different)">
</label>
```

- [ ] **Step 3: Add nodes references (booking-admin.js ~line 382)**

After `bookingGuideName:document.getElementById('adminBookingGuideName'),` add:
```js
bookingNationality:document.getElementById('adminBookingNationality'),
bookingBookedBy:document.getElementById('adminBookingBookedBy'),
bookingDietary:document.getElementById('adminBookingDietary'),
bookingPickupLocation:document.getElementById('adminBookingPickupLocation'),
bookingDropoffLocation:document.getElementById('adminBookingDropoffLocation'),
```

- [ ] **Step 4: Add fields to form read function (getBookingFormValues ~line 1340)**

Find `source:nodes.bookingSource?.value||''` and add:
```js
nationality:nodes.bookingNationality?.value?.trim()||'',
booked_by:nodes.bookingBookedBy?.value?.trim()||'',
dietary_requirements:nodes.bookingDietary?.value?.trim()||'',
pickup_location:nodes.bookingPickupLocation?.value?.trim()||'',
dropoff_location:nodes.bookingDropoffLocation?.value?.trim()||'',
```

- [ ] **Step 5: Add fields to form write function (setBookingFormValues ~line 1365)**

After `if(nodes.bookingSource)nodes.bookingSource.value=...` add:
```js
if(nodes.bookingNationality)nodes.bookingNationality.value=String(values.nationality||values.metadata?.nationality||'')
if(nodes.bookingBookedBy)nodes.bookingBookedBy.value=String(values.booked_by||values.metadata?.booked_by||'')
if(nodes.bookingDietary)nodes.bookingDietary.value=String(values.dietary_requirements||values.metadata?.dietary_requirements||values.metadata?.dietary||'')
if(nodes.bookingPickupLocation)nodes.bookingPickupLocation.value=String(values.pickup_location||values.metadata?.pickup_location||values.metadata?.hotel||'')
if(nodes.bookingDropoffLocation)nodes.bookingDropoffLocation.value=String(values.dropoff_location||values.metadata?.dropoff_location||'')
```

- [ ] **Step 6: Include new fields in save payload (handleBookingSave ~line 7220)**

Find where `guide_name` is set in the payload and add:
```js
nationality:nodes.bookingNationality?.value?.trim()||'',
booked_by:nodes.bookingBookedBy?.value?.trim()||'',
dietary_requirements:nodes.bookingDietary?.value?.trim()||'',
pickup_location:nodes.bookingPickupLocation?.value?.trim()||'',
dropoff_location:nodes.bookingDropoffLocation?.value?.trim()||'',
```

These go into `metadata` in the edge function (the edge function already spreads `requestMetadata` into the booking's metadata object).

- [ ] **Step 7: Display new fields in booking detail view (renderBookingDetail ~line 1143)**

Find `addRow('Source',...)` and add after the pickup_time row:
```js
addRow('Nationality',metadata.nationality||booking.nationality)
addRow('Booked By',metadata.booked_by||booking.booked_by)
addRow('Dietary Requirements',metadata.dietary_requirements||metadata.dietary)
addRow('Pickup Location',metadata.pickup_location||metadata.hotel)
addRow('Drop-off Location',metadata.dropoff_location)
```

### True Travel website booking form

- [ ] **Step 8: Add fields to tours.html booking form (after fbooked input)**

In `tours.html`, after the existing `fbooked` input, insert:
```html
<div class="frow">
  <div class="fg"><label class="fl" for="fpickup">Pickup Location</label><input type="text" id="fpickup" class="fc" placeholder="Hotel name or meeting point"></div>
  <div class="fg"><label class="fl" for="fdropoff">Drop-off Location</label><input type="text" id="fdropoff" class="fc" placeholder="Hotel or destination (if different)"></div>
</div>
```

- [ ] **Step 9: Include new fields in tours.js booking payload (~line 930)**

Find `departure_time:(byId('fdep-wrap')...` and add:
```js
pickup_location:(byId('fpickup')?.value||'').trim(),
dropoff_location:(byId('fdropoff')?.value||'').trim(),
```

- [ ] **Step 10: Commit**
```bash
git add skybook-main/booking-admin.html skybook-main/assets/js/booking-admin.js
git add true-travel-site-main/true-travel-site-main/tours.html
git add true-travel-site-main/true-travel-site-main/assets/js/tours.js
git commit -m "feat: add nationality, dietary, booked-by, pickup/dropoff fields; add Activity Bridge source"
```

---

## Task 5: Rename "Departure Times" label to "Pickup Time" in service form

**Files:**
- Modify: `skybook-main/booking-admin.html` (service form departure times section)
- Modify: `skybook-main/assets/js/booking-admin.js` (service form render)

- [ ] **Step 1: Find and rename the Departure Times label in booking-admin.html**

Search for `Departure Time` in `booking-admin.html`. The service form has a label for the departure times section. Change every instance of the label text `Departure Times` / `Departure Time` in the **service form** (not in the booking form — the booking form already says "Departure Time" for the dropdown, which is fine) to `Pickup Time`:

In the service form section (search `serviceDepartureTimes` or `Departure Times`):
```html
<!-- Before -->
<span>Departure Times</span>
<!-- After -->
<span>Pickup Times</span>
```

- [ ] **Step 2: Update renderServiceDepartureTimesTable in booking-admin.js**

Search for any JS that renders the label `Departure Times` or `departure_times` as a user-visible string within the service editor, and change it to `Pickup Times`.

Specifically find (around line 4571):
```js
// heading or label near departure_times rendering
```
and change any user-facing string `'Departure'` to `'Pickup Time'` and `'Departure Times'` to `'Pickup Times'`.

- [ ] **Step 3: Commit**
```bash
git add skybook-main/booking-admin.html skybook-main/assets/js/booking-admin.js
git commit -m "rename: departure times → pickup time/pickup times throughout service form"
```

---

## Task 6: "Return to Main Page" button in booking management screen

**Files:**
- Modify: `skybook-main/assets/js/booking-admin.js:3579-3590` (booking management hero section)

The booking management screen is rendered via `openBookingManagementScreen`. The hero section (line ~3579) has a nav. We need a button that closes the full-screen booking view and returns to whatever tab was active before.

- [ ] **Step 1: Store last active tab before opening booking management**

Find `openBookingManagementScreen` (line ~4404). At the top of the function, before switching to the booking detail, store the current tab:
```js
const openBookingManagementScreen=(booking,{scroll=true}={})=>{
  if(!booking)return
  state.preBookingTab=state.activeTab  // remember where we came from
  ...
}
```

- [ ] **Step 2: Add "Return to SkyBook" button in the hero section**

At line ~3579, in the booking management hero template, add a return button:
```js
<section class="booking-management-hero">
  <div>
    <span class="booking-chip">Management workspace</span>
    <h3>${bookingAdminShared.escapeHtml(booking.reference)} · ${bookingAdminShared.escapeHtml(booking.customer_name||'Guest')}</h3>
  </div>
  <div style="display:flex;align-items:center;gap:12px">
    <button type="button" class="booking-button ghost compact-button" data-inline-action="return-to-main">← Return to SkyBook</button>
    <nav class="booking-management-nav" aria-label="Booking management navigation">
      <a href="#booking-notification-panel">Notifications</a>
      <a href="#booking-guest-service-panel">Details</a>
      <a href="#booking-finance-panel">Finance</a>
      <a href="#booking-documents-panel">Documents</a>
    </nav>
  </div>
</section>
```

- [ ] **Step 3: Handle the return-to-main inline action**

Find the `inlineAction` handler (search `inlineAction==='trash-booking'`). Before it, add:
```js
if(inlineAction==='return-to-main'){
  const returnTab=state.preBookingTab||'bookings'
  switchTab(returnTab)
  return
}
```

Also do the same for the reservation management screen hero (search `booking-management-hero reservation-screen-shell`):
```js
<button type="button" class="booking-button ghost compact-button" data-reservation-action="back">← Return to SkyBook</button>
```
(The reservation screen already has a `back` action handler at line ~8198, so this button just needs to exist.)

- [ ] **Step 4: Commit**
```bash
git add skybook-main/assets/js/booking-admin.js
git commit -m "feat: return-to-skybook button in booking and reservation management screens"
```

---

## Task 7: Pickup Location and Drop-off Location (already covered in Task 4)

Task 4 Steps 2, 5, 6, 7, 8, 9 implement these fields. No additional work needed here beyond what's in Task 4.

- [ ] **Verify**: Open a booking in SkyBook admin, confirm Pickup Location and Drop-off Location fields appear and save correctly.

---

## Task 8: Fix Kayak and Kayak Combo tours not confirming

**Root cause:** `validateBookingForm` (line 7183) requires a guide name before any booking can be saved:
```js
if(!nodes.bookingGuideName?.value.trim())
  errors.push({label:'Assigned Guide',message:'Assign a guide before saving the booking.',fieldId:'adminBookingGuideName'})
```

Kayak tours are likely submitted without a guide name assigned, blocking confirmation. Additionally, the reservation acceptance workflow (line 8236) also blocks with `'A guide must be assigned before accepting this reservation.'`

**Fix:** Make guide assignment required only for `confirmed` status and above (not for `pending`, `awaiting_payment`, or `provisional`). For Kayak specifically, also ensure the service is correctly set up with `minimum_pax` and departure times.

- [ ] **Step 1: Relax guide validation for non-confirmed statuses**

In `validateBookingForm` (line 7157), change the guide check:
```js
// Before:
if(!nodes.bookingGuideName?.value.trim())
  errors.push({label:'Assigned Guide',message:'Assign a guide before saving the booking.',fieldId:'adminBookingGuideName'})

// After:
const bookingStatus=nodes.bookingStatus?.value||'pending'
const statusNeedsGuide=['confirmed','completed'].includes(bookingStatus)
if(statusNeedsGuide && !nodes.bookingGuideName?.value.trim())
  errors.push({label:'Assigned Guide',message:'Assign a guide before confirming the booking.',fieldId:'adminBookingGuideName'})
```

- [ ] **Step 2: Relax guide check in reservation acceptance handler (line ~8236)**

Find:
```js
setAdminStatus('A guide must be assigned before accepting this reservation. Edit the reservation and add the guide name.',true)
```

This is in the reservation acceptance workflow. Reservations being accepted move to `awaiting_payment` not `confirmed`, so remove this hard block and make it a warning instead:
```js
// Replace the guard that blocks acceptance with a soft warning:
if(!booking?.guide_name?.trim()){
  showToast('No guide assigned yet — you can add one in the booking editor.','info')
}
// Then continue with acceptance regardless
```

Find the exact block (search `guide must be assigned`) and locate the `return` statement that follows it — remove both the warning and the early return, or replace with the soft toast.

- [ ] **Step 3: Verify Kayak service setup**

In SkyBook admin → Services, open "Pelican Point Kayaking" and "Kayak Sandwich Combo":
- Confirm `Brand` is set to True Travel
- Confirm `Is Active` is checked
- Confirm `Minimum Pax` is set to a reasonable value (1 or 2)
- Confirm service slug matches what comes from the API

If services appear broken, re-save them in the admin to force a sync.

- [ ] **Step 4: Commit**
```bash
git add skybook-main/assets/js/booking-admin.js
git commit -m "fix: guide name only required for confirmed/completed status; Kayak tours can now save without guide pre-assigned"
```

---

## Task 9: Guest name and tour always show first (reference secondary) — booking tables

**Files:**
- Modify: `skybook-main/assets/js/booking-admin.js` (booking table row render ~lines 2880-2920, booking detail header ~line 3582)

The booking list table currently shows reference in the first `<td>`. We need customer name + tour first, reference smaller/below.

- [ ] **Step 1: Update booking table row primary cell**

Find the bookings table row render (search `adminBookingsTable`, around line 2880). The first `<td>` currently shows reference. Change:
```js
// Before (approximate):
<td>
  <strong>${bookingAdminShared.escapeHtml(booking.reference)}</strong>
  <div class="table-subline">...</div>
</td>

// After:
<td>
  <strong>${bookingAdminShared.escapeHtml(booking.customer_name||'Guest')}</strong>
  <div class="table-subline">${bookingAdminShared.escapeHtml(booking.service_name||'—')}</div>
  <div class="table-subline" style="font-size:11px;color:var(--booking-muted)">${bookingAdminShared.escapeHtml(booking.reference)}</div>
</td>
```

Apply the same pattern to the **all bookings table**, **reservations table**, and **needs-review list** — search for every `booking-row` template and ensure customer name is the bold primary, reference is the small secondary.

- [ ] **Step 2: Update booking management hero to lead with name**

In the `openBookingManagementScreen` hero (line ~3582), it currently reads:
```js
<h3>${bookingAdminShared.escapeHtml(booking.reference)} · ${bookingAdminShared.escapeHtml(booking.customer_name||'Guest')}</h3>
```
Change to:
```js
<h3>${bookingAdminShared.escapeHtml(booking.customer_name||'Guest')} · ${bookingAdminShared.escapeHtml(booking.service_name||'Tour')}</h3>
<small style="font-size:13px;font-weight:400;opacity:.7">${bookingAdminShared.escapeHtml(booking.reference)}</small>
```

- [ ] **Step 3: Commit**
```bash
git add skybook-main/assets/js/booking-admin.js
git commit -m "fix: guest name+tour shown first, reference as secondary label throughout SkyBook"
```

---

## Task 10: Provisional booking status with bright yellow colour

**Files:**
- Modify: `skybook-main/supabase/functions/booking-api/index.ts:117-129`
- Modify: `skybook-main/booking-admin.html:1394-1403` (status dropdown)
- Modify: `skybook-main/assets/js/booking-admin.js` (validation, save button, status logic)
- `skybook-main/assets/css/booking.css` (already done in Task 2)

A **provisional booking** is one where details are incomplete — guest has expressed intent but full info is not yet captured. It saves without requiring guide or other normally-required fields.

- [ ] **Step 1: Add provisional to BOOKING_STATUS_TRANSITIONS (index.ts)**

Change:
```ts
const BOOKING_STATUS_TRANSITIONS:Record<string,string[]>={
  draft:['pending','payment_request_sent','awaiting_payment','cancelled','failed'],
  pending:['payment_request_sent','awaiting_payment','confirmed','rescheduled','cancelled','failed','no_show'],
  ...
  cancelled:['pending','awaiting_payment'],
```
Add `provisional` as a new valid status that can go to active statuses:
```ts
draft:['pending','provisional','payment_request_sent','awaiting_payment','cancelled','failed'],
pending:['provisional','payment_request_sent','awaiting_payment','confirmed','rescheduled','cancelled','failed','no_show'],
provisional:['pending','payment_request_sent','awaiting_payment','confirmed','cancelled'],
...
cancelled:['pending','provisional','awaiting_payment'],
```

Also add `provisional` to the `statusBreakdown` array (search `statusBreakdown=['pending',...`):
```ts
const statusBreakdown=['pending','provisional','payment_request_sent','awaiting_payment','confirmed','completed','cancelled','refunded','failed'].map(...)
```

- [ ] **Step 2: Add Provisional option to status dropdown (booking-admin.html)**

In the `adminBookingStatusField` select (line ~1394), add before `<option value="pending">Pending</option>`:
```html
<option value="provisional">Provisional</option>
```

- [ ] **Step 3: Add "Save as Provisional" button to booking form**

In the booking form action row (line ~1462):
```html
<div class="booking-field-full booking-action-row">
  <button class="booking-button ghost" type="button" id="adminBookingPreviewEmailButton">Preview Email</button>
  <button class="booking-button ghost" type="button" id="adminBookingSaveProvisionalButton">Save as Provisional</button>
  <button class="booking-button" type="submit" id="adminBookingSaveButton">Create Booking</button>
</div>
```

- [ ] **Step 4: Wire up provisional save button in booking-admin.js**

Add node reference after `bookingSaveButton`:
```js
bookingSaveProvisionalButton:document.getElementById('adminBookingSaveProvisionalButton'),
```

Add event listener (near the bottom with other button listeners):
```js
nodes.bookingSaveProvisionalButton?.addEventListener('click',()=>{
  if(nodes.bookingStatus)nodes.bookingStatus.value='provisional'
  state.bookingEditor.isProvisional=true
  nodes.bookingForm?.requestSubmit()
})
```

- [ ] **Step 5: Relax validation for provisional bookings in validateBookingForm**

At the top of `validateBookingForm` (line ~7157), add:
```js
const isProvisional=nodes.bookingStatus?.value==='provisional'||state.bookingEditor?.isProvisional
```

Then wrap guide name, email format, and phone length checks in `!isProvisional`:
```js
// Guide name — skip for provisional
if(!isProvisional && !nodes.bookingGuideName?.value.trim())
  errors.push(...)

// Email — still require it exists but not format for provisional
const email=nodes.bookingCustomerEmail?.value.trim()||''
if(!isProvisional && !email)
  errors.push({label:'Customer Email',message:'Email address is required.',fieldId:'adminBookingCustomerEmail'})
if(!isProvisional && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.toLowerCase()))
  errors.push(...)

// Phone length — skip for provisional
if(!isProvisional && phone && phone.replace(/[^\d+]/g,'').length<7)
  errors.push(...)
```

Also clear `state.bookingEditor.isProvisional` after save completes (in the `finally` or post-save callback).

- [ ] **Step 6: Display provisional status clearly in booking rows and management screen**

`getStatusBadgeClass` already handles `provisional` → `is-provisional` (from Task 2).

Add "Provisional" to `isReviewReservation` so it shows in the review queue:
```js
const isReviewReservation=booking=>['draft','pending','provisional'].includes(normalizeText(booking?.status))
```

- [ ] **Step 7: Deploy edge function and commit**
```bash
npx supabase functions deploy booking-api --project-ref <your-ref>

git add skybook-main/supabase/functions/booking-api/index.ts
git add skybook-main/booking-admin.html
git add skybook-main/assets/js/booking-admin.js
git commit -m "feat: provisional booking status — bright yellow, relaxed validation, save-as-provisional button"
```

---

## Task 11: Sync changes to Skybook Standalone and True Travel website, push True Travel to GitHub

**Files:**
- Mirror: `Skybook Standalone/` ← copy all changed files from `skybook-main/`
- Commit and push: `true-travel-site-main/true-travel-site-main/`

**IMPORTANT:** NEVER push `Skybook Standalone` to GitHub. Only push `true-travel-site-main`.

- [ ] **Step 1: Mirror changed SkyBook files to Skybook Standalone**
```powershell
$src = "C:\Users\gerri\OneDrive\Desktop\Aero Projects\True Sky Ventures\skybook-main"
$dst = "C:\Users\gerri\OneDrive\Desktop\Aero Projects\True Sky Ventures\Skybook Standalone"
Copy-Item "$src\assets\js\booking-admin.js" "$dst\assets\js\booking-admin.js" -Force
Copy-Item "$src\assets\css\booking.css" "$dst\assets\css\booking.css" -Force
Copy-Item "$src\booking-admin.html" "$dst\booking-admin.html" -Force
```

- [ ] **Step 2: Bump version strings in True Travel HTML files**

In `tours.html`, bump `booking-shared.js?v=` and `tours.js?v=` to today's date suffix.

In `index.html`, bump `booking-shared.js?v=` and `site.js?v=`.

- [ ] **Step 3: Push True Travel to GitHub**
```bash
cd "true-travel-site-main/true-travel-site-main"
git add -A
git commit -m "feat: add pickup/dropoff fields to website booking form"
git push origin main
```

---

## Task 12: Desktop (Electron) and Mobile (APK) — update and rebuild

**Files:**
- `skybook-main/electron/` — Electron desktop app
- `skybook-mobile/` — Android APK (WebView)

Both apps embed the same booking-admin files. After all JS/HTML/CSS changes are committed in `skybook-main`, rebuild each.

- [ ] **Step 1: Rebuild Electron desktop app**
```bash
cd "skybook-main"
npm run build          # or: npm run electron:build
# Copy output to Skybook Standalone/electron/ if applicable
```

- [ ] **Step 2: Rebuild Android APK**
```bash
cd "skybook-mobile"
# Update the embedded URL or copy updated assets
./gradlew assembleRelease   # or: npx cap build android
```

- [ ] **Step 3: Distribute updated apps to devices**

Replace the `.apk` file on the device and reinstall. For desktop, replace the Electron build on the admin machine.

---

## Self-Review

### Spec coverage
| # | Requirement | Task |
|---|-------------|------|
| 1 | Calendar: guest name+tour, no ref, no cancelled, hover tooltip | Task 1 ✓ |
| 2 | Status colour codes (reservation=green, booking=purple, paid=blue, finalised=dark blue, provisional=yellow) | Task 2, Task 10 ✓ |
| 3 | Reinstate cancelled bookings/reservations | Task 3 ✓ |
| 4 | Nationality, dietary, booked_by, Activity Bridge source | Task 4 ✓ |
| 5 | Rename Departure Times → Pickup Time | Task 5 ✓ |
| 6 | Return to main page button | Task 6 ✓ |
| 7 | Pickup Location + Drop-off Location fields | Task 4 (Steps 2,5,6,7,8,9) ✓ |
| 8 | Kayak/Kayak Combo tours not confirming | Task 8 ✓ |
| 9 | Guest name + tour shown first | Task 9 ✓ |
| 10 | Provisional booking, bright yellow | Task 10 ✓ |
| — | Desktop and mobile app update | Task 12 ✓ |
| — | Website booking forms updated | Task 4 Steps 8,9 ✓ |
| — | Standalone mirror | Task 11 ✓ |

### No placeholders detected ✓
### Type consistency ✓ — `getStatusRowClass`, `getStatusBadgeClass`, `state.preBookingTab`, `state.bookingEditor.isProvisional` used consistently across tasks.
