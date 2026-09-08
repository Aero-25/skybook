# Booking notification emails

Every new booking raises two emails from the `booking-api` edge function:

| Template key | Goes to | Purpose |
| --- | --- | --- |
| `booking_received` | the guest | "we have your request" acknowledgement |
| `consultant_alert` | the brand's `bookings@` inbox | full ops handover with every captured field |

## Where the operations alert goes

Recipients are fixed per brand in `BRAND_CONSULTANT_EMAILS`:

| Brand code | Ops inbox |
| --- | --- |
| `true-travel` | `bookings@truetravelnam.net` |
| `iventure` | `bookings@iventuretours.net` |

A booking with an unknown brand code falls back to the True Travel inbox.

## What the alert contains

Plain-text and HTML parts both carry: reference, booking status, payment
status, service, preferred date, guest count, total, guest name / email /
phone, guest notes, custom form fields, and the origin (source, capture page,
created-via). Missing values render as "Not captured" rather than blank.

All interpolated values are HTML-escaped — guest-supplied text (names, notes)
cannot inject markup into the alert.

## Delivery: Resend

Set these as function secrets, never in the repo:

```
npx supabase secrets set EMAIL_PROVIDER=resend --project-ref <project-ref>
npx supabase secrets set RESEND_API_KEY=<key> --project-ref <project-ref>
npx supabase functions deploy booking-api --project-ref <project-ref>
```

Optional overrides:

| Secret | Default |
| --- | --- |
| `RESEND_FROM_TRUE_TRAVEL` | `True Travel Bookings <bookings@truetravelnam.net>` |
| `RESEND_FROM_IVENTURE` | `Iventure Bookings <bookings@iventuretours.net>` |
| `RESEND_FROM` | applies to both brands when the per-brand secret is unset |
| `RESEND_REPLY_TO` | unset |

`EMAIL_PROVIDER` also accepts `emailjs` (the previous provider). Any other
value queues the email in `email_logs` without dispatching, which is the safe
default when no provider is configured.

### Sending domains must be verified

Resend rejects mail from an unverified domain. Both `truetravelnam.net` and
`iventuretours.net` must show **Verified** in the Resend dashboard before any
alert is delivered — a pending domain fails the send and the row in
`email_logs` is marked `failed` with the Resend error attached.

## Checking delivery

Every attempt is a row in `email_logs`:

- `status` — `sent`, `failed`, or `queued`
- `metadata.dispatch_provider` — `resend`, `emailjs`, or `log_only`
- `metadata.resend_id` — the Resend message id, for tracing in their dashboard
- `error_message` — the provider's rejection reason on failure

Failed jobs are visible in the admin health panel alongside `system_jobs`.
