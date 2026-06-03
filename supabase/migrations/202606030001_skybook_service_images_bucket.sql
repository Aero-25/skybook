-- Service images bucket for tour/service gallery photos uploaded via the admin
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'service-images',
  'service-images',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins upload service images" on storage.objects;
create policy "admins upload service images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'service-images'
  and public.is_booking_admin()
);

drop policy if exists "admins update service images" on storage.objects;
create policy "admins update service images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'service-images'
  and public.is_booking_admin()
)
with check (
  bucket_id = 'service-images'
  and public.is_booking_admin()
);

drop policy if exists "admins delete service images" on storage.objects;
create policy "admins delete service images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'service-images'
  and public.is_booking_admin()
);

drop policy if exists "public read service images" on storage.objects;
create policy "public read service images"
on storage.objects
for select
to public
using (bucket_id = 'service-images');
