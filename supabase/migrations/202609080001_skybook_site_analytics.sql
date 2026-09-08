-- First-party web analytics for the public brand sites.
--
-- Visits are written only by the booking-api edge function using the service
-- role, so there is no anon insert policy: the browser never touches these
-- tables directly. No IP address is stored — geography is derived from the
-- browser's own timezone, which keeps this cookie-free and free of personal
-- data.
--
-- Written to be re-runnable: every statement guards itself, so applying this
-- twice (or after an earlier, smaller version of the same file) is safe.

create table if not exists public.site_visits (
  id uuid primary key default gen_random_uuid(),
  brand_code text not null default 'true-travel',
  visitor_id text not null default '',
  session_id text not null default '',
  is_new_visitor boolean not null default false,
  path text not null default '/',
  page_title text not null default '',
  query_string text not null default '',
  referrer text not null default '',
  referrer_host text not null default '',
  referrer_type text not null default 'direct',
  utm_source text not null default '',
  utm_medium text not null default '',
  utm_campaign text not null default '',
  utm_term text not null default '',
  utm_content text not null default '',
  country text not null default '',
  timezone text not null default '',
  language text not null default '',
  device_type text not null default '',
  browser text not null default '',
  os text not null default '',
  screen_width integer not null default 0,
  screen_height integer not null default 0,
  duration_ms integer not null default 0,
  max_scroll_pct integer not null default 0,
  is_bounce boolean not null default true,
  created_at timestamptz not null default now()
);

-- Richer dimensions. Added separately so this file also upgrades an
-- installation created by the first version of it.
alter table public.site_visits
  add column if not exists is_entry boolean not null default false,
  add column if not exists landing_path text not null default '',
  add column if not exists viewport_width integer not null default 0,
  add column if not exists viewport_height integer not null default 0,
  add column if not exists orientation text not null default '',
  add column if not exists browser_version text not null default '',
  add column if not exists os_version text not null default '',
  add column if not exists connection_type text not null default '',
  add column if not exists device_memory_gb numeric(5,1) not null default 0,
  add column if not exists cpu_cores integer not null default 0,
  add column if not exists is_touch boolean not null default false,
  add column if not exists prefers_dark boolean not null default false,
  add column if not exists prefers_reduced_motion boolean not null default false,
  add column if not exists local_hour integer not null default -1,
  add column if not exists engaged_ms integer not null default 0,
  -- Real-user page speed, in milliseconds.
  add column if not exists ttfb_ms integer not null default 0,
  add column if not exists dom_ready_ms integer not null default 0,
  add column if not exists load_ms integer not null default 0,
  add column if not exists fcp_ms integer not null default 0;

create index if not exists site_visits_brand_created_idx on public.site_visits (brand_code, created_at desc);
create index if not exists site_visits_session_idx on public.site_visits (session_id);
create index if not exists site_visits_visitor_idx on public.site_visits (visitor_id);
create index if not exists site_visits_path_idx on public.site_visits (brand_code, path);
create index if not exists site_visits_referrer_idx on public.site_visits (brand_code, referrer_host);
create index if not exists site_visits_entry_idx on public.site_visits (brand_code, is_entry);

alter table public.site_visits enable row level security;
drop policy if exists "Service role full access" on public.site_visits;
create policy "Service role full access"
  on public.site_visits for all to service_role using (true) with check (true);

-- Interactions worth counting on their own: contact taps, outbound links,
-- and anything tagged data-analytics on the sites.
create table if not exists public.site_events (
  id uuid primary key default gen_random_uuid(),
  brand_code text not null default 'true-travel',
  visitor_id text not null default '',
  session_id text not null default '',
  event_type text not null default 'click',
  label text not null default '',
  href text not null default '',
  path text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists site_events_brand_created_idx on public.site_events (brand_code, created_at desc);
create index if not exists site_events_type_idx on public.site_events (brand_code, event_type);
create index if not exists site_events_session_idx on public.site_events (session_id);

alter table public.site_events enable row level security;
drop policy if exists "Service role full access" on public.site_events;
create policy "Service role full access"
  on public.site_events for all to service_role using (true) with check (true);

-- Bookings carry the analytics ids and first/last touch under
-- metadata.analytics, which is what lets traffic be tied to revenue.
create index if not exists bookings_analytics_session_idx
  on public.bookings ((metadata #>> '{analytics,session_id}'));
create index if not exists bookings_analytics_visitor_idx
  on public.bookings ((metadata #>> '{analytics,visitor_id}'));
