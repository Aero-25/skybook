-- Which app's built-in browser a visit opened in (TikTok, Instagram, Facebook, Messenger, ...).
-- Those apps open links inside themselves and name themselves in the user agent, which is the most
-- reliable sign of a social visit: they often send no referrer and no utm tags. The tracker reports
-- the app name only (never the user agent). Idempotent.
alter table public.site_visits add column if not exists in_app text not null default '';
