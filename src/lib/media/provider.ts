import "server-only";

import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

export type UploadProviderErrorCode =
  | "provider_failed"
  | "provider_timeout"
  | "provider_rejected";

export class UploadProviderError extends Error {
  readonly code: UploadProviderErrorCode;

  constructor(code: UploadProviderErrorCode, message: string) {
    super(message);
    this.name = "UploadProviderError";
    this.code = code;
  }
}

export type UploadedFile = {
  url: string;
  providerFileId: string;
};

export interface UploadProvider {
  readonly name: string;
  /**
   * Hostname that serves the public file. Used to build the render allowlist
   * and the CSP.
   */
  publicHostname(): string;
  upload(input: {
    filePath: string;
    fileSize: number;
    fileName: string;
    mimeType: string;
  }): Promise<UploadedFile>;
  /**
   * Deletes the file at the provider. Throws UploadProviderError with
   * code "provider_failed" when deletion is not possible for this session.
   */
  delete(providerFileId: string): Promise<void>;
}

const DEFAULT_CATBOX_ENDPOINT = "https://catbox.moe/user/api.php";
const CATBOX_PUBLIC_HOST = "files.catbox.moe";
const UPLOAD_TIMEOUT_MS = 60_000;

function readEndpoint(): string {
  return process.env.CATBOX_API_ENDPOINT ?? DEFAULT_CATBOX_ENDPOINT;
}

function randomBoundary(): string {
  return `----kaluwo-${randomBytes(24).toString("hex")}`;
}

function sanitiseFileName(fileName: string): string {
  const cleaned = fileName
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^[.]+/, "")
    .slice(0, 100);

  return cleaned.length > 0 ? cleaned : "upload";
}

export class CatboxProvider implements UploadProvider {
  readonly name = "catbox";

  publicHostname(): string {
    return CATBOX_PUBLIC_HOST;
  }

  async upload(input: {
    filePath: string;
    fileSize: number;
    fileName: string;
    mimeType: string;
  }): Promise<UploadedFile> {
    // Stream the file from disk so a 50 MB video is never fully in memory.
    const boundary = randomBoundary();

    const userhash = process.env.CATBOX_USERHASH?.trim() || undefined;
    const fileName = sanitiseFileName(input.fileName);

    const prefixParts = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="reqtype"\r\n\r\n`,
      `fileupload\r\n`,
    ];

    if (userhash) {
      prefixParts.push(
        `--${boundary}\r\n`,
        `Content-Disposition: form-data; name="userhash"\r\n\r\n`,
        `${userhash}\r\n`,
      );
    }

    prefixParts.push(
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="fileToUpload"; filename="${fileName}"\r\n`,
      `Content-Type: ${input.mimeType}\r\n\r\n`,
    );

    const prefix = Buffer.from(prefixParts.join(""));
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
    const contentLength = prefix.length + input.fileSize + suffix.length;

    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), UPLOAD_TIMEOUT_MS);

    try {
      const body = Readable.from(
        (async function* () {
          yield prefix;
          yield* createReadStream(input.filePath);
          yield suffix;
        })(),
      );

      const response = await fetch(readEndpoint(), {
        method: "POST",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
          "content-length": String(contentLength),
        },
        body: body as unknown as BodyInit,
        duplex: "half",
        signal: abort.signal,
      } as RequestInit & { duplex: "half" });

      const text = (await response.text()).trim();

      if (!response.ok) {
        throw new UploadProviderError(
          "provider_failed",
          `Provider responded with ${response.status}`,
        );
      }

      let parsed: URL;
      try {
        parsed = new URL(text);
      } catch {
        throw new UploadProviderError(
          "provider_rejected",
          "Provider returned a non-URL response",
        );
      }

      if (parsed.protocol !== "https:") {
        throw new UploadProviderError(
          "provider_rejected",
          "Provider returned a non-https URL",
        );
      }

      const fileNameFromPath = parsed.pathname.split("/").filter(Boolean).pop();

      if (!fileNameFromPath || !/^[A-Za-z0-9._-]{1,100}$/.test(fileNameFromPath)) {
        throw new UploadProviderError(
          "provider_rejected",
          "Provider returned an unexpected file id",
        );
      }

      return { url: parsed.toString(), providerFileId: fileNameFromPath };
    } catch (error) {
      if (error instanceof UploadProviderError) {
        throw error;
      }

      if (abort.signal.aborted) {
        throw new UploadProviderError(
          "provider_timeout",
          "Provider upload timed out",
        );
      }

      throw new UploadProviderError(
        "provider_failed",
        "Provider upload failed",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async delete(providerFileId: string): Promise<void> {
    const userhash = process.env.CATBOX_USERHASH?.trim();

    if (!userhash) {
      throw new UploadProviderError(
        "provider_failed",
        "Deletion requires CATBOX_USERHASH",
      );
    }

    const params = new URLSearchParams({
      reqtype: "deletefiles",
      userhash,
      files: providerFileId,
    });

    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 30_000);

    try {
      const response = await fetch(readEndpoint(), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: abort.signal,
      });

      if (!response.ok) {
        throw new UploadProviderError(
          "provider_failed",
          `Provider deletion responded with ${response.status}`,
        );
      }
    } catch (error) {
      if (error instanceof UploadProviderError) {
        throw error;
      }

      throw new UploadProviderError(
        "provider_failed",
        abort.signal.aborted
          ? "Provider deletion timed out"
          : "Provider deletion failed",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function getUploadProvider(): UploadProvider {
  return new CatboxProvider();
}
