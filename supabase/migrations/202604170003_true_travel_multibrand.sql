create table if not exists public.brands (
  code text primary key,
  name text not null,
  legal_name text,
  website_url text,
  support_email text,
  support_phone text,
  support_whatsapp text,
  booking_prefix text not null default 'TT',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.bookings add column if not exists brand_code text references public.brands(code) on delete set null;
create index if not exists bookings_brand_code_idx on public.bookings (brand_code, created_at desc);

drop trigger if exists brands_set_updated_at on public.brands;
create trigger brands_set_updated_at before update on public.brands for each row execute function public.set_row_updated_at();

alter table public.brands enable row level security;

drop policy if exists "public read active brands" on public.brands;
create policy "public read active brands" on public.brands for select using (is_active = true);

drop policy if exists "admins manage brands" on public.brands;
create policy "admins manage brands" on public.brands for all using (public.is_booking_admin()) with check (public.is_booking_admin());

insert into public.brands (
  code,
  name,
  legal_name,
  website_url,
  support_email,
  support_phone,
  support_whatsapp,
  booking_prefix,
  is_active,
  sort_order,
  metadata
)
values
  (
    'true-travel',
    'True Travel',
    'True Travel Adventures',
    'https://truetravelnam.net',
    'bookings@truetravelnam.net',
    '+264813224270',
    '+264813224270',
    'TT',
    true,
    1,
    '{"shared_operator":"iventure","brand_role":"reseller"}'::jsonb
  ),
  (
    'iventure',
    'Iventure',
    'Iventure Namibia',
    'https://iventure.com.na',
    'bookings@iventure.com.na',
    '+264813224270',
    '+264813224270',
    'IV',
    true,
    2,
    '{"shared_operator":"iventure","brand_role":"operator"}'::jsonb
  )
on conflict (code) do update
set
  name = excluded.name,
  legal_name = excluded.legal_name,
  website_url = excluded.website_url,
  support_email = excluded.support_email,
  support_phone = excluded.support_phone,
  support_whatsapp = excluded.support_whatsapp,
  booking_prefix = excluded.booking_prefix,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = timezone('utc', now());

update public.bookings
set brand_code = coalesce(brand_code, 'true-travel')
where brand_code is null;
