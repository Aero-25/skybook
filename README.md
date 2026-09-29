# SkyBook

SkyBook is the small booking console behind the public **True Travel** and **Iventure** websites. It is deliberately simple and looks and works like SkyTrack (the Sea Breeze console): a top bar, six pages, plain cards and tables.

## What it does

1. **Reservations** — booking requests submitted on the two websites arrive as *provisional* and wait here. Staff review them and **Approve** (they become finalised bookings) or **Decline**.
2. **Bookings** — manual bookings entered by staff (phone, WhatsApp, walk-in, cruise liner groups). The booking form is the same one SkyBook has always used, including split payments, guides, pickup schedules and custom fields.
3. **Tours** — the shared tour catalogue used by both websites and by the booking form.
4. **Reports** — the five reports (Sales, Payment process, Agent / booked-by, Invoiced, Guides) with a date range and PDF download, plus a bookings CSV export and the website analytics page.
5. **Users** — who can sign in, and which pages they can see.
6. **Dashboard** — today's tours, new website reservations, the next seven days and unpaid balances.

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

## Deploy

Static site — deploy the repository root to the admin domain (Cloudflare, `wrangler.jsonc`). Point both public sites at the same Supabase backend.

## Smoke tests

```sh
SKYBOOK_ADMIN_USERNAME=... SKYBOOK_ADMIN_PASSWORD=... npm run test:smoke
```

## Related repositories

- `true-travel-site`
- `iventure-site`
