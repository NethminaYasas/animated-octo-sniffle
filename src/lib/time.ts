/** Anything older than this shows the exact date and time instead of "Nd ago". */
const EXACT_DATE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

export function formatRelativeTime(dateString: string, now: Date): string {
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffMs < EXACT_DATE_AFTER_MS) return `${Math.floor(diffHours / 24)}d ago`;

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
