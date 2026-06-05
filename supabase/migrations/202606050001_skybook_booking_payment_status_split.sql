-- Migrate to two-field booking/payment status system
-- booking.status  → provisional | confirmed | cancelled (booking lifecycle)
-- booking.payment_status → invoice | invoiced | partially_paid | fully_paid | '' (payment progress)

-- Step 1: Change payment_status column from enum to text
-- The view booking_admin_overview depends on this column, so drop and recreate it
drop view if exists public.booking_admin_overview;

alter table public.bookings
  alter column payment_status type text using coalesce(payment_status::text, '');

alter table public.bookings
  alter column payment_status set default '';

create or replace view public.booking_admin_overview as
select b.id,b.reference,b.status,b.payment_status,b.preferred_date,b.total_amount,b.currency_code,b.created_at,c.full_name as customer_name,c.email as customer_email,c.phone as customer_phone,s.name as service_name
from public.bookings b join public.customers c on c.id=b.customer_id join public.services s on s.id=b.service_id;

-- Step 2: Migrate legacy single-field status values to the new two-field model

update public.bookings
  set status = 'confirmed', payment_status = 'invoice'
  where status::text = 'payment_pending';

update public.bookings
  set status = 'confirmed', payment_status = 'invoice'
  where status::text = 'invoice';

update public.bookings
  set status = 'confirmed', payment_status = 'invoiced'
  where status::text = 'invoiced';

update public.bookings
  set status = 'confirmed', payment_status = 'partially_paid'
  where status::text = 'partially_paid';

update public.bookings
  set status = 'confirmed', payment_status = 'fully_paid'
  where status::text = 'fully_paid';

update public.bookings
  set status = 'confirmed', payment_status = 'fully_paid'
  where status::text in ('finalised', 'completed');

update public.bookings
  set status = 'provisional', payment_status = ''
  where status::text in ('pending', 'awaiting_payment', 'draft');

-- Step 3: Normalise residual payment_status values from the old enum

-- 'paid' → fully_paid
update public.bookings
  set payment_status = 'fully_paid'
  where status::text = 'confirmed' and payment_status = 'paid';

-- Confirmed bookings with stale/empty payment_status → invoice (minimum state for a confirmed booking)
update public.bookings
  set payment_status = 'invoice'
  where status::text = 'confirmed'
    and payment_status in ('unpaid', 'pending', 'authorized', '');

-- Provisional bookings: clear stale payment_status values
update public.bookings
  set payment_status = ''
  where status::text = 'provisional'
    and payment_status in ('unpaid', 'pending', 'authorized');

update public.bookings
  set payment_status = ''
  where status::text in ('cancelled', 'refunded', 'failed', 'no_show', 'rescheduled')
    and payment_status in ('unpaid', 'pending', 'cancelled', 'failed', 'refunded', 'authorized');
