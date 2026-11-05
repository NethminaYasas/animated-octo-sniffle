import type { Element } from "hast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { EmbedCard } from "@/components/embed";
import { resolveEmbed } from "@/lib/embeds";

/**
 * A paragraph that contains only one link can become an embed. This keeps a
 * link inside a normal sentence as a link, while a URL on its own line turns
 * into a player or post card for a supported provider.
 */
function standaloneLinkUrl(node?: Element): string | null {
  if (!node || node.tagName !== "p") {
    return null;
  }

  const meaningful = node.children.filter(
    (child) => !(child.type === "text" && child.value.trim() === ""),
  );

  if (meaningful.length !== 1) {
    return null;
  }

  const only = meaningful[0];

  if (only.type !== "element" || only.tagName !== "a") {
    return null;
  }

  const href = only.properties?.href;

  return typeof href === "string" ? href : null;
}

/**
 * Safe by default: raw HTML is dropped (skipHtml) and links are restricted to
 * http/https/mailto/etc. by react-markdown's built-in URL transform. Embeds
 * are whitelisted providers only; see src/lib/embeds.ts.
 */
export function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
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
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
