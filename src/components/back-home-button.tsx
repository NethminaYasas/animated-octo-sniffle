import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Shared back control for the thread and create-post pages. Returns to the
 * home feed; using a plain link keeps it keyboard- and screen-reader-friendly.
 */
export function BackHomeButton() {
  return (
    <Link
      href="/"
      className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
      aria-label="Back to home"
    >
      <ArrowLeft className="size-4" />
      Back
    </Link>
  );
}