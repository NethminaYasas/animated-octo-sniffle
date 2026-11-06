import "server-only";

import sanitizeHtml from "sanitize-html";

import { isMediaUrl } from "@/lib/media-hosts";

const ALLOWED_TAGS = [
  "p",
  "div",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "s",
  "strike",
  "del",
  "code",
  "pre",
  "blockquote",
  "a",
  "ul",
  "ol",
  "li",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "span",
  "img",
  "video",
  "audio",
  "source",
];

const INLINE_SIZES = new Set(["sm", "md", "lg", "xl"]);

/**
 * Keeps a media tag only when its src is an https URL on an upload host,
 * otherwise rewrites it to a plain text link (matching the render path).
 */
function mediaTag(
  tag: "img" | "video" | "audio" | "source",
  attribs: Record<string, string | undefined>,
  allowedAttrs: string[],
): { tagName: string; attribs: Record<string, string> } {
  const src = attribs.src?.trim();

  if (!src || !isMediaUrl(src)) {
    return src
      ? { tagName: "a", attribs: { href: src, rel: "noopener noreferrer", target: "_blank" } }
      : { tagName: "span", attribs: {} };
  }

  const next: Record<string, string> = { src };

  for (const attribute of allowedAttrs) {
    const value = attribs[attribute]?.trim();

    if (value !== undefined && value !== "") {
      next[attribute] = value;
    }
  }

  if (tag === "video" || tag === "audio") {
    next.controls = "";
    next.preload = next.preload ?? "metadata";
  }

  if (tag === "img") {
    next.loading = next.loading ?? "lazy";
  }

  return { tagName: tag, attribs: next };
}

/**
 * Server-side allowlist sanitizer for rich-text post and comment HTML.
 *
 * The renderer (MarkdownContent + rehype-sanitize) remains the authoritative
 * gate. This pass keeps obviously hostile markup out of the database in the
 * first place and makes every stored row safe to inspect.
 */
export function sanitiseRichText(input: string): string {
  const dirty = input.trim();

  if (!dirty) {
    return "";
  }

  return sanitizeHtml(dirty, {
    allowedTags: ALLOWED_TAGS,
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      a: ["http", "https", "mailto"],
    },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      span: ["data-size"],
      img: ["src", "alt", "title", "loading"],
      video: ["src", "controls", "preload"],
      audio: ["src", "controls", "preload"],
      source: ["src", "type"],
    },
    transformTags: {
      a: (_tagName, attribs) => {
        const href = attribs.href?.trim();

        if (!href) {
          return { tagName: "span", attribs: {} };
        }

        const next: Record<string, string> = {
          href,
          target: "_blank",
          rel: "noopener noreferrer",
        };

        if (attribs.title) {
          next.title = attribs.title;
        }

        return { tagName: "a", attribs: next };
      },
      span: (_tagName, attribs) => {
        const size = attribs["data-size"];
        const next: Record<string, string> = {};

        if (size && INLINE_SIZES.has(size)) {
          next["data-size"] = size;
        }

        return { tagName: "span", attribs: next };
      },
      // Media is only accepted from the upload host. Anything else becomes a
      // plain text link, matching the render path.
      img: (_tagName, attribs) => mediaTag("img", attribs, ["alt", "title", "loading"]),
      video: (_tagName, attribs) => mediaTag("video", attribs, ["controls", "preload"]),
      audio: (_tagName, attribs) => mediaTag("audio", attribs, ["controls", "preload"]),
      source: (_tagName, attribs) => mediaTag("source", attribs, ["type"]),
    },
  });
}
