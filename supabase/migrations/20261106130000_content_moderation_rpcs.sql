-- Phase 2: audited staff actions on threads and posts.
--
-- Every function verifies the caller's live role from public.profiles, applies
-- the hierarchy rule, requires a reason, writes the state change and the
-- append-only mod-log row in one transaction, and returns whether anything
-- changed. Repeating the same state is a no-op.

begin;

create or replace function public.moderate_set_post_deleted(
  p_post_id bigint,
  p_deleted boolean,
  p_reason text
)
returns table (changed boolean, mod_log_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_reason text;
  v_author uuid;
  v_is_deleted boolean;
  v_log_id bigint;
begin
  v_actor := kaluwo_private.assert_staff();
  v_reason := kaluwo_private.require_reason(p_reason);

  select p.author_id, p.is_deleted
  into v_author, v_is_deleted
  from public.posts p
  where p.id = p_post_id
  for update;

  if not found then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;

  if v_is_deleted = p_deleted then
    return query select false, null::bigint;
    return;
  end if;

  perform kaluwo_private.assert_can_moderate_profile(v_author);

  update public.posts
  set
    is_deleted = p_deleted,
    deleted_reason = case when p_deleted then v_reason else null end,
    deleted_by = case when p_deleted then v_actor else null end,
    deleted_at = case when p_deleted then now() else null end
  where id = p_post_id;

  v_log_id := kaluwo_private.write_mod_log(
    case
      when p_deleted then 'post.delete'::public.mod_action
      else 'post.restore'::public.mod_action
    end,
    'post'::public.mod_target_type,
    p_post_id::text,
    'post #' || p_post_id::text,
    v_reason,
    jsonb_build_object('is_deleted', v_is_deleted),
    jsonb_build_object('is_deleted', p_deleted)
  );

  return query select true, v_log_id;
end;
$$;

create or replace function public.moderate_set_thread_deleted(
  p_thread_id bigint,
  p_deleted boolean,
  p_reason text
)
returns table (changed boolean, mod_log_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_reason text;
  v_author uuid;
  v_title text;
  v_is_deleted boolean;
  v_log_id bigint;
begin
  v_actor := kaluwo_private.assert_staff();
  v_reason := kaluwo_private.require_reason(p_reason);

  select t.author_id, t.title, t.is_deleted
  into v_author, v_title, v_is_deleted
  from public.threads t
  where t.id = p_thread_id
  for update;

  if not found then
    raise exception 'Thread not found' using errcode = 'P0002';
  end if;

  if v_is_deleted = p_deleted then
    return query select false, null::bigint;
    return;
  end if;

  perform kaluwo_private.assert_can_moderate_profile(v_author);

  update public.threads
  set
    is_deleted = p_deleted,
    deleted_reason = case when p_deleted then v_reason else null end,
    deleted_by = case when p_deleted then v_actor else null end,
    deleted_at = case when p_deleted then now() else null end
  where id = p_thread_id;

  v_log_id := kaluwo_private.write_mod_log(
    case
      when p_deleted then 'thread.delete'::public.mod_action
      else 'thread.restore'::public.mod_action
    end,
    'thread'::public.mod_target_type,
    p_thread_id::text,
    v_title,
    v_reason,
    jsonb_build_object('is_deleted', v_is_deleted),
    jsonb_build_object('is_deleted', p_deleted)
  );

  return query select true, v_log_id;
end;
$$;

create or replace function public.moderate_set_thread_locked(
  p_thread_id bigint,
  p_locked boolean,
  p_reason text
)
returns table (changed boolean, mod_log_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_reason text;
  v_author uuid;
  v_title text;
  v_is_locked boolean;
  v_log_id bigint;
begin
  v_actor := kaluwo_private.assert_staff();
  v_reason := kaluwo_private.require_reason(p_reason);

  select t.author_id, t.title, t.is_locked
  into v_author, v_title, v_is_locked
  from public.threads t
  where t.id = p_thread_id
  for update;

  if not found then
    raise exception 'Thread not found' using errcode = 'P0002';
  end if;

  if v_is_locked = p_locked then
    return query select false, null::bigint;
    return;
  end if;

  perform kaluwo_private.assert_can_moderate_profile(v_author);

  update public.threads
  set is_locked = p_locked
  where id = p_thread_id;

  v_log_id := kaluwo_private.write_mod_log(
    case
      when p_locked then 'thread.lock'::public.mod_action
      else 'thread.unlock'::public.mod_action
    end,
    'thread'::public.mod_target_type,
    p_thread_id::text,
    v_title,
    v_reason,
    jsonb_build_object('is_locked', v_is_locked),
    jsonb_build_object('is_locked', p_locked)
  );

  return query select true, v_log_id;
end;
$$;

create or replace function public.moderate_set_thread_pinned(
  p_thread_id bigint,
  p_pinned boolean,
  p_reason text
)
returns table (changed boolean, mod_log_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_reason text;
  v_author uuid;
  v_title text;
  v_is_pinned boolean;
  v_log_id bigint;
begin
  v_actor := kaluwo_private.assert_staff();
  v_reason := kaluwo_private.require_reason(p_reason);

  select t.author_id, t.title, t.is_pinned
  into v_author, v_title, v_is_pinned
  from public.threads t
  where t.id = p_thread_id
  for update;

  if not found then
    raise exception 'Thread not found' using errcode = 'P0002';
  end if;

  if v_is_pinned = p_pinned then
    return query select false, null::bigint;
    return;
  end if;

  perform kaluwo_private.assert_can_moderate_profile(v_author);

  update public.threads
  set is_pinned = p_pinned
  where id = p_thread_id;

  v_log_id := kaluwo_private.write_mod_log(
    case
      when p_pinned then 'thread.pin'::public.mod_action
      else 'thread.unpin'::public.mod_action
    end,
    'thread'::public.mod_target_type,
    p_thread_id::text,
    v_title,
    v_reason,
    jsonb_build_object('is_pinned', v_is_pinned),
    jsonb_build_object('is_pinned', p_pinned)
  );

  return query select true, v_log_id;
end;
$$;

create or replace function public.moderate_move_thread(
  p_thread_id bigint,
  p_board_id text,
  p_reason text
)
returns table (changed boolean, mod_log_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_reason text;
  v_author uuid;
  v_title text;
  v_old_board text;
  v_log_id bigint;
begin
  v_actor := kaluwo_private.assert_staff();
  v_reason := kaluwo_private.require_reason(p_reason);

  if not exists (
    select 1 from public.boards b where b.id = p_board_id
  ) then
    raise exception 'Board not found' using errcode = 'P0002';
  end if;

  select t.author_id, t.title, t.board_id
  into v_author, v_title, v_old_board
  from public.threads t
  where t.id = p_thread_id
  for update;

  if not found then
    raise exception 'Thread not found' using errcode = 'P0002';
  end if;

  if v_old_board = p_board_id then
    return query select false, null::bigint;
    return;
  end if;

  perform kaluwo_private.assert_can_moderate_profile(v_author);

  update public.threads
  set board_id = p_board_id
  where id = p_thread_id;

  v_log_id := kaluwo_private.write_mod_log(
    'thread.move'::public.mod_action,
    'thread'::public.mod_target_type,
    p_thread_id::text,
    v_title,
    v_reason,
    jsonb_build_object('board_id', v_old_board),
    jsonb_build_object('board_id', p_board_id)
  );

  return query select true, v_log_id;
end;
$$;

revoke all on function public.moderate_set_post_deleted(bigint, boolean, text)
  from public, anon, authenticated;
revoke all on function public.moderate_set_thread_deleted(bigint, boolean, text)
  from public, anon, authenticated;
revoke all on function public.moderate_set_thread_locked(bigint, boolean, text)
  from public, anon, authenticated;
revoke all on function public.moderate_set_thread_pinned(bigint, boolean, text)
  from public, anon, authenticated;
revoke all on function public.moderate_move_thread(bigint, text, text)
  from public, anon, authenticated;

grant execute on function public.moderate_set_post_deleted(bigint, boolean, text)
  to authenticated;
grant execute on function public.moderate_set_thread_deleted(bigint, boolean, text)
  to authenticated;
grant execute on function public.moderate_set_thread_locked(bigint, boolean, text)
  to authenticated;
grant execute on function public.moderate_set_thread_pinned(bigint, boolean, text)
  to authenticated;
grant execute on function public.moderate_move_thread(bigint, text, text)
  to authenticated;

comment on function public.moderate_set_post_deleted(bigint, boolean, text) is
  'Soft-deletes or restores a post with a required reason and one append-only mod-log row.';
comment on function public.moderate_set_thread_deleted(bigint, boolean, text) is
  'Soft-deletes or restores a thread with a required reason and one append-only mod-log row.';
comment on function public.moderate_set_thread_locked(bigint, boolean, text) is
  'Locks or unlocks a thread with a required reason and one append-only mod-log row.';
comment on function public.moderate_set_thread_pinned(bigint, boolean, text) is
  'Pins or unpins a thread with a required reason and one append-only mod-log row.';
comment on function public.moderate_move_thread(bigint, text, text) is
  'Moves a thread and records the old and new board ids in the mod log.';

commit;
