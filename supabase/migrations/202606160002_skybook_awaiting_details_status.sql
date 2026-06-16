-- 202606160002_skybook_awaiting_details_status.sql
-- New first-stage booking status: captured but guest/logistics details still missing.
-- Lifecycle: awaiting_details -> provisional -> confirmed.
alter type public.booking_status add value if not exists 'awaiting_details';
