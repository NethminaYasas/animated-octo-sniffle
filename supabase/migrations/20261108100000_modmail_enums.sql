-- Phase 4: modmail enums and rate-limit buckets
--
-- Adds notification kinds, mod log actions/target types for uploads, and
-- rate-limit bucket actions for modmail. Kept in its own migration so the new
-- enum values are usable in later files.

begin;

-- ---------------------------------------------------------------------------
-- Notification kinds
-- ---------------------------------------------------------------------------
alter type public.notification_kind add value if not exists 'modmail_new_ticket';
alter type public.notification_kind add value if not exists 'modmail_reply';
alter type public.notification_kind add value if not exists 'modmail_status_change';

-- ---------------------------------------------------------------------------
-- Moderation log action / target types
-- ---------------------------------------------------------------------------
alter type public.mod_action add value if not exists 'modmail.ticket.staff_open';
alter type public.mod_action add value if not exists 'modmail.ticket.status_change';
alter type public.mod_action add value if not exists 'modmail.ticket.priority_change';
alter type public.mod_action add value if not exists 'modmail.ticket.assign';
alter type public.mod_action add value if not exists 'modmail.ticket.reopen';
alter type public.mod_action add value if not exists 'modmail.ticket.close';
alter type public.mod_action add value if not exists 'modmail.member_mute';
alter type public.mod_action add value if not exists 'modmail.member_unmute';
alter type public.mod_action add value if not exists 'modmail.retention_deleted';

alter type public.mod_target_type add value if not exists 'modmail_ticket';
alter type public.mod_target_type add value if not exists 'modmail_member_mute';

-- ---------------------------------------------------------------------------
-- Rate-limit bucket actions
-- ---------------------------------------------------------------------------
alter table kaluwo_private.rate_limit_buckets
  drop constraint if exists rate_limit_buckets_action;

alter table kaluwo_private.rate_limit_buckets
  add constraint rate_limit_buckets_action
  check (action in ('thread', 'comment', 'report', 'modmail', 'modmail_staff', 'moderation', 'upload'));

commit;
