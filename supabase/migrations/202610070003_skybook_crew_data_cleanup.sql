-- Clean up guide / skipper data so the Guides & skippers report counts trips correctly.
--   1. Names: one person per entry ("Len/Adrian" becomes "Len, Adrian"), the typo "Adtrian" becomes
--      "Adrian", and each name takes its spelling from the guides & skippers list.
--   2. Kayaking & Sandwich Harbour Combo: the guide goes on both the AM kayak and the PM Sandwich
--      Harbour trip, recorded (as on new bookings) by entering the guide twice. Applied to finalised
--      combos with a single guide; combos with two different guides are left for staff to decide.
--   3. Finalised bookings with no departure on a tour that has only one departure get that departure.
--   4. The test booking TT-260724-E5A206CF (guide "Test, Test2", skipper "Skip 1, Skip 2") is moved
--      to trash so it stays out of reports. Restoring it from trash brings it back unchanged.
-- Every booking changed in steps 2-4 gets an internal note. Idempotent.

begin;

create or replace function pg_temp.clean_crew(names text, crew_role text) returns text
language sql stable as $$
  select nullif(string_agg(coalesce(cm.name, p.name), ', ' order by p.ord), '')
  from (
    select t.ord, case lower(x.n) when 'adtrian' then 'Adrian' else x.n end as name
    from regexp_split_to_table(coalesce(names, ''), '[,;/]') with ordinality as t(raw, ord)
    cross join lateral (select btrim(regexp_replace(t.raw, '\s+', ' ', 'g')) as n) x
    where x.n <> ''
  ) p
  left join public.crew_members cm on cm.role = crew_role and lower(cm.name) = lower(p.name)
$$;

-- 1. Names.
update public.bookings b
set metadata = jsonb_set(b.metadata, '{guide_name}', to_jsonb(coalesce(pg_temp.clean_crew(b.metadata->>'guide_name', 'guide'), ''))),
    updated_at = now()
where btrim(coalesce(b.metadata->>'guide_name', '')) <> ''
  and coalesce(pg_temp.clean_crew(b.metadata->>'guide_name', 'guide'), '') is distinct from b.metadata->>'guide_name';

update public.bookings b
set metadata = jsonb_set(b.metadata, '{skipper_name}', to_jsonb(coalesce(pg_temp.clean_crew(b.metadata->>'skipper_name', 'skipper'), ''))),
    updated_at = now()
where btrim(coalesce(b.metadata->>'skipper_name', '')) <> ''
  and coalesce(pg_temp.clean_crew(b.metadata->>'skipper_name', 'skipper'), '') is distinct from b.metadata->>'skipper_name';

-- 2. Kayak combos: the single guide covers the AM and the PM trip.
with doubled as (
  update public.bookings b
  set metadata = jsonb_set(b.metadata, '{guide_name}', to_jsonb(btrim(b.metadata->>'guide_name') || ', ' || btrim(b.metadata->>'guide_name'))),
      updated_at = now()
  from public.services s
  where s.id = b.service_id
    and s.name = 'Kayaking & Sandwich Harbour Combo'
    and b.status::text = 'finalised'
    and btrim(coalesce(b.metadata->>'guide_name', '')) <> ''
    and b.metadata->>'guide_name' !~ '[,;/]'
  returning b.id, btrim(b.metadata->>'guide_name') as guides
)
insert into public.admin_notes (booking_id, note, is_private)
select id, 'Guide entered twice (' || guides || ') — the kayak combo covers the AM and the PM trip in the Guides report. Data clean-up, 7 Oct 2026.', true
from doubled;

-- 3. Single-departure tours: fill in the only departure.
with single as (
  select s.id as service_id, s.metadata->'departure_times'->0->>'label' as label
  from public.services s
  where jsonb_typeof(s.metadata->'departure_times') = 'array'
    and jsonb_array_length(s.metadata->'departure_times') = 1
    and coalesce(s.metadata->'departure_times'->0->>'label', '') <> ''
),
filled as (
  update public.bookings b
  set metadata = b.metadata || jsonb_build_object('departure_label', sg.label),
      updated_at = now()
  from single sg
  where b.service_id = sg.service_id
    and b.status::text = 'finalised'
    and coalesce(b.metadata->>'departure_label', '') = ''
  returning b.id, sg.label
)
insert into public.admin_notes (booking_id, note, is_private)
select id, 'Departure set to "' || label || '" (the tour''s only departure) so the booking joins the right trip in the Guides report. Data clean-up, 7 Oct 2026.', true
from filled;

-- 4. Test booking out of the reports (to trash, restorable).
with trashed as (
  update public.bookings b
  set status = 'cancelled'::public.booking_status,
      payment_status = '',
      cancellation_reason = 'Test booking — moved to trash so it stays out of reports.',
      metadata = coalesce(b.metadata, '{}'::jsonb) || jsonb_build_object('trash', jsonb_build_object(
        'archived_at', now(),
        'reason', 'Test booking — moved to trash so it stays out of reports.',
        'archived_by', null,
        'scope', 'booking',
        'original_status', b.status::text,
        'original_payment_status', coalesce(b.payment_status, '')
      )),
      updated_at = now()
  where b.reference = 'TT-260724-E5A206CF'
    and coalesce(b.metadata->'trash'->>'archived_at', '') = ''
  returning b.id
),
history as (
  insert into public.booking_status_history (booking_id, from_status, to_status, reason, actor_label)
  select id, 'finalised'::public.booking_status, 'cancelled'::public.booking_status, 'Booking moved to trash: test booking, kept out of reports.', 'system:data_cleanup'
  from trashed
  returning booking_id
)
insert into public.admin_notes (booking_id, note, is_private)
select booking_id, 'Booking moved to trash: test booking (guide "Test", skipper "Skip 1"), kept out of reports. Restore it from trash if it was real. Data clean-up, 7 Oct 2026.', true
from history;

commit;
