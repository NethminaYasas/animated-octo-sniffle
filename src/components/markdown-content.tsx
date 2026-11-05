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
 * Raw HTML is parsed but sanitised. The only extra element allowed is a span
 * carrying data-size="sm|md|lg|xl"; the span renderer ignores other attributes.
 */
const sanitizeSchema: SanitizeOptions = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "span"],
  attributes: {
    ...defaultSchema.attributes,
    span: [
      ["dataSize", "sm", "md", "lg", "xl"],
      ["dataMention", "true"],
    ],
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

/**
 * Safe by default: raw HTML is parsed and then sanitised, links are restricted
 * by react-markdown's URL transform, and embeds are whitelisted providers only.
 */
export function MarkdownContent({ children }: { children: string }) {
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
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
