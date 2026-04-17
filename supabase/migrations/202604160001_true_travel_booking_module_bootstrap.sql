create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname='booking_status') then
    create type public.booking_status as enum ('draft','pending','awaiting_payment','confirmed','cancelled','completed','refunded','failed');
  end if;
  if not exists (select 1 from pg_type where typname='payment_status') then
    create type public.payment_status as enum ('unpaid','pending','authorized','paid','partially_paid','failed','refunded','cancelled');
  end if;
  if not exists (select 1 from pg_type where typname='payment_provider') then
    create type public.payment_provider as enum ('manual_eft','stripe','paypal','custom');
  end if;
  if not exists (select 1 from pg_type where typname='service_date_mode') then
    create type public.service_date_mode as enum ('optional','required','hidden');
  end if;
  if not exists (select 1 from pg_type where typname='discount_type') then
    create type public.discount_type as enum ('percentage','fixed');
  end if;
  if not exists (select 1 from pg_type where typname='email_log_status') then
    create type public.email_log_status as enum ('queued','sent','failed','skipped');
  end if;
  if not exists (select 1 from pg_type where typname='admin_role') then
    create type public.admin_role as enum ('super_admin','manager','booking_agent','finance');
  end if;
end $$;

create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.service_categories(id) on delete set null,
  slug text not null unique,
  sku text unique,
  name text not null,
  short_description text,
  full_description text,
  duration_label text,
  unit_label text not null default 'guest',
  preferred_date_mode public.service_date_mode not null default 'optional',
  base_price numeric(12,2) not null default 0,
  currency_code text not null default 'NAD',
  tax_rate numeric(6,2) not null default 0,
  service_fee numeric(12,2) not null default 0,
  payment_mode text not null default 'deposit',
  deposit_type public.discount_type not null default 'percentage',
  deposit_value numeric(12,2) not null default 30,
  requires_manual_confirmation boolean not null default true,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  media jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.service_addons (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  pricing_type text not null default 'per_booking' check (pricing_type in ('per_booking','per_person')),
  price numeric(12,2) not null default 0,
  currency_code text not null default 'NAD',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  unique (service_id, slug)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  whatsapp text,
  marketing_consent boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

create unique index if not exists customers_email_unique_idx on public.customers (lower(email));

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  address_type text not null default 'primary',
  line_1 text,
  line_2 text,
  city text,
  state_region text,
  postal_code text,
  country_code text default 'NA',
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  status public.booking_status not null default 'pending',
  payment_status public.payment_status not null default 'unpaid',
  source text not null default 'website',
  preferred_date date,
  confirmed_date date,
  quantity integer not null default 1 check (quantity between 1 and 999),
  currency_code text not null default 'NAD',
  subtotal_amount numeric(12,2) not null default 0,
  addons_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  service_fee_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  amount_due_now numeric(12,2) not null default 0,
  amount_due_later numeric(12,2) not null default 0,
  internal_notes text,
  customer_notes text,
  lookup_email text not null,
  cancellation_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

create index if not exists bookings_status_created_idx on public.bookings (status, created_at desc);
create index if not exists bookings_reference_idx on public.bookings (reference);
create index if not exists bookings_lookup_idx on public.bookings (reference, lower(lookup_email));

create table if not exists public.booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  item_type text not null default 'service' check (item_type in ('service','addon','fee','tax','discount')),
  service_id uuid references public.services(id) on delete set null,
  addon_id uuid references public.service_addons(id) on delete set null,
  description text not null,
  quantity integer not null default 1 check (quantity between 1 and 999),
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.booking_status_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  from_status public.booking_status,
  to_status public.booking_status not null,
  reason text,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  provider public.payment_provider not null,
  status public.payment_status not null default 'pending',
  currency_code text not null default 'NAD',
  amount numeric(12,2) not null default 0,
  amount_received numeric(12,2) not null default 0,
  provider_reference text,
  external_checkout_url text,
  due_at timestamptz,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  provider public.payment_provider not null,
  transaction_reference text,
  transaction_type text not null default 'charge',
  status public.payment_status not null default 'pending',
  amount numeric(12,2) not null default 0,
  currency_code text not null default 'NAD',
  raw_payload jsonb not null default '{}'::jsonb,
  reconciled_at timestamptz,
  created_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  admin_user_id uuid references auth.users(id) on delete set null,
  note text not null,
  is_private boolean not null default true,
  created_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  template_key text not null,
  recipient_email text not null,
  subject text not null,
  rendered_body text,
  provider_message_id text,
  status public.email_log_status not null default 'queued',
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  setting_group text not null,
  setting_key text not null,
  setting_value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  unique (setting_group, setting_key)
);

create table if not exists public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.admin_role not null default 'booking_agent',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  discount_type public.discount_type not null default 'percentage',
  discount_value numeric(12,2) not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer,
  usage_count integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.booking_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default timezone('utc',now()),
  unique (booking_id, coupon_id)
);

create or replace function public.set_row_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=timezone('utc',now()); return new; end; $$;
create or replace function public.is_booking_admin() returns boolean language sql stable as $$ select exists (select 1 from public.app_users where id=auth.uid() and is_active=true and role in ('super_admin','manager','booking_agent','finance')); $$;
create or replace function public.is_finance_admin() returns boolean language sql stable as $$ select exists (select 1 from public.app_users where id=auth.uid() and is_active=true and role in ('super_admin','manager','finance')); $$;

alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.service_addons enable row level security;
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_items enable row level security;
alter table public.booking_status_history enable row level security;
alter table public.payments enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.admin_notes enable row level security;
alter table public.email_logs enable row level security;
alter table public.settings enable row level security;
alter table public.app_users enable row level security;
alter table public.coupons enable row level security;
alter table public.booking_coupon_redemptions enable row level security;

drop policy if exists "public read active service categories" on public.service_categories;
create policy "public read active service categories" on public.service_categories for select using (is_active=true);
drop policy if exists "public read active services" on public.services;
create policy "public read active services" on public.services for select using (is_active=true);
drop policy if exists "public read active service addons" on public.service_addons;
create policy "public read active service addons" on public.service_addons for select using (is_active=true);
drop policy if exists "public read public settings" on public.settings;
create policy "public read public settings" on public.settings for select using (is_public=true);

drop policy if exists "admins manage categories" on public.service_categories;
create policy "admins manage categories" on public.service_categories for all using (public.is_booking_admin()) with check (public.is_booking_admin());
drop policy if exists "admins manage services" on public.services;
create policy "admins manage services" on public.services for all using (public.is_booking_admin()) with check (public.is_booking_admin());
drop policy if exists "admins manage addons" on public.service_addons;
create policy "admins manage addons" on public.service_addons for all using (public.is_booking_admin()) with check (public.is_booking_admin());
drop policy if exists "admins manage customers" on public.customers;
create policy "admins manage customers" on public.customers for all using (public.is_booking_admin()) with check (public.is_booking_admin());
drop policy if exists "admins manage bookings" on public.bookings;
create policy "admins manage bookings" on public.bookings for all using (public.is_booking_admin()) with check (public.is_booking_admin());
drop policy if exists "admins manage booking items" on public.booking_items;
create policy "admins manage booking items" on public.booking_items for all using (public.is_booking_admin()) with check (public.is_booking_admin());
drop policy if exists "admins manage booking history" on public.booking_status_history;
create policy "admins manage booking history" on public.booking_status_history for all using (public.is_booking_admin()) with check (public.is_booking_admin());
drop policy if exists "finance manage payments" on public.payments;
create policy "finance manage payments" on public.payments for all using (public.is_finance_admin()) with check (public.is_finance_admin());
drop policy if exists "finance manage transactions" on public.payment_transactions;
create policy "finance manage transactions" on public.payment_transactions for all using (public.is_finance_admin()) with check (public.is_finance_admin());
drop policy if exists "admins manage notes" on public.admin_notes;
create policy "admins manage notes" on public.admin_notes for all using (public.is_booking_admin()) with check (public.is_booking_admin());
drop policy if exists "admins manage email logs" on public.email_logs;
create policy "admins manage email logs" on public.email_logs for all using (public.is_booking_admin()) with check (public.is_booking_admin());
drop policy if exists "admins manage settings" on public.settings;
create policy "admins manage settings" on public.settings for all using (public.is_booking_admin()) with check (public.is_booking_admin());
drop policy if exists "admins manage app users" on public.app_users;
create policy "admins manage app users" on public.app_users for all using (public.is_booking_admin()) with check (public.is_booking_admin());
drop policy if exists "admins manage coupons" on public.coupons;
create policy "admins manage coupons" on public.coupons for all using (public.is_booking_admin()) with check (public.is_booking_admin());
drop policy if exists "admins manage coupon redemptions" on public.booking_coupon_redemptions;
create policy "admins manage coupon redemptions" on public.booking_coupon_redemptions for all using (public.is_booking_admin()) with check (public.is_booking_admin());

create or replace view public.booking_admin_overview as
select b.id,b.reference,b.status,b.payment_status,b.preferred_date,b.total_amount,b.currency_code,b.created_at,c.full_name as customer_name,c.email as customer_email,c.phone as customer_phone,s.name as service_name
from public.bookings b join public.customers c on c.id=b.customer_id join public.services s on s.id=b.service_id;

insert into public.service_categories (slug,name,description,sort_order) values
  ('coastal-tours','Coastal Tours','Signature ocean and dune journeys.',1),
  ('combo-tours','Combo Tours','More than one experience blended into a premium day.',2),
  ('private-experiences','Private Experiences','Flexible tailored experiences for private groups.',3)
on conflict (slug) do update set name=excluded.name,description=excluded.description,sort_order=excluded.sort_order,updated_at=timezone('utc',now());

insert into public.settings (setting_group,setting_key,setting_value,is_public) values
  ('booking','config','{"currency":"NAD","paymentMode":"deposit","defaultDepositValue":30,"taxRate":0,"serviceFee":0}'::jsonb,true),
  ('booking','email_templates','{"booking_received":{"subject":"We received your booking request {{booking_reference}}","body":"Hi {{customer_name}},\n\nWe received your booking request for {{service_name}}.\nReference: {{booking_reference}}\nPreferred date: {{booking_date}}\nTotal: {{total_amount}}\nPayment status: {{payment_status}}\n\nWe will confirm the next steps shortly.\n\nTrue Travel"},"booking_confirmed":{"subject":"Your booking {{booking_reference}} is confirmed","body":"Hi {{customer_name}},\n\nYour booking for {{service_name}} is confirmed.\nReference: {{booking_reference}}\nDate: {{booking_date}}\nTotal: {{total_amount}}\nPayment status: {{payment_status}}\n\nWe look forward to welcoming you.\n\nTrue Travel"}}'::jsonb,false)
on conflict (setting_group,setting_key) do update set setting_value=excluded.setting_value,is_public=excluded.is_public,updated_at=timezone('utc',now());
