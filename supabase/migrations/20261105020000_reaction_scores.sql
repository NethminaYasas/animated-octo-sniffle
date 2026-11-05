-- Reaction score for each member.
--
-- Positive reactions (like, laugh, wow) add 1; negative reactions (anger,
-- dislike) subtract 1. Only reactions on a member's comments count, and only
-- while the comment is not soft-deleted.
--
-- The score is recomputed from the reactions table whenever a reaction or a
-- relevant post column changes. Recomputing avoids drift from update/delete
-- edge cases, and the data volumes here are small.

begin;

alter table public.profiles
  add column reaction_score integer not null default 0;

create index profiles_reaction_score_idx
  on public.profiles (reaction_score desc);

-- Backfill in case reactions already exist.
update public.profiles p
set reaction_score = coalesce((
  select sum(case when r.kind in ('like', 'laugh', 'wow') then 1 else -1 end)
  from public.reactions r
  join public.posts po on po.id = r.post_id
  where po.author_id = p.id
    and not po.is_deleted
    and not po.is_opening
), 0)::integer;

-- Recompute one member's score from scratch.
create or replace function public.recompute_reaction_score(target_profile uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.profiles p
  set reaction_score = coalesce((
    select sum(case when r.kind in ('like', 'laugh', 'wow') then 1 else -1 end)
    from public.reactions r
    join public.posts po on po.id = r.post_id
    where po.author_id = p.id
      and not po.is_deleted
      and not po.is_opening
  ), 0)::integer
  where p.id = target_profile;
$$;

revoke all on function public.recompute_reaction_score(uuid) from public;
revoke all on function public.recompute_reaction_score(uuid) from anon, authenticated;
grant execute on function public.recompute_reaction_score(uuid) to service_role;

-- Reaction insert/update/delete -> recompute the affected comment author(s).
create or replace function public.reactions_recompute_score()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_author uuid;
  new_author uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select author_id into old_author
    from public.posts
    where id = old.post_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select author_id into new_author
    from public.posts
    where id = new.post_id;
  end if;

  if old_author is not null then
    perform public.recompute_reaction_score(old_author);
  end if;

  if new_author is not null and new_author is distinct from old_author then
    perform public.recompute_reaction_score(new_author);
  end if;

  return coalesce(new, old);
end;
$$;

create trigger reactions_recompute_score
  after insert or update or delete on public.reactions
  for each row execute function public.reactions_recompute_score();

-- Post soft-delete/restore, author change, or hard delete -> recompute.
create or replace function public.posts_recompute_author_score()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.author_id is not null then
      perform public.recompute_reaction_score(old.author_id);
    end if;

    return old;
  end if;

  if new.author_id is not null then
    perform public.recompute_reaction_score(new.author_id);
  end if;

  if old.author_id is not null and old.author_id is distinct from new.author_id then
    perform public.recompute_reaction_score(old.author_id);
  end if;

  return new;
end;
$$;

create trigger posts_recompute_author_score
  after update of is_deleted, author_id, is_opening or delete on public.posts
  for each row execute function public.posts_recompute_author_score();

-- Members can edit their username/avatar; moderators/admins can change the
-- moderation columns. reaction_score is writable only by the triggers above.
revoke update on public.profiles from authenticated;
grant update (username, avatar_url, role, is_banned)
  on public.profiles to authenticated;

drop policy "users can insert their own profile" on public.profiles;

create policy "users can insert their own profile"
  on public.profiles for insert to authenticated
  with check (
    id = (select auth.uid())
    and role = 'member'
    and is_banned = false
    and reaction_score = 0
    and created_at = now()
  );

commit;
