-- First-party web analytics for the public brand sites.
--
-- Visits are written only by the booking-api edge function using the service
-- role, so there is no anon insert policy: the browser never touches this table
-- directly. No IP address is stored — geography is derived from the browser's
-- own timezone, which keeps this cookie-free and avoids storing personal data.

create table if not exists public.site_visits (
  id uuid primary key default gen_random_uuid(),
  brand_code text not null default 'true-travel',

  -- Anonymous first-party identifiers (random, per-browser; not personal data).
  visitor_id text not null default '',
  session_id text not null default '',
  is_new_visitor boolean not null default false,

  -- Page
  path text not null default '/',
  page_title text not null default '',
  query_string text not null default '',

  -- Acquisition
  referrer text not null default '',
  referrer_host text not null default '',
  referrer_type text not null default 'direct',
  utm_source text not null default '',
  utm_medium text not null default '',
  utm_campaign text not null default '',
  utm_term text not null default '',
  utm_content text not null default '',

  -- Audience
  country text not null default '',
  timezone text not null default '',
  language text not null default '',

  -- Technology
  device_type text not null default '',
  browser text not null default '',
  os text not null default '',
  screen_width integer not null default 0,
  screen_height integer not null default 0,

  -- Engagement (patched by a second beacon when the visitor leaves the page)
  duration_ms integer not null default 0,
  max_scroll_pct integer not null default 0,
  is_bounce boolean not null default true,

  created_at timestamptz not null default now()
);

create index if not exists site_visits_brand_created_idx
  on public.site_visits (brand_code, created_at desc);
create index if not exists site_visits_session_idx
  on public.site_visits (session_id);
create index if not exists site_visits_visitor_idx
  on public.site_visits (visitor_id);
create index if not exists site_visits_path_idx
  on public.site_visits (brand_code, path);
create index if not exists site_visits_referrer_idx
  on public.site_visits (brand_code, referrer_host);

alter table public.site_visits enable row level security;

-- The edge function uses the service role; nothing else may read or write.
drop policy if exists "Service role full access" on public.site_visits;
create policy "Service role full access"
  on public.site_visits for all
  to service_role
  using (true)
  with check (true);
