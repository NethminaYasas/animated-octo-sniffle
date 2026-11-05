-- Google sign-in and invite-only password sign-up.
--
-- Changes:
--   * Email verification is gone. Google OAuth is the verification method for
--     Google accounts.
--   * New Google users get a profile with onboarding_completed = false until
--     they choose a username and set a password.
--   * Sign-up with a username and password requires a single-use invite code.
--
-- Invite codes are created by an admin in the SQL Editor (see
-- supabase/README.md). The browser has no access to the table at all; the
-- server action claims a code atomically with the service role.

begin;

-- ---------------------------------------------------------------------------
-- profiles.onboarding_completed
--
-- Existing rows were created before Google sign-in existed, so they already
-- have a username and a password. New rows start false unless the trusted
-- server-side create-user call marks them complete.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column onboarding_completed boolean not null default false;

update public.profiles set onboarding_completed = true;

-- ---------------------------------------------------------------------------
-- Trigger: create a profile for every new auth user
--
-- Same as the initial migration, but it now records whether the account was
-- created through the trusted invite path and refuses users created outside
-- the two allowed flows.
--
-- "kaluwo_invite" lives in raw_app_meta_data, which only the service role can
-- write. It cannot be spoofed with sign-up options.data (that lands in
-- raw_user_meta_data). Google OAuth users are identified by app_metadata
-- provider = 'google'. Any other new auth user (for example a direct call to
-- Supabase's public sign-up endpoint with the anon key) raises, so the invite
-- gate cannot be bypassed.
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
  onboarded boolean;
  provider text;
begin
  provider := coalesce(new.raw_app_meta_data ->> 'provider', '');
  onboarded :=
    coalesce(new.raw_app_meta_data ->> 'kaluwo_invite', 'false') = 'true';

  if provider <> 'google'
     and not (coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google')
     and not onboarded then
    raise exception
      'New accounts must use Google sign-in or a valid invite code';
  end if;

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

  insert into public.profiles (id, username, onboarding_completed)
  values (new.id, candidate, onboarded);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- invite_codes
--
-- One row per code. A code is single-use: consume_invite_code() sets used_at
-- and used_by in the same statement that checks used_at is null, so two
-- concurrent sign-ups cannot both redeem the same code.
--
-- There are deliberately no RLS policies. anon and authenticated have no
-- grants on the table, and the service role bypasses RLS.
-- ---------------------------------------------------------------------------
create table public.invite_codes (
  code text primary key,
  created_by uuid references public.profiles (id) on delete set null,
  used_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  constraint invite_codes_code_format check (code ~ '^[a-z0-9]{16,64}$')
);

create index invite_codes_unused_idx
  on public.invite_codes (created_at)
  where used_at is null;

alter table public.invite_codes enable row level security;

revoke all on public.invite_codes from anon, authenticated;
grant select, insert, update, delete on public.invite_codes to service_role;

-- ---------------------------------------------------------------------------
-- Claim an invite code. Service role only.
--
-- Returns true when this call consumed the code. Returns false when the code
-- does not exist or was already used. The UPDATE ... WHERE used_at IS NULL is
-- atomic, so it is safe under concurrent sign-ups.
--
-- used_by is filled in after the auth user exists. If user creation fails, the
-- server action releases the claim by setting used_at back to null.
-- ---------------------------------------------------------------------------
create or replace function public.consume_invite_code(p_code text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  with claimed as (
    update public.invite_codes
    set used_at = now()
    where code = lower(trim(p_code))
      and used_at is null
    returning 1
  )
  select exists (select 1 from claimed);
$$;

revoke all on function public.consume_invite_code(text) from public;
revoke all on function public.consume_invite_code(text)
  from anon, authenticated;
grant execute on function public.consume_invite_code(text) to service_role;

comment on function public.consume_invite_code(text) is
  'Atomically claims a single-use invite code. Service role only.';

comment on table public.invite_codes is
  'Single-use invite codes for username + password sign-up. Admin-managed through the SQL Editor.';

commit;
