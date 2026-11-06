import "server-only";

import sanitizeHtml from "sanitize-html";

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
];

const INLINE_SIZES = new Set(["sm", "md", "lg", "xl"]);

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
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      span: ["data-size"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      a: ["http", "https", "mailto"],
    },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
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
    },
  });
}
