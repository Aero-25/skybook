-- Remove the temporary live-test coupon inserted by 2026061004.
delete from public.coupons where code = 'QRLIVETEST1';
