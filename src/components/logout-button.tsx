"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleLogout = async () => {
    setBusy(true);
    setFailed(false);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        setFailed(true);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleLogout}
        disabled={busy}
        title={failed ? "Log out failed. Try again." : "Log out"}
        aria-label="Log out"
        className="grid size-8 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LogOut className="size-4" />
      </button>
    );
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={handleLogout}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LogOut className="size-4" />
        {busy ? "Logging out..." : "Log out"}
      </button>
      {failed ? (
        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
          Could not log out. Try again.
        </p>
      ) : null}
    </div>
  );
}
