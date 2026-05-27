-- Add must_change_password flag to app_users
-- New admin users are required to change their password on first login.
alter table public.app_users
  add column if not exists must_change_password boolean not null default false;

-- Also add permissions column if missing (was added in a later migration; idempotent)
alter table public.app_users
  add column if not exists permissions jsonb not null default '{}'::jsonb;
