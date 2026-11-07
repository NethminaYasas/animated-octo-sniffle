# Supabase setup

This folder owns the database schema. The application code lives in `src/`.

## 1. Apply the migrations

Run every file in `migrations/` in filename order:

1. `20261105000000_initial_schema.sql` — tables, enums, indexes, triggers,
   RLS policies, board seed.
2. `20261105010000_username_login.sql` — service-role-only username-to-email
   lookup.
3. `20261105020000_reaction_scores.sql` — `profiles.reaction_score` and its
   recompute triggers.
4. `20261105030000_replies.sql` — reply validation and lookup index.
5. `20261105040000_google_auth_and_invites.sql` — `profiles.onboarding_completed`,
   single-use `invite_codes`, and the service-role-only
   `consume_invite_code()` claim function.
6. `20261105050000_unicode_usernames.sql` — Sinhala/Tamil usernames, NFC
   normalisation, and the Unicode-safe profile trigger.
7. `20261105060000_security_events.sql` — service-role-only `security_events`
   audit log for auth events.
8. `20261105070000_post_reactions.sql` — members can react to posts as well as
   comments, but not to their own content.
9. `20261105080000_member_tiers.sql` — adds the `new_member` and
   `senior_member` role values.
10. `20261105090000_member_tier_promotion.sql` — new accounts start as
    `new_member`, auto-promote to `member` after 28 days and `senior_member`
    after 2 years.
11. `20261105100000_member_tier_schedule.sql` — schedules
    `promote_member_roles()` hourly with `pg_cron`.
12. `20261105110000_forum_posting.sql` — `threads.reply_count`, internal RLS
    helpers, cursor indexes, atomic `create_thread()`, cursor-paginated
    `list_threads()`, and tighter post visibility/insert policies.
13. `20261105120000_notifications.sql` — `notifications` table, notification
    RLS, excerpt clearing on soft-delete, and the Realtime publication.
14. `20261105130000_posting_rate_limits.sql` — private rate-limit buckets and
    `BEFORE INSERT` triggers for posting and commenting.
15. `20261105140000_reaction_summary.sql` — per-thread reaction totals and the
    caller's own reaction, aggregated in the database.
16. `20261106100000_moderation_identity.sql` — effective bans,
    `member_bans`, `member_warnings`, `mod_log`, hierarchy/last-admin
    protection and profile RLS/grant tightening.
17. `20261106110000_reports.sql` — post/member reports, open-report
    deduplication, report rate limits, staff-only resolution records and
    `staff_resolve_report()`.
18. `20261106120000_content_visibility.sql` — deleted-content metadata,
    staff-only visibility, pinned-first feed reads, comment pagination and
    per-page reaction summaries.
19. `20261106130000_content_moderation_rpcs.sql` — audited thread/post
    delete/restore/lock/pin/move RPCs.
20. `20261106140000_user_moderation_rpcs.sql` — audited ban/unban/warn and
    admin role-change RPCs with the admin advisory lock.
21. `20261106150000_invite_admin.sql` - hashed invite codes, revocation,
    one-time plaintext display and admin invite RPCs.
22. `20261107100000_upload_enums.sql` - enum values for upload moderation,
    upload reports and hash blocks.
23. `20261107110000_uploads.sql` - `uploads`, `post_uploads`,
    `upload_hash_blocks`, the safe `public_uploads`/`staff_uploads` views, the
    upload quota RPC, linking, removal/restore, hash blocking, unlinked-upload
    expiry and upload-report support. Also drops the unused, empty
    `media_assets` table.
24. `20261107120000_safe_moderation_views.sql` - replaces the `my_bans` and
    `my_warnings` views with `SECURITY DEFINER` functions so the Supabase
    linter stops flagging security-definer views.
25. `20261108100000_modmail_enums.sql` - Phase 4 enums: notification kinds
    (`modmail_new_ticket`, `modmail_reply`, `modmail_status_change`), mod log
    actions/target types (`modmail.ticket.*`, `modmail.member_mute`,
    `modmail.retention_deleted`), rate-limit bucket actions
    (`modmail`, `modmail_staff`, `modmail_appeal`, `moderation`, `upload`).
    Restores `consume_posting_rate_limit()` with effective-ban check and all
    action handlers.
26. `20261108110000_modmail_tables.sql` - `modmail_tickets`,
    `modmail_messages`, `modmail_internal_notes`, `modmail_mutes` tables with
    RLS enabled; no direct `anon`/`authenticated` grants.
27. `20261108120000_modmail_rls.sql` - RLS policies and
    `kaluwo_private.can_staff_access_ticket()` conflict helper.
28. `20261108130000_modmail_rpcs.sql` - All modmail RPCs:
    `open_ticket`, `reopen_my_ticket`, `staff_open_ticket`, `reply_to_ticket`,
    `add_internal_note`, `assign_ticket`, `set_ticket_status`,
    `set_ticket_priority`, `escalate_ticket`, `mute_member`, `unmute_member`.
29. `20261108140000_modmail_notifications.sql` - `ticket_id` column on
    `notifications`; unique index per `(recipient, ticket)`.
30. `20261108150000_modmail_cleanup.sql` - `expire_modmail_tickets()`
    service-role cleanup (90 days non-appeal, 365 days ban appeal).
31. `20261108160000_modmail_member_rpcs.sql` - Safe member-facing
    `my_tickets()` and `my_messages()` SECURITY DEFINER functions.
32. `20261108170000_modmail_staff_access.sql` -
    `kaluwo_private.can_staff_access_ticket_for()` with explicit actor ID.
33. `20261108180000_modmail_rate_limit_fix.sql` - Restores effective-ban check
    in `consume_posting_rate_limit()`; adds `modmail_appeal` bucket; fixes
    `open_ticket()` to persist opening message + notification; fixes
    `mute_member()` to exclude lifted mutes.

Migration 11 needs the `pg_cron` extension. Supabase normally allows the
migration to create it; if not, enable **pg_cron** under
**Database -> Extensions** first, then rerun that file. You can always promote
accounts manually with `select public.promote_member_roles();`.

### Dashboard method (recommended)

1. Open your project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Go to **SQL Editor -> New query**.
3. Paste the whole first migration and click **Run**. Repeat for each file, in
   order.
4. Open **Table Editor** and confirm these tables exist:
   `profiles`, `boards`, `threads`, `posts`, `reactions`, `reports`,
   `uploads`, `post_uploads`, `security_events`, `notifications`, `mod_log`,
   `member_bans`, `member_warnings`, `report_resolutions`.
5. Confirm the functions `my_bans()` and `my_warnings()` exist (they replaced
   the old views).
6. Open `boards`. It should contain 7 rows (Announcements, General, ...).
7. Open `profiles`. It should have `reaction_score`, `onboarding_completed` and
   `banned_until` columns.
8. Open `threads` and `posts`. They should have `reply_count` (threads) and the
   `deleted_reason`, `deleted_by`, `deleted_at` columns.
9. Open `notifications`. It should exist and be empty.
10. Open `invite_codes`. It should have `code_hash`, `code_hint`, `revoked_at`
    and `revoked_by`, and no plaintext `code` column.
11. Confirm the Realtime publication includes `notifications`:
    ```sql
    select schemaname, tablename
    from pg_publication_tables
    where pubname = 'supabase_realtime';
    ```

Each migration runs as one transaction. If one fails, nothing in that file is
applied, so fix the error and run the whole file again.

### CLI method

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

The project ref is the subdomain of `NEXT_PUBLIC_SUPABASE_URL`, for example
`abcdefghijklmnop` for `https://abcdefghijklmnop.supabase.co`.

## 2. Configure Auth URLs and Google

In **Authentication -> URL Configuration**:

- **Site URL:** `http://localhost:3000`
- **Redirect URLs:** `http://localhost:3000/auth/callback`

In **Authentication -> Providers -> Google**:

1. Enable the Google provider.
2. Paste the Client ID and Client Secret from the Google Cloud Console.
3. In the Google Cloud Console OAuth client, add this **Authorized redirect
   URI**: `https://<your-project-ref>.supabase.co/auth/v1/callback`

The app's own callback is `/auth/callback`; Supabase redirects there after
Google finishes. The callback creates the session and sends new Google accounts
to `/onboarding` to pick a username and password.

In **Authentication -> Sign In / Providers** (or the email provider settings),
turn **Confirm email** off. Email verification is no longer used: Google
accounts are verified by Google, and username accounts are gated by a single-use
invite code. Password reset email links still use `/auth/callback`.

The `/auth/confirm` route remains available if you switch the password-reset
email template to a `token_hash` link (see section 6).

## 3. Username login

Supabase Auth signs in with an email address. To keep the login form
username-only, the app calls the `resolve_login_email(text)` database function
with the **service role** key, then signs in as the returned email.

- Google accounts resolve to their real Google email.
- Invite-code accounts have no real email. The server creates them with a
  reserved, non-deliverable address (`<username>@login.kaluwo.invalid`). That
  identifier is never shown in the UI and never receives mail.

Add the key to `.env.local`:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

- The key is server-only. Never prefix it with `NEXT_PUBLIC_` and never import
  `src/lib/supabase/admin.ts` from a Client Component.
- `resolve_login_email` is `SECURITY DEFINER` and can read `auth.users`. `anon`
  and `authenticated` are explicitly denied; only `service_role` may execute it.
- The server action uses a dummy email when the username does not exist, so the
  login error does not reveal whether an account exists.

## 4. Cloudflare Turnstile

1. Create a widget in the
   [Cloudflare dashboard](https://dash.cloudflare.com/?to=/:account/turnstile).
   Add `localhost` and your production domain to its hostnames.
2. Add the public site key and the server secret to `.env.local`:

   ```dotenv
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-site-key
   TURNSTILE_SECRET_KEY=your-secret-key
   ```

3. Leave Supabase's built-in CAPTCHA **off** (Authentication -> Bot and Abuse
   Protection). The app calls Cloudflare's `siteverify` endpoint itself from
   `src/lib/auth/turnstile.ts`, so server-side username login is not rejected
   because of a changed request IP.
4. Turnstile is enforced on login, sign-up and password-reset requests.

Cloudflare's always-pass local test keys:

```dotenv
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

Replace both before deploying.

## 5. Create invite codes

Username + password sign-up needs a single-use invite code. From Phase 2,
admins create and revoke codes in `/moderation/invites`; the browser has no
access to the `invite_codes` table.

- Codes are generated in the database with 128-bit `pgcrypto` randomness.
- Only a SHA-256 hash and a six-character display hint are stored. The plaintext
  is returned **once** at creation. Copy it immediately; it cannot be recovered.
- `admin_list_invite_codes()` is admin-only and never returns plaintext.
- Revoke an unused code by its hash in the admin UI. Used codes cannot be
  revoked.
- `consume_invite_code()` hashes the supplied plaintext and atomically claims
  it, rejecting used or revoked codes.

The old manual SQL that inserted a plaintext `code` no longer works because the
column was removed. Use the admin UI, or call
`admin_create_invite_codes(count, reason, request_id)` from the SQL Editor as an
admin.

## 6. Generate TypeScript types

After the migrations are applied:

```bash
npx supabase gen types typescript \
  --project-id <your-project-ref> \
  --schema public > src/lib/supabase/types.ts
```

Then format the file (optional, but keeps diffs readable):

```bash
npx oxfmt src/lib/supabase/types.ts
```

`src/lib/supabase/types.ts` is committed so the app type-checks without a
Supabase login. Regenerate it whenever the schema changes.

## 7. Cross-browser password-reset links (optional)

The default `{{ .ConfirmationURL }}` flow works when the email is opened in the
same browser that requested the reset. To make the link work in any browser,
change the **Reset password** template under **Authentication -> Email
Templates**:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
```

`/auth/confirm` calls `verifyOtp` and sets the session cookies before
redirecting. Keep the Site URL set to your real origin.

## What the schema contains

| Table | Purpose |
| --- | --- |
| `profiles` | One row per auth user: username, avatar, role, ban flag, onboarding flag, reaction score |
| `boards` | Forum boards; `id` is the slug used in URLs (`general`, `food`) |
| `threads` | Threads, lock/pin flags, soft-delete flag, last activity time |
| `posts` | Opening posts and replies; `is_opening` marks the first post |
| `reactions` | One changeable reaction per member per post or comment |
| `reports` | Report queue with `open` / `resolved` / `dismissed` |
| `uploads` | Upload metadata, hashes, status and removal state (safe columns only for members) |
| `notifications` | Per-member reply/quote/mention notifications with read state |
| `mod_log` | Append-only moderation audit log; staff-readable, no direct API writes |
| `member_bans` | Private ban history and issuing moderator; staff-only base table |
| `member_warnings` | Private warnings and issuing moderator; staff-only base table |
| `report_resolutions` | Staff-only resolution note, resolver and linked mod-log row |
| `invite_codes` | Hashed single-use sign-up codes with revocation and one-time plaintext display |
| `security_events` | Auth and moderation audit trail with IP; service-role only |

The `my_bans()` and `my_warnings()` functions expose a member's own
reason/expiry and acknowledgement state without the issuing moderator identity.
They are `SECURITY DEFINER` with a pinned `search_path`, `EXECUTE` is revoked
from `public`/`anon`, and they filter on `auth.uid()`. Staff keep reading the
base tables, so they still see the moderator.

`kaluwo_private` is an internal schema. It is **not** exposed by PostgREST and
holds the RLS helpers, reply-count trigger and rate-limit buckets.

### Account flows

- **Google:** OAuth verifies the email. The callback creates a session. A new
  profile has `onboarding_completed = false`, so the member is sent to
  `/onboarding` to choose a username and password.
- **Invite code:** a server action creates a confirmed Supabase user with a
  random `user-<uuid>@login.kaluwo.invalid` address, then atomically claims the
  invite code. The member can sign in with the username + password immediately.
- **Usernames:** 3-20 characters, lowercase and NFC-normalised. English,
  Sinhala and Tamil letters/marks, digits and underscore are allowed; the
  database constraint and the profile trigger enforce the same set.
- **Login:** Google, or username + password. `resolve_login_email()` maps the
  username to the account's real or internal email before Supabase Auth checks
  the password.
- **Email verification:** not used. Email is only used for password reset on
  accounts that have a real Google address.
- **Invite gate:** the profile trigger rejects any new auth user that is not
  Google OAuth and does not have the service-role-only
  `app_metadata.kaluwo_invite = true` marker. Calling Supabase's public
  sign-up endpoint with the anon key therefore cannot bypass invite codes.

### Reaction score

- `profiles.reaction_score` is positive reactions (`like`, `laugh`, `wow`)
  minus negative reactions (`anger`, `dislike`) received on the member's
  comments.
- Opening posts and soft-deleted comments are excluded.
- The score is recomputed from `reactions` by triggers, so changing a reaction,
  deleting one, soft-deleting a comment or restoring it stays consistent.
- Members cannot write `reaction_score` directly; it is not in their column
  update grant.

### Replies

- `posts.reply_to_post_id` points at the post being replied to. The target
  post's author is the member being replied to.
- The validation trigger requires the target to be an active post in the same
  thread, and rejects self-replies.
- `posts_reply_to_idx` makes reply lookups cheap.

### Posting and rate limits

- `create_thread(board, title, content)` is `SECURITY INVOKER`, so both inserts
  are still checked by the thread and post RLS policies. It creates the thread
  and the opening post in one transaction.
- Direct `posts` inserts are comments only. The opening post must be the first
  post in the author's own thread. Comments are rejected in threads with no
  active opening post.
- `threads.reply_count` is maintained by a `SECURITY DEFINER` trigger after
  post insert, hard delete, soft delete/restore, or a thread move.
- Rate limits are enforced in `BEFORE INSERT` triggers on `threads` and
  `posts`:
  - `new_member`: 1 thread / 10 minutes, 5 comments / 10 minutes
  - `member` / `senior_member`: 5 threads / 15 minutes, 30 comments / 15 minutes
  - staff: higher limits
- `kaluwo_private.consume_posting_rate_limit()` uses an atomic
  `INSERT ... ON CONFLICT ... WHERE used < limit` upsert. A new time window gets
  a new row, which resets the counter.
- The trigger raises with `hint = 'kaluwo_rate_limited'` and
  `detail = <retry seconds>`. The server actions catch that, show a friendly
  message, and record `forum.rate_limited` in `security_events`.
- **Audit gap:** a direct PostgREST insert is still rejected by the trigger,
  but PostgreSQL rolls back any audit row written before the `RAISE`. Only the
  server-action path records the event.

### Notifications

- `notifications` rows are created only by the server action with the service
  role. There is no browser INSERT policy, so a client cannot send a
  notification to another member.
- Recipients are resolved from database rows: the reply target's `author_id`,
  the thread's `author_id`, or a profile looked up from a quoted/mentioned
  username. The actor is always `auth.uid()`, and self-notifications are
  skipped.
- One notification is stored per `(user_id, post_id)`. Priority is reply >
  quote > mention.
- The recipient can SELECT, UPDATE `read_at` and DELETE only their own rows.
- `clear_notification_excerpts` empties the excerpt when the commented post is
  soft-deleted. `clear_thread_notification_excerpts` clears the excerpt and
  replaces the title snapshot with `[deleted thread]` for every notification in
  a soft-deleted thread.
- `notifications` is in the `supabase_realtime` publication with
  `REPLICA IDENTITY FULL`. The browser subscribes with a `user_id=eq.<uuid>`
  filter. RLS also scopes INSERT/UPDATE events. The filter is required because
  Realtime cannot apply RLS to DELETE payloads.

### Reaction summary

`thread_reaction_summary(thread_id)` aggregates reactions per post and kind and
returns whether the caller has that reaction. The thread page uses it instead
of fetching every raw reaction row, so PostgREST's `max_rows` limit cannot
silently undercount a busy thread.

### Cursor pagination

`list_threads(board, sort, before_at, before_id, limit)` returns the next page
using `(last_post_at, id)` for `latest` or `(created_at, id)` for `new`. It
never uses `OFFSET`. Threads with no active opening post are excluded.

### Roles, effective bans and hierarchy

- `profiles.role` remains the authoritative DB role. `is_banned()` and
  `is_moderator()` / `is_admin()` read `profiles` on every call and treat a ban
  as active only while `is_banned` and `banned_until` are current. A demotion
  or ban therefore takes effect immediately, even if a client still holds an
  old JWT or UI state.
- Members never receive a direct UPDATE privilege on `role`, `is_banned` or
  `banned_until`. The staff RPCs are the only write path.
- Moderators cannot act on admins or other moderators. Admins can act on
  moderators and members. Admins cannot be banned at all.
- `admin_set_role` allows member/moderator/admin transitions and blocks
  removing the last active admin. `admin_set_role`, `moderate_ban_user` and
  `moderate_unban_user` take the same transaction-scoped advisory lock, then
  re-check the caller’s live admin/staff role after acquiring it. Concurrent
  demotions cannot leave zero admins.
- `member_bans` stores the private reason and issuing moderator. Members read
  their own safe rows through `my_bans()`; staff read the base table.
- Warnings use `member_warnings`, the `my_warnings()` function and
  `acknowledge_warning()`. Warnings do not create bell notifications.

### Moderation log

`mod_log` is append-only through the API:

- `authenticated` gets SELECT only. The RLS policy requires
  `is_moderator()`; a demoted or banned moderator loses access immediately.
- There are no INSERT/UPDATE/DELETE policies or grants for `authenticated`.
  Even an admin cannot mutate it through PostgREST.
- Every staff RPC writes the state change and its `mod_log` row in one
  transaction. Rows include the actor, action, target snapshot, required
  reason, and `previous_value` / `new_value` JSON.
- A database owner with SQL access can still change the table; the append-only
  rule is enforced for the application/API.

### Reports

- `reports` supports post/comment targets (`post`) and member targets
  (`user`). `post_id` and `target_user_id` are shape-checked.
- Partial unique indexes allow one **open** report per reporter per target.
  Resolved/dismissed reports can be reported again.
- Report creation is rate limited through the same atomic bucket function
  (`action = 'report'`). The server action logs `forum.rate_limited` when it
  gets the `kaluwo_rate_limited` hint.
- Reporters can SELECT only their own report rows. Staff see the queue.
- `report_resolutions` is staff-only and stores the note, resolver and
  `mod_log_id`. Reporters never see the resolution note or handler.
- `staff_resolve_report()` verifies that staff are not resolving their own
  content/account, and requires an admin when the target is a moderator or
  admin. Repeating the same resolution is idempotent.
- The queue supports open / resolved / dismissed filters.

### Invite codes

- `invite_codes` now stores `code_hash` (SHA-256 of the plaintext) and
  `code_hint` (first six characters), plus `revoked_at` / `revoked_by`. The
  plaintext `code` column is gone.
- `admin_create_invite_codes()` generates 128-bit random codes with
  `pgcrypto`, stores only the hash, and returns the plaintext once. Repeating
  the same request id returns no plaintext and no new codes.
- `admin_list_invite_codes()` is admin-only and returns hashes/hints, never
  plaintext.
- `admin_revoke_invite_code()` revokes an unused code by hash. Used codes
  cannot be revoked.
- `consume_invite_code()` hashes the supplied plaintext and rejects used or
  revoked codes.

### Comment pagination and pinned threads

- `list_thread_comments(thread_id, after_at, after_id, limit)` orders by
  `(created_at, id)` ascending. It is `SECURITY INVOKER`, so members do not see
  deleted comments while staff do.
- The thread page loads the first 50 comments and loads forward on demand.
  Notification links auto-load forward until the target comment is present.
- `post_reaction_summary(post_ids[])` aggregates reaction totals and the
  caller’s own reaction for the loaded comment page, avoiding PostgREST
  `max_rows` truncation.
- Pinned threads are a separate section (`list_threads(p_pinned = true)`);
  the main feed uses `p_pinned = false` and its existing cursor. Pin/unpin
  changes cannot corrupt the main feed cursor.
- Indexes cover `(is_pinned, last_post_at, id)` and the board variants.

### Uploads

Files live at catbox.moe and are **public by URL with no retention
guarantee**. Catbox strips nothing, so the app re-encodes images before upload
to drop EXIF/GPS. There is no provider SLA and commercial use needs their
approval.

- `uploads` records the uploader, provider, provider file id, URL, MIME type,
  size, `raw_sha256` (as received) and `sha256` (after stripping), status and
  removal metadata. RLS is enabled with **no member policies**: members and
  anonymous visitors read `public_uploads` (id, url, mime_type, size_bytes,
  status), staff read `staff_uploads` (full row). Neither view is writable;
  there are no client INSERT/UPDATE/DELETE grants.
- `post_uploads` links a post to its uploads. `link_uploads_to_post()` requires
  `auth.uid() = post author` and at most 8 active uploads owned by that author;
  `enforce_post_upload_owner()` re-checks it on every insert, so even the
  service role cannot create a cross-owner link.
- `upload_hash_blocks` is the SHA-256 blocklist. Staff block
  (`moderate_block_upload_hash`), admins unblock
  (`moderate_unblock_upload_hash`), and both write a mod-log row.
- `public.consume_upload_quota(user, bytes)` is `SECURITY DEFINER`, EXECUTE
  granted to `service_role` only. It enforces the per-15-minute count and the
  daily count/byte quota by role: `new_member` 3/20/25 MB; `member` and
  `senior_member` 10/200/1 GB; staff 50/1000/10 GB.
- `moderate_remove_upload` / `moderate_restore_upload` are audited staff RPCs
  with a required reason and the same moderator/admin hierarchy as content.
  Removal sets `status = 'removed'`; rendering shows a bare placeholder to
  members and the reason to staff.
- `expire_unlinked_uploads()` is service-role only and marks active uploads
  older than 24 hours with no `post_uploads` row as removed, writing a
  `system` mod-log row. Schedule it with `npm run uploads:cleanup`.
- Reports accept a third target (`target_type = 'upload'`) with the same
  one-open-report-per-reporter rule and the same resolution hierarchy.
- The Phase 3 migration drops the unused, empty `media_assets` table from the
  initial schema; `uploads` is the single media pipeline.

### Why staff writes are RPC-only

Staff actions need an atomic mod-log row plus live role/hierarchy/last-admin
checks. The RPCs are `SECURITY DEFINER`, pin `search_path`, revoke EXECUTE from
public/anon, grant only `authenticated`, and never accept an actor id or role
from the client. Direct UPDATE/DELETE on `profiles`, `threads`, `posts`,
`reports`, `mod_log`, `member_bans` and `member_warnings` is removed or
restricted. RLS remains the gate for reads and member actions.

### Security audit log

`security_events` records authentication events (`login.succeeded`,
`login.failed`, `signup.succeeded`, `signup.failed`,
`password_reset.requested`, `oauth.succeeded`, `oauth.failed`) and the
Phase 1 `forum.rate_limited` abuse event, with the account, IP, user agent and
a small JSONB metadata object. The app calls `recordSecurityEvent()` from
`src/lib/audit/security-events.ts`.

- **No browser access.** RLS is enabled with no policies, and the default
  `anon` / `authenticated` grants are revoked. The service role is the only
  reader. Do not add a policy for this table.
- **IPs are personal data.** The address comes from `cf-connecting-ip`, then
  `x-real-ip`, then `x-forwarded-for`. It is `NULL` when no trustworthy header
  exists, and it is never used for authorisation. Only trust these headers when
  the app is actually behind Cloudflare or your own proxy.
- **Retention.** The migration includes a commented `pg_cron` job that deletes
  rows older than 90 days. Choose the shortest window that still supports abuse
  investigation, run the job, and describe the same window in the privacy
  notice.
- **Never store secrets.** Metadata holds a username or a reason string, never
  passwords, session tokens or CAPTCHA values.
- **Rate-limit audit gap.** A direct PostgREST insert that hits a rate limit is
  rejected by the trigger, but the trigger cannot persist an audit row because
  the `RAISE` rolls the transaction back. The Next.js server action records
  `forum.rate_limited` instead. This is a documented Phase 1 limitation.

## What the RLS policies allow

- **Public reads:** profiles, boards, non-deleted threads, non-deleted posts,
  reactions, and uploads attached to a visible post (safe columns only).
  Anonymous visitors can browse the forum. Staff see soft-deleted
  threads/posts; members do not.
- **Authenticated writes:** a member can start a thread, add a post or reply,
  react, report content/members, and attach their own uploads. The row must
  belong to them. Staff moderation writes are RPC-only.
- **Banned members:** can still read and react. Posting, commenting,
  uploading, reporting and other writes check the effective `is_banned()`
  state and reject them; the reaction policies intentionally do not.
- **Threads:** direct UPDATE/DELETE is revoked. Only the audited RPCs can
  lock, unlock, pin, unpin, move, soft-delete or restore a thread. Authors do
  not edit thread titles.
- **Posts:** direct UPDATE/DELETE is revoked. Only the audited RPC can
  soft-delete or restore a post/comment. The opening post is created by
  `create_thread`.
- **Reactions:** members, including banned members, can react to active posts
  and comments in active threads, but not to their own content.
  `reaction_score` still counts reactions on comments only, so reacting to an
  opening post does not change a member's score. Members can change or remove
  their own reaction, and moderators can remove reactions.
- **Reports:** reporters can read only their own report rows; staff read the
  queue. Status changes and `report_resolutions` are staff-only RPC writes.
- **Uploads:** members and anonymous visitors read only `id`, `url`,
  `mime_type`, `size_bytes` and `status` for uploads attached to a visible post;
  removed URLs are hidden from members. Staff read the full row through
  `staff_uploads()`. Nobody can INSERT/UPDATE/DELETE through the API; removal is
  an audited RPC.
- **Profiles:** users can edit their own username and avatar only. Role and
  ban changes are admin/moderator RPCs; direct privileged updates are denied.
- **Member moderation records:** members read their own safe rows via
  `my_bans()` / `my_warnings()` without the issuing moderator. Staff read the
  base tables. `mod_log`, `member_bans`, `member_warnings` and
  `report_resolutions` have no direct API INSERT/UPDATE/DELETE grants.
- **Notifications:** a member can read, mark read and delete only their own
  rows. There is no INSERT policy; the service role creates notifications.
- **Rate-limit buckets:** RLS is enabled with no policies, and
  `anon`/`authenticated` have no grants. Only the `SECURITY DEFINER` trigger
  function touches the table.
- **Threads:** a member cannot seed `reply_count` or pin/lock/delete a thread
  on insert. Threads with no active opening post are hidden by `list_threads`
  and the thread page.
- **Posts:** posts in a soft-deleted thread are hidden from members. Direct
  inserts are comments only; the opening post is created by `create_thread`.
- **Audit log:** `security_events` has RLS enabled and no policies. Only the
  service role and the SQL editor can read or write it.

## Phase 1 tests

The repository has three PostgREST suites (`npm run test:rls`) plus a separate
plain-PostgreSQL suite:

1. **PostgREST / Supabase Phase 1** (`tests/phase1-rls.mjs`), **Phase 2**
   (`tests/phase2-rls.mjs`) and **Phase 3** (`tests/phase3-rls.mjs`). Start the
   local stack, apply the migrations, then
   run:
   ```bash
   npx supabase start
   npx supabase db reset
   export SUPABASE_URL=http://127.0.0.1:54321
   export SUPABASE_ANON_KEY=<local anon key>
   export SUPABASE_SERVICE_ROLE_KEY=<local service role key>
   npm run test:rls
   ```
   `npm run test:rls` runs those three PostgREST suites. They create throwaway
   users and cover direct privilege escalation, notification RLS, Realtime
   INSERT/DELETE, rate-limit hints, cursor pagination, LIKE escaping, staff
   hierarchy, last-admin concurrency, demotion immediacy, ban expiry, warnings,
   reports, invite hashing/revocation, append-only mod-log enforcement,
   pinned-feed pagination, deleted-content visibility, comment pagination past
   200 comments, and (Phase 3) upload grants, safe views, quotas, linking
   ownership, hash blocks, removal/restore, upload reports and unlinked-upload
   expiry. They delete their own data. On a cold start, the Realtime container
   can take up to a minute to finish booting after `supabase db reset`; if only
   the Realtime check fails, wait for the stack to settle and run again. The
   app falls back to polling if Realtime is unavailable.

   The upload **route** has its own suite, `npm run test:http`. It rebuilds
   with the local Supabase env, starts a fake catbox and the Next server, and
   checks auth, origin handling, magic bytes, the streaming size cut-off, EXIF
   stripping, quota, blocklist, removal and the CSP header. It never calls the
   real catbox. Run it after `npm run build`-compatible local env is available;
   the script rebuilds `.next` itself to bake in the local `NEXT_PUBLIC_*`
   values.

2. **Plain PostgreSQL Phase 1** (`supabase/tests/phase1_plain_postgres.sql`).
   Apply the migrations to PostgreSQL 17 with the stubbed `auth` schema
   described in the file header, then:
   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
     -f supabase/tests/phase1_plain_postgres.sql
   ```
   The `20261105100000_member_tier_schedule.sql` migration can be skipped in a
   plain PostgreSQL test because it requires `pg_cron`.

## Troubleshooting

- **`must be owner of relation users` when creating the trigger** — run the
  migration as the `postgres` role in the SQL Editor, not through a restricted
  connection.
- **`relation "profiles" already exists`** — that migration already ran. Do not
  run it twice. Check the Table Editor and continue with the next file.
- **`function resolve_login_email does not exist`** — run
  `20261105010000_username_login.sql`.
- **`function consume_invite_code does not exist`** — run
  `20261105040000_google_auth_and_invites.sql`.
- **`function create_thread does not exist`** or **`list_threads does not
  exist`** — run `20261105110000_forum_posting.sql`.
- **The bell never updates** — confirm `notifications` is in the
  `supabase_realtime` publication, the table has a SELECT policy for the
  member, and Realtime is enabled in the Supabase project. The 60-second poll
  still works if Realtime is blocked.
- **A member is unexpectedly rate limited** — the limits are in
  `kaluwo_private.consume_posting_rate_limit()`; wait for the window to expire
  or inspect `kaluwo_private.rate_limit_buckets` in the SQL Editor.
- **“That invite code is not valid”** — create a fresh code in
  `/moderation/invites` as an admin. Plaintext codes are shown once and are
  stored only as hashes; used or revoked codes cannot be reused.
- **`function admin_set_role does not exist`** — run the Phase 2 migrations,
  especially `20261106140000_user_moderation_rpcs.sql`.
- **`function moderate_set_post_deleted does not exist`** — run
  `20261106130000_content_moderation_rpcs.sql`.
- **`function staff_resolve_report does not exist`** — run
  `20261106110000_reports.sql`.
- **`extension "pgcrypto" is not available`** — enable the `pgcrypto`
  extension in Database -> Extensions, then rerun
  `20261106150000_invite_admin.sql`.
- **“At least one admin must remain”** — the last-admin guard is working.
  Promote another admin first.
- **A moderator cannot act on a thread or member** — check the target's role.
  Moderators cannot act on admins or other moderators; admins can.
- **"That file is too large" for a small file** — check `MEDIA_MAX_*_MB`; the
  values are megabytes, and Next's proxy body limit
  (`experimental.proxyClientMaxBodySize`) must stay above the video cap.
- **Uploads fail with "The upload service didn't respond"** — catbox is down,
  slow or blocking the server IP. Check `upload.provider_failed` events and
  retry later; the user sees a generic message on purpose.
- **"Removed by a moderator" never shows the file again** — restore the upload
  in `/moderation/uploads` (or remove the hash block if the file was blocked
  rather than removed).
- **The mod log cannot be edited** — that is intentional. It is append-only
  through the API; use the SQL Editor only for incident recovery, not normal
  operation.
- **An invite plaintext was lost** — it cannot be recovered. Revoke the code by
  its hash in `/moderation/invites` and create a new batch.
- **Google button says the provider is not enabled** — enable Google under
  **Authentication -> Providers** and add the Supabase callback URI to the
  Google OAuth client.
- **Google redirects back to `/login` or shows an error** — add
  `http://localhost:3000/auth/callback` (and the production URL) to
  **Authentication -> URL Configuration -> Redirect URLs**.
- **Username login says it is not configured** — add
  `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` and restart the server.
- **CAPTCHA is not configured** — add both Turnstile keys to `.env.local` and
  restart the server.
- **Types still show `never` for a new table** — regenerate
  `src/lib/supabase/types.ts` with the command above.
