-- Username login support.
--
-- Supabase Auth's email provider needs an email address to verify a password.
-- The login form only asks for a username, so a server action resolves the
-- username to the account email before calling Supabase Auth.
--
-- SECURITY:
--   * This function can read auth.users. Only the service role may execute it.
--   * anon/authenticated are explicitly denied, so a browser cannot turn a
--     username into an email address.
--   * The service role key is used only in a server action and never reaches
--     the browser.

begin;

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
  where p.username = lower(trim(lookup_username))
  limit 1;
$$;

revoke all on function public.resolve_login_email(text) from public;
revoke all on function public.resolve_login_email(text) from anon, authenticated;
grant execute on function public.resolve_login_email(text) to service_role;

comment on function public.resolve_login_email(text) is
  'Maps a username to the Supabase Auth email for server-side password login. Service role only.';

commit;
