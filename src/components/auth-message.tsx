import type { ReactNode } from "react";

type Tone = "error" | "success" | "notice";

const styles: Record<Tone, string> = {
  error:
    "border-red-200 bg-red-50 text-red-900 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-200",
  notice:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200",
};

export function AuthMessage({
  tone = "error",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${styles[tone]}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
