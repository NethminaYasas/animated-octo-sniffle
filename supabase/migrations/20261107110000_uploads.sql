-- Phase 3: uploads stored at catbox.moe.
--
-- The browser never talks to catbox. Uploads go through the Next.js route
-- handler, which validates, strips image metadata, rate-limits and then uploads
-- server-to-server. This table is the source of truth for attachments; the
-- file itself is public by URL and has no retention guarantee (see README).
--
-- Access rules:
--   * anon/authenticated can read only the safe view (id, url, mime_type,
--     size_bytes, status). Removed uploads stay listed with status = 'removed'
--     so the UI can show a bare placeholder; uploader, hashes, provider ids
--     and removal metadata are never exposed to non-staff.
--   * staff can read the staff view with the full row.
--   * there are no direct INSERT/UPDATE/DELETE grants or policies. All writes
--     go through the route handler (service role) and the RPCs below.
--   * uploads link to posts through post_uploads, enforced by a backstop
--     trigger plus the link RPC, which requires auth.uid() = post author.
--
-- media_assets was dropped: it was never wired to the UI.

begin;

drop table if exists public.media_assets;

-- ---------------------------------------------------------------------------
-- uploads
-- ---------------------------------------------------------------------------
create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null default 'catbox',
  provider_file_id text,
  url text not null,
  mime_type text not null,
  size_bytes bigint not null,
  raw_sha256 text not null,
  sha256 text not null,
  status text not null default 'active',
  removal_reason text,
  removed_at timestamptz,
  removed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint uploads_url_shape
    check (url ~ '^https://[^/]+/[^/]+$'),
  constraint uploads_mime_allowlist
    check (mime_type in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'audio/mpeg',
      'audio/ogg',
      'video/mp4',
      'video/webm'
    )),
  constraint uploads_size
    check (size_bytes > 0 and size_bytes <= 52428800),
  constraint uploads_raw_hash
    check (raw_sha256 ~ '^[a-f0-9]{64}$'),
  constraint uploads_hash
    check (sha256 ~ '^[a-f0-9]{64}$'),
  constraint uploads_provider_file_id_shape
    check (provider_file_id is null or provider_file_id ~ '^[A-Za-z0-9._-]{1,100}$'),
  constraint uploads_status
    check (status in ('active', 'removed')),
  constraint uploads_removal_consistent
    check (
      (
        status = 'active'
        and removal_reason is null
        and removed_at is null
        and removed_by is null
      )
      or (
        status = 'removed'
        and removal_reason is not null
        and removed_at is not null
      )
    ),
  constraint uploads_removal_reason_length
    check (removal_reason is null or char_length(removal_reason) between 1 and 1000)
);

create index uploads_uploader_idx
  on public.uploads (uploader_id, created_at desc);
create index uploads_status_idx
  on public.uploads (status, created_at desc);
create index uploads_sha256_idx
  on public.uploads (sha256);
create index uploads_raw_sha256_idx
  on public.uploads (raw_sha256);

alter table public.uploads enable row level security;

revoke all on table public.uploads from anon, authenticated;
-- Only the safe columns are granted, so members can never select the uploader,
-- hashes, provider id or removal columns even from the base table.
grant select (id, url, mime_type, size_bytes, status)
  on table public.uploads to anon, authenticated;
grant all on table public.uploads to service_role;

comment on table public.uploads is
  'Uploads stored at catbox.moe. Members read only the safe columns for uploads attached to visible posts; staff read the full row through staff_uploads(). No direct API writes.';

-- ---------------------------------------------------------------------------
-- Views: what members/anon see vs what staff see
-- ---------------------------------------------------------------------------
drop view if exists public.staff_uploads;

-- Full staff view of uploads as a SECURITY DEFINER function (pinned
-- search_path, EXECUTE revoked from public/anon) so the Supabase linter does
-- not flag a security-definer view and members cannot reach the row at all.
create or replace function public.staff_uploads()
returns table (
  id uuid,
  uploader_id uuid,
  uploader_username text,
  provider text,
  provider_file_id text,
  url text,
  mime_type text,
  size_bytes bigint,
  raw_sha256 text,
  sha256 text,
  status text,
  removal_reason text,
  removed_at timestamptz,
  removed_by uuid,
  removed_by_username text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_moderator() then
    return;
  end if;

  return query
    select
      u.id,
      u.uploader_id,
      up.username,
      u.provider,
      u.provider_file_id,
      u.url,
      u.mime_type,
      u.size_bytes,
      u.raw_sha256,
      u.sha256,
      u.status,
      u.removal_reason,
      u.removed_at,
      u.removed_by,
      rb.username,
      u.created_at
    from public.uploads u
    left join public.profiles up on up.id = u.uploader_id
    left join public.profiles rb on rb.id = u.removed_by
    order by u.created_at desc;
end;
$$;

revoke all on function public.staff_uploads()
  from public, anon, authenticated;
grant execute on function public.staff_uploads()
  to authenticated;

comment on function public.staff_uploads() is
  'Full upload rows for staff only. Returns no rows to non-staff.';

-- ---------------------------------------------------------------------------
-- post_uploads: links a post (opening post or comment) to its uploads
-- ---------------------------------------------------------------------------
create table public.post_uploads (
  post_id bigint not null references public.posts (id) on delete cascade,
  upload_id uuid not null references public.uploads (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, upload_id)
);

create index post_uploads_upload_idx
  on public.post_uploads (upload_id);

alter table public.post_uploads enable row level security;

revoke all on table public.post_uploads from anon, authenticated;
grant select on table public.post_uploads to anon, authenticated;
grant all on table public.post_uploads to service_role;

create policy "anyone can read post upload links"
  on public.post_uploads for select
  using (exists (select 1 from public.posts p where p.id = post_id));

comment on table public.post_uploads is
  'Links posts to uploads. Written by the link RPC; the backstop trigger enforces uploader = post author.';

create or replace function kaluwo_private.enforce_post_upload_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.posts p
    join public.uploads u on u.id = new.upload_id
    where p.id = new.post_id
      and p.author_id = u.uploader_id
      and u.status = 'active'
  ) then
    raise exception 'A post can only reference uploads owned by its author'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function kaluwo_private.enforce_post_upload_owner()
  from public, anon, authenticated;

drop trigger if exists enforce_post_upload_owner on public.post_uploads;

create trigger enforce_post_upload_owner
  before insert on public.post_uploads
  for each row execute function kaluwo_private.enforce_post_upload_owner();

-- ---------------------------------------------------------------------------
-- Safe public view (defined after post_uploads so it can filter on links)
-- ---------------------------------------------------------------------------
create or replace view public.public_uploads
with (security_invoker = true, security_barrier = true)
as
select
  u.id,
  -- Removed uploads keep their URL only for staff, who need the mapping to
  -- render the placeholder with the removal reason. Members only ever get a
  -- URL for an active file.
  case
    when u.status = 'active' or public.is_moderator() then u.url
  end as url,
  u.mime_type,
  u.size_bytes,
  u.status
from public.uploads u;

-- Members and anonymous visitors may read an upload only when it is attached
-- to a post they can see. The posts RLS policies apply inside this subquery,
-- so posts in soft-deleted threads and soft-deleted posts stay hidden.
create policy "members can read uploads attached to visible posts"
  on public.uploads for select to anon, authenticated
  using (
    (uploads.status = 'active' or public.is_moderator())
    and exists (
      select 1
      from public.post_uploads pu
      join public.posts p on p.id = pu.post_id
      where pu.upload_id = uploads.id
    )
  );

revoke all on public.public_uploads from public, anon, authenticated;
grant select on public.public_uploads to anon, authenticated;

comment on view public.public_uploads is
  'Safe public view of uploads attached to a visible post. Runs with the caller''s permissions, so uploads RLS and the posts RLS subquery hide deleted content; never exposes uploader identity, hashes, provider ids or the removal reason.';

-- ---------------------------------------------------------------------------
-- upload_hash_blocks: staff block a raw or stripped hash; admins unblock
-- ---------------------------------------------------------------------------
create table public.upload_hash_blocks (
  sha256 text primary key,
  reason text not null,
  blocked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint upload_hash_blocks_hash_format
    check (sha256 ~ '^[a-f0-9]{64}$'),
  constraint upload_hash_blocks_reason_length
    check (char_length(reason) between 1 and 1000)
);

alter table public.upload_hash_blocks enable row level security;

create policy "staff can read upload hash blocks"
  on public.upload_hash_blocks for select to authenticated
  using (public.is_moderator());

revoke all on table public.upload_hash_blocks from anon, authenticated;
grant select on table public.upload_hash_blocks to authenticated;
grant all on table public.upload_hash_blocks to service_role;

comment on table public.upload_hash_blocks is
  'SHA-256 blocklist for uploads. Blocks match either the raw or the stripped hash. Staff write through RPCs; the upload route enforces matches via the service role.';

-- ---------------------------------------------------------------------------
-- Daily upload quota (atomic; service-role only)
-- ---------------------------------------------------------------------------
create table kaluwo_private.upload_quotas (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  count bigint not null default 0,
  bytes bigint not null default 0,
  primary key (user_id, day)
);

revoke all on table kaluwo_private.upload_quotas from public, anon, authenticated;

alter table kaluwo_private.rate_limit_buckets
  drop constraint if exists rate_limit_buckets_action;

alter table kaluwo_private.rate_limit_buckets
  add constraint rate_limit_buckets_action
  check (action in ('thread', 'comment', 'report', 'upload'));

create or replace function public.consume_upload_quota(
  p_user_id uuid,
  p_bytes bigint
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role;
  v_banned boolean;
  v_until timestamptz;
  v_count_limit integer;
  v_byte_limit bigint;
  v_count bigint;
  v_window_start timestamptz;
  v_retry integer;
begin
  if p_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_bytes is null or p_bytes <= 0 then
    raise exception 'The upload size must be positive' using errcode = '22023';
  end if;

  select p.role, p.is_banned, p.banned_until
  into v_role, v_banned, v_until
  from public.profiles p
  where p.id = p_user_id;

  if not found then
    raise exception 'Profile not found' using errcode = '42501';
  end if;

  if v_banned and (v_until is null or v_until > now()) then
    raise exception 'Banned members cannot upload' using errcode = '42501';
  end if;

  -- Role tiers. new_member is stricter. member and senior_member are the
  -- member tier (senior_member is earned, not manually assigned). Staff is
  -- the highest tier.
  if v_role = 'new_member' then
    v_count_limit := 20;
    v_byte_limit := 25 * 1024 * 1024;
  elsif v_role in ('moderator', 'admin') then
    v_count_limit := 1000;
    -- Cast to bigint first: 10 * 1024 * 1024 * 1024 overflows int4.
    v_byte_limit := 10::bigint * 1024 * 1024 * 1024;
  else
    -- member and senior_member
    v_count_limit := 200;
    v_byte_limit := 1024::bigint * 1024 * 1024;
  end if;

  -- Per-15-minute window (same bucket table as posting limits).
  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / 900) * 900
  );

  if v_role = 'new_member' then
    v_count := 3;
  elsif v_role in ('moderator', 'admin') then
    v_count := 50;
  else
    -- member and senior_member
    v_count := 10;
  end if;

  insert into kaluwo_private.rate_limit_buckets as b (user_id, action, window_start, used)
  values (p_user_id, 'upload', v_window_start, 1)
  on conflict (user_id, action, window_start)
  do update set used = b.used + 1
    where b.used < v_count
  returning b.used into v_count;

  if v_count is null then
    v_retry := greatest(
      1,
      ceil(extract(epoch from (
        v_window_start + interval '15 minutes' - clock_timestamp()
      )))::integer
    );

    raise exception 'Kaluwo rate limit exceeded'
      using
        errcode = 'P0001',
        hint = 'kaluwo_rate_limited',
        detail = v_retry::text;
  end if;

  -- A single upload can exceed the whole daily allowance. The ON CONFLICT
  -- guard below only runs for later uploads, so check the first one here.
  if p_bytes > v_byte_limit then
    raise exception 'Kaluwo rate limit exceeded'
      using
        errcode = 'P0001',
        hint = 'kaluwo_rate_limited',
        detail = greatest(
          1,
          ceil(extract(epoch from (
            date_trunc('day', now()) + interval '1 day' - now()
          )))::integer
        )::text;
  end if;

  -- Daily count and bytes, atomically.
  insert into kaluwo_private.upload_quotas as q (user_id, day, count, bytes)
  values (p_user_id, current_date, 1, p_bytes)
  on conflict (user_id, day) do update
    set
      count = q.count + 1,
      bytes = q.bytes + p_bytes
    where q.count < v_count_limit
      and q.bytes + p_bytes <= v_byte_limit
  returning count into v_count;

  if v_count is null then
    v_retry := greatest(
      1,
      ceil(extract(epoch from (
        date_trunc('day', now()) + interval '1 day' - now()
      )))::integer
    );

    raise exception 'Kaluwo rate limit exceeded'
      using
        errcode = 'P0001',
        hint = 'kaluwo_rate_limited',
        detail = v_retry::text;
  end if;

  delete from kaluwo_private.upload_quotas q
  where q.day < current_date - 7;
end;
$$;

revoke all on function public.consume_upload_quota(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.consume_upload_quota(uuid, bigint)
  to service_role;

-- ---------------------------------------------------------------------------
-- Link uploads to a post (caller must be the post author)
-- ---------------------------------------------------------------------------
create or replace function public.link_uploads_to_post(
  p_post_id bigint,
  p_upload_ids uuid[]
)
returns table (linked integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_author uuid;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if public.is_banned() then
    raise exception 'Banned members cannot attach uploads'
      using errcode = '42501';
  end if;

  if p_upload_ids is null or coalesce(array_length(p_upload_ids, 1), 0) = 0 then
    return query select 0;
    return;
  end if;

  if array_length(p_upload_ids, 1) > 8 then
    raise exception 'A post can have at most 8 attachments'
      using errcode = '22023';
  end if;

  select p.author_id into v_author
  from public.posts p
  where p.id = p_post_id
    and not p.is_deleted
  for update;

  if not found then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;

  if v_author is distinct from v_uid then
    raise exception 'You can only attach uploads to your own post'
      using errcode = '42501';
  end if;

  -- The cap is per post, not per call: count the existing links plus the new
  -- ids while the post row is locked.
  if (
    select count(*)
    from (
      select pu.upload_id as id
      from public.post_uploads pu
      where pu.post_id = p_post_id
      union
      select unnest(p_upload_ids) as id
    ) combined
  ) > 8 then
    raise exception 'A post can have at most 8 attachments'
      using errcode = '22023';
  end if;

  -- Lock the upload rows before checking status: FOR SHARE conflicts with the
  -- expiry job's FOR UPDATE, so an upload cannot be removed between this check
  -- and the insert.
  perform 1
  from public.uploads u
  where u.id = any(p_upload_ids)
  for share;

  select count(*)::integer into v_count
  from (select distinct unnest(p_upload_ids) as id) ids
  join public.uploads u
    on u.id = ids.id
   and u.status = 'active'
   and u.uploader_id = v_uid;

  if v_count <> array_length(p_upload_ids, 1) then
    raise exception 'One or more uploads are not available to attach'
      using errcode = '22023';
  end if;

  insert into public.post_uploads (post_id, upload_id)
  select p_post_id, unnest(p_upload_ids)
  on conflict do nothing;

  return query
    select count(*)::integer
    from public.post_uploads pu
    where pu.post_id = p_post_id
      and pu.upload_id = any(p_upload_ids);
end;
$$;

revoke all on function public.link_uploads_to_post(bigint, uuid[])
  from public, anon, authenticated;
grant execute on function public.link_uploads_to_post(bigint, uuid[])
  to authenticated;

-- ---------------------------------------------------------------------------
-- Staff removal / restore (mod_log atomic, hierarchy enforced)
-- ---------------------------------------------------------------------------
create or replace function public.moderate_remove_upload(
  p_upload_id uuid,
  p_reason text
)
returns table (
  changed boolean,
  mod_log_id bigint,
  provider text,
  provider_file_id text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_reason text;
  v_uploader uuid;
  v_provider text;
  v_provider_file_id text;
  v_status text;
  v_log_id bigint;
begin
  v_actor := kaluwo_private.assert_staff();
  v_reason := kaluwo_private.require_reason(p_reason);

  select u.uploader_id, u.provider, u.provider_file_id, u.status
  into v_uploader, v_provider, v_provider_file_id, v_status
  from public.uploads u
  where u.id = p_upload_id
  for update;

  if not found then
    raise exception 'Upload not found' using errcode = 'P0002';
  end if;

  if v_status = 'removed' then
    return query select false, null::bigint, v_provider, v_provider_file_id;
    return;
  end if;

  perform kaluwo_private.assert_can_moderate_profile(v_uploader);

  update public.uploads
  set
    status = 'removed',
    removal_reason = v_reason,
    removed_at = now(),
    removed_by = v_actor
  where id = p_upload_id;

  v_log_id := kaluwo_private.write_mod_log(
    'upload.remove'::public.mod_action,
    'upload'::public.mod_target_type,
    p_upload_id::text,
    coalesce(v_provider_file_id, 'upload'),
    v_reason,
    jsonb_build_object('status', 'active'),
    jsonb_build_object('status', 'removed')
  );

  return query select true, v_log_id, v_provider, v_provider_file_id;
end;
$$;

create or replace function public.moderate_restore_upload(
  p_upload_id uuid,
  p_reason text
)
returns table (changed boolean, mod_log_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_reason text;
  v_uploader uuid;
  v_status text;
  v_log_id bigint;
begin
  v_actor := kaluwo_private.assert_staff();
  v_reason := kaluwo_private.require_reason(p_reason);

  select u.uploader_id, u.status
  into v_uploader, v_status
  from public.uploads u
  where u.id = p_upload_id
  for update;

  if not found then
    raise exception 'Upload not found' using errcode = 'P0002';
  end if;

  if v_status = 'active' then
    return query select false, null::bigint;
    return;
  end if;

  perform kaluwo_private.assert_can_moderate_profile(v_uploader);

  update public.uploads
  set
    status = 'active',
    removal_reason = null,
    removed_at = null,
    removed_by = null
  where id = p_upload_id;

  v_log_id := kaluwo_private.write_mod_log(
    'upload.restore'::public.mod_action,
    'upload'::public.mod_target_type,
    p_upload_id::text,
    'upload',
    v_reason,
    jsonb_build_object('status', 'removed'),
    jsonb_build_object('status', 'active')
  );

  return query select true, v_log_id;
end;
$$;

revoke all on function public.moderate_remove_upload(uuid, text)
  from public, anon, authenticated;
revoke all on function public.moderate_restore_upload(uuid, text)
  from public, anon, authenticated;

grant execute on function public.moderate_remove_upload(uuid, text)
  to authenticated;
grant execute on function public.moderate_restore_upload(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Hash blocklist (staff block; admins unblock)
-- ---------------------------------------------------------------------------
create or replace function public.moderate_block_upload_hash(
  p_sha256 text,
  p_reason text
)
returns table (changed boolean, mod_log_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_reason text;
  v_log_id bigint;
begin
  v_actor := kaluwo_private.assert_staff();
  v_reason := kaluwo_private.require_reason(p_reason);

  if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid SHA-256 hash' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.upload_hash_blocks b
    where b.sha256 = p_sha256
  ) then
    return query select false, null::bigint;
    return;
  end if;

  insert into public.upload_hash_blocks (sha256, reason, blocked_by)
  values (p_sha256, v_reason, v_actor);

  v_log_id := kaluwo_private.write_mod_log(
    'upload.block_hash'::public.mod_action,
    'upload_hash'::public.mod_target_type,
    p_sha256,
    left(p_sha256, 12),
    v_reason,
    jsonb_build_object('blocked', false),
    jsonb_build_object('blocked', true)
  );

  return query select true, v_log_id;
end;
$$;

create or replace function public.moderate_unblock_upload_hash(
  p_sha256 text,
  p_reason text
)
returns table (changed boolean, mod_log_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_reason text;
  v_log_id bigint;
begin
  perform kaluwo_private.assert_admin();
  v_reason := kaluwo_private.require_reason(p_reason);

  if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid SHA-256 hash' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.upload_hash_blocks b
    where b.sha256 = p_sha256
  ) then
    return query select false, null::bigint;
    return;
  end if;

  delete from public.upload_hash_blocks
  where sha256 = p_sha256;

  v_log_id := kaluwo_private.write_mod_log(
    'upload.unblock_hash'::public.mod_action,
    'upload_hash'::public.mod_target_type,
    p_sha256,
    left(p_sha256, 12),
    v_reason,
    jsonb_build_object('blocked', true),
    jsonb_build_object('blocked', false)
  );

  return query select true, v_log_id;
end;
$$;

revoke all on function public.moderate_block_upload_hash(text, text)
  from public, anon, authenticated;
revoke all on function public.moderate_unblock_upload_hash(text, text)
  from public, anon, authenticated;
grant execute on function public.moderate_block_upload_hash(text, text)
  to authenticated;
grant execute on function public.moderate_unblock_upload_hash(text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Expire unlinked uploads (service role only; called by the cleanup script)
-- ---------------------------------------------------------------------------
create or replace function public.expire_unlinked_uploads()
returns table (id uuid, provider_file_id text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
begin
  for v_row in
    select u.id, u.provider_file_id
    from public.uploads u
    where u.status = 'active'
      and u.created_at < now() - interval '24 hours'
      and not exists (
        select 1
        from public.post_uploads pu
        where pu.upload_id = u.id
      )
    for update skip locked
  loop
    update public.uploads u
    set
      status = 'removed',
      removal_reason = 'Upload expired before being attached to a post',
      removed_at = now(),
      removed_by = null
    where u.id = v_row.id;

    insert into public.mod_log (
      actor_id,
      actor_username,
      action,
      target_type,
      target_id,
      target_label,
      reason,
      previous_value,
      new_value
    )
    values (
      null,
      'system',
      'upload.remove',
      'upload',
      v_row.id::text,
      coalesce(v_row.provider_file_id, 'upload'),
      'Upload expired before being attached to a post',
      '{"status":"active"}'::jsonb,
      '{"status":"removed"}'::jsonb
    );

    -- The output columns are the function's OUT parameters; assign them and
    -- emit a row for each upload actually expired.
    id := v_row.id;
    provider_file_id := v_row.provider_file_id;
    return next;
  end loop;

  return;
end;
$$;

revoke all on function public.expire_unlinked_uploads()
  from public, anon, authenticated;
grant execute on function public.expire_unlinked_uploads()
  to service_role;

-- upload_exists lets the reports INSERT policy validate an upload target
-- without granting members any visibility of the uploads table.
create or replace function kaluwo_private.upload_exists(p_upload_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.uploads u where u.id = p_upload_id
  );
$$;

revoke all on function kaluwo_private.upload_exists(uuid)
  from public, anon;
grant execute on function kaluwo_private.upload_exists(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Reports: upload target
-- ---------------------------------------------------------------------------
alter table public.reports
  add column target_upload_id uuid references public.uploads (id) on delete cascade;

alter table public.reports
  drop constraint if exists reports_target_shape;

alter table public.reports
  add constraint reports_target_shape check (
    (
      target_type = 'post'
      and post_id is not null
      and target_user_id is null
      and target_upload_id is null
    )
    or (
      target_type = 'user'
      and post_id is null
      and target_user_id is not null
      and target_upload_id is null
    )
    or (
      target_type = 'upload'
      and post_id is null
      and target_user_id is null
      and target_upload_id is not null
    )
  );

create unique index reports_open_upload_reporter_idx
  on public.reports (target_upload_id, reporter_id)
  where status = 'open' and target_upload_id is not null;

create index reports_target_upload_idx
  on public.reports (target_upload_id, created_at desc)
  where target_upload_id is not null;

drop policy if exists "members can create reports" on public.reports;

create policy "members can create reports"
  on public.reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and not public.is_banned()
    and status = 'open'
    and (
      (
        target_type = 'post'
        and post_id is not null
        and target_user_id is null
        and target_upload_id is null
        and exists (
          select 1
          from public.posts p
          where p.id = post_id
        )
      )
      or (
        target_type = 'user'
        and post_id is null
        and target_user_id is not null
        and target_upload_id is null
        and target_user_id <> (select auth.uid())
        and exists (
          select 1
          from public.profiles p
          where p.id = target_user_id
        )
      )
      or (
        target_type = 'upload'
        and post_id is null
        and target_user_id is null
        and target_upload_id is not null
        and kaluwo_private.upload_exists(target_upload_id)
      )
    )
  );

-- Replace the resolve RPC with the upload-aware version.
create or replace function public.staff_resolve_report(
  p_report_id bigint,
  p_status public.report_status,
  p_note text
)
returns table (changed boolean, mod_log_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_actor_role public.user_role;
  v_report public.reports%rowtype;
  v_target_author uuid;
  v_target_role public.user_role;
  v_note text;
  v_log_id bigint;
  v_changed boolean := false;
begin
  v_actor := kaluwo_private.assert_staff();

  if p_status not in ('resolved', 'dismissed') then
    raise exception 'The report status must be resolved or dismissed'
      using errcode = '22023';
  end if;

  v_note := btrim(coalesce(p_note, ''));

  if char_length(v_note) < 1 then
    raise exception 'A resolution note is required' using errcode = '22023';
  end if;

  if char_length(v_note) > 2000 then
    raise exception 'The resolution note must be 2000 characters or fewer'
      using errcode = '22023';
  end if;

  select p.role into v_actor_role
  from public.profiles p
  where p.id = v_actor;

  select * into v_report
  from public.reports r
  where r.id = p_report_id
  for update;

  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;

  if v_report.target_type = 'post' then
    select p.author_id into v_target_author
    from public.posts p
    where p.id = v_report.post_id;

    if v_target_author = v_actor then
      raise exception 'You cannot resolve a report about your own content'
        using errcode = '42501';
    end if;

    if v_target_author is not null then
      select p.role into v_target_role
      from public.profiles p
      where p.id = v_target_author;
    end if;
  elsif v_report.target_type = 'user' then
    if v_report.target_user_id = v_actor then
      raise exception 'You cannot resolve a report about yourself'
        using errcode = '42501';
    end if;

    select p.role into v_target_role
    from public.profiles p
    where p.id = v_report.target_user_id;
  else
    select u.uploader_id into v_target_author
    from public.uploads u
    where u.id = v_report.target_upload_id;

    if v_target_author = v_actor then
      raise exception 'You cannot resolve a report about your own upload'
        using errcode = '42501';
    end if;

    if v_target_author is not null then
      select p.role into v_target_role
      from public.profiles p
      where p.id = v_target_author;
    end if;
  end if;

  if v_target_role in ('moderator', 'admin') and v_actor_role <> 'admin' then
    raise exception 'Only an admin can resolve a report about a moderator or admin'
      using errcode = '42501';
  end if;

  if v_report.status <> 'open' then
    if v_report.status = p_status then
      select rr.mod_log_id into v_log_id
      from public.report_resolutions rr
      where rr.report_id = p_report_id;

      return query select false, v_log_id;
      return;
    end if;

    raise exception 'This report has already been handled'
      using errcode = '22023';
  end if;

  v_log_id := kaluwo_private.write_mod_log(
    case
      when p_status = 'resolved' then 'report.resolve'::public.mod_action
      else 'report.dismiss'::public.mod_action
    end,
    'report'::public.mod_target_type,
    p_report_id::text,
    'report #' || p_report_id::text,
    v_note,
    jsonb_build_object('status', v_report.status),
    jsonb_build_object('status', p_status)
  );

  insert into public.report_resolutions (
    report_id,
    resolved_by,
    resolution_note,
    mod_log_id
  )
  values (
    p_report_id,
    v_actor,
    v_note,
    v_log_id
  );

  update public.reports
  set status = p_status
  where id = p_report_id;

  v_changed := true;

  return query select v_changed, v_log_id;
end;
$$;

comment on function public.expire_unlinked_uploads() is
  'Service-role cleanup: marks active uploads older than 24h with no post link as removed by the system and writes a mod-log row. Called by scripts/cleanup-uploads.mjs.';
comment on function public.link_uploads_to_post(bigint, uuid[]) is
  'Links up to 8 active uploads to a post. The caller must be the post author; uploads must belong to the caller.';
comment on function public.moderate_remove_upload(uuid, text) is
  'Staff removes an upload (status = removed) with a required reason and a mod-log row. Hierarchy rules match content moderation.';
comment on function public.moderate_restore_upload(uuid, text) is
  'Staff restores a removed upload with a required reason and a mod-log row.';
comment on function public.moderate_block_upload_hash(text, text) is
  'Staff blocks a raw or stripped SHA-256 hash. The upload route rejects matching files.';
comment on function public.moderate_unblock_upload_hash(text, text) is
  'Admin-only removal of a hash block.';
comment on function public.consume_upload_quota(uuid, bigint) is
  'Atomic daily count/byte quota per role, checked by the upload route through the service role.';

commit;
