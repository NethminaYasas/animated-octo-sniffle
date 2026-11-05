"use client";

import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-3 sm:px-4">
        <Link aria-label="kaluwo home" className="flex shrink-0 items-center gap-2" href="/">
          <span className="grid size-8 place-items-center rounded-full bg-orange-700 text-sm font-bold text-white">
            k
          </span>
          <span className="text-xl font-bold tracking-tight text-ink">kaluwo</span>
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}