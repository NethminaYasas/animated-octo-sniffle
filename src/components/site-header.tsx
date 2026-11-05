"use client";

import Link from "next/link";
import { Search, LogIn, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  const handleAuthClick = (action: "login" | "signup") => {
    toast.info(`${action === "login" ? "Log in" : "Sign up"} functionality`, {
      description: "Coming in the auth step!",
    });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-3 sm:px-4">
        <Link
          aria-label="kaluwo home"
          className="flex shrink-0 items-center gap-2"
          href="/"
        >
          <span className="grid size-8 place-items-center rounded-full bg-orange-700 text-sm font-bold text-white">
            k
          </span>
          <span className="text-xl font-bold tracking-tight text-ink">
            kaluwo
          </span>
        </Link>

        <div className="ml-auto hidden min-w-0 flex-1 justify-center px-4 md:flex">
          <div className="flex h-9 w-full max-w-lg items-center gap-2 rounded-full border border-line bg-surface-muted px-3 text-sm text-muted">
            <Search className="size-4 shrink-0" />
            <span className="truncate">Search kaluwo</span>
            <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-faint">
              Soon
            </span>
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <button
            className="hidden sm:flex items-center gap-1.5 rounded-full border border-orange-700 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50 dark:border-orange-500 dark:text-orange-400 dark:hover:bg-orange-950/30"
            title="Login arrives in the auth step"
            type="button"
            onClick={() => handleAuthClick("login")}
          >
            <LogIn className="size-3.5" />
            Log in
          </button>
          <button
            className="flex items-center gap-1.5 rounded-full bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-800"
            title="Registration arrives in the auth step"
            type="button"
            onClick={() => handleAuthClick("signup")}
          >
            <UserPlus className="size-3.5" />
            Sign up
          </button>
        </div>
      </div>
    </header>
  );
}