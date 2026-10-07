-- Bring existing bookings in line with the payment rules, after two console bugs:
--   * the Payment Process chosen when creating a booking was not sent, so bookings entered since
--     29 September have no payment process at all;
--   * bookings finished with a Payment Process after a part payment (cash, then "Card" for the rest)
--     read as a single method instead of a split payment.
-- Run after 202610060001_skybook_split_payment_repair.sql. Idempotent.
--
--   1. Past bookings without a payment process are paid (method not recorded), as in
--      202609290002_skybook_past_bookings_paid.sql: nothing outstanding, the payment row settled for
--      the full total, and the settlement recorded as a transaction. Staff can still set the real
--      method on the booking; the API then moves the settled amount to that method.
--   2. A booking paid with more than one method lists them (metadata.split_payment.methods), in the
--      order they were paid, so it reads "Split · Cash + Card" and counts as a split payment.
--   3. Guest invoices on settled bookings show no balance.
-- Cancelled, refunded and still-provisional (unapproved website) bookings are left alone.

begin;

-- 1. Past bookings without a payment process are paid.
update public.bookings b
set payment_status = 'paid',
    amount_due_now = 0,
    amount_due_later = 0,
    updated_at = now()
where b.preferred_date < current_date
  and coalesce(b.payment_status,'') = ''
  and coalesce(b.status::text,'') not in ('cancelled','refunded','provisional');

update public.bookings b
set amount_due_now = 0,
    amount_due_later = 0,
    updated_at = now()
where lower(coalesce(b.payment_status,'')) in ('paid','fully_paid','cash','card','eft','voucher','foc','invoiced')
  and coalesce(b.status::text,'') not in ('cancelled','refunded')
  and (coalesce(b.amount_due_now,0) <> 0 or coalesce(b.amount_due_later,0) <> 0);

insert into public.payments (booking_id, provider, status, currency_code, amount, amount_received, paid_at, metadata)
select b.id,
       case when lower(b.payment_status) = 'eft' then 'manual_eft'::public.payment_provider else 'custom'::public.payment_provider end,
       'paid'::public.payment_status,
       coalesce(b.currency_code,'NAD'),
       coalesce(b.total_amount,0),
       coalesce(b.total_amount,0),
       coalesce(b.updated_at, b.created_at, now()),
       jsonb_build_object('source','payment_process_backfill','payment_type',lower(b.payment_status),'payment_process',lower(b.payment_status))
from public.bookings b
where lower(coalesce(b.payment_status,'')) in ('paid','fully_paid','cash','card','eft','voucher','foc','invoiced')
  and coalesce(b.status::text,'') not in ('cancelled','refunded')
  and not exists (select 1 from public.payments p where p.booking_id = b.id);

with settled as (
  select p.id as payment_id,
         p.provider,
         coalesce(p.currency_code, b.currency_code, 'NAD') as currency_code,
         lower(b.payment_status) as process,
         coalesce(b.total_amount,0) as total,
         coalesce(p.amount_received,0) as received
  from public.payments p
  join public.bookings b on b.id = p.booking_id
  where lower(coalesce(b.payment_status,'')) in ('paid','fully_paid','cash','card','eft','voucher','foc','invoiced')
    and coalesce(b.status::text,'') not in ('cancelled','refunded')
    and p.id = (select p2.id from public.payments p2 where p2.booking_id = b.id order by p2.created_at asc limit 1)
    and coalesce(p.amount_received,0) < coalesce(b.total_amount,0) - 0.01
)
insert into public.payment_transactions (payment_id, provider, transaction_reference, transaction_type, status, amount, currency_code, raw_payload, reconciled_at)
select s.payment_id,
       s.provider,
       'PROCESS-' || upper(s.process) || '-BACKFILL',
       'manual_payment',
       'paid'::public.payment_status,
       round(s.total - s.received, 2),
       s.currency_code,
       jsonb_build_object('payment_type', s.process, 'payment_process', s.process, 'source', 'payment_process_backfill'),
       now()
from settled s;

update public.payments p
set status = 'paid'::public.payment_status,
    amount = greatest(coalesce(p.amount,0), coalesce(b.total_amount,0)),
    amount_received = greatest(coalesce(p.amount_received,0), coalesce(b.total_amount,0)),
    paid_at = coalesce(p.paid_at, b.updated_at, now()),
    metadata = coalesce(p.metadata,'{}'::jsonb)
             || jsonb_build_object('payment_type', lower(b.payment_status), 'payment_process', lower(b.payment_status)),
    updated_at = now()
from public.bookings b
where b.id = p.booking_id
  and lower(coalesce(b.payment_status,'')) in ('paid','fully_paid','cash','card','eft','voucher','foc','invoiced')
  and coalesce(b.status::text,'') not in ('cancelled','refunded')
  and (p.status <> 'paid'::public.payment_status or coalesce(p.amount_received,0) < coalesce(b.total_amount,0) - 0.01);

-- 2. Bookings paid with more than one method list them, in the order they were paid.
with first_payment as (
  select distinct on (p.booking_id) p.booking_id, p.id as payment_id
  from public.payments p
  order by p.booking_id, p.created_at asc
),
method_rows as (
  select fp.booking_id,
         lower(t.raw_payload->>'payment_type') as method,
         min(t.created_at) as first_at
  from first_payment fp
  join public.payment_transactions t on t.payment_id = fp.payment_id
  where t.status = 'paid'::public.payment_status
    and coalesce(t.amount,0) > 0
    and coalesce(t.raw_payload->>'payment_type','') <> ''
  group by fp.booking_id, lower(t.raw_payload->>'payment_type')
),
methods as (
  select booking_id, jsonb_agg(method order by first_at, method) as methods, count(*) as method_count
  from method_rows
  group by booking_id
)
update public.bookings b
set metadata = coalesce(b.metadata,'{}'::jsonb)
             || jsonb_build_object('split_payment',
                  coalesce(b.metadata->'split_payment','{}'::jsonb) || jsonb_build_object('methods', m.methods, 'updated_at', now())),
    updated_at = now()
from methods m
where m.booking_id = b.id
  and m.method_count > 1
  and coalesce(b.metadata->'split_payment'->'methods','[]'::jsonb) is distinct from m.methods;

-- 3. Guest invoices on settled bookings show no balance.
update public.invoices i
set balance_amount = 0,
    status = case when coalesce(i.total_amount,0) > 0 then 'paid' else i.status end,
    updated_at = now()
from public.bookings b
where b.id = i.booking_id
  and lower(coalesce(b.payment_status,'')) in ('paid','fully_paid','cash','card','eft','voucher','foc','invoiced')
  and coalesce(b.status::text,'') not in ('cancelled','refunded')
  and (coalesce(i.balance_amount,0) <> 0 or (coalesce(i.total_amount,0) > 0 and coalesce(i.status,'') <> 'paid'));

commit;
