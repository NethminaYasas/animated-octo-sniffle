import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";

import { checkSupabaseConnection } from "@/lib/supabase/status";

type StatusTone = "neutral" | "success" | "warning" | "error";

const toneStyles: Record<
  StatusTone,
  { badge: string; dot: string }
> = {
  neutral: {
    badge: "border-white/10 bg-white/5 text-zinc-400",
    dot: "bg-zinc-500",
  },
  success: {
    badge: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    dot: "bg-emerald-400",
  },
  warning: {
    badge: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    dot: "bg-amber-400",
  },
  error: {
    badge: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    dot: "bg-rose-400",
  },
};

function StatusCard({
  tone,
  title,
  detail,
}: {
  tone: StatusTone;
  title: string;
  detail: ReactNode;
}) {
  const styles = toneStyles[tone];

  return (
    <aside className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">
          Supabase
        </span>
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${styles.badge}`}
        >
          <span className={`size-1.5 rounded-full ${styles.dot}`} />
          {title}
        </span>
      </div>
      <p className="mt-5 text-sm leading-6 text-zinc-400">{detail}</p>
    </aside>
  );
}

async function SupabaseStatus() {
  // Read the environment and check Supabase at request time, not at build time.
  await connection();
  const result = await checkSupabaseConnection();

  if (result.state === "connected") {
    return (
      <StatusCard
        tone="success"
        title="Connected"
        detail={
          <>
            Your app reached the Supabase project configured in{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-zinc-200">
              .env.local
            </code>
            .
          </>
        }
      />
    );
  }

  if (result.state === "unconfigured") {
    return (
      <StatusCard
        tone="warning"
        title="Setup needed"
        detail={
          <>
            Supabase is not configured yet. Add{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-zinc-200">
              NEXT_PUBLIC_SUPABASE_URL
            </code>{" "}
            and{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-zinc-200">
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </code>{" "}
            to <code className="text-zinc-200">.env.local</code>, then restart
            the dev server. The README has the full steps.
          </>
        }
      />
    );
  }

  return (
    <StatusCard
      tone="error"
      title="Connection error"
      detail={
        <>
          {result.message} See the troubleshooting section in{" "}
          <code className="text-zinc-200">README.md</code>.
        </>
      }
    />
  );
}

function LanguageCard({
  language,
  script,
  sample,
  lang,
  fontClass,
}: {
  language: string;
  script: string;
  sample: string;
  lang: string;
  fontClass: string;
}) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-zinc-300">{language}</h3>
        <span className="text-xs text-zinc-600">{script}</span>
      </div>
      <p
        lang={lang}
        className={`mt-6 text-xl leading-9 text-zinc-100 ${fontClass}`}
      >
        {sample}
      </p>
    </article>
  );
}

export default function Home() {
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.14),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(190,60,60,0.12),transparent_45%)]"
      />

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8 sm:px-10 lg:py-12">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-amber-400 text-lg font-bold text-zinc-950">
              ක
            </span>
            <span className="text-xl font-semibold tracking-tight">kaluwo</span>
          </div>
          <p className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-zinc-400">
            Sri Lankan discussion forum
          </p>
        </header>

        <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.3fr_0.7fr] lg:py-24">
          <div>
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.3em] text-amber-300">
              Coming soon
            </p>
            <h1 className="max-w-2xl text-5xl font-semibold tracking-tight text-balance sm:text-7xl">
              Sri Lanka&apos;s{" "}
              <span className="text-amber-300">conversation</span> space.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-pretty text-zinc-400">
              A classic forum for boards, threads and good conversation — in
              Sinhala, Tamil and English. The foundation is up; the community
              comes next.
            </p>
            <p className="mt-3 text-sm text-zinc-500">
              Tagline placeholder — we&apos;ll write the real one with the
              community.
            </p>
          </div>

          <Suspense
            fallback={
              <StatusCard
                tone="neutral"
                title="Checking…"
                detail="Trying to reach Supabase."
              />
            }
          >
            <SupabaseStatus />
          </Suspense>
        </section>

        <section className="border-t border-white/10 py-12">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">
              Three languages. One community.
            </h2>
            <p className="text-sm text-zinc-500">
              UTF-8 everywhere, with fonts loaded for Sinhala and Tamil.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <LanguageCard
              language="Sinhala"
              script="සිංහල"
              sample="ආයුබෝවන්! මෙය සිංහල පෙළක්."
              lang="si"
              fontClass="font-sinhala"
            />
            <LanguageCard
              language="Tamil"
              script="தமிழ்"
              sample="வணக்கம்! இது ஒரு தமிழ் உரை."
              lang="ta"
              fontClass="font-tamil"
            />
            <LanguageCard
              language="English"
              script="English"
              sample="Hello! This is an English sample."
              lang="en"
              fontClass=""
            />
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 py-6 text-xs text-zinc-600">
          <p>Built with Next.js and Supabase.</p>
          <p>Step 1 — project foundation</p>
        </footer>
      </div>
    </main>
  );
}
