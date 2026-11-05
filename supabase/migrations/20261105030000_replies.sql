-- Replying to another member's post.
--
-- posts.reply_to_post_id already exists and points at the post being replied
-- to. The author of that post is the member being replied to, so no extra
-- user column is needed; the API can join the target post and its author.
--
-- This migration tightens the validation and adds the lookup index used when
-- a thread renders "replying to @username" links.

begin;

create or replace function public.validate_reply_to()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.reply_to_post_id is null then
    return new;
  end if;

  if new.reply_to_post_id = new.id then
    raise exception 'A post cannot reply to itself';
  end if;

  if not exists (
    select 1
    from public.posts p
    where p.id = new.reply_to_post_id
      and p.thread_id = new.thread_id
      and not p.is_deleted
  ) then
    raise exception 'Reply target must be an active post in the same thread';
  end if;

  return new;
end;
$$;

create index if not exists posts_reply_to_idx
  on public.posts (reply_to_post_id)
  where reply_to_post_id is not null;

commit;
