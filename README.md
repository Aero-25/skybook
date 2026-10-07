# SkyBook

SkyBook is the small booking console behind the public **True Travel** and **Iventure** websites. It is deliberately simple and looks and works like SkyTrack (the Sea Breeze console): a top bar, seven pages, plain cards and tables.

## What it does

1. **Reservations** — booking requests submitted on the two websites arrive as *provisional* and wait here. Staff review them and **Approve** (they become finalised bookings) or **Decline**.
2. **Bookings** — manual bookings entered by staff (phone, WhatsApp, walk-in, cruise liner groups). The booking form is the same one SkyBook has always used, including split payments, guides, pickup schedules and custom fields.
3. **Tours** — the shared tour catalogue used by both websites and by the booking form.
4. **Reports** — the five reports (Sales, Payment process, Agent / booked-by, Invoiced, Guides & skippers) as tabs over one filter row (date presets, custom range, brand). Each has KPI tiles with change versus the previous period, charts with hover detail, the underlying tables, and a PDF download. Plus a bookings CSV export and the website analytics page.
   The Guides & skippers report counts **trips**: bookings with the same guide (or skipper) on the same day and the same trip — AM or PM — share a car or boat and count once. A booking's trip comes from the tour's "Guide's trip" / "Skipper's trip" setting (for combos where each does one part), otherwise from its departure time. A combo with the name entered twice covers both the AM and the PM trip. Bookings with no departure count as a trip of their own and are listed so the departure can be set. Pick a person for their trips (each trip with the bookings that shared it) and download it as a PDF.
5. **Users** — who can sign in, and which pages they can see. Also the list of guides and skippers offered on the booking form (`crew_members` table): add new people, or retire someone who has left so they drop out of the dropdown while their name stays on past bookings and in reports. Staff can also add a new guide or skipper straight from the booking popup with **+ New guide** / **+ New skipper**.
6. **Dashboard** — today's tours, new website reservations, the next seven days and unpaid balances.
7. **Calendar** (the landing page) — month, week and day views of every booking by tour date. Click a day to create a booking or a cruise liner booking on that date, see who is on it, or print the arrivals sheet.

## Files

| Path | Purpose |
|---|---|
| `admin.html` | Workspace gateway: Design Studio, Booking Admin, Site Analytics and the app downloads |
| `login.html` | Sign in (`assets/js/skybook-login.js`) |
| `design-admin.html`, `tour-editor.html` | Design Studio for the public sites (`assets/js/admin.js`, `assets/css/admin.css`) |
| `booking-admin.html` | The console page (`assets/js/skybook-admin.js`, `assets/css/skybook.css`) |
| `analytics.html` | Website traffic analytics for both brands |
| `portal.html`, `review.html` | Guest-facing pages linked from emails (use `assets/css/booking.css`) |
| `assets/js/booking-shared.js`, `assets/js/shared.js` | Shared Supabase / booking-api client used by the console and both public sites |
| `supabase/` | Database migrations and the `booking-api`, `payment-*` and `daily-brief` Edge Functions |
| `sw.js`, `manifest.webmanifest` | PWA / push support |

## Backend

Everything talks to the shared Supabase project through the `booking-api` Edge Function (`admin/bootstrap`, `admin/bookings`, `admin/services`, `admin/users`, …). Both public sites post website bookings to the same API; those arrive in SkyBook as reservations.

## Run locally

```sh
node scripts/smoke-server.mjs        # serves the static site at http://127.0.0.1:4173
```

Open `http://127.0.0.1:4173/admin.html` (the workspace gateway) and sign in with a SkyBook user. The local instance uses the live Supabase backend, so it shows real data.

## Payment rule

A booking whose **Payment Process** is set (Cash, Card, EFT, Voucher, FOC, Invoiced) is fully paid, whether it is set when the booking is created or later. The API settles its payment row for the full total and records the settlement by method; the console shows nothing outstanding. Setting or correcting the Payment Process later moves the settled amount to that method, so a booking marked "Paid (method not recorded)" can be corrected and the reports follow. `supabase/migrations/202609290001_skybook_payment_process_means_paid.sql` applies the same rule to existing bookings.

## Split payments

A guest who pays with more than one method gets one row per method, either on the booking form (Split Payment) or with "Record payment" on the booking. All rows are checked first (amounts, card terminal serial and batch number, and on the booking form that they add up to the amount due), then sent in one request and recorded together, so a booking is never left with only some of its payments. Each method becomes its own transaction, so the Payment Process report counts every method; the booking shows as "Split · Cash + Card". Methods are read from all of a booking's transactions, so a cash deposit finished later by card (with "Record payment" or by setting the Payment Process) is a split payment too. `supabase/migrations/202610060001_skybook_split_payment_repair.sql` repairs bookings left part-paid by the old behaviour, and `202610070001_skybook_payment_process_and_split_repair.sql` marks past bookings without a payment process as paid and labels every booking paid by more than one method as split.

## Deploy

Static site — deploy the repository root to the admin domain (Cloudflare, `wrangler.jsonc`). Point both public sites at the same Supabase backend.

Backend changes are deployed separately from the repo root:

```sh
supabase link --project-ref asagrwkixsaltkkrqdsz
supabase db push                          # applies pending migrations
supabase functions deploy booking-api     # deploys the Edge Function
```

## Smoke tests

```sh
SKYBOOK_ADMIN_USERNAME=... SKYBOOK_ADMIN_PASSWORD=... npm run test:smoke
```

## Related repositories

- `true-travel-site`
- `iventure-site`
