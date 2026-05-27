create table if not exists public.guest_reviews (
  id uuid primary key default gen_random_uuid(),
  brand_code text not null default 'true-travel',
  guest_name text not null,
  guest_country text not null default '',
  guest_country_code text not null default '',
  service_name text not null default '',
  rating integer not null check (rating between 1 and 5),
  review_text text not null,
  booking_reference text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

alter table public.guest_reviews enable row level security;

-- Only service role can read/update; public can only insert
create policy "Public can submit reviews"
  on public.guest_reviews for insert
  to anon, authenticated
  with check (true);

create policy "Service role full access"
  on public.guest_reviews for all
  to service_role
  using (true);
