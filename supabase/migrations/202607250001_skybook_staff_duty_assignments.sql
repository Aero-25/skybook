-- 202607250001_skybook_staff_duty_assignments.sql
-- Weekly staff duty roster: track which duty (Bookings / Client Operator) each staff member is
-- covering for a given week. A staff member can hold more than one duty in the same week, so
-- duty is modeled as its own row rather than a single column on a per-user-per-week record —
-- adding/removing a duty for someone is just inserting/deleting one row.

create table if not exists public.staff_duty_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  week_start date not null,
  duty text not null check (duty in ('bookings','client_operator')),
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc',now())
);

create unique index if not exists staff_duty_assignments_unique
  on public.staff_duty_assignments (user_id, week_start, duty);

create index if not exists staff_duty_assignments_week_idx
  on public.staff_duty_assignments (week_start desc);

comment on table public.staff_duty_assignments is
  'Weekly duty roster (Bookings / Client Operator). One row per user+week+duty — a user holding both duties in the same week is two rows.';

alter table public.staff_duty_assignments enable row level security;

create policy "admins manage duty assignments" on public.staff_duty_assignments
  for all using (public.is_booking_admin()) with check (public.is_booking_admin());
