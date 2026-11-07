# kaluwo — Specification

kaluwo is a Sri Lankan discussion forum in the style of
[elakiri.com](https://elakiri.com). The repo is public: no real secrets, IPs,
keys or personal data may be committed.

**Current status:** Authentication, the database schema, Phase 1
(database-backed posting, comments, reactions, notifications, cursor
pagination and posting rate limits), Phase 2 (roles, moderation, mod log,
reports, hashed invite administration, warnings and comment pagination) and
Phase 3 (forum uploads with EXIF stripping, quotas, a hash blocklist and
audited removal) are built in the repository. The migrations in
`supabase/migrations/` still have to be applied to the Supabase project.
Modmail and end-to-end encrypted DMs are the next phases. Quotes remain a browser-local clipboard;
saved posts remain a browser-local bookmark.

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

- `new_member` — the first 28 days after account creation
- `member` — after 28 days
- `senior_member` — after 2 years
- `moderator`
- `admin`

Banned users cannot post, comment, upload or report, but they can still
react.

New accounts have restrictions: for example, no links or media until they have
a few approved posts or a minimum account age. The thresholds must be
configurable.

## 4. Core features, in build order

1. **Auth** — Google sign-in, invite-only username sign-up, log in, log out,
   password reset, profile page
2. **Database tables + Row Level Security** - profiles, boards, threads,
   posts, reactions, reports, uploads
3. **Read-only forum** — board list, thread list and thread page, with
   pagination (20 to 50 posts per page)
4. **Posting** — create thread and reply, quote, soft-delete
5. **Reactions** — like, laugh and wow (positive); anger and dislike
   (negative), on posts and comments, excluding your own content
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
- `username` — unique; 3-20 characters, lowercase, NFC-normalised. English,
  Sinhala and Tamil letters/marks, digits and underscore are allowed.
- `avatar_url`
- `role` — `new_member` / `member` / `senior_member` / `moderator` / `admin`
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
- `is_opening` — true for the thread's first post; reactions are allowed on
  it but do not count toward the author's reaction score
- `created_at`
- `edited_at`
- `is_deleted`

A comment is a reply post. Reactions attach to posts and comments, but not to
your own content. Threads themselves have no score, and the reaction score
counts comments only, so reactions on opening posts do not change it.

### `reactions`

- `id`
- `post_id` — the post or comment being reacted to
- `user_id`
- `kind` — `like` / `laugh` / `wow` / `anger` / `dislike`
- `created_at`

`like`, `laugh` and `wow` count as positive; `anger` and `dislike` count as
negative. Reaction totals on comments roll up to the comment author's
`profiles.reaction_score`; opening posts and soft-deleted comments are
excluded from the score. A user has exactly one reaction per post or comment;
choosing a different reaction updates the existing row
(`unique (post_id, user_id)`).

### `reports`

- `id`
- `post_id`
- `reporter_id`
- `reason`
- `status` — `open` / `resolved` / `dismissed`
- `created_at`

### `uploads`

- `id` — uuid
- `uploader_id`
- `provider` — `catbox`
- `provider_file_id` — the catbox filename
- `url`
- `mime_type`
- `size_bytes`
- `raw_sha256` — hash of the uploaded bytes as received
- `sha256` — hash after metadata stripping
- `status` — `active` / `removed`
- `removal_reason`, `removed_at`, `removed_by`
- `created_at`

Members and anonymous visitors read only `id`, `url`, `mime_type`,
`size_bytes` and `status` through the `public_uploads` view. Staff read the
full row (including hashes, uploader and removal metadata) through
`staff_uploads`. There are no direct client INSERT/UPDATE/DELETE grants.

### `post_uploads`

- `post_id`, `upload_id` — a post may reference at most 8 uploads, all owned
  by the post's author. Enforced by `link_uploads_to_post()` and a backstop
  trigger.

### `upload_hash_blocks`

- `sha256` — blocked raw or stripped hash
- `reason`, `blocked_by`, `created_at`

### `invite_codes`

- `code` — random, unique, single-use key
- `created_by` — admin who generated it, if recorded
- `used_by` — account that redeemed it
- `used_at`
- `created_at`

### `security_events`

- `id`
- `event` — `login.succeeded`, `login.failed`, `signup.succeeded`,
  `signup.failed`, `password_reset.requested`, `oauth.succeeded`,
  `oauth.failed`
- `user_id` — the account involved, when known
- `ip` — client address from Cloudflare/proxy headers, or `NULL`
- `user_agent`
- `metadata` — small JSONB context such as the attempted username or a reason
- `created_at`

This table is service-role only: RLS is enabled with no policies and the
`anon`/`authenticated` grants are revoked. It records authentication and
moderation events, never passwords, session tokens or CAPTCHA values. IPs are
personal data, so a retention window (starting at 90 days) is applied with a
scheduled delete and disclosed in the privacy notice.

**Hardware (MAC) addresses are not collected.** They are Layer-2 addresses
that do not cross a router, and browsers do not expose them. Abuse
investigation uses the IP, user agent and account instead.

## 6. Media system (catbox.moe)

- Catbox is used for images, audio and short videos. It is a free third-party
  host: files are **public by URL**, have **no retention guarantee**, and their
  terms allow deduplication/removal and require prior approval for commercial
  use. Never upload private content. DM attachments are out of scope.
- **All uploads go through a server-side route** (`POST /api/uploads`), never
  from the browser. `CATBOX_USERHASH` is an optional server-only secret in
  `.env.local`; without it, staff removal hides a file in the forum but cannot
  delete it at catbox.
- All provider code lives in `src/lib/media/provider.ts` behind an
  `UploadProvider` interface (`upload`, `delete`, `publicHostname`), so R2 or
  Supabase Storage can replace catbox without touching the route or UI.
- Limits are configurable via env, with these defaults:
  - images: **10 MB**
  - audio: **30 MB**
  - videos: **50 MB** (kept below Cloudflare's proxied request-body limits)
- Allowed types:
  - images: `jpeg`, `png`, `webp`, `gif`
  - audio: `mp3`, `ogg`
  - video: `mp4`, `webm`
- Verify the real file type from magic bytes, never the extension or the
  browser-provided MIME type. Reject everything else, especially executables
  and archives.
- Enforce the size limit while streaming: stop writing to disk as soon as the
  per-type cap is passed, then reject.
- Images: decode with `sharp`, apply EXIF orientation, re-encode, which drops
  all metadata including GPS. Cap decoded pixels (40 MP) and animated GIF
  frames (300). Reject images with data appended after the container end.
- Videos and audio: validate type and size only. No transcoding, so container
  metadata is not stripped.
- Rate limits and quotas: atomic per-user counters. `new_member` 3 per 15
  minutes / 20 per day / 25 MB per day; `member` and `senior_member` 10 / 200 /
  1 GB; staff 50 / 1000 / 10 GB. The route also caps in-flight uploads.
- Logged-in, non-banned users only, checked on the server. Cookie-authenticated
  requests must come from the same origin.
- Database: `uploads` and `post_uploads`. Members/anon read only the safe
  columns through `public_uploads`; staff read `staff_uploads`. No direct
  client writes. A post may reference at most 8 uploads owned by its author,
  enforced by RPC plus a backstop trigger.
- Rendering: plain `<img loading="lazy">`, `<video controls
  preload="metadata">`, `<audio controls preload="metadata">`. Never autoplay
  and do not use `next/image`. Media renders only for URLs that exist in
  `uploads` with `status = 'active'`; any other media URL renders as a plain
  link.
- CSP ships as `Content-Security-Policy-Report-Only` with `img-src`/`media-src`
  limited to `'self' data: https://files.catbox.moe`, and violations reported to
  `/api/csp-reports`. Enforce it once the reports are clean.
- Moderation: removal is an audited RPC (`upload.remove`, reason required). The
  file is hidden everywhere; members see a bare placeholder, staff see the
  reason and actor. A SHA-256 blocklist (staff block, admin unblock) stops
  re-uploads of a known-bad file, matching either the raw or stripped hash.
  Members can report an attachment through the existing report system.
- Unlinked uploads are expired after 24 hours by `expire_unlinked_uploads()`
  and a logged `system` action.

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
- Threads themselves have no upvote/downvote controls. Reactions belong to
  posts and comments, but not to your own content.
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
  allows exactly one opening post per thread. Reactions are allowed on opening
  posts but are excluded from the comment-only reaction score.
- Members can edit their own post content and soft-delete their own posts.
  They cannot hard-delete, move a post, change its author, or change the
  opening-post flag. Moderators can hard-delete.
- Only moderators can update a thread row. This covers lock, pin, move,
  soft-delete and hard-delete. Authors do not edit thread titles.
- `reactions.kind` is the only column members may update, granted at the
  column level, so a reaction cannot be moved to another post.
- Reports are unique per open `(target, reporter_id)`; reporting the same
  target twice is rejected by the unique constraint instead of creating
  duplicates.
- `uploads` are unique by `id`; a `post_uploads` pair is unique and a post can
  link at most 8 uploads. Removal sets `status = 'removed'` and keeps the row so
  the placeholder and the moderation trail survive.
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
- Membership tiers are time-based: a profile starts as `new_member`, becomes
  `member` after 28 days and `senior_member` after 2 years.
  `promote_member_roles()` runs hourly through `pg_cron`; staff roles are never
  changed automatically.
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
  renamed middleware to proxy). `/profile` is the signed-in shortcut and
  redirects to `/login?next=/profile` when there is no session, then to the
  member's public `/profile/[username]` page.
- Public profiles are server-rendered at `/profile/[username]` and can be read
  without a session. They show only the username, stored avatar, role, status,
  joined date and reaction score. The member's email address and Google photo
  are never displayed; Google is only used to verify the account.
- Profile activity is read from Supabase: the member's threads, comments and
  reactions, with soft-deleted content excluded by RLS and the queries.
- Email/password confirmation is not used. `/auth/callback` exchanges the
  Google OAuth code and redirects new accounts to `/onboarding`. `/auth/confirm`
  still supports `token_hash` password-reset links if the email template is
  changed.
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
- Drag-drop and paste of images into the editor upload through the same
  `POST /api/uploads` pipeline (magic bytes, quotas, EXIF stripping) and
  insert `<img>` at the caret. Each inserted image is also linked into
  `post_uploads` so the render-time upload gate passes; the gallery hides
  inline images for members (staff still see them) to avoid duplicates.
- Inline image width uses `data-width` (integer percent 15–100). Both the
  server sanitiser and `rehype-sanitize` accept only that range; an inline
  `style` width from the live editor is stripped before storage and
  re-applied on render. Resizing is via the orange corner drag handle
  (plus Arrow Left/Right on the focused handle and Delete to remove).
- Reactions use insert-then-update by `kind`, never PostgREST upsert: the
  `reactions` UPDATE grant is column-limited to `kind` so a reaction cannot
  be moved to another post, and an upsert requires table-level UPDATE.
  `23505` (unique conflict) falls back to `UPDATE reactions SET kind`.
- Reaction breakdowns show each non-zero kind with its count. Clicking a
  count opens a dialog with an **All** tab and one tab per kind, listing
  reactor usernames (and avatars) via a public `reactions` + `profiles`
  read. The breakdown renders for logged-out viewers and authors too; only
  the react button is restricted.
- The header re-checks the session on pathname change (behind a Suspense
  boundary in the root layout), so a server-action login shows the profile
  icon without a refresh. `usePathname()` is never called outside Suspense.

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
- Usernames allow English, Sinhala and Tamil letters/marks, digits and
  underscore, plus ZWNJ/ZWJ for conjunct sequences. They are lowercase and
  NFC-normalised in the app, the trigger and the database constraint, so
  visually identical Unicode sequences cannot create duplicate accounts.
  Other scripts are rejected to reduce lookalike-script impersonation.
- Invite-code accounts use a random `<uuid>@login.kaluwo.invalid` address.
  It was previously derived from the username, but Sinhala/Tamil characters
  are not safe email local parts. `resolve_login_email()` still maps the
  username to the stored address.
- The global font stack includes Noto Sans Sinhala and Noto Sans Tamil so
  Sinhala/Tamil usernames render consistently.
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

## Implementation decisions (Phase 1: database-backed forum)

- Threads, comments (`posts`), reactions and notifications are stored in
  Supabase. The old `feed-store.ts` and `seed-posts.ts` browser prototype files
  were removed.
- `create_thread()` is `SECURITY INVOKER`; it inserts the thread and opening
  post in one transaction under the caller's RLS policies. A failed opening
  post rolls the thread back.
- Direct post inserts are comments only. The opening-post branch accepts an
  insert only in the author's own thread when `thread_has_no_posts()` is true.
  `thread_has_no_posts` and `thread_has_opening_post` live in the
  non-exposed `kaluwo_private` schema.
- Threads with no active opening post are hidden by `list_threads` and the
  thread page, even if a client inserted the thread row directly.
- The feed uses cursor pagination on `(last_post_at, id)` or
  `(created_at, id)`; it never uses `OFFSET`.
- Rate limits are enforced by `BEFORE INSERT` triggers using atomic
  `INSERT ... ON CONFLICT ... WHERE used < limit` counters. The trigger raises
  with `hint = 'kaluwo_rate_limited'`; server actions log
  `forum.rate_limited` in `security_events`. Direct API rejections are not
  audited because the `RAISE` rolls back the audit insert.
- Notifications are created by the server action with the service role.
  Recipients are resolved from database rows only, and self-notifications are
  skipped. The table has no INSERT policy.
- Notifications are delivered through Supabase Realtime with a 60-second poll
  fallback. The browser subscribes with a `user_id` filter; RLS also scopes
  INSERT/UPDATE rows, and the filter is required because Realtime cannot apply
  RLS to DELETE payloads. Soft-deleting a post or its thread clears the
  relevant notification excerpts and replaces a deleted thread's title snapshot.
- Reaction totals are aggregated by `thread_reaction_summary()` in the
  database, so a busy thread is not truncated by PostgREST's `max_rows`.
- Post/comment HTML is sanitised with `sanitize-html` before storage, and the
  existing `rehype-sanitize` renderer remains the authoritative display gate.
- Direct PostgREST inserts are still blocked by RLS (authentication, ban,
  thread state and own-content rules) and by the rate-limit triggers, but they
  bypass Turnstile, the pre-storage `sanitize-html` pass and the application's
  content length check. The database length constraints and the render-time
  sanitizer still apply. This is accepted under the chosen RLS-based insert
  design; a future migration can move writes behind a service-role-only RPC.
- Turnstile is required for `new_member` thread/comment creation; established
  members are protected by rate limits.
- Search is a simple `ILIKE` query in this phase, with LIKE wildcard escaping.
  Saved posts remain a browser-local bookmark, and quotes remain a
  browser-local clipboard.

## Implementation decisions (Phase 2: moderation)

- Roles live in `profiles.role`; effective staff checks read the database on
  every RLS/RPC call. JWT claims are never used for authorisation. A demotion or
  effective ban takes effect on the next request.
- Bans are `is_banned` plus an optional `banned_until`. `is_banned()` compares
  the expiry to `now()` at check time, so expiry needs no cron. Expired bans
  may leave the flag true until a formal unban.
- Member-facing ban and warning data use `my_bans` / `my_warnings` views that
  show the reason and expiry but omit the issuing moderator. Staff read the
  base tables.
- Every staff write is a `SECURITY DEFINER` RPC with pinned `search_path`,
  EXECUTE revoked from public/anon, and an actor/role read from the database.
  Direct staff UPDATE/DELETE on profiles, threads, posts, reports and moderation
  tables is revoked so the append-only mod log cannot be bypassed.
- Moderators cannot act on admins or other moderators. Admins cannot be banned.
  `admin_set_role` and the ban/unban RPCs take the same transaction-scoped
  advisory lock and re-check the caller after acquiring it; concurrent
  demotions cannot leave zero admins.
- `mod_log` is append-only through the API. It records reason, previous value
  and new value. Move actions record both old and new board ids.
- Soft-deleted threads/posts are visible only to staff, with deleted reason,
  actor and timestamp. Members (including authors) do not see them. The Phase 1
  reply-count, last-activity and notification-clearing triggers still fire when
  the RPC updates `is_deleted`.
- Comments are cursor-paginated oldest-first with "Load more comments".
  Notification links auto-load forward until the target comment is present.
  Reaction summaries are aggregated per loaded page in the database.
- Pinned threads are shown in a separate pinned section; the main feed cursor
  excludes pinned threads, so pin/unpin cannot corrupt mid-pagination results.
- Reports support post/comment and member targets, one open report per reporter
  per target, a per-member rate limit, a staff-only resolution row and an
  admin-only rule for reports about staff. Reporters never see other reporters
  or the handler.
- Invite codes are generated with pgcrypto, stored as SHA-256 hashes plus a
  six-character hint, and shown in plaintext only once at creation. Revocation
  and idempotent batch creation are admin RPCs.
- Warnings are stored in `member_warnings`, shown on the member profile with an
  acknowledge action, and do not create a bell notification in Phase 2.

## Implementation decisions (Phase 3: uploads)

- Catbox sits behind `UploadProvider` in `src/lib/media/provider.ts` so R2 or
  Supabase Storage can replace it later. The route and UI never import catbox
  directly.
- The browser uploads to same-origin `POST /api/uploads`; the server streams the
  multipart body to a temp file, detects the type from magic bytes, applies the
  per-type cap mid-stream, strips image metadata, checks the hash blocklist,
  consumes the quota, then uploads server-to-server to catbox.
- `experimental.proxyClientMaxBodySize` is raised to 52 MB because the proxy
  buffers request bodies at 10 MB by default and would otherwise truncate
  videos before the route could validate them.
- `uploads` stores `raw_sha256` (as received) and `sha256` (after stripping);
  the blocklist matches either, so a re-encoded known-bad file is still caught.
- Members and anonymous visitors read the safe `public_uploads` view only;
  staff read `staff_uploads`. There are no direct client writes.
- A post may link at most 8 uploads, all owned by its author:
  `link_uploads_to_post()` requires `auth.uid() = post author`, and a trigger
  re-checks the relationship so even the service role cannot create a
  cross-owner link.
- Media renders only when the URL exists in `uploads` with `status = 'active'`;
  any other media URL becomes a plain link. That single rule replaces
  removed-URL bookkeeping and prevents hotlinked media rendering.
- Removal is an audited RPC with a required reason. It never rolls back if the
  best-effort provider delete fails. Members see a bare placeholder; staff see
  the reason and actor.
- The hash blocklist is staff-write/admin-unblock, and both are mod-logged.
- `my_bans` and `my_warnings` became `SECURITY DEFINER` functions (pinned
  `search_path`) so the Supabase linter no longer reports security-definer
  views, while members still cannot read the issuing moderator.

## Implementation decisions (Phase 4: modmail)

- **No new env vars.** All Phase 4 SQL constants are documented in README.md
  (MAX_OPEN_TICKETS=5, MAX_OPEN_BAN_APPEALS=1, REOPEN_WINDOW_DAYS=7,
  RETENTION_DAYS=90, BAN_APPEAL_RETENTION_DAYS=365, MAX_TICKET_MESSAGES=200);
  none are added to `.env.example`.
- **Tables:** `modmail_tickets`, `modmail_messages`, `modmail_internal_notes`,
  `modmail_mutes`. All RLS-enabled, no direct `anon`/`authenticated` grants.
  Members read through `my_tickets()`/`my_messages()` (SECURITY DEFINER, safe
  columns only: no staff IDs, no priority, `sender_kind` instead of `author_id`).
- **Staff RPCs:** All SECURITY DEFINER with pinned `search_path`. Actor identity
  is derived from `auth.uid()` for authenticated moderator/admin calls
  (`reply_to_ticket`, `set_ticket_status`, `assign_ticket`, `mute_member`, etc.).
  Staff server actions running with the service role pass the actor explicitly
  via `can_staff_access_ticket_for(p_actor, p_ticket_id)`; the actor is never
  client-supplied. SQL enforcement (`can_staff_access_ticket` in every RPC) is
  the authoritative layer; application-layer filters only narrow listings.
- **Conflict rules:** Staff cannot see or act on tickets where they are
  `member_id` or `subject_user_id`; `admin_only` tickets are admin-only.
  Enforced in `can_staff_access_ticket()` and every RPC.
- **Ticket lifecycle:** Member opens → open. Staff reply: open → pending.
  Member reply: pending → open, resolved → open (reopens, consumes
  `reopen_count`; max 1 reopen within 7 days). Staff close: open → closed.
  Closed tickets reject all replies. Staff can reopen closed tickets (mod-logged).
- **Ban appeals:** Gated to effectively banned or recently banned members
  (within 30 days). One open appeal per member. Ban appeals use the
  `modmail_appeal` rate-limit bucket (1 per 24h). Banned members can reply to
  their own ban appeal tickets.
- **Mutes:** Moderators can mute non-appeal ticketing; only admins can mute
  appeals. Muted members cannot open non-appeal tickets. `lifted_at` excludes
  lifted mutes from active-mute checks.
- **Internal notes:** Staff-only; `member_id` conflict check applied; never
  exposed to members.
- **Notifications:** `ticket_id` column on `notifications`; `actor_id` is NULL
  (no staff identity); one unread per `(recipient, ticket)`.
- **Retention:** `expire_modmail_tickets()` (service-role only) deletes
  resolved/closed non-appeal tickets after 90 days and ban appeals after 365
  days, logged to `security_events`.
- **Realtime:** Modmail tables are NOT in `supabase_realtime`.

## Rate limits (Phase 4 additions)

| Action | Member limit | Window | Staff limit | Window |
|---|---|---|---|---|
| `modmail` | 10 | 900s | 30 | 900s |
| `modmail_staff` | 5 | 900s | 60 | 900s |
| `modmail_appeal` | 1 | 86400s | 1 | 86400s |
| `moderation` | 5 | 900s | 60 | 900s |
| `upload` | 20 | 900s | 60 | 900s |

## Implementation notes

- `consume_posting_rate_limit()` restores the effective-ban check
  (`is_banned AND (banned_until IS NULL OR banned_until > now())`); ban appeals
  (`modmail_appeal`) are exempt from the ban check since they exist for banned
  members.
- `open_ticket()` persists the opening message as the first
  `modmail_messages` row and notifies the ticket member via
  `notifications` (`modmail_new_ticket`, no staff identity).
- `staff_open_ticket()` persists the opening message and notifies the target
  member similarly.
- Staff inbox listing filters in SQL: `.neq("member_id", user.id)`,
  `.or("subject_user_id.is.null,subject_user_id.neq.<id>")`, and
  `.eq("admin_only", false)` for moderators.
- `getUnreadTicketCount()` applies the same conflict filters.

