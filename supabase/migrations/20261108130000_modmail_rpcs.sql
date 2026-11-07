-- Phase 4: modmail RPCs
--
-- All functions are SECURITY DEFINER with pinned search_path. EXECUTE is
-- revoked from public/anon and granted to authenticated. The actor is always
-- derived from auth.uid() inside the function -- never client-supplied.
-- State-changing RPCs write an atomic mod-log row where indicated.

begin;

-- ---------------------------------------------------------------------------
-- Member: open a ticket
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

  -- Mute check: mutes block non-appeal ticketing; mutes with mute_appeals block appeals.
  select m.mute_appeals, m.expires_at
  into v_mute_appeals, v_mute_expires
  from public.modmail_mutes m
  where m.member_id = v_actor
    and (m.expires_at is null or m.expires_at > now());

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
  -- Banned members opening ban appeals are exempt (they need to appeal).
  if not (
    v_actor_banned
    and (v_actor_until is null or v_actor_until > now())
    and p_category = 'ban_appeal'
  ) then
    perform kaluwo_private.consume_posting_rate_limit('modmail');
  end if;

  -- Open-ticket cap: 5 open non-appeal tickets per member.
  select count(*)::integer into v_open_count
  from public.modmail_tickets t
  where t.member_id = v_actor
    and t.status <> 'closed'
    and t.category <> 'ban_appeal';

  if v_open_count >= 5 then
    raise exception 'You already have 5 open tickets' using errcode = '42501';
  end if;

  -- Ban appeal cap: 1 open appeal per member.
  select count(*)::integer into v_appeal_count
  from public.modmail_tickets t
  where t.member_id = v_actor
    and t.status <> 'closed'
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

  return query select v_new_id as id;
end;
$$;

revoke all on function public.open_ticket(text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.open_ticket(text, text, text, uuid)
  to authenticated;

comment on function public.open_ticket(text, text, text, uuid) is
  'Member opens a modmail ticket. Rate limited, capped, ban appeals gated.';

-- ---------------------------------------------------------------------------
-- Member: reopen their own ticket (once within 7 days, resolved/closed only, not admin-only)
-- ---------------------------------------------------------------------------
create or replace function public.reopen_my_ticket(p_ticket_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_status text;
  v_admin_only boolean;
  v_closed_at timestamptz;
  v_reopen_count integer;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select t.status, t.admin_only, t.closed_at, t.reopen_count
  into v_status, v_admin_only, v_closed_at, v_reopen_count
  from public.modmail_tickets t
  where t.id = p_ticket_id
    and t.member_id = v_actor;

  if not found then
    raise exception 'Ticket not found or not yours' using errcode = 'P0002';
  end if;

  if v_admin_only then
    raise exception 'Cannot reopen an admin-only ticket' using errcode = '42501';
  end if;

  if v_status not in ('resolved', 'closed') then
    raise exception 'Only resolved or closed tickets can be reopened' using errcode = '22023';
  end if;

  if v_reopen_count >= 1 then
    raise exception 'This ticket has already been reopened' using errcode = '22023';
  end if;

  if v_closed_at is null or v_closed_at + interval '7 days' < now() then
    raise exception 'The reopen window has passed' using errcode = '22023';
  end if;

  update public.modmail_tickets
  set
    status = 'open',
    status_changed_at = now(),
    reopened_at = now(),
    reopen_count = reopen_count + 1,
    updated_at = now()
  where id = p_ticket_id;

  return true;
end;
$$;

revoke all on function public.reopen_my_ticket(uuid)
  from public, anon, authenticated;
grant execute on function public.reopen_my_ticket(uuid)
  to authenticated;

comment on function public.reopen_my_ticket(uuid) is
  'Member reopens their own resolved/closed ticket once within 7 days.';

-- ---------------------------------------------------------------------------
-- Staff: open a ticket to a member
-- ---------------------------------------------------------------------------
create or replace function public.staff_open_ticket(
  p_target_id uuid,
  p_category text,
  p_subject text,
  p_message text
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := kaluwo_private.assert_staff();
  v_actor_role public.user_role;
  v_target_role public.user_role;
  v_admin_only boolean := false;
  v_open_count integer;
  v_appeal_count integer;
  v_target_open_count integer;
  v_new_id uuid;
begin
  select p.role into v_actor_role
  from public.profiles p
  where p.id = v_actor;

  if not found then
    raise exception 'Profile not found' using errcode = '42501';
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

  -- Validate target exists.
  select p.role into v_target_role
  from public.profiles p
  where p.id = p_target_id;

  if not found then
    raise exception 'Target member not found' using errcode = 'P0002';
  end if;

  -- Staff cannot open a ticket about themselves.
  if p_target_id = v_actor then
    raise exception 'Cannot open a ticket about yourself' using errcode = '42501';
  end if;

  -- If subject is staff, admin_only.
  if v_target_role in ('moderator', 'admin') then
    v_admin_only := true;
  end if;

  -- Rate limit: staff ticket creation.
  perform kaluwo_private.consume_posting_rate_limit('modmail_staff');

  -- Per-target 24h limit: one staff-initiated ticket to the same member per 24h (ignores status).
  select count(*)::integer into v_target_open_count
  from public.modmail_tickets t
  where t.member_id = p_target_id
    and t.opened_by = v_actor
    and t.created_at > now() - interval '24 hours';

  if v_target_open_count >= 1 then
    raise exception 'You already have an open staff ticket for this member in the last 24 hours' using errcode = '42501';
  end if;

  insert into public.modmail_tickets (
    member_id,
    subject_user_id,
    category,
    subject,
    opened_by,
    admin_only
  )
  values (
    p_target_id,
    null,
    p_category,
    btrim(p_subject),
    v_actor,
    v_admin_only
  )
  returning modmail_tickets.id into v_new_id;

  perform kaluwo_private.write_mod_log(
    'modmail.ticket.staff_open'::public.mod_action,
    'modmail_ticket'::public.mod_target_type,
    v_new_id::text,
    'staff opened ticket',
    btrim(p_subject),
    jsonb_build_object('category', p_category, 'admin_only', v_admin_only),
    jsonb_build_object('category', p_category, 'admin_only', v_admin_only)
  );

  return query select v_new_id as id;
end;
$$;

revoke all on function public.staff_open_ticket(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_open_ticket(uuid, text, text, text)
  to authenticated;

comment on function public.staff_open_ticket(uuid, text, text, text) is
  'Staff opens a ticket to a member. Rate limited, per-target 24h limit, mod-logged.';

-- ---------------------------------------------------------------------------
-- Member or staff: reply to a ticket
-- ---------------------------------------------------------------------------
create or replace function public.reply_to_ticket(p_ticket_id uuid, p_message text)
returns table (id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_role public.user_role;
  v_actor_banned boolean;
  v_actor_until timestamptz;
  v_ticket_member_id uuid;
  v_ticket_status text;
  v_ticket_admin_only boolean;
  v_ticket_subject_user_id uuid;
  v_ticket_category text;
  v_message_count bigint;
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

  -- Banned members cannot reply, except to their own ban appeal ticket.
  if v_actor_banned and (v_actor_until is null or v_actor_until > now()) then
    raise exception 'Banned members cannot reply' using errcode = '42501';
  end if;

  -- Validate message length.
  if char_length(btrim(p_message)) < 1 then
    raise exception 'A message is required' using errcode = '22023';
  end if;

  if char_length(btrim(p_message)) > 10000 then
    raise exception 'The message must be 10000 characters or fewer' using errcode = '22023';
  end if;

  select t.member_id, t.status, t.admin_only, t.subject_user_id, t.category
  into v_ticket_member_id, v_ticket_status, v_ticket_admin_only, v_ticket_subject_user_id, v_ticket_category
  from public.modmail_tickets t
  where t.id = p_ticket_id;

  if not found then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;

  -- Banned member may reply to their own ban appeal ticket.
  if v_actor_banned and (v_actor_until is null or v_actor_until > now())
     and not (v_ticket_member_id = v_actor and v_ticket_category = 'ban_appeal') then
    raise exception 'Banned members cannot reply' using errcode = '42501';
  end if;

  -- Closed tickets: no replies from anyone.
  if v_ticket_status = 'closed' then
    raise exception 'This ticket is closed' using errcode = '22023';
  end if;

  if v_ticket_member_id = v_actor then
    -- Member reply: per-member reply rate limit.
    perform kaluwo_private.consume_posting_rate_limit('modmail');

    -- Member reply on resolved reopens and consumes reopen_count.
    if v_ticket_status = 'resolved' then
      if v_ticket_admin_only then
        raise exception 'Cannot reply to an admin-only ticket' using errcode = '42501';
      end if;

      if (select reopen_count from public.modmail_tickets where modmail_tickets.id = p_ticket_id) >= 1 then
        raise exception 'This ticket has already been reopened' using errcode = '42501';
      end if;

      update public.modmail_tickets
      set
        status = 'open',
        status_changed_at = now(),
        reopened_at = now(),
        reopen_count = reopen_count + 1,
        last_message_at = now(),
        updated_at = now()
      where modmail_tickets.id = p_ticket_id;
    else
      -- Member reply on pending: pending -> open.
      if v_ticket_status = 'pending' then
        update public.modmail_tickets
        set
          status = 'open',
          status_changed_at = now(),
          last_message_at = now(),
          updated_at = now()
        where modmail_tickets.id = p_ticket_id;
      else
        -- Member reply on open: just update last_message_at.
        update public.modmail_tickets
        set
          last_message_at = now(),
          updated_at = now()
        where modmail_tickets.id = p_ticket_id;
      end if;
    end if;
  else
    -- Staff reply: staff access check.
    perform kaluwo_private.assert_staff();

    -- Conflict check: staff cannot reply to tickets where they are member_id or subject_user_id.
    if v_ticket_member_id = v_actor then
      raise exception 'Cannot reply to your own ticket' using errcode = '42501';
    end if;

    if v_ticket_subject_user_id = v_actor then
      raise exception 'Cannot reply to a ticket about yourself' using errcode = '42501';
    end if;

    -- Admin-only tickets: only admins.
    if v_ticket_admin_only then
      select p.role into v_actor_role
      from public.profiles p
      where p.id = v_actor;

      if v_actor_role <> 'admin' then
        raise exception 'Only an admin can reply to this ticket' using errcode = '42501';
      end if;
    end if;

    -- Staff reply rate limit.
    perform kaluwo_private.consume_posting_rate_limit('modmail_staff');

    -- Staff reply: open -> pending.
    if v_ticket_status = 'open' then
      update public.modmail_tickets
      set
        status = 'pending',
        status_changed_at = now(),
        last_message_at = now(),
        updated_at = now()
      where modmail_tickets.id = p_ticket_id;
    else
      -- Staff reply on pending/resolved: just update last_message_at.
      update public.modmail_tickets
      set
        last_message_at = now(),
        updated_at = now()
      where modmail_tickets.id = p_ticket_id;
    end if;
  end if;

  -- Per-ticket message cap: 200 messages.
  select count(*)::integer into v_message_count
  from public.modmail_messages m
  where m.ticket_id = p_ticket_id;

  if v_message_count >= 200 then
    raise exception 'This ticket has reached the message limit' using errcode = '42501';
  end if;

  insert into public.modmail_messages (
    ticket_id,
    author_id,
    body
  )
  values (
    p_ticket_id,
    v_actor,
    btrim(p_message)
  )
  returning modmail_messages.id into v_message_count;

  -- Notify ticket member of new reply (no staff identity, one unread per recipient/ticket)
  insert into public.notifications (
    user_id,
    actor_id,
    actor_username,
    kind,
    ticket_id,
    excerpt
  )
  values (
    v_ticket_member_id,
    null,
    'Moderation team',
    'modmail_reply'::public.notification_kind,
    p_ticket_id,
    ''
  )
  on conflict (user_id, ticket_id) where ticket_id is not null
  do update set
    kind = 'modmail_reply'::public.notification_kind,
    read_at = null;

  return query select v_message_count as id;
end;
$$;

revoke all on function public.reply_to_ticket(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reply_to_ticket(uuid, text)
  to authenticated;

comment on function public.reply_to_ticket(uuid, text) is
  'Member or staff replies to a ticket. Rate limited, message-capped, status transitions applied.';

-- ---------------------------------------------------------------------------
-- Staff: add internal note (not mod-logged)
-- ---------------------------------------------------------------------------
create or replace function public.add_internal_note(p_ticket_id uuid, p_message text)
returns table (id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := kaluwo_private.assert_staff();
  v_actor_role public.user_role;
  v_ticket_member_id uuid;
  v_ticket_subject_user_id uuid;
  v_ticket_admin_only boolean;
  v_new_id bigint;
begin
  select t.member_id, t.subject_user_id, t.admin_only
  into v_ticket_member_id, v_ticket_subject_user_id, v_ticket_admin_only
  from public.modmail_tickets t
  where t.id = p_ticket_id;

  if not found then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;

  -- Conflict: staff cannot add notes to their own ticket.
  if v_ticket_member_id = v_actor then
    raise exception 'Cannot add a note to your own ticket' using errcode = '42501';
  end if;

  -- Conflict: staff cannot add notes to tickets about themselves.
  if v_ticket_subject_user_id = v_actor then
    raise exception 'Cannot add a note to a ticket about yourself' using errcode = '42501';
  end if;

  -- Admin-only tickets: only admins.
  if v_ticket_admin_only then
    select p.role into v_actor_role
    from public.profiles p
    where p.id = v_actor;

    if v_actor_role <> 'admin' then
      raise exception 'Only an admin can add notes to this ticket' using errcode = '42501';
    end if;
  end if;

  -- Validate message length.
  if char_length(btrim(p_message)) < 1 then
    raise exception 'A note is required' using errcode = '22023';
  end if;

  if char_length(btrim(p_message)) > 10000 then
    raise exception 'The note must be 10000 characters or fewer' using errcode = '22023';
  end if;

  insert into public.modmail_internal_notes (
    ticket_id,
    author_id,
    body
  )
  values (
    p_ticket_id,
    v_actor,
    btrim(p_message)
  )
  returning modmail_internal_notes.id into v_new_id;

  return query select v_new_id as id;
end;
$$;

revoke all on function public.add_internal_note(uuid, text)
  from public, anon, authenticated;
grant execute on function public.add_internal_note(uuid, text)
  to authenticated;

comment on function public.add_internal_note(uuid, text) is
  'Staff adds an internal note to a ticket. Not mod-logged, members cannot read.';

-- ---------------------------------------------------------------------------
-- Staff: assign ticket
-- ---------------------------------------------------------------------------
create or replace function public.assign_ticket(p_ticket_id uuid, p_assignee_id uuid)
returns table (changed boolean, mod_log_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := kaluwo_private.assert_staff();
  v_actor_role public.user_role;
  v_assignee_role public.user_role;
  v_ticket_member_id uuid;
  v_ticket_subject_user_id uuid;
  v_ticket_admin_only boolean;
  v_current_assignee uuid;
  v_log_id bigint;
begin
  select p.role into v_actor_role
  from public.profiles p
  where p.id = v_actor;

  if not found then
    raise exception 'Profile not found' using errcode = '42501';
  end if;

  select t.member_id, t.subject_user_id, t.admin_only, t.assignee_id
  into v_ticket_member_id, v_ticket_subject_user_id, v_ticket_admin_only, v_current_assignee
  from public.modmail_tickets t
  where t.id = p_ticket_id;

  if not found then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;

  -- Conflict checks.
  if v_ticket_member_id = v_actor then
    raise exception 'Cannot assign a ticket about yourself' using errcode = '42501';
  end if;

  if v_ticket_subject_user_id = v_actor then
    raise exception 'Cannot assign a ticket about yourself' using errcode = '42501';
  end if;

  if v_ticket_admin_only and v_actor_role <> 'admin' then
    raise exception 'Only an admin can assign this ticket' using errcode = '42501';
  end if;

  -- Validate assignee is staff.
  if p_assignee_id is not null then
    select p.role into v_assignee_role
    from public.profiles p
    where p.id = p_assignee_id;

    if not found then
      raise exception 'Assignee not found' using errcode = 'P0002';
    end if;

    if v_assignee_role not in ('moderator', 'admin') then
      raise exception 'Assignee must be staff' using errcode = '22023';
    end if;

    -- Assignee cannot be conflicted.
    if p_assignee_id = v_ticket_member_id or p_assignee_id = v_ticket_subject_user_id then
      raise exception 'Assignee is conflicted' using errcode = '42501';
    end if;

    if v_ticket_admin_only and v_assignee_role <> 'admin' then
      raise exception 'Assignee must be an admin for this ticket' using errcode = '42501';
    end if;
  end if;

  -- No change.
  if v_current_assignee is not distinct from p_assignee_id then
    select id into v_log_id
    from public.mod_log
    where target_id = p_ticket_id::text
      and target_type = 'modmail_ticket'
      and action = 'modmail.ticket.assign'
    order by id desc
    limit 1;

    return query select false, v_log_id;
    return;
  end if;

  update public.modmail_tickets
  set assignee_id = p_assignee_id,
      status_changed_at = now(),
      updated_at = now()
  where id = p_ticket_id;

  v_log_id := kaluwo_private.write_mod_log(
    'modmail.ticket.assign'::public.mod_action,
    'modmail_ticket'::public.mod_target_type,
    p_ticket_id::text,
    'ticket',
    'Assigned to staff',
    jsonb_build_object('assignee_id', v_current_assignee),
    jsonb_build_object('assignee_id', p_assignee_id)
  );

  return query select true, v_log_id;
end;
$$;

revoke all on function public.assign_ticket(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.assign_ticket(uuid, uuid)
  to authenticated;

comment on function public.assign_ticket(uuid, uuid) is
  'Staff assigns a ticket. Validates assignee is staff and not conflicted. Mod-logged.';

-- ---------------------------------------------------------------------------
-- Staff: set ticket status
-- ---------------------------------------------------------------------------
create or replace function public.set_ticket_status(p_ticket_id uuid, p_status text)
returns table (changed boolean, mod_log_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := kaluwo_private.assert_staff();
  v_actor_role public.user_role;
  v_ticket_member_id uuid;
  v_ticket_subject_user_id uuid;
  v_ticket_admin_only boolean;
  v_ticket_status text;
  v_log_id bigint;
begin
  select p.role into v_actor_role
  from public.profiles p
  where p.id = v_actor;

  if not found then
    raise exception 'Profile not found' using errcode = '42501';
  end if;

  select t.member_id, t.subject_user_id, t.admin_only, t.status
  into v_ticket_member_id, v_ticket_subject_user_id, v_ticket_admin_only, v_ticket_status
  from public.modmail_tickets t
  where t.id = p_ticket_id;

  if not found then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;

  -- Conflict checks.
  if v_ticket_member_id = v_actor then
    raise exception 'Cannot act on your own ticket' using errcode = '42501';
  end if;

  if v_ticket_subject_user_id = v_actor then
    raise exception 'Cannot act on a ticket about yourself' using errcode = '42501';
  end if;

  if v_ticket_admin_only and v_actor_role <> 'admin' then
    raise exception 'Only an admin can act on this ticket' using errcode = '42501';
  end if;

  -- Validate status.
  if p_status not in ('open', 'pending', 'resolved', 'closed') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  -- No change.
  if v_ticket_status = p_status then
    select id into v_log_id
    from public.mod_log
    where target_id = p_ticket_id::text
      and target_type = 'modmail_ticket'
      and action = 'modmail.ticket.status_change'
    order by id desc
    limit 1;

    return query select false, v_log_id;
    return;
  end if;

  -- State machine validation.
  if v_ticket_status = 'closed' and p_status <> 'open' then
    raise exception 'Closed tickets can only be reopened by staff' using errcode = '22023';
  end if;

  if v_ticket_status = 'open' and p_status = 'closed' then
    null;
  elsif v_ticket_status = 'open' and p_status = 'pending' then
    null;
  elsif v_ticket_status = 'open' and p_status = 'resolved' then
    null;
  elsif v_ticket_status = 'pending' and p_status in ('open', 'resolved', 'closed') then
    null;
  elsif v_ticket_status = 'resolved' and p_status in ('open', 'closed') then
    null;
  elsif v_ticket_status = 'closed' and p_status = 'open' then
    null;
  else
    raise exception 'Invalid status transition' using errcode = '22023';
  end if;

  update public.modmail_tickets
  set
    status = p_status,
    status_changed_at = now(),
    updated_at = now(),
    closed_at = case when p_status = 'closed' then now() else closed_at end,
    closed_by = case when p_status = 'closed' then v_actor else closed_by end,
    resolved_at = case when p_status = 'resolved' then now() else resolved_at end
  where id = p_ticket_id;

  v_log_id := kaluwo_private.write_mod_log(
    'modmail.ticket.status_change'::public.mod_action,
    'modmail_ticket'::public.mod_target_type,
    p_ticket_id::text,
    'ticket',
    'Status changed to ' || p_status,
    jsonb_build_object('status', v_ticket_status),
    jsonb_build_object('status', p_status)
  );

  return query select true, v_log_id;
end;
$$;

revoke all on function public.set_ticket_status(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_ticket_status(uuid, text)
  to authenticated;

comment on function public.set_ticket_status(uuid, text) is
  'Staff sets ticket status. State-machine enforced, mod-logged.';

-- ---------------------------------------------------------------------------
-- Staff: set ticket priority
-- ---------------------------------------------------------------------------
create or replace function public.set_ticket_priority(p_ticket_id uuid, p_priority text)
returns table (changed boolean, mod_log_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := kaluwo_private.assert_staff();
  v_actor_role public.user_role;
  v_ticket_member_id uuid;
  v_ticket_subject_user_id uuid;
  v_ticket_admin_only boolean;
  v_ticket_priority text;
  v_log_id bigint;
begin
  select t.member_id, t.subject_user_id, t.admin_only, t.priority
  into v_ticket_member_id, v_ticket_subject_user_id, v_ticket_admin_only, v_ticket_priority
  from public.modmail_tickets t
  where t.id = p_ticket_id;

  if not found then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;

  -- Conflict checks.
  if v_ticket_member_id = v_actor then
    raise exception 'Cannot act on your own ticket' using errcode = '42501';
  end if;

  if v_ticket_subject_user_id = v_actor then
    raise exception 'Cannot act on a ticket about yourself' using errcode = '42501';
  end if;

  if v_ticket_admin_only then
    select p.role into v_actor_role
    from public.profiles p
    where p.id = v_actor;

    if v_actor_role <> 'admin' then
      raise exception 'Only an admin can act on this ticket' using errcode = '42501';
    end if;
  end if;

  -- Validate priority.
  if p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Invalid priority' using errcode = '22023';
  end if;

  -- No change.
  if v_ticket_priority = p_priority then
    select id into v_log_id
    from public.mod_log
    where target_id = p_ticket_id::text
      and target_type = 'modmail_ticket'
      and action = 'modmail.ticket.priority_change'
    order by id desc
    limit 1;

    return query select false, v_log_id;
    return;
  end if;

  update public.modmail_tickets
  set priority = p_priority,
      status_changed_at = now(),
      updated_at = now()
  where id = p_ticket_id;

  v_log_id := kaluwo_private.write_mod_log(
    'modmail.ticket.priority_change'::public.mod_action,
    'modmail_ticket'::public.mod_target_type,
    p_ticket_id::text,
    'ticket',
    'Priority changed to ' || p_priority,
    jsonb_build_object('priority', v_ticket_priority),
    jsonb_build_object('priority', p_priority)
  );

  return query select true, v_log_id;
end;
$$;

revoke all on function public.set_ticket_priority(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_ticket_priority(uuid, text)
  to authenticated;

comment on function public.set_ticket_priority(uuid, text) is
  'Staff sets ticket priority. Mod-logged.';

-- ---------------------------------------------------------------------------
-- Staff: escalate ticket to admin-only
-- ---------------------------------------------------------------------------
create or replace function public.escalate_ticket(p_ticket_id uuid)
returns table (changed boolean, mod_log_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := kaluwo_private.assert_admin();
  v_ticket_member_id uuid;
  v_ticket_subject_user_id uuid;
  v_ticket_admin_only boolean;
  v_log_id bigint;
begin
  select t.member_id, t.subject_user_id, t.admin_only
  into v_ticket_member_id, v_ticket_subject_user_id, v_ticket_admin_only
  from public.modmail_tickets t
  where t.id = p_ticket_id;

  if not found then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;

  -- Admin cannot escalate a ticket about themselves.
  if v_ticket_member_id = v_actor or v_ticket_subject_user_id = v_actor then
    raise exception 'Cannot escalate a ticket about yourself' using errcode = '42501';
  end if;

  -- No change.
  if v_ticket_admin_only then
    select id into v_log_id
    from public.mod_log
    where target_id = p_ticket_id::text
      and target_type = 'modmail_ticket'
      and action = 'modmail.ticket.assign'
    order by id desc
    limit 1;

    return query select false, v_log_id;
    return;
  end if;

  update public.modmail_tickets
  set admin_only = true,
      status_changed_at = now(),
      updated_at = now()
  where id = p_ticket_id;

  v_log_id := kaluwo_private.write_mod_log(
    'modmail.ticket.assign'::public.mod_action,
    'modmail_ticket'::public.mod_target_type,
    p_ticket_id::text,
    'ticket',
    'Escalated to admin-only',
    jsonb_build_object('admin_only', false),
    jsonb_build_object('admin_only', true)
  );

  return query select true, v_log_id;
end;
$$;

revoke all on function public.escalate_ticket(uuid)
  from public, anon, authenticated;
grant execute on function public.escalate_ticket(uuid)
  to authenticated;

comment on function public.escalate_ticket(uuid) is
  'Admin escalates a ticket to admin-only. Mod-logged.';

-- ---------------------------------------------------------------------------
-- Staff: mute member
-- ---------------------------------------------------------------------------
create or replace function public.mute_member(p_member_id uuid, p_reason text, p_expires_at timestamptz default null, p_mute_appeals boolean default false)
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

  -- Check for existing active mute.
  select exists (
    select 1
    from public.modmail_mutes m
    where m.member_id = p_member_id
      and (m.expires_at is null or m.expires_at > now())
  ) into v_existing_mute;

  if v_existing_mute then
    -- Update existing mute (idempotent-ish).
    update public.modmail_mutes
    set
      reason = btrim(p_reason),
      expires_at = p_expires_at,
      mute_appeals = p_mute_appeals,
      created_by = v_actor,
      created_at = now()
    where member_id = p_member_id
      and (expires_at is null or expires_at > now());

    select id into v_log_id
    from public.mod_log
    where target_id = p_member_id::text
      and target_type = 'modmail_member_mute'
      and action = 'modmail.member_mute'
    order by id desc
    limit 1;

    return query select false, v_log_id;
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

comment on function public.mute_member(uuid, text, timestamptz, boolean) is
  'Staff mutes a member from modmail. Moderators can mute non-appeals; only admins can mute appeals. Mod-logged.';

-- ---------------------------------------------------------------------------
-- Staff: unmute member
-- ---------------------------------------------------------------------------
create or replace function public.unmute_member(p_member_id uuid, p_reason text)
returns table (changed boolean, mod_log_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := kaluwo_private.assert_admin();
  v_log_id bigint;
begin
  -- Validate reason.
  if char_length(btrim(p_reason)) < 1 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  if char_length(btrim(p_reason)) > 1000 then
    raise exception 'The reason must be 1000 characters or fewer' using errcode = '22023';
  end if;

  -- Check for existing active mute.
  if not exists (
    select 1
    from public.modmail_mutes m
    where m.member_id = p_member_id
      and (m.expires_at is null or m.expires_at > now())
  ) then
    select id into v_log_id
    from public.mod_log
    where target_id = p_member_id::text
      and target_type = 'modmail_member_mute'
      and action = 'modmail.member_unmute'
    order by id desc
    limit 1;

    return query select false, v_log_id;
    return;
  end if;

  update public.modmail_mutes
  set
    lifted_at = now(),
    lifted_by = v_actor,
    lift_reason = btrim(p_reason)
  where member_id = p_member_id
    and (expires_at is null or expires_at > now())
    and lifted_at is null;

  v_log_id := kaluwo_private.write_mod_log(
    'modmail.member_unmute'::public.mod_action,
    'modmail_member_mute'::public.mod_target_type,
    p_member_id::text,
    'member',
    btrim(p_reason),
    jsonb_build_object('lifted_at', null),
    jsonb_build_object('lifted_at', now())
  );

  return query select true, v_log_id;
end;
$$;

revoke all on function public.unmute_member(uuid, text)
  from public, anon, authenticated;
grant execute on function public.unmute_member(uuid, text)
  to authenticated;

comment on function public.unmute_member(uuid, text) is
  'Admin unmutes a member from modmail. Mod-logged.';

commit;
