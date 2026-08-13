# SkyBook Discount QR Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff generate a QR in SkyBook that encodes a brand-bound, server-validated discount; scanning it opens the correct brand booking form with the discount applied, the booking pulls into SkyBook with the discount recorded, and the guest gets a WhatsApp link noting the discount.

**Architecture:** Approach A — extend the existing server-validated `coupons` system. The QR carries only an opaque random code + brand; the discount is always recomputed server-side from the DB (never trusted from the client). New DB columns + an audit table + two atomic SQL functions back single-use burn and campaign caps. The edge function gains create/list/disable/preview endpoints and redemption enforcement. The SkyBook admin gets a QR generator (client-side QR rendering, vendored lib). Both brand sites read the code, show a locked discount banner, pass `coupon_code`, and add a discount line to the existing `wa.me` link.

**Tech Stack:** Supabase Postgres (SQL migrations), Deno/TypeScript edge function (`booking-api`), vanilla JS/HTML/CSS (SkyBook admin + both brand sites), vendored `qrcodejs` library. **No automated test runner exists** — verification is `deno check` for TS, `node --check` for JS, and a manual `curl` + browser matrix. The edge function + DB are shared infra (Supabase project `asagrwkixsaltkkrqdsz`); one deploy covers all sites.

**Spec:** `docs/superpowers/specs/2026-06-10-skybook-discount-qr-design.md`

---

## File Structure

| File | Role | Change |
| --- | --- | --- |
| `supabase/migrations/2026061001_discount_qr_columns.sql` | New `coupons` columns + `coupon_redemptions` table | Create |
| `supabase/migrations/2026061002_redeem_coupon_fn.sql` | `redeem_coupon` + `release_coupon` SQL functions | Create |
| `supabase/functions/booking-api/index.ts` | Create/list/disable + preview endpoints; redemption enforcement in `applyPromotions`/`createBooking` | Modify |
| `assets/js/vendor/qrcode.min.js` | Vendored QR renderer (no external API) | Create |
| `booking-admin.html` | QR generator panel markup (surgical) | Modify |
| `assets/js/booking-admin.js` | Generator + list/disable logic | Modify |
| `assets/css/booking.css` | Generator + QR styles (append) | Modify |
| `assets/js/booking-shared.js` | Demo-mode mock for create/list/disable/preview/redeem | Modify |
| **iventure-site-main** `booking.html`, `assets/js/booking-page.js`, brand CSS | Read code, banner, pass `coupon_code`, WA line | Modify |
| **true-travel-site-main/true-travel-site-main** same three files | Same wiring | Modify |
| **Skybook Final** mirror of the four `skybook-main` web files + migrations | Mirror (local only) | Modify |

**Verified anchors (booking-api/index.ts):**
- `requireSkybookPermission(profile,'engine')` — `:279` (coupons already use the `engine` permission — `:4722-4734`)
- `getRequestBrandCode(request,payload)` — `:341` (resolves body → `x-brand-code` header → `?brand` → `'true-travel'`)
- `applyPromotions(service,payload,pricingBase)` — `:2520`; coupon branch `:2528-2541`; returns `{discounts,totalDiscountAmount,voucherRow,agentRow}` `:2573`
- `createBooking(payload,{isAdmin,userId,brandCode})` — `:3425`; calls `applyPromotions` `:3437`; `maybeCreateBookingDiscounts` `:3530`; voucher redemption pattern `maybeApplyVoucherRedemption` `:3533`
- Public router top-level dispatch — `:4475-4513`; admin coupon upsert — `:4722-4734`
- `normalizeText`, `safeMaybeSingle`, `json(status,body)`, `adminClient` are module helpers already in scope.

**Brand booking base URLs** are stored in SkyBook settings as `settings.brand_booking_urls` = `{"true-travel":"https://<tt-domain>","iventure":"https://<iv-domain>"}`. Task 6 Step 1 sets these to the real production domains (confirm with Gerri before running).

---

## Phase 1 — Database

### Task 1: Coupons columns + redemption audit table

**Files:**
- Create: `supabase/migrations/2026061001_discount_qr_columns.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Discount QR: brand binding, kind, service restriction, label, qr flag.
alter table public.coupons
  add column if not exists brand_code text,
  add column if not exists service_id uuid references public.services(id) on delete set null,
  add column if not exists kind text not null default 'campaign',
  add column if not exists label text,
  add column if not exists is_qr boolean not null default false;

alter table public.coupons
  drop constraint if exists coupons_kind_check;
alter table public.coupons
  add constraint coupons_kind_check check (kind in ('single_use','campaign'));

create index if not exists coupons_brand_code_idx on public.coupons(brand_code);
create unique index if not exists coupons_code_key on public.coupons(code);

create table if not exists public.coupon_redemptions(
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  brand_code text,
  amount numeric(12,2) not null default 0,
  redeemed_at timestamptz not null default now()
);
create unique index if not exists coupon_redemptions_coupon_booking_key
  on public.coupon_redemptions(coupon_id, booking_id);
```

- [ ] **Step 2: Apply locally / to the linked project**

Run: `npx supabase db push --linked`
Expected: `Applying migration 2026061001_discount_qr_columns.sql...` then `Finished`. If it reports "up to date" the columns already exist — verify with Step 3.

- [ ] **Step 3: Verify schema**

Run:
```bash
npx supabase db execute --linked "select column_name from information_schema.columns where table_name='coupons' and column_name in ('brand_code','service_id','kind','label','is_qr') order by column_name;"
```
Expected: five rows — `brand_code, is_qr, kind, label, service_id`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026061001_discount_qr_columns.sql
git commit -m "feat(qr): coupons brand/kind/service columns + redemption audit table"
```

### Task 2: Atomic redeem / release functions

**Files:**
- Create: `supabase/migrations/2026061002_redeem_coupon_fn.sql`

- [ ] **Step 1: Write the functions**

```sql
-- Atomically reserve one redemption under all guards. Returns the coupon row
-- (or no row if the code is invalid/expired/exhausted/wrong brand/wrong service).
-- Single-use codes are deactivated in the same statement.
create or replace function public.redeem_coupon(
  p_code text,
  p_brand text,
  p_service_id uuid default null
) returns table(id uuid, discount_type text, discount_value numeric, kind text, description text)
language plpgsql as $$
declare
  v_id uuid;
begin
  update public.coupons c
    set usage_count = coalesce(c.usage_count,0) + 1,
        is_active = case when c.kind = 'single_use' then false else c.is_active end
  where upper(c.code) = upper(p_code)
    and c.is_active = true
    and coalesce(c.brand_code, p_brand) = p_brand
    and (c.usage_limit is null or coalesce(c.usage_count,0) < c.usage_limit)
    and (c.ends_at is null or now() < c.ends_at)
    and (c.starts_at is null or now() >= c.starts_at)
    and (c.service_id is null or c.service_id = p_service_id)
  returning c.id into v_id;

  if v_id is null then
    return;
  end if;

  return query
    select c.id, c.discount_type, c.discount_value, c.kind, c.description
    from public.coupons c where c.id = v_id;
end;
$$;

-- Compensating decrement if the booking fails after a successful reserve.
create or replace function public.release_coupon(p_coupon_id uuid)
returns void language plpgsql as $$
begin
  update public.coupons
    set usage_count = greatest(0, coalesce(usage_count,0) - 1),
        is_active = case when kind = 'single_use' then true else is_active end
  where id = p_coupon_id;
end;
$$;
```

- [ ] **Step 2: Apply**

Run: `npx supabase db push --linked`
Expected: `Applying migration 2026061002_redeem_coupon_fn.sql...` then `Finished`.

- [ ] **Step 3: Verify the function exists and guards work**

Run:
```bash
npx supabase db execute --linked "insert into public.coupons(code,discount_type,discount_value,is_active,kind,brand_code,usage_limit,usage_count) values ('QRTEST0001','percentage',10,true,'campaign','true-travel',1,0) on conflict (code) do nothing; select * from public.redeem_coupon('QRTEST0001','true-travel',null);"
```
Expected: one row with `discount_type=percentage, discount_value=10`.
Run it a **second time** (same command, re-using the row): expect **no rows** (cap of 1 reached). Then clean up:
```bash
npx supabase db execute --linked "delete from public.coupons where code='QRTEST0001';"
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026061002_redeem_coupon_fn.sql
git commit -m "feat(qr): atomic redeem_coupon + release_coupon functions"
```

---

## Phase 2 — Edge function

### Task 3: Admin create / list / disable endpoints

**Files:**
- Modify: `supabase/functions/booking-api/index.ts` (helpers near other `const ...=async` definitions, e.g. after `applyPromotions` ~`:2579`; routes in the authenticated admin block near `:4722`)

- [ ] **Step 1: Add the code generator + create/list/disable helpers**

Insert after the `applyPromotions` function (after line ~2579):

```typescript
const CROCKFORD='0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const generateCouponCode=(len=11)=>{
  const bytes=new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let out=''
  for(let i=0;i<len;i++)out+=CROCKFORD[bytes[i]%32]
  return out
}

const brandBookingBaseUrl=async(brandCode:string)=>{
  const settings=await getSettings()
  const map=(settings?.brand_booking_urls || {}) as Record<string,string>
  const base=normalizeText(map[brandCode])
  if(!base)throw new Error(`No booking URL configured for brand ${brandCode}. Set settings.brand_booking_urls.`)
  return base.replace(/\/+$/,'')
}

const createDiscountQr=async(payload:Json)=>{
  const brand=normalizeText(payload.brand_code)
  if(!['true-travel','iventure'].includes(brand))throw new Error('A valid brand_code is required.')
  const discountType=normalizeText(payload.discount_type)||'percentage'
  if(!['percentage','fixed'].includes(discountType))throw new Error('discount_type must be percentage or fixed.')
  const discountValue=Number(payload.discount_value||0)
  if(!(discountValue>0))throw new Error('discount_value must be greater than zero.')
  const kind=normalizeText(payload.kind)||'campaign'
  if(!['single_use','campaign'].includes(kind))throw new Error('kind must be single_use or campaign.')
  const maxRedemptions=payload.max_redemptions==null||payload.max_redemptions==='' ? null : Number(payload.max_redemptions)
  if(maxRedemptions!=null&&!(maxRedemptions>0))throw new Error('max_redemptions must be a positive number.')
  const endsAt=normalizeText(payload.ends_at)||null
  const serviceId=normalizeText(payload.service_id)||null
  const label=normalizeText(payload.label)||null

  let code=generateCouponCode()
  for(let attempt=0;attempt<5;attempt++){
    const clash=await safeMaybeSingle<Json>(adminClient.from('coupons').select('id').eq('code',code).maybeSingle())
    if(!clash)break
    code=generateCouponCode()
  }

  const insert=await adminClient.from('coupons').insert({
    code,
    description:label||`${brand} ${discountType==='percentage'?discountValue+'%':discountValue} discount`,
    discount_type:discountType,
    discount_value:discountValue,
    is_active:true,
    is_qr:true,
    kind,
    brand_code:brand,
    service_id:serviceId,
    label,
    usage_limit:kind==='single_use' ? 1 : maxRedemptions,
    usage_count:0,
    ends_at:endsAt
  }).select('*').single()
  if(insert.error)throw new Error(insert.error.message)

  const base=await brandBookingBaseUrl(brand)
  const url=`${base}/booking.html?promo=${encodeURIComponent(code)}`
  return { coupon:insert.data, code, url }
}

const listDiscountQr=async()=>{
  const rows=await safeTableSelect<Json>(
    adminClient.from('coupons').select('*').eq('is_qr',true).order('created_at',{ascending:false}),
    []
  )
  return { discount_qr:rows }
}

const disableDiscountQr=async(id:string)=>{
  const update=await adminClient.from('coupons').update({is_active:false}).eq('id',id).eq('is_qr',true).select('id').single()
  if(update.error)throw new Error(update.error.message)
  return { success:true }
}
```

> If `getSettings()` is not the exact settings accessor in this file, find it with `grep -nE "getSettings|fetchSettings|loadSettings|from\('settings'\)" supabase/functions/booking-api/index.ts` and use that name. `safeTableSelect` and `safeMaybeSingle` are already used throughout (e.g. `:4163`, `:2529`).

- [ ] **Step 2: Add the admin routes**

In the authenticated admin block, immediately after the coupons PATCH route (after line ~4734), add:

```typescript
      if(request.method==='POST'&&id==='discount-qr'&&!subresource){
        requireSkybookPermission(adminProfile,'engine')
        return json(201,await createDiscountQr(requestBody))
      }
      if(request.method==='GET'&&id==='discount-qr'&&!subresource){
        requireSkybookPermission(adminProfile,'engine')
        return json(200,await listDiscountQr())
      }
      if(request.method==='POST'&&id==='discount-qr'&&parts[3]==='disable'){
        requireSkybookPermission(adminProfile,'engine')
        return json(200,await disableDiscountQr(subresource))
      }
```

> Confirm the admin block's variable names (`id`, `subresource`, `parts`, `adminProfile`, `requestBody`) by reading the surrounding routes at `:4722-4734`; they are the names used there.

- [ ] **Step 3: Type-check**

Run: `deno check supabase/functions/booking-api/index.ts`
Expected: no errors. (If `deno` isn't installed: `npx --yes deno@1 check supabase/functions/booking-api/index.ts`.)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/booking-api/index.ts
git commit -m "feat(qr): admin create/list/disable discount-qr endpoints"
```

### Task 4: Public preview endpoint (read-only, rate-limited)

**Files:**
- Modify: `supabase/functions/booking-api/index.ts`

- [ ] **Step 1: Add a simple in-memory IP rate limiter + preview helper**

Insert after `disableDiscountQr` (from Task 3):

```typescript
const previewHits=new Map<string,{count:number,reset:number}>()
const previewRateLimited=(ip:string)=>{
  const now=Date.now()
  const slot=previewHits.get(ip)
  if(!slot||now>slot.reset){previewHits.set(ip,{count:1,reset:now+60_000});return false}
  slot.count++
  return slot.count>30 // max 30 previews/min/IP
}

const previewDiscountCode=async(code:string,brand:string)=>{
  const coupon=await safeMaybeSingle<Json>(
    adminClient.from('coupons').select('*').eq('code',normalizeText(code).toUpperCase()).eq('is_active',true).maybeSingle()
  )
  if(!coupon)return { valid:false }
  if(normalizeText(coupon.brand_code)!==brand)return { valid:false }
  if(coupon.ends_at&&new Date(String(coupon.ends_at)).getTime()<=Date.now())return { valid:false }
  if(coupon.usage_limit!=null&&Number(coupon.usage_count||0)>=Number(coupon.usage_limit))return { valid:false }
  let serviceSlug:string|null=null
  if(coupon.service_id){
    const svc=await safeMaybeSingle<Json>(adminClient.from('services').select('slug').eq('id',String(coupon.service_id)).maybeSingle())
    serviceSlug=svc?svc.slug as string:null
  }
  return {
    valid:true,
    discount_type:String(coupon.discount_type||'percentage'),
    discount_value:Number(coupon.discount_value||0),
    label:String(coupon.description||coupon.label||'Discount'),
    service_slug:serviceSlug
  }
}
```

- [ ] **Step 2: Add the public route**

In the top-level public dispatch (near `:4495`, alongside the other public GET routes), add:

```typescript
    if(request.method==='GET'&&resource==='discount-codes'&&id){
      const ip=normalizeText(request.headers.get('x-forwarded-for')).split(',')[0]||'unknown'
      if(previewRateLimited(ip))return json(429,{valid:false,error:'rate_limited'})
      return json(200,await previewDiscountCode(id,brandCode))
    }
```

`brandCode` is already computed at `:4481` via `getRequestBrandCode`, so the `x-brand-code` header (sent by both brand sites) drives the brand match.

- [ ] **Step 3: Type-check**

Run: `deno check supabase/functions/booking-api/index.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/booking-api/index.ts
git commit -m "feat(qr): public read-only discount-codes preview endpoint with rate limit"
```

### Task 5: Redemption enforcement in the booking flow

**Files:**
- Modify: `supabase/functions/booking-api/index.ts` — `applyPromotions` (`:2520-2579`), `createBooking` (`:3425`, around `:3530-3534`)

- [ ] **Step 1: Replace the coupon branch in `applyPromotions` with an atomic reserve**

Replace the existing coupon block (`:2528-2541`):

```typescript
  if(couponCode){
    const coupon=await safeMaybeSingle<Json>(
      adminClient
        .from('coupons')
        .select('*')
        .eq('code',couponCode)
        .eq('is_active',true)
        .maybeSingle()
    )
    if(coupon){
      const amount=normalizeDiscountAmount(pricingBase.totalAmount,String(coupon.discount_type || 'percentage'),Number(coupon.discount_value || 0))
      if(amount>0)discounts.push({source_type:'coupon',source_id:String(coupon.id),code:couponCode,description:String(coupon.description || `Coupon ${couponCode}`),amount})
    }
  }
```

with an atomic reserve via the SQL function (brand + service resolved from the payload/service):

```typescript
  let couponReserved:{id:string,amount:number}|null=null
  if(couponCode){
    const brandForCoupon=normalizeText(payload.brand_code)||'true-travel'
    const serviceIdForCoupon=String((service as Json)?.id || '')||null
    const { data:redeemRows, error:redeemError }=await adminClient.rpc('redeem_coupon',{
      p_code:couponCode, p_brand:brandForCoupon, p_service_id:serviceIdForCoupon
    })
    if(redeemError)throw new Error(redeemError.message)
    const reserved=Array.isArray(redeemRows)?redeemRows[0]:redeemRows
    if(reserved){
      const amount=normalizeDiscountAmount(pricingBase.totalAmount,String(reserved.discount_type || 'percentage'),Number(reserved.discount_value || 0))
      if(amount>0){
        discounts.push({source_type:'coupon',source_id:String(reserved.id),code:couponCode,description:String(reserved.description || `Coupon ${couponCode}`),amount})
        couponReserved={id:String(reserved.id),amount}
      }else{
        await adminClient.rpc('release_coupon',{p_coupon_id:String(reserved.id)})
      }
    }
  }
```

- [ ] **Step 2: Return the reservation from `applyPromotions`**

Change the return object (`:2573-2578`) from:

```typescript
  return {
    discounts,
    totalDiscountAmount:Number(discounts.reduce((sum,item)=>sum+item.amount,0).toFixed(2)),
    voucherRow,
    agentRow
  }
```

to:

```typescript
  return {
    discounts,
    totalDiscountAmount:Number(discounts.reduce((sum,item)=>sum+item.amount,0).toFixed(2)),
    voucherRow,
    agentRow,
    couponReserved
  }
```

- [ ] **Step 3: Record the audit row after booking insert, and compensate on failure**

In `createBooking`, just after `await maybeCreateBookingDiscounts(bookingId,promotionState.discounts)` (`:3530`), add:

```typescript
  if(promotionState.couponReserved){
    const auditInsert=await adminClient.from('coupon_redemptions').insert({
      coupon_id:promotionState.couponReserved.id,
      booking_id:bookingId,
      brand_code:brandCode,
      amount:promotionState.couponReserved.amount
    })
    // Idempotent: ignore unique-violation (same booking re-processed)
    if(auditInsert.error && !String(auditInsert.error.code||'').includes('23505')){
      // best-effort: leave the reservation in place; audit is non-blocking
      console.error('coupon_redemptions insert failed',auditInsert.error.message)
    }
  }
```

Then wrap the booking-row creation so a failure *after* the reserve releases it. Find the `try`/catch (or the booking insert) in `createBooking`; if there is no surrounding try, add one around the body after `applyPromotions` so that on throw you call:

```typescript
    if(promotionState?.couponReserved){
      await adminClient.rpc('release_coupon',{p_coupon_id:promotionState.couponReserved.id})
    }
    throw err
```

> Read `createBooking` (`:3425`-end) before editing to place the compensation in the existing error path. If the function already throws on insert error without a catch, add `try{ ... }catch(err){ <release> }` around the section from the `applyPromotions` call to the successful booking insert.

- [ ] **Step 4: Surface whether the discount applied (for the form's submit-time fallback)**

At the end of `createBooking`, ensure the returned booking object includes a flag. Find the final `return` of `createBooking` and add `discount_applied:Boolean(promotionState.couponReserved)` to the returned payload (alongside the booking). If it returns the raw booking row, wrap as `{...booking, discount_applied:Boolean(promotionState.couponReserved)}`.

- [ ] **Step 5: Type-check**

Run: `deno check supabase/functions/booking-api/index.ts`
Expected: no errors.

- [ ] **Step 6: Deploy the function and smoke-test the matrix**

Run: `npx supabase functions deploy booking-api --project-ref asagrwkixsaltkkrqdsz`
Expected: `Deployed Function booking-api`.

Then create a campaign code via SQL and exercise it:
```bash
npx supabase db execute --linked "insert into public.coupons(code,discount_type,discount_value,is_active,is_qr,kind,brand_code,usage_limit,usage_count) values ('QRSMOKE001','percentage',10,true,true,'campaign','true-travel',2,0) on conflict (code) do nothing;"
# preview (valid)
curl -s "https://asagrwkixsaltkkrqdsz.supabase.co/functions/v1/booking-api/discount-codes/QRSMOKE001" -H "x-brand-code: true-travel"
# preview wrong brand -> {"valid":false}
curl -s "https://asagrwkixsaltkkrqdsz.supabase.co/functions/v1/booking-api/discount-codes/QRSMOKE001" -H "x-brand-code: iventure"
```
Expected: first returns `{"valid":true,"discount_type":"percentage","discount_value":10,...}`; second returns `{"valid":false}`. Clean up: `npx supabase db execute --linked "delete from public.coupons where code='QRSMOKE001';"`

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/booking-api/index.ts
git commit -m "feat(qr): atomic coupon redemption + audit + discount_applied flag in booking flow"
```

---

## Phase 3 — SkyBook admin generator

### Task 6: Configure brand booking URLs

**Files:** none (data config)

- [ ] **Step 1: Set the production booking URLs (CONFIRM the domains with Gerri first)**

Run (replace with the real production domains):
```bash
npx supabase db execute --linked "update public.settings set brand_booking_urls = '{\"true-travel\":\"https://TRUE_TRAVEL_DOMAIN\",\"iventure\":\"https://IVENTURE_DOMAIN\"}'::jsonb where id = (select id from public.settings limit 1);"
```
Expected: `UPDATE 1`. If `settings` has no `brand_booking_urls` column, store under the existing settings JSON blob instead — check the settings shape with `npx supabase db execute --linked "select * from public.settings limit 1;"` and adapt `brandBookingBaseUrl` (Task 3) to read from the correct path.

- [ ] **Step 2: Verify create returns a correct URL**

(After Task 7 wires the UI you can do this in-app; for now, validate via curl with an admin token is optional.) No commit — this is configuration.

### Task 7: Vendored QR library + generator panel

**Files:**
- Create: `assets/js/vendor/qrcode.min.js`
- Modify: `booking-admin.html`, `assets/js/booking-admin.js`, `assets/css/booking.css`

- [ ] **Step 1: Vendor the QR library (no external runtime dependency)**

Run:
```bash
mkdir -p assets/js/vendor
curl -sL "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" -o assets/js/vendor/qrcode.min.js
test -s assets/js/vendor/qrcode.min.js && echo OK
```
Expected: `OK` and a non-empty file. This is `davidshimjs/qrcodejs` — global `QRCode`, renders to a `<div>` as canvas/img, no network calls.

- [ ] **Step 2: Load the library in `booking-admin.html`**

Find the existing `<script src="assets/js/booking-admin.js...">` line and add, immediately before it:

```html
  <script src="assets/js/vendor/qrcode.min.js"></script>
```

- [ ] **Step 3: Add the generator panel markup**

Inside the Revenue/marketing area of the admin (place it in the `payments` or a new `discount-qr` view section — follow the pattern of an existing `.admin-view`/panel). Add a panel:

```html
  <section class="qr-gen-panel" id="discountQrPanel" hidden>
    <header class="qr-gen-header"><h3>Discount QR Codes</h3></header>
    <form id="discountQrForm" class="qr-gen-form">
      <label>Brand
        <select name="brand_code" required>
          <option value="true-travel">True Travel</option>
          <option value="iventure">Iventure</option>
        </select>
      </label>
      <label>Discount type
        <select name="discount_type"><option value="percentage">Percentage %</option><option value="fixed">Fixed amount</option></select>
      </label>
      <label>Value <input name="discount_value" type="number" min="0.01" step="0.01" required></label>
      <label>Kind
        <select name="kind"><option value="campaign">Campaign (multi-use)</option><option value="single_use">Single use</option></select>
      </label>
      <label>Max redemptions (campaign) <input name="max_redemptions" type="number" min="1" step="1" placeholder="Unlimited"></label>
      <label>Expires <input name="ends_at" type="datetime-local"></label>
      <label>Restrict to service (optional) <input name="service_id" placeholder="service UUID or leave blank"></label>
      <label>Label <input name="label" placeholder="e.g. Summer flyer"></label>
      <button type="submit" class="booking-button">Generate QR</button>
    </form>
    <div class="qr-gen-result" id="discountQrResult" hidden>
      <div id="discountQrCanvas"></div>
      <p class="qr-gen-url"><strong>Code:</strong> <span id="discountQrCode"></span></p>
      <p class="qr-gen-url"><a id="discountQrLink" target="_blank" rel="noopener"></a></p>
      <button type="button" class="booking-button ghost" id="discountQrDownload">Download PNG</button>
    </div>
    <div class="qr-gen-list" id="discountQrList"></div>
  </section>
```

- [ ] **Step 4: Add the generator JS**

In `assets/js/booking-admin.js`, near the existing coupon handler (`:8587`), add:

```javascript
const renderDiscountQrList=async()=>{
  const wrap=document.getElementById('discountQrList')
  if(!wrap)return
  const {discount_qr=[]}=await bookingAdminShared.apiRequest('admin/discount-qr',{method:'GET'})
  wrap.innerHTML=discount_qr.map(c=>`
    <div class="qr-list-row">
      <strong>${bookingAdminShared.escapeHtml(c.label||c.code)}</strong>
      <span>${bookingAdminShared.escapeHtml(c.brand_code)} · ${bookingAdminShared.escapeHtml(c.discount_type)} ${c.discount_value}</span>
      <span>${c.usage_count||0}${c.usage_limit?'/'+c.usage_limit:''} used</span>
      <span>${c.is_active?'Active':'Disabled'}</span>
      ${c.is_active?`<button class="booking-button ghost compact-button" data-qr-disable="${bookingAdminShared.escapeHtml(c.id)}">Disable</button>`:''}
    </div>`).join('')||'<p>No discount QR codes yet.</p>'
}

const handleDiscountQrSubmit=async event=>{
  event.preventDefault()
  const data=new FormData(event.target)
  const body={
    brand_code:data.get('brand_code'),
    discount_type:data.get('discount_type'),
    discount_value:Number(data.get('discount_value')||0),
    kind:data.get('kind'),
    max_redemptions:data.get('max_redemptions')||null,
    ends_at:data.get('ends_at')||null,
    service_id:data.get('service_id')||null,
    label:data.get('label')||null
  }
  const {code,url}=await bookingAdminShared.apiRequest('admin/discount-qr',{method:'POST',body})
  const canvas=document.getElementById('discountQrCanvas')
  canvas.innerHTML=''
  new QRCode(canvas,{text:url,width:220,height:220,correctLevel:QRCode.CorrectLevel.M})
  document.getElementById('discountQrCode').textContent=code
  const link=document.getElementById('discountQrLink')
  link.textContent=url; link.href=url
  document.getElementById('discountQrResult').hidden=false
  showToast('Discount QR generated.','success')
  renderDiscountQrList()
}

document.getElementById('discountQrForm')?.addEventListener('submit',event=>{void handleDiscountQrSubmit(event)})
document.getElementById('discountQrList')?.addEventListener('click',async event=>{
  const id=event.target.closest('[data-qr-disable]')?.dataset.qrDisable
  if(!id)return
  await bookingAdminShared.apiRequest(`admin/discount-qr/${encodeURIComponent(id)}/disable`,{method:'POST',body:{}})
  showToast('Discount QR disabled.','info')
  renderDiscountQrList()
})
document.getElementById('discountQrDownload')?.addEventListener('click',()=>{
  const img=document.querySelector('#discountQrCanvas img')||document.querySelector('#discountQrCanvas canvas')
  if(!img)return
  const src=img.tagName==='IMG'?img.src:img.toDataURL('image/png')
  const a=document.createElement('a');a.href=src;a.download='discount-qr.png';a.click()
})
```

> Use the existing `showToast` and `bookingAdminShared.apiRequest` (both already used in this file, e.g. `:8587`). If the panel lives in a tab, call `renderDiscountQrList()` when that tab opens (hook into `switchTab` for the `payments`/`discount-qr` view, mirroring how other views lazy-load).

- [ ] **Step 5: Add panel CSS**

Append to `assets/css/booking.css`:

```css
/* Discount QR generator */
.qr-gen-panel{display:flex;flex-direction:column;gap:18px;max-width:680px}
.qr-gen-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.qr-gen-form label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:var(--sky-muted,#667789)}
.qr-gen-form input,.qr-gen-form select{min-height:40px;border:1px solid var(--sky-line,#d8e5ef);border-radius:10px;padding:0 10px}
.qr-gen-form button[type=submit]{grid-column:1/-1}
.qr-gen-result{display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:18px;border:1px solid var(--sky-line,#d8e5ef);border-radius:16px;background:#f8fbff}
.qr-gen-url{font-size:13px;word-break:break-all}
.qr-list-row{display:grid;grid-template-columns:1.4fr 1.4fr 1fr .7fr auto;gap:10px;align-items:center;padding:10px 12px;border:1px solid var(--sky-line,#d8e5ef);border-radius:12px;margin-bottom:8px;font-size:13px}
@media(max-width:768px){.qr-gen-form{grid-template-columns:1fr}.qr-list-row{grid-template-columns:1fr 1fr;gap:6px}}
```

- [ ] **Step 6: Verify in the browser (demo mode acceptable after Task 8)**

Open `booking-admin.html`, navigate to the Discount QR panel, generate a code. Expect: a scannable QR renders, the code + URL show, the list updates, Disable works. `node --check assets/js/booking-admin.js` must pass.

- [ ] **Step 7: Commit**

```bash
git add assets/js/vendor/qrcode.min.js booking-admin.html assets/js/booking-admin.js assets/css/booking.css
git commit -m "feat(qr): SkyBook admin discount QR generator panel"
```

### Task 8: Demo-mode mock parity

**Files:**
- Modify: `assets/js/booking-shared.js` (the in-browser mock API)

- [ ] **Step 1: Add mock handlers mirroring the endpoints**

Find the mock router (search `grep -nE "method==='POST'&&parts\[0\]==='admin'" assets/js/booking-shared.js`) and add, alongside the other admin handlers:

```javascript
  // Discount QR — create
  if(method==='POST'&&parts[0]==='admin'&&parts[1]==='discount-qr'&&!parts[2]){
    const brand=safeText(body?.brand_code)||'true-travel'
    const kind=safeText(body?.kind)||'campaign'
    const code=Array.from({length:11},()=>'0123456789ABCDEFGHJKMNPQRSTVWXYZ'[Math.floor(Math.random()*32)]).join('')
    const row={id:'qr_'+Date.now(),code,description:safeText(body?.label)||`${brand} discount`,discount_type:safeText(body?.discount_type)||'percentage',discount_value:Number(body?.discount_value||0),is_active:true,is_qr:true,kind,brand_code:brand,service_id:safeText(body?.service_id)||null,label:safeText(body?.label)||null,usage_limit:kind==='single_use'?1:(body?.max_redemptions?Number(body.max_redemptions):null),usage_count:0,ends_at:safeText(body?.ends_at)||null,created_at:new Date().toISOString()}
    db.coupons=db.coupons||[];db.coupons.unshift(row);writeDemoDb(db)
    return {coupon:row,code,url:`https://demo.local/booking.html?promo=${code}`}
  }
  // Discount QR — list
  if(method==='GET'&&parts[0]==='admin'&&parts[1]==='discount-qr'&&!parts[2]){
    return {discount_qr:(db.coupons||[]).filter(c=>c.is_qr)}
  }
  // Discount QR — disable
  if(method==='POST'&&parts[0]==='admin'&&parts[1]==='discount-qr'&&parts[2]&&parts[3]==='disable'){
    const row=(db.coupons||[]).find(c=>c.id===parts[2]);if(row)row.is_active=false;writeDemoDb(db)
    return {success:true}
  }
  // Discount QR — public preview
  if(method==='GET'&&parts[0]==='discount-codes'&&parts[1]){
    const row=(db.coupons||[]).find(c=>String(c.code).toUpperCase()===String(parts[1]).toUpperCase()&&c.is_active)
    if(!row)return {valid:false}
    if(row.ends_at&&new Date(row.ends_at).getTime()<=Date.now())return {valid:false}
    if(row.usage_limit!=null&&Number(row.usage_count||0)>=Number(row.usage_limit))return {valid:false}
    return {valid:true,discount_type:row.discount_type,discount_value:row.discount_value,label:row.description,service_slug:null}
  }
```

> Match the file's existing helpers: `safeText`, `writeDemoDb`, `db`, `parts`, `method`, `body` are already used by surrounding handlers (e.g. the payments handler added earlier). Adjust names if the local mock differs.

- [ ] **Step 2: Verify**

Run: `node --check assets/js/booking-shared.js`. Then in demo mode generate a QR (Task 7 UI) and confirm the list + disable work offline.

- [ ] **Step 3: Commit**

```bash
git add assets/js/booking-shared.js
git commit -m "feat(qr): demo-mode mock for discount QR create/list/disable/preview"
```

---

## Phase 4 — Brand booking forms

> Apply Task 9 **identically** to both repos:
> `iventure-site-main/` and `true-travel-site-main/true-travel-site-main/`.
> Paths below are relative to each repo root.

### Task 9: Read code, show locked banner, pass coupon_code, WA discount line

**Files (per repo):**
- Modify: `booking.html` (banner markup), `assets/js/booking-page.js` (read/preview/payload/WA), brand CSS file

- [ ] **Step 1: Add the discount banner markup to `booking.html`**

Immediately above the service `<select>` (find it via `grep -n "serviceSelect\|id=\"service" booking.html`), add:

```html
      <div class="promo-banner" id="promoBanner" hidden>
        <span class="promo-banner-icon">🎁</span>
        <span class="promo-banner-text" id="promoBannerText"></span>
      </div>
```

- [ ] **Step 2: Read the code + fetch preview on load**

In `assets/js/booking-page.js`, near the top where `bookingParams` is defined (`:2`), add:

```javascript
let activePromo=null // {code, discount_type, discount_value, label, service_slug}
const promoBanner=document.getElementById('promoBanner')
const promoBannerText=document.getElementById('promoBannerText')

const loadPromo=async()=>{
  const code=(bookingParams.get('promo')||'').trim()
  if(!code)return
  try{
    const res=await bookingSharedPage.apiRequest(`discount-codes/${encodeURIComponent(code)}`,{method:'GET'})
    if(res&&res.valid){
      activePromo={code,...res}
      const label=res.discount_type==='percentage'?`${res.discount_value}% off`:`${bookingSharedPage.formatMoney(res.discount_value)} off`
      if(promoBannerText)promoBannerText.textContent=`Discount applied: ${label}${res.label?` — ${res.label}`:''}`
      if(promoBanner)promoBanner.hidden=false
    }else if(promoBannerText){
      promoBannerText.textContent='This discount link is no longer valid. You can still book at the standard price.'
      if(promoBanner)promoBanner.hidden=false
    }
  }catch(err){ /* network: silently proceed at full price */ }
}
```

Then call `void loadPromo()` where the page initializes services (after the existing init call that loads `services`/`booking-fields`). If `activePromo.service_slug` is set, preselect and lock the service select once services are populated:

```javascript
const applyPromoServiceLock=()=>{
  if(!activePromo?.service_slug||!serviceSelect)return
  serviceSelect.value=activePromo.service_slug
  serviceSelect.setAttribute('disabled','disabled')
}
```
Call `applyPromoServiceLock()` at the end of `populateServices` (find it: `grep -n "populateServices" booking-page.js`).

- [ ] **Step 3: Include `coupon_code` in the payload**

In `buildPayload` (the returned object, iventure `:304`, TT equivalent), add one line inside the top-level object:

```javascript
    coupon_code:activePromo?.code||'',
```

- [ ] **Step 4: Add the discount line to the WhatsApp message**

Find the WA message line assembly (`waLines` near `:434`). After the existing summary lines and before the `wa.me` URL is built, add:

```javascript
    if(activePromo){
      const promoLabel=activePromo.discount_type==='percentage'?`${activePromo.discount_value}% off`:`${bookingSharedPage.formatMoney(activePromo.discount_value)} off`
      waLines.push(`Discount: ${promoLabel} (code ${activePromo.code})`)
    }
```

> If the booking response includes `discount_applied===false` while `activePromo` is set, show a confirm: "This offer is no longer available — book at full price?" before finalizing. Add after the `apiRequest('bookings',...)` call: check `result?.booking?.discount_applied===false && activePromo` → if so, `setStatus('This discount is no longer available — your booking was placed at the standard price.',true)` and skip the discount WA line. (This satisfies the spec's submit-time fallback without losing the booking.)

- [ ] **Step 5: Add banner CSS**

Append to the brand CSS file (find which one `booking.html` loads via `grep -n "stylesheet" booking.html`):

```css
.promo-banner{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;background:linear-gradient(135deg,#ecfdf5,#d1fae5);border:1px solid #a7f3d0;color:#065f46;font-weight:600;margin-bottom:14px}
.promo-banner-icon{font-size:18px}
```

- [ ] **Step 6: Verify (per repo)**

Run: `node --check assets/js/booking-page.js`. Open `booking.html?promo=TESTCODE` in a browser; with a valid code (use a real one created via the admin once Phase 2 is deployed) the banner shows the discount, the service locks if restricted, and submitting sends `coupon_code`. With a bogus code the "no longer valid" banner shows and booking proceeds at full price.

- [ ] **Step 7: Commit (per repo)**

```bash
git add booking.html assets/js/booking-page.js assets/css/*.css
git commit -m "feat(qr): read promo code, show locked discount banner, pass coupon_code, WA discount line"
```

---

## Phase 5 — Mirror & deploy

### Task 10: Mirror SkyBook web changes to Skybook Final (local only)

**Files:**
- `Skybook Final/assets/css/booking.css`, `assets/js/booking-admin.js`, `assets/js/booking-shared.js`, `assets/js/vendor/qrcode.min.js` — wholesale-safe copies
- `Skybook Final/booking-admin.html` — **surgical** (script tag + panel markup)
- `Skybook Final/supabase/migrations/*` — copy the two migration files (shared DB; informational parity)

> Standalone stays **local — commit only, no remote.** `booking-shared.js`, `admin.html`, `login.html`, `booking-admin.html` must be edited surgically, never overwritten wholesale.

- [ ] **Step 1: Copy wholesale-safe files**

```bash
cp "skybook-main/assets/css/booking.css" "Skybook Final/assets/css/booking.css"
cp "skybook-main/assets/js/booking-admin.js" "Skybook Final/assets/js/booking-admin.js"
mkdir -p "Skybook Final/assets/js/vendor"
cp "skybook-main/assets/js/vendor/qrcode.min.js" "Skybook Final/assets/js/vendor/qrcode.min.js"
cp skybook-main/supabase/migrations/2026061001_discount_qr_columns.sql "Skybook Final/supabase/migrations/" 2>/dev/null || true
cp skybook-main/supabase/migrations/2026061002_redeem_coupon_fn.sql "Skybook Final/supabase/migrations/" 2>/dev/null || true
```

- [ ] **Step 2: Surgically apply the demo-mock additions to `Skybook Final/assets/js/booking-shared.js`**

`booking-shared.js` is do-not-overwrite. Open it and paste the same mock handler blocks from Task 8 Step 1 into the same router location. Run `node --check "Skybook Final/assets/js/booking-shared.js"`.

- [ ] **Step 3: Surgically add the script tag + panel markup to `Skybook Final/booking-admin.html`**

Add the `<script src="assets/js/vendor/qrcode.min.js"></script>` line (Task 7 Step 2) and the `#discountQrPanel` markup (Task 7 Step 3) at the matching locations. Do not overwrite the file.

- [ ] **Step 4: Verify Standalone in demo mode**

Open `Skybook Final/booking-admin.html`, generate a QR, confirm list + disable work offline.

- [ ] **Step 5: Commit Standalone locally**

```bash
cd "Skybook Final"
git add assets/css/booking.css assets/js/booking-admin.js assets/js/booking-shared.js assets/js/vendor/qrcode.min.js booking-admin.html supabase/migrations
git commit -m "feat(qr): mirror discount QR generator from skybook-main"
cd ..
```

### Task 11: Deploy & end-to-end verification

**Files:** none

- [ ] **Step 1: Push skybook-main and both brand sites**

```bash
cd skybook-main && git push origin main && cd ..
cd iventure-site-main && git push origin main && cd ..
cd "true-travel-site-main/true-travel-site-main" && git push origin main && cd ../..
```
(Each triggers its own Cloudflare Pages deploy. The edge function was already deployed in Task 5 Step 6; re-deploy if changed since: `npx supabase functions deploy booking-api --project-ref asagrwkixsaltkkrqdsz`.)

- [ ] **Step 2: End-to-end matrix on the live sites**

Using the SkyBook admin, create one **campaign** (cap 2) and one **single_use** code for **each** brand. For each:
1. Scan/open the generated URL → correct brand form, banner shows the discount.
2. Complete a booking → it appears in SkyBook with the discount recorded; the WA link includes the discount line.
3. Single-use: a second attempt with the same URL shows "no longer valid".
4. Campaign cap: third redemption past the cap of 2 is refused at submit (full-price fallback message).
5. Cross-brand: open a True Travel code on the Iventure form → banner shows "no longer valid"; no discount applied.
6. Disable a code in SkyBook → its URL immediately shows "no longer valid".

- [ ] **Step 3: Confirm no regression to normal (no-promo) bookings**

Place a booking on each brand form **without** a `promo` param → books normally at full price, no banner, no `coupon_code`.

---

## Self-Review

**Spec coverage:**
- QR carries code+brand only, server recomputes discount → Tasks 3,5 (`redeem_coupon`, `applyPromotions`) ✓
- Single-use burn + campaign cap, atomic → Task 2 (`redeem_coupon` deactivates single_use; conditional UPDATE) ✓
- Expiry, max redemptions, service restriction → Tasks 1,2 (columns + guards), 3 (create), 4/5 (enforce) ✓
- Brand binding → Task 2 (brand in UPDATE), 4 (preview brand match), 5 (brand passed to RPC) ✓
- Crypto-random 11-char Crockford code → Task 3 (`generateCouponCode`) ✓
- Public preview, read-only, rate-limited → Task 4 ✓
- Kill switch (disable) → Task 3 (`disableDiscountQr`), enforced via `is_active` in Tasks 2/4 ✓
- Audit trail → Task 1 (`coupon_redemptions`), Task 5 (insert) ✓
- Submit-time fallback (never wrong price silently) → Task 5 (`discount_applied` flag) + Task 9 Step 4 ✓
- Admin generator UI + client-side QR (no external API) → Task 7 (vendored `qrcodejs`) ✓
- Demo parity → Task 8 ✓
- Both brand forms + WA discount line → Task 9 ✓
- Standalone mirror, local only, surgical protected files → Task 10 ✓
- Brand URLs not hardcoded → Task 6 (settings) + `brandBookingBaseUrl` (Task 3) ✓

**Placeholder scan:** No TBD/TODO. Three tasks (3,5,9) include a grep step because an exact helper/anchor name must be read from the live file before editing; each specifies the exact name to look for and the fallback. Task 6 intentionally requires confirming real domains with Gerri (a data value, not a code placeholder).

**Type/name consistency:** `generateCouponCode`, `createDiscountQr`, `listDiscountQr`, `disableDiscountQr`, `previewDiscountCode`, `previewRateLimited`, `brandBookingBaseUrl` (Tasks 3-4) used consistently in routes; `redeem_coupon`/`release_coupon` SQL names match between Task 2 (definition) and Task 5 (calls); `couponReserved` defined in `applyPromotions` (Task 5 Step 1), returned (Step 2), consumed in `createBooking` (Step 3); `activePromo`, `loadPromo`, `applyPromoServiceLock` consistent across Task 9; `discount_qr` response key consistent between Task 3 (`listDiscountQr`), Task 7 (UI), Task 8 (mock).
