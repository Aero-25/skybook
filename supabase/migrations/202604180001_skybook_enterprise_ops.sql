create table if not exists public.booking_tasks (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  task_type text not null default 'follow_up',
  title text not null,
  description text,
  team text not null default 'reservations',
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  status text not null default 'open' check (status in ('open','done','cancelled')),
  due_at timestamptz,
  completed_at timestamptz,
  assigned_user_id uuid references auth.users(id) on delete set null,
  completed_by uuid references auth.users(id) on delete set null,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists booking_tasks_booking_status_idx on public.booking_tasks (booking_id, status, priority);
create index if not exists booking_tasks_team_due_idx on public.booking_tasks (team, due_at);

create table if not exists public.booking_documents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  document_type text not null,
  title text not null,
  document_number text,
  status text not null default 'generated' check (status in ('draft','generated','sent','void')),
  generated_at timestamptz not null default timezone('utc', now()),
  public_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists booking_documents_booking_idx on public.booking_documents (booking_id, document_type);

create table if not exists public.booking_portal_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  request_type text not null,
  status text not null default 'open' check (status in ('open','resolved','cancelled')),
  message text,
  attachment_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists booking_portal_requests_booking_idx on public.booking_portal_requests (booking_id, status, created_at desc);

alter table public.operators add column if not exists preferred_contact_method text;
alter table public.operators add column if not exists services_handled jsonb not null default '[]'::jsonb;
alter table public.operators add column if not exists banking_details jsonb not null default '{}'::jsonb;
alter table public.operators add column if not exists settlement_metadata jsonb not null default '{}'::jsonb;

drop trigger if exists booking_tasks_set_updated_at on public.booking_tasks;
create trigger booking_tasks_set_updated_at before update on public.booking_tasks for each row execute function public.set_row_updated_at();

drop trigger if exists booking_documents_set_updated_at on public.booking_documents;
create trigger booking_documents_set_updated_at before update on public.booking_documents for each row execute function public.set_row_updated_at();

drop trigger if exists booking_portal_requests_set_updated_at on public.booking_portal_requests;
create trigger booking_portal_requests_set_updated_at before update on public.booking_portal_requests for each row execute function public.set_row_updated_at();

alter table public.booking_tasks enable row level security;
alter table public.booking_documents enable row level security;
alter table public.booking_portal_requests enable row level security;

drop policy if exists "admins manage booking tasks" on public.booking_tasks;
create policy "admins manage booking tasks" on public.booking_tasks for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage booking documents" on public.booking_documents;
create policy "admins manage booking documents" on public.booking_documents for all using (public.is_booking_admin()) with check (public.is_booking_admin());

drop policy if exists "admins manage booking portal requests" on public.booking_portal_requests;
create policy "admins manage booking portal requests" on public.booking_portal_requests for all using (public.is_booking_admin()) with check (public.is_booking_admin());

insert into public.settings (setting_group, setting_key, setting_value, is_public)
values
  (
    'booking',
    'ops_templates',
    '{
      "internalNoteTemplates": [
        "Follow up with guest about pickup point and dietary preferences.",
        "Payment chase needed before confirmation can be finalized.",
        "Supplier confirmation required before voucher is sent."
      ],
      "cancellationReasonTemplates": [
        "Guest changed travel dates.",
        "Supplier or operator unavailable.",
        "Weather or safety hold."
      ],
      "refundReasonTemplates": [
        "Service cancelled before departure.",
        "Duplicate payment received.",
        "Partial refund approved by finance."
      ]
    }'::jsonb,
    false
  )
on conflict (setting_group, setting_key) do update
set
  setting_value = excluded.setting_value,
  is_public = excluded.is_public,
  updated_at = timezone('utc', now());
