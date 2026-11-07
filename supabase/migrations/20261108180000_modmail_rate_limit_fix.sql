-- Phase 4: restore effective ban check in consume_posting_rate_limit
-- and add missing action handlers (report, moderation, upload).
--
-- Migration 20261108100000 replaced consume_posting_rate_limit but dropped
-- the effective-ban expiry check (v_banned_until > now()) and the 'report',
-- 'moderation' and 'upload' action handlers. This migration restores them
-- without editing the old migration.

begin;

begin;

-- ---------------------------------------------------------------------------
-- Add modmail_appeal to the rate-limit bucket check constraint
-- ---------------------------------------------------------------------------
alter table kaluwo_private.rate_limit_buckets
  drop constraint if exists rate_limit_buckets_action;

alter table kaluwo_private.rate_limit_buckets
  add constraint rate_limit_buckets_action
  check (action in ('thread', 'comment', 'report', 'modmail', 'modmail_staff', 'modmail_appeal', 'moderation', 'upload'));

-- ---------------------------------------------------------------------------
-- Restore consume_posting_rate_limit with effective ban check
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
  v_banned_until timestamptz;
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

  select p.role, p.is_banned, p.banned_until
  into v_role, v_banned, v_banned_until
  from public.profiles p
  where p.id = v_uid;

  if not found then
    raise exception 'Profile not found' using errcode = '42501';
  end if;

  -- Effective ban: is_banned flag AND not expired.
  -- Ban appeals (modmail_appeal) are exempt: they exist specifically for
  -- banned members to appeal their ban.
  if p_action <> 'modmail_appeal'
     and v_banned
     and (v_banned_until is null or v_banned_until > now()) then
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
  elsif p_action = 'modmail' then
    if v_role in ('moderator', 'admin') then
      v_limit := 30;
      v_window := 900;
    else
      v_limit := 10;
      v_window := 900;
    end if;
  elsif p_action = 'modmail_staff' then
    if v_role in ('moderator', 'admin') then
      v_limit := 60;
      v_window := 900;
    else
      v_limit := 5;
      v_window := 900;
    end if;
  elsif p_action = 'modmail_appeal' then
    -- Ban appeals: 1 per 24 hours for banned members.
    v_limit := 1;
    v_window := 86400;
  elsif p_action = 'moderation' then
    if v_role in ('moderator', 'admin') then
      v_limit := 60;
      v_window := 900;
    else
      v_limit := 5;
      v_window := 900;
    end if;
  elsif p_action = 'upload' then
    if v_role in ('moderator', 'admin') then
      v_limit := 60;
      v_window := 900;
    else
      v_limit := 20;
      v_window := 900;
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
        errcode = '42501',
        hint = 'kaluwo_rate_limited',
        detail = v_retry::text;
  end if;
end;
$$;

revoke all on function kaluwo_private.consume_posting_rate_limit(text)
  from public, anon, authenticated;
grant execute on function kaluwo_private.consume_posting_rate_limit(text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Fix open_ticket: ban appeals use their own rate-limit bucket
-- ---------------------------------------------------------------------------
create or replace function public.open_ticket(
  p_category text,
  p_subject text,
  p_message text,
  p_subject_user_id uuid default null
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_role public.user_role;
  v_actor_banned boolean;
  v_actor_until timestamptz;
  v_subject_role public.user_role;
  v_admin_only boolean := false;
  v_mute_appeals boolean := false;
  v_mute_expires timestamptz;
  v_open_count integer;
  v_appeal_count integer;
  v_new_id uuid;
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

  -- Banned members can only open ban appeals.
  if v_actor_banned and (v_actor_until is null or v_actor_until > now()) then
    if p_category <> 'ban_appeal' then
      raise exception 'Banned members can only open ban appeals' using errcode = '42501';
    end if;
  end if;

  -- Mute check.
  select m.mute_appeals, m.expires_at
  into v_mute_appeals, v_mute_expires
  from public.modmail_mutes m
  where m.member_id = v_actor
    and m.lifted_at is null
    and (m.expires_at is null or m.expires_at > now())
  order by m.mute_appeals desc
  limit 1;

  if v_mute_appeals IS NOT NULL then
    if v_mute_appeals then
      raise exception 'You are muted from modmail' using errcode = '42501';
    elsif p_category <> 'ban_appeal' then
      raise exception 'You are muted from modmail (ban appeals only)' using errcode = '42501';
    end if;
  end if;

  -- Validate category.
  if p_category not in ('question', 'report_followup', 'ban_appeal', 'other') then
    raise exception 'Invalid category' using errcode = '22023';
  end if;

  -- Validate subject length.
  if char_length(btrim(p_subject)) < 1 then
    raise exception 'A subject is required' using errcode = '22023';
  end if;

  if char_length(btrim(p_subject)) > 200 then
    raise exception 'The subject must be 200 characters or fewer' using errcode = '22023';
  end if;

  -- Validate message length.
  if char_length(btrim(p_message)) < 1 then
    raise exception 'A message is required' using errcode = '22023';
  end if;

  if char_length(btrim(p_message)) > 10000 then
    raise exception 'The message must be 10000 characters or fewer' using errcode = '22023';
  end if;

  -- Validate optional subject_user_id and set admin_only if subject is staff.
  if p_subject_user_id is not null then
    select p.role into v_subject_role
    from public.profiles p
    where p.id = p_subject_user_id;

    if not found then
      raise exception 'Subject not found' using errcode = 'P0002';
    end if;

    if v_subject_role in ('moderator', 'admin') then
      v_admin_only := true;
    end if;
  end if;

  -- Rate limit: modmail ticket creation.
  -- Ban appeals use their own bucket (1 per 24h) so banned members can appeal
  -- but not spam. Other tickets use the modmail bucket.
  if p_category = 'ban_appeal' then
    perform kaluwo_private.consume_posting_rate_limit('modmail_appeal');
  else
    perform kaluwo_private.consume_posting_rate_limit('modmail');
  end if;

  -- Serialise cap checks per member.
  perform pg_advisory_xact_lock(hashtextextended('modmail_open:' || v_actor::text, 0));

  -- Open-ticket cap: 5 open non-appeal tickets per member.
  select count(*)::integer into v_open_count
  from public.modmail_tickets t
  where t.member_id = v_actor
    and t.status in ('open', 'pending')
    and t.category <> 'ban_appeal';

  if v_open_count >= 5 then
    raise exception 'You already have 5 open tickets' using errcode = '42501';
  end if;

  -- Ban appeal cap: 1 open appeal per member.
  select count(*)::integer into v_appeal_count
  from public.modmail_tickets t
  where t.member_id = v_actor
    and t.status in ('open', 'pending')
    and t.category = 'ban_appeal';

  if v_appeal_count >= 1 then
    raise exception 'You already have an open ban appeal' using errcode = '42501';
  end if;

  -- Ban appeal gating: must be effectively banned or banned within the last 30 days.
  if p_category = 'ban_appeal' then
    if not (
      v_actor_banned and (v_actor_until is null or v_actor_until > now())
      or exists (
        select 1
        from public.member_bans b
        where b.user_id = v_actor
          and b.created_at > now() - interval '30 days'
      )
    ) then
      raise exception 'Ban appeals require an active or recent ban' using errcode = '42501';
    end if;
  end if;

  insert into public.modmail_tickets (
    member_id,
    subject_user_id,
    category,
    subject,
    opened_by
  )
  values (
    v_actor,
    p_subject_user_id,
    p_category,
    btrim(p_subject),
    v_actor
  )
  returning modmail_tickets.id into v_new_id;

  insert into public.modmail_messages (
    ticket_id,
    author_id,
    body
  )
  values (
    v_new_id,
    v_actor,
    btrim(p_message)
  );

  insert into public.notifications (
    user_id,
    actor_id,
    actor_username,
    kind,
    ticket_id,
    excerpt
  )
  values (
    v_actor,
    null,
    'Moderation team',
    'modmail_new_ticket'::public.notification_kind,
    v_new_id,
    ''
  )
  on conflict (user_id, ticket_id) where ticket_id is not null
  do update set
    kind = 'modmail_new_ticket'::public.notification_kind,
    read_at = null;

  return query select v_new_id as id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fix mute_member: exclude lifted mutes from active-mute checks
-- ---------------------------------------------------------------------------
create or replace function public.mute_member(
  p_member_id uuid,
  p_reason text,
  p_expires_at timestamptz default null,
  p_mute_appeals boolean default false
)
returns table (changed boolean, mod_log_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := kaluwo_private.assert_staff();
  v_actor_role public.user_role;
  v_target_role public.user_role;
  v_existing_mute boolean;
  v_log_id bigint;
begin
  select p.role into v_actor_role
  from public.profiles p
  where p.id = v_actor;

  if not found then
    raise exception 'Profile not found' using errcode = '42501';
  end if;

  -- Only admins can mute appeals.
  if p_mute_appeals and v_actor_role <> 'admin' then
    raise exception 'Only admins can mute appeals' using errcode = '42501';
  end if;

  -- Validate target.
  select p.role into v_target_role
  from public.profiles p
  where p.id = p_member_id;

  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  -- Moderators cannot mute staff.
  if v_actor_role <> 'admin' and v_target_role in ('moderator', 'admin') then
    raise exception 'Moderators cannot mute staff' using errcode = '42501';
  end if;

  if p_member_id = v_actor then
    raise exception 'Cannot mute yourself' using errcode = '42501';
  end if;

  -- Validate reason.
  if char_length(btrim(p_reason)) < 1 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  if char_length(btrim(p_reason)) > 1000 then
    raise exception 'The reason must be 1000 characters or fewer' using errcode = '22023';
  end if;

  -- Validate expiry.
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Mute expiry must be in the future' using errcode = '22023';
  end if;

  -- Check for existing active mute (excluding lifted mutes).
  select exists (
    select 1
    from public.modmail_mutes m
    where m.member_id = p_member_id
      and m.lifted_at is null
      and (m.expires_at is null or m.expires_at > now())
  ) into v_existing_mute;

  if v_existing_mute then
    if v_actor_role <> 'admin' and exists (
      select 1 from public.modmail_mutes m
      where m.member_id = p_member_id
        and m.lifted_at is null
        and (m.expires_at is null or m.expires_at > now())
        and m.mute_appeals
    ) then
      raise exception 'Only admins can change an appeal mute' using errcode = '42501';
    end if;

    -- Update existing mute (idempotent-ish).
    update public.modmail_mutes
    set
      reason = btrim(p_reason),
      expires_at = p_expires_at,
      mute_appeals = p_mute_appeals,
      created_by = v_actor,
      created_at = now()
    where member_id = p_member_id
      and lifted_at is null
      and (expires_at is null or expires_at > now());

    v_log_id := kaluwo_private.write_mod_log(
      'modmail.member_mute'::public.mod_action,
      'modmail_member_mute'::public.mod_target_type,
      p_member_id::text,
      'member',
      btrim(p_reason),
      null,
      jsonb_build_object('mute_appeals', p_mute_appeals, 'expires_at', p_expires_at)
    );

    return query select true, v_log_id;
    return;
  end if;

  insert into public.modmail_mutes (
    member_id,
    reason,
    expires_at,
    mute_appeals,
    created_by
  )
  values (
    p_member_id,
    btrim(p_reason),
    p_expires_at,
    p_mute_appeals,
    v_actor
  );

  v_log_id := kaluwo_private.write_mod_log(
    'modmail.member_mute'::public.mod_action,
    'modmail_member_mute'::public.mod_target_type,
    p_member_id::text,
    'member',
    btrim(p_reason),
    jsonb_build_object('mute_appeals', false),
    jsonb_build_object('mute_appeals', p_mute_appeals)
  );

  return query select true, v_log_id;
end;
$$;

revoke all on function public.mute_member(uuid, text, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.mute_member(uuid, text, timestamptz, boolean)
  to authenticated;

commit;
