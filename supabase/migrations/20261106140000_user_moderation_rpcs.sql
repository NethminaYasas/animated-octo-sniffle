-- Phase 2: audited bans, unbans, warnings and admin role changes.
--
-- admin_set_role and the ban/unban RPCs take a transaction-scoped advisory
-- lock before reading the admin set. Two admins cannot concurrently demote
-- each other into a zero-admin state.

begin;

create or replace function public.moderate_ban_user(
  p_target_id uuid,
  p_reason text,
  p_until timestamptz default null
)
returns table (changed boolean, mod_log_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_reason text;
  v_target_role public.user_role;
  v_target_username text;
  v_is_banned boolean;
  v_banned_until timestamptz;
  v_active_ban_id bigint;
  v_active_reason text;
  v_active_expires timestamptz;
  v_log_id bigint;
begin
  perform kaluwo_private.lock_admin_changes();
  v_actor := kaluwo_private.assert_staff();
  v_reason := kaluwo_private.require_reason(p_reason);

  if p_until is not null and p_until <= now() then
    raise exception 'Ban expiry must be in the future' using errcode = '22023';
  end if;

  select p.role, p.username, p.is_banned, p.banned_until
  into v_target_role, v_target_username, v_is_banned, v_banned_until
  from public.profiles p
  where p.id = p_target_id
  for update;

  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  if p_target_id = v_actor then
    raise exception 'You cannot ban yourself' using errcode = '42501';
  end if;

  if v_target_role = 'admin' then
    raise exception 'Admins cannot be banned' using errcode = '42501';
  end if;

  perform kaluwo_private.assert_can_moderate_profile(p_target_id);

  select b.id, b.reason, b.expires_at
  into v_active_ban_id, v_active_reason, v_active_expires
  from public.member_bans b
  where b.user_id = p_target_id
    and b.lifted_at is null
  order by b.created_at desc
  limit 1;

  if found
     and v_is_banned
     and (v_banned_until is null or v_banned_until > now())
     and btrim(v_active_reason) = v_reason
     and v_active_expires is not distinct from p_until then
    return query select false, null::bigint;
    return;
  end if;

  if v_active_ban_id is not null then
    update public.member_bans
    set
      lifted_at = now(),
      lifted_by = v_actor,
      lift_reason = 'Superseded by a new ban'
    where id = v_active_ban_id;
  end if;

  insert into public.member_bans (
    user_id,
    banned_by,
    reason,
    expires_at
  )
  values (
    p_target_id,
    v_actor,
    v_reason,
    p_until
  );

  update public.profiles
  set is_banned = true, banned_until = p_until
  where id = p_target_id;

  v_log_id := kaluwo_private.write_mod_log(
    'user.ban'::public.mod_action,
    'user'::public.mod_target_type,
    p_target_id::text,
    v_target_username,
    v_reason,
    jsonb_build_object(
      'is_banned', v_is_banned,
      'banned_until', v_banned_until
    ),
    jsonb_build_object(
      'is_banned', true,
      'banned_until', p_until
    )
  );

  return query select true, v_log_id;
end;
$$;

create or replace function public.moderate_unban_user(
  p_target_id uuid,
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
  v_target_role public.user_role;
  v_target_username text;
  v_is_banned boolean;
  v_banned_until timestamptz;
  v_has_active_ban boolean;
  v_log_id bigint;
begin
  perform kaluwo_private.lock_admin_changes();
  v_actor := kaluwo_private.assert_staff();
  v_reason := kaluwo_private.require_reason(p_reason);

  select p.role, p.username, p.is_banned, p.banned_until
  into v_target_role, v_target_username, v_is_banned, v_banned_until
  from public.profiles p
  where p.id = p_target_id
  for update;

  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  if v_target_role = 'admin' then
    raise exception 'Admins cannot be banned' using errcode = '42501';
  end if;

  perform kaluwo_private.assert_can_moderate_profile(p_target_id);

  select exists (
    select 1
    from public.member_bans b
    where b.user_id = p_target_id
      and b.lifted_at is null
  ) into v_has_active_ban;

  if not v_is_banned and not v_has_active_ban then
    return query select false, null::bigint;
    return;
  end if;

  update public.profiles
  set is_banned = false, banned_until = null
  where id = p_target_id;

  update public.member_bans
  set
    lifted_at = now(),
    lifted_by = v_actor,
    lift_reason = v_reason
  where user_id = p_target_id
    and lifted_at is null;

  v_log_id := kaluwo_private.write_mod_log(
    'user.unban'::public.mod_action,
    'user'::public.mod_target_type,
    p_target_id::text,
    v_target_username,
    v_reason,
    jsonb_build_object(
      'is_banned', v_is_banned,
      'banned_until', v_banned_until
    ),
    jsonb_build_object(
      'is_banned', false,
      'banned_until', null
    )
  );

  return query select true, v_log_id;
end;
$$;

create or replace function public.moderate_warn_user(
  p_target_id uuid,
  p_reason text
)
returns table (changed boolean, mod_log_id bigint, warning_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_reason text;
  v_target_role public.user_role;
  v_target_username text;
  v_existing_warning bigint;
  v_warning_id bigint;
  v_log_id bigint;
begin
  v_actor := kaluwo_private.assert_staff();
  v_reason := kaluwo_private.require_reason(p_reason);

  select p.role, p.username
  into v_target_role, v_target_username
  from public.profiles p
  where p.id = p_target_id
  for update;

  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  if p_target_id = v_actor then
    raise exception 'You cannot warn yourself' using errcode = '42501';
  end if;

  perform kaluwo_private.assert_can_moderate_profile(p_target_id);

  select w.id into v_existing_warning
  from public.member_warnings w
  where w.user_id = p_target_id
    and w.acknowledged_at is null
    and btrim(w.reason) = v_reason
  order by w.created_at desc
  limit 1;

  if v_existing_warning is not null then
    return query select false, null::bigint, v_existing_warning;
    return;
  end if;

  insert into public.member_warnings (
    user_id,
    moderator_id,
    reason
  )
  values (
    p_target_id,
    v_actor,
    v_reason
  )
  returning id into v_warning_id;

  v_log_id := kaluwo_private.write_mod_log(
    'user.warn'::public.mod_action,
    'user'::public.mod_target_type,
    p_target_id::text,
    v_target_username,
    v_reason,
    '{}'::jsonb,
    jsonb_build_object('warning_id', v_warning_id)
  );

  return query select true, v_log_id, v_warning_id;
end;
$$;

create or replace function public.admin_set_role(
  p_target_id uuid,
  p_role public.user_role,
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
  v_old_role public.user_role;
  v_target_username text;
  v_log_id bigint;
begin
  perform kaluwo_private.lock_admin_changes();
  v_actor := kaluwo_private.assert_admin();
  v_reason := kaluwo_private.require_reason(p_reason);

  if p_role not in ('member', 'moderator', 'admin') then
    raise exception 'Only member, moderator and admin roles can be set manually'
      using errcode = '22023';
  end if;

  select p.role, p.username
  into v_old_role, v_target_username
  from public.profiles p
  where p.id = p_target_id
  for update;

  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  if v_old_role = p_role then
    return query select false, null::bigint;
    return;
  end if;

  if v_old_role = 'admin' and p_role <> 'admin' then
    if kaluwo_private.count_other_active_admins(p_target_id) = 0 then
      raise exception 'At least one admin must remain' using errcode = '42501';
    end if;
  end if;

  update public.profiles
  set role = p_role
  where id = p_target_id;

  v_log_id := kaluwo_private.write_mod_log(
    'role.change'::public.mod_action,
    'user'::public.mod_target_type,
    p_target_id::text,
    v_target_username,
    v_reason,
    jsonb_build_object('role', v_old_role),
    jsonb_build_object('role', p_role)
  );

  return query select true, v_log_id;
end;
$$;

revoke all on function public.moderate_ban_user(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.moderate_unban_user(uuid, text)
  from public, anon, authenticated;
revoke all on function public.moderate_warn_user(uuid, text)
  from public, anon, authenticated;
revoke all on function public.admin_set_role(uuid, public.user_role, text)
  from public, anon, authenticated;

grant execute on function public.moderate_ban_user(uuid, text, timestamptz)
  to authenticated;
grant execute on function public.moderate_unban_user(uuid, text)
  to authenticated;
grant execute on function public.moderate_warn_user(uuid, text)
  to authenticated;
grant execute on function public.admin_set_role(uuid, public.user_role, text)
  to authenticated;

comment on function public.moderate_ban_user(uuid, text, timestamptz) is
  'Bans a member with a required reason and optional expiry, writes member ban history and the mod log atomically.';
comment on function public.moderate_unban_user(uuid, text) is
  'Lifts a ban with a required reason and writes the mod log atomically.';
comment on function public.moderate_warn_user(uuid, text) is
  'Warns a member with a required reason, stores the warning and writes the mod log atomically.';
comment on function public.admin_set_role(uuid, public.user_role, text) is
  'Admin-only role change with a required reason, last-admin protection and an advisory lock.';

commit;
