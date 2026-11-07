import type { Element, Root } from "hast";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, {
  defaultSchema,
  type Options as SanitizeOptions,
} from "rehype-sanitize";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { EmbedCard } from "@/components/embed";
import { resolveEmbed } from "@/lib/embeds";
import { isMediaUrl } from "@/lib/media-hosts";
import type { UploadState } from "@/lib/attachments";

const INLINE_SIZE_CLASSES: Record<string, string> = {
  sm: "text-size-sm",
  md: "text-size-md",
  lg: "text-size-lg",
  xl: "text-size-xl",
};

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

// Same username shape as src/lib/auth/validation.ts. Mentions are only
// rewritten in prose, never in code or existing links.
const MENTION_TEXT = new RegExp(
  String.raw`(^|[\s([{])@([a-z0-9_\u0B80-\u0BFF\u0D80-\u0DFF\u200C\u200D]{3,20})`,
  "giu",
);

const SKIP_MENTION_TAGS = new Set(["a", "code", "pre", "script", "style"]);

function splitMentions(value: string): HastNode[] {
  const nodes: HastNode[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(MENTION_TEXT)) {
    const index = match.index ?? 0;

    if (index > lastIndex) {
      nodes.push({ type: "text", value: value.slice(lastIndex, index) });
    }

    if (match[1]) {
      nodes.push({ type: "text", value: match[1] });
    }

    nodes.push({
      type: "element",
      tagName: "span",
      properties: { dataMention: "true" },
      children: [{ type: "text", value: `@${match[2]}` }],
    });

    lastIndex = index + match[0].length;
  }

  if (lastIndex < value.length) {
    nodes.push({ type: "text", value: value.slice(lastIndex) });
  }

  return nodes;
}

function walkMentions(node: HastNode) {
  if (!node.children) {
    return;
  }

  if (node.tagName && SKIP_MENTION_TAGS.has(node.tagName)) {
    return;
  }

  const next: HastNode[] = [];

  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string") {
      next.push(...splitMentions(child.value));
    } else {
      walkMentions(child);
      next.push(child);
    }
  }

  node.children = next;
}

function rehypeMentions() {
  return (tree: Root) => {
    walkMentions(tree as unknown as HastNode);
  };
}

/**
 * Raw HTML is parsed but sanitised. Media elements (img/video/audio) are
 * added so that URLs uploaded through the app render inline; the renderers
 * additionally require a host from MEDIA_HOSTS and an active upload row,
 * anything else becomes a plain link.
 */
const sanitizeSchema: SanitizeOptions = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "span", "img", "video", "audio", "source"],
  attributes: {
    ...defaultSchema.attributes,
    span: [
      ["dataSize", "sm", "md", "lg", "xl"],
      ["dataMention", "true"],
    ],
    img: [
      "src",
      "alt",
      "title",
      "loading",
      ["dataWidth", ...Array.from({ length: 86 }, (_, i) => String(i + 15))],
    ],
    video: ["src", "controls", "preload", "width", "height"],
    audio: ["src", "controls", "preload"],
    source: ["src", "type"],
  },
};

/**
 * A paragraph that contains only one link can become an embed. This keeps a
 * link inside a normal sentence as a link, while a URL on its own line turns
 * into a player or post card for a supported provider.
 */
function standaloneLinkUrl(node?: Element): string | null {
  if (!node || (node.tagName !== "p" && node.tagName !== "div")) {
    return null;
  }

  const meaningful = node.children.filter(
    (child) => !(child.type === "text" && child.value.trim() === ""),
  );

  if (meaningful.length !== 1) {
    return null;
  }

  const only = meaningful[0];

  if (only.type === "text") {
    const value = only.value.trim();
    return /^https?:\/\/\S+$/i.test(value) ? value : null;
  }

  if (only.type !== "element" || only.tagName !== "a") {
    return null;
  }

  const href = only.properties?.href;

  return typeof href === "string" ? href : null;
}

function parseImageWidth(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const width = Number.parseInt(value, 10);
  return Number.isInteger(width) && width >= 15 && width <= 100 ? width : null;
}

function renderMedia(
  tag: "img" | "video" | "audio",
  src: string | undefined,
  uploadStates: Record<string, UploadState | undefined> | undefined,
  alt?: string | undefined,
  imageWidth?: number | null,
) {
  if (!src || !isMediaUrl(src)) {
    // Not a host we trust: render as a plain link.
    return src ? <a href={src}>{alt ?? src}</a> : null;
  }

  const state = uploadStates?.[src];

  if (state === "removed") {
    return (
      <span className="upload-removed">
        This attachment was removed by a moderator.
      </span>
    );
  }

  if (state !== "active") {
    // Not an upload we know about (hotlinked or pasted): link it.
    return <a href={src}>{alt ?? src}</a>;
  }

  if (tag === "img") {
    // Attachments come from our own upload pipeline and are the only remote
    // images the app renders. `data-width` is an integer percent (15–100)
    // chosen by the author with the editor resize handle.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt ?? ""}
        loading="lazy"
        {...(imageWidth !== null && imageWidth !== undefined
          ? { "data-width": String(imageWidth), style: { width: `${imageWidth}%` } }
          : {})}
        className={`${imageWidth ? "" : "max-h-96 "}w-auto max-w-full rounded-lg border border-line`}
      />
    );
  }

  if (tag === "video") {
    return (
      <video
        src={src}
        controls
        preload="metadata"
        className="max-h-96 w-full max-w-2xl rounded-lg border border-line"
      />
    );
  }

  return <audio src={src} controls preload="metadata" className="w-full max-w-xl" />;
}

/**
 * Safe by default: raw HTML is parsed and then sanitised, links are restricted
 * by react-markdown's URL transform, and embeds are whitelisted providers only.
 * Media renders only when it is an active upload row; anything else becomes a
 * plain link.
 */
export function MarkdownContent({
  children,
  uploadStates,
}: {
  children: string;
  uploadStates?: Record<string, UploadState | undefined>;
}) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeRaw,
          rehypeMentions,
          [rehypeSanitize, sanitizeSchema],
        ]}
        components={{
          // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip the node prop before spreading
          a: ({ node: _node, href, children, ...rest }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
              {children}
            </a>
          ),
          p: ({ node, children }) => {
            const href = standaloneLinkUrl(node);
            const embed = href ? resolveEmbed(href) : null;

            if (embed) {
              return <EmbedCard embed={embed} />;
            }

            return <p>{children}</p>;
          },
          div: ({ node, children }) => {
            const href = standaloneLinkUrl(node);
            const embed = href ? resolveEmbed(href) : null;

            if (embed) {
              return <EmbedCard embed={embed} />;
            }

            return <div>{children}</div>;
          },
          span: ({ node, children }) => {
            const size = node?.properties?.dataSize;
            const mention =
              node?.properties?.dataMention === "true" ||
              node?.properties?.dataMention === true;
            const className = [
              typeof size === "string" ? INLINE_SIZE_CLASSES[size] : null,
              mention ? "mention" : null,
            ]
              .filter(Boolean)
              .join(" ");

            return <span className={className || undefined}>{children}</span>;
          },
          img: ({ node, src, alt }) =>
            renderMedia(
              "img",
              typeof src === "string" ? src : undefined,
              uploadStates,
              typeof alt === "string" ? alt : undefined,
              parseImageWidth(node?.properties?.dataWidth),
            ),
          video: ({ src }) =>
            renderMedia("video", typeof src === "string" ? src : undefined, uploadStates),
          audio: ({ src }) =>
            renderMedia("audio", typeof src === "string" ? src : undefined, uploadStates),
          source: ({ src, type }) => {
            // A bare <source> has no playable parent here; render as a link.
            return src ? <a href={typeof src === "string" ? src : undefined}>{type ?? src}</a> : null;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
