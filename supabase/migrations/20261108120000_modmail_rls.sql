-- Phase 4: modmail RLS and staff access helper
--
-- Direct table access is revoked from anon/authenticated. Members read through
-- my_tickets()/my_messages() SECURITY DEFINER functions; staff through audited
-- RPCs. RLS policies are defense in depth.

begin;

-- ---------------------------------------------------------------------------
-- Staff access helper: can the current actor access this ticket?
-- ---------------------------------------------------------------------------
create or replace function kaluwo_private.can_staff_access_ticket(p_ticket_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_member_id uuid;
  v_subject_user_id uuid;
  v_admin_only boolean;
  v_actor_role public.user_role;
  v_actor_banned boolean;
  v_actor_until timestamptz;
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

  select t.member_id, t.subject_user_id, t.admin_only
  into v_member_id, v_subject_user_id, v_admin_only
  from public.modmail_tickets t
  where t.id = p_ticket_id;

  if not found then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;

  -- Staff cannot see or act on their own member ticket or a ticket about them.
  if v_member_id = v_actor then
    return false;
  end if;

  if v_subject_user_id = v_actor then
    return false;
  end if;

  -- Admin-only tickets are visible only to admins who are not the member/subject.
  if v_admin_only and v_actor_role <> 'admin' then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function kaluwo_private.can_staff_access_ticket(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS policies (defense in depth; direct table access is revoked below)
-- ---------------------------------------------------------------------------
create policy "staff can read tickets they can access"
  on public.modmail_tickets for select to authenticated
  using (kaluwo_private.can_staff_access_ticket(id));

create policy "staff can read messages on accessible tickets"
  on public.modmail_messages for select to authenticated
  using (
    exists (
      select 1
      from public.modmail_tickets t
      where t.id = modmail_messages.ticket_id
        and kaluwo_private.can_staff_access_ticket(t.id)
    )
  );

create policy "staff can read internal notes on accessible tickets"
  on public.modmail_internal_notes for select to authenticated
  using (
    exists (
      select 1
      from public.modmail_tickets t
      where t.id = modmail_internal_notes.ticket_id
        and kaluwo_private.can_staff_access_ticket(t.id)
    )
  );

create policy "staff can read mutes"
  on public.modmail_mutes for select to authenticated
  using (public.is_moderator());

-- ---------------------------------------------------------------------------
-- Grants: no direct client access
-- ---------------------------------------------------------------------------
revoke all on table public.modmail_tickets from anon, authenticated;

revoke all on table public.modmail_messages from anon, authenticated;
revoke all on sequence public.modmail_messages_id_seq from anon, authenticated;

revoke all on table public.modmail_internal_notes from anon, authenticated;
revoke all on sequence public.modmail_internal_notes_id_seq from anon, authenticated;

revoke all on table public.modmail_mutes from anon, authenticated;
revoke all on sequence public.modmail_mutes_id_seq from anon, authenticated;

grant all on table public.modmail_tickets to service_role;

grant all on table public.modmail_messages to service_role;
grant usage, select on sequence public.modmail_messages_id_seq to service_role;

grant all on table public.modmail_internal_notes to service_role;
grant usage, select on sequence public.modmail_internal_notes_id_seq to service_role;

grant all on table public.modmail_mutes to service_role;
grant usage, select on sequence public.modmail_mutes_id_seq to service_role;

commit;
