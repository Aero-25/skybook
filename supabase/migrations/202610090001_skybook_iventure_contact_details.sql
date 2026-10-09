-- Iventure guest emails showed info@aerodigital.space and True Travel's phone number
-- (+264 81 322 4270) under "Questions? We are always here".
--   1. The saved booking config kept a development placeholder, info@aerodigital.space, as
--      Iventure's support email, and that setting wins over the brand record. It becomes
--      bookings@iventuretours.net, the address on the Iventure site and the one emails come from.
--   2. The Iventure brand record still had True Travel's number. Iventure's number is
--      +264 81 293 4155, as on the Iventure site since June.
-- Idempotent.

begin;

update public.settings
set setting_value = setting_value || jsonb_build_object(
      'supportEmailsByBrand',
      case when jsonb_typeof(setting_value->'supportEmailsByBrand') = 'object'
           then setting_value->'supportEmailsByBrand' else '{}'::jsonb end
        || '{"iventure":"bookings@iventuretours.net"}'::jsonb
    ),
    updated_at = timezone('utc', now())
where setting_group = 'booking'
  and setting_key = 'config'
  and jsonb_typeof(setting_value) = 'object';

update public.brands
set support_email = 'bookings@iventuretours.net',
    support_phone = '+264812934155',
    support_whatsapp = '+264812934155'
where code = 'iventure';

commit;
