import { notFound } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-user";
import { createClient } from "@/lib/supabase/server";

import { CreateInviteForm, RevokeInviteForm } from "./invite-forms";

export const instant = false;

type InviteRow = {
  code_hash: string;
  code_hint: string;
  created_at: string;
  used_at: string | null;
  revoked_at: string | null;
  created_by_username: string | null;
  used_by_username: string | null;
  revoked_by_username: string | null;
  status: "active" | "used" | "revoked";
};

export default async function InvitesPage() {
  const { user } = await getServerSession();

  if (!user || user.role !== "admin") {
    notFound();
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_invite_codes", {
    p_limit: 200,
  });

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
        Could not load invite codes.
      </div>
    );
  }

  const rows = (data ?? []) as unknown as InviteRow[];

  return (
    <div className="space-y-4">
      <CreateInviteForm />

      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Recent invite codes
        </h2>
        {rows.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-muted">
            No invite codes yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {rows.map((row) => (
              <li
                key={row.code_hash}
                className="rounded-xl border border-line bg-surface p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-semibold text-ink">
                      {row.code_hint}…
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      Created{" "}
                      {new Date(row.created_at).toLocaleString("en-GB")}
                      {row.created_by_username
                        ? ` by @${row.created_by_username}`
                        : ""}
                      {row.used_by_username
                        ? ` · used by @${row.used_by_username}`
                        : ""}
                      {row.revoked_by_username
                        ? ` · revoked by @${row.revoked_by_username}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      row.status === "active"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "bg-surface-muted text-muted"
                    }`}
                  >
                    {row.status}
                  </span>
                </div>

                {row.status === "active" ? (
                  <RevokeInviteForm
                    codeHash={row.code_hash}
                    codeHint={row.code_hint}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
