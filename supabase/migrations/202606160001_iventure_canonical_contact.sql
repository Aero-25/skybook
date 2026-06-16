-- 202606160001_iventure_canonical_contact.sql
-- Align the Iventure brand contact identity to the canonical public domain.
-- Additive correction: does NOT edit the original multibrand migration.
-- Safe to re-run (plain UPDATE by primary key is idempotent).

update public.brands
   set website_url    = 'https://www.iventuretours.net',
       support_email  = 'bookings@iventuretours.net'
 where code = 'iventure';
