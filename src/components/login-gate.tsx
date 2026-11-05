import Link from "next/link";

export function LoginGate({
  next,
  title,
  description,
}: {
  next: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mt-6 rounded-lg border border-line bg-surface p-5 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-muted">{description}</p>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link
          className="rounded-full bg-orange-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-800"
          href={`/login?next=${encodeURIComponent(next)}`}
        >
          Log in
        </Link>
        <Link
          className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-ink"
          href="/signup"
        >
          Create an account
        </Link>
      </div>
    </div>
  );
}
