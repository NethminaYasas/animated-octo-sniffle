-- Cross-device reply, quote and mention notifications (Phase 1, part 2).
--
-- Notifications are written only by the server action with the service role,
-- after it has resolved every recipient from database rows. There is no INSERT
-- policy, so a browser cannot fabricate a notification for another member.
--
-- The table is in the Realtime publication. Realtime applies the SELECT policy
-- to INSERT/UPDATE events; the browser also subscribes with a user_id filter,
-- which is required to keep DELETE payloads scoped to the recipient.

begin;

create type public.notification_kind as enum ('reply', 'quote', 'mention');

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_username text not null,
  kind public.notification_kind not null,
  thread_id bigint not null references public.threads (id) on delete cascade,
  thread_title text not null,
  post_id bigint not null references public.posts (id) on delete cascade,
  excerpt text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_actor_username_length
    check (char_length(actor_username) between 1 and 20),
  constraint notifications_thread_title_length
    check (char_length(thread_title) between 1 and 200),
  constraint notifications_excerpt_length
    check (char_length(excerpt) <= 300),
  constraint notifications_unique_recipient_post
    unique (user_id, post_id)
);

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;
create index notifications_post_idx
  on public.notifications (post_id);

-- The bell updates the whole row when read_at changes, so include all columns
-- in the logical replication tuple.
alter table public.notifications replica identity full;

alter table public.notifications enable row level security;

create policy "users can read their notifications"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy "users can mark their notifications read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "users can delete their notifications"
  on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.notifications from anon, authenticated;
revoke all on sequence public.notifications_id_seq from anon, authenticated;

grant select, delete on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;
grant usage, select on sequence public.notifications_id_seq to authenticated;

grant all on table public.notifications to service_role;
grant usage, select on sequence public.notifications_id_seq to service_role;
grant usage on type public.notification_kind to authenticated, service_role;

comment on table public.notifications is
  'Per-member reply/quote/mention notifications. Service-role inserts only; recipients can read, mark read and delete their own rows.';
comment on column public.notifications.actor_username is
  'Username snapshot at notification time. actor_id remains the authoritative reference.';
comment on column public.notifications.thread_title is
  'Thread title snapshot; replaced with [deleted thread] when the thread is soft-deleted.';

-- ---------------------------------------------------------------------------
-- Remove the excerpt when the commented post is soft-deleted.
-- ---------------------------------------------------------------------------
create or replace function kaluwo_private.clear_notification_excerpts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_deleted and not old.is_deleted then
    update public.notifications
    set excerpt = ''
    where post_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function kaluwo_private.clear_notification_excerpts()
  from public, anon, authenticated;

drop trigger if exists clear_notification_excerpts on public.posts;

create trigger clear_notification_excerpts
  after update of is_deleted on public.posts
  for each row execute function kaluwo_private.clear_notification_excerpts();

-- Soft-deleting a whole thread must clear every excerpt from that thread too;
-- otherwise the bell keeps showing comment text from hidden content.
create or replace function kaluwo_private.clear_thread_notification_excerpts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_deleted and not old.is_deleted then
    update public.notifications
    set excerpt = '',
        thread_title = '[deleted thread]'
    where thread_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function kaluwo_private.clear_thread_notification_excerpts()
  from public, anon, authenticated;

drop trigger if exists clear_thread_notification_excerpts on public.threads;

create trigger clear_thread_notification_excerpts
  after update of is_deleted on public.threads
  for each row execute function kaluwo_private.clear_thread_notification_excerpts();

-- ---------------------------------------------------------------------------
-- Realtime publication
--
-- Supabase projects have this publication. A plain PostgreSQL instance used in
-- tests may not, so skip it instead of failing the migration.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    begin
      execute 'alter publication supabase_realtime add table public.notifications';
    exception
      when duplicate_object then null;
    end;
  end if;
end;
$$;

commit;
