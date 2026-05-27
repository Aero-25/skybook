-- Clear stored per-user permission overrides for all manager accounts.
-- Managers should inherit full access from the role defaults — no overrides needed.
update public.app_users
set permissions = '{}'::jsonb
where role = 'manager';
