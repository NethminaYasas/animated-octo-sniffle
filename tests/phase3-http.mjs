/**
 * Phase 3 upload-route integration tests.
 *
 * Starts a fake catbox server (no network to the real service) and the real
 * Next.js server, then exercises POST /api/uploads with real signed-in users.
 * Requires `npm run build` to have been run and the local Supabase stack to
 * be up. Uses only local resources; nothing leaves the machine.
 */

import assert from "node:assert/strict";
import { execFileSync, execSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import http from "node:http";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbContainer =
  process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_animated-octo-sniffle";
const appPort = Number(process.env.APP_PORT ?? 3111);
const fakeCatboxPort = Number(process.env.FAKE_CATBOX_PORT ?? 3199);
const appBase = `http://127.0.0.1:${appPort}`;
const localEnv = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  CATBOX_API_ENDPOINT: `http://127.0.0.1:${fakeCatboxPort}/user/api.php`,
};

if (!anonKey || !serviceRoleKey) {
  console.error(
    "Set SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (values from `npx supabase start`).",
  );
  process.exit(2);
}

const marker = `phase3http-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const password = "Test-password-123!";
const adminClient = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const createdUserIds = [];
let savedAuthTrigger = null;

function pass(label) {
  console.log(`PASS  ${label}`);
}

function runSql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function relaxAuthTrigger() {
  savedAuthTrigger = runSql(
    "select pg_get_functiondef('public.handle_new_user()'::regprocedure);",
  );

  if (!savedAuthTrigger) {
    throw new Error("Could not read the live handle_new_user() definition");
  }

  runSql(`
    create or replace function public.handle_new_user()
    returns trigger
    language plpgsql
    security definer
    set search_path = public, pg_temp
    as $$
    begin
      return new;
    end;
    $$;
  `);
}

function restoreAuthTrigger() {
  if (!savedAuthTrigger) {
    throw new Error("The live handle_new_user() definition was not saved");
  }

  runSql(savedAuthTrigger);
}

async function createUser(key, role, isBanned = false) {
  const email = `${key}-${marker}@example.test`;
  const username = `${key}${marker.replace(/[^a-z0-9]/g, "").slice(-10)}`;

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { kaluwo_invite: true },
    user_metadata: { username },
  });

  assert.ifError(error);
  const id = data.user.id;
  createdUserIds.push(id);

  const { error: profileError } = await adminClient.from("profiles").upsert({
    id,
    username,
    role,
    is_banned: isBanned,
    banned_until: null,
    onboarding_completed: true,
  });
  assert.ifError(profileError);

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error: signInError } =
    await client.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);

  return { id, email, username, client, accessToken: session.session.access_token };
}

function multipartBody(bytes, fileName, mimeType) {
  const boundary = `----kaluwotest${randomBytes(8).toString("hex")}`;
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);

  return {
    body: Buffer.concat([prefix, bytes, suffix]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function signIn(user) {
  const { data, error } = await user.client.auth.signInWithPassword({
    email: user.email,
    password,
  });
  assert.ifError(error);
  return data.session.access_token;
}

async function upload({ token, body, contentType, origin }) {
  const headers = {
    "content-type": contentType ?? "multipart/form-data",
    "content-length": String(body.length),
  };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  if (origin) {
    headers.origin = origin;
  }

  const response = await fetch(`${appBase}/api/uploads`, {
    method: "POST",
    headers,
    body,
  });
  const json = await response.json().catch(() => null);

  return { status: response.status, json };
}

const uploadedFileBytes = [];
const uploadedFileNames = [];

/** Crude but strict multipart parser for the fake provider capture. */
function captureMultipart(raw, contentType) {
  const boundary = contentType.match(/boundary=([^\s;]+)/)?.[1];

  if (!boundary) {
    return null;
  }

  const full = raw.toString("latin1");
  const nameMatch = full.match(/filename="([^"]*)"/);
  uploadedFileNames.push(nameMatch?.[1] ?? "");

  if (!nameMatch) {
    return null;
  }

  const nameIndex = full.indexOf(nameMatch[0]);
  const headerEnd = full.indexOf("\r\n\r\n", nameIndex);

  if (headerEnd < 0) {
    return null;
  }

  const dataStart = headerEnd + 4;
  const end = full.lastIndexOf(`\r\n--${boundary}--`);

  if (end < dataStart) {
    return null;
  }

  const fileBytes = Buffer.from(full.slice(dataStart, end), "latin1");
  uploadedFileBytes.push(fileBytes);
  return fileBytes;
}

const fakeCatbox = http.createServer((req, res) => {
  const contentType = String(req.headers["content-type"] ?? "");

  if (!contentType.includes("multipart/form-data")) {
    res.statusCode = 400;
    res.end("bad request");
    return;
  }

  const chunks = [];

  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    const captured = captureMultipart(raw, contentType);

    if (!captured) {
      console.warn("fake catbox: could not parse multipart", raw.length);
      res.statusCode = 400;
      res.end("could not parse multipart");
      return;
    }

    res.setHeader("content-type", "text/plain");
    res.end(`https://files.catbox.moe/${marker}catbox.png`);
  });
});

let serverProcess = null;
let serverLog = "";

async function startAppServer() {
  return await new Promise((resolve, reject) => {
    serverProcess = spawn(
      process.execPath,
      [join("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(appPort)],
      {
        cwd: process.cwd(),
        env: localEnv,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      },
    );

    let buffer = "";
    let settled = false;

    const onData = (chunk) => {
      serverLog += chunk.toString();
      buffer += chunk.toString();

      if (!settled && /(ready|started|listen|Local:)/i.test(buffer)) {
        settled = true;
        resolve();
      }
    };

    serverProcess.stdout.on("data", onData);
    serverProcess.stderr.on("data", onData);
    serverProcess.on("error", (error) => {
      settled = true;
      reject(error);
    });
    serverProcess.on("exit", (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`next start exited early with code ${code}: ${buffer}`));
      }
    });

    // Fallback: considered ready once the HTTP port answers.
    const poll = async () => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
          const response = await fetch(appBase, { signal: AbortSignal.timeout(1500) });

          if (response.ok || response.status === 404 || response.status === 405) {
            if (!settled) {
              settled = true;
              resolve();
            }

            return;
          }
        } catch {
          // Not up yet.
        }

        await new Promise((r) => setTimeout(r, 500));
      }
    };

    void poll();
  });
}

async function main() {
  // NEXT_PUBLIC_* values are inlined at build time, so the production build
  // in .next points at .env.local (a production project). Rebuild with the
  // local stack so the suite runs against local Supabase; the build overwrites
  // .next (which .env.local deployments rebuild anyway).
  console.log("Rebuilding with the local Supabase env for the integration suite…");
  execSync("npm run build", { stdio: "inherit", env: localEnv });

  await once(fakeCatbox.listen(fakeCatboxPort), "listening");
  pass("fake catbox is listening (no external requests will be made)");

  await startAppServer();
  pass(`next server is listening on ${appBase}`);

  relaxAuthTrigger();

  let member;
  let banned;
  let moderator;

  try {
    member = await createUser("p3hm", "member");
    banned = await createUser("p3hb", "member", true);
    moderator = await createUser("p3hq", "moderator");
  } finally {
    restoreAuthTrigger();
  }

  const memberToken = await signIn(member);
  const bannedToken = await signIn(banned);
  pass("created signed-in users");

  // Reset rate-limit buckets and quotas for deterministic tests.
  runSql(`delete from kaluwo_private.rate_limit_buckets where user_id in ('${member.id}', '${banned.id}', '${moderator.id}');`);
  runSql(`delete from kaluwo_private.upload_quotas where user_id in ('${member.id}', '${banned.id}', '${moderator.id}');`);

  // A valid 1x1 red PNG.
  const pngBytes = await sharp({
    create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();

  // -------------------------------------------------------------------------
  // Auth and origin enforcement
  // -------------------------------------------------------------------------
  const anonymous = await upload({
    body: pngBytes,
    contentType: "multipart/form-data; boundary=x",
  });
  assert.equal(anonymous.status, 401);
  pass("anonymous upload is rejected");

  const bannedUpload = await upload({
    token: bannedToken,
    body: pngBytes,
    contentType: "multipart/form-data; boundary=x",
  });
  assert.equal(bannedUpload.status, 403);
  pass("banned member cannot upload");

  // Cookie-path origin mismatch would 403; the bearer path ignores Origin.
  const originBody = multipartBody(pngBytes, "origin.png", "image/png");
  const wrongOrigin = await upload({
    token: memberToken,
    body: originBody.body,
    contentType: originBody.contentType,
    origin: "https://evil.example.com",
  });
  // The bearer transport is allowed to carry any Origin (no cookies involved).
  assert(
    [200, 413, 415, 429, 502].includes(wrongOrigin.status),
    `unexpected status ${wrongOrigin.status}: ${JSON.stringify(wrongOrigin.json)}`,
  );
  pass("bearer uploads do not depend on the Origin header");

  const notMultipart = await upload({
    token: memberToken,
    body: Buffer.from("raw-bytes"),
    contentType: "application/octet-stream",
  });
  assert.equal(notMultipart.status, 400);
  pass("non-multipart uploads are rejected");

  // -------------------------------------------------------------------------
  // Magic bytes and structure checks
  // -------------------------------------------------------------------------
  const junkBytes = Buffer.from("this-is-not-a-media-file-at-all-0000000000000000");
  const junk = multipartBody(junkBytes, "junk.png", "image/png");
  const junkUpload = await upload({
    token: memberToken,
    body: junk.body,
    contentType: junk.contentType,
  });
  assert.equal(junkUpload.status, 415);
  pass("files without known magic bytes are rejected");

  // An image that exceeds the 10 MB cap is cut off mid-stream.
  const oversized = Buffer.concat([pngBytes, Buffer.alloc(10.5 * 1024 * 1024, 1)]);
  // Force PNG magic at the start and keep the declared type image/png.
  const { body: oversizeBody, contentType: oversizeType } = multipartBody(
    oversized,
    "oversized.png",
    "image/png",
  );
  const oversizeUpload = await upload({
    token: memberToken,
    body: oversizeBody,
    contentType: oversizeType,
  });
  assert.equal(oversizeUpload.status, 413);
  pass("an oversized upload is rejected with 413 before the body completes");

  // -------------------------------------------------------------------------
  // Happy path: EXIF strip, provider capture, DB row, quota
  // -------------------------------------------------------------------------
  // JPEG with a fake GPS EXIF segment carrying a sentinel string.
  const jpegBase = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 30, g: 120, b: 200 } },
  })
    .jpeg()
    .toBuffer();

  const sentinel = Buffer.from("GPS-SENTINEL-PHASE3HTTP-99887766554433221100");
  const exifBody = Buffer.concat([
    Buffer.from("Exif\0\0", "latin1"),
    Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]),
    Buffer.from([0xff, 0xe1, 0x00, 0x10, 0x47, 0x50, 0x53, 0x47, 0x4d, 0x41, 0x49, 0x4e]),
    sentinel,
  ]);
  const app1Length = exifBody.length + 2;
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1, (app1Length >> 8) & 0xff, app1Length & 0xff]),
    exifBody,
  ]);
  const gpsJpeg = Buffer.concat([jpegBase.subarray(0, 2), app1, jpegBase.subarray(2)]);
  assert(gpsJpeg.includes(sentinel));

  const { body: gpsBody, contentType: gpsType } = multipartBody(
    gpsJpeg,
    "gps.jpg",
    "image/jpeg",
  );
  const gpsUpload = await upload({
    token: memberToken,
    body: gpsBody,
    contentType: gpsType,
  });
  assert.equal(
    gpsUpload.status,
    200,
    `unexpected ${gpsUpload.status}: ${JSON.stringify(gpsUpload.json)}`,
  );
  assert.equal(gpsUpload.json?.ok, true);
  pass("image with EXIF GPS uploads successfully");

  const captured = uploadedFileBytes[uploadedFileBytes.length - 1];
  assert(captured.length > 0);
  assert(!captured.includes(sentinel), "EXIF GPS sentinel must be stripped");
  pass("EXIF GPS metadata is stripped before the file reaches the provider");

  const uploadId = gpsUpload.json?.upload?.id;
  assert(uploadId);

  const { data: uploadRow } = await adminClient
    .from("uploads")
    .select("id, status, size_bytes, raw_sha256, sha256, mime_type")
    .eq("id", uploadId)
    .single();
  assert(uploadRow);
  assert.equal(uploadRow.status, "active");
  assert.notEqual(uploadRow.raw_sha256, uploadRow.sha256);
  pass("upload row is recorded with distinct raw and stripped hashes");

  const rawSha = createHash("sha256").update(gpsJpeg).digest("hex");
  assert.equal(uploadRow.raw_sha256, rawSha);

  // -------------------------------------------------------------------------
  // Quota and rate limit enforcement
  // -------------------------------------------------------------------------
  runSql(`update kaluwo_private.upload_quotas set bytes = 1073741824 where user_id = '${member.id}' and day = current_date;`);
  const quotaFile = multipartBody(pngBytes, "quota.png", "image/png");
  const quotaUpload = await upload({
    token: memberToken,
    body: quotaFile.body,
    contentType: quotaFile.contentType,
  });
  assert.equal(quotaUpload.status, 429);
  pass("daily byte quota is enforced on the upload route");

  // -------------------------------------------------------------------------
  // Hash blocklist enforcement on the route
  // -------------------------------------------------------------------------
  // The raw hash of gpsJpeg is known; block it and re-upload.
  runSql(`insert into public.upload_hash_blocks (sha256, reason, blocked_by) values ('${rawSha}', 'phase3http blocklist test', '${moderator.id}') on conflict do nothing;`);
  const blockedFile = multipartBody(gpsJpeg, "blocked.jpg", "image/jpeg");
  const blockedUpload = await upload({
    token: memberToken,
    body: blockedFile.body,
    contentType: blockedFile.contentType,
  });
  assert.equal(blockedUpload.status, 403);
  pass("a file matching the hash blocklist is rejected");
  runSql(`delete from public.upload_hash_blocks where sha256 = '${rawSha}';`);

  // -------------------------------------------------------------------------
  // Moderator removal hides the upload from members
  // -------------------------------------------------------------------------
  runSql(`delete from kaluwo_private.upload_quotas where user_id = '${member.id}';`);
  const removalFile = multipartBody(pngBytes, "gone.png", "image/png");
  const removalUpload = await upload({
    token: memberToken,
    body: removalFile.body,
    contentType: removalFile.contentType,
  });
  assert.equal(removalUpload.status, 200);
  const removalId = removalUpload.json?.upload?.id;
  assert(removalId);

  const { data: removeResult, error: removeError } = await moderator.client.rpc(
    "moderate_remove_upload",
    { p_upload_id: removalId, p_reason: "phase3http removal test" },
  );
  assert.ifError(removeError);
  assert.equal(removeResult[0].changed, true);

  const { data: removedRow } = await adminClient
    .from("uploads")
    .select("status, removal_reason")
    .eq("id", removalId)
    .single();
  assert.equal(removedRow.status, "removed");
  assert.equal(removedRow.removal_reason, "phase3http removal test");
  pass("staff removal hides the upload from members");

  // -------------------------------------------------------------------------
  // CSP report-only header, CSP report endpoint, method handling
  // -------------------------------------------------------------------------
  const pageResponse = await fetch(appBase, {
    headers: { "user-agent": "phase3http-test" },
  });
  const csp = pageResponse.headers.get("content-security-policy-report-only") ?? "";
  assert(csp.includes("files.catbox.moe"), "CSP must allow the upload host");
  assert(csp.includes("challenges.cloudflare.com"), "CSP must allow Turnstile");
  assert(!pageResponse.headers.get("content-security-policy"), "CSP must not be enforcing yet");
  pass("CSP report-only header is served with the expected sources");

  const cspReport = await fetch(`${appBase}/api/csp-reports`, {
    method: "POST",
    headers: { "content-type": "application/csp-report" },
    body: JSON.stringify({ "csp-report": { "violated-directive": "img-src" } }),
  });
  assert.equal(cspReport.status, 204);
  pass("CSP report endpoint accepts reports");

  const getUploads = await fetch(`${appBase}/api/uploads`);
  assert.equal(getUploads.status, 405);
  pass("GET /api/uploads returns 405");

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------
  await adminClient
    .from("uploads")
    .delete()
    .like("provider_file_id", `%${marker}%`);
  await adminClient.from("uploads").delete().eq("uploader_id", member.id);
  await adminClient.from("uploads").delete().eq("uploader_id", banned.id);
  await adminClient.from("uploads").delete().eq("uploader_id", moderator.id);
  runSql(`delete from kaluwo_private.rate_limit_buckets where user_id in ('${member.id}', '${banned.id}', '${moderator.id}');`);
  runSql(`delete from kaluwo_private.upload_quotas where user_id in ('${member.id}', '${banned.id}', '${moderator.id}');`);

  for (const id of createdUserIds) {
    await adminClient.auth.admin.deleteUser(id);
  }

  pass("cleanup complete");
}

main()
  .catch((error) => {
    console.error("FAIL ", error);
    if (serverLog) {
      console.error("---- next server log ----\n" + serverLog);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
    }

    await new Promise((resolve) => fakeCatbox.close(resolve));
  });
