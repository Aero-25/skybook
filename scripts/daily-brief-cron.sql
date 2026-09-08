-- SkyBook daily ops briefs — schedule.
--
-- The daily-brief edge function exists and is complete, but NOTHING invokes it.
-- This script creates the two pg_cron jobs that do.
--
-- HOW TO RUN
--   1. Deploy the function first (it must exist before the schedule points at it):
--        npx supabase functions deploy daily-brief --project-ref asagrwkixsaltkkrqdsz --use-api --no-verify-jwt
--   2. Set the shared secret the function checks:
--        npx supabase secrets set CRON_SECRET=<pick-a-long-random-string> --project-ref asagrwkixsaltkkrqdsz
--   3. Replace REPLACE_WITH_CRON_SECRET below with that same value.
--   4. Paste the whole file into the Supabase SQL editor and run it.
--
-- This file is deliberately NOT a migration: it carries a secret, so it must
-- never run automatically from `supabase db push`.
--
-- TIMES: Africa/Windhoek is UTC+2 year-round (Namibia dropped DST in 2018).
--   06:00 CAT = 04:00 UTC  → today's arrivals
--   15:00 CAT = 13:00 UTC  → tomorrow's prep

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Idempotent: drop previous schedules so re-running this file is safe.
do $$
begin
  perform cron.unschedule('skybook-daily-brief-morning');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('skybook-daily-brief-afternoon');
exception when others then null;
end $$;

select cron.schedule(
  'skybook-daily-brief-morning',
  '0 4 * * *',
  $job$
  select net.http_post(
    url := 'https://asagrwkixsaltkkrqdsz.supabase.co/functions/v1/daily-brief?type=morning',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', 'REPLACE_WITH_CRON_SECRET'
    )
  );
  $job$
);

select cron.schedule(
  'skybook-daily-brief-afternoon',
  '0 13 * * *',
  $job$
  select net.http_post(
    url := 'https://asagrwkixsaltkkrqdsz.supabase.co/functions/v1/daily-brief?type=afternoon',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', 'REPLACE_WITH_CRON_SECRET'
    )
  );
  $job$
);

-- Confirm both jobs are registered.
select jobid, jobname, schedule, active
from cron.job
where jobname like 'skybook-daily-brief-%'
order by jobname;

-- After the first firing, check delivery:
--   select * from cron.job_run_details
--   where jobid in (select jobid from cron.job where jobname like 'skybook-daily-brief-%')
--   order by start_time desc limit 10;
