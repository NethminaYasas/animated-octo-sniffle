/**
 * True when rich-text HTML contains something worth submitting. Empty
 * formatting shells (for example the span inserted before the user picks a
 * text size) do not count.
 */
export function hasRichText(html: string): boolean {
  if (/<(hr|img|iframe)\b/i.test(html)) {
    return true;
  }

  const text = html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|\u200B/g, "")
    .trim();

  return text !== "";
}
