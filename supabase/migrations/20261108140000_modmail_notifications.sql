-- Phase 4: modmail notifications
--
-- Adds ticket_id to notifications, new notification kinds, and makes
-- thread/post columns nullable for modmail notifications. No message text or
-- staff identity in notification excerpts.

begin;

-- ---------------------------------------------------------------------------
-- Notification kinds (added in migration 100000)
-- ---------------------------------------------------------------------------
-- modmail_new_ticket, modmail_reply, modmail_status_change already added.

-- ---------------------------------------------------------------------------
-- Notifications: add ticket_id, make thread/post columns nullable
-- ---------------------------------------------------------------------------
alter table public.notifications
  add column ticket_id uuid references public.modmail_tickets (id) on delete cascade;

alter table public.notifications
  alter column thread_id drop not null;

alter table public.notifications
  alter column thread_title drop not null;

alter table public.notifications
  alter column post_id drop not null;

-- One unread notification per (recipient, ticket) for modmail.
create unique index notifications_unique_recipient_ticket
  on public.notifications (user_id, ticket_id)
  where ticket_id is not null;

create index notifications_ticket_idx
  on public.notifications (ticket_id, created_at desc)
  where ticket_id is not null;

grant usage on type public.notification_kind to authenticated, service_role;

commit;
