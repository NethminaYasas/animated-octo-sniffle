# Supabase setup

This folder owns the database schema. The application code lives in `src/`.

## 1. Apply the schema

The migration is `migrations/20261105000000_initial_schema.sql`.

### Dashboard method (recommended)

1. Open your project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Go to **SQL Editor -> New query**.
3. Paste the whole migration file and click **Run**.
4. Open **Table Editor** and confirm these tables exist:
   `profiles`, `boards`, `threads`, `posts`, `reactions`, `reports`,
   `media_assets`.
5. Open `boards`. It should contain 7 rows (Announcements, General, ...).

The migration runs as one transaction. If it fails, nothing is applied, so
fix the error and run the whole file again.

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
Leave it on: the spec requires verified email addresses.

Password reset and sign-up links will use `/auth/callback` and `/auth/confirm`
when the authentication step is built.

## 3. Generate TypeScript types

After the migration is applied:

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

## What the schema contains

| Table | Purpose |
| --- | --- |
| `profiles` | One row per auth user: username, avatar, role, ban flag |
| `boards` | Forum boards; `id` is the slug used in URLs (`general`, `food`) |
| `threads` | Threads, lock/pin flags, soft-delete flag, last activity time |
| `posts` | Opening posts and replies; `is_opening` marks the first post |
| `reactions` | One changeable reaction per user per comment |
| `reports` | Report queue with `open` / `resolved` / `dismissed` |
| `media_assets` | catbox upload metadata and removal status |

## What the RLS policies allow

- **Public reads:** profiles, boards, non-deleted threads, non-deleted posts,
  reactions, and active media. Anonymous visitors can browse the forum.
- **Authenticated writes:** a member can start a thread, add a post, react to
  a comment, report a post, or add media. The row must belong to them.
- **Banned members:** can still read, but every write policy checks
  `is_banned()` and rejects them.
- **Threads:** only moderators can lock, pin, move, soft-delete or hard-delete
  a thread. Authors do not edit thread titles.
- **Posts:** authors can edit their own content and soft-delete their own
  posts. They cannot move a post, change its author, or turn a reply into the
  opening post. Moderators can update or hard-delete any post.
- **Reactions:** only comments (not the opening post) can be reacted to.
  Members can change or remove their own reaction.
- **Reports:** the reporter and moderators can read a report. Only
  moderators can change its status.
- **Media:** active assets are public; owners and moderators can mark them
  removed. Only moderators can delete the row.
- **Profiles:** users can edit their own username and avatar. Only admins can
  change roles. Moderators can ban members, but cannot ban an admin. The
  service role and SQL editor bypass these checks.

## Troubleshooting

- **`must be owner of relation users` when creating the trigger** — run the
  migration as the `postgres` role in the SQL Editor, not through a
  restricted connection.
- **`relation "profiles" already exists`** — the migration already ran. Do not
  run it twice. Check the Table Editor.
- **Types still show `never` for a new table** — regenerate
  `src/lib/supabase/types.ts` with the command above.
