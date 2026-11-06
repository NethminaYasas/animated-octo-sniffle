-- Phase 2: admin invite-code management with hashed codes and one-time
-- plaintext display.
--
-- The database stores only a SHA-256 hash of a 128-bit random code and a short
-- display hint. The plaintext is generated and returned once by
-- admin_create_invite_codes(); it is never stored or logged.

begin;

create extension if not exists pgcrypto;

create or replace function kaluwo_private.invite_code_hash(p_code text)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select encode(digest(lower(btrim(coalesce(p_code, ''))), 'sha256'), 'hex');
$$;

create or replace function kaluwo_private.generate_invite_code()
returns text
language sql
volatile
set search_path = public, extensions, pg_temp
as $$
  select encode(gen_random_bytes(16), 'hex');
$$;

revoke all on function kaluwo_private.invite_code_hash(text)
  from public, anon, authenticated;
revoke all on function kaluwo_private.generate_invite_code()
  from public, anon, authenticated;

alter table public.invite_codes
  add column code_hash text,
  add column code_hint text,
  add column revoked_at timestamptz,
  add column revoked_by uuid references public.profiles (id) on delete set null,
  add column created_request_id uuid;

update public.invite_codes
set
  code_hash = kaluwo_private.invite_code_hash(code),
  code_hint = left(code, 6)
where code_hash is null;

alter table public.invite_codes
  alter column code_hash set not null,
  alter column code_hint set not null;

alter table public.invite_codes
  drop constraint invite_codes_pkey;

alter table public.invite_codes
  drop constraint if exists invite_codes_code_format;

alter table public.invite_codes
  drop column code;

alter table public.invite_codes
  add primary key (code_hash);

alter table public.invite_codes
  add constraint invite_codes_hash_format
    check (code_hash ~ '^[a-f0-9]{64}$'),
  add constraint invite_codes_hint_format
    check (code_hint ~ '^[a-z0-9]{4,12}$');

create index invite_codes_request_idx
  on public.invite_codes (created_request_id)
  where created_request_id is not null;

create index invite_codes_active_idx
  on public.invite_codes (created_at)
  where used_at is null and revoked_at is null;

comment on table public.invite_codes is
  'Single-use invite codes stored as SHA-256 hashes. Admin-managed through the moderation UI; plaintext is shown only once at creation.';
comment on column public.invite_codes.code_hash is
  'SHA-256 hash of the lowercase plaintext code.';
comment on column public.invite_codes.code_hint is
  'First six characters of the plaintext code, for staff identification only.';
comment on column public.invite_codes.created_request_id is
  'Idempotency batch id. Repeating a create request with the same id returns no new plaintext codes.';

create or replace function public.consume_invite_code(p_code text)
returns boolean
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  with claimed as (
    update public.invite_codes
    set used_at = now()
    where code_hash = kaluwo_private.invite_code_hash(p_code)
      and used_at is null
      and revoked_at is null
    returning 1
  )
  select exists (select 1 from claimed);
$$;

revoke all on function public.consume_invite_code(text) from public;
revoke all on function public.consume_invite_code(text)
  from anon, authenticated;
grant execute on function public.consume_invite_code(text) to service_role;

comment on function public.consume_invite_code(text) is
  'Atomically claims a single-use, non-revoked invite code by hashing the supplied plaintext. Service role only.';

-- ---------------------------------------------------------------------------
-- Admin invite management
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_invite_codes(p_limit integer default 100)
returns table (
  code_hash text,
  code_hint text,
  created_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by_username text,
  used_by_username text,
  revoked_by_username text,
  status text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := kaluwo_private.assert_admin();
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  return query
    select
      i.code_hash,
      i.code_hint,
      i.created_at,
      i.used_at,
      i.revoked_at,
      cb.username,
      ub.username,
      rb.username,
      case
        when i.used_at is not null then 'used'
        when i.revoked_at is not null then 'revoked'
        else 'active'
      end
    from public.invite_codes i
    left join public.profiles cb on cb.id = i.created_by
    left join public.profiles ub on ub.id = i.used_by
    left join public.profiles rb on rb.id = i.revoked_by
    order by i.created_at desc
    limit v_limit;
end;
$$;

create or replace function public.admin_create_invite_codes(
  p_count integer,
  p_reason text,
  p_request_id uuid default null
)
returns table (
  code text,
  code_hash text,
  code_hint text,
  batch_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_reason text;
  v_batch_id uuid;
  v_code text;
  v_hash text;
  v_hint text;
  v_changed integer := 0;
begin
  v_actor := kaluwo_private.assert_admin();
  v_reason := kaluwo_private.require_reason(p_reason);

  if p_count is null or p_count < 1 or p_count > 50 then
    raise exception 'Create between 1 and 50 invite codes at a time'
      using errcode = '22023';
  end if;

  v_batch_id := coalesce(p_request_id, gen_random_uuid());

  if p_request_id is not null and exists (
    select 1
    from public.invite_codes i
    where i.created_request_id = p_request_id
  ) then
    -- The plaintext was returned by the first request and is not recoverable.
    return;
  end if;

  for v_changed in 1..p_count loop
    v_code := kaluwo_private.generate_invite_code();
    v_hash := kaluwo_private.invite_code_hash(v_code);
    v_hint := left(v_code, 6);

    insert into public.invite_codes (
      code_hash,
      code_hint,
      created_by,
      created_request_id
    )
    values (
      v_hash,
      v_hint,
      v_actor,
      v_batch_id
    );

    return query select v_code, v_hash, v_hint, v_batch_id;
  end loop;

  perform kaluwo_private.write_mod_log(
    'invite.create'::public.mod_action,
    'invite'::public.mod_target_type,
    v_batch_id::text,
    'invite batch',
    v_reason,
    '{}'::jsonb,
    jsonb_build_object(
      'count', p_count,
      'hints', (
        select jsonb_agg(i.code_hint order by i.created_at)
        from public.invite_codes i
        where i.created_request_id = v_batch_id
      )
    )
  );
end;
$$;

create or replace function public.admin_revoke_invite_code(
  p_code_hash text,
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
  v_hint text;
  v_used_at timestamptz;
  v_revoked_at timestamptz;
  v_log_id bigint;
begin
  v_actor := kaluwo_private.assert_admin();
  v_reason := kaluwo_private.require_reason(p_reason);

  if p_code_hash is null or p_code_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid invite-code identifier' using errcode = '22023';
  end if;

  select i.code_hint, i.used_at, i.revoked_at
  into v_hint, v_used_at, v_revoked_at
  from public.invite_codes i
  where i.code_hash = p_code_hash
  for update;

  if not found then
    raise exception 'Invite code not found' using errcode = 'P0002';
  end if;

  if v_used_at is not null then
    raise exception 'Used invite codes cannot be revoked' using errcode = '22023';
  end if;

  if v_revoked_at is not null then
    return query select false, null::bigint;
    return;
  end if;

  update public.invite_codes
  set revoked_at = now(), revoked_by = v_actor
  where code_hash = p_code_hash;

  v_log_id := kaluwo_private.write_mod_log(
    'invite.revoke'::public.mod_action,
    'invite'::public.mod_target_type,
    p_code_hash,
    v_hint,
    v_reason,
    jsonb_build_object('revoked_at', null),
    jsonb_build_object('revoked_at', now())
  );

  return query select true, v_log_id;
end;
$$;

revoke all on function public.admin_list_invite_codes(integer)
  from public, anon, authenticated;
revoke all on function public.admin_create_invite_codes(integer, text, uuid)
  from public, anon, authenticated;
revoke all on function public.admin_revoke_invite_code(text, text)
  from public, anon, authenticated;

grant execute on function public.admin_list_invite_codes(integer)
  to authenticated;
grant execute on function public.admin_create_invite_codes(integer, text, uuid)
  to authenticated;
grant execute on function public.admin_revoke_invite_code(text, text)
  to authenticated;

comment on function public.admin_list_invite_codes(integer) is
  'Admin-only invite-code list without plaintext codes.';
comment on function public.admin_create_invite_codes(integer, text, uuid) is
  'Admin-only invite creation. Returns plaintext codes once; repeat requests with the same request id return no codes.';
comment on function public.admin_revoke_invite_code(text, text) is
  'Admin-only revocation of an unused invite code by its hash.';

commit;
