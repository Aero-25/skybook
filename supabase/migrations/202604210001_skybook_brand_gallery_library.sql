create table if not exists public.brand_gallery_assets (
  id uuid primary key default gen_random_uuid(),
  brand_code text not null check (brand_code in ('true-travel','iventure')),
  title text not null,
  caption text default '',
  category text not null default 'Collection',
  image_url text not null,
  storage_bucket text not null default 'True Travel',
  storage_path text not null,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.brand_gallery_assets is 'Published gallery media for the public True Travel and Iventure sites.';

create index if not exists brand_gallery_assets_brand_sort_idx
  on public.brand_gallery_assets (brand_code, is_published, sort_order, created_at desc);

drop trigger if exists brand_gallery_assets_set_updated_at on public.brand_gallery_assets;
create trigger brand_gallery_assets_set_updated_at
before update on public.brand_gallery_assets
for each row execute function public.set_row_updated_at();

alter table public.brand_gallery_assets enable row level security;

drop policy if exists "public read published brand gallery assets" on public.brand_gallery_assets;
create policy "public read published brand gallery assets"
on public.brand_gallery_assets
for select
using (is_published = true);

drop policy if exists "admins manage brand gallery assets" on public.brand_gallery_assets;
create policy "admins manage brand gallery assets"
on public.brand_gallery_assets
for all
using (public.is_booking_admin())
with check (public.is_booking_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'True Travel',
  'True Travel',
  true,
  15728640,
  array['image/jpeg','image/png','image/webp','image/avif','image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins upload gallery media" on storage.objects;
create policy "admins upload gallery media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'True Travel'
  and public.is_booking_admin()
  and (storage.foldername(name))[1] = 'gallery'
);

drop policy if exists "admins update gallery media" on storage.objects;
create policy "admins update gallery media"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'True Travel'
  and public.is_booking_admin()
  and (storage.foldername(name))[1] = 'gallery'
)
with check (
  bucket_id = 'True Travel'
  and public.is_booking_admin()
  and (storage.foldername(name))[1] = 'gallery'
);

drop policy if exists "admins delete gallery media" on storage.objects;
create policy "admins delete gallery media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'True Travel'
  and public.is_booking_admin()
  and (storage.foldername(name))[1] = 'gallery'
);
