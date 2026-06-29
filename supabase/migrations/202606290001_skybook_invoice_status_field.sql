-- 202606290001_skybook_invoice_status_field.sql
-- Split invoicing into its own status (Status 1), independent of payment_status (Status 2)
-- and the booking lifecycle status (Status 3).
--   Status 1 invoice_status : 'invoice' (still to be invoiced) | 'invoiced' (finance has invoiced)
--   Status 2 payment_status : 'to_pay' | 'partially_paid' | 'paid' | 'foc'
--   Status 3 status         : 'provisional' | 'confirmed' | 'awaiting_details' | 'cancelled' | 'finalised'
alter table public.bookings add column if not exists invoice_status text;

-- Backfill existing rows so the three statuses are consistent (safe / idempotent).
-- Status 1: anything that was invoiced or paid implies it was invoiced.
update public.bookings
   set invoice_status = case
     when status = 'cancelled' then null
     when payment_status in ('invoiced','paid','fully_paid','partially_paid','foc','refunded') then 'invoiced'
     else 'invoice' end
 where invoice_status is null;
