-- Database-backed forum posting (Phase 1, part 1).
--
-- What this adds:
--   * threads.reply_count, kept correct by a trigger.
--   * an internal schema for helper functions that must not be exposed by
--     PostgREST. RLS policies can still call them; browser clients cannot.
--   * list_threads(), a cursor-paginated read function.
--   * create_thread(), an atomic thread + opening-post write function that
--     still runs with the caller's privileges, so RLS remains the gate.
--   * tighter posts policies: posts in a soft-deleted thread are hidden,
--     direct inserts cannot create a duplicate opening post, and comments are
--     only accepted in threads that have an active opening post.
--
-- Cursor pagination uses (last_post_at, id) for "latest" and
-- (created_at, id) for "new". No OFFSET is used.
--
-- Direct PostgREST inserts remain possible under RLS by design. They skip the
-- server action's Turnstile check, pre-storage sanitize-html pass and app-level
-- length check, but RLS, database constraints and the render-time
-- rehype-sanitize gate still apply. See README known limitations.

begin;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create schema if not exists kaluwo_private;

revoke all on schema kaluwo_private from public;
grant usage on schema kaluwo_private to authenticated;

-- True when the thread has no posts at all, including soft-deleted ones.
-- SECURITY DEFINER so the posts INSERT policy can see every row, not only the
-- rows visible through the posts SELECT policy.
create or replace function kaluwo_private.thread_has_no_posts(p_thread_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not exists (
    select 1
    from public.posts p
    where p.thread_id = p_thread_id
  );
$$;

revoke all on function kaluwo_private.thread_has_no_posts(bigint)
  from public, anon, authenticated;
grant execute on function kaluwo_private.thread_has_no_posts(bigint)
  to authenticated;

-- True when the thread has an active opening post. Comments are only allowed
-- in threads that have one, so a directly inserted empty thread cannot collect
-- invisible replies.
create or replace function kaluwo_private.thread_has_opening_post(p_thread_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.posts p
    where p.thread_id = p_thread_id
      and p.is_opening
      and not p.is_deleted
  );
$$;

revoke all on function kaluwo_private.thread_has_opening_post(bigint)
  from public, anon, authenticated;
grant execute on function kaluwo_private.thread_has_opening_post(bigint)
  to authenticated;

comment on function kaluwo_private.thread_has_no_posts(bigint) is
  'RLS helper: true when a thread has no posts, including soft-deleted posts.';
comment on function kaluwo_private.thread_has_opening_post(bigint) is
  'RLS helper: true when a thread has an active opening post.';

-- ---------------------------------------------------------------------------
-- Reply count
-- ---------------------------------------------------------------------------
alter table public.threads
  add column reply_count integer not null default 0;

alter table public.threads
  add constraint threads_reply_count_nonnegative check (reply_count >= 0);

update public.threads t
set reply_count = (
  select count(*)::integer
  from public.posts p
  where p.thread_id = t.id
    and not p.is_opening
    and not p.is_deleted
);

create or replace function kaluwo_private.refresh_thread_reply_count(p_thread_id bigint)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.threads t
  set reply_count = (
    select count(*)::integer
    from public.posts p
    where p.thread_id = t.id
      and not p.is_opening
      and not p.is_deleted
  )
  where t.id = p_thread_id;
$$;

revoke all on function kaluwo_private.refresh_thread_reply_count(bigint)
  from public, anon, authenticated;

create or replace function kaluwo_private.posts_refresh_thread_reply_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform kaluwo_private.refresh_thread_reply_count(old.thread_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform kaluwo_private.refresh_thread_reply_count(new.thread_id);
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function kaluwo_private.posts_refresh_thread_reply_count()
  from public, anon, authenticated;

drop trigger if exists posts_refresh_thread_reply_count on public.posts;

create trigger posts_refresh_thread_reply_count
  after insert or delete or update of is_deleted, is_opening, thread_id
  on public.posts
  for each row execute function kaluwo_private.posts_refresh_thread_reply_count();

-- ---------------------------------------------------------------------------
-- Cursor indexes
-- ---------------------------------------------------------------------------
create index if not exists threads_activity_cursor_idx
  on public.threads (last_post_at desc, id desc)
  where not is_deleted;

create index if not exists threads_board_activity_cursor_idx
  on public.threads (board_id, last_post_at desc, id desc)
  where not is_deleted;

create index if not exists threads_created_cursor_idx
  on public.threads (created_at desc, id desc)
  where not is_deleted;

create index if not exists posts_thread_visible_idx
  on public.posts (thread_id, created_at, id)
  where not is_deleted;

-- ---------------------------------------------------------------------------
-- RLS changes
-- ---------------------------------------------------------------------------

-- Thread creation keeps the existing member/banned checks, but a caller may
-- not seed the reply counter. The counter is maintained by the trigger above.
drop policy if exists "members can start threads" on public.threads;

create policy "members can start threads"
  on public.threads for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and not public.is_banned()
    and not is_pinned
    and not is_locked
    and not is_deleted
    and reply_count = 0
  );

-- A post is only readable while its thread is readable. The old policy only
-- checked that the thread row existed, so posts in a soft-deleted thread
-- remained visible.
drop policy if exists "posts are public unless deleted" on public.posts;

create policy "posts are public unless deleted"
  on public.posts for select
  using (
    (
      not is_deleted
      or author_id = (select auth.uid())
      or public.is_moderator()
    )
    and exists (
      select 1
      from public.threads t
      where t.id = thread_id
        and (
          not t.is_deleted
          or t.author_id = (select auth.uid())
          or public.is_moderator()
        )
    )
  );

-- Direct inserts are comments only. The opening post is created by
-- create_thread() in the same transaction as its thread. The helper calls are
-- schema-qualified and live in a non-exposed schema.
--
-- Concurrency note: the initial schema already has the partial unique index
-- posts_one_opening_per_thread on posts (thread_id) where is_opening. Two
-- simultaneous opening-post inserts therefore cannot both commit; one gets a
-- unique violation.
drop policy if exists "members can create posts" on public.posts;

create policy "members can create posts"
  on public.posts for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and not public.is_banned()
    and not is_deleted
    and edited_at is null
    and exists (
      select 1
      from public.threads t
      where t.id = thread_id
        and not t.is_locked
        and not t.is_deleted
        and (
          (
            is_opening
            and t.author_id = (select auth.uid())
            and kaluwo_private.thread_has_no_posts(t.id)
          )
          or (
            not is_opening
            and kaluwo_private.thread_has_opening_post(t.id)
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Atomic thread + opening post
--
-- SECURITY INVOKER on purpose: both inserts are still checked by the thread
-- and post RLS policies above. Because the two writes share one transaction,
-- a failed opening post leaves no empty thread behind.
-- ---------------------------------------------------------------------------
create or replace function public.create_thread(
  p_board_id text,
  p_title text,
  p_content text
)
returns table (thread_id bigint, post_id bigint)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_thread_id bigint;
  v_post_id bigint;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  insert into public.threads (board_id, author_id, title)
  values (p_board_id, v_uid, trim(p_title))
  returning id into v_thread_id;

  insert into public.posts (thread_id, author_id, content, is_opening)
  values (v_thread_id, v_uid, p_content, true)
  returning id into v_post_id;

  return query select v_thread_id, v_post_id;
end;
$$;

revoke all on function public.create_thread(text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_thread(text, text, text)
  to authenticated;

comment on function public.create_thread(text, text, text) is
  'Creates a thread and its opening post atomically with the caller''s RLS privileges.';

-- ---------------------------------------------------------------------------
-- Cursor-paginated thread list
--
-- Threads with no active opening post are hidden. This covers the case where
-- a client inserts a thread row directly instead of calling create_thread().
-- ---------------------------------------------------------------------------
create or replace function public.list_threads(
  p_board_id text default null,
  p_sort text default 'latest',
  p_before_at timestamptz default null,
  p_before_id bigint default null,
  p_limit integer default 20
)
returns table (
  id bigint,
  board_id text,
  board_name text,
  title text,
  author_id uuid,
  author_username text,
  created_at timestamptz,
  last_post_at timestamptz,
  reply_count integer,
  is_locked boolean,
  is_pinned boolean
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_sort text := case
    when lower(coalesce(p_sort, 'latest')) = 'new' then 'new'
    else 'latest'
  end;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if v_sort = 'new' then
    return query
      select
        t.id,
        t.board_id,
        b.name,
        t.title,
        t.author_id,
        pr.username,
        t.created_at,
        t.last_post_at,
        t.reply_count,
        t.is_locked,
        t.is_pinned
      from public.threads t
      join public.boards b on b.id = t.board_id
      left join public.profiles pr on pr.id = t.author_id
      where not t.is_deleted
        and (p_board_id is null or t.board_id = p_board_id)
        and exists (
          select 1
          from public.posts p
          where p.thread_id = t.id
            and p.is_opening
            and not p.is_deleted
        )
        and (
          p_before_at is null
          or (t.created_at, t.id) < (
            p_before_at,
            coalesce(p_before_id, 9223372036854775807)
          )
        )
      order by t.created_at desc, t.id desc
      limit v_limit;
  else
    return query
      select
        t.id,
        t.board_id,
        b.name,
        t.title,
        t.author_id,
        pr.username,
        t.created_at,
        t.last_post_at,
        t.reply_count,
        t.is_locked,
        t.is_pinned
      from public.threads t
      join public.boards b on b.id = t.board_id
      left join public.profiles pr on pr.id = t.author_id
      where not t.is_deleted
        and (p_board_id is null or t.board_id = p_board_id)
        and exists (
          select 1
          from public.posts p
          where p.thread_id = t.id
            and p.is_opening
            and not p.is_deleted
        )
        and (
          p_before_at is null
          or (t.last_post_at, t.id) < (
            p_before_at,
            coalesce(p_before_id, 9223372036854775807)
          )
        )
      order by t.last_post_at desc, t.id desc
      limit v_limit;
  end if;
end;
$$;

revoke all on function public.list_threads(text, text, timestamptz, bigint, integer)
  from public;
grant execute on function public.list_threads(text, text, timestamptz, bigint, integer)
  to anon, authenticated;

comment on function public.list_threads(text, text, timestamptz, bigint, integer) is
  'Cursor-paginated thread list for the latest-activity and newest sorts.';

commit;
