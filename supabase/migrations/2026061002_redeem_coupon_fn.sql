-- Atomically reserve one redemption under all guards. Returns the coupon row
-- (or no row if the code is invalid/expired/exhausted/wrong brand/wrong service).
-- Single-use codes are deactivated in the same statement.
create or replace function public.redeem_coupon(
  p_code text,
  p_brand text,
  p_service_id uuid default null
) returns table(id uuid, discount_type text, discount_value numeric, kind text, description text)
language plpgsql as $$
declare
  v_id uuid;
begin
  update public.coupons c
    set usage_count = coalesce(c.usage_count,0) + 1,
        is_active = case when c.kind = 'single_use' then false else c.is_active end
  where upper(c.code) = upper(p_code)
    and c.is_active = true
    and coalesce(c.brand_code, p_brand) = p_brand
    and (c.usage_limit is null or coalesce(c.usage_count,0) < c.usage_limit)
    and (c.ends_at is null or now() < c.ends_at)
    and (c.starts_at is null or now() >= c.starts_at)
    and (c.service_id is null or c.service_id = p_service_id)
  returning c.id into v_id;

  if v_id is null then
    return;
  end if;

  return query
    select c.id, c.discount_type, c.discount_value, c.kind, c.description
    from public.coupons c where c.id = v_id;
end;
$$;

-- Compensating decrement if the booking fails after a successful reserve.
create or replace function public.release_coupon(p_coupon_id uuid)
returns void language plpgsql as $$
begin
  update public.coupons
    set usage_count = greatest(0, coalesce(usage_count,0) - 1),
        is_active = case when kind = 'single_use' then true else is_active end
  where id = p_coupon_id;
end;
$$;
