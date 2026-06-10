-- TEMP live-test coupon for QR preview verification. Removed by 2026061005.
insert into public.coupons (code, description, discount_type, discount_value, is_active, is_qr, kind, brand_code, usage_limit, usage_count)
values ('QRLIVETEST1','Live test 10%','percentage',10,true,true,'campaign','true-travel',2,0)
on conflict (code) do update set is_active=true, brand_code='true-travel', usage_limit=2, usage_count=0;
