-- Discount QR: brand binding, kind, service restriction, label, qr flag.
alter table public.coupons
  add column if not exists brand_code text,
  add column if not exists service_id uuid references public.services(id) on delete set null,
  add column if not exists kind text not null default 'campaign',
  add column if not exists label text,
  add column if not exists is_qr boolean not null default false;

alter table public.coupons
  drop constraint if exists coupons_kind_check;
alter table public.coupons
  add constraint coupons_kind_check check (kind in ('single_use','campaign'));

create index if not exists coupons_brand_code_idx on public.coupons(brand_code);
create unique index if not exists coupons_code_key on public.coupons(code);

create table if not exists public.coupon_redemptions(
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  brand_code text,
  amount numeric(12,2) not null default 0,
  redeemed_at timestamptz not null default now()
);
create unique index if not exists coupon_redemptions_coupon_booking_key
  on public.coupon_redemptions(coupon_id, booking_id);
