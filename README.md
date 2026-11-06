# kaluwo

kaluwo is a Sri Lankan discussion forum in the style of
[elakiri.com](https://elakiri.com): boards, threads and posts, built for a
community that speaks Sinhala, Tamil and English.

This repository now has a real database-backed forum for threads, comments,
reactions, cross-device notifications and moderation, on top of the existing
Google/invite authentication flow and Cloudflare Turnstile. The schema and its
Row Level Security policies live in `supabase/migrations/` and must be applied
to your Supabase project (see [supabase/README.md](./supabase/README.md)).
Uploads, modmail and end-to-end encrypted DMs are the next phases.

## Tech stack

- [Next.js](https://nextjs.org) (App Router, TypeScript, Tailwind CSS)
- [Supabase](https://supabase.com) (Postgres, Auth, Row Level Security)
- [catbox.moe](https://catbox.moe) for media hosting (later step)
- Cloudflare Turnstile and Cloudflare in front of the live site (later steps)

## Requirements

- Node.js 20.9 or newer (Node 24 works)
- npm
- A Supabase account for the connection check

## Run locally

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Sign in at [supabase.com/dashboard](https://supabase.com/dashboard) and
   create a new project.
2. Wait for the database to finish provisioning.
3. Open **Project Settings → API** (some projects show **API Keys**).
4. Copy the **Project URL**. It looks like
   `https://<project-ref>.supabase.co`.
5. Copy the **anon public** key. Newer Supabase projects may call this the
   **publishable key**; either public key works with the variable name below.
   Never put the **service_role** key in a `NEXT_PUBLIC_*` variable or send it
   to the browser; the server uses it separately for auth (step 5).

### 3. Create your local environment file

Copy the template, then open `.env.local` and fill in the two values:

**PowerShell:**

```powershell
Copy-Item .env.example .env.local
```

**macOS / Linux:**

```bash
cp .env.example .env.local
```

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

The catbox and media-limit variables in `.env.example` are commented out and
are for later steps. Leave them alone for now.

### 4. Apply the database schema

Follow [supabase/README.md](./supabase/README.md). Run every file in
`supabase/migrations/` in filename order in the Supabase SQL Editor. They
create the tables, RLS policies, the username-login helper, reaction scores,
the reply rules, Google onboarding and invite codes, the security audit log,
post reactions, the Phase 1 posting/notification/rate-limit schema and the
Phase 2 moderation, report, content-visibility and hashed-invite schema.

The generated TypeScript types are already committed at
`src/lib/supabase/types.ts`. Regenerate them only after a schema change.

### 5. Configure authentication and CAPTCHA

1. Copy the **service role** key from Supabase **Project Settings -> API** into
   `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`. It is used only on the server
   for username login, invite-code sign-up and Google onboarding. Never expose
   it to the browser.
2. Enable **Authentication -> Providers -> Google** and paste your Google Cloud
   OAuth Client ID and Secret. Add
   `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized
   redirect URI in the Google Cloud Console.
3. Create a Cloudflare Turnstile widget at
   [dash.cloudflare.com](https://dash.cloudflare.com/?to=/:account/turnstile)
   and add `localhost` and your production domain to its hostnames.
4. Put the Turnstile **site key** in `.env.local` as
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and the **secret key** as
   `TURNSTILE_SECRET_KEY`. The app verifies the token on the server for login,
   invite sign-up and password-reset requests.
5. Leave Supabase's built-in CAPTCHA **off**. The app verifies Turnstile
   itself, which avoids the request-IP problem with server-side username login.
6. Confirm that **Authentication -> URL Configuration** includes
   `http://localhost:3000/auth/callback` (and the production equivalent).
7. Turn **Confirm email** off. Google verifies Google accounts, and username
   sign-up is gated by a single-use invite code instead of email.
8. After the Phase 2 migrations, create invite codes in
   `/moderation/invites` as an admin. Copy each plaintext code immediately;
   the database stores only a hash and cannot show it again.

For local development, Cloudflare's always-pass test keys are:

```dotenv
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

Replace both with the real widget keys before deploying.

### 6. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and try `/signup` or
`/login`. The home page no longer shows a Supabase connection banner; setup
problems appear on the auth pages where they matter.

Use the moon/sun button in the top bar to switch between light and dark mode.
The first visit follows your operating-system preference, and the toggle
remembers your choice in the browser.

If you change `.env.local`, stop and restart the dev server.

## Writing posts and comments

- Creating a thread or commenting requires a logged-in member who is not
  banned. Logged-out visitors see a login prompt with a link back to the page.
- Threads and comments are stored in Supabase and appear on every device.
- A thread needs a title (3-200 characters) and a non-empty opening post.
  `create_thread` writes both rows in one database transaction, so a failed
  opening post leaves no empty thread behind.
- New accounts (`new_member`) complete a Cloudflare Turnstile challenge before
  posting or commenting. Established members do not. The server re-checks the
  role and verifies the token; the browser-supplied role is never trusted.
- The post/comment editor is a visual rich-text editor with **Write / Preview**
  tabs. Write shows formatted text, not source markup; Preview shows the
  sanitized result.
- The toolbar supports bold, italic, strikethrough, inline code, links,
  quotes, lists and horizontal rules.
- The **Text size** selector (Small, Medium, Large) applies to the selected
  text. With no selection, it applies to the text you type next. Choosing
  another size updates the same text instead of nesting sizes.
- Paste a supported link **on its own line** to embed it: YouTube, Vimeo,
  Reddit, Facebook, X/Twitter, Instagram, TikTok or Spotify. A link inside a
  sentence stays a normal link.
- Embeds load lazily, use only whitelisted providers, and always include an
  "Open original" link.
- Content is sanitised on the server before storage and again by the renderer
  (`rehype-sanitize`) before display. The render-time sanitiser is the
  authoritative gate; no post or comment uses `dangerouslySetInnerHTML`.

The site baseline is 19px so the forum is comfortable to read on a desktop;
the editor's Text size control applies to the text you select or type next.

### Comments, quotes and reactions

- Comments are listed **above** the comment composer, so the discussion stays
  in view while you write.
- Members can react to other members' posts and comments with like, laugh,
  wow, anger or dislike. The primary **Like** button likes on a click or tap;
  hover it (desktop) or press and hold (touch) to pick another emoji. Your own
  content does not show reaction buttons, and the RLS policy rejects the write
  even if the UI is bypassed.
- Banned members can still react, but cannot post or comment.
- **Reply** copies the comment and its author to the quote clipboard and marks
  the reply target. The composer shows who you are replying to.
- Select text inside a comment to get a floating **Quote** button. Copied
  quotes collect behind the clipboard button in the editor, where each one can
  be removed or pasted into the comment.
- Type `@username` to mention a member. Mentions are highlighted in rendered
  posts and comments.
- The bell lists reply, quote and mention notifications from Supabase. Read
  state is per member, so it follows you across devices. Realtime delivers new
  rows when the websocket is available; a 60-second poll is the fallback.
- **Save** is a browser-local bookmark in this phase. It does not create a
  notification.
- Staff see a **Moderate** control on threads and comments. Every action needs
  a reason and is written to the append-only mod log. Members can report a
  post, comment or member; staff handle reports in `/moderation/reports`.
- Soft-deleted content is hidden from members but visible to staff with the
  reason and acting moderator. Staff can restore it.

### Forum feed and rate limits

- The home feed is server-rendered and cursor-paginated. It never uses
  `OFFSET`. Sort by **Latest activity** or **Newest**, filter by board, and see
  the reply count for each thread.
- Threads with no active opening post are hidden from the feed and the thread
  page, including threads created by a direct API insert that skipped
  `create_thread`.
- Posting and commenting are rate limited per member:
  - `new_member`: 1 thread / 10 minutes, 5 comments / 10 minutes
  - `member` / `senior_member`: 5 threads / 15 minutes, 30 comments / 15 minutes
  - staff: higher limits
- Limits are enforced by `BEFORE INSERT` triggers, so a direct PostgREST write
  cannot bypass them. The app records `forum.rate_limited` in
  `security_events` when it catches a rate-limit error.

## Available scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run build` | Create a production build |
| `npm run start` | Run the production build |
| `npm run lint` | Run ESLint |
| `npm run test:rls` | Run the Phase 1 + Phase 2 PostgREST/RLS suites against a local Supabase stack |

## Project structure

```text
src/
  app/
    auth/             Google callback, password-reset confirm and error routes
    create/           Database-backed thread composer
    forgot-password/  Reset request page and server action
    login/            Google + username login page and server action
    moderation/       Staff report queue, mod log, member actions and invites
    onboarding/       Google account username/password setup
    profile/          Public profiles, activity, warnings and ban history
    reset-password/   New-password page after the email link
    search/           Simple DB-backed thread and post search
    signup/           Invite-only registration page and server action
    t/[id]/           Thread page, comment pagination and staff controls
    globals.css       Tailwind styles and light/dark colour tokens
    layout.tsx        Root layout, shared header, metadata, fonts, theme bootstrap
    page.tsx          Server-rendered, cursor-paginated forum feed with pinned section
  components/         Header, notification panel, editor, embeds, report/moderation UI
  lib/
    audit/            Service-role security event log
    auth/             Auth errors, redirects, Turnstile, validation, server user
    ban.ts            Effective ban helper shared by server and client UI
    boards.ts         Board names, descriptions and icons
    bookmarks.ts      Browser-local saved-post bookmarks
    forum/            Server actions, cursor helpers, comment pages and sanitizer
    mentions.ts       @mention and quote parsing plus HTML helpers
    moderation/       Staff moderation server actions
    notifications.ts  Supabase-backed notification hook with Realtime + polling
    quotes.ts         Quote clipboard store
    reactions.ts      Shared reaction types and summary helpers
    reports/          Member report creation action
    supabase-errors.ts  Shared rate-limit and moderation error mapping
    use-reactions.ts  Optimistic reaction hook backed by a server action
    supabase/
      admin.ts        Service-role client (server only)
      client.ts       Supabase client for Client Components
      config.ts       Reads and validates the public env vars
      proxy.ts        Refreshes the session on every request
      server.ts       Cookie-aware Supabase client for the server
      types.ts        Generated database types
  proxy.ts            Next.js 16 proxy entry point
supabase/
  migrations/         SQL schema, RLS, auth, posting, notifications, moderation and invites
  tests/              Plain-Postgres RLS suite
  README.md           How to apply the schema, configure Google and make codes
tests/
  phase1-rls.mjs      PostgREST/RLS/Realtime suite for Phase 1
  phase2-rls.mjs      PostgREST/RLS/moderation/RPC suite for Phase 2
```

## Phase 1: database-backed forum

### Migrations to run

Run these after the existing migrations, in filename order:

1. `20261105110000_forum_posting.sql` — `threads.reply_count`, internal RLS
   helpers, cursor indexes, `create_thread()`, `list_threads()` and the tighter
   posts policies.
2. `20261105120000_notifications.sql` — reply/quote/mention notifications,
   RLS, post/thread excerpt clearing and the Realtime publication.
3. `20261105130000_posting_rate_limits.sql` — atomic posting/commenting
   counters and the `BEFORE INSERT` triggers.
4. `20261105140000_reaction_summary.sql` — database-side reaction totals and
   the viewer's own reaction for one thread, so busy threads are not truncated
   by PostgREST's `max_rows`.

### Environment variables

None. Phase 1 uses the existing `NEXT_PUBLIC_SUPABASE_*`,
`SUPABASE_SERVICE_ROLE_KEY` and Turnstile variables.

### Manual test checklist

1. Apply the four Phase 1 migrations and regenerate
   `src/lib/supabase/types.ts` (see
   [supabase/README.md](./supabase/README.md)).
2. Sign in as an established member. Create a thread and confirm it appears on
   the home feed and at `/t/<id>` on a second device/browser.
3. Comment on the thread. Confirm the reply count and last activity update.
4. Sign in as another member who is replied to, quoted or mentioned. Confirm
   the bell shows one notification per comment, with the correct excerpt, and
   that “Mark all read” follows the account to another device.
5. Use the **Moderate** control as a moderator to delete the commented post.
   Confirm the notification excerpt becomes empty.
6. Try to react to your own opening post or comment. The buttons are hidden,
   and a direct PostgREST insert is rejected by RLS.
7. Sign in as a banned member. Confirm reactions still work and thread/comment
   creation is rejected.
8. Sign in as a `new_member`. Confirm the Turnstile widget appears, and that
   the second thread inside 10 minutes is rejected with a rate-limit message.
9. Directly insert a thread row with no opening post (SQL or PostgREST).
   Confirm it is absent from the feed and `/t/<id>` returns 404, and that
   comments on it are rejected.
10. Search for a literal `%` (for example `100%`). Confirm it does not match
    every thread. Use the Older threads link to page with a cursor, not an
    offset.
11. Run the automated suites below.

### Automated tests

PostgREST/RLS/Realtime suite (requires `npx supabase start` and the local keys
printed by it):

```bash
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_ANON_KEY=...
export SUPABASE_SERVICE_ROLE_KEY=...
npm run test:rls
```

Plain PostgreSQL RLS suite (requires the migrations plus a stubbed `auth`
schema; the header of the SQL file has the setup):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase1_plain_postgres.sql
```

The PostgREST suite covers direct inserts that bypass the server actions,
notification visibility, Realtime INSERT/DELETE delivery, `error.hint` for
rate limits, cursor pagination, LIKE wildcard escaping and the non-exposed
helper schema. After a cold `supabase db reset`, the Realtime container can
take up to a minute to boot; if only the Realtime check fails, wait and re-run.
The plain Postgres suite covers the same RLS rules without Supabase services.

### Known limitations

- A direct PostgREST rate-limit attempt is blocked by the trigger but cannot
  write an audit row: PostgreSQL rolls back the trigger's insert when it
  raises. The server action logs `forum.rate_limited`; direct API attempts are
  a known audit gap.
- Direct PostgREST inserts are still blocked by RLS (authentication, ban,
  thread state, own-content rules) and by rate limits, but they bypass
  Turnstile, the pre-storage `sanitize-html` pass and the application's content
  length check. Database length constraints and the render-time
  `rehype-sanitize` gate still apply. This is the accepted trade-off of the
  RLS-based insert design chosen for Phase 1.
- Thread comments load up to 200 rows on the thread page. Comment pagination
  is not implemented yet. The cap keeps the reaction summary under PostgREST's
  default 1,000-row response limit.
- Search uses `ILIKE`, not PostgreSQL full-text search. It is intentionally
  simple for this phase.
- Saved posts are browser-local bookmarks. There is no server-side saved-post
  list or “saved post” notification yet.
- Author editing and author self-soft-delete remain out of scope; staff
  moderation is RPC-only from Phase 2. Uploads, modmail and DMs are later
  phases.
- Notifications are in-app only. There is no email or push delivery.
- The bell subscribes with a `user_id` Realtime filter. RLS also scopes
  INSERT/UPDATE events; the filter is required because Realtime cannot apply
  RLS to DELETE payloads.

## Phase 2: moderation

### Migrations to run

Run these after the Phase 1 migrations, in filename order:

1. `20261106100000_moderation_identity.sql` — effective ban helpers,
   `member_bans`, `member_warnings`, `mod_log`, hierarchy/last-admin protection
   and profile RLS/grant tightening.
2. `20261106110000_reports.sql` — post/member reports, open-report
   deduplication, report rate limits, staff-only resolution records and
   `staff_resolve_report()`.
3. `20261106120000_content_visibility.sql` — deleted-content metadata,
   staff-only visibility, pinned-first read paths, comment pagination and
   per-page reaction summaries.
4. `20261106130000_content_moderation_rpcs.sql` — audited thread/post
   delete/restore/lock/pin/move RPCs.
5. `20261106140000_user_moderation_rpcs.sql` — audited ban/unban/warn and
   admin role-change RPCs with the admin advisory lock.
6. `20261106150000_invite_admin.sql` — hashed invite codes, revocation, one-time
   plaintext display and admin invite RPCs.

### Environment variables

None. Phase 2 uses the existing Supabase, service-role and Turnstile variables.

### Staff routes

- `/moderation` — staff overview.
- `/moderation/reports` — open/resolved/dismissed queue.
- `/moderation/log` — append-only mod log with filters.
- `/moderation/members` — warnings, bans and roles (roles are admin-only).
- `/moderation/invites` — admin-only invite creation and revocation.

### Manual test checklist

1. Apply the six Phase 2 migrations and regenerate
   `src/lib/supabase/types.ts`.
2. As a member, try a direct PostgREST update of your role or ban state.
   Confirm it is rejected.
3. As a moderator, delete a member’s post or comment with a reason. Confirm
   members (including the author) cannot see it, staff see it with the reason
   and acting moderator, and the mod log has one row.
4. Restore the content. Lock/unlock, pin/unpin and move a thread. Confirm the
   pinned section appears above the main feed and moving records the old and
   new board in the mod log.
5. Ban a member with a short expiry. Confirm posting fails, reactions still
   work, and posting succeeds after the expiry without a cron.
6. Warn a member. Confirm the member sees the reason and an Acknowledge button
   on their profile, but not the issuing moderator. Staff see the moderator.
7. Promote a member to moderator, use a moderation action, then demote them.
   Confirm the next action is rejected immediately.
8. Demote the last admin or try to ban an admin. Confirm both are rejected.
9. Report a post, comment and member. Repeat the same report and confirm the
   duplicate is rejected. Spam reports and confirm the rate limit.
10. As staff, resolve/dismiss a report with a note. Confirm the reporter sees
    only the status, never the resolution note or handler. Confirm a moderator
    cannot resolve a report about another moderator; an admin can.
11. Create invite codes in `/moderation/invites`. Copy the plaintext once,
    revoke one, and confirm a revoked code cannot sign up.
12. Open a notification link for a comment beyond the first page. Confirm the
    thread loads forward to that comment and scrolls to it.
13. Create a thread with 205+ comments. Confirm “Load more comments” reaches
    the last page and reaction totals are correct per page.
14. Run `npm run test:rls`.

### Automated tests

`npm run test:rls` now runs both the Phase 1 and Phase 2 PostgREST/supabase-js
suites. The Phase 2 suite covers direct privilege escalation, hierarchy,
last-admin concurrency, demotion immediacy, ban expiry, warnings, reports,
invite hashing/revocation, append-only mod-log enforcement, pinned cursor
behaviour, deleted-content visibility, comment pagination beyond 200 comments
and per-page reaction summaries. The Phase 1 plain-Postgres suite remains
available for the baseline schema.

### Known limitations

- Warnings appear on the member’s profile with an acknowledged banner; they do
  not create a bell notification in Phase 2.
- Author editing and author self-soft-delete remain out of scope. Staff writes
  are RPC-only so they cannot bypass the mod log.
- The mod log is append-only through the API. A database owner with SQL access
  can still modify it; no web/API role can.
- After a ban expires, `profiles.is_banned` can remain true. The effective ban
  check uses `banned_until` against `now()`. A formal unban clears the flag.
- Deleted content is visible to staff in the thread page, reports queue and
  member view. There is not yet a global “all deleted content” browser.
- Comment pagination is oldest-first with “Load more comments”. There is no
  jump-to-latest control.
- Report resolution notes and the mod log are staff-only. Reporters see their
  own report status only.
- Invite plaintext is shown once at creation. If it is lost, revoke the code or
  create a new batch; it cannot be recovered.

## Troubleshooting auth setup

- **Login says username login is not configured** — add
  `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` and restart `npm run dev`.
- **CAPTCHA is not configured** — add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and
  `TURNSTILE_SECRET_KEY` to `.env.local`.
- **Sign-up says the database is not set up** — run the migrations in
  `supabase/migrations/` in filename order.
- **"That invite code is not valid"** - create a fresh code in
  `/moderation/invites` as an admin, or ask an admin to do it. Existing codes
  are stored as hashes and cannot be shown again.
- **Google login is not configured** — enable the Google provider in Supabase
  and add the callback URL to both Supabase and Google Cloud.
- **Usernames:** usernames can be English, Sinhala or Tamil. They are
  lowercase, NFC-normalised, 3-20 characters, and limited to letters/marks,
  digits, underscore and ZWNJ/ZWJ. Other scripts are rejected to reduce
  lookalike-script impersonation.
- **Email link says it is invalid or expired** — check the Supabase Site URL
  and redirect URLs, or switch the password-reset template to the
  `/auth/confirm` `token_hash` link (see
  [supabase/README.md](./supabase/README.md)).
- **Supabase project paused** — resume it in the dashboard.

## Security audit log

Login, sign-up, password-reset and OAuth events are written to the
`security_events` table by `src/lib/audit/security-events.ts`. Each row has the
event, the account, the client IP, the user agent, and a small metadata object.

- The table is **service-role only**. RLS is enabled with no policies, so the
  browser and the anon key cannot read it. Do not add a policy.
- The IP comes from `cf-connecting-ip`, then `x-real-ip`, then
  `x-forwarded-for`, and is `NULL` when none is trustworthy. Only trust these
  headers when the app is actually behind Cloudflare or your own proxy; a
  directly exposed server lets clients forge them.
- Audit failures never break authentication; they are logged to the server
  console instead.
- IPs are personal data. Apply the retention job from
  [supabase/README.md](./supabase/README.md#security-audit-log), disclose the
  window in the privacy notice, and never export rows into the repository.
- MAC (hardware) addresses are **not** collected. They are Layer-2 addresses
  that never cross a router, and browsers have no API that exposes them. Use
  the IP, user agent and account for abuse investigation instead.

## Secrets warning

This repository is public. **Never commit real secrets, keys, IP addresses or
personal data.**

- `.env.local` contains your local values and is ignored by Git.
- All `.env*` files are ignored except `.env.example`.
- `.env.example` must contain placeholders only.
- `CATBOX_USERHASH` is server-side only. Never give it a `NEXT_PUBLIC_`
  prefix and never send it to the browser.
- The Supabase **service_role** key must never appear in the browser or in any
  committed file. Only the public anon/publishable key belongs in
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- In production, provide secrets through the hosting environment, not through
  Git.

## Specification

The full product and security specification lives in [SPEC.md](./SPEC.md).
