-- Thread reaction summary (Phase 1 follow-up).
--
-- The thread page must not fetch every raw reaction row: PostgREST caps a
-- response at max_rows (1000 by default), which would silently undercount a
-- busy thread and can lose the viewer's own reaction. Aggregate in the
-- database instead.
--
-- SECURITY INVOKER: the reactions SELECT policy still applies. The function
-- returns only per-kind totals and whether the caller reacted; it never
-- exposes other members' user ids.

begin;

create or replace function public.thread_reaction_summary(p_thread_id bigint)
returns table (
  post_id bigint,
  kind public.reaction_kind,
  total bigint,
  mine boolean
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    r.post_id,
    r.kind,
    count(*)::bigint as total,
    coalesce(
      bool_or(r.user_id = (select auth.uid())),
      false
    ) as mine
  from public.reactions r
  join public.posts p on p.id = r.post_id
  where p.thread_id = p_thread_id
    and not p.is_deleted
  group by r.post_id, r.kind;
$$;

revoke all on function public.thread_reaction_summary(bigint) from public;
grant execute on function public.thread_reaction_summary(bigint)
  to anon, authenticated;

comment on function public.thread_reaction_summary(bigint) is
  'Per-post reaction totals and the caller''s own reaction for one thread.';

commit;
