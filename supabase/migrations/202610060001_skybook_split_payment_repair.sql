-- Repair bookings left "partially paid" by the split-payment bug: the booking form sent each split
-- row as a separate request, so when a later row was rejected (for example a card row without its
-- terminal serial and batch number) only the first part was recorded.
--
--   * Part-paid bookings whose tour date has passed are settled: the missing part is recorded as a
--     transaction with method "not recorded" (so the reports stay honest about the method), the
--     payment row is settled for the full total, and the booking is marked paid (split).
--   * Part-paid bookings whose payments already cover the total are simply marked paid.
--   * Upcoming part-paid bookings are left alone — they may be genuine deposits. The final query
--     lists them so staff can finish them with "Record payment" on the booking.
-- Cancelled, refunded and unapproved (provisional) bookings are untouched. Safe to run more than once.

begin;

-- 1. Past part-paid bookings: record the missing part and settle them.
with targets as (
  select b.id as booking_id,
         b.reference,
         coalesce(b.total_amount,0) as total,
         coalesce(b.currency_code,'NAD') as currency_code,
         p.id as payment_id,
         p.provider,
         coalesce(p.amount_received,0) as received,
         coalesce((
           select jsonb_agg(distinct pt.raw_payload->>'payment_type')
           from public.payment_transactions pt
           where pt.payment_id = p.id and coalesce(pt.raw_payload->>'payment_type','') <> ''
         ),'[]'::jsonb) as methods
  from public.bookings b
  join lateral (
    select * from public.payments p2 where p2.booking_id = b.id order by p2.created_at asc limit 1
  ) p on true
  where lower(coalesce(b.payment_status,'')) = 'partially_paid'
    and coalesce(b.status::text,'') not in ('cancelled','refunded','provisional')
    and b.preferred_date < current_date
    and coalesce(p.amount_received,0) < coalesce(b.total_amount,0) - 0.01
),
missing_part as (
  insert into public.payment_transactions (payment_id, provider, transaction_reference, transaction_type, status, amount, currency_code, raw_payload, reconciled_at)
  select t.payment_id,
         t.provider,
         'SPLIT-REPAIR-' || t.reference,
         'manual_payment',
         'paid'::public.payment_status,
         round(t.total - t.received, 2),
         t.currency_code,
         jsonb_build_object('payment_type','unrecorded','source','split_payment_repair','booking_reference',t.reference),
         now()
  from targets t
  returning payment_id
),
settled_payment as (
  update public.payments p
  set status = 'paid'::public.payment_status,
      amount = greatest(coalesce(p.amount,0), t.total),
      amount_received = t.total,
      paid_at = coalesce(p.paid_at, now()),
      metadata = coalesce(p.metadata,'{}'::jsonb) || jsonb_build_object('split_payment_repair', true),
      updated_at = now()
  from targets t
  where p.id = t.payment_id
  returning p.id
)
update public.bookings b
set payment_status = 'paid',
    amount_due_now = 0,
    amount_due_later = 0,
    metadata = coalesce(b.metadata,'{}'::jsonb) || jsonb_build_object(
      'split_payment', jsonb_build_object(
        'methods', (select coalesce(jsonb_agg(distinct m),'[]'::jsonb) from jsonb_array_elements_text(t.methods || '["unrecorded"]'::jsonb) m),
        'repaired', true,
        'updated_at', now()
      )
    ),
    updated_at = now()
from targets t
where b.id = t.booking_id;

-- 2. Part-paid bookings whose payments already cover the total are paid (split when more than one method).
update public.bookings b
set payment_status = 'paid',
    amount_due_now = 0,
    amount_due_later = 0,
    metadata = case
      when (select count(distinct pt.raw_payload->>'payment_type') from public.payment_transactions pt where pt.payment_id = p.id and coalesce(pt.raw_payload->>'payment_type','') <> '') > 1
      then coalesce(b.metadata,'{}'::jsonb) || jsonb_build_object('split_payment', jsonb_build_object(
             'methods', (select jsonb_agg(distinct pt.raw_payload->>'payment_type') from public.payment_transactions pt where pt.payment_id = p.id and coalesce(pt.raw_payload->>'payment_type','') <> ''),
             'repaired', true, 'updated_at', now()))
      else b.metadata end,
    updated_at = now()
from public.payments p
where p.booking_id = b.id
  and p.id = (select p2.id from public.payments p2 where p2.booking_id = b.id order by p2.created_at asc limit 1)
  and lower(coalesce(b.payment_status,'')) = 'partially_paid'
  and coalesce(b.status::text,'') not in ('cancelled','refunded')
  and coalesce(p.amount_received,0) >= coalesce(b.total_amount,0) - 0.01;

update public.payments p
set status = 'paid'::public.payment_status,
    paid_at = coalesce(p.paid_at, now()),
    updated_at = now()
from public.bookings b
where b.id = p.booking_id
  and lower(coalesce(b.payment_status,'')) = 'paid'
  and p.status = 'partially_paid'::public.payment_status
  and coalesce(p.amount_received,0) >= coalesce(b.total_amount,0) - 0.01;

-- 3. Guest invoices on paid bookings show no balance.
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

-- Upcoming bookings still part-paid: finish each one with "Record payment" on the booking.
select b.reference,
       b.preferred_date as tour_date,
       c.full_name as guest,
       b.total_amount as total,
       coalesce(p.amount_received,0) as received,
       round(coalesce(b.total_amount,0) - coalesce(p.amount_received,0), 2) as outstanding
from public.bookings b
left join public.customers c on c.id = b.customer_id
left join lateral (
  select * from public.payments p2 where p2.booking_id = b.id order by p2.created_at asc limit 1
) p on true
where lower(coalesce(b.payment_status,'')) = 'partially_paid'
  and coalesce(b.status::text,'') not in ('cancelled','refunded','provisional')
order by b.preferred_date;
