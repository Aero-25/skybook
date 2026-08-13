# SkyBook Discount QR Codes — Design Spec

**Date:** 2026-06-10
**Status:** Approved design, pending implementation plan
**Author:** Brainstormed with Gerri (Aero Digital / True Sky Ventures)
**Approach:** A — extend the existing server-validated coupon system (chosen over signed tokens and third-party services).

## Goal

Let staff generate a QR code in SkyBook that encodes a preset discount for either
**True Travel** or **Iventure**. Scanning the QR opens that brand's public booking
form with the discount applied. The booking pulls into SkyBook with the discount
recorded, and the guest gets a pre-filled WhatsApp message noting the discount.
The discount must be **server-authoritative and not tamperable**.

## Decisions (locked during brainstorming)

| Decision | Choice |
| --- | --- |
| Code reuse model | **Both** — each QR is created as `single_use` (burns after one booking) or `campaign` (multi-use until expiry/cap) |
| WhatsApp method | **Tap-to-send link** — reuse the existing post-booking `wa.me` link, add a discount line. No WhatsApp Business API. |
| Optional controls | **Expiry date**, **Max redemptions**, **Restrict to a service/tour** (minimum-spend was excluded) |
| Mandatory security | Discount lives server-side only; QR carries code+brand only; crypto-random codes; brand-bound; single-use burns; atomic redemption |

## Why this is not hackable

The QR/URL carries only an opaque random **code** and the brand. The discount
amount is **never** in the QR, the URL, or any client payload. The server looks
up the code in `coupons` and recomputes the discount from the trusted DB row
(this is already how `booking-api` works today —
[booking-api/index.ts:2528-2541](../../../supabase/functions/booking-api/index.ts#L2528-L2541),
[normalizeDiscountAmount:1591](../../../supabase/functions/booking-api/index.ts#L1591)).
Editing the URL cannot fabricate, inflate, or move a discount to another brand.

## Existing system (verified)

- `coupons` table already has: `code`, `description`, `discount_type`
  (`percentage`/`fixed`), `discount_value`, `starts_at`, `ends_at`,
  `usage_limit`, `usage_count`, `is_active`, `metadata` (jsonb)
  — confirmed at the admin upsert
  [booking-api/index.ts:4722-4734](../../../supabase/functions/booking-api/index.ts#L4722-L4734).
- Public coupon redemption already validates server-side but **only checks
  `is_active`** today; it does **not** enforce `ends_at`/`usage_limit` nor
  increment `usage_count` — this spec adds that enforcement.
- Both brand sites (`iventure-site-main`, `true-travel-site-main/true-travel-site-main`)
  have `booking.html` + `assets/js/booking-page.js`, read URL params via
  `URLSearchParams` (booking-page.js:2), POST to the shared booking-api, send an
  `x-brand-code` header, and build a post-booking `wa.me` link (booking-page.js:434).
  Brand codes: `true-travel`, `iventure`.
- The booking payload does **not** yet include `coupon_code`; the WA message does
  **not** yet mention a discount.

## Data model

Reuse existing columns; add a few; add one audit table.

**`coupons` — reused as-is:** `ends_at` → expiry, `usage_limit` → max
redemptions, `usage_count` → redemption count, `is_active` → kill switch,
`discount_type`/`discount_value` → the discount, `description` → guest-facing label.

**`coupons` — new columns (migration):**
| Column | Type | Purpose |
| --- | --- | --- |
| `brand_code` | text | `'true-travel'` or `'iventure'` — brand binding (NOT NULL for QR codes; indexed) |
| `service_id` | uuid null | restrict to one service/tour (FK to `services.id`) |
| `kind` | text | `'single_use'` or `'campaign'` (default `'campaign'`) |
| `label` | text null | staff-facing campaign name (distinct from guest `description`) |
| `is_qr` | boolean | default false; true marks codes created by the QR generator |

**`coupon_redemptions` — new table (audit + atomicity support):**
`id` (uuid pk), `coupon_id` (fk), `booking_id` (fk), `brand_code`, `amount`
(numeric), `redeemed_at` (timestamptz default now()). Unique index on
`(coupon_id, booking_id)` to make redemption idempotent per booking.

Codes are **11 chars of Crockford base32** (no I/L/O/U), generated server-side
with `crypto.getRandomValues` (~55 bits entropy). Uniqueness enforced by a unique
index on `coupons.code`; regenerate on the astronomically rare collision.

## Components (each isolated, one responsibility)

### Unit 1 — Admin QR Generator (SkyBook `booking-admin`)
**What:** A panel to create a discount QR and manage existing ones.
**Inputs:** brand (TT/Iventure), discount type+value, kind (single/campaign),
optional expiry, optional max redemptions, optional service restriction, label.
**Behavior:** POST to the create endpoint → receive `{code, url}` → render the QR
**client-side** from `url` using a bundled QR library (vendored locally — no
external QR API, so no data leaves the stack) → offer PNG download / print. A list
view shows each code's brand, kind, discount, redemptions (`usage_count` /
`usage_limit`), status, and a one-click **Disable**.
**Depends on:** create/list/disable endpoints; a vendored QR library.
**Files:** `booking-admin.html` (panel markup, surgical), `assets/js/booking-admin.js`
(generator logic), `assets/css/booking.css` (styles), `assets/js/vendor/qrcode.min.js` (new, vendored).

### Unit 2 — Server: admin create/list/disable (booking-api)
**Endpoints (auth-gated, `requireSkybookPermission(... 'engine')` to match existing coupon CRUD):**
- `POST admin/discount-qr` → validates inputs, generates a unique random code,
  inserts a `coupons` row (`is_qr=true`, brand/kind/service/label/expiry/limit),
  returns `{ id, code, url }` where `url = <brand booking base>/booking.html?promo=<CODE>`.
- `GET admin/discount-qr` → list QR coupons (`is_qr=true`) with redemption stats.
- `POST admin/discount-qr/{id}/disable` → set `is_active=false`.

Brand booking base URLs are read from SkyBook settings
(`settings.brand_booking_urls.{true-travel,iventure}`) so they aren't hardcoded.
**Files:** `supabase/functions/booking-api/index.ts`.

### Unit 3 — Server: public preview endpoint (booking-api)
**Endpoint:** `GET discount-codes/{code}` with `x-brand-code` header (public,
read-only, **rate-limited per IP**).
**Returns:** `{ valid:true, discount_type, discount_value, label, service_slug }`
(where `service_slug` is non-null only when the code is service-restricted) when
the code is active, brand-matched, unexpired, and under cap; otherwise
`{ valid:false }` with no detail (no enumeration hints). **Never** redeems or
mutates.
**Files:** `supabase/functions/booking-api/index.ts`.

### Unit 4 — Server: redemption enforcement (extends existing `bookings`)
Extend the discount-resolution block
([index.ts:2528-2541](../../../supabase/functions/booking-api/index.ts#L2528-L2541))
so that when a `coupon_code` is present the server enforces, in order:
`is_active` → `brand_code === payload.brand_code === x-brand-code header` →
`now < ends_at` (if set) → the booking's **resolved service id** matches
`coupons.service_id` (if set; the form sends `service_slug`, which booking-api
already resolves to a service row) → cap available.
**Atomic redemption:** a Postgres function `redeem_coupon(p_code, p_brand,
p_booking_id, p_amount)` performs
`UPDATE coupons SET usage_count = usage_count + 1
 WHERE code = p_code AND is_active AND (usage_limit IS NULL OR usage_count < usage_limit)
 AND (ends_at IS NULL OR now() < ends_at) AND brand_code = p_brand
 RETURNING id`, then for `single_use` also sets `is_active=false`, and inserts a
`coupon_redemptions` row (idempotent via the unique `(coupon_id, booking_id)`
index). This makes "last slot" and single-use double-spend race-safe. If the
function returns no row, the discount is **not** applied.
**Files:** `supabase/functions/booking-api/index.ts`, a new migration for
`redeem_coupon`.

### Unit 5 — Public form wiring (both brand sites)
**Behavior:** on load, read `?promo=CODE`; call the preview endpoint; if valid,
show a **locked, read-only** "Discount applied: X" banner and store the code; if
the preview returns a `service_slug`, preselect and lock that service in the form.
Include `coupon_code: CODE` in the booking payload. After a successful booking,
add a discount line to the existing `wa.me` message
(booking-page.js:434). If preview is invalid, show "This discount link is no
longer valid" and proceed at full price.
**Files (mirrored in both repos):** `assets/js/booking-page.js`, `booking.html`
(banner markup), brand CSS.

## Data flow

1. Staff create QR in SkyBook → server stores coupon (`is_qr=true`) → admin renders
   QR for `https://<brand-site>/booking.html?promo=<CODE>`.
2. Guest scans → brand form opens → form calls `GET discount-codes/{code}` →
   shows locked banner.
3. Guest submits → `POST bookings` with `coupon_code` → server validates +
   `redeem_coupon(...)` atomically → booking created with the discount record
   (existing `booking_discounts`/`booking_items` path).
4. Form builds the `wa.me` link including the discount line → guest taps to send.
5. Booking appears in SkyBook with the discount (existing rendering).

## Error handling

- **Invalid/expired/exhausted/wrong-brand at preview** → banner: "This discount
  link is no longer valid." Booking proceeds at full price.
- **Valid at preview but fails at submit** (cap just hit, expired in between,
  disabled) → `redeem_coupon` returns no row → booking-api responds
  `{ discount_applied:false, reason:'discount_unavailable' }`. The form shows
  "This offer is no longer available — book at full price?" and requires an
  explicit guest re-confirm. **A booking is never silently placed at the wrong
  price.**
- **Wrong-brand code** → preview and redemption both reject; brand mismatch is a
  hard fail (never silently honored on the other brand).
- **Disabled mid-campaign** → `is_active=false` → immediate rejection everywhere.
- **Preview rate-limit exceeded** → `429`; form treats as "no discount" and
  proceeds at full price.

## Testing

- **Demo mode parity:** the in-browser mock API in SkyBook
  (`assets/js/booking-shared.js`) mirrors create/list/disable/preview/redeem with
  caps, expiry, brand binding, and single-use burn so the admin generator works in
  demo. (Public brand sites' own `booking-shared.js` mock, if present, mirrors the
  preview shape.)
- **Manual matrix:** create single_use and campaign for each brand; scan→redeem;
  exhaust the cap; pass expiry; wrong-brand rejection (TT code on Iventure);
  service-restricted code on a different service; Disable mid-life; two concurrent
  redemptions of the last slot (expect exactly one success).
- **Security checks:** edit the URL to change `promo` to another brand's code
  (reject); attempt to add a fake discount param (ignored — server recomputes);
  confirm the preview endpoint leaks no internal fields; confirm rate-limit.

## Scope & repositories

One coherent feature spanning four repos over the shared Supabase project
(`asagrwkixsaltkkrqdsz`):

| Repo | Changes |
| --- | --- |
| `skybook-main` | Admin QR generator, edge-function endpoints + `redeem_coupon` migration + `coupons` migration, demo mock, vendored QR lib |
| `Skybook Final` (Standalone) | Mirror the admin generator + CSS + `booking-admin.js`; surgical for `booking-admin.html` (per sync rules; stays local, no remote) |
| `iventure-site-main` | `booking.html` banner + `booking-page.js` wiring + CSS |
| `true-travel-site-main/true-travel-site-main` | Same form wiring as Iventure |

The edge function and DB migrations are **shared infra** — one Supabase deploy
covers all sites. The brand sites and `skybook-main` deploy via their own
GitHub→Cloudflare Pages pipelines.

## Out of scope (YAGNI)

- WhatsApp Business API / automated outbound messages (tap-to-send only).
- Minimum-spend thresholds (excluded by choice).
- Per-guest identity binding beyond single-use burn.
- Stacking multiple QR discounts on one booking (one `coupon_code` per booking,
  as today).
- Signed/stateless token codes (rejected — server state is required regardless).
