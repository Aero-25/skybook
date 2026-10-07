# Support tickets

Staff report a problem from inside SkyBook with the floating bubble in the
bottom-right corner. A ticket goes to Aero Digital support by email with a
screenshot of the page, the staff member's message, and who logged it.

## What the staff member sees

1. Click the bubble ("Report an issue"). A panel opens and a screenshot of the
   page underneath is taken straight away.
2. Optional: **Mark up** the screenshot — **Box** or **Draw** around the
   problem, or **Hide** guest names and payment details. Hidden areas are
   painted over in the browser, so they never leave the device. **Retake** or
   remove the screenshot if needed.
3. Type the issue, pick Problem / Question / Suggestion, and **Send ticket**
   (or Ctrl/⌘ + Enter).
4. The panel confirms with the ticket number, e.g. `TKT-1042`.

The message draft survives closing the panel and reloading the page until it is
sent. The bubble appears only when someone is signed in — on the console
(`booking-admin.html`), Site Analytics and the Design Studio.

## What support receives

One email per ticket to `info@aerodigital.space`:

- ticket number, type and time (Namibia time)
- **Logged by** — name, role and username from the signed-in SkyBook profile
  (resolved on the server from the access token, never from the request body)
- the message
- the screenshot inline, and attached at full size
- where it happened: page, section, open dialog, address
- device: app (browser, installed web app, desktop or Android app), browser,
  window size, the user's clock and language
- errors shown on screen just before the ticket (red error toasts and uncaught
  script errors)

When the staff member has a real email address on their login, replying to the
ticket email goes to them. Username-only logins (`…@skybook.local`) have no
reply address.

## How it works

| Part | Where |
|---|---|
| Bubble, panel, screenshot and mark-up | `assets/js/skybook-support.js` (renders in a shadow root; page CSS cannot affect it) |
| Screenshot library | `assets/js/vendor/html2canvas-pro.min.js` (MIT; jsDelivr fallback) |
| API | `POST admin/support-tickets` and `GET admin/me` in `booking-api` (`supabase/functions/booking-api/support-tickets.ts`) |
| Ticket records | `support_tickets` table — migration `202610070005_skybook_support_tickets.sql` |
| Screenshots | private `support-tickets` storage bucket, `YYYY-MM/TKT-1042.jpg` |

Any active SkyBook user can log a ticket. Screenshots are JPEG, at most 1920 px
wide (usually 100–300 KB).

If the `support_tickets` table does not exist yet, tickets are still emailed,
with a date-based reference such as `TKT-261007-AB12` instead of a number.

## Email delivery

Sent through Resend with the same `RESEND_API_KEY` as the booking emails.
`EMAIL_PROVIDER` does not affect support tickets.

| Secret | Default |
|---|---|
| `SUPPORT_TICKET_EMAIL` | `info@aerodigital.space` (comma-separate for more than one) |
| `RESEND_FROM_SUPPORT` | `Iventure Support <bookings@iventuretours.net>` (the address of `RESEND_FROM_IVENTURE` when that is set) |

The sending domain must be verified in Resend. If the email fails, the staff
member sees the reason and can send again; the attempt stays in
`support_tickets` with `email_status = 'failed'` and the error.

## Checking tickets

```sql
select ticket_number, created_at, reporter_name, category, email_status, email_error, page_view, left(message, 80)
from support_tickets
order by created_at desc
limit 20;
```
