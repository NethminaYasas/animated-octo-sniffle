-- Phase 2: reports for posts/comments and users, open-report deduplication,
-- report rate limits, and staff-only resolution records.

begin;

create type public.report_target_type as enum ('post', 'user');

alter table public.reports
  add column target_type public.report_target_type not null default 'post',
  add column target_user_id uuid references public.profiles (id) on delete cascade;

alter table public.reports
  alter column post_id drop not null;

alter table public.reports
  drop constraint if exists reports_post_id_reporter_id_key;

alter table public.reports
  add constraint reports_target_shape check (
    (
      target_type = 'post'
      and post_id is not null
      and target_user_id is null
    )
    or (
      target_type = 'user'
      and post_id is null
      and target_user_id is not null
    )
  );

create unique index reports_open_post_reporter_idx
  on public.reports (post_id, reporter_id)
  where status = 'open' and post_id is not null;

create unique index reports_open_user_reporter_idx
  on public.reports (target_user_id, reporter_id)
  where status = 'open' and target_user_id is not null;

create index reports_target_user_idx
  on public.reports (target_user_id, created_at desc)
  where target_user_id is not null;

-- ---------------------------------------------------------------------------
-- Staff-only resolution record. The reports row keeps only the status, so a
-- reporter can never read who handled it or the resolution note.
-- ---------------------------------------------------------------------------
create table public.report_resolutions (
  report_id bigint primary key references public.reports (id) on delete cascade,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolution_note text not null,
  mod_log_id bigint not null references public.mod_log (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint report_resolutions_note_length
    check (char_length(resolution_note) between 1 and 2000)
);

alter table public.report_resolutions enable row level security;

create policy "staff can read report resolutions"
  on public.report_resolutions for select to authenticated
  using (public.is_moderator());

revoke all on table public.report_resolutions from anon, authenticated;
grant select on table public.report_resolutions to authenticated;
grant all on table public.report_resolutions to service_role;

-- ---------------------------------------------------------------------------
-- Report policies
-- ---------------------------------------------------------------------------
drop policy if exists "reporters and moderators can read reports" on public.reports;
drop policy if exists "members can create reports" on public.reports;
drop policy if exists "moderators can update reports" on public.reports;

create policy "reporters and staff can read reports"
  on public.reports for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or public.is_moderator()
  );

create policy "members can create reports"
  on public.reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and not public.is_banned()
    and status = 'open'
    and (
      (
        target_type = 'post'
        and post_id is not null
        and target_user_id is null
        and exists (
          select 1
          from public.posts p
          where p.id = post_id
        )
      )
      or (
        target_type = 'user'
        and post_id is null
        and target_user_id is not null
        and target_user_id <> (select auth.uid())
        and exists (
          select 1
          from public.profiles p
          where p.id = target_user_id
        )
      )
    )
  );

revoke all on table public.reports from anon, authenticated;
revoke all on sequence public.reports_id_seq from anon, authenticated;
grant select, insert on table public.reports to authenticated;
grant usage, select on sequence public.reports_id_seq to authenticated;
grant all on table public.reports to service_role;
grant usage, select on sequence public.reports_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- Report rate limit
-- ---------------------------------------------------------------------------
alter table kaluwo_private.rate_limit_buckets
  drop constraint if exists rate_limit_buckets_action;

alter table kaluwo_private.rate_limit_buckets
  add constraint rate_limit_buckets_action
  check (action in ('thread', 'comment', 'report'));

create or replace function kaluwo_private.consume_posting_rate_limit(p_action text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.user_role;
  v_banned boolean;
  v_banned_until timestamptz;
  v_limit integer;
  v_window integer;
  v_window_start timestamptz;
  v_used integer;
  v_retry integer;
begin
  if v_uid is null then
    return;
  end if;

  select p.role, p.is_banned, p.banned_until
  into v_role, v_banned, v_banned_until
  from public.profiles p
  where p.id = v_uid;

  if not found then
    raise exception 'Profile not found' using errcode = '42501';
  end if;

  if v_banned and (v_banned_until is null or v_banned_until > now()) then
    raise exception 'Banned members cannot post' using errcode = '42501';
  end if;

  if p_action = 'thread' then
    if v_role = 'new_member' then
      v_limit := 1;
      v_window := 600;
    elsif v_role in ('moderator', 'admin') then
      v_limit := 20;
      v_window := 900;
    else
      v_limit := 5;
      v_window := 900;
    end if;
  elsif p_action = 'comment' then
    if v_role = 'new_member' then
      v_limit := 5;
      v_window := 600;
    elsif v_role in ('moderator', 'admin') then
      v_limit := 100;
      v_window := 900;
    else
      v_limit := 30;
      v_window := 900;
    end if;
  elsif p_action = 'report' then
    if v_role = 'new_member' then
      v_limit := 5;
      v_window := 3600;
    elsif v_role in ('moderator', 'admin') then
      v_limit := 30;
      v_window := 3600;
    else
      v_limit := 10;
      v_window := 3600;
    end if;
  else
    raise exception 'Unknown rate-limit action';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / v_window) * v_window
  );

  delete from kaluwo_private.rate_limit_buckets b
  where b.user_id = v_uid
    and b.window_start < v_window_start - interval '1 day';

  insert into kaluwo_private.rate_limit_buckets as b
    (user_id, action, window_start, used)
  values
    (v_uid, p_action, v_window_start, 1)
  on conflict (user_id, action, window_start)
  do update set used = b.used + 1
    where b.used < v_limit
  returning b.used into v_used;

  if v_used is null then
    v_retry := greatest(
      1,
      ceil(extract(epoch from (
        v_window_start + make_interval(secs => v_window) - clock_timestamp()
      )))::integer
    );

    raise exception 'Kaluwo rate limit exceeded'
      using
        errcode = 'P0001',
        hint = 'kaluwo_rate_limited',
        detail = v_retry::text;
  end if;
end;
$$;

revoke all on function kaluwo_private.consume_posting_rate_limit(text)
  from public, anon, authenticated;

create or replace function kaluwo_private.enforce_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform kaluwo_private.consume_posting_rate_limit('report');
  return new;
end;
$$;

revoke all on function kaluwo_private.enforce_report_rate_limit()
  from public, anon, authenticated;

drop trigger if exists enforce_report_rate_limit on public.reports;

create trigger enforce_report_rate_limit
  before insert on public.reports
  for each row execute function kaluwo_private.enforce_report_rate_limit();

-- ---------------------------------------------------------------------------
-- Resolve or dismiss a report
-- ---------------------------------------------------------------------------
create or replace function public.staff_resolve_report(
  p_report_id bigint,
  p_status public.report_status,
  p_note text
)
returns table (changed boolean, mod_log_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_actor_role public.user_role;
  v_report public.reports%rowtype;
  v_target_author uuid;
  v_target_role public.user_role;
  v_note text;
  v_log_id bigint;
  v_changed boolean := false;
begin
  v_actor := kaluwo_private.assert_staff();

  if p_status not in ('resolved', 'dismissed') then
    raise exception 'The report status must be resolved or dismissed'
      using errcode = '22023';
  end if;

  v_note := btrim(coalesce(p_note, ''));

  if char_length(v_note) < 1 then
    raise exception 'A resolution note is required' using errcode = '22023';
  end if;

  if char_length(v_note) > 2000 then
    raise exception 'The resolution note must be 2000 characters or fewer'
      using errcode = '22023';
  end if;

  select p.role into v_actor_role
  from public.profiles p
  where p.id = v_actor;

  select * into v_report
  from public.reports r
  where r.id = p_report_id
  for update;

  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;

  if v_report.target_type = 'post' then
    select p.author_id into v_target_author
    from public.posts p
    where p.id = v_report.post_id;

    if v_target_author = v_actor then
      raise exception 'You cannot resolve a report about your own content'
        using errcode = '42501';
    end if;

    if v_target_author is not null then
      select p.role into v_target_role
      from public.profiles p
      where p.id = v_target_author;
    end if;
  else
    if v_report.target_user_id = v_actor then
      raise exception 'You cannot resolve a report about yourself'
        using errcode = '42501';
    end if;

    select p.role into v_target_role
    from public.profiles p
    where p.id = v_report.target_user_id;
  end if;

  if v_target_role in ('moderator', 'admin') and v_actor_role <> 'admin' then
    raise exception 'Only an admin can resolve a report about a moderator or admin'
      using errcode = '42501';
  end if;

  if v_report.status <> 'open' then
    if v_report.status = p_status then
      select rr.mod_log_id into v_log_id
      from public.report_resolutions rr
      where rr.report_id = p_report_id;

      return query select false, v_log_id;
      return;
    end if;

    raise exception 'This report has already been handled'
      using errcode = '22023';
  end if;

  v_log_id := kaluwo_private.write_mod_log(
    case
      when p_status = 'resolved' then 'report.resolve'::public.mod_action
      else 'report.dismiss'::public.mod_action
    end,
    'report'::public.mod_target_type,
    p_report_id::text,
    'report #' || p_report_id::text,
    v_note,
    jsonb_build_object('status', v_report.status),
    jsonb_build_object('status', p_status)
  );

  insert into public.report_resolutions (
    report_id,
    resolved_by,
    resolution_note,
    mod_log_id
  )
  values (
    p_report_id,
    v_actor,
    v_note,
    v_log_id
  );

  update public.reports
  set status = p_status
  where id = p_report_id;

  v_changed := true;

  return query select v_changed, v_log_id;
end;
$$;

revoke all on function public.staff_resolve_report(
  bigint, public.report_status, text
) from public, anon, authenticated;
grant execute on function public.staff_resolve_report(
  bigint, public.report_status, text
) to authenticated;

comment on function public.staff_resolve_report(
  bigint, public.report_status, text
) is
  'Resolves or dismisses an open report, writes the staff-only resolution row and the mod log in one transaction.';

commit;
