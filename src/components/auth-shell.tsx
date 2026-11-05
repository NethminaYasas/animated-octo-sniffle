import Link from "next/link";
import type { ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <div className="mx-auto w-full max-w-md flex-1 px-3 py-8 sm:px-4 sm:py-12">
        <div className="rounded-xl border border-line bg-surface p-5 shadow-sm sm:p-6">
          <div className="mb-5">
            <h1 className="text-xl font-bold tracking-tight text-ink">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 text-sm text-muted">{subtitle}</p>
            ) : null}
          </div>

          {children}
        </div>

        <div className="mt-4 text-center text-xs text-faint">
          {footer ?? (
            <Link className="hover:text-ink hover:underline" href="/">
              Back to the forum
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
