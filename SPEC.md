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

1. **Auth** — Google sign-in, invite-only username sign-up, log in, log out,
   password reset, profile page
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
- `onboarding_completed` — false until a Google account picks a username and
  password
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

### `invite_codes`

- `code` — random, unique, single-use key
- `created_by` — admin who generated it, if recorded
- `used_by` — account that redeemed it
- `used_at`
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
- Google OAuth is the identity verification method. There is no email
  verification. Username + password sign-up requires a single-use invite code.
  Turnstile on sign-up, login and posting for new users.
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

- Members log in with **Google** or with **username + password**. Google
  accounts set a username and password during onboarding, so both methods work
  for the same account. Invite-code accounts have no real email.
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
- Email/password confirmation is not used. `/auth/callback` exchanges the
  Google OAuth code and redirects new accounts to `/onboarding`. `/auth/confirm`
  still supports `token_hash` password-reset links if the email template is
  changed.
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

## Implementation decisions (editor and embeds)

- The post/comment editor is a contentEditable rich-text editor with
  Write/Preview tabs, one pane at a time, on every screen. Write shows
  formatted text, not HTML source. Preview uses the same `MarkdownContent`
  renderer as posts and comments.
- The toolbar's Text size selector (Small / Medium / Large) wraps the selected
  text in a `span[data-size]`. With no selection it inserts an empty span and
  places the caret inside, so the next typed text uses that size. Changing the
  size again updates the same span instead of nesting another one. Sizes use
  root-relative `rem` units, so even legacy nested spans cannot compound. The
  span is styled in the editor and sanitized on render; the raw markup is never
  shown to the author.
- The editor stores HTML in `posts.content` and comment bodies. The renderer
  also handles legacy Markdown content. Pasted content is inserted as plain
  text so arbitrary HTML/styles do not enter the editor.
- `hasRichText()` treats empty formatting shells as empty, so the Comment
  button stays disabled until real text or a rule is present.
- Creating a thread or commenting requires a signed-in user. The create page
  and the thread comment/reply UI render a login prompt for anonymous
  visitors, with a `next` link back to the page. The localStorage prototype is
  UI-gated; the RLS insert policies enforce the same rule once posting is
  database-backed.
- The local thread/comment author uses the signed-in profile username, falling
  back to "you" if the profile row cannot be read.
- The site baseline font size is 19px; `.markdown-body` is 1rem with a 1.7 line
  height so posts and comments are comfortable to read.
- Embeds are limited to a whitelist: YouTube (privacy-enhanced nocookie),
  Vimeo, Reddit, Facebook posts/videos, X posts, Instagram, TikTok and Spotify.
- A supported URL is embedded only when it is alone in a paragraph. A URL in a
  sentence remains a normal link.
- Embed iframe URLs are rebuilt from validated hosts and IDs; raw user URLs are
  never used as iframe sources. Raw HTML is parsed and sanitized; the only
  extra element allowed is `span[data-size="sm|md|lg|xl"]`, and scripts, styles
  and event handlers are stripped.
- Embeds are lazy-loaded, include an "Open original" link, and render in posts,
  comments and the editor preview.
- When a Content Security Policy is added, allow `frame-src` for
  `youtube-nocookie.com`, `player.vimeo.com`, `redditmedia.com`,
  `facebook.com`, `platform.twitter.com`, `instagram.com`, `tiktok.com` and
  `open.spotify.com`.
- The home, create and thread pages read the query string/path after mount
  instead of `useSearchParams`/`useParams`. This avoids the Next 16 Cache
  Components Suspense stall on these client-rendered pages.

## Implementation decisions (Google auth and invite codes)

- Email verification is removed. Google OAuth is the verified sign-up path;
  Google accounts are treated as verified because Google has already confirmed
  the address.
- A Google account is not usable until the member picks a username and sets a
  password. `/auth/callback` checks `profiles.onboarding_completed` and sends
  new accounts to `/onboarding`. `/profile` repeats the check so a member
  cannot skip onboarding by navigating directly.
- Username + password sign-up needs a single-use invite code from the
  `invite_codes` table. There are no RLS policies and no `anon`/`authenticated`
  grants on the table; only the service role and the SQL Editor can read or
  write it. Admins generate codes in the Supabase SQL Editor (documented in
  `supabase/README.md`).
- Invite codes are claimed with `consume_invite_code()`. The `UPDATE ... WHERE
  used_at IS NULL` is atomic, so concurrent sign-ups cannot both use one code.
  The code is claimed before the auth user is created; if creation fails, the
  server action releases the claim by setting `used_at` back to null.
- The profile trigger refuses any new auth user that is not a Google OAuth user
  and does not carry `app_metadata.kaluwo_invite = true`. `app_metadata` is
  writable only by the service role, so calling Supabase's public sign-up
  endpoint directly with the anon key still fails the invite gate.
- Invite-code accounts have no real email. Supabase Auth still needs an
  email-shaped identifier, so they use
  `<username>@login.kaluwo.invalid`. The profile page hides that address.
- Google accounts keep their real Google email and can use the password-reset
  email. Invite-code accounts cannot reset by email because their address
  cannot receive mail.
- Passwords for Google accounts are written with the service-role admin client
  after the session user is checked. This adds a password without triggering a
  confirmation email.
- The username/password login path is unchanged: `resolve_login_email()` maps
  a username to the account's real or internal email, then
  `signInWithPassword()` verifies it. Both account types can therefore log in
  with a username and password, and Google accounts can also use Google.
