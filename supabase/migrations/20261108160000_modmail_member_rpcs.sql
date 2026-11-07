-- Phase 4: member-facing modmail RPCs (safe views)
--
-- Members read their own tickets and messages through these SECURITY DEFINER
-- functions, which return only safe columns (no staff ids, no priority).

begin;

create or replace function public.my_tickets()
returns table (
  id uuid,
  subject text,
  category text,
  status text,
  admin_only boolean,
  last_message_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return query
    select
      t.id,
      t.subject,
      t.category,
      t.status,
      t.admin_only,
      t.last_message_at,
      t.created_at
    from public.modmail_tickets t
    where t.member_id = (select auth.uid())
    order by t.last_message_at desc;
end;
$$;

revoke all on function public.my_tickets()
  from public, anon, authenticated;
grant execute on function public.my_tickets()
  to authenticated;

comment on function public.my_tickets() is
  'Member-facing safe view of their own tickets. No staff ids, no priority.';

-- ---------------------------------------------------------------------------
-- Member: read messages on their own tickets
-- ---------------------------------------------------------------------------
create or replace function public.my_messages(p_ticket_id uuid)
returns table (
  id bigint,
  ticket_id uuid,
  sender_kind text,
  body text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_ticket_member_id uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select t.member_id into v_ticket_member_id
  from public.modmail_tickets t
  where t.id = p_ticket_id;

  if not found then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;

  if v_ticket_member_id <> v_actor then
    raise exception 'Not your ticket' using errcode = '42501';
  end if;

  return query
    select
      m.id,
      m.ticket_id,
      case
        when m.author_id = v_actor then 'member'
        else 'staff'
      end as sender_kind,
      m.body,
      m.created_at
    from public.modmail_messages m
    where m.ticket_id = p_ticket_id
    order by m.created_at asc;
end;
$$;

revoke all on function public.my_messages(uuid)
  from public, anon, authenticated;
grant execute on function public.my_messages(uuid)
  to authenticated;

comment on function public.my_messages(uuid) is
  'Member-facing messages for their own ticket. Returns sender_kind, not author_id.';

commit;
