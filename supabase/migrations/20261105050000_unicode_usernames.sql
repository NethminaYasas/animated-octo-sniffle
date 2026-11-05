-- Unicode usernames (English, Sinhala, Tamil).
--
-- kaluwo is a Sri Lankan forum, so members may want their name in Sinhala or
-- Tamil. Usernames stay lowercase, NFC-normalised and 3-20 characters.
--
-- Allowed:
--   * Latin a-z
--   * digits 0-9
--   * underscore
--   * Sinhala block U+0D80-U+0DFF (letters, marks, digits)
--   * Tamil block U+0B80-U+0BFF (letters, marks, digits)
--   * ZWNJ / ZWJ, needed for some conjunct sequences
--
-- Unicode lookalikes cannot be eliminated completely, but limiting the
-- scripts to the three languages the forum supports keeps impersonation risk
-- much lower than allowing every script.
--
-- Supabase Auth still needs an email-shaped identifier for invite accounts.
-- That address is now random (see src/lib/auth/internal-email.ts) because a
-- Sinhala local part is not a safe email address.

begin;

-- ---------------------------------------------------------------------------
-- Username check constraint
-- ---------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_username_format;

alter table public.profiles
  add constraint profiles_username_format check (
    char_length(username) between 3 and 20
    and username = normalize(username, NFC)
    and username ~ E'^[a-z0-9_\u0B80-\u0BFF\u0D80-\u0DFF\u200C\u200D]+$'
  );

-- ---------------------------------------------------------------------------
-- Trigger: create a profile for every new auth user
--
-- Same invite gate as the previous migration, with Unicode-safe normalisation.
-- regexp_replace() keeps only the allowed scripts and turns everything else
-- into underscores; char_length() and left() count characters, not bytes.
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

  base := normalize(lower(base), NFC);
  base := regexp_replace(
    base,
    E'[^a-z0-9_\u0B80-\u0BFF\u0D80-\u0DFF\u200C\u200D]+',
    '_',
    'g'
  );
  base := trim(both '_' from base);

  if char_length(base) > 20 then
    base := left(base, 20);
  end if;

  if char_length(base) < 3 then
    base := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

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
-- Username -> email lookup
--
-- Normalise both sides in SQL as well, so a decomposed sequence typed into the
-- login form still resolves to the same account.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_login_email(lookup_username text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username = normalize(lower(trim(lookup_username)), NFC)
  limit 1;
$$;

revoke all on function public.resolve_login_email(text) from public;
revoke all on function public.resolve_login_email(text) from anon, authenticated;
grant execute on function public.resolve_login_email(text) to service_role;

comment on function public.resolve_login_email(text) is
  'Maps a username to the Supabase Auth email for server-side password login. Service role only.';

commit;
