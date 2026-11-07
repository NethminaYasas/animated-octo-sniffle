-- Phase 4: modmail retention cleanup
--
-- Closed/resolved tickets are retained 90 days after status_changed_at;
-- ban-appeal tickets are retained 365 days. Service-role only. No provider
-- calls (no attachments). Run via npm run modmail:cleanup.

begin;

create or replace function public.expire_modmail_tickets()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;          -- tickets
  v_messages integer := 0;
  v_notes integer := 0;
  v_deleted integer := 0;
begin
  -- Non-appeal tickets: resolved/closed for 90 days.
  delete from public.modmail_messages m
  using public.modmail_tickets t
  where m.ticket_id = t.id
    and t.status in ('resolved', 'closed')
    and t.category <> 'ban_appeal'
    and t.status_changed_at < now() - interval '90 days';

  get diagnostics v_deleted = row_count;
  v_messages := v_messages + v_deleted;

  delete from public.modmail_internal_notes n
  using public.modmail_tickets t
  where n.ticket_id = t.id
    and t.status in ('resolved', 'closed')
    and t.category <> 'ban_appeal'
    and t.status_changed_at < now() - interval '90 days';

  get diagnostics v_deleted = row_count;
  v_notes := v_notes + v_deleted;

  delete from public.modmail_tickets t
  where t.status in ('resolved', 'closed')
    and t.category <> 'ban_appeal'
    and t.status_changed_at < now() - interval '90 days';

  get diagnostics v_deleted = row_count;
  v_count := v_count + v_deleted;

  -- Ban-appeal tickets: resolved/closed for 365 days.
  delete from public.modmail_messages m
  using public.modmail_tickets t
  where m.ticket_id = t.id
    and t.status in ('resolved', 'closed')
    and t.category = 'ban_appeal'
    and t.status_changed_at < now() - interval '365 days';

  get diagnostics v_deleted = row_count;
  v_messages := v_messages + v_deleted;

  delete from public.modmail_internal_notes n
  using public.modmail_tickets t
  where n.ticket_id = t.id
    and t.status in ('resolved', 'closed')
    and t.category = 'ban_appeal'
    and t.status_changed_at < now() - interval '365 days';

  get diagnostics v_deleted = row_count;
  v_notes := v_notes + v_deleted;

  delete from public.modmail_tickets t
  where t.status in ('resolved', 'closed')
    and t.category = 'ban_appeal'
    and t.status_changed_at < now() - interval '365 days';

  get diagnostics v_deleted = row_count;
  v_count := v_count + v_deleted;

  -- Log to security_events (system cleanup, not a staff action).
  if v_count > 0 then
    insert into public.security_events (
      event,
      user_id,
      metadata
    )
    values (
      'modmail.retention_deleted',
      null,
      jsonb_build_object('ticket_count', v_count,
                         'message_count', v_messages,
                         'note_count', v_notes)
    );
  end if;

  return v_count;
end;
$$;

revoke all on function public.expire_modmail_tickets()
  from public, anon, authenticated;
grant execute on function public.expire_modmail_tickets()
  to service_role;

comment on function public.expire_modmail_tickets() is
  'Service-role cleanup: removes resolved/closed tickets older than 90 days (ban appeals: 365 days). Logs to security_events.';

commit;
