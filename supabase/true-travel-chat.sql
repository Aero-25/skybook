create extension if not exists pgcrypto;

create table if not exists public.chatbot_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  body text not null,
  tags text[] not null default '{}',
  source_type text not null default 'manual' check (source_type in ('manual','website','tour','faq')),
  page_path text,
  tour_id text,
  priority integer not null default 50,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.chatbot_booking_requests (
  id uuid primary key default gen_random_uuid(),
  session_token text,
  source text not null default 'website_chatbot',
  source_page text,
  guest_name text,
  guest_email text,
  guest_phone text,
  requested_tour_id text,
  requested_tour_name text,
  preferred_date date,
  guest_count integer check (guest_count is null or guest_count between 1 and 50),
  hotel text,
  special_requests text,
  conversation_summary text,
  draft jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new','contacted','confirmed','cancelled','closed')),
  created_at timestamptz not null default timezone('utc',now())
);

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at=timezone('utc',now());
  return new;
end;
$$;

drop trigger if exists chatbot_knowledge_documents_set_updated_at on public.chatbot_knowledge_documents;
create trigger chatbot_knowledge_documents_set_updated_at
before update on public.chatbot_knowledge_documents
for each row
execute function public.set_row_updated_at();

create index if not exists chatbot_knowledge_documents_priority_idx
  on public.chatbot_knowledge_documents (is_active, priority desc, updated_at desc);

create index if not exists chatbot_knowledge_documents_tags_idx
  on public.chatbot_knowledge_documents using gin (tags);

create index if not exists chatbot_booking_requests_created_idx
  on public.chatbot_booking_requests (created_at desc);

create index if not exists chatbot_booking_requests_status_idx
  on public.chatbot_booking_requests (status, created_at desc);

grant usage on schema public to anon, authenticated;
grant select on public.chatbot_knowledge_documents to anon, authenticated;
grant insert on public.chatbot_booking_requests to anon, authenticated;
grant select, insert, update, delete on public.chatbot_knowledge_documents to authenticated;
grant select, update, delete on public.chatbot_booking_requests to authenticated;

alter table public.chatbot_knowledge_documents enable row level security;
alter table public.chatbot_booking_requests enable row level security;

drop policy if exists "Public can read active chatbot knowledge" on public.chatbot_knowledge_documents;
create policy "Public can read active chatbot knowledge"
on public.chatbot_knowledge_documents
for select
using (is_active = true);

drop policy if exists "Authenticated users manage chatbot knowledge" on public.chatbot_knowledge_documents;
create policy "Authenticated users manage chatbot knowledge"
on public.chatbot_knowledge_documents
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "Public can create chatbot booking requests" on public.chatbot_booking_requests;
create policy "Public can create chatbot booking requests"
on public.chatbot_booking_requests
for insert
with check (source in ('website_chatbot','website_booking_form'));

drop policy if exists "Authenticated users review chatbot booking requests" on public.chatbot_booking_requests;
create policy "Authenticated users review chatbot booking requests"
on public.chatbot_booking_requests
for select
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users update chatbot booking requests" on public.chatbot_booking_requests;
create policy "Authenticated users update chatbot booking requests"
on public.chatbot_booking_requests
for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

insert into public.chatbot_knowledge_documents (
  slug,
  title,
  body,
  tags,
  source_type,
  page_path,
  priority
)
values
  (
    'pickup-and-inclusions',
    'Pickup and inclusions',
    'True Travel includes hotel pickup and drop-off for Walvis Bay and Swakopmund departures. Tours also include light meals, water, beverages, and sparkling wine. Guests should plan to arrive about 30 minutes before departure.',
    array['pickup','hotel','included','logistics','swakopmund','walvis bay'],
    'faq',
    '/',
    120
  ),
  (
    'booking-flow',
    'Booking flow',
    'The concierge can help guests choose a tour, collect the preferred date, number of guests, hotel details, and special requests, then guide them into the booking form or a WhatsApp handoff for confirmation.',
    array['booking','reservation','whatsapp','dates','guests'],
    'faq',
    '/',
    115
  ),
  (
    'pelican-point-notes',
    'Pelican Point notes',
    'Pelican Point Kayaking is one of the best matches for guests who want seals, active time on the water, and a smaller-group coastal adventure. It is especially useful when someone asks for kayaking, wildlife, or a more hands-on morning.',
    array['pelican point','kayaking','seals','wildlife','adventure'],
    'tour',
    '/',
    100
  ),
  (
    'sandwich-harbour-notes',
    'Sandwich Harbour notes',
    'Sandwich Harbour Dune Drive is a strong recommendation for guests who want dramatic scenery where the desert meets the Atlantic. It works well for photography, first-time Namibia visitors, and groups that want a cinematic but accessible experience.',
    array['sandwich harbour','dunes','desert','photography','scenery'],
    'tour',
    '/',
    100
  ),
  (
    'combo-tour-notes',
    'Combo tour notes',
    'The combo products are the best option when a guest wants a full-day itinerary or more value in a single booking. Use the kayak combo for active guests and the boat combo for travelers who want the marine experience with less physical effort.',
    array['combo','full day','value','kayak combo','boat combo'],
    'tour',
    '/',
    95
  ),
  (
    'private-group-notes',
    'Private group notes',
    'Private and group enquiries should capture guest count, preferred tour, preferred date, pickup area, and any celebration or dietary notes. The team can then confirm the best vehicle and logistics arrangement.',
    array['private','group','celebration','dietary','logistics'],
    'faq',
    '/',
    105
  )
on conflict (slug) do update
set
  title = excluded.title,
  body = excluded.body,
  tags = excluded.tags,
  source_type = excluded.source_type,
  page_path = excluded.page_path,
  priority = excluded.priority,
  is_active = true,
  updated_at = timezone('utc',now());
