-- A booking whose Payment Process is set (cash, card, eft, voucher, foc, invoiced, paid,
-- fully_paid) is fully paid. Bring existing records in line with that rule:
--   * the booking owes nothing (amount_due_now / amount_due_later = 0)
--   * its payment row is settled for the full booking total (status 'paid', amount_received = total)
--   * a transaction records the settlement by method, so the Payment Process report counts it
-- Cancelled and refunded bookings are left alone. Idempotent: re-running changes nothing.

begin;

-- 1. Nothing is outstanding on a settled booking.
update public.bookings b
set amount_due_now = 0,
    amount_due_later = 0,
    updated_at = now()
where lower(coalesce(b.payment_status,'')) in ('paid','fully_paid','cash','card','eft','voucher','foc','invoiced')
  and coalesce(b.status::text,'') not in ('cancelled','refunded')
  and (coalesce(b.amount_due_now,0) <> 0 or coalesce(b.amount_due_later,0) <> 0);

-- 2. Settled bookings that have no payment row at all get one.
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

-- 3. Existing payment rows on settled bookings are settled for the full total.
--    Record the difference as a transaction first (by method), then update the row.
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

-- 4. Guest invoices on settled bookings show no balance.
update public.invoices i
set balance_amount = 0,
    status = case when coalesce(i.total_amount,0) > 0 then 'paid' else i.status end,
    updated_at = now()
from public.bookings b
where b.id = i.booking_id
  and lower(coalesce(b.payment_status,'')) in ('paid','fully_paid','cash','card','eft','voucher','foc','invoiced')
  and coalesce(b.status::text,'') not in ('cancelled','refunded')
  and coalesce(i.balance_amount,0) <> 0;

commit;
