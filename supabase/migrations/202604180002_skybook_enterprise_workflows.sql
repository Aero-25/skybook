do $$
begin
  begin
    alter type public.admin_role add value if not exists 'reservations';
  exception when duplicate_object then null;
  end;
  begin
    alter type public.admin_role add value if not exists 'operations';
  exception when duplicate_object then null;
  end;
  begin
    alter type public.admin_role add value if not exists 'supplier_management';
  exception when duplicate_object then null;
  end;
end $$;

create or replace function public.is_booking_admin() returns boolean language sql stable as $$
  select exists (
    select 1
    from public.app_users
    where id=auth.uid()
      and is_active=true
      and role in ('super_admin','manager','booking_agent','finance','reservations','operations','supplier_management')
  );
$$;

create or replace function public.is_finance_admin() returns boolean language sql stable as $$
  select exists (
    select 1
    from public.app_users
    where id=auth.uid()
      and is_active=true
      and role in ('super_admin','manager','finance')
  );
$$;

create table if not exists public.system_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  job_group text not null default 'operations',
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  run_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  completed_at timestamptz,
  booking_id uuid references public.bookings(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  related_table text,
  related_id uuid,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  last_error text,
  locked_by text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists system_jobs_status_run_idx on public.system_jobs (status, run_at, priority);
create index if not exists system_jobs_booking_idx on public.system_jobs (booking_id, job_type);

create table if not exists public.system_health_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null default 'warning' check (severity in ('info','warning','error','critical')),
  status text not null default 'open' check (status in ('open','investigating','resolved','ignored')),
  source text not null default 'system',
  summary text not null,
  detail text,
  related_job_id uuid references public.system_jobs(id) on delete set null,
  related_booking_id uuid references public.bookings(id) on delete cascade,
  related_payment_id uuid references public.payments(id) on delete set null,
  related_webhook_endpoint_id uuid references public.webhook_endpoints(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists system_health_events_status_idx on public.system_health_events (status, severity, created_at desc);

create table if not exists public.booking_document_versions (
  id uuid primary key default gen_random_uuid(),
  booking_document_id uuid not null references public.booking_documents(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  version_number integer not null default 1,
  file_name text not null,
  storage_bucket text not null default 'skybook-documents',
  storage_path text not null,
  mime_type text not null default 'application/pdf',
  byte_size bigint not null default 0,
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (booking_document_id, version_number)
);

create index if not exists booking_document_versions_booking_idx on public.booking_document_versions (booking_id, created_at desc);

create table if not exists public.customer_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  brand_code text not null default 'true-travel',
  purpose text not null default 'portal_access',
  status text not null default 'active' check (status in ('active','used','expired','revoked')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_accessed_at timestamptz,
  issued_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists customer_portal_sessions_booking_idx on public.customer_portal_sessions (booking_id, status, expires_at desc);

create table if not exists public.reconciliation_records (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  office_invoice_id uuid references public.office_invoices(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  refund_id uuid references public.refunds(id) on delete set null,
  reconciliation_type text not null default 'booking_finance',
  assigned_team text not null default 'finance',
  status text not null default 'open' check (status in ('open','matched','discrepancy','needs_review')),
  mismatch_amount numeric(12,2) not null default 0,
  summary text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  last_checked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists reconciliation_records_status_idx on public.reconciliation_records (status, reconciliation_type, created_at desc);
create index if not exists reconciliation_records_booking_idx on public.reconciliation_records (booking_id);

drop trigger if exists system_jobs_set_updated_at on public.system_jobs;
create trigger system_jobs_set_updated_at before update on public.system_jobs for each row execute function public.set_row_updated_at();

drop trigger if exists system_health_events_set_updated_at on public.system_health_events;
create trigger system_health_events_set_updated_at before update on public.system_health_events for each row execute function public.set_row_updated_at();

drop trigger if exists booking_document_versions_set_updated_at on public.booking_document_versions;
create trigger booking_document_versions_set_updated_at before update on public.booking_document_versions for each row execute function public.set_row_updated_at();

drop trigger if exists customer_portal_sessions_set_updated_at on public.customer_portal_sessions;
create trigger customer_portal_sessions_set_updated_at before update on public.customer_portal_sessions for each row execute function public.set_row_updated_at();

drop trigger if exists reconciliation_records_set_updated_at on public.reconciliation_records;
create trigger reconciliation_records_set_updated_at before update on public.reconciliation_records for each row execute function public.set_row_updated_at();

alter table public.system_jobs enable row level security;
alter table public.system_health_events enable row level security;
alter table public.booking_document_versions enable row level security;
alter table public.customer_portal_sessions enable row level security;
alter table public.reconciliation_records enable row level security;

drop policy if exists "admins manage system jobs" on public.system_jobs;
create policy "admins manage system jobs" on public.system_jobs for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage system health events" on public.system_health_events;
create policy "admins manage system health events" on public.system_health_events for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage booking document versions" on public.booking_document_versions;
create policy "admins manage booking document versions" on public.booking_document_versions for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage portal sessions" on public.customer_portal_sessions;
create policy "admins manage portal sessions" on public.customer_portal_sessions for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage reconciliation records" on public.reconciliation_records;
create policy "admins manage reconciliation records" on public.reconciliation_records for all using (public.is_booking_admin()) with check (public.is_booking_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'skybook-documents',
  'skybook-documents',
  false,
  10485760,
  array['application/pdf','application/octet-stream','image/jpeg','image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.settings (setting_group, setting_key, setting_value, is_public)
values
  (
    'booking',
    'portal',
    jsonb_build_object(
      'enabled', true,
      'allowBookingLookup', true,
      'allowSelfServiceRequests', true,
      'allowDocumentDownloads', true,
      'sessionDurationHours', 72,
      'portalBaseUrl', '/portal.html'
    ),
    true
  ),
  (
    'booking',
    'queue',
    jsonb_build_object(
      'enabled', true,
      'autoProcessOnBootstrap', true,
      'reminderDelayHours', 12,
      'maxJobsPerSweep', 25
    ),
    false
  )
on conflict (setting_group, setting_key) do update
set
  setting_value = excluded.setting_value,
  is_public = excluded.is_public,
  updated_at = timezone('utc', now());
