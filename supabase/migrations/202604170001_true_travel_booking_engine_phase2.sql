do $$
begin
  if not exists (select 1 from pg_type where typname='refund_status') then
    create type public.refund_status as enum ('pending','processed','failed','cancelled');
  end if;
end $$;

create table if not exists public.service_operating_windows (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_label text,
  cutoff_hours integer not null default 0,
  max_party_size integer,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (service_id, day_of_week, start_time, end_time)
);

create index if not exists service_operating_windows_service_idx
  on public.service_operating_windows (service_id, day_of_week, is_active);

create table if not exists public.service_date_rules (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  rule_type text not null check (rule_type in ('min_notice_hours','max_advance_days','allowed_weekdays','blocked_weekdays','minimum_party_size','maximum_party_size')),
  rule_value jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists service_date_rules_service_idx
  on public.service_date_rules (service_id, rule_type, is_active);

create table if not exists public.service_blackout_dates (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.services(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text,
  applies_to_all boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_on >= starts_on)
);

create index if not exists service_blackout_dates_range_idx
  on public.service_blackout_dates (service_id, starts_on, ends_on);

create table if not exists public.booking_discounts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  source_type text not null check (source_type in ('coupon','voucher','manual','agent')),
  source_id uuid,
  code text,
  description text not null,
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists booking_discounts_booking_idx
  on public.booking_discounts (booking_id, source_type);

create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  initial_value numeric(12,2) not null default 0,
  remaining_value numeric(12,2) not null default 0,
  currency_code text not null default 'NAD',
  expires_at timestamptz,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.vouchers(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  unique (voucher_id, booking_id)
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  company_name text not null,
  contact_name text,
  email text,
  phone text,
  commission_type public.discount_type not null default 'percentage',
  commission_value numeric(12,2) not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.booking_agents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete restrict,
  commission_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  amount numeric(12,2) not null default 0,
  currency_code text not null default 'NAD',
  status public.refund_status not null default 'pending',
  reason text,
  processed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists refunds_booking_idx
  on public.refunds (booking_id, status, created_at desc);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  invoice_number text not null unique,
  status text not null default 'draft' check (status in ('draft','issued','paid','partially_paid','refunded','cancelled')),
  issued_at timestamptz,
  due_at timestamptz,
  currency_code text not null default 'NAD',
  subtotal_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  balance_amount numeric(12,2) not null default 0,
  pdf_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  resource_type text not null default 'vehicle',
  capacity integer,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.service_resources (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  allocation_mode text not null default 'per_booking' check (allocation_mode in ('optional','required','per_booking','per_person')),
  quantity_required integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (service_id, resource_id)
);

create table if not exists public.resource_blackout_dates (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_on >= starts_on)
);

create table if not exists public.resource_allocations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  allocation_date date not null,
  allocated_quantity integer not null default 1,
  status text not null default 'reserved' check (status in ('reserved','released','completed','cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists resource_allocations_lookup_idx
  on public.resource_allocations (resource_id, allocation_date, status);

create table if not exists public.customer_accounts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.customers(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  locale_code text not null default 'en',
  currency_code text not null default 'NAD',
  is_active boolean not null default true,
  last_login_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.supported_languages (
  code text primary key,
  name text not null,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.supported_currencies (
  code text primary key,
  name text not null,
  symbol text,
  exchange_rate numeric(12,6) not null default 1,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.whatsapp_logs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  recipient_phone text not null,
  template_key text,
  message_body text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz
);

create table if not exists public.calendar_sync_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'google',
  external_calendar_id text not null,
  sync_mode text not null default 'push' check (sync_mode in ('push','pull','two_way')),
  is_active boolean not null default true,
  credentials_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_url text not null,
  secret_key text,
  subscribed_events jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  event_key text not null,
  payload jsonb not null default '{}'::jsonb,
  response_status integer,
  response_body text,
  delivered_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.generate_invoice_number(booking_reference text)
returns text
language sql
stable
as $$
  select 'INV-' || regexp_replace(upper(coalesce(booking_reference, 'TT')), '[^A-Z0-9]', '', 'g');
$$;

drop trigger if exists service_operating_windows_set_updated_at on public.service_operating_windows;
create trigger service_operating_windows_set_updated_at before update on public.service_operating_windows for each row execute function public.set_row_updated_at();

drop trigger if exists service_date_rules_set_updated_at on public.service_date_rules;
create trigger service_date_rules_set_updated_at before update on public.service_date_rules for each row execute function public.set_row_updated_at();

drop trigger if exists service_blackout_dates_set_updated_at on public.service_blackout_dates;
create trigger service_blackout_dates_set_updated_at before update on public.service_blackout_dates for each row execute function public.set_row_updated_at();

drop trigger if exists vouchers_set_updated_at on public.vouchers;
create trigger vouchers_set_updated_at before update on public.vouchers for each row execute function public.set_row_updated_at();

drop trigger if exists agents_set_updated_at on public.agents;
create trigger agents_set_updated_at before update on public.agents for each row execute function public.set_row_updated_at();

drop trigger if exists booking_agents_set_updated_at on public.booking_agents;
create trigger booking_agents_set_updated_at before update on public.booking_agents for each row execute function public.set_row_updated_at();

drop trigger if exists refunds_set_updated_at on public.refunds;
create trigger refunds_set_updated_at before update on public.refunds for each row execute function public.set_row_updated_at();

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at before update on public.invoices for each row execute function public.set_row_updated_at();

drop trigger if exists resources_set_updated_at on public.resources;
create trigger resources_set_updated_at before update on public.resources for each row execute function public.set_row_updated_at();

drop trigger if exists service_resources_set_updated_at on public.service_resources;
create trigger service_resources_set_updated_at before update on public.service_resources for each row execute function public.set_row_updated_at();

drop trigger if exists resource_blackout_dates_set_updated_at on public.resource_blackout_dates;
create trigger resource_blackout_dates_set_updated_at before update on public.resource_blackout_dates for each row execute function public.set_row_updated_at();

drop trigger if exists resource_allocations_set_updated_at on public.resource_allocations;
create trigger resource_allocations_set_updated_at before update on public.resource_allocations for each row execute function public.set_row_updated_at();

drop trigger if exists customer_accounts_set_updated_at on public.customer_accounts;
create trigger customer_accounts_set_updated_at before update on public.customer_accounts for each row execute function public.set_row_updated_at();

drop trigger if exists supported_languages_set_updated_at on public.supported_languages;
create trigger supported_languages_set_updated_at before update on public.supported_languages for each row execute function public.set_row_updated_at();

drop trigger if exists supported_currencies_set_updated_at on public.supported_currencies;
create trigger supported_currencies_set_updated_at before update on public.supported_currencies for each row execute function public.set_row_updated_at();

drop trigger if exists calendar_sync_connections_set_updated_at on public.calendar_sync_connections;
create trigger calendar_sync_connections_set_updated_at before update on public.calendar_sync_connections for each row execute function public.set_row_updated_at();

drop trigger if exists webhook_endpoints_set_updated_at on public.webhook_endpoints;
create trigger webhook_endpoints_set_updated_at before update on public.webhook_endpoints for each row execute function public.set_row_updated_at();

alter table public.service_operating_windows enable row level security;
alter table public.service_date_rules enable row level security;
alter table public.service_blackout_dates enable row level security;
alter table public.booking_discounts enable row level security;
alter table public.vouchers enable row level security;
alter table public.voucher_redemptions enable row level security;
alter table public.agents enable row level security;
alter table public.booking_agents enable row level security;
alter table public.refunds enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.resources enable row level security;
alter table public.service_resources enable row level security;
alter table public.resource_blackout_dates enable row level security;
alter table public.resource_allocations enable row level security;
alter table public.customer_accounts enable row level security;
alter table public.supported_languages enable row level security;
alter table public.supported_currencies enable row level security;
alter table public.whatsapp_logs enable row level security;
alter table public.calendar_sync_connections enable row level security;
alter table public.webhook_endpoints enable row level security;
alter table public.webhook_deliveries enable row level security;

drop policy if exists "public read active languages" on public.supported_languages;
create policy "public read active languages" on public.supported_languages for select using (is_active = true);

drop policy if exists "public read active currencies" on public.supported_currencies;
create policy "public read active currencies" on public.supported_currencies for select using (is_active = true);

drop policy if exists "admins manage service operating windows" on public.service_operating_windows;
create policy "admins manage service operating windows" on public.service_operating_windows for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage service date rules" on public.service_date_rules;
create policy "admins manage service date rules" on public.service_date_rules for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage service blackout dates" on public.service_blackout_dates;
create policy "admins manage service blackout dates" on public.service_blackout_dates for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage booking discounts" on public.booking_discounts;
create policy "admins manage booking discounts" on public.booking_discounts for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage vouchers" on public.vouchers;
create policy "admins manage vouchers" on public.vouchers for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage voucher redemptions" on public.voucher_redemptions;
create policy "admins manage voucher redemptions" on public.voucher_redemptions for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage agents" on public.agents;
create policy "admins manage agents" on public.agents for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage booking agents" on public.booking_agents;
create policy "admins manage booking agents" on public.booking_agents for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "finance manage refunds" on public.refunds;
create policy "finance manage refunds" on public.refunds for all using (public.is_finance_admin()) with check (public.is_finance_admin());

drop policy if exists "admins manage invoices" on public.invoices;
create policy "admins manage invoices" on public.invoices for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage invoice items" on public.invoice_items;
create policy "admins manage invoice items" on public.invoice_items for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage resources" on public.resources;
create policy "admins manage resources" on public.resources for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage service resources" on public.service_resources;
create policy "admins manage service resources" on public.service_resources for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage resource blackout dates" on public.resource_blackout_dates;
create policy "admins manage resource blackout dates" on public.resource_blackout_dates for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage resource allocations" on public.resource_allocations;
create policy "admins manage resource allocations" on public.resource_allocations for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage customer accounts" on public.customer_accounts;
create policy "admins manage customer accounts" on public.customer_accounts for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage supported languages" on public.supported_languages;
create policy "admins manage supported languages" on public.supported_languages for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage supported currencies" on public.supported_currencies;
create policy "admins manage supported currencies" on public.supported_currencies for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage whatsapp logs" on public.whatsapp_logs;
create policy "admins manage whatsapp logs" on public.whatsapp_logs for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage calendar sync connections" on public.calendar_sync_connections;
create policy "admins manage calendar sync connections" on public.calendar_sync_connections for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage webhook endpoints" on public.webhook_endpoints;
create policy "admins manage webhook endpoints" on public.webhook_endpoints for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage webhook deliveries" on public.webhook_deliveries;
create policy "admins manage webhook deliveries" on public.webhook_deliveries for all using (public.is_booking_admin()) with check (public.is_booking_admin());

insert into public.supported_languages (code, name, is_default, is_active)
values
  ('en', 'English', true, true),
  ('de', 'German', false, true)
on conflict (code) do update
set
  name = excluded.name,
  is_default = excluded.is_default,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

insert into public.supported_currencies (code, name, symbol, exchange_rate, is_default, is_active)
values
  ('NAD', 'Namibian Dollar', 'N$', 1, true, true),
  ('USD', 'US Dollar', '$', 0.054, false, true),
  ('EUR', 'Euro', '€', 0.05, false, true)
on conflict (code) do update
set
  name = excluded.name,
  symbol = excluded.symbol,
  exchange_rate = excluded.exchange_rate,
  is_default = excluded.is_default,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

insert into public.settings (setting_group, setting_key, setting_value, is_public)
values
  ('booking', 'automation_rules', '{"autoConfirmPaidBookings":true,"autoCompletePastConfirmedBookings":false,"autoCancelExpiredAwaitingPayment":false,"awaitingPaymentExpiryHours":48}'::jsonb, false),
  ('booking', 'portal', '{"enabled":true,"allowBookingLookup":true,"allowSelfServiceRequests":false}'::jsonb, true),
  ('booking', 'integrations', '{"whatsapp":{"enabled":false},"googleCalendar":{"enabled":false},"webhooks":{"enabled":true}}'::jsonb, false)
on conflict (setting_group, setting_key) do update
set
  setting_value = excluded.setting_value,
  is_public = excluded.is_public,
  updated_at = timezone('utc', now());
