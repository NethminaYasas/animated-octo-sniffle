# kaluwo

kaluwo is a Sri Lankan discussion forum in the style of
[elakiri.com](https://elakiri.com): boards, threads and posts, built for a
community that speaks Sinhala, Tamil and English.

This repository is currently at **step 1: project foundation**. Authentication,
database tables, moderation, uploads and the forum itself are not built yet.

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

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The Supabase status banner
should say **Connected**. If the values are missing you will see **Setup
needed**; if they are wrong you will see a short error explaining what to
check.

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
    globals.css       Global Tailwind styles and font variables
    layout.tsx        Root layout, metadata and Sinhala/Tamil fonts
    page.tsx          Home page, forum shell and Supabase status banner
  lib/
    supabase/
      client.ts       Supabase client for Client Components
      config.ts       Reads and validates the public env vars
      server.ts       Cookie-aware Supabase client for the server
      status.ts       Small read-only connection check for the home page
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
- The check calls Supabase's read-only `/auth/v1/settings` endpoint. The
  application tables do not exist until step 2.

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
