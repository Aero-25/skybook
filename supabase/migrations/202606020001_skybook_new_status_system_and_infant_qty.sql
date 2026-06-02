-- Add new booking status values for the redesigned status system
-- provisional → payment_pending → invoice → invoiced → partially_paid → fully_paid → finalised
alter type public.booking_status add value if not exists 'provisional';
alter type public.booking_status add value if not exists 'no_show';
alter type public.booking_status add value if not exists 'rescheduled';
alter type public.booking_status add value if not exists 'payment_pending';
alter type public.booking_status add value if not exists 'invoice';
alter type public.booking_status add value if not exists 'invoiced';
alter type public.booking_status add value if not exists 'fully_paid';
alter type public.booking_status add value if not exists 'finalised';

-- Add infant_quantity column to track guests under 4 years old
alter table public.bookings
  add column if not exists infant_quantity integer not null default 0;

comment on column public.bookings.infant_quantity is 'Number of infant guests (under 4 years) in this booking.';
