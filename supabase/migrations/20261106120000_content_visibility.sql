-- Phase 2: deleted-content visibility, pinned-first feed reads, cursor-based
-- comment pagination and per-page reaction summaries.
--
-- Staff moderation writes are RPC-only from this migration onward. Direct
-- UPDATE/DELETE on threads and posts is revoked from authenticated.

begin;

-- ---------------------------------------------------------------------------
-- Deletion metadata
-- ---------------------------------------------------------------------------
alter table public.threads
  add column deleted_reason text,
  add column deleted_by uuid references public.profiles (id) on delete set null,
  add column deleted_at timestamptz;

alter table public.threads
  add constraint threads_deleted_reason_length
  check (deleted_reason is null or char_length(deleted_reason) between 1 and 1000),
  add constraint threads_deletion_metadata_consistent
  check (
    is_deleted
    or (deleted_reason is null and deleted_by is null and deleted_at is null)
  );

alter table public.posts
  add column deleted_reason text,
  add column deleted_by uuid references public.profiles (id) on delete set null,
  add column deleted_at timestamptz;

alter table public.posts
  add constraint posts_deleted_reason_length
  check (deleted_reason is null or char_length(deleted_reason) between 1 and 1000),
  add constraint posts_deletion_metadata_consistent
  check (
    is_deleted
    or (deleted_reason is null and deleted_by is null and deleted_at is null)
  );

-- Lock the thread row before recounting. A concurrent comment insert must not
-- count from a snapshot taken before it waited on the thread row lock.
create or replace function kaluwo_private.refresh_thread_reply_count(p_thread_id bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform 1
  from public.threads t
  where t.id = p_thread_id
  for update;

  update public.threads t
  set reply_count = (
    select count(*)::integer
    from public.posts p
    where p.thread_id = t.id
      and not p.is_opening
      and not p.is_deleted
  )
  where t.id = p_thread_id;
end;
$$;

revoke all on function kaluwo_private.refresh_thread_reply_count(bigint)
  from public, anon, authenticated;

comment on function kaluwo_private.refresh_thread_reply_count(bigint) is
  'Recounts replies after locking the thread row, so concurrent comments cannot lose counter updates.';

-- ---------------------------------------------------------------------------
-- Visibility: members only see active content; staff see deleted rows.
-- ---------------------------------------------------------------------------
drop policy if exists "threads are public unless deleted" on public.threads;

create policy "threads are public unless deleted"
  on public.threads for select
  using (not is_deleted or public.is_moderator());

drop policy if exists "posts are public unless deleted" on public.posts;

create policy "posts are public unless deleted"
  on public.posts for select
  using (
    (not is_deleted or public.is_moderator())
    and exists (
      select 1
      from public.threads t
      where t.id = thread_id
        and (not t.is_deleted or public.is_moderator())
    )
  );

-- Staff actions now go through the audited RPCs. Direct moderator writes would
-- bypass the append-only mod log, so remove them entirely.
drop policy if exists "moderators can update threads" on public.threads;
drop policy if exists "moderators can delete threads" on public.threads;
drop policy if exists "authors and moderators can update posts" on public.posts;
drop policy if exists "moderators can delete posts" on public.posts;

revoke update, delete on public.threads from authenticated;
revoke update, delete on public.posts from authenticated;

-- ---------------------------------------------------------------------------
-- Pinned-first feed indexes
-- ---------------------------------------------------------------------------
create index if not exists threads_pinned_activity_idx
  on public.threads (is_pinned, last_post_at desc, id desc)
  where not is_deleted;

create index if not exists threads_board_pinned_activity_idx
  on public.threads (board_id, is_pinned, last_post_at desc, id desc)
  where not is_deleted;

create index if not exists threads_pinned_created_idx
  on public.threads (is_pinned, created_at desc, id desc)
  where not is_deleted;

create index if not exists threads_board_pinned_created_idx
  on public.threads (board_id, is_pinned, created_at desc, id desc)
  where not is_deleted;

-- ---------------------------------------------------------------------------
-- Thread list with a separate pinned section
--
-- The pinned section calls p_pinned = true without a cursor. The main feed
-- calls p_pinned = false with a normal (last_post_at, id) or (created_at, id)
-- cursor. Pin/unpin changes therefore cannot corrupt the main cursor.
-- ---------------------------------------------------------------------------
drop function if exists public.list_threads(text, text, timestamptz, bigint, integer);

create or replace function public.list_threads(
  p_board_id text default null,
  p_sort text default 'latest',
  p_before_at timestamptz default null,
  p_before_id bigint default null,
  p_limit integer default 20,
  p_pinned boolean default null
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
  if p_pinned is null and p_before_at is not null then
    raise exception 'p_pinned is required with a cursor' using errcode = '22023';
  end if;

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
        and (p_pinned is null or t.is_pinned = p_pinned)
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
      order by t.is_pinned desc, t.created_at desc, t.id desc
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
        and (p_pinned is null or t.is_pinned = p_pinned)
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
      order by t.is_pinned desc, t.last_post_at desc, t.id desc
      limit v_limit;
  end if;
end;
$$;

revoke all on function public.list_threads(
  text, text, timestamptz, bigint, integer, boolean
) from public;
grant execute on function public.list_threads(
  text, text, timestamptz, bigint, integer, boolean
) to anon, authenticated;

comment on function public.list_threads(
  text, text, timestamptz, bigint, integer, boolean
) is
  'Cursor-paginated thread list. Use p_pinned = true for the pinned section and p_pinned = false for the main feed.';

-- ---------------------------------------------------------------------------
-- Comment pagination
-- ---------------------------------------------------------------------------
create or replace function public.list_thread_comments(
  p_thread_id bigint,
  p_after_at timestamptz default null,
  p_after_id bigint default null,
  p_limit integer default 50
)
returns table (
  id bigint,
  author_id uuid,
  author_username text,
  content text,
  created_at timestamptz,
  reply_to_post_id bigint,
  reply_to_author_username text,
  is_deleted boolean,
  deleted_reason text,
  deleted_by_username text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.author_id,
    a.username,
    p.content,
    p.created_at,
    p.reply_to_post_id,
    ra.username,
    p.is_deleted,
    p.deleted_reason,
    d.username
  from public.posts p
  left join public.profiles a on a.id = p.author_id
  left join public.posts rp on rp.id = p.reply_to_post_id
  left join public.profiles ra on ra.id = rp.author_id
  left join public.profiles d on d.id = p.deleted_by
  where p.thread_id = p_thread_id
    and not p.is_opening
    and (
      p_after_at is null
      or (p.created_at, p.id) > (p_after_at, coalesce(p_after_id, 0))
    )
  order by p.created_at asc, p.id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.list_thread_comments(
  bigint, timestamptz, bigint, integer
) from public;
grant execute on function public.list_thread_comments(
  bigint, timestamptz, bigint, integer
) to anon, authenticated;

comment on function public.list_thread_comments(
  bigint, timestamptz, bigint, integer
) is
  'Cursor-paginated comments for one thread. RLS hides soft-deleted rows from members and exposes them to staff.';

-- ---------------------------------------------------------------------------
-- Per-page reaction summaries
-- ---------------------------------------------------------------------------
create or replace function public.post_reaction_summary(p_post_ids bigint[])
returns table (
  post_id bigint,
  kind public.reaction_kind,
  total bigint,
  mine boolean
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    r.post_id,
    r.kind,
    count(*)::bigint as total,
    coalesce(
      bool_or(r.user_id = (select auth.uid())),
      false
    ) as mine
  from public.reactions r
  join public.posts p on p.id = r.post_id
  where p.id = any(p_post_ids[1:200])
    and not p.is_deleted
  group by r.post_id, r.kind;
$$;

revoke all on function public.post_reaction_summary(bigint[]) from public;
grant execute on function public.post_reaction_summary(bigint[])
  to anon, authenticated;

comment on function public.post_reaction_summary(bigint[]) is
  'Reaction totals and the caller''s own reaction for a loaded comment page.';

commit;
