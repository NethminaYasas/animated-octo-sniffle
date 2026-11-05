-- Allow reactions on posts as well as comments.
--
-- The original insert policy only accepted replies (`not p.is_opening`), which
-- matched the first version of the product. Members can now react to any
-- active post in an active thread, but not to their own content. The reaction
-- score still counts comments only; see 20261105020000_reaction_scores.sql.
--
-- Banned members can still react (but cannot post, comment, report or upload);
-- the reaction policies therefore do not call is_banned(). This is a separate
-- migration rather than an edit to the initial schema so it applies cleanly
-- whether or not the first migration has already been run.

begin;

drop policy if exists "members can react to comments" on public.reactions;
drop policy if exists "members can change their own reaction" on public.reactions;

create policy "members can react to posts and comments"
  on public.reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.posts p
      join public.threads t on t.id = p.thread_id
      where p.id = post_id
        and p.author_id is distinct from (select auth.uid())
        and not p.is_deleted
        and not t.is_deleted
    )
  );

create policy "members can change their own reaction"
  on public.reactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

commit;
