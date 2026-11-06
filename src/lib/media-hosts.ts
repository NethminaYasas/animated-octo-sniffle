/**
 * Hosts allowed to serve media inside posts. Keep in sync with the CSP in
 * next.config.ts (tests assert they match) and the sanitisers.
 */
export const MEDIA_HOSTS = ["files.catbox.moe"] as const;

export function isMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (MEDIA_HOSTS as readonly string[]).includes(url.hostname)
    );
  } catch {
    return false;
  }
}
