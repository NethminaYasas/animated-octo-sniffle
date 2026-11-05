-- kaluwo initial schema (step 2)
--
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste ->
-- Run. The whole file is one transaction, so a failure applies nothing.
--
-- What this creates:
--   * profiles, boards, threads, posts, reactions, reports, media_assets
--   * enums, indexes, soft-delete flags and the board seed rows
--   * a trigger that creates a profile for every new auth user
--   * Row Level Security policies for every table
--
-- Decisions worth knowing (also recorded in SPEC.md):
--   * boards.id is the human-readable slug used by the app ("general", ...).
--   * One reaction per user per comment; changing the reaction updates it.
--   * threads and posts are soft-deleted with is_deleted, never hard-deleted
--     by members. Moderators may still hard-delete.
--   * A thread may have exactly one opening post (is_opening = true).

begin;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('member', 'moderator', 'admin');
create type public.reaction_kind as enum ('like', 'laugh', 'wow', 'anger', 'dislike');
create type public.report_status as enum ('open', 'resolved', 'dismissed');
create type public.media_kind as enum ('image', 'video', 'audio');
create type public.media_status as enum ('active', 'removed');

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  avatar_url text,
  role public.user_role not null default 'member',
  is_banned boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

-- The check constraint keeps usernames lowercase, so the inline UNIQUE
-- constraint is already case-insensitive.

-- ---------------------------------------------------------------------------
-- boards
-- ---------------------------------------------------------------------------
create table public.boards (
  id text primary key,
  name text not null unique,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint boards_id_format check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- ---------------------------------------------------------------------------
-- threads
-- ---------------------------------------------------------------------------
create table public.threads (
  id bigint generated always as identity primary key,
  board_id text not null references public.boards (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  title text not null,
  is_locked boolean not null default false,
  is_pinned boolean not null default false,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  last_post_at timestamptz not null default now(),
  constraint threads_title_length check (char_length(title) between 3 and 200)
);

create index threads_board_feed_idx
  on public.threads (board_id, is_pinned desc, last_post_at desc);
create index threads_author_idx on public.threads (author_id);

-- ---------------------------------------------------------------------------
-- posts (a reply is a post whose is_opening is false)
-- ---------------------------------------------------------------------------
create table public.posts (
  id bigint generated always as identity primary key,
  thread_id bigint not null references public.threads (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  content text not null,
  reply_to_post_id bigint references public.posts (id) on delete set null,
  is_opening boolean not null default false,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint posts_content_length check (char_length(content) between 1 and 20000),
  constraint posts_opening_has_no_reply check (not is_opening or reply_to_post_id is null)
);

create index posts_thread_idx on public.posts (thread_id, created_at);
create index posts_author_idx on public.posts (author_id);
create unique index posts_one_opening_per_thread
  on public.posts (thread_id)
  where is_opening;

-- ---------------------------------------------------------------------------
-- reactions (comments only; one changeable reaction per user per comment)
-- ---------------------------------------------------------------------------
create table public.reactions (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.reaction_kind not null,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index reactions_post_idx on public.reactions (post_id);

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
create table public.reports (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts (id) on delete cascade,
  reporter_id uuid references public.profiles (id) on delete set null,
  reason text not null,
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  constraint reports_reason_length check (char_length(reason) between 1 and 1000),
  unique (post_id, reporter_id)
);

create index reports_status_idx on public.reports (status, created_at);

-- ---------------------------------------------------------------------------
-- media_assets
-- ---------------------------------------------------------------------------
create table public.media_assets (
  id bigint generated always as identity primary key,
  owner_id uuid references public.profiles (id) on delete set null,
  post_id bigint references public.posts (id) on delete set null,
  kind public.media_kind not null,
  provider text not null default 'catbox',
  file_key text not null,
  url text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  status public.media_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (provider, file_key)
);

create index media_assets_post_idx on public.media_assets (post_id);
create index media_assets_owner_idx on public.media_assets (owner_id);

-- ---------------------------------------------------------------------------
-- Helper functions used by RLS policies
-- All are SECURITY DEFINER so they can read profiles without recursing through
-- the profiles RLS policies. search_path is pinned.
-- ---------------------------------------------------------------------------
create or replace function public.is_banned()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.is_banned from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('moderator', 'admin')
      and not p.is_banned
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and not p.is_banned
  );
$$;

-- ---------------------------------------------------------------------------
-- Trigger: create a profile for every new auth user
-- Username comes from the sign-up metadata, normalised to the allowed format.
-- A numeric suffix is added if the name is already taken.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  base text;
  candidate text;
  suffix integer := 0;
begin
  base := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );

  base := lower(regexp_replace(base, '[^a-zA-Z0-9_]+', '_', 'g'));
  base := trim(both '_' from base);

  if char_length(base) < 3 then
    base := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  base := left(base, 20);
  candidate := base;

  while exists (select 1 from public.profiles p where p.username = candidate) loop
    suffix := suffix + 1;
    candidate := left(base, 20 - char_length(suffix::text)) || suffix::text;
  end loop;

  insert into public.profiles (id, username) values (new.id, candidate);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Trigger: keep profile columns under control
-- Users may edit their own username/avatar, but only an admin may change the
-- role and only a moderator may ban. The service role (auth.uid() is null)
-- and the SQL editor are not restricted.
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'Profile id cannot be changed';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'created_at cannot be changed';
  end if;

  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only admins can change roles';
  end if;

  if new.is_banned is distinct from old.is_banned then
    if not public.is_moderator() then
      raise exception 'Only moderators can ban users';
    end if;

    if old.role = 'admin' then
      raise exception 'Admins cannot be banned';
    end if;
  end if;

  return new;
end;
$$;

create trigger protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ---------------------------------------------------------------------------
-- Trigger: protect post columns and stamp edits
-- Authors may edit content and soft-delete their own posts. They may not move
-- a post to another thread, change the author, or turn a reply into the
-- opening post.
-- ---------------------------------------------------------------------------
create or replace function public.protect_post_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.content is distinct from old.content then
    new.edited_at := now();
  end if;

  if (select auth.uid()) is null or public.is_moderator() then
    return new;
  end if;

  if new.author_id is distinct from old.author_id
     or new.thread_id is distinct from old.thread_id
     or new.is_opening is distinct from old.is_opening
     or new.reply_to_post_id is distinct from old.reply_to_post_id then
    raise exception 'Only moderators can move posts or change their author';
  end if;

  return new;
end;
$$;

create trigger protect_post_columns
  before update on public.posts
  for each row execute function public.protect_post_columns();

-- ---------------------------------------------------------------------------
-- Trigger: a reply must point at a post in the same thread
-- ---------------------------------------------------------------------------
create or replace function public.validate_reply_to()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.reply_to_post_id is not null then
    if not exists (
      select 1
      from public.posts p
      where p.id = new.reply_to_post_id
        and p.thread_id = new.thread_id
    ) then
      raise exception 'Reply target must belong to the same thread';
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_reply_to
  before insert or update on public.posts
  for each row execute function public.validate_reply_to();

-- ---------------------------------------------------------------------------
-- Trigger: bump threads.last_post_at when a post is added
-- SECURITY DEFINER so it can update the thread even though only moderators
-- have an UPDATE policy on threads.
-- ---------------------------------------------------------------------------
create or replace function public.touch_thread_last_post()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.threads
  set last_post_at = greatest(last_post_at, new.created_at)
  where id = new.thread_id;

  return new;
end;
$$;

create trigger touch_thread_last_post
  after insert on public.posts
  for each row execute function public.touch_thread_last_post();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.boards enable row level security;
alter table public.threads enable row level security;
alter table public.posts enable row level security;
alter table public.reactions enable row level security;
alter table public.reports enable row level security;
alter table public.media_assets enable row level security;

-- profiles ------------------------------------------------------------------
create policy "profiles are public"
  on public.profiles for select
  using (true);

create policy "users can insert their own profile"
  on public.profiles for insert to authenticated
  with check (
    id = (select auth.uid())
    and role = 'member'
    and is_banned = false
  );

create policy "users can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "moderators can update any profile"
  on public.profiles for update to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());

create policy "admins can delete profiles"
  on public.profiles for delete to authenticated
  using (public.is_admin());

-- boards --------------------------------------------------------------------
create policy "boards are public"
  on public.boards for select
  using (true);

create policy "admins manage boards"
  on public.boards for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- threads -------------------------------------------------------------------
create policy "threads are public unless deleted"
  on public.threads for select
  using (
    not is_deleted
    or author_id = (select auth.uid())
    or public.is_moderator()
  );

create policy "members can start threads"
  on public.threads for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and not public.is_banned()
    and not is_pinned
    and not is_locked
    and not is_deleted
  );

create policy "moderators can update threads"
  on public.threads for update to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());

create policy "moderators can delete threads"
  on public.threads for delete to authenticated
  using (public.is_moderator());

-- posts ---------------------------------------------------------------------
create policy "posts are public unless deleted"
  on public.posts for select
  using (
    (not is_deleted or author_id = (select auth.uid()) or public.is_moderator())
    and exists (
      select 1 from public.threads t where t.id = thread_id
    )
  );

create policy "members can create posts"
  on public.posts for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and not public.is_banned()
    and not is_deleted
    and edited_at is null
    and exists (
      select 1
      from public.threads t
      where t.id = thread_id
        and not t.is_locked
        and not t.is_deleted
    )
  );

create policy "authors and moderators can update posts"
  on public.posts for update to authenticated
  using (
    (author_id = (select auth.uid()) and not public.is_banned())
    or public.is_moderator()
  )
  with check (
    (author_id = (select auth.uid()) and not public.is_banned())
    or public.is_moderator()
  );

create policy "moderators can delete posts"
  on public.posts for delete to authenticated
  using (public.is_moderator());

-- reactions -----------------------------------------------------------------
create policy "reactions are public"
  on public.reactions for select
  using (true);

create policy "members can react to comments"
  on public.reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not public.is_banned()
    and exists (
      select 1
      from public.posts p
      join public.threads t on t.id = p.thread_id
      where p.id = post_id
        and not p.is_opening
        and not p.is_deleted
        and not t.is_deleted
    )
  );

create policy "members can change their own reaction"
  on public.reactions for update to authenticated
  using (
    user_id = (select auth.uid())
    and not public.is_banned()
  )
  with check (
    user_id = (select auth.uid())
    and not public.is_banned()
  );

create policy "members and moderators can remove reactions"
  on public.reactions for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_moderator());

-- reports -------------------------------------------------------------------
create policy "reporters and moderators can read reports"
  on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_moderator());

create policy "members can create reports"
  on public.reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and not public.is_banned()
    and exists (select 1 from public.posts p where p.id = post_id)
  );

create policy "moderators can update reports"
  on public.reports for update to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());

-- media_assets --------------------------------------------------------------
create policy "active media is public"
  on public.media_assets for select
  using (
    status = 'active'
    or owner_id = (select auth.uid())
    or public.is_moderator()
  );

create policy "owners can add media"
  on public.media_assets for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and not public.is_banned()
  );

create policy "owners and moderators can update media"
  on public.media_assets for update to authenticated
  using (
    (owner_id = (select auth.uid()) and not public.is_banned())
    or public.is_moderator()
  )
  with check (
    (owner_id = (select auth.uid()) and not public.is_banned())
    or public.is_moderator()
  );

create policy "moderators can delete media"
  on public.media_assets for delete to authenticated
  using (public.is_moderator());

-- ---------------------------------------------------------------------------
-- Privileges
-- RLS decides which rows are visible; grants decide which operations reach it.
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.boards, public.threads, public.posts,
  public.reactions, public.reports, public.media_assets
  from anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select on public.profiles, public.boards, public.threads, public.posts,
  public.reactions, public.media_assets
  to anon, authenticated;

grant insert, update on public.profiles to authenticated;
grant insert, update, delete on public.boards to authenticated;
grant insert, update, delete on public.threads to authenticated;
grant insert, update, delete on public.posts to authenticated;
grant insert, delete on public.reactions to authenticated;
grant update (kind) on public.reactions to authenticated;
grant select, insert, update on public.reports to authenticated;
grant insert, update, delete on public.media_assets to authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Seed boards (ids match src/lib/boards.ts)
-- ---------------------------------------------------------------------------
insert into public.boards (id, name, description, sort_order) values
  ('announcements', 'Announcements', 'News from the kaluwo team', 10),
  ('general', 'General', 'General discussion', 20),
  ('technology', 'Technology', 'Tech talk and support', 30),
  ('life-sri-lanka', 'Life in Sri Lanka', 'Daily life, news, and events', 40),
  ('food', 'Food', 'Recipes, restaurants, and food culture', 50),
  ('travel', 'Travel', 'Travel tips and destinations', 60),
  ('sports', 'Sports', 'Cricket, rugby, and more', 70)
on conflict (id) do nothing;

commit;
