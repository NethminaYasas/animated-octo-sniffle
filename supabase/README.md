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

### Dashboard method (recommended)

1. Open your project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Go to **SQL Editor -> New query**.
3. Paste the whole first migration and click **Run**. Repeat for each file, in
   order.
4. Open **Table Editor** and confirm these tables exist:
   `profiles`, `boards`, `threads`, `posts`, `reactions`, `reports`,
   `media_assets`, `security_events`.
5. Open `boards`. It should contain 7 rows (Announcements, General, ...).
6. Open `profiles`. It should have `reaction_score` and
   `onboarding_completed` columns.
7. Open `invite_codes`. It should exist and be empty until you generate codes.

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

Username + password sign-up needs a single-use invite code. Codes live in the
`invite_codes` table and have no browser access at all.

Generate 10 codes in **SQL Editor**:

```sql
insert into public.invite_codes (code)
select replace(gen_random_uuid()::text, '-', '')
from generate_series(1, 10)
returning code;
```

List unused codes:

```sql
select code, created_at
from public.invite_codes
where used_at is null
order by created_at;
```

A code is claimed atomically by `consume_invite_code()` during sign-up. It is
single-use even if two people submit it at the same time. Keep the codes out of
public posts and screenshots.

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
| `media_assets` | catbox upload metadata and removal status |
| `invite_codes` | Single-use keys for username + password sign-up; no browser access |
| `security_events` | Auth and moderation audit trail with IP; service-role only |

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

### Security audit log

`security_events` records authentication events (`login.succeeded`,
`login.failed`, `signup.succeeded`, `signup.failed`,
`password_reset.requested`, `oauth.succeeded`, `oauth.failed`) with the
account, IP, user agent and a small JSONB metadata object. The app calls
`recordSecurityEvent()` from `src/lib/audit/security-events.ts`.

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

## What the RLS policies allow

- **Public reads:** profiles, boards, non-deleted threads, non-deleted posts,
  reactions, and active media. Anonymous visitors can browse the forum.
- **Authenticated writes:** a member can start a thread, add a post or reply,
  react to a comment, report a post, or add media. The row must belong to them.
- **Banned members:** can still read and react. Posting, commenting,
  uploading, reporting and other writes still check `is_banned()` and reject
  them; the reaction policies intentionally do not.
- **Threads:** only moderators can lock, pin, move, soft-delete or hard-delete
  a thread. Authors do not edit thread titles.
- **Posts:** authors can edit their own content, set `reply_to_post_id`, and
  soft-delete their own posts. They cannot move a post, change its author, or
  turn a reply into the opening post. Moderators can update or hard-delete any
  post.
- **Reactions:** only comments (not the opening post) can be reacted to.
  Members can change or remove their own reaction.
- **Reports:** the reporter and moderators can read a report. Only moderators
  can change its status.
- **Media:** active assets are public; owners and moderators can mark them
  removed. Only moderators can delete the row.
- **Profiles:** users can edit their own username and avatar. Only admins can
  change roles. Moderators can ban members, but cannot ban an admin. The
  service role and SQL editor bypass these checks.
- **Reactions:** members, including banned members, can react to active posts
  and comments in active threads, but not to their own content.
  `reaction_score` still counts reactions on comments only, so reacting to an
  opening post does not change a member's score.
- **Audit log:** `security_events` has RLS enabled and no policies. Only the
  service role and the SQL editor can read or write it.

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
- **“That invite code is not valid”** — generate a fresh code with the SQL in
  section 5. Each code works once.
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
