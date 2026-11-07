-- Phase 4: modmail tables
--
-- Tickets, messages, internal notes and mutes. All tables are RLS-enabled with
-- no direct client grants: members read through my_tickets()/my_messages()
-- SECURITY DEFINER functions, staff through audited RPCs.

begin;

-- ---------------------------------------------------------------------------
-- Tickets
-- ---------------------------------------------------------------------------
create table public.modmail_tickets (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles (id) on delete cascade,
  subject_user_id uuid references public.profiles (id) on delete set null,
  category text not null check (category in ('question', 'report_followup', 'ban_appeal', 'other')),
  subject text not null check (char_length(subject) between 1 and 200),
  status text not null check (status in ('open', 'pending', 'resolved', 'closed')) default 'open',
  priority text not null check (priority in ('low', 'normal', 'high', 'urgent')) default 'normal',
  admin_only boolean not null default false,
  assignee_id uuid references public.profiles (id) on delete set null,
  opened_by uuid references public.profiles (id) on delete set null,
  closed_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  resolved_at timestamptz,
  status_changed_at timestamptz not null default now(),
  reopened_at timestamptz,
  reopen_count integer not null default 0 check (reopen_count between 0 and 1),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index modmail_tickets_member_idx
  on public.modmail_tickets (member_id, last_message_at desc);
create index modmail_tickets_status_idx
  on public.modmail_tickets (status, last_message_at desc);
create index modmail_tickets_assignee_idx
  on public.modmail_tickets (assignee_id, status);
create index modmail_tickets_category_idx
  on public.modmail_tickets (category, status);

alter table public.modmail_tickets enable row level security;

revoke all on table public.modmail_tickets from anon, authenticated;
grant all on table public.modmail_tickets to service_role;

comment on table public.modmail_tickets is
  'Modmail tickets. Members read through my_tickets(); staff through audited RPCs. No direct API access.';

-- ---------------------------------------------------------------------------
-- Messages (conversation thread)
-- ---------------------------------------------------------------------------
create table public.modmail_messages (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.modmail_tickets (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now()
);

create index modmail_messages_ticket_idx
  on public.modmail_messages (ticket_id, created_at);

alter table public.modmail_messages enable row level security;

revoke all on table public.modmail_messages from anon, authenticated;
revoke all on sequence public.modmail_messages_id_seq from anon, authenticated;
grant all on table public.modmail_messages to service_role;
grant usage, select on sequence public.modmail_messages_id_seq to service_role;

comment on table public.modmail_messages is
  'Modmail conversation messages. Members read through my_messages(); staff through audited RPCs.';

-- ---------------------------------------------------------------------------
-- Internal notes (staff-only, never exposed to members)
-- ---------------------------------------------------------------------------
create table public.modmail_internal_notes (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.modmail_tickets (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now()
);

create index modmail_internal_notes_ticket_idx
  on public.modmail_internal_notes (ticket_id, created_at);

alter table public.modmail_internal_notes enable row level security;

revoke all on table public.modmail_internal_notes from anon, authenticated;
revoke all on sequence public.modmail_internal_notes_id_seq from anon, authenticated;
grant all on table public.modmail_internal_notes to service_role;
grant usage, select on sequence public.modmail_internal_notes_id_seq to service_role;

comment on table public.modmail_internal_notes is
  'Staff-only internal notes on tickets. Members cannot read by any path.';

-- ---------------------------------------------------------------------------
-- Mutes (abuse control: blocks ticketing)
-- ---------------------------------------------------------------------------
create table public.modmail_mutes (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 1000),
  expires_at timestamptz,
  mute_appeals boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references public.profiles (id) on delete set null,
  lift_reason text
);

create index modmail_mutes_member_idx
  on public.modmail_mutes (member_id, expires_at);

alter table public.modmail_mutes enable row level security;

revoke all on table public.modmail_mutes from anon, authenticated;
revoke all on sequence public.modmail_mutes_id_seq from anon, authenticated;
grant all on table public.modmail_mutes to service_role;
grant usage, select on sequence public.modmail_mutes_id_seq to service_role;

comment on table public.modmail_mutes is
  'Modmail mutes. Moderators can mute non-appeal ticketing; only admins can mute appeals. Checked in open_ticket only.';

commit;
