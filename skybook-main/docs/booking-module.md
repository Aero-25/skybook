# True Travel Booking Module

Assumption: the current application stack is static HTML/CSS/vanilla JS backed by Supabase. The booking module is therefore implemented as frontend pages plus Supabase Postgres and Edge Functions.

## 1. Technical overview

### Architecture

- Frontend:
  - `services.html`
  - `service.html`
  - `booking.html`
  - `booking-success.html`
  - `booking-lookup.html`
  - `booking-admin.html`
- Shared client layer:
  - `assets/js/booking-shared.js`
- Backend:
  - `supabase/migrations/20260417_true_travel_booking_module.sql`
  - `supabase/functions/booking-api`
  - `supabase/functions/payment-initiate`
  - `supabase/functions/payment-webhook`
- Validation:
  - client validation in `booking-shared.js`
  - server validation in `booking-api`
- Notifications:
  - email payloads queue into `email_logs`
  - templates live in `settings` and local defaults
- Payment abstraction:
  - provider hooks for `manual_eft`, `stripe`, `paypal`, and `custom`

### MVP vs future

- MVP:
  - service browsing
  - booking form
  - preferred date capture
  - pricing calculation
  - booking references
  - admin review
  - status history
  - payment shell
  - email queueing
  - CSV export
- Future:
  - coupons, vouchers, customer portal, invoices, WhatsApp delivery, seasonal pricing, agent bookings, calendar sync, true availability logic

## 2. Folder / file structure

```text
assets/
  css/
    booking.css
  js/
    booking-shared.js
    services.js
    service-detail.js
    booking-page.js
    booking-lookup.js
    booking-admin.js
docs/
  booking-module.md
supabase/
  migrations/
    20260417_true_travel_booking_module.sql
  functions/
    _shared/cors.ts
    booking-api/index.ts
    payment-initiate/index.ts
    payment-webhook/index.ts
services.html
service.html
booking.html
booking-success.html
booking-lookup.html
booking-admin.html
```

## 3. Database schema

### Tables

- `service_categories`
  - `id uuid pk`
  - `slug text unique`
  - `name text`
  - `description text`
  - `sort_order int`
  - `is_active bool`
- `services`
  - `id uuid pk`
  - `category_id uuid fk`
  - `slug text unique`
  - `sku text unique`
  - `name text`
  - `short_description text`
  - `full_description text`
  - `duration_label text`
  - `unit_label text`
  - `preferred_date_mode service_date_mode`
  - `base_price numeric(12,2)`
  - `currency_code text`
  - `tax_rate numeric(6,2)`
  - `service_fee numeric(12,2)`
  - `payment_mode text`
  - `deposit_type discount_type`
  - `deposit_value numeric(12,2)`
  - `requires_manual_confirmation bool`
  - `is_active bool`
  - `metadata jsonb`
  - `media jsonb`
- `service_addons`
  - `id uuid pk`
  - `service_id uuid fk`
  - `slug text`
  - `name text`
  - `description text`
  - `pricing_type text`
  - `price numeric(12,2)`
  - `currency_code text`
  - `is_active bool`
  - `sort_order int`
- `customers`
  - `id uuid pk`
  - `full_name text`
  - `email text`
  - `phone text`
  - `whatsapp text`
  - `marketing_consent bool`
  - unique index on lowercased `email`
- `customer_addresses`
  - `id uuid pk`
  - `customer_id uuid fk`
  - address fields
- `bookings`
  - `id uuid pk`
  - `reference text unique`
  - `customer_id uuid fk`
  - `service_id uuid fk`
  - `status booking_status`
  - `payment_status payment_status`
  - `source text`
  - `preferred_date date`
  - `confirmed_date date`
  - `quantity int`
  - `currency_code text`
  - subtotal/addons/tax/fee/total fields
  - `amount_due_now`
  - `amount_due_later`
  - notes, cancellation reason, metadata
  - indexes on status/date, reference, lookup tuple
- `booking_items`
  - service/add-on/fee/tax lines per booking
- `booking_status_history`
  - audit trail for every status move
- `payments`
  - one or more payment intents/records linked to a booking
- `payment_transactions`
  - raw gateway/webhook reconciliation rows
- `admin_notes`
  - internal staff notes
- `email_logs`
  - email queue and delivery history
- `settings`
  - booking config and template storage
- `app_users`
  - admin roles linked to `auth.users`
- Future-ready:
  - `coupons`
  - `booking_coupon_redemptions`

### Enums

- `booking_status`: `draft`, `pending`, `awaiting_payment`, `confirmed`, `cancelled`, `completed`, `refunded`, `failed`
- `payment_status`: `unpaid`, `pending`, `authorized`, `paid`, `partially_paid`, `failed`, `refunded`, `cancelled`
- `payment_provider`: `manual_eft`, `stripe`, `paypal`, `custom`
- `service_date_mode`: `optional`, `required`, `hidden`
- `discount_type`: `percentage`, `fixed`
- `email_log_status`: `queued`, `sent`, `failed`, `skipped`
- `admin_role`: `super_admin`, `manager`, `booking_agent`, `finance`

## 4. Booking lifecycle

### Customer-side

1. Browse services
2. Open a service detail page
3. Submit booking form
4. Receive reference and thank-you page
5. Use reference + email lookup later

### Admin-side

1. Review `pending` bookings
2. Confirm or move to `awaiting_payment`
3. Mark paid / reconcile webhook
4. Complete or cancel
5. Audit history stays attached

### State meanings

- `draft`: internal or staged
- `pending`: submitted and waiting for review
- `awaiting_payment`: approved, waiting for payment
- `confirmed`: accepted and ready
- `cancelled`: intentionally closed
- `completed`: service delivered
- `refunded`: refunded after cancellation/change
- `failed`: failed workflow or payment

## 5. Routes / API endpoints

### Public

- `GET /functions/v1/booking-api/services`
- `GET /functions/v1/booking-api/services/:slug`
- `POST /functions/v1/booking-api/bookings`
- `POST /functions/v1/booking-api/bookings/lookup`
- `POST /functions/v1/payment-initiate`
- `POST /functions/v1/payment-webhook?provider=stripe`

### Admin

- `GET /functions/v1/booking-api/admin/bookings`
- `PATCH /functions/v1/booking-api/admin/bookings/:id`

### Examples

Create booking request:

```json
{
  "service_slug": "pelican-point-kayaking",
  "preferred_date": "2026-05-10",
  "quantity": 2,
  "addons": [],
  "accept_terms": true,
  "customer": {
    "full_name": "Jamie Guest",
    "email": "jamie@example.com",
    "phone": "+264810000000"
  },
  "notes": "Anniversary trip"
}
```

Create booking response:

```json
{
  "booking": {
    "id": "uuid",
    "reference": "TT-260417-ABCD",
    "status": "pending",
    "payment_status": "pending",
    "total_amount": 7700,
    "currency": "NAD"
  }
}
```

## 6. Frontend code

- The public pages are mobile-friendly and reuse the same card/panel/form styles.
- The booking form supports:
  - service selection
  - preferred date
  - quantity
  - full name
  - email
  - phone / WhatsApp
  - special notes
  - terms acceptance
  - optional add-ons
  - automatic booking reference preview
  - live total calculation

## 7. Admin code

- Dashboard metrics
- Booking list and detail
- Service overview
- Customer overview
- Payment overview
- Local booking configuration
- Email template preview
- CSV export

## 8. Email templates

Default variables:

- `customer_name`
- `booking_reference`
- `service_name`
- `booking_date`
- `total_amount`
- `payment_status`

The current module queues email jobs in `email_logs`. A real sender can consume the queue later.

## 9. Migration / seed examples

The migration seeds:

- service categories
- booking config settings

Example extra service seed:

```sql
insert into public.services (
  category_id,
  slug,
  name,
  short_description,
  duration_label,
  preferred_date_mode,
  base_price,
  metadata
)
select
  sc.id,
  'pelican-point-kayaking',
  'Pelican Point Kayaking',
  'Seal-rich kayaking trip with local guides.',
  'Half Day · 3 Hours',
  'optional',
  3850,
  '{"category_slug":"coastal-tours","highlight_points":["Local guides","Hotel pickup","Morning departure"]}'::jsonb
from public.service_categories sc
where sc.slug='coastal-tours'
on conflict (slug) do nothing;
```

## 10. Setup instructions

1. Run the SQL migration in Supabase.
2. Deploy the Edge Functions:
   - `booking-api`
   - `payment-initiate`
   - `payment-webhook`
3. Set function secrets:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Add admin users to `app_users` after their Supabase Auth accounts exist.
5. Seed live services and add-ons.
6. Connect real Stripe/PayPal credentials inside the provider stubs when ready.

## Future-ready enhancements

- promo codes
- vouchers
- seasonal pricing
- agent/reseller bookings
- customer accounts and a portal
- WhatsApp notifications
- invoice generation
- Google Calendar sync
- multilingual / multicurrency
- advanced reporting
- optional real availability/resource management later
