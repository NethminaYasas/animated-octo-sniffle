# kaluwo

kaluwo is a Sri Lankan discussion forum in the style of
[elakiri.com](https://elakiri.com): boards, threads and posts, built for a
community that speaks Sinhala, Tamil and English.

This repository now has the database schema and the authentication flow:
username/password login, email verification, password reset and Cloudflare
Turnstile. The schema and its Row Level Security policies live in
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
   Never use the **service_role** key in this app.

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
create the tables, RLS policies, the username-login helper, reaction scores
and the reply rules.

The generated TypeScript types are already committed at
`src/lib/supabase/types.ts`. Regenerate them only after a schema change.

### 5. Configure authentication and CAPTCHA

1. Copy the **service role** key from Supabase **Project Settings -> API** into
   `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`. It is used only on the server
   to map a username to its email during login. Never expose it to the browser.
2. Create a Cloudflare Turnstile widget at
   [dash.cloudflare.com](https://dash.cloudflare.com/?to=/:account/turnstile)
   and add `localhost` and your production domain to its hostnames.
3. Put the Turnstile **site key** in `.env.local` as
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and the **secret key** as
   `TURNSTILE_SECRET_KEY`. The app verifies the token on the server for login,
   sign-up and password-reset requests.
4. Leave Supabase's built-in CAPTCHA **off**. The app verifies Turnstile
   itself, which avoids the request-IP problem with server-side username login.
5. Confirm that **Authentication -> URL Configuration** includes
   `http://localhost:3000/auth/callback` (and the production equivalent).
6. Keep **Confirm email** on. Email is only used for verification and password
   reset; members log in with a username and password.

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

Open [http://localhost:3000](http://localhost:3000). The Supabase status banner
should say **Connected**. If the values are missing you will see **Setup
needed**; if they are wrong you will see a short error explaining what to
check.

Use the moon/sun button in the top bar to switch between light and dark mode.
The first visit follows your operating-system preference, and the toggle
remembers your choice in the browser.

If you change `.env.local`, stop and restart the dev server.

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
    auth/             Email confirmation, callback and error routes
    create/           Local post composer (database posting is a later step)
    forgot-password/  Reset request page and server action
    login/            Username login page and server action
    profile/          Server-rendered member profile with reaction score
    reset-password/   New-password page after the email link
    signup/           Registration page and server action
    globals.css       Tailwind styles and light/dark colour tokens
    layout.tsx        Root layout, metadata, fonts and theme bootstrap
    page.tsx          Home page, forum shell and Supabase status banner
  components/         Header, auth shell, Turnstile widget, markdown tools
  lib/
    auth/             Auth errors, redirects, Turnstile, validation
    supabase/
      admin.ts        Service-role client (server only)
      client.ts       Supabase client for Client Components
      config.ts       Reads and validates the public env vars
      proxy.ts        Refreshes the session on every request
      server.ts       Cookie-aware Supabase client for the server
      status.ts       Small read-only connection check for the home page
      types.ts        Generated database types
  proxy.ts            Next.js 16 proxy entry point
supabase/
  migrations/         SQL schema, RLS, username login, scores and replies
  README.md           How to apply the schema and configure Auth URLs
```

## Troubleshooting the connection card

- **Setup needed** — `.env.local` does not exist or one of the two variables
  is empty. Copy `.env.example` again and restart `npm run dev`.
- **Supabase rejected the public key** — you copied the wrong key (for
  example a `service_role` secret) or added extra whitespace.
- **Supabase returned HTTP 404** — the project URL is wrong. Use the base
  project URL, not a URL ending in `/rest/v1`.
- **Could not reach Supabase** — check your internet connection and that the
  Supabase project is not paused.
- The check calls Supabase's read-only `/auth/v1/settings` endpoint. It does
  not query the application tables, so it still succeeds before the database
  migration is applied.

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
