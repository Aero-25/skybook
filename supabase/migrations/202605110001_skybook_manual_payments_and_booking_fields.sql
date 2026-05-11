insert into public.settings (setting_group, setting_key, setting_value, is_public)
values ('booking', 'booking_fields', '[]'::jsonb, true)
on conflict (setting_group, setting_key)
do update set is_public = true, updated_at = timezone('utc', now());

comment on column public.payments.metadata is 'Stores manual payment type details, including card serial and batch numbers where applicable.';
