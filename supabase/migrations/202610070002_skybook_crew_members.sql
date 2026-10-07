-- Guides and skippers as a managed list, so the booking form can offer them as a dropdown and staff
-- can add a new guide or skipper from the booking popup (or retire one who has left).
-- Bookings still store the chosen names as text (metadata.guide_name / metadata.skipper_name), so
-- reports and past bookings are unaffected by changes to this list.
-- Seeded from the names already on bookings (most common spelling per name, ignoring case), leaving
-- out test and placeholder entries and combined entries such as "Len/Adrian". Idempotent.

create table if not exists public.crew_members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  role text not null check (role in ('guide','skipper')),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists crew_members_role_name_key on public.crew_members (role, lower(btrim(name)));

comment on table public.crew_members is
  'Guides and skippers offered on the SkyBook booking form. is_active=false hides someone who has left; bookings keep their names as text.';

alter table public.crew_members enable row level security;

drop policy if exists "admins manage crew members" on public.crew_members;
create policy "admins manage crew members" on public.crew_members
  for all using (public.is_booking_admin()) with check (public.is_booking_admin());

with used as (
  select 'guide' as role, btrim(n) as name, count(*) as uses
  from public.bookings b, regexp_split_to_table(coalesce(b.metadata->>'guide_name',''), '[,;]+') n
  where btrim(n) <> ''
  group by 1, 2
  union all
  select 'skipper', btrim(n), count(*)
  from public.bookings b, regexp_split_to_table(coalesce(b.metadata->>'skipper_name',''), '[,;]+') n
  where btrim(n) <> ''
  group by 1, 2
),
ranked as (
  select role, name,
         row_number() over (partition by role, lower(name) order by uses desc, name) as rn
  from used
)
insert into public.crew_members (name, role)
select name, role
from ranked
where rn = 1
  and name not like '%/%'
  and lower(name) not in ('test', 'test2', '1', 'skip 1', 'skip 2', 'adtrian')
on conflict do nothing;
