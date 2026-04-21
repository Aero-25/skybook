# SkyBook Launch Readiness

SkyBook is not considered public-launch ready until every blocked item is cleared and every provider-dependent item is verified against the live domain.

## Code-side hardening completed

- Login and operations console are separated.
- Production demo fallback is disabled by default.
- Launch readiness checks are visible inside the SkyBook Health area.
- Admin navigation is organized into enterprise modules and submodules.
- Booking API, payment initiation, and payment webhook functions exist in the repo.
- Supabase migrations exist for booking, admin, finance, multibrand, permissions, workflows, and payment providers.

## Required before public launch

- Rotate all exposed secrets and tokens before live use.
- Confirm Supabase migrations are applied to the production project.
- Confirm `booking-api`, `payment-initiate`, and `payment-webhook` are deployed to the production Supabase project.
- Set production function secrets:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `DPO_COMPANY_TOKEN`
  - `DPO_SERVICE_TYPE`
  - `STRIPE_SECRET_KEY` if Stripe, Apple Pay, or Google Pay are enabled through Stripe.
  - `BANK_TRANSFER_INSTRUCTIONS`
- Verify DPO payment creation, success callback, failed callback, cancellation, and reconciliation.
- Verify Apple Pay and Google Pay domain requirements if enabled.
- Test guest invoice, receipt, voucher, manifest, and office settlement PDF generation/storage on production.
- Verify customer portal secure links, invoice downloads, change requests, document uploads, and pickup confirmations.
- Test admin roles:
  - super admin
  - reservations
  - finance
  - operations
  - supplier management
- Run a live smoke test from both public sites:
  - True Travel
  - Iventure
- Verify Cloudflare deployment, SSL, caching, and custom domains.
- Confirm backups, observability, health events, queue processing, and failure alerts.

## Launch smoke test

1. Sign in to SkyBook as super admin.
2. Create a test customer.
3. Create a confirmed booking.
4. Create an awaiting-payment booking.
5. Assign operator, guide, vehicle/resource, and pickup details.
6. Generate guest invoice.
7. Generate office settlement invoice.
8. Initiate DPO payment in test mode.
9. Confirm webhook updates payment status.
10. Generate receipt.
11. Send confirmation email.
12. Open customer portal link.
13. Submit a change request.
14. Export booking report.
15. Reconcile guest payment, invoice, commission, and operator payout.
