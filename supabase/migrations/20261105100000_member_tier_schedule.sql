-- Membership tiers (part 3 of 3): run the promotion check every hour.
--
-- pg_cron is available on Supabase. If your project has not enabled it yet,
-- enable it under Database -> Extensions (or run the create extension line
-- below from the SQL Editor) before applying this file.

begin;

create extension if not exists pg_cron;

do $$
declare
  existing_job bigint;
begin
  select jobid
  into existing_job
  from cron.job
  where jobname = 'kaluwo-promote-member-roles'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'kaluwo-promote-member-roles',
    '15 * * * *',
    'select public.promote_member_roles();'
  );
end;
$$;

commit;
