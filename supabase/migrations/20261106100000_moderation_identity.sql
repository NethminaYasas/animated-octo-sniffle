-- Phase 2: roles, effective bans, member-facing moderation records and the
-- append-only moderation log.
--
-- Staff writes are deliberately RPC-only from this phase onward. The
-- authenticated role gets no UPDATE/DELETE on profiles, and the staff action
-- RPCs in later migrations are SECURITY DEFINER functions that verify the
-- caller's live role from public.profiles.

begin;

-- ---------------------------------------------------------------------------
-- Effective ban state
--
-- profiles.is_banned stays the flag. banned_until is the optional expiry. A
-- ban is effective only while it is set and not expired. All RLS helpers use
-- this same expression, so an expiry takes effect on the next statement with
-- no cron job.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column banned_until timestamptz;

create or replace function public.is_banned()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select p.is_banned
      and (p.banned_until is null or p.banned_until > now())
    from public.profiles p
    where p.id = (select auth.uid())
  ), false);
$$;

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('moderator', 'admin')
      and not (
        p.is_banned
        and (p.banned_until is null or p.banned_until > now())
      )
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and not (
        p.is_banned
        and (p.banned_until is null or p.banned_until > now())
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Member-facing ban and warning history
--
-- The base tables contain the issuing moderator and are staff-only. Members
-- read safe views that omit the moderator identity and expose only their own
-- rows.
-- ---------------------------------------------------------------------------
create table public.member_bans (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  banned_by uuid references public.profiles (id) on delete set null,
  reason text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references public.profiles (id) on delete set null,
  lift_reason text,
  constraint member_bans_reason_length
    check (char_length(reason) between 1 and 1000),
  constraint member_bans_lift_reason_length
    check (lift_reason is null or char_length(lift_reason) between 1 and 1000)
);

create index member_bans_user_idx
  on public.member_bans (user_id, created_at desc);

alter table public.member_bans enable row level security;

create policy "staff can read member bans"
  on public.member_bans for select to authenticated
  using (public.is_moderator());

revoke all on table public.member_bans from anon, authenticated;
revoke all on sequence public.member_bans_id_seq from anon, authenticated;
grant select on table public.member_bans to authenticated;
grant all on table public.member_bans to service_role;
grant usage, select on sequence public.member_bans_id_seq to service_role;

create or replace view public.my_bans
with (security_invoker = false, security_barrier = true)
as
select
  b.id,
  b.user_id,
  b.reason,
  b.expires_at,
  b.created_at,
  b.lifted_at,
  b.lift_reason
from public.member_bans b
where b.user_id = (select auth.uid());

revoke all on public.my_bans from public, anon, authenticated;
grant select on public.my_bans to authenticated;

comment on view public.my_bans is
  'A member''s own ban history without the issuing moderator identity.';

create table public.member_warnings (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  moderator_id uuid references public.profiles (id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  constraint member_warnings_reason_length
    check (char_length(reason) between 1 and 1000)
);

create index member_warnings_user_idx
  on public.member_warnings (user_id, created_at desc);

alter table public.member_warnings enable row level security;

create policy "staff can read member warnings"
  on public.member_warnings for select to authenticated
  using (public.is_moderator());

revoke all on table public.member_warnings from anon, authenticated;
revoke all on sequence public.member_warnings_id_seq from anon, authenticated;
grant select on table public.member_warnings to authenticated;
grant all on table public.member_warnings to service_role;
grant usage, select on sequence public.member_warnings_id_seq to service_role;

create or replace view public.my_warnings
with (security_invoker = false, security_barrier = true)
as
select
  w.id,
  w.user_id,
  w.reason,
  w.created_at,
  w.acknowledged_at
from public.member_warnings w
where w.user_id = (select auth.uid());

revoke all on public.my_warnings from public, anon, authenticated;
grant select on public.my_warnings to authenticated;

comment on view public.my_warnings is
  'A member''s own warnings without the issuing moderator identity.';

create or replace function public.acknowledge_warning(p_warning_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_updated integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.member_warnings
  set acknowledged_at = now()
  where id = p_warning_id
    and user_id = v_uid
    and acknowledged_at is null;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.acknowledge_warning(bigint)
  from public, anon, authenticated;
grant execute on function public.acknowledge_warning(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Append-only moderation log
-- ---------------------------------------------------------------------------
create type public.mod_action as enum (
  'post.delete',
  'post.restore',
  'thread.delete',
  'thread.restore',
  'thread.lock',
  'thread.unlock',
  'thread.pin',
  'thread.unpin',
  'thread.move',
  'user.ban',
  'user.unban',
  'user.warn',
  'role.change',
  'report.resolve',
  'report.dismiss',
  'invite.create',
  'invite.revoke'
);

create type public.mod_target_type as enum (
  'post',
  'thread',
  'user',
  'report',
  'invite'
);

create table public.mod_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_username text not null,
  action public.mod_action not null,
  target_type public.mod_target_type not null,
  target_id text not null,
  target_label text not null default '',
  reason text not null,
  previous_value jsonb not null default '{}'::jsonb,
  new_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint mod_log_actor_username_length
    check (char_length(actor_username) between 1 and 20),
  constraint mod_log_target_label_length
    check (char_length(target_label) <= 300),
  constraint mod_log_reason_length
    check (char_length(reason) between 1 and 1000),
  constraint mod_log_previous_object
    check (jsonb_typeof(previous_value) = 'object'),
  constraint mod_log_new_object
    check (jsonb_typeof(new_value) = 'object')
);

create index mod_log_created_at_idx
  on public.mod_log (created_at desc);
create index mod_log_actor_idx
  on public.mod_log (actor_id, created_at desc);
create index mod_log_target_idx
  on public.mod_log (target_type, target_id, created_at desc);
create index mod_log_action_idx
  on public.mod_log (action, created_at desc);

alter table public.mod_log enable row level security;

create policy "staff can read the moderation log"
  on public.mod_log for select to authenticated
  using (public.is_moderator());

revoke all on table public.mod_log from anon, authenticated;
revoke all on sequence public.mod_log_id_seq from anon, authenticated;
grant select on table public.mod_log to authenticated;
grant all on table public.mod_log to service_role;
grant usage, select on sequence public.mod_log_id_seq to service_role;

comment on table public.mod_log is
  'Append-only moderation audit log. Staff can read; no API role can insert, update or delete directly.';

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create or replace function kaluwo_private.assert_staff()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.user_role;
  v_banned boolean;
  v_until timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select p.role, p.is_banned, p.banned_until
  into v_role, v_banned, v_until
  from public.profiles p
  where p.id = v_uid;

  if not found then
    raise exception 'Profile not found' using errcode = '42501';
  end if;

  if v_role not in ('moderator', 'admin')
     or (v_banned and (v_until is null or v_until > now())) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  return v_uid;
end;
$$;

create or replace function kaluwo_private.assert_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := kaluwo_private.assert_staff();
  v_role public.user_role;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = v_uid;

  if v_role <> 'admin' then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return v_uid;
end;
$$;

create or replace function kaluwo_private.lock_admin_changes()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  select pg_advisory_xact_lock(hashtext('kaluwo:admin-changes'));
$$;

create or replace function kaluwo_private.require_reason(p_reason text)
returns text
language plpgsql
immutable
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v_reason) < 1 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  if char_length(v_reason) > 1000 then
    raise exception 'The reason must be 1000 characters or fewer'
      using errcode = '22023';
  end if;

  return v_reason;
end;
$$;

create or replace function kaluwo_private.count_other_active_admins(p_exclude uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
  from public.profiles p
  where p.role = 'admin'
    and p.id <> p_exclude
    and not (
      p.is_banned
      and (p.banned_until is null or p.banned_until > now())
    );
$$;

create or replace function kaluwo_private.assert_can_moderate_profile(p_target uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_role public.user_role;
  v_actor_banned boolean;
  v_actor_until timestamptz;
  v_target_role public.user_role;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select p.role, p.is_banned, p.banned_until
  into v_actor_role, v_actor_banned, v_actor_until
  from public.profiles p
  where p.id = v_actor;

  if not found then
    raise exception 'Profile not found' using errcode = '42501';
  end if;

  if v_actor_role not in ('moderator', 'admin')
     or (v_actor_banned and (v_actor_until is null or v_actor_until > now())) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  if p_target is null then
    return;
  end if;

  if p_target = v_actor then
    return;
  end if;

  select p.role into v_target_role
  from public.profiles p
  where p.id = p_target;

  if not found then
    raise exception 'Target profile not found' using errcode = 'P0002';
  end if;

  if v_actor_role = 'admin' then
    return;
  end if;

  if v_target_role in ('moderator', 'admin') then
    raise exception 'Moderators cannot act on admins or other moderators'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function kaluwo_private.write_mod_log(
  p_action public.mod_action,
  p_target_type public.mod_target_type,
  p_target_id text,
  p_target_label text,
  p_reason text,
  p_previous jsonb,
  p_new jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_username text;
  v_id bigint;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select p.username into v_username
  from public.profiles p
  where p.id = v_actor;

  if not found then
    raise exception 'Profile not found' using errcode = '42501';
  end if;

  insert into public.mod_log (
    actor_id,
    actor_username,
    action,
    target_type,
    target_id,
    target_label,
    reason,
    previous_value,
    new_value
  )
  values (
    v_actor,
    v_username,
    p_action,
    p_target_type,
    p_target_id,
    coalesce(p_target_label, ''),
    p_reason,
    coalesce(p_previous, '{}'::jsonb),
    coalesce(p_new, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function kaluwo_private.assert_staff()
  from public, anon, authenticated;
revoke all on function kaluwo_private.assert_admin()
  from public, anon, authenticated;
revoke all on function kaluwo_private.lock_admin_changes()
  from public, anon, authenticated;
revoke all on function kaluwo_private.require_reason(text)
  from public, anon, authenticated;
revoke all on function kaluwo_private.count_other_active_admins(uuid)
  from public, anon, authenticated;
revoke all on function kaluwo_private.assert_can_moderate_profile(uuid)
  from public, anon, authenticated;
revoke all on function kaluwo_private.write_mod_log(
  public.mod_action, public.mod_target_type, text, text, text, jsonb, jsonb
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Profile protection: live role checks, hierarchy, last-admin and ban rules
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'Profile id cannot be changed';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'created_at cannot be changed';
  end if;

  if new.role is distinct from old.role then
    if not public.is_admin() then
      raise exception 'Only admins can change roles';
    end if;

    if old.role = 'admin' and new.role <> 'admin' then
      perform kaluwo_private.lock_admin_changes();

      if kaluwo_private.count_other_active_admins(old.id) = 0 then
        raise exception 'At least one admin must remain';
      end if;
    end if;
  end if;

  if new.is_banned is distinct from old.is_banned
     or new.banned_until is distinct from old.banned_until then
    if not public.is_moderator() then
      raise exception 'Only moderators can ban users';
    end if;

    if new.is_banned and old.id = (select auth.uid()) then
      raise exception 'You cannot ban yourself';
    end if;

    if old.role = 'admin' then
      raise exception 'Admins cannot be banned';
    end if;

    if old.role = 'moderator' and not public.is_admin() then
      raise exception 'Moderators cannot act on other moderators';
    end if;

    if new.is_banned
       and new.banned_until is not null
       and new.banned_until <= now() then
      raise exception 'Ban expiry must be in the future';
    end if;

    if not new.is_banned and new.banned_until is not null then
      raise exception 'An unbanned member cannot have a ban expiry';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile grants and policies
-- ---------------------------------------------------------------------------
drop policy if exists "moderators can update any profile" on public.profiles;
drop policy if exists "admins can delete profiles" on public.profiles;
drop policy if exists "users can insert their own profile" on public.profiles;

create policy "users can insert their own profile"
  on public.profiles for insert to authenticated
  with check (
    id = (select auth.uid())
    and role = 'new_member'
    and is_banned = false
    and banned_until is null
    and reaction_score = 0
    and created_at = now()
  );

revoke update on public.profiles from authenticated;
grant update (username, avatar_url) on public.profiles to authenticated;

commit;
