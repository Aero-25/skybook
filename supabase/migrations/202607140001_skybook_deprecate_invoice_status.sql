-- 202607140001_skybook_deprecate_invoice_status.sql
-- invoice_status (added by 202606290001) is no longer read or written anywhere in the app —
-- payment_status alone now drives invoicing/payment display (see the Payment Process field).
-- Documentation-only: no data is changed, the column stays in place in case of future need.
comment on column public.bookings.invoice_status is
  'Deprecated 2026-07-14: no longer read or written by the app. Payment/invoicing state is driven by payment_status.';
