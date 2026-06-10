-- Brand booking base URLs used by the discount-QR generator to build deep links.
-- Read server-side via getSettingValue('brand_booking_urls', {}).
insert into public.settings (setting_group, setting_key, setting_value, is_public)
values (
  'booking',
  'brand_booking_urls',
  '{"true-travel":"https://truetravelnam.net","iventure":"https://www.iventuretours.net"}'::jsonb,
  false
)
on conflict (setting_group, setting_key) do update
  set setting_value = excluded.setting_value,
      updated_at = timezone('utc', now());
