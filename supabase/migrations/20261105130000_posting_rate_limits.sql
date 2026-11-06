-- Per-member posting and commenting rate limits (Phase 1, part 3).
--
-- Enforcement lives in BEFORE INSERT triggers, so a direct PostgREST insert
-- cannot bypass the limit by skipping the server action. The counters use a
-- fixed window and an atomic INSERT ... ON CONFLICT ... WHERE used < limit
-- upsert. A new window gets a new primary-key row, so the counter resets when
-- the window expires.
--
-- AUDIT NOTE: the trigger cannot write security_events and then raise, because
-- the raise rolls the insert back. createThread()/createComment() catch the
-- rate-limit error and call recordSecurityEvent() instead. A direct PostgREST
-- insert is still rejected but produces no audit row; this is documented as a
-- known limitation.

begin;

create schema if not exists kaluwo_private;

revoke all on schema kaluwo_private from public;
grant usage on schema kaluwo_private to authenticated, service_role;

create table kaluwo_private.rate_limit_buckets (
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  used integer not null default 0,
  primary key (user_id, action, window_start),
  constraint rate_limit_buckets_action
    check (action in ('thread', 'comment')),
  constraint rate_limit_buckets_used_nonnegative check (used >= 0)
);

alter table kaluwo_private.rate_limit_buckets enable row level security;

revoke all on table kaluwo_private.rate_limit_buckets
  from public, anon, authenticated;
grant all on table kaluwo_private.rate_limit_buckets to service_role;

comment on table kaluwo_private.rate_limit_buckets is
  'Internal fixed-window posting counters. RLS enabled with no policies; only the SECURITY DEFINER trigger function uses it.';

-- ---------------------------------------------------------------------------
-- Atomic fixed-window counter
--
-- SECURITY DEFINER and not exposed: only the trigger functions call it. The
-- action name decides the limits, so a caller cannot choose its own limit.
-- ---------------------------------------------------------------------------
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
  v_limit integer;
  v_window integer;
  v_window_start timestamptz;
  v_used integer;
  v_retry integer;
begin
  -- Service role and the SQL editor have no auth.uid(). Migrations and
  -- administrative writes are not rate limited.
  if v_uid is null then
    return;
  end if;

  select p.role, p.is_banned
  into v_role, v_banned
  from public.profiles p
  where p.id = v_uid;

  if not found then
    raise exception 'Profile not found' using errcode = '42501';
  end if;

  if v_banned then
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
  else
    raise exception 'Unknown rate-limit action';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / v_window) * v_window
  );

  -- Cheap housekeeping for this member only. Old windows can never be used
  -- again because every new request computes the current window.
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

comment on function kaluwo_private.consume_posting_rate_limit(text) is
  'Atomic posting/commenting counter. Raises with hint kaluwo_rate_limited when the limit is reached.';

-- ---------------------------------------------------------------------------
-- Trigger wrappers
-- ---------------------------------------------------------------------------
create or replace function kaluwo_private.enforce_thread_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform kaluwo_private.consume_posting_rate_limit('thread');
  return new;
end;
$$;

revoke all on function kaluwo_private.enforce_thread_rate_limit()
  from public, anon, authenticated;

create or replace function kaluwo_private.enforce_post_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The opening post belongs to the thread attempt, which was already counted
  -- by the threads trigger. Only comments consume the comment bucket.
  if new.is_opening then
    return new;
  end if;

  perform kaluwo_private.consume_posting_rate_limit('comment');
  return new;
end;
$$;

revoke all on function kaluwo_private.enforce_post_rate_limit()
  from public, anon, authenticated;

drop trigger if exists enforce_thread_rate_limit on public.threads;

create trigger enforce_thread_rate_limit
  before insert on public.threads
  for each row execute function kaluwo_private.enforce_thread_rate_limit();

drop trigger if exists enforce_post_rate_limit on public.posts;

create trigger enforce_post_rate_limit
  before insert on public.posts
  for each row execute function kaluwo_private.enforce_post_rate_limit();

commit;
