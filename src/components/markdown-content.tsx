import type { Element } from "hast";
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

/**
 * Raw HTML is parsed but sanitised. The only extra element allowed is a span
 * carrying data-size="sm|md|lg|xl"; the span renderer ignores other attributes.
 */
const sanitizeSchema: SanitizeOptions = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "span"],
  attributes: {
    ...defaultSchema.attributes,
    span: [["dataSize", "sm", "md", "lg", "xl"]],
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
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={{
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
            const className =
              typeof size === "string" ? INLINE_SIZE_CLASSES[size] : undefined;

            return <span className={className}>{children}</span>;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
