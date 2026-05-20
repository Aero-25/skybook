create table if not exists public.booking_memories (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  booking_reference text not null,
  brand_code text not null check (brand_code in ('true-travel','iventure')),
  title text,
  caption text default '',
  file_name text not null,
  storage_bucket text not null default 'tour-memories',
  storage_path text not null unique,
  mime_type text not null,
  byte_size integer not null default 0,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.booking_memories is 'Private tour memory images uploaded by SkyBook admins and unlocked for guests by booking reference.';

create index if not exists booking_memories_reference_idx
  on public.booking_memories (booking_reference, brand_code, is_active, sort_order, created_at desc);

create index if not exists booking_memories_booking_idx
  on public.booking_memories (booking_id, is_active, sort_order, created_at desc);

drop trigger if exists booking_memories_set_updated_at on public.booking_memories;
create trigger booking_memories_set_updated_at
before update on public.booking_memories
for each row execute function public.set_row_updated_at();

alter table public.booking_memories enable row level security;

drop policy if exists "admins manage booking memories" on public.booking_memories;
create policy "admins manage booking memories"
on public.booking_memories
for all
using (public.is_booking_admin())
with check (public.is_booking_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tour-memories',
  'tour-memories',
  false,
  20971520,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins upload tour memories" on storage.objects;
create policy "admins upload tour memories"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'tour-memories'
  and public.is_booking_admin()
  and (storage.foldername(name))[1] = 'memories'
);

drop policy if exists "admins update tour memories" on storage.objects;
create policy "admins update tour memories"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'tour-memories'
  and public.is_booking_admin()
  and (storage.foldername(name))[1] = 'memories'
)
with check (
  bucket_id = 'tour-memories'
  and public.is_booking_admin()
  and (storage.foldername(name))[1] = 'memories'
);

drop policy if exists "admins delete tour memories" on storage.objects;
create policy "admins delete tour memories"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'tour-memories'
  and public.is_booking_admin()
  and (storage.foldername(name))[1] = 'memories'
);
