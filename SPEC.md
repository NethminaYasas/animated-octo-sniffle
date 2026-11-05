# kaluwo — Specification

kaluwo is a Sri Lankan discussion forum in the style of
[elakiri.com](https://elakiri.com). The repo is public: no real secrets, IPs,
keys or personal data may be committed.

**Current status:** Step 1 (project initialization) is complete. Supabase
database tables, authentication and all other features are still to be built.

## 1. What kaluwo is

A classic forum: boards > threads > posts. Members register, start threads,
reply, quote, mention others, react, and report bad content. Moderators and
admins keep it clean. Posts can include images, videos and audio.

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
   posts, reports, media_assets
3. **Read-only forum** — board list, thread list and thread page, with
   pagination (20 to 50 posts per page)
4. **Posting** — create thread and reply, quote, soft-delete
5. **Editing** — edit and delete own posts, keeping edit history
6. **Moderation roles** — moderators can lock, pin, move and delete threads;
   delete posts; and ban users
7. **Reports** — reports and moderator queue
8. **Spam protection** — Turnstile, rate limits, new-user restrictions
9. **Media uploads** — see section 6
10. **Discovery** — search (Postgres full-text first), notifications,
    mentions
11. **Later** — private messages, reputation and ranks, classifieds board

## 5. Data model

The SQL is written in step 2. Planned tables:

### `profiles`

- `id` — same as the Supabase auth user id
- `username` — unique
- `avatar_url`
- `role` — `member` / `moderator` / `admin`
- `is_banned`
- `created_at`

### `boards`

- `id`
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
- `created_at`
- `last_post_at`

### `posts`

- `id`
- `thread_id`
- `author_id`
- `content`
- `reply_to_post_id`
- `created_at`
- `edited_at`
- `is_deleted`

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
- The home page connection check calls the read-only Supabase Auth
  `/auth/v1/settings` endpoint. The application tables that a normal database
  query would need are not created until step 2.
- The Supabase session-refresh proxy is deferred to the authentication step.
  The server client is already cookie-aware, so no authentication behaviour
  is missing in step 1.
- The server-rendered connection check reads environment values at request
  time (verified with a production build and values supplied only at startup).
  Client Components that call Supabase will need the `NEXT_PUBLIC_*` values
  available when the app is built, which is a later deployment concern.
- The home page uses a Reddit-style forum shell: top bar, board navigation,
  thread feed, and community sidebar. Non-functional controls are visibly
  disabled rather than pretending to work before their step is built.
- The Supabase status is streamed behind a `Suspense` boundary, so the forum
  shell paints immediately even if the project check is slow or unreachable.
- The connection check is bounded by a 3-second timeout and returns a visible
  error state instead of hanging indefinitely.
