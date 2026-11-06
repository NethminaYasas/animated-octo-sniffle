import { Ban, Trash2, Undo2 } from "lucide-react";

import { getServerSession } from "@/lib/auth/server-user";
import { createClient } from "@/lib/supabase/server";

import { BlockHashForm, UnblockHashForm, UploadRowActions } from "./uploads-forms";

export const instant = false;

type StaffUploadRow = {
  id: string;
  uploader_id: string;
  uploader_username: string | null;
  provider: string;
  provider_file_id: string | null;
  url: string;
  mime_type: string;
  size_bytes: number;
  raw_sha256: string;
  sha256: string;
  status: "active" | "removed";
  removal_reason: string | null;
  removed_at: string | null;
  removed_by_username: string | null;
  created_at: string;
};

type BlockRow = {
  sha256: string;
  reason: string;
  created_at: string;
  blocked_by: { username: string } | null;
};

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default async function ModerationUploadsPage() {
  const { user } = await getServerSession();
  const supabase = await createClient();
  const isAdmin = user?.role === "admin";

  const [{ data: uploads, error: uploadsError }, { data: blocks, error: blocksError }] =
    await Promise.all([
      (await supabase.rpc("staff_uploads")) as {
        data: StaffUploadRow[] | null;
        error: unknown;
      },
      supabase
        .from("upload_hash_blocks")
        .select("sha256, reason, created_at, blocked_by:profiles!upload_hash_blocks_blocked_by_fkey(username)")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

  if (uploadsError || blocksError) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
        Could not load uploads or the hash blocklist.
      </div>
    );
  }

  const rows = ((uploads ?? []) as unknown as StaffUploadRow[]).slice(0, 100);
  const blockedRows = (blocks ?? []) as unknown as BlockRow[];

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Recent uploads
        </h2>
        {rows.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-muted">
            No uploads yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-line bg-surface p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-ink">
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-orange-700 hover:underline dark:text-orange-400"
                      >
                        {row.provider_file_id ?? row.id}
                      </a>
                      <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {row.status}
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] text-muted">
                      by @{row.uploader_username ?? "unknown"} ·{" "}
                      {row.mime_type} · {formatBytes(Number(row.size_bytes))} ·{" "}
                      {new Date(row.created_at).toLocaleString("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                    <p className="mt-1 break-all font-mono text-[10px] text-faint">
                      sha256: {row.sha256}
                    </p>
                    {row.status === "removed" ? (
                      <p className="mt-1 text-[11px] text-muted">
                        Removed
                        {row.removed_by_username
                          ? ` by @${row.removed_by_username}`
                          : ""}
                        {row.removal_reason ? ` · ${row.removal_reason}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <UploadRowActions upload={row} isAdmin={isAdmin} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <Ban className="size-3.5" aria-hidden="true" />
          Blocked hashes
        </h2>
        <p className="mt-1 text-[11px] text-muted">
          The upload route rejects files matching a blocked SHA-256 (raw or
          stripped). Staff block; only admins unblock.
        </p>

        <BlockHashForm />

        {blockedRows.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center text-sm text-muted">
            No blocked hashes.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {blockedRows.map((row) => (
              <li
                key={row.sha256}
                className="rounded-xl border border-line bg-surface p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-[10px] text-ink">
                      {row.sha256}
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-muted">
                      {row.reason}
                      {row.blocked_by?.username
                        ? ` · blocked by @${row.blocked_by.username}`
                        : ""}{" "}
                      ·{" "}
                      {new Date(row.created_at).toLocaleDateString("en-GB", {
                        dateStyle: "medium",
                      })}
                    </p>
                  </div>
                  {isAdmin ? (
                    <UnblockHashForm sha256={row.sha256} />
                  ) : (
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-faint">
                      Admin only
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-4 text-xs leading-5 text-muted">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Trash2 className="size-4" aria-hidden="true" />
          Takedown process
        </h2>
        <ol className="mt-2 list-inside list-decimal space-y-1">
          <li>Remove the attachment above or in the thread (members stop seeing it immediately).</li>
          <li>Removing also attempts a delete at catbox when CATBOX_USERHASH is configured; it is best effort — catbox may keep deduplicated copies.</li>
          <li>Block the SHA-256 to stop re-uploads of the same file.</li>
          <li>For removal requests from catbox itself (DMCA/abuse), contact them directly; the forum cannot delete files catbox hosts.</li>
        </ol>
        <p className="mt-2 flex items-center gap-1">
          <Undo2 className="size-3" aria-hidden="true" />
          Restoring an attachment clears its removal metadata and shows it again.
        </p>
      </section>
    </div>
  );
}
