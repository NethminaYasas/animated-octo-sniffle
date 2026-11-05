import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Safe by default: raw HTML is dropped (skipHtml) and links are restricted to
 * http/https/mailto/etc. by react-markdown's built-in URL transform.
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
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}