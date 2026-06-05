-- Extend public.payment_status enum with new values used in the 7-status booking system
-- These values are set on payments.status during booking creation and updates

alter type public.payment_status add value if not exists 'invoice';
alter type public.payment_status add value if not exists 'invoiced';
alter type public.payment_status add value if not exists 'fully_paid';
