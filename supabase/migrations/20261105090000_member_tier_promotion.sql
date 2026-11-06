-- Membership tiers (part 2 of 3): defaults, backfill and promotion function.
--
-- A new account starts as new_member. After 28 days it becomes member, and
-- after 2 years it becomes senior_member. Moderator/admin accounts are never
-- changed automatically, and the role stays admin-controlled.

begin;

alter table public.profiles
  alter column role set default 'new_member';

-- Re-tier existing accounts by age. Staff roles are left untouched.
update public.profiles
set role = case
  when created_at <= now() - interval '2 years' then 'senior_member'::public.user_role
  when created_at <= now() - interval '28 days' then 'member'::public.user_role
  else 'new_member'::public.user_role
end
where role = 'member';

-- Members may only create their own profile with the default tier.
drop policy "users can insert their own profile" on public.profiles;

create policy "users can insert their own profile"
  on public.profiles for insert to authenticated
  with check (
    id = (select auth.uid())
    and role = 'new_member'
    and is_banned = false
    and reaction_score = 0
    and created_at = now()
  );

-- Promote every account whose age has crossed a threshold. Safe to call
-- repeatedly; only rows that actually change are updated.
create or replace function public.promote_member_roles()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  promoted integer;
begin
  update public.profiles
  set role = case
    when created_at <= now() - interval '2 years' then 'senior_member'::public.user_role
    else 'member'::public.user_role
  end
  where role in ('new_member', 'member')
    and (
      created_at <= now() - interval '2 years'
      or (role = 'new_member' and created_at <= now() - interval '28 days')
    );

  get diagnostics promoted = row_count;
  return promoted;
end;
$$;

revoke all on function public.promote_member_roles() from public;
revoke all on function public.promote_member_roles() from anon, authenticated;
grant execute on function public.promote_member_roles() to service_role;

comment on function public.promote_member_roles() is
  'Promotes new_member to member after 28 days and member to senior_member after 2 years.';

commit;
