alter table public.app_users
add column if not exists permissions jsonb not null default '{}'::jsonb;

create or replace function public.is_super_admin() returns boolean language sql stable as $$
  select exists (
    select 1
    from public.app_users
    where id = auth.uid()
      and is_active = true
      and role = 'super_admin'
  );
$$;

comment on column public.app_users.permissions is 'Per-section access overrides for SkyBook admin modules.';
