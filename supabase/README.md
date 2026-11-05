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

### Dashboard method (recommended)

1. Open your project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Go to **SQL Editor -> New query**.
3. Paste the whole first migration and click **Run**. Repeat for each file, in
   order.
4. Open **Table Editor** and confirm these tables exist:
   `profiles`, `boards`, `threads`, `posts`, `reactions`, `reports`,
   `media_assets`.
5. Open `boards`. It should contain 7 rows (Announcements, General, ...).
6. Open `profiles`. It should have a `reaction_score` column.

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

## 2. Configure Auth URLs

In **Authentication -> URL Configuration**:

- **Site URL:** `http://localhost:3000`
- **Redirect URLs:** `http://localhost:3000/auth/callback`

The email provider is already enabled, and **Confirm email** is already on.
Leave it on: the spec requires verified email addresses. Email is used for
verification and password reset only; members log in with a username.

The default Supabase email links redirect to `/auth/callback`, which exchanges
the code for a session. The `/auth/confirm` route is also available if you
switch the email templates to `token_hash` links (see section 6).

## 3. Username login

Supabase Auth signs in with an email address. To keep the login form
username-only, the app calls the `resolve_login_email(text)` database function
with the **service role** key, then signs in as the returned email.

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

## 5. Generate TypeScript types

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

## 6. Cross-browser email links (optional)

The default `{{ .ConfirmationURL }}` flow works when the email is opened in the
same browser that started sign-up or password reset. To make links work in any
browser, change **Authentication -> Email Templates**:

**Confirm signup:**

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/profile
```

**Reset password:**

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
```

`/auth/confirm` calls `verifyOtp` and sets the session cookies before
redirecting. Keep the Site URL set to your real origin.

## What the schema contains

| Table | Purpose |
| --- | --- |
| `profiles` | One row per auth user: username, avatar, role, ban flag, reaction score |
| `boards` | Forum boards; `id` is the slug used in URLs (`general`, `food`) |
| `threads` | Threads, lock/pin flags, soft-delete flag, last activity time |
| `posts` | Opening posts and replies; `is_opening` marks the first post |
| `reactions` | One changeable reaction per user per comment |
| `reports` | Report queue with `open` / `resolved` / `dismissed` |
| `media_assets` | catbox upload metadata and removal status |

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

## What the RLS policies allow

- **Public reads:** profiles, boards, non-deleted threads, non-deleted posts,
  reactions, and active media. Anonymous visitors can browse the forum.
- **Authenticated writes:** a member can start a thread, add a post or reply,
  react to a comment, report a post, or add media. The row must belong to them.
- **Banned members:** can still read, but every write policy checks
  `is_banned()` and rejects them.
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

## Troubleshooting

- **`must be owner of relation users` when creating the trigger** — run the
  migration as the `postgres` role in the SQL Editor, not through a restricted
  connection.
- **`relation "profiles" already exists`** — that migration already ran. Do not
  run it twice. Check the Table Editor and continue with the next file.
- **`function resolve_login_email does not exist`** — run
  `20261105010000_username_login.sql`.
- **Username login says it is not configured** — add
  `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` and restart the server.
- **CAPTCHA is not configured** — add both Turnstile keys to `.env.local` and
  restart the server.
- **Types still show `never` for a new table** — regenerate
  `src/lib/supabase/types.ts` with the command above.
