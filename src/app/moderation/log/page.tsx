import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { Constants, type Database } from "@/lib/supabase/types";

export const instant = false;

type ModAction = Database["public"]["Enums"]["mod_action"];
type ModTarget = Database["public"]["Enums"]["mod_target_type"];

type LogRow = {
  id: number;
  actor_username: string;
  action: ModAction;
  target_type: ModTarget;
  target_id: string;
  target_label: string;
  reason: string;
  previous_value: unknown;
  new_value: unknown;
  created_at: string;
};

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export default async function ModLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actionParam = one(params.action);
  const targetParam = one(params.target);
  const before = Number(one(params.before));
  const action = (Constants.public.Enums.mod_action as readonly string[]).includes(
    actionParam,
  )
    ? (actionParam as ModAction)
    : null;
  const target = (
    Constants.public.Enums.mod_target_type as readonly string[]
  ).includes(targetParam)
    ? (targetParam as ModTarget)
    : null;

  const supabase = await createClient();
  let query = supabase
    .from("mod_log")
    .select(
      "id, actor_username, action, target_type, target_id, target_label, reason, previous_value, new_value, created_at",
    )
    .order("id", { ascending: false })
    .limit(50);

  if (action) {
    query = query.eq("action", action);
  }

  if (target) {
    query = query.eq("target_type", target);
  }

  if (Number.isSafeInteger(before) && before > 0) {
    query = query.lt("id", before);
  }

  const { data, error } = await query;

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
        Could not load the moderation log.
      </div>
    );
  }

  const rows = (data ?? []) as unknown as LogRow[];
  const last = rows[rows.length - 1];
  const nextParams = new URLSearchParams();

  if (action) {
    nextParams.set("action", action);
  }

  if (target) {
    nextParams.set("target", target);
  }

  if (last) {
    nextParams.set("before", String(last.id));
  }

  return (
    <div>
      <form
        method="get"
        className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-3"
      >
        <label className="text-xs font-medium text-muted">
          Action
          <select
            name="action"
            defaultValue={action ?? ""}
            className="mt-1 block rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink"
          >
            <option value="">All actions</option>
            {Constants.public.Enums.mod_action.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-muted">
          Target
          <select
            name="target"
            defaultValue={target ?? ""}
            className="mt-1 block rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink"
          >
            <option value="">All targets</option>
            {Constants.public.Enums.mod_target_type.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="rounded-full bg-orange-700 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-800"
        >
          Filter
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line bg-surface px-4 py-10 text-center text-sm text-muted">
          No moderation actions match these filters.
        </p>
      ) : (
        <ol className="mt-4 space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-line bg-surface p-3 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-ink">
                  {row.action}{" "}
                  <span className="font-normal text-muted">
                    · {row.target_type} {row.target_label || row.target_id}
                  </span>
                </p>
                <p className="text-[11px] text-faint">
                  #{row.id} ·{" "}
                  {new Date(row.created_at).toLocaleString("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <p className="mt-1 text-muted">
                by @{row.actor_username} · {row.reason}
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] font-semibold text-muted">
                  Previous / new values
                </summary>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-muted p-2 text-[10px] leading-5 text-body">
                  {JSON.stringify(
                    {
                      previous: row.previous_value,
                      new: row.new_value,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </li>
          ))}
        </ol>
      )}

      {last ? (
        <div className="mt-4 flex justify-center">
          <Link
            href={`/moderation/log?${nextParams.toString()}`}
            className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold text-muted hover:bg-surface-muted hover:text-ink"
          >
            Older actions
          </Link>
        </div>
      ) : null}
    </div>
  );
}
