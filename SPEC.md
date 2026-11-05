# kaluwo — Specification

kaluwo is a Sri Lankan discussion forum in the style of
[elakiri.com](https://elakiri.com). The repo is public: no real secrets, IPs,
keys or personal data may be committed.

**Current status:** Step 1 (project initialization) is complete. The database
schema, RLS policies and authentication are built in the repository. The
migrations in `supabase/migrations/` still have to be applied to the Supabase
project. Posting to the database, moderation, uploads and the live forum are
still to be built.

## 1. What kaluwo is

A classic forum: boards > threads > posts. Members register, start threads,
reply, quote, mention others, react to comments, and report bad content.
Moderators and admins keep it clean. Posts can include images, videos and
audio.

There are no upvotes or downvotes on threads or posts. Only comments
(replies) can be reacted to.

The community is Sri Lankan, so Sinhala, Tamil and English must all work:
UTF-8 everywhere, suitable fonts, and an i18n-ready UI starting in English.

## 2. Stack

- **Next.js** — latest stable, App Router, TypeScript, Tailwind CSS
- **Supabase** — Postgres, Auth, Row Level Security, using `@supabase/ssr`
- **Media hosting** — [catbox.moe](https://catbox.moe) for images, videos
  and audio. Uploads go through the server only.
- **Cloudflare Turnstile** — spam protection
- **Cloudflare** — in front of the live site
- **npm** — package manager
- **Deployment (later)** — Docker on a Linode VPS behind Cloudflare, with a
  private home-server standby

## 3. Roles

- `member`
- `moderator`
- `admin`

Banned users cannot post or upload.

New accounts have restrictions: for example, no links or media until they have
a few approved posts or a minimum account age. The thresholds must be
configurable.

## 4. Core features, in build order

1. **Auth** — sign up, log in, log out, email verification, password reset,
   profile page
2. **Database tables + Row Level Security** — profiles, boards, threads,
   posts, reactions, reports, media_assets
3. **Read-only forum** — board list, thread list and thread page, with
   pagination (20 to 50 posts per page)
4. **Posting** — create thread and reply, quote, soft-delete
5. **Reactions** — like, laugh and wow (positive); anger and dislike
   (negative), on comments only
6. **Editing** — edit and delete own posts, keeping edit history
7. **Moderation roles** — moderators can lock, pin, move and delete threads;
   delete posts; and ban users
8. **Reports** — reports and moderator queue
9. **Spam protection** — Turnstile, rate limits, new-user restrictions
10. **Media uploads** — see section 6
11. **Discovery** — search (Postgres full-text first), notifications,
    mentions
12. **Later** — private messages, reputation and ranks, classifieds board

## 5. Data model

The SQL lives in `supabase/migrations/`. Tables:

### `profiles`

- `id` — same as the Supabase auth user id
- `username` — unique
- `avatar_url`
- `role` — `member` / `moderator` / `admin`
- `is_banned`
- `reaction_score` — positive reactions minus negative reactions received on
  the member's comments
- `created_at`

### `boards`

- `id` — text slug used in URLs (`general`, `food`)
- `name`
- `description`
- `sort_order`

### `threads`

- `id`
- `board_id`
- `author_id`
- `title`
- `is_locked`
- `is_pinned`
- `is_deleted`
- `created_at`
- `last_post_at`

### `posts`

- `id`
- `thread_id`
- `author_id`
- `content`
- `reply_to_post_id` — the post being replied to; its author is the member
  being replied to
- `is_opening` — true for the thread's first post; reactions are not allowed
  on it
- `created_at`
- `edited_at`
- `is_deleted`

A comment is a reply post. Reactions attach only to comments; threads and
opening posts have no score.

### `reactions`

- `id`
- `post_id` — the comment being reacted to
- `user_id`
- `kind` — `like` / `laugh` / `wow` / `anger` / `dislike`
- `created_at`

`like`, `laugh` and `wow` count as positive; `anger` and `dislike` count as
negative. Reaction totals roll up to the comment author's
`profiles.reaction_score`; opening posts and soft-deleted comments are
excluded. A user has exactly one reaction per comment; choosing a different
reaction updates the existing row (`unique (post_id, user_id)`).

### `reports`

- `id`
- `post_id`
- `reporter_id`
- `reason`
- `status` — `open` / `resolved` / `dismissed`
- `created_at`

### `media_assets`

- `id`
- `owner_id`
- `post_id` — nullable until the post is saved
- `kind` — `image` / `video` / `audio`
- `provider` — `catbox`
- `file_key` — the catbox filename
- `url`
- `mime_type`
- `size_bytes`
- `status` — `active` / `removed`
- `created_at`

## 6. Media system (catbox.moe)

- Catbox is used for images, videos and audio. Permanent uploads are capped
  at **200 MB per file** by catbox.
- **All uploads go through a server-side route.** The catbox userhash is a
  secret kept in `.env.local` (`CATBOX_USERHASH`) and must never reach the
  browser or be committed. Use the account userhash (not anonymous uploads)
  so files can be deleted later.
- Put all provider code in one module, for example `src/lib/storage/`,
  exposing `uploadMedia(file, kind)` and `deleteMedia(fileKey)`. Store only the
  file key and a provider column in the database so the provider can be
  swapped later without rewriting posts.
- Limits are configurable via env, with these defaults:
  - images: **10 MB**
  - audio: **30 MB**
  - videos: **100 MB** (Cloudflare's free plan limits request bodies to about
    100 MB)
- Allowed types:
  - images: `jpg`, `png`, `webp`, `gif`
  - audio: `mp3`, `ogg`, `m4a`, `wav`
  - video: `mp4`, `webm`
- Verify the real file type from the file's bytes, not the extension or the
  browser-provided MIME type. Reject everything else, especially executables
  and archives.
- Images:
  - resize to max 1600 px wide
  - convert to WebP (except animated GIFs)
  - strip EXIF metadata (GPS location) before uploading
- Videos and audio: validate type and size only for now. Do not add
  server-side transcoding yet.
- Rate limits: uploads per user per day and per IP. Stricter for new accounts.
- Logged-in, non-banned users only. Server-side checks, not just UI checks.
- Rendering:
  - images: plain `<img loading="lazy">` with fixed width/height. Do **not**
    use `next/image`, so the server does not proxy images.
  - videos: `<video controls preload="metadata">`
  - audio: `<audio controls preload="none">`
  - never autoplay
- When a post or user is deleted by a moderator, also delete the media from
  catbox via `deleteMedia` and set `media_assets.status` to `removed`.
- Allow catbox's file domain in the Content Security Policy `img-src` and
  `media-src`. Confirm the exact domain from a real uploaded URL; do not
  guess it.
- Catbox files are public. Never use it for private content.

## 7. Security rules

Apply these to every task.

- Never store plain passwords. Use Supabase Auth only.
- Every permission is enforced on the server and with RLS, never only in the
  UI. Test that user A cannot edit or delete user B's content.
- All user text is untrusted. Sanitise before rendering (no XSS), use
  parameterised queries only, and render Markdown through a sanitiser.
- Secrets live only in `.env.local`. Commit `.env.example` with empty
  placeholders. Never expose the Supabase service-role key to the browser.
- Require email verification. Turnstile on sign-up, login and posting for new
  users.
- Soft-delete content so moderators can review it.
- Check official docs before using any library function that is not certain
  to exist. Do not invent APIs.

## 8. Working rules

- One small task per step. Do not add features that were not asked for.
- Commit after every working step with a clear message.
- After each step, tell the user exactly how to test it and what to do next.
- If something is ambiguous, ask one short question instead of guessing.
- Keep this `SPEC.md` in the repo root and update it as decisions change.

## Implementation decisions (step 1)

- The public Supabase key is stored in `NEXT_PUBLIC_SUPABASE_ANON_KEY`, as
  requested. Supabase now labels the equivalent public key as the
  "publishable key"; either works here.
- The step 1 home page connection card was removed once the schema and
  authentication were built. Setup problems now appear on the auth pages.
- The Supabase session-refresh proxy was added in the authentication step
  (`src/proxy.ts`).
- Client Components that call Supabase need the `NEXT_PUBLIC_*` values
  available when the app is built. The auth pages read them at runtime or
  build time as appropriate.
- The home page uses a Reddit-style forum shell: top bar, board navigation
  and a central thread feed. There is no right sidebar. Non-functional
  controls are visibly disabled rather than pretending to work before their
  step is built.
- Dark mode follows the operating-system preference on the first visit. The
  top-bar toggle overrides it and stores the choice in `localStorage`. A small
  inline script applies the theme before paint so a light page does not flash
  before dark mode loads.
- Colours are defined as semantic tokens in `globals.css` (`background`,
  `surface`, `line`, `ink`, `body`, `muted`, `faint`), so light and dark themes
  stay consistent as more pages are added.
- Threads and posts have no upvote/downvote controls. Reactions belong to
  comments (replies) only.
- The Next.js development indicator is disabled in `next.config.ts` so it
  does not cover the bottom-left of the page during development.

## Implementation decisions (step 2)

- The schema is one migration:
  `supabase/migrations/20261105000000_initial_schema.sql`. It is applied
  through the Supabase SQL Editor (or `supabase db push`), not by hand-editing
  tables.
- `boards.id` is a text slug rather than a numeric id, so board URLs and the
  existing `src/lib/boards.ts` ids stay stable.
- `threads.is_deleted` was added for soft deletion. A deleted thread and its
  posts are hidden from normal readers; the thread author and moderators still
  see them.
- `posts.is_opening` marks the thread's first post. A partial unique index
  allows exactly one opening post per thread, and reactions are rejected on
  opening posts by RLS.
- Members can edit their own post content and soft-delete their own posts.
  They cannot hard-delete, move a post, change its author, or change the
  opening-post flag. Moderators can hard-delete.
- Only moderators can update a thread row. This covers lock, pin, move,
  soft-delete and hard-delete. Authors do not edit thread titles.
- `reactions.kind` is the only column members may update, granted at the
  column level, so a reaction cannot be moved to another post.
- Reports are unique per `(post_id, reporter_id)`; reporting the same post
  twice is rejected by the unique constraint instead of creating duplicates.
- `media_assets` is unique per `(provider, file_key)`. Deleting a post sets
  `post_id` to null rather than deleting the asset row, so cleanup can still
  find the catbox file.
- `author_id` on threads/posts is nullable and `on delete set null`, so
  deleting an auth user keeps the content as an anonymous post.
- RLS helpers are `SECURITY DEFINER` with a pinned `search_path`:
  `is_banned()`, `is_moderator()` and `is_admin()`. They avoid recursion when
  policies need to read `profiles`.
- A trigger on `auth.users` creates the matching `profiles` row. The username
  comes from sign-up metadata, is lowercased, stripped to
  `[a-z0-9_]`, and gets a numeric suffix if it is already taken.
- A profile trigger stops members changing their own `role`, `is_banned` or
  `created_at`. Only admins change roles; moderators can ban members but not
  admins.
- The migration was checked against PostgreSQL 17 with a stubbed `auth`
  schema: schema creation, profile trigger, RLS reads/writes, soft-delete
  visibility, moderator overrides, reports and media removal all passed.
- `src/lib/supabase/types.ts` is generated from the schema and committed so
  the app type-checks without a Supabase login. Regenerate it after schema
  changes with the command in `supabase/README.md`.

## Implementation decisions (authentication)

- Login is **username + password**. Email is collected at sign-up only for
  verification and password reset.
- Supabase Auth signs in with an email, so a server action calls the
  service-role-only `resolve_login_email(username)` function and then signs in
  as the returned address. `SUPABASE_SERVICE_ROLE_KEY` stays on the server and
  is never exposed to the browser. Unknown usernames use a dummy email so the
  error does not reveal whether an account exists.
- Turnstile is verified server-side in `src/lib/auth/turnstile.ts` with
  `TURNSTILE_SECRET_KEY`. Supabase's built-in CAPTCHA is intentionally left
  off: login runs in a server action, and a server-side check avoids Cloudflare
  rejecting the token because the request IP changed.
- Turnstile is required on login, sign-up and password-reset requests. The
  final password update is gated by the session created from the email link.
- Next.js development server-action argument logging is disabled in
  `next.config.ts` (`logging.serverFunctions: false`) so passwords and CAPTCHA
  tokens do not appear in terminal logs.
- `src/proxy.ts` refreshes the Supabase session on every request (Next 16
  renamed middleware to proxy). `/profile` is a server-rendered page and
  redirects to `/login?next=/profile` when there is no session.
- Email confirmation uses `/auth/callback` (code exchange). `/auth/confirm`
  supports `token_hash` email templates so links also work when opened in a
  different browser.
- The profile page shows username, email, role, status, joined date and
  reaction score.
- `profiles.reaction_score` is maintained by recompute triggers on reactions
  and on relevant post changes (soft-delete, restore, author change, hard
  delete). It is not part of the authenticated column update grant, so members
  cannot write it directly.
- Replies use `posts.reply_to_post_id`; the target post's author is the member
  being replied to. The validation trigger requires an active target in the
  same thread and rejects self-replies. `posts_reply_to_idx` supports reply
  lookups. The database-backed reply UI lands with the posting step.
- The auth and score flow was checked against PostgreSQL 17 with a stubbed
  `auth` schema: score changes, soft-delete/restore, cross-thread replies,
  self-replies, column grants and the service-role-only lookup all passed.
