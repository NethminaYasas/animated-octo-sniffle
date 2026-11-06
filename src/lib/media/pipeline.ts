import "server-only";

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import sharp from "sharp";

// Magic-byte signatures. The client-supplied filename and MIME type are never
// used to decide what a file is.
export type MediaKind = "image" | "audio" | "video";
export type MediaMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "audio/mpeg"
  | "audio/ogg"
  | "video/mp4"
  | "video/webm";

export type DetectedMedia = {
  kind: MediaKind;
  mime: MediaMime;
  extension: string;
};

const MB = 1024 * 1024;

function readLimitBytes(name: string, fallbackMb: number): number {
  const raw = Number(process.env[name]);
  const mb = Number.isFinite(raw) && raw > 0 ? raw : fallbackMb;

  return Math.floor(mb * MB);
}

export const MEDIA_MAX_IMAGE_BYTES = readLimitBytes("MEDIA_MAX_IMAGE_MB", 10);
export const MEDIA_MAX_AUDIO_BYTES = readLimitBytes("MEDIA_MAX_AUDIO_MB", 30);
export const MEDIA_MAX_VIDEO_BYTES = readLimitBytes("MEDIA_MAX_VIDEO_MB", 50);
export const MEDIA_MAX_REQUEST_BYTES = MEDIA_MAX_VIDEO_BYTES + 1 * MB;

const LIMIT_BY_MIME: Record<MediaMime, number> = {
  "image/jpeg": MEDIA_MAX_IMAGE_BYTES,
  "image/png": MEDIA_MAX_IMAGE_BYTES,
  "image/webp": MEDIA_MAX_IMAGE_BYTES,
  "image/gif": MEDIA_MAX_IMAGE_BYTES,
  "audio/mpeg": MEDIA_MAX_AUDIO_BYTES,
  "audio/ogg": MEDIA_MAX_AUDIO_BYTES,
  "video/mp4": MEDIA_MAX_VIDEO_BYTES,
  "video/webm": MEDIA_MAX_VIDEO_BYTES,
};

export function limitForMime(mime: MediaMime): number {
  return LIMIT_BY_MIME[mime];
}

function startsWith(buffer: Buffer, offset: number, bytes: number[]): boolean {
  if (buffer.length < offset + bytes.length) {
    return false;
  }

  for (let index = 0; index < bytes.length; index += 1) {
    if (buffer[offset + index] !== bytes[index]) {
      return false;
    }
  }

  return true;
}

/**
 * Detects the media type from the first bytes of the file. Returns null for
 * anything outside the allowlist.
 */
export function detectMedia(header: Buffer): DetectedMedia | null {
  // JPEG: FF D8 FF
  if (startsWith(header, 0, [0xff, 0xd8, 0xff])) {
    return { kind: "image", mime: "image/jpeg", extension: "jpg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(header, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { kind: "image", mime: "image/png", extension: "png" };
  }

  // GIF: "GIF87a" / "GIF89a"
  if (
    startsWith(header, 0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    startsWith(header, 0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return { kind: "image", mime: "image/gif", extension: "gif" };
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    startsWith(header, 0, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(header, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return { kind: "image", mime: "image/webp", extension: "webp" };
  }

  // MP3: "ID3" tag or MPEG frame sync (FF Ex)
  if (
    startsWith(header, 0, [0x49, 0x44, 0x33]) ||
    (startsWith(header, 0, [0xff]) &&
      header.length > 1 &&
      (header[1] & 0xe0) === 0xe0 &&
      (header[1] & 0x06) !== 0)
  ) {
    return { kind: "audio", mime: "audio/mpeg", extension: "mp3" };
  }

  // OGG: "OggS"
  if (startsWith(header, 0, [0x4f, 0x67, 0x67, 0x53])) {
    return { kind: "audio", mime: "audio/ogg", extension: "ogg" };
  }

  // MP4: "...." "ftyp" at offset 4
  if (startsWith(header, 4, [0x66, 0x74, 0x79, 0x70])) {
    return { kind: "video", mime: "video/mp4", extension: "mp4" };
  }

  // WebM/Matroska: EBML header 1A 45 DF A3
  if (startsWith(header, 0, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { kind: "video", mime: "video/webm", extension: "webm" };
  }

  return null;
}

const JPEG_TAIL = Buffer.from([0xff, 0xd9]);
const PNG_IEND = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const GIF_TRAILER = 0x3b;

/**
 * Reject files with data appended after the container's logical end, where the
 * format makes that check practical. Returns true when the file is shaped
 * like the format it claims to be.
 */
export function passesStructureCheck(buffer: Buffer, mime: MediaMime): boolean {
  switch (mime) {
    case "image/jpeg":
      return buffer.length >= 4 && buffer.subarray(buffer.length - 2).equals(JPEG_TAIL);
    case "image/png":
      return buffer.length >= 12 && buffer.subarray(buffer.length - 12).equals(PNG_IEND);
    case "image/gif":
      return buffer[buffer.length - 1] === GIF_TRAILER;
    case "image/webp": {
      if (buffer.length < 12) {
        return false;
      }

      const declared = buffer.readUInt32LE(4) + 8;
      // The RIFF length must match the file exactly: longer means appended
      // data, shorter means truncation.
      return declared === buffer.length;
    }
    default:
      // Container validation is best-effort for audio/video; see docs.
      return true;
  }
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");

  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_GIF_FRAMES = 300;

export class ImageProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageProcessingError";
  }
}

/**
 * Decodes and re-encodes an image, applying EXIF orientation and dropping ALL
 * metadata (including GPS). Animated GIFs are re-encoded with the animation
 * preserved, capped to MAX_GIF_FRAMES.
 */
export async function stripImageMetadata(
  input: Buffer,
  mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
): Promise<Buffer> {
  const base = sharp(input, {
    failOn: "error",
    limitInputPixels: MAX_IMAGE_PIXELS,
    animated: mime === "image/gif",
  });

  if (mime === "image/gif") {
    const metadata = await base.metadata();

    if (metadata.pages !== undefined && metadata.pages > MAX_GIF_FRAMES) {
      throw new ImageProcessingError(
        `Animated GIFs are limited to ${MAX_GIF_FRAMES} frames`,
      );
    }
  }

  // .rotate() bakes EXIF orientation into the pixels, so the orientation
  // metadata can be discarded along with everything else.
  const pipeline = base.rotate();

  switch (mime) {
    case "image/jpeg":
      return pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    case "image/png":
      return pipeline.png({ compressionLevel: 9 }).toBuffer();
    case "image/webp":
      return pipeline.webp({ quality: 88 }).toBuffer();
    case "image/gif":
      return pipeline.gif().toBuffer();
  }
}

/**
 * Reads the first bytes of a file for signature detection.
 */
export async function readHeader(filePath: string, length = 512): Promise<Buffer> {
  const handle = await open(filePath, "r");

  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
