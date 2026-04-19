do $$
begin
  if exists (select 1 from pg_type where typname = 'payment_provider') then
    alter type public.payment_provider add value if not exists 'apple_pay';
    alter type public.payment_provider add value if not exists 'google_pay';
    alter type public.payment_provider add value if not exists 'dpo';
  end if;
end $$;
