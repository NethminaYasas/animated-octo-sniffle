"use client";

import { useEffect } from "react";

const THEME_KEY = "theme";

function getStoredTheme() {
  try {
    const theme = window.localStorage.getItem(THEME_KEY);
    return theme === "dark" || theme === "light" ? theme : null;
  } catch {
    return null;
  }
}

export function ThemeToggle() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncWithSystem = (event: MediaQueryListEvent) => {
      if (getStoredTheme()) {
        return;
      }

      document.documentElement.classList.toggle("dark", event.matches);
    };

    media.addEventListener("change", syncWithSystem);
    return () => media.removeEventListener("change", syncWithSystem);
  }, []);

  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle("dark");

    try {
      window.localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
    } catch {
      // The theme still changes when storage is unavailable.
    }
  }

  return (
    <button
      aria-label="Toggle dark mode"
      className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
      onClick={toggleTheme}
      title="Toggle dark mode"
      type="button"
    >
      <MoonIcon className="size-4 dark:hidden" />
      <SunIcon className="hidden size-4 dark:block" />
    </button>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 20 20"
    >
      <path d="M16.5 12.2A6.8 6.8 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7Z" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 20 20"
    >
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M15.7 4.3l-1.4 1.4M5.7 14.3l-1.4 1.4" />
    </svg>
  );
}
