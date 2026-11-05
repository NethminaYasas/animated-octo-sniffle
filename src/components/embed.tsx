import { ExternalLink } from "lucide-react";

import type { Embed } from "@/lib/embeds";

export function EmbedCard({ embed }: { embed: Embed }) {
  const isVideo = embed.aspect === "video";

  return (
    <figure className="my-4 overflow-hidden rounded-lg border border-line bg-surface">
      <div
        className={isVideo ? "relative aspect-video w-full" : "relative w-full"}
        style={isVideo ? undefined : { height: embed.height ?? 520 }}
      >
        <iframe
          allow={embed.allow}
          allowFullScreen={embed.allowFullScreen}
          className="absolute inset-0 h-full w-full"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          src={embed.src}
          title={embed.title}
        />
      </div>

      <figcaption className="flex items-center justify-between gap-3 border-t border-line px-3 py-2 text-xs text-faint">
        <span>{embed.label} embed</span>
        <a
          className="flex items-center gap-1 font-medium text-muted hover:text-ink hover:underline"
          href={embed.originalUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          Open original
          <ExternalLink className="size-3" />
        </a>
      </figcaption>
    </figure>
  );
}
