-- Phase 4: staff access helper with explicit actor id
--
-- Used by server actions that run with the service role (auth.uid() is null
-- there), so the actor id must be passed explicitly.

begin;

create or replace function kaluwo_private.can_staff_access_ticket_for(
  p_actor uuid,
  p_ticket_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_role public.user_role;
  v_actor_banned boolean;
  v_actor_until timestamptz;
  v_ticket_member_id uuid;
  v_ticket_subject_user_id uuid;
  v_ticket_admin_only boolean;
begin
  if p_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select p.role, p.is_banned, p.banned_until
  into v_actor_role, v_actor_banned, v_actor_until
  from public.profiles p
  where p.id = p_actor;

  if not found then
    raise exception 'Profile not found' using errcode = '42501';
  end if;

  if v_actor_role not in ('moderator', 'admin')
     or (v_actor_banned and (v_actor_until is null or v_actor_until > now())) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  select t.member_id, t.subject_user_id, t.admin_only
  into v_ticket_member_id, v_ticket_subject_user_id, v_ticket_admin_only
  from public.modmail_tickets t
  where t.id = p_ticket_id;

  if not found then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;

  if v_ticket_member_id = p_actor then
    return false;
  end if;

  if v_ticket_subject_user_id = p_actor then
    return false;
  end if;

  if v_ticket_admin_only and v_actor_role <> 'admin' then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function kaluwo_private.can_staff_access_ticket_for(uuid, uuid)
  from public, anon, authenticated;

grant execute on function kaluwo_private.can_staff_access_ticket_for(uuid, uuid)
  to service_role;

commit;
