create table if not exists public.operators (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  company_name text not null,
  contact_name text,
  email text,
  phone text,
  commission_type public.discount_type not null default 'percentage',
  commission_value numeric(12,2) not null default 0,
  payout_terms text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.booking_operators (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  operator_id uuid not null references public.operators(id) on delete restrict,
  commission_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.office_invoices (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  invoice_number text not null unique,
  invoice_type text not null default 'operator_commission' check (invoice_type in ('agent_commission','operator_commission','supplier_payable','internal_settlement')),
  payee_type text not null check (payee_type in ('agent','operator','office')),
  agent_id uuid references public.agents(id) on delete set null,
  operator_id uuid references public.operators(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','issued','approved','paid','cancelled')),
  currency_code text not null default 'NAD',
  subtotal_amount numeric(12,2) not null default 0,
  commission_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.office_invoice_items (
  id uuid primary key default gen_random_uuid(),
  office_invoice_id uuid not null references public.office_invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists operators_set_updated_at on public.operators;
create trigger operators_set_updated_at before update on public.operators for each row execute function public.set_row_updated_at();

drop trigger if exists booking_operators_set_updated_at on public.booking_operators;
create trigger booking_operators_set_updated_at before update on public.booking_operators for each row execute function public.set_row_updated_at();

drop trigger if exists office_invoices_set_updated_at on public.office_invoices;
create trigger office_invoices_set_updated_at before update on public.office_invoices for each row execute function public.set_row_updated_at();

alter table public.operators enable row level security;
alter table public.booking_operators enable row level security;
alter table public.office_invoices enable row level security;
alter table public.office_invoice_items enable row level security;

drop policy if exists "admins manage operators" on public.operators;
create policy "admins manage operators" on public.operators for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage booking operators" on public.booking_operators;
create policy "admins manage booking operators" on public.booking_operators for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage office invoices" on public.office_invoices;
create policy "admins manage office invoices" on public.office_invoices for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage office invoice items" on public.office_invoice_items;
create policy "admins manage office invoice items" on public.office_invoice_items for all using (public.is_booking_admin()) with check (public.is_booking_admin());

insert into public.settings (setting_group, setting_key, setting_value, is_public)
values
  ('booking', 'reporting', '{"defaultWindowDays":30,"showOutstandingCommissions":true,"showRefundExposure":true}'::jsonb, false)
on conflict (setting_group, setting_key) do update
set
  setting_value = excluded.setting_value,
  is_public = excluded.is_public,
  updated_at = timezone('utc', now());
