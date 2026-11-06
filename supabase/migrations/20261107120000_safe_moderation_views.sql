-- Phase 2 lint fix: the my_bans and my_warnings views are dropped and
-- replaced by SECURITY DEFINER functions with a pinned search_path.
--
-- Why functions and not column grants + security_invoker views:
--   PostgreSQL column privileges are granted to a role name, not to an RLS
--   policy, and members and staff share the `authenticated` role here. Granting
--   members only the safe columns would therefore also strip staff of the
--   moderator columns on the same role, breaking the existing staff read
--   paths (base-table SELECT via the is_moderator() RLS policy with the
--   moderator_id join). Column grants cannot satisfy both audiences cleanly.
--
-- The functions return only the caller's own rows and only the safe columns,
-- never the issuing moderator's id. Staff keep reading the base tables
-- through the existing RLS policies and see the moderator exactly as before.
--
-- EXECUTE is revoked from public and anon; authenticated may call them. The
-- functions are not a new privilege: they expose less than the views did and
-- exactly what the views exposed (own rows, safe columns).

begin;

drop view if exists public.my_bans;
drop view if exists public.my_warnings;

create or replace function public.my_bans()
returns table (
  id bigint,
  user_id uuid,
  reason text,
  expires_at timestamptz,
  created_at timestamptz,
  lifted_at timestamptz,
  lift_reason text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    b.id,
    b.user_id,
    b.reason,
    b.expires_at,
    b.created_at,
    b.lifted_at,
    b.lift_reason
  from public.member_bans b
  where b.user_id = (select auth.uid())
  order by b.created_at desc;
$$;

revoke all on function public.my_bans()
  from public, anon, authenticated;
grant execute on function public.my_bans()
  to authenticated;

comment on function public.my_bans() is
  'A member''s own ban history without the issuing moderator identity. Staff read the base table instead.';

create or replace function public.my_warnings()
returns table (
  id bigint,
  user_id uuid,
  reason text,
  created_at timestamptz,
  acknowledged_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    w.id,
    w.user_id,
    w.reason,
    w.created_at,
    w.acknowledged_at
  from public.member_warnings w
  where w.user_id = (select auth.uid())
  order by w.created_at desc;
$$;

revoke all on function public.my_warnings()
  from public, anon, authenticated;
grant execute on function public.my_warnings()
  to authenticated;

comment on function public.my_warnings() is
  'A member''s own warnings without the issuing moderator identity. Staff read the base table instead.';

-- The base tables keep their staff-only RLS policy and the full-table SELECT
-- grant for authenticated; only staff pass the policy. No member-visible
-- function or view exposes the moderator columns.
commit;
