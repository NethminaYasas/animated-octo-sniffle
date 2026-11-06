/**
 * Cleanup for uploads that were never attached to a post.
 *
 * Usage:
 *   node scripts/cleanup-uploads.mjs
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in the
 * environment (or .env.local). Marks active uploads older than 24h with no
 * post_uploads row as removed (a 'system' mod-log row is recorded by the
 * expire_unlinked_uploads RPC), then attempts a best-effort delete at the
 * provider when CATBOX_USERHASH is configured.
 *
 * Run it daily via cron or Task Scheduler, e.g.:
 *   17 3 * * * cd /opt/kaluwo && node scripts/cleanup-uploads.mjs >> /var/log/kaluwo-cleanup.log 2>&1
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(file) {
  if (!existsSync(file)) {
    return;
  }

  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const eq = line.indexOf("=");

    if (eq < 0) {
      continue;
    }

    const key = line.slice(0, eq).trim();
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const catboxUserhash = process.env.CATBOX_USERHASH?.trim();
const catboxEndpoint =
  process.env.CATBOX_API_ENDPOINT ?? "https://catbox.moe/user/api.php";

if (!url || !serviceRoleKey) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.",
  );
  process.exit(2);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});


const { data: expiredRows, error: expireError } = await admin.rpc(
  "expire_unlinked_uploads",
);

if (expireError) {
  console.error("expire_unlinked_uploads failed:", expireError.message);
  process.exit(1);
}

const expired = Array.isArray(expiredRows) ? expiredRows : [];
console.log(`expire_unlinked_uploads removed ${expired.length} row(s)`);

if (!catboxUserhash) {
  console.log(
    "CATBOX_USERHASH is not set; skipped provider deletion for expired uploads.",
  );
  process.exit(0);
}

// Delete only the files the RPC actually expired: a separate pre-query could
// race with a new link and delete a live attachment.
const candidateFileIds = expired
  .map((row) => row.provider_file_id)
  .filter(Boolean);

for (const providerFileId of candidateFileIds) {
  try {
    const response = await fetch(catboxEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        reqtype: "deletefiles",
        userhash: catboxUserhash,
        files: providerFileId,
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });

    console.log(`delete ${providerFileId}: HTTP ${response.status}`);
  } catch (error) {
    console.error(
      `delete ${providerFileId} failed:`,
      error instanceof Error ? error.message : "unknown",
    );
  }
}
