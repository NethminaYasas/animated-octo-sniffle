"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link2,
  TextQuote,
  List,
  ListOrdered,
  Minus,
  PenLine,
  Eye,
  X,
  Check,
  ClipboardPaste,
} from "lucide-react";

import { MarkdownContent } from "@/components/markdown-content";
import { quoteToHtml } from "@/lib/mentions";
import { clearQuotes, removeQuote, useQuotes } from "@/lib/quotes";
import { hasRichText } from "@/lib/rich-text";

const INLINE_SIZES = {
  sm: "Small",
  md: "Medium",
  lg: "Large",
} as const;

type InlineSize = keyof typeof INLINE_SIZES;

export type MarkdownEditorProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  ariaLabel?: string;
  onSubmit?: () => void;
  onEditorReady?: (element: HTMLDivElement | null) => void;
  /** Show the copied-quotes clipboard. Used by the comment composer. */
  quoteClipboard?: boolean;
};

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(event: MouseEvent) => event.preventDefault()}
      onClick={onClick}
      className="grid size-8 place-items-center rounded text-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-orange-600"
    >
      {children}
    </button>
  );
}

export function MarkdownEditor({
  id,
  value,
  onChange,
  placeholder = "Write something...",
  rows = 8,
  ariaLabel,
  onSubmit,
  onEditorReady,
  quoteClipboard = false,
}: MarkdownEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      editorRef.current = el;
      onEditorReady?.(el);
    },
    [onEditorReady],
  );

  const [mode, setMode] = useState<"write" | "preview">("write");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [quotesOpen, setQuotesOpen] = useState(false);
  const savedRangeRef = useRef<Range | null>(null);
  const quotes = useQuotes();
  const previousQuoteCount = useRef(quotes.length);
  const textSizeId = id ? `${id}-text-size` : "markdown-text-size";

  // Keep the editor in sync with external value changes without replacing the
  // DOM (and losing the caret) on every keystroke.
  useEffect(() => {
    const el = editorRef.current;

    if (el && el.innerHTML.replace(/\u200B/g, "") !== value) {
      el.innerHTML = value;
    }
  }, [value]);

  useEffect(() => {
    try {
      document.execCommand("defaultParagraphSeparator", false, "p");
    } catch {
      // Browsers that do not support the command still work with divs.
    }
  }, []);

  // When Reply or the selection Quote button copies something, open the
  // clipboard so the action is visible and one click away from pasting.
  useEffect(() => {
    if (quotes.length > previousQuoteCount.current) {
      setQuotesOpen(true);
    }

    previousQuoteCount.current = quotes.length;
  }, [quotes.length]);

  const focusEditor = () => {
    editorRef.current?.focus();
  };

  const getActiveRange = () => {
    const selection = window.getSelection();

    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);

      if (editorRef.current?.contains(range.commonAncestorContainer)) {
        return range;
      }
    }

    return savedRangeRef.current;
  };

  const saveSelection = () => {
    const range = getActiveRange();

    if (range) {
      savedRangeRef.current = range.cloneRange();
    }
  };

  const restoreRange = (range: Range) => {
    const selection = window.getSelection();

    if (!selection) {
      return;
    }

    selection.removeAllRanges();
    selection.addRange(range);
  };

  const syncValue = () => {
    const el = editorRef.current;

    if (!el) {
      return;
    }

    const text = el.textContent?.replace(/\u200B/g, "") ?? "";
    const html = el.innerHTML.replace(/\u200B/g, "");
    const hasContentElement = Array.from(el.querySelectorAll("*")).some(
      (node) => !["br", "p", "div"].includes(node.tagName.toLowerCase()),
    );

    onChange(text.trim() === "" && !hasContentElement ? "" : html);
  };

  const exec = (command: string, value?: string) => {
    const range = getActiveRange();

    focusEditor();

    if (range) {
      restoreRange(range);
    }

    document.execCommand(command, false, value);
    syncValue();
  };

  const wrapSelection = (tagName: string) => {
    const range = getActiveRange();

    if (!range) {
      return;
    }

    focusEditor();
    restoreRange(range);

    const element = document.createElement(tagName);

    if (range.collapsed) {
      element.textContent = "\u200B";
      range.insertNode(element);

      const next = document.createRange();
      next.setStart(element.firstChild!, 1);
      next.collapse(true);
      restoreRange(next);
    } else {
      element.appendChild(range.extractContents());
      range.insertNode(element);

      const next = document.createRange();
      next.selectNodeContents(element);
      restoreRange(next);
    }

    syncValue();
  };

  const findSizeSpan = (node: Node | null) => {
    let current: Node | null = node;

    while (current && current !== editorRef.current) {
      if (current instanceof HTMLElement && current.matches("span[data-size]")) {
        return current;
      }

      current = current.parentNode;
    }

    return null;
  };

  const applyInlineSize = (size: InlineSize) => {
    const range = getActiveRange();

    if (!range) {
      return;
    }

    focusEditor();
    restoreRange(range);

    const existing = findSizeSpan(
      range.collapsed ? range.startContainer : range.commonAncestorContainer,
    );

    // Change the existing span instead of nesting another size on top of it.
    if (range.collapsed && existing) {
      existing.setAttribute("data-size", size);
      syncValue();
      return;
    }

    if (
      !range.collapsed &&
      existing &&
      existing.contains(range.startContainer) &&
      existing.contains(range.endContainer) &&
      existing.textContent === range.toString()
    ) {
      existing.setAttribute("data-size", size);
      syncValue();
      return;
    }

    const span = document.createElement("span");
    span.setAttribute("data-size", size);

    if (range.collapsed) {
      span.textContent = "\u200B";
      range.insertNode(span);

      const next = document.createRange();
      next.setStart(span.firstChild!, 1);
      next.collapse(true);
      restoreRange(next);
    } else {
      span.appendChild(range.extractContents());

      // The new size applies to the whole selection, including any spans the
      // author selected.
      span.querySelectorAll("span[data-size]").forEach((inner) => {
        inner.removeAttribute("data-size");
      });

      range.insertNode(span);

      const next = document.createRange();
      next.selectNodeContents(span);
      restoreRange(next);
    }

    syncValue();
  };

  const openLinkPanel = () => {
    const range = getActiveRange();

    if (range) {
      savedRangeRef.current = range.cloneRange();
    }

    setLinkLabel(range && !range.collapsed ? range.toString() : "");
    setLinkUrl("");
    setLinkOpen(true);
  };

  const closeLinkPanel = () => {
    setLinkOpen(false);
    setLinkUrl("");
    setLinkLabel("");

    const range = savedRangeRef.current;
    focusEditor();

    if (range) {
      restoreRange(range);
    }
  };

  const applyLink = () => {
    const range = getActiveRange();
    const trimmed = linkUrl.trim();

    if (!range || trimmed === "") {
      closeLinkPanel();
      return;
    }

    const normalized = /^(https?:\/\/|mailto:)/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;

    if (!/^(https?:\/\/|mailto:)/i.test(normalized)) {
      closeLinkPanel();
      return;
    }

    const label =
      linkLabel.trim() ||
      (range.collapsed ? normalized : range.toString()) ||
      normalized;

    const anchor = document.createElement("a");
    anchor.setAttribute("href", normalized);
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
    anchor.textContent = label;

    focusEditor();
    restoreRange(range);
    range.deleteContents();
    range.insertNode(anchor);

    const next = document.createRange();
    next.setStartAfter(anchor);
    next.collapse(true);
    restoreRange(next);

    syncValue();
    setLinkOpen(false);
    setLinkUrl("");
    setLinkLabel("");
    savedRangeRef.current = null;
  };

  const handleLinkKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeLinkPanel();
    } else if (event.key === "Enter") {
      event.preventDefault();
      applyLink();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const mod = event.ctrlKey || event.metaKey;

    if (!mod) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === "b") {
      event.preventDefault();
      exec("bold");
    } else if (key === "i") {
      event.preventDefault();
      exec("italic");
    } else if (key === "k") {
      event.preventDefault();
      openLinkPanel();
    } else if (key === "enter" && onSubmit) {
      event.preventDefault();
      onSubmit();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    syncValue();
  };

  const handlePasteQuotes = () => {
    const el = editorRef.current;

    if (!el || quotes.length === 0) {
      return;
    }

    const html = `${quotes
      .map((quote) => quoteToHtml(quote))
      .join("")}<p><br></p>`;

    el.insertAdjacentHTML("beforeend", html);
    syncValue();
    clearQuotes();
    setQuotesOpen(false);

    window.setTimeout(() => {
      el.focus();

      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);

      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }, 0);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div
        role="tablist"
        aria-label="Editor mode"
        className="flex items-center gap-1 border-b border-line bg-surface-muted px-1.5 py-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "write"}
          onClick={() => setMode("write")}
          className={`flex items-center gap-1.5 rounded px-3 py-2 text-sm font-semibold transition-colors ${
            mode === "write"
              ? "bg-surface text-ink shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          <PenLine className="size-4" />
          Write
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "preview"}
          onClick={() => setMode("preview")}
          className={`flex items-center gap-1.5 rounded px-3 py-2 text-sm font-semibold transition-colors ${
            mode === "preview"
              ? "bg-surface text-ink shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          <Eye className="size-4" />
          Preview
        </button>
      </div>

      {mode === "write" ? (
        <div role="tabpanel" aria-label="Editor">
          <div
            className="flex flex-wrap items-center gap-0.5 border-b border-line px-1.5 py-1"
            onMouseDown={saveSelection}
          >
            <ToolbarButton label="Bold (Ctrl+B)" onClick={() => exec("bold")}>
              <Bold className="size-4" />
            </ToolbarButton>
            <ToolbarButton label="Italic (Ctrl+I)" onClick={() => exec("italic")}>
              <Italic className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              label="Strikethrough"
              onClick={() => exec("strikeThrough")}
            >
              <Strikethrough className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              label="Inline code"
              onClick={() => wrapSelection("code")}
            >
              <Code className="size-4" />
            </ToolbarButton>
            <ToolbarButton label="Link (Ctrl+K)" onClick={openLinkPanel}>
              <Link2 className="size-4" />
            </ToolbarButton>
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
            <label className="sr-only" htmlFor={textSizeId}>
              Text size for selected text
            </label>
            <select
              id={textSizeId}
              aria-label="Text size for selected text"
              title="Text size for selected text"
              defaultValue=""
              onMouseDown={saveSelection}
              onChange={(event) => {
                const size = event.target.value as InlineSize | "";

                if (size) {
                  applyInlineSize(size);
                }

                event.target.value = "";
              }}
              className="h-8 rounded border border-line bg-surface px-1.5 text-xs font-semibold text-muted focus:outline-none focus:ring-2 focus:ring-orange-700"
            >
              <option value="" disabled>
                Size
              </option>
              {(Object.keys(INLINE_SIZES) as InlineSize[]).map((size) => (
                <option key={size} value={size}>
                  {INLINE_SIZES[size]}
                </option>
              ))}
            </select>
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
            <ToolbarButton
              label="Quote"
              onClick={() => exec("formatBlock", "blockquote")}
            >
              <TextQuote className="size-4" />
            </ToolbarButton>
            {quoteClipboard ? (
              <ToolbarButton
                label={
                  quotes.length > 0
                    ? `Copied quotes (${quotes.length})`
                    : "Copied quotes"
                }
                onClick={() => setQuotesOpen((open) => !open)}
              >
                <span className="relative">
                  <ClipboardPaste className="size-4" />
                  {quotes.length > 0 ? (
                    <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-orange-700 px-1 text-[9px] font-bold leading-none text-white">
                      {quotes.length > 9 ? "9+" : quotes.length}
                    </span>
                  ) : null}
                </span>
              </ToolbarButton>
            ) : null}
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
            <ToolbarButton
              label="Bulleted list"
              onClick={() => exec("insertUnorderedList")}
            >
              <List className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              label="Numbered list"
              onClick={() => exec("insertOrderedList")}
            >
              <ListOrdered className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              label="Horizontal rule"
              onClick={() => exec("insertHorizontalRule")}
            >
              <Minus className="size-4" />
            </ToolbarButton>
          </div>

          {quoteClipboard && quotesOpen ? (
            <div className="border-b border-line bg-surface-muted/50 px-2 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Copied quotes
                </p>
                {quotes.length > 0 ? (
                  <button
                    type="button"
                    onClick={clearQuotes}
                    className="text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              {quotes.length === 0 ? (
                <p className="mt-1 text-xs text-faint">
                  Select text in a comment or press Reply to copy a quote.
                </p>
              ) : (
                <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                  {quotes.map((quote) => (
                    <li
                      key={quote.id}
                      className="flex items-start gap-2 rounded border border-line bg-surface px-2 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-ink">
                          @{quote.author}
                        </p>
                        <p className="truncate text-[11px] text-muted">
                          {quote.text}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeQuote(quote.id)}
                        aria-label={`Remove quote from ${quote.author}`}
                        title="Remove quote"
                        className="grid size-6 shrink-0 place-items-center rounded text-muted transition-colors hover:bg-surface-muted hover:text-ink"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {quotes.length > 0 ? (
                <button
                  type="button"
                  onClick={handlePasteQuotes}
                  className="mt-2 inline-flex items-center gap-1 rounded bg-orange-700 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-orange-800"
                >
                  <ClipboardPaste className="size-3.5" />
                  Paste{" "}
                  {quotes.length === 1 ? "quote" : `${quotes.length} quotes`}
                </button>
              ) : null}
            </div>
          ) : null}

          {linkOpen ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-muted/50 px-2 py-2">
              <input
                type="text"
                aria-label="Link text"
                placeholder="Text"
                value={linkLabel}
                onChange={(event) => setLinkLabel(event.target.value)}
                onKeyDown={handleLinkKeyDown}
                className="h-9 min-w-0 flex-1 rounded border border-line bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-orange-700"
              />
              <input
                type="text"
                aria-label="Link URL"
                placeholder="https://example.com"
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                onKeyDown={handleLinkKeyDown}
                autoFocus
                className="h-9 min-w-0 flex-1 rounded border border-line bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-orange-700"
              />
              <button
                type="button"
                aria-label="Insert link"
                title="Insert link"
                onClick={applyLink}
                className="grid size-9 place-items-center rounded bg-orange-700 text-white hover:bg-orange-800"
              >
                <Check className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Cancel link"
                title="Cancel"
                onClick={closeLinkPanel}
                className="grid size-9 place-items-center rounded border border-line text-muted hover:bg-surface-muted hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : null}

          <div
            ref={setRefs}
            id={id}
            role="textbox"
            aria-multiline="true"
            aria-label={ariaLabel}
            contentEditable
            suppressContentEditableWarning
            suppressHydrationWarning
            data-placeholder={placeholder}
            onInput={syncValue}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            className="rich-editor block w-full whitespace-pre-wrap break-words bg-surface px-3 py-3 text-base leading-relaxed text-ink focus:outline-none"
            style={{ minHeight: `${Math.max(rows, 4) * 1.75}rem` }}
          />
          <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-faint">
            <span>
              Formatted text is saved with your post. Paste a supported link on
              its own line to embed it.
            </span>
            <span aria-live="polite">Ctrl+Enter</span>
          </div>
        </div>
      ) : (
        <div
          role="tabpanel"
          aria-label="Preview"
          className="max-h-[70vh] overflow-y-auto px-3 py-3"
        >
          {!hasRichText(value) ? (
            <p className="py-10 text-center text-sm text-faint">
              Nothing to preview yet. Start writing in the Write tab.
            </p>
          ) : (
            <MarkdownContent>{value}</MarkdownContent>
          )}
        </div>
      )}
    </div>
  );
}
