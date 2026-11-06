-- Phase 1 RLS tests for a plain PostgreSQL 17 database.
--
-- This file assumes the migrations have already been applied and a minimal
-- `auth` stub exists:
--
--   create role anon; create role authenticated; create role service_role;
--   create schema auth;
--   create table auth.users (
--     id uuid primary key, email text,
--     raw_user_meta_data jsonb, raw_app_meta_data jsonb,
--     created_at timestamptz default now()
--   );
--   create function auth.uid() returns uuid language sql stable as $$
--     select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
--   $$;
--
-- It is run with psql as a superuser. Each test switches to the authenticated
-- role and sets request.jwt.claim.sub, so RLS is exercised for real.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create schema if not exists tests;
revoke all on schema tests from public;
grant usage on schema tests to authenticated;

create or replace function tests.set_user(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub', p_id::text, true);
$$;

create or replace function tests.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'Assertion failed: %', p_message;
  end if;
end;
$$;

create or replace function tests.assert_raises(p_sql text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception
    when others then
      return;
  end;

  raise exception 'Expected statement to fail: %', p_sql;
end;
$$;

create or replace function tests.assert_raises_with_hint(p_sql text, p_hint text)
returns void
language plpgsql
as $$
declare
  v_hint text;
begin
  begin
    execute p_sql;
  exception
    when others then
      get stacked diagnostics v_hint = PG_EXCEPTION_HINT;

      if v_hint is distinct from p_hint then
        raise exception 'Expected hint %, got %', p_hint, v_hint;
      end if;

      return;
  end;

  raise exception 'Expected statement to fail: %', p_sql;
end;
$$;

grant execute on function tests.set_user(uuid) to authenticated;
grant execute on function tests.assert_true(boolean, text) to authenticated;
grant execute on function tests.assert_raises(text) to authenticated;
grant execute on function tests.assert_raises_with_hint(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Throwaway test data
-- ---------------------------------------------------------------------------
delete from public.threads where title like 'Plain %';
delete from public.notifications where user_id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555'
);
delete from auth.users where id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555'
);

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'plain-alice@example.test',
    '{"username":"plainalice"}'::jsonb,
    '{"kaluwo_invite":true,"provider":"email"}'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'plain-bob@example.test',
    '{"username":"plainbob"}'::jsonb,
    '{"kaluwo_invite":true,"provider":"email"}'::jsonb
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'plain-banned@example.test',
    '{"username":"plainbanned"}'::jsonb,
    '{"kaluwo_invite":true,"provider":"email"}'::jsonb
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'plain-newbie@example.test',
    '{"username":"plainnewbie"}'::jsonb,
    '{"kaluwo_invite":true,"provider":"email"}'::jsonb
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    'plain-outsider@example.test',
    '{"username":"plainoutsider"}'::jsonb,
    '{"kaluwo_invite":true,"provider":"email"}'::jsonb
  );

update public.profiles set role = 'member', is_banned = false
where id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '55555555-5555-4555-8555-555555555555'
);

update public.profiles set role = 'member', is_banned = true
where id = '33333333-3333-4333-8333-333333333333';

update public.profiles set role = 'new_member', is_banned = false
where id = '44444444-4444-4444-8444-444444444444';

-- ---------------------------------------------------------------------------
-- 1. create_thread creates the thread and opening post atomically
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select tests.set_user('11111111-1111-4111-8111-111111111111');

select thread_id as plain_thread_id, post_id as plain_post_id
from public.create_thread(
  'general',
  'Plain Alice thread',
  '<p>Hello world</p>'
)
\gset

commit;

select tests.assert_true(:plain_thread_id > 0, 'thread id was returned');
select tests.assert_true(:plain_post_id > 0, 'opening post id was returned');
select tests.assert_true(
  (select count(*) from public.posts where thread_id = :plain_thread_id and is_opening) = 1,
  'exactly one opening post'
);

-- ---------------------------------------------------------------------------
-- 2. Comments, own-content reactions and banned reaction allowance
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select tests.set_user('22222222-2222-4222-8222-222222222222');

insert into public.posts (thread_id, author_id, content, is_opening)
values (
  :plain_thread_id,
  '22222222-2222-4222-8222-222222222222',
  '<p>Bob reply</p>',
  false
)
returning id as plain_bob_comment_id
\gset

commit;

begin;
set local role authenticated;
select tests.set_user('11111111-1111-4111-8111-111111111111');

select tests.assert_raises(
  format(
    'insert into public.reactions (post_id, user_id, kind) values (%s, %L, %L)',
    :plain_post_id,
    '11111111-1111-4111-8111-111111111111',
    'like'
  )
);

rollback;

begin;
set local role authenticated;
select tests.set_user('22222222-2222-4222-8222-222222222222');

insert into public.reactions (post_id, user_id, kind)
values (
  :plain_post_id,
  '22222222-2222-4222-8222-222222222222',
  'like'
);

commit;

begin;
set local role authenticated;
select tests.set_user('11111111-1111-4111-8111-111111111111');

insert into public.reactions (post_id, user_id, kind)
values (
  :plain_bob_comment_id,
  '11111111-1111-4111-8111-111111111111',
  'laugh'
);

commit;

begin;
set local role authenticated;
select tests.set_user('33333333-3333-4333-8333-333333333333');

insert into public.reactions (post_id, user_id, kind)
values (
  :plain_post_id,
  '33333333-3333-4333-8333-333333333333',
  'wow'
);

commit;

begin;
set local role authenticated;
select tests.set_user('22222222-2222-4222-8222-222222222222');

select tests.assert_true(
  (
    select total = 1 and mine
    from public.thread_reaction_summary(:plain_thread_id)
    where post_id = :plain_post_id and kind = 'like'
  ),
  'Bob sees his own like and the total'
);
select tests.assert_true(
  (
    select total = 1 and not mine
    from public.thread_reaction_summary(:plain_thread_id)
    where post_id = :plain_post_id and kind = 'wow'
  ),
  'Bob sees the banned member wow without mine'
);

commit;

begin;
set local role authenticated;
select tests.set_user('11111111-1111-4111-8111-111111111111');

select tests.assert_true(
  (
    select mine
    from public.thread_reaction_summary(:plain_thread_id)
    where post_id = :plain_bob_comment_id and kind = 'laugh'
  ),
  'Alice sees her own laugh'
);
select tests.assert_true(
  (
    select not mine
    from public.thread_reaction_summary(:plain_thread_id)
    where post_id = :plain_post_id and kind = 'like'
  ),
  'Alice sees Bob like as not hers'
);

commit;

-- ---------------------------------------------------------------------------
-- 3. Banned members cannot post or comment
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select tests.set_user('33333333-3333-4333-8333-333333333333');

select tests.assert_raises(
  $sql$insert into public.threads (board_id, author_id, title)
        values ('general', '33333333-3333-4333-8333-333333333333', 'Plain banned thread')$sql$
);

select tests.assert_raises(
  format(
    'insert into public.posts (thread_id, author_id, content) values (%s, %L, %L)',
    :plain_thread_id,
    '33333333-3333-4333-8333-333333333333',
    '<p>Banned reply</p>'
  )
);

rollback;

-- ---------------------------------------------------------------------------
-- 4. Empty threads are hidden and cannot collect comments
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select tests.set_user('11111111-1111-4111-8111-111111111111');

insert into public.threads (board_id, author_id, title)
values ('general', '11111111-1111-4111-8111-111111111111', 'Plain empty thread')
returning id as plain_empty_thread_id
\gset

commit;

begin;
set local role authenticated;
select tests.set_user('11111111-1111-4111-8111-111111111111');

select tests.assert_true(
  not exists (
    select 1
    from public.list_threads(null, 'latest', null, null, 50) listed
    where listed.id = :plain_empty_thread_id
  ),
  'empty thread is hidden from list_threads'
);

commit;

begin;
set local role authenticated;
select tests.set_user('22222222-2222-4222-8222-222222222222');

select tests.assert_raises(
  format(
    'insert into public.posts (thread_id, author_id, content) values (%s, %L, %L)',
    :plain_empty_thread_id,
    '22222222-2222-4222-8222-222222222222',
    '<p>Invisible reply</p>'
  )
);

rollback;

begin;
set local role authenticated;
select tests.set_user('11111111-1111-4111-8111-111111111111');

insert into public.posts (thread_id, author_id, content, is_opening)
values (
  :plain_empty_thread_id,
  '11111111-1111-4111-8111-111111111111',
  '<p>Opening post added later</p>',
  true
);

select tests.assert_true(
  exists (
    select 1
    from public.list_threads(null, 'latest', null, null, 50) listed
    where listed.id = :plain_empty_thread_id
  ),
  'completed thread becomes visible'
);

commit;

-- Another member cannot insert an opening post into Bob's thread.
begin;
set local role authenticated;
select tests.set_user('22222222-2222-4222-8222-222222222222');

select thread_id as plain_bob_thread_id
from public.create_thread('general', 'Plain Bob thread', '<p>Bob opening</p>')
\gset

commit;

begin;
set local role authenticated;
select tests.set_user('11111111-1111-4111-8111-111111111111');

select tests.assert_raises(
  format(
    'insert into public.posts (thread_id, author_id, content, is_opening) values (%s, %L, %L, true)',
    :plain_bob_thread_id,
    '11111111-1111-4111-8111-111111111111',
    '<p>Intruding opening post</p>'
  )
);

rollback;

-- ---------------------------------------------------------------------------
-- 5. create_thread rolls back the thread when the opening post fails
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select tests.set_user('11111111-1111-4111-8111-111111111111');

select tests.assert_raises(
  format(
    'select * from public.create_thread(%L, %L, %L)',
    'general',
    'Plain atomic fail',
    repeat('x', 20001)
  )
);

select tests.assert_true(
  not exists (select 1 from public.threads where title = 'Plain atomic fail'),
  'failed opening post leaves no thread'
);

commit;

-- ---------------------------------------------------------------------------
-- 6. Notification RLS and excerpt clearing
-- ---------------------------------------------------------------------------
insert into public.notifications (
  user_id, actor_id, actor_username, kind, thread_id, thread_title, post_id, excerpt
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'plainbob',
    'reply',
    :plain_thread_id,
    'Plain Alice thread',
    :plain_bob_comment_id,
    'Bob reply'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    'plainalice',
    'reply',
    :plain_thread_id,
    'Plain Alice thread',
    :plain_post_id,
    'Hello world'
  );

begin;
set local role authenticated;
select tests.set_user('11111111-1111-4111-8111-111111111111');

select tests.assert_true(
  (select count(*) from public.notifications where user_id = '11111111-1111-4111-8111-111111111111') = 1,
  'Alice sees her own notification'
);
select tests.assert_true(
  (select count(*) from public.notifications where user_id = '22222222-2222-4222-8222-222222222222') = 0,
  'Alice cannot see Bob notification'
);

update public.notifications
set read_at = now()
where user_id = '22222222-2222-4222-8222-222222222222';

commit;

select tests.assert_true(
  (select read_at is null from public.notifications where user_id = '22222222-2222-4222-8222-222222222222' limit 1),
  'cross-user notification update is denied'
);

begin;
set local role authenticated;
select tests.set_user('11111111-1111-4111-8111-111111111111');

update public.notifications
set read_at = now()
where user_id = '11111111-1111-4111-8111-111111111111';

commit;

select tests.assert_true(
  (select read_at is not null from public.notifications where user_id = '11111111-1111-4111-8111-111111111111' limit 1),
  'own notification can be marked read'
);

begin;
set local role authenticated;
select tests.set_user('22222222-2222-4222-8222-222222222222');

update public.posts
set is_deleted = true
where id = :plain_bob_comment_id;

commit;

select tests.assert_true(
  (select excerpt = '' from public.notifications where user_id = '11111111-1111-4111-8111-111111111111' limit 1),
  'soft delete clears the notification excerpt'
);
select tests.assert_true(
  (select reply_count = 0 from public.threads where id = :plain_thread_id),
  'soft delete decrements reply_count'
);

-- A whole-thread soft delete clears every excerpt from that thread.
insert into public.notifications (
  user_id, actor_id, actor_username, kind, thread_id, thread_title, post_id, excerpt
)
values (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'plainbob',
  'mention',
  :plain_thread_id,
  'Plain Alice thread',
  :plain_post_id,
  'Thread excerpt'
);

update public.threads
set is_deleted = true
where id = :plain_thread_id;

select tests.assert_true(
  (
    select excerpt = '' and thread_title = '[deleted thread]'
    from public.notifications
    where user_id = '11111111-1111-4111-8111-111111111111'
      and post_id = :plain_post_id
  ),
  'thread soft delete clears the notification excerpt and title'
);

-- The initial schema's unique partial index is what makes concurrent
-- opening-post inserts safe.
select tests.assert_true(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'posts'
      and indexname = 'posts_one_opening_per_thread'
  ),
  'opening-post unique index exists'
);

-- ---------------------------------------------------------------------------
-- 7. Rate limit rejection, hint and window reset
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select tests.set_user('44444444-4444-4444-8444-444444444444');

insert into public.threads (board_id, author_id, title)
values ('general', '44444444-4444-4444-8444-444444444444', 'Plain newbie first');

commit;

begin;
set local role authenticated;
select tests.set_user('44444444-4444-4444-8444-444444444444');

select tests.assert_raises_with_hint(
  $sql$insert into public.threads (board_id, author_id, title)
        values ('general', '44444444-4444-4444-8444-444444444444', 'Plain newbie second')$sql$,
  'kaluwo_rate_limited'
);

rollback;

update kaluwo_private.rate_limit_buckets
set window_start = now() - interval '1 day'
where user_id = '44444444-4444-4444-8444-444444444444'
  and action = 'thread';

begin;
set local role authenticated;
select tests.set_user('44444444-4444-4444-8444-444444444444');

insert into public.threads (board_id, author_id, title)
values ('general', '44444444-4444-4444-8444-444444444444', 'Plain newbie third');

commit;

-- ---------------------------------------------------------------------------
-- 8. LIKE wildcard escaping and cursor pagination
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select tests.set_user('22222222-2222-4222-8222-222222222222');

select thread_id from public.create_thread('general', 'Plain 100%', '<p>Percent</p>');
select thread_id from public.create_thread('general', 'Plain 100 done', '<p>Plain</p>');

commit;

begin;
set local role authenticated;
select tests.set_user('11111111-1111-4111-8111-111111111111');

select tests.assert_true(
  exists (select 1 from public.threads where title = 'Plain 100%' and title ilike '%\%%'),
  'literal percent is found'
);
select tests.assert_true(
  not exists (select 1 from public.threads where title = 'Plain 100 done' and title ilike '%\%%'),
  'escaped percent is not a wildcard'
);

select id as plain_page1_id, last_post_at as plain_page1_at
from public.list_threads(null, 'latest', null, null, 1)
\gset

select id as plain_page2_id
from public.list_threads(null, 'latest', :'plain_page1_at', :plain_page1_id, 1)
\gset

select tests.assert_true(
  :plain_page2_id <> :plain_page1_id,
  'cursor pagination advances to a different thread'
);

commit;

-- ---------------------------------------------------------------------------
-- 9. Internal helper is not in the exposed public schema
-- ---------------------------------------------------------------------------
select tests.assert_true(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'thread_has_no_posts'
  ),
  'thread_has_no_posts is not in the public schema'
);

select tests.assert_true(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'kaluwo_private'
      and p.proname = 'thread_has_no_posts'
  ),
  'thread_has_no_posts lives in the non-exposed schema'
);

-- ---------------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------------
delete from public.threads where title like 'Plain %';
delete from auth.users where id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555'
);
