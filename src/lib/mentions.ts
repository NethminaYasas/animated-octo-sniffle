/**
 * Mention and quote helpers shared by the editor, the renderer and the
 * notification writer.
 *
 * Content is stored as rich-text HTML, so notifications are derived from the
 * final HTML rather than from separate hidden fields. That keeps old comments
 * working and means an edited/removed quote is reflected automatically.
 */

// Matches the username rules in src/lib/auth/validation.ts. The lookbehind is
// avoided on purpose: the leading character is consumed and re-emitted by the
// renderer, which keeps the regex portable.
const MENTION_NAME = String.raw`[a-z0-9_\u0B80-\u0BFF\u0D80-\u0DFF\u200C\u200D]{3,20}`;

const MENTION_PATTERN = new RegExp(
  String.raw`(^|[\s([{])@(${MENTION_NAME})`,
  "giu",
);

const QUOTE_AUTHOR_PATTERN = new RegExp(
  String.raw`@(${MENTION_NAME})\s+wrote:`,
  "giu",
);

/** Converts rich-text HTML to a single readable line. */
export function htmlToText(html: string): string {
  const withBreaks = html.replace(
    /<(br|\/p|\/div|\/li|\/blockquote|\/h[1-6])\s*\/?>/gi,
    " ",
  );

  if (typeof document === "undefined") {
    return withBreaks
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const template = document.createElement("template");
  template.innerHTML = withBreaks;

  return (template.content.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function normaliseMentionName(name: string): string {
  return name.trim().toLowerCase().normalize("NFC");
}

/** Unique, lowercased usernames mentioned with @username. */
export function extractMentions(html: string): string[] {
  const text = htmlToText(html);
  const names = new Set<string>();

  for (const match of text.matchAll(MENTION_PATTERN)) {
    names.add(normaliseMentionName(match[2]));
  }

  return [...names];
}

/**
 * Authors of quotes written as "@author wrote:". This is the marker the quote
 * clipper inserts, so quoted members can be notified without extra state.
 */
export function extractQuoteAuthors(html: string): string[] {
  const text = htmlToText(html);
  const names = new Set<string>();

  for (const match of text.matchAll(QUOTE_AUTHOR_PATTERN)) {
    names.add(normaliseMentionName(match[1]));
  }

  return [...names];
}

export function excerptFromHtml(html: string, maxLength = 180): string {
  const text = htmlToText(html);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Builds the blockquote inserted by the quote clipboard. */
export function quoteToHtml(quote: { author: string; text: string }): string {
  const text = quote.text.trim();

  if (!text) {
    return "";
  }

  const paragraphs = text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const body = paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");

  return [
    "<blockquote>",
    `<p><strong>@${escapeHtml(quote.author)} wrote:</strong></p>`,
    body || "<p></p>",
    "</blockquote>",
  ].join("");
}
