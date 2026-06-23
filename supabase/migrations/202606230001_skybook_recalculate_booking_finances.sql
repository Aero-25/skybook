-- Recalculate booking finances for bookings whose total drifted from base_price x quantity.
-- This backfills the same fix applied in booking-api updateBooking: a pax change must reprice.
--
-- SKIPS (preserved untouched):
--   * deliberate price overrides  (metadata->>'price_override' is a non-zero number)
--   * FOC bookings                (payment_status = 'foc')
--   * cancelled / refunded        (status or payment_status)
-- Only rows whose stored total actually drifted (> 0.01) from the recomputed total are updated.
-- Idempotent: re-running yields the same result. Wrapped in a transaction.
-- Reversible: snapshot public.bookings before running (pg_dump) per the deploy runbook.

begin;

with recalculated as (
  select
    b.id,
    round(s.base_price * greatest(1, coalesce(b.quantity,1)), 2) as new_subtotal,
    round(
      greatest(
        0,
        (round(s.base_price * greatest(1, coalesce(b.quantity,1)), 2)
          + coalesce(b.tax_amount,0)
          + coalesce(b.service_fee_amount,0))
        - greatest(
            0,
            (coalesce(b.subtotal_amount,0)+coalesce(b.tax_amount,0)+coalesce(b.service_fee_amount,0))
            - coalesce(b.total_amount,0)
          )
      ), 2
    ) as new_total
  from public.bookings b
  join public.services s on s.id = b.service_id
  where coalesce(nullif(b.metadata->>'price_override',''),'0')::numeric = 0
    and coalesce(b.payment_status,'') <> 'foc'
    and coalesce(b.status::text,'') not in ('cancelled')
    and coalesce(b.payment_status,'') not in ('refunded','cancelled')
)
update public.bookings b
set
  subtotal_amount = r.new_subtotal,
  total_amount = r.new_total,
  amount_due_now = greatest(0, round(r.new_total - coalesce(p.amount_received,0), 2)),
  amount_due_later = 0,
  updated_at = now()
from recalculated r
left join lateral (
  select amount_received
  from public.payments p2
  where p2.booking_id = b.id
  order by p2.created_at asc
  limit 1
) p on true
where b.id = r.id
  and abs(coalesce(b.total_amount,0) - r.new_total) > 0.01;

commit;
