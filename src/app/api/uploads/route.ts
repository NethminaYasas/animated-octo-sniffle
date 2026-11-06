import { NextResponse } from "next/server";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { Readable, Writable } from "node:stream";
import busboy from "busboy";

import { recordSecurityEvent } from "@/lib/audit/security-events";
import { getServerSession } from "@/lib/auth/server-user";
import { getBearerUser } from "@/lib/auth/bearer";
import {
  MEDIA_MAX_IMAGE_BYTES,
  MEDIA_MAX_REQUEST_BYTES,
  detectMedia,
  limitForMime,
  passesStructureCheck,
  readHeader,
  sha256File,
  stripImageMetadata,
  ImageProcessingError,
  type DetectedMedia,
} from "@/lib/media/pipeline";
import { getUploadProvider, UploadProviderError } from "@/lib/media/provider";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_IN_FLIGHT_PER_USER = 2;
const MAX_IN_FLIGHT_TOTAL = 10;

// Best-effort per-process concurrency guards. Multiple instances each get
// their own counter; the daily quota in the database is the real ceiling.
const inFlightPerUser = new Map<string, number>();
let inFlightTotal = 0;

function acquireSlot(userId: string): boolean {
  if (inFlightTotal >= MAX_IN_FLIGHT_TOTAL) {
    return false;
  }

  const current = inFlightPerUser.get(userId) ?? 0;

  if (current >= MAX_IN_FLIGHT_PER_USER) {
    return false;
  }

  inFlightPerUser.set(userId, current + 1);
  inFlightTotal += 1;
  return true;
}

function releaseSlot(userId: string) {
  const current = inFlightPerUser.get(userId) ?? 0;

  if (current <= 1) {
    inFlightPerUser.delete(userId);
  } else {
    inFlightPerUser.set(userId, current - 1);
  }

  inFlightTotal = Math.max(0, inFlightTotal - 1);
}

function fail(
  status: number,
  message: string,
  extra?: Record<string, unknown>,
) {
  const { closeConnection, ...body } = extra ?? {};

  return NextResponse.json(
    { ok: false, error: message, ...body },
    {
      status,
      headers: closeConnection ? { connection: "close" } : undefined,
    },
  );
}

type TmpStreamResult = {
  filePath: string;
  size: number;
  truncated: boolean;
};

/**
 * Streams the multipart file part directly to a temp file on disk while
 * counting bytes. As soon as the first chunk arrives the media type is
 * detected from its magic bytes and the per-type cap is enforced mid-stream,
 * so an oversized file is cut off before it is fully written.
 */
async function streamToTmpFile(
  fileStream: NodeJS.ReadableStream,
  globalMaxBytes: number,
): Promise<TmpStreamResult> {
  const filePath = path.join(tmpdir(), `kaluwo-upload-${randomUUID()}`);

  return await new Promise((resolve, reject) => {
    let size = 0;
    let truncated = false;
    let perTypeCap = globalMaxBytes;
    const fileStreamOut = createWriteStream(filePath);

    // Stop writing to disk but keep draining the request body. The proxy
    // buffers the body anyway, and leaving it unread corrupts the next request
    // on a keep-alive connection.
    const stopWriting = () => {
      if (truncated) {
        return;
      }

      truncated = true;
      fileStream.removeListener("data", onData);
      fileStreamOut.destroy();
      void unlink(filePath).catch(() => undefined);
      fileStream.resume();
    };

    const onData = (chunk: Buffer) => {
      if (size === 0) {
        const detected = detectMedia(chunk.subarray(0, 512));

        if (detected) {
          perTypeCap = Math.min(perTypeCap, limitForMime(detected.mime));
        }
      }

      size += chunk.length;

      if (size > perTypeCap || size > globalMaxBytes) {
        stopWriting();
        return;
      }

      fileStreamOut.write(chunk);
    };

    fileStream.on("data", onData);
    fileStream.on("error", (error) => reject(error));
    fileStreamOut.on("error", (error) => reject(error));

    fileStream.on("end", () => {
      if (truncated) {
        resolve({ filePath: "", size, truncated: true });
        return;
      }

      fileStreamOut.end(() => {
        resolve({ filePath, size, truncated: false });
      });
    });
  });
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");

  const isBearer = authorization?.startsWith("Bearer ") ?? false;

  let user: {
    id: string;
    role: string;
    isBanned: boolean;
  } | null = null;

  if (isBearer) {
    const bearer = await getBearerUser(authorization);

    if (bearer) {
      user = bearer;
    }
  } else {
    const { user: sessionUser } = await getServerSession();

    if (sessionUser) {
      // CSRF: cookie-authenticated posts must come from our own origin. The
      // bearer path carries no cookies, so it needs no Origin check.
      const origin = request.headers.get("origin");
      const expectedHost = new URL(request.url).host;

      if (!origin) {
        return fail(403, "This upload must come from the kaluwo site.");
      }

      try {
        if (new URL(origin).host !== expectedHost) {
          return fail(403, "This upload must come from the kaluwo site.");
        }
      } catch {
        return fail(403, "This upload must come from the kaluwo site.");
      }

      user = sessionUser;
    }
  }

  if (!user) {
    return fail(401, "Log in to upload files.");
  }

  if (user.isBanned) {
    return fail(403, "Banned members cannot upload files.");
  }

  // Per-user concurrency guard (see comment at the module level).
  if (!acquireSlot(user.id)) {
    return fail(429, "You already have uploads in progress. Try again shortly.");
  }

  let tmpPath: string | null = null;
  let strippedTmpPath: string | null = null;

  try {
    // Content-Length: reject before reading the body when it is too large.
    const contentLengthHeader = request.headers.get("content-length");

    if (contentLengthHeader) {
      const declared = Number(contentLengthHeader);

      if (Number.isFinite(declared) && declared > MEDIA_MAX_REQUEST_BYTES) {
        await recordSecurityEvent({
          event: "upload.rate_limited",
          userId: user.id,
          metadata: { kind: "content_length", declared },
        });

        // The body was never read; close so the client cannot reuse a
        // connection carrying an unconsumed request body.
        return fail(413, "That file is too large.", { closeConnection: true });
      }
    }

    const contentType = request.headers.get("content-type") ?? "";

    if (!contentType.includes("multipart/form-data")) {
      return fail(400, "Upload a multipart/form-data file.");
    }

    const headers: Record<string, string> = {};

    for (const [key, value] of request.headers.entries()) {
      headers[key] = value;
    }

    const busboyParser = busboy({
      headers,
      limits: {
        fileSize: MEDIA_MAX_REQUEST_BYTES,
        files: 1,
        fields: 0,
      },
    });

    // Collect the file part.
    const filePromise = new Promise<{
      filePath: string;
      size: number;
      truncated: boolean;
      fileName: string;
    }>((resolve, reject) => {
      let done = false;

      busboyParser.on("file", (fieldName, fileStream, info) => {
        if (fieldName !== "file" || done) {
          fileStream.resume();
          return;
        }

        done = true;
        const fileName = typeof info?.filename === "string" && info.filename
          ? info.filename
          : "upload";

        streamToTmpFile(fileStream, MEDIA_MAX_REQUEST_BYTES)
          .then((result) => resolve({ ...result, fileName }))
          .catch(reject);
      });

      busboyParser.on("error", reject);
      busboyParser.on("close", () => {
        if (!done) {
          reject(new Error("No file was included in the upload."));
        }
      });
    });

    const requestStream = Readable.fromWeb(
      // Next passes a Web ReadableStream on request.body
      request.body as Parameters<typeof Readable.fromWeb>[0],
    );

    requestStream.pipe(busboyParser as unknown as Writable);
    let received: {
      filePath: string;
      size: number;
      truncated: boolean;
      fileName: string;
    };

    try {
      received = await filePromise;
    } catch (error) {
      // Malformed multipart bodies, truncated streams and a missing file are
      // client errors, never a server fault. Provider failures happen later.
      console.warn(
        "upload multipart parse failed:",
        error instanceof Error ? error.message : "unknown",
      );

      return fail(400, "That upload could not be read. Try again.");
    }

    if (received.truncated || received.size > MEDIA_MAX_REQUEST_BYTES) {
      await recordSecurityEvent({
        event: "upload.rate_limited",
        userId: user.id,
        metadata: { kind: "size", declared: received.size },
      });

      return fail(413, "That file is too large.");
    }

    tmpPath = received.filePath;

    const header = await readHeader(tmpPath);
    const detected: DetectedMedia | null = detectMedia(header);

    if (!detected) {
      await recordSecurityEvent({
        event: "upload.provider_failed",
        userId: user.id,
        metadata: { kind: "magic_bytes" },
      });

      return fail(415, "That file type is not allowed.");
    }

    const perMimeLimit = limitForMime(detected.mime);

    if (received.size > perMimeLimit) {
      await recordSecurityEvent({
        event: "upload.rate_limited",
        userId: user.id,
        metadata: { kind: "per_mime", mime: detected.mime, size: received.size },
      });

      return fail(413, "That file is too large.");
    }

    // Structure check (images): read the whole file, verify container ends.
    let processedPath = tmpPath;
    let processedSize = received.size;
    const rawSha = await sha256File(tmpPath);

    if (detected.kind === "image") {
      const { readFile } = await import("node:fs/promises");
      const imageBuffer = await readFile(tmpPath);

      if (!passesStructureCheck(imageBuffer, detected.mime)) {
        await recordSecurityEvent({
          event: "upload.provider_failed",
          userId: user.id,
          metadata: { kind: "structure", mime: detected.mime },
        });

        return fail(400, "The file appears to be truncated or corrupted.");
      }

      let stripped: Buffer;

      try {
        stripped = await stripImageMetadata(
          imageBuffer,
          detected.mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        );
      } catch (error) {
        if (error instanceof ImageProcessingError) {
          return fail(400, error.message);
        }

        return fail(400, "That image could not be processed.");
      }

      processedSize = stripped.length;

      if (processedSize > MEDIA_MAX_IMAGE_BYTES || processedSize === 0) {
        return fail(413, "That image is too large after processing.");
      }

      strippedTmpPath = path.join(
        tmpdir(),
        `kaluwo-stripped-${randomUUID()}.${detected.extension}`,
      );

      await writeFile(strippedTmpPath, stripped);
      processedPath = strippedTmpPath;
    }

    const strippedSha = await sha256File(processedPath);

    // Blocklist: raw hash first (prevents re-encoding bypasses of known-bad
    // files), then the stripped hash.
    const admin = createAdminClient();

    if (!admin) {
      return fail(500, "Upload is not configured on this server.");
    }

    const { data: blocked, error: blockedError } = await admin
      .from("upload_hash_blocks")
      .select("sha256")
      .in("sha256", [rawSha, strippedSha]);

    if (blockedError) {
      // Fail closed: a broken blocklist lookup must never let a blocked file
      // through.
      console.error("hash blocklist lookup failed:", blockedError.message);
      return fail(500, "Upload failed. Try again.");
    }

    if (blocked && blocked.length > 0) {
      await recordSecurityEvent({
        event: "upload.blocked_hash",
        userId: user.id,
        metadata: { mime: detected.mime, size: processedSize },
      });

      return fail(
        403,
        "This file isn't allowed. If you believe this is a mistake, contact the moderators.",
      );
    }

    // Daily quota through the service role (banned/limit checks inside too).
    const { error: quotaError } = await admin.rpc("consume_upload_quota", {
      p_user_id: user.id,
      p_bytes: processedSize,
    });

    if (quotaError) {
      if (quotaError.hint === "kaluwo_rate_limited") {
        const retryAfter = Number(quotaError.details);

        await recordSecurityEvent({
          event: "upload.rate_limited",
          userId: user.id,
          metadata: {
            kind: "quota",
            retry_after_seconds: Number.isFinite(retryAfter) ? retryAfter : null,
          },
        });

        return fail(
          429,
          "You've reached your daily upload limit. Try again later.",
          { retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : null },
        );
      }

      return fail(500, "Could not verify your upload quota.");
    }

    const provider = getUploadProvider();

    let uploaded: { url: string; providerFileId: string };

    try {
      uploaded = await provider.upload({
        filePath: processedPath,
        fileSize: processedSize,
        // Never forward the client filename: derive the extension from the
        // magic-byte detection so a renamed file cannot be served as HTML/SVG.
        fileName: `upload.${detected.extension}`,
        mimeType: detected.mime,
      });
    } catch (error) {
      console.warn(
        "upload provider failed:",
        error instanceof Error ? error.message : "unknown",
      );

      await recordSecurityEvent({
        event: "upload.provider_failed",
        userId: user.id,
        metadata: {
          kind:
            error instanceof UploadProviderError
              ? error.code
              : "provider_failed",
          mime: detected.mime,
        },
      });

      return fail(
        502,
        "The upload service didn't respond. Try again in a few moments.",
      );
    }

    const { data: uploadRow, error: insertError } = await admin
      .from("uploads")
      .insert({
        uploader_id: user.id,
        provider: provider.name,
        provider_file_id: uploaded.providerFileId,
        url: uploaded.url,
        mime_type: detected.mime,
        size_bytes: processedSize,
        raw_sha256: rawSha,
        sha256: strippedSha,
        status: "active",
      })
      .select("id, url, mime_type, size_bytes")
      .single();

    if (insertError || !uploadRow) {
      // Best effort: do not leave an orphaned provider file behind.
      try {
        await provider.delete(uploaded.providerFileId);
      } catch {
        await recordSecurityEvent({
          event: "upload.provider_delete_failed",
          userId: user.id,
          metadata: { providerFileId: uploaded.providerFileId },
        });
      }

      await recordSecurityEvent({
        event: "upload.orphaned",
        userId: user.id,
        metadata: { url: uploaded.url },
      });

      return fail(500, "Could not save the upload. Try again.");
    }

    await recordSecurityEvent({
      event: "upload.accepted",
      userId: user.id,
      metadata: {
        uploadId: uploadRow.id,
        mime: detected.mime,
        size: processedSize,
      },
    });

    return NextResponse.json({
      ok: true,
      upload: {
        id: uploadRow.id,
        url: uploadRow.url,
        mimeType: uploadRow.mime_type,
        sizeBytes: uploadRow.size_bytes,
      },
    });
  } catch (error) {
    console.error(
      "upload route failed:",
      error instanceof Error ? error.message : "unknown",
    );

    return fail(500, "Upload failed. Try again.");
  } finally {
    releaseSlot(user.id);

    for (const candidate of [tmpPath, strippedTmpPath]) {
      if (candidate) {
        await unlink(candidate).catch(() => undefined);
      }
    }
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed." }, { status: 405 });
}
