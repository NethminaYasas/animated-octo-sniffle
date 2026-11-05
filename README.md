# kaluwo

kaluwo is a Sri Lankan discussion forum in the style of
[elakiri.com](https://elakiri.com): boards, threads and posts, built for a
community that speaks Sinhala, Tamil and English.

This repository now has the database schema and the authentication flow:
Google sign-in, invite-only username/password sign-up, password reset and
Cloudflare Turnstile. The schema and its Row Level Security policies live in
`supabase/migrations/` and must be applied to your Supabase project (see
[supabase/README.md](./supabase/README.md)). Moderation, uploads and the
database-backed posting/reply UI are still to be built.

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
and post reactions.

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
8. Generate invite codes in the Supabase SQL Editor with the query in
   [supabase/README.md](./supabase/README.md#5-create-invite-codes).

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

- Creating a thread or commenting requires a logged-in member. Logged-out
  visitors see a login prompt with a link back to the page.
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

The site baseline is 19px so the forum is comfortable to read on a desktop;
the editor's Text size control applies to the text you select or type next.

### Comments, quotes and reactions

- Comments are listed **above** the comment composer, so the discussion stays
  in view while you write.
- Members can react to other members' posts and comments with like, laugh,
  wow, anger or dislike. The primary **Like** button likes on a click or tap;
  hover it (desktop) or press and hold (touch) to pick another emoji. Your own
  content does not show reaction buttons. Banned members can still react, but
  cannot post or comment.
- Admins and moderators see **Delete** on posts and comments.
- **Reply** copies the comment and its author to the quote clipboard and marks
  the reply target. The composer shows who you are replying to.
- Select text inside a comment to get a floating **Quote** button. Copied
  quotes collect behind the clipboard button in the editor, where each one can
  be removed or pasted into the comment.
- Type `@username` to mention a member. Mentions are highlighted in rendered
  posts and comments.
- The bell in the header opens a panel listing replies, quotes and mentions.

**Local prototype limitation:** posts and comments are still saved in this
browser, so notifications are local too. They appear for another member when
that member uses the same browser. Cross-device delivery comes with the
database-backed posting step.

## Available scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run build` | Create a production build |
| `npm run start` | Run the production build |
| `npm run lint` | Run ESLint |

## Project structure

```text
src/
  app/
    auth/             Google callback, password-reset confirm and error routes
    create/           Local post composer (database posting is a later step)
    forgot-password/  Reset request page and server action
    login/            Google + username login page and server action
    onboarding/       Google account username/password setup
    profile/          Server-rendered member profile with reaction score
    reset-password/   New-password page after the email link
    signup/           Invite-only registration page and server action
    globals.css       Tailwind styles and light/dark colour tokens
    layout.tsx        Root layout, shared header, metadata, fonts, theme bootstrap
    page.tsx          Home page and forum shell
  components/         Header, notification panel, rich text editor, embeds
  lib/
    audit/            Service-role security event log
    auth/             Auth errors, redirects, Turnstile, validation
    boards.ts         Board names, descriptions and icons
    mentions.ts       @mention and quote parsing plus HTML helpers
    notifications.ts  Local reply/quote/mention notifications
    quotes.ts         Quote clipboard store
    reactions.ts      Local post/comment reactions
    supabase/
      admin.ts        Service-role client (server only)
      client.ts       Supabase client for Client Components
      config.ts       Reads and validates the public env vars
      proxy.ts        Refreshes the session on every request
      server.ts       Cookie-aware Supabase client for the server
      types.ts        Generated database types
  proxy.ts            Next.js 16 proxy entry point
supabase/
  migrations/         SQL schema, RLS, username login, scores, replies and invites
  README.md           How to apply the schema, configure Google and make codes
```

## Troubleshooting auth setup

- **Login says username login is not configured** — add
  `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` and restart `npm run dev`.
- **CAPTCHA is not configured** — add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and
  `TURNSTILE_SECRET_KEY` to `.env.local`.
- **Sign-up says the database is not set up** — run the migrations in
  `supabase/migrations/` in filename order.
- **“That invite code is not valid”** — generate a fresh code with the SQL in
  [supabase/README.md](./supabase/README.md#5-create-invite-codes).
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
