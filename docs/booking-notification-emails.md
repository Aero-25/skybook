# Booking notification emails

Every new booking raises two emails from the `booking-api` edge function:

| Template key | Goes to | Purpose |
| --- | --- | --- |
| `booking_received` | the guest | "we have your request" acknowledgement |
| `consultant_alert` | the brand's `bookings@` inbox | full ops handover with every captured field |

## Which bookings send email

Only bookings that arrive from a brand website. A booking captured in the
SkyBook admin sends neither the guest acknowledgement nor the ops alert — it is
already in front of a consultant, so an alert would tell them what they just
typed. This matches the new-booking push, which is gated the same way.

The gate is the `isAdmin` flag on `createBooking`: the public
`POST /bookings` route leaves it false, the admin `POST /admin/bookings` route
sets it true.

## Where the operations alert goes

Recipients are fixed per brand in `BRAND_CONSULTANT_EMAILS`:

| Brand code | Ops inbox |
| --- | --- |
| `true-travel` | `bookings@truetravelnam.net` |
| `iventure` | `bookings@iventuretours.net` |

A booking with an unknown brand code falls back to the True Travel inbox.

## What the alert contains

The alert is built from the booking record itself, not from the editable
template, so a template edit can never drop a field. Plain text and HTML are
generated from the same structure and always agree. Sections:

| Section | Contents |
| --- | --- |
| Booking | reference, brand, status, payment status, service, preferred and confirmed dates, booked-at, guide |
| Guests | total, adults, children, infants (a zero prints as `0` — it is a captured fact, not a gap) |
| Client | name, email, phone, WhatsApp |
| Booking form answers | every field defined on the brand's booking form, in form order, under its configured label — including ones the guest left blank, so a consultant can see what was asked |
| Operational details | everything under `metadata.operational_details` |
| Money | currency, subtotal, discounts/add-ons, tax, service fee, total, due now, due later |
| Notes | guest notes, internal notes, cancellation reason |
| Origin | source, capture page, created-via |
| Additional captured data | any other `metadata` key — the catch-all |

That last section is the guarantee: a field the website starts sending
tomorrow appears in the alert with no code change. Keys are humanised
(`heard_about_us` → "Heard about us"), booleans render Yes/No, arrays join
with commas, and nested objects flatten to `key: value` pairs.

Only `customer_snapshot` and keys already shown elsewhere are suppressed, to
keep the mail readable.

Missing values render as "Not captured" rather than blank. All interpolated
values are HTML-escaped — guest-supplied text (names, notes, form answers)
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
