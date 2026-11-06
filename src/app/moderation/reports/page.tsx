import Link from "next/link";
import { notFound } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-user";
import { excerptFromHtml } from "@/lib/mentions";
import { createClient } from "@/lib/supabase/server";

import { ReportResolutionForm } from "./report-resolution-form";

export const instant = false;

type ReportStatus = "open" | "resolved" | "dismissed";

type ReportRow = {
  id: number;
  target_type: "post" | "user";
  post_id: number | null;
  target_user_id: string | null;
  reason: string;
  status: ReportStatus;
  created_at: string;
  reporter: { username: string } | null;
  post: {
    id: number;
    thread_id: number;
    author_id: string | null;
    content: string;
    is_opening: boolean;
    author: { username: string; role: string } | null;
    thread: { id: number; title: string } | null;
  } | null;
  target_user: { username: string; role: string } | null;
  resolution:
    | {
        report_id: number;
        resolution_note: string;
        mod_log_id: number;
        created_at: string;
      }
    | null;
};

function statusFromParam(value: string | string[] | undefined): ReportStatus {
  return value === "resolved" || value === "dismissed" ? value : "open";
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = statusFromParam(params.status);
  const { user } = await getServerSession();

  if (
    !user ||
    user.isBanned ||
    (user.role !== "moderator" && user.role !== "admin")
  ) {
    notFound();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .select(
      "id, target_type, post_id, target_user_id, reason, status, created_at, reporter:profiles!reports_reporter_id_fkey(username), post:posts!reports_post_id_fkey(id, thread_id, author_id, content, is_opening, author:profiles!posts_author_id_fkey(username, role), thread:threads!posts_thread_id_fkey(id, title)), target_user:profiles!reports_target_user_id_fkey(username, role), resolution:report_resolutions(report_id, resolution_note, mod_log_id, created_at)",
    )
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
        Could not load reports. Try again shortly.
      </div>
    );
  }

  const reports = ((data ?? []) as unknown as ReportRow[]).map((report) => {
    const resolution = Array.isArray(report.resolution)
      ? report.resolution[0] ?? null
      : report.resolution;
    const targetAuthorId =
      report.target_type === "post"
        ? report.post?.author_id ?? null
        : report.target_user_id;
    const targetRole =
      report.target_type === "post"
        ? report.post?.author?.role ?? null
        : report.target_user?.role ?? null;
    const isSelfTarget = targetAuthorId === user.id;
    const adminOnly =
      (targetRole === "moderator" || targetRole === "admin") &&
      user.role !== "admin";

    return {
      ...report,
      resolution,
      targetAuthorId,
      targetRole,
      isSelfTarget,
      canResolve:
        report.status === "open" && !isSelfTarget && !adminOnly,
      blockedReason: isSelfTarget
        ? "You cannot resolve a report about your own content."
        : adminOnly
          ? "Only an admin can resolve reports about staff."
          : null,
    };
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {(["open", "resolved", "dismissed"] as const).map((value) => (
          <Link
            key={value}
            href={`/moderation/reports?status=${value}`}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
              status === value
                ? "bg-orange-700 text-white"
                : "bg-surface-muted text-muted hover:text-ink"
            }`}
          >
            {value}
          </Link>
        ))}
      </div>

      {reports.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line bg-surface px-4 py-10 text-center text-sm text-muted">
          No {status} reports.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {reports.map((report) => {
            const targetHref =
              report.target_type === "post" && report.post?.thread_id
                ? `/t/${report.post.thread_id}#comment-${report.post.id}`
                : report.target_user?.username
                  ? `/profile/${encodeURIComponent(report.target_user.username)}`
                  : null;

            return (
              <li
                key={report.id}
                className="rounded-xl border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Report #{report.id} · {report.target_type === "user" ? "member" : report.post?.is_opening ? "thread" : "comment"}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      {report.target_type === "post"
                        ? report.post?.thread?.title ?? "Post"
                        : `@${report.target_user?.username ?? "unknown"}`}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      Reported by @{report.reporter?.username ?? "deleted member"} ·{" "}
                      {new Date(report.created_at).toLocaleString("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {report.status}
                    </span>
                    {targetHref ? (
                      <Link
                        href={targetHref}
                        className="text-[11px] font-semibold text-orange-700 hover:underline dark:text-orange-400"
                      >
                        Open target
                      </Link>
                    ) : null}
                  </div>
                </div>

                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-muted px-3 py-2 text-sm leading-6 text-body">
                  {report.reason}
                </p>

                {report.target_type === "post" && report.post?.content ? (
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">
                    {excerptFromHtml(report.post.content, 220)}
                  </p>
                ) : null}

                {report.resolution ? (
                  <div className="mt-2 rounded-lg border border-line bg-surface-muted px-3 py-2 text-xs text-muted">
                    <p className="font-semibold text-ink">Resolution</p>
                    <p className="mt-1 whitespace-pre-wrap">
                      {report.resolution.resolution_note}
                    </p>
                    <p className="mt-1 text-[11px]">
                      Mod log #{report.resolution.mod_log_id}
                    </p>
                  </div>
                ) : (
                  <ReportResolutionForm
                    reportId={report.id}
                    canResolve={report.canResolve}
                    blockedReason={report.blockedReason}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
