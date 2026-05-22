create table if not exists public.invoice_number_sequences (
  invoice_scope text not null check (invoice_scope in ('guest_invoice','office_invoice')),
  brand_code text not null default 'true-travel',
  period_key text not null,
  prefix text not null,
  next_value bigint not null default 1,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (invoice_scope, brand_code, period_key)
);

create table if not exists public.invoice_number_reservations (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  invoice_scope text not null check (invoice_scope in ('guest_invoice','office_invoice')),
  brand_code text not null default 'true-travel',
  booking_id uuid references public.bookings(id) on delete set null,
  reserved_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.booking_discounts add column if not exists discount_type public.discount_type;
alter table public.booking_discounts add column if not exists discount_value numeric(12,2);
alter table public.booking_discounts add column if not exists consultant_comment text;
alter table public.booking_discounts add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists booking_discounts_manual_idx
  on public.booking_discounts (booking_id, source_type);

create or replace function public.reserve_invoice_number(
  p_invoice_scope text,
  p_brand_code text default 'true-travel',
  p_preferred_prefix text default null,
  p_booking_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text := lower(trim(coalesce(p_invoice_scope, 'guest_invoice')));
  v_brand text := lower(trim(coalesce(p_brand_code, 'true-travel')));
  v_period text := to_char(timezone('utc', now()), 'YYYY');
  v_prefix text;
  v_counter bigint;
  v_candidate text;
begin
  if v_scope not in ('guest_invoice','office_invoice') then
    raise exception 'Unsupported invoice scope: %', p_invoice_scope;
  end if;

  v_prefix := upper(regexp_replace(coalesce(nullif(trim(p_preferred_prefix), ''), case when v_scope = 'office_invoice' then 'OFF' else 'INV' end), '[^A-Z0-9]', '', 'g'));
  if v_prefix = '' then
    v_prefix := case when v_scope = 'office_invoice' then 'OFF' else 'INV' end;
  end if;

  insert into public.invoice_number_sequences (invoice_scope, brand_code, period_key, prefix, next_value)
  values (v_scope, v_brand, v_period, v_prefix, 1)
  on conflict (invoice_scope, brand_code, period_key) do nothing;

  loop
    update public.invoice_number_sequences
      set next_value = next_value + 1,
          prefix = v_prefix,
          updated_at = timezone('utc', now())
      where invoice_scope = v_scope
        and brand_code = v_brand
        and period_key = v_period
      returning next_value - 1 into v_counter;

    v_candidate := v_prefix || '-' || case when v_scope = 'office_invoice' then 'OFF' else 'INV' end || '-' || v_period || '-' || lpad(v_counter::text, 5, '0');

    if exists (select 1 from public.invoices where invoice_number = v_candidate)
       or exists (select 1 from public.office_invoices where invoice_number = v_candidate) then
      continue;
    end if;

    begin
      insert into public.invoice_number_reservations (invoice_number, invoice_scope, brand_code, booking_id)
      values (v_candidate, v_scope, v_brand, p_booking_id);
      return v_candidate;
    exception when unique_violation then
      continue;
    end;
  end loop;
end;
$$;

alter table public.invoice_number_sequences enable row level security;
alter table public.invoice_number_reservations enable row level security;

drop policy if exists "admins manage invoice number sequences" on public.invoice_number_sequences;
create policy "admins manage invoice number sequences"
on public.invoice_number_sequences
for all
using (public.is_booking_admin())
with check (public.is_booking_admin());

drop policy if exists "admins manage invoice number reservations" on public.invoice_number_reservations;
create policy "admins manage invoice number reservations"
on public.invoice_number_reservations
for all
using (public.is_booking_admin())
with check (public.is_booking_admin());
