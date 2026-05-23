-- Guide name on bookings: assigned tour guide for the trip
alter table public.bookings
  add column if not exists guide_name text;

-- Adult/child quantity tracking on bookings
alter table public.bookings
  add column if not exists adult_quantity integer not null default 0,
  add column if not exists child_quantity integer not null default 0;

-- Adult/child pricing and pricing mode on services
alter table public.services
  add column if not exists adult_price numeric(12,2),
  add column if not exists child_price numeric(12,2),
  add column if not exists pricing_mode varchar(32) not null default 'fixed';

-- Ensure pricing_mode only holds valid values
alter table public.services
  add constraint if not exists services_pricing_mode_check
  check (pricing_mode in ('fixed','quote'));

comment on column public.bookings.guide_name is 'Assigned tour guide name. Required before reservation acceptance.';
comment on column public.bookings.adult_quantity is 'Number of adult guests in this booking.';
comment on column public.bookings.child_quantity is 'Number of child guests in this booking.';
comment on column public.services.adult_price is 'Per-adult price. When set alongside child_price, overrides base_price.';
comment on column public.services.child_price is 'Per-child price. Only applies when adult_price is also set.';
comment on column public.services.pricing_mode is 'fixed = regular price booking; quote = Request Quote flow (no booking record created).';
