"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
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
} from "lucide-react";

import { MarkdownContent } from "@/components/markdown-content";

const EDITOR_FONT_SIZES = {
  sm: "0.9rem",
  md: "1rem",
  lg: "1.125rem",
  xl: "1.25rem",
} as const;

type EditorFontSize = keyof typeof EDITOR_FONT_SIZES;

export type MarkdownEditorProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  ariaLabel?: string;
  onSubmit?: () => void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
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
  placeholder = "Write something…",
  rows = 8,
  ariaLabel,
  onSubmit,
  textareaRef: textareaRefProp,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const setRefs = (el: HTMLTextAreaElement | null) => {
    textareaRef.current = el;
    if (textareaRefProp) {
      textareaRefProp.current = el;
    }
  };
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [fontSize, setFontSize] = useState<EditorFontSize>("md");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const linkSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const fontSizeId = id ? `${id}-font-size` : "markdown-font-size";

  useEffect(() => {
    try {
      const saved = localStorage.getItem("editor-font-size");

      if (
        saved === "sm" ||
        saved === "md" ||
        saved === "lg" ||
        saved === "xl"
      ) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the saved editor preference after mount
        setFontSize(saved);
      }
    } catch {
      // Use the default when storage is unavailable.
    }
  }, []);

  const changeFontSize = (value: EditorFontSize) => {
    setFontSize(value);

    try {
      localStorage.setItem("editor-font-size", value);
    } catch {
      // Ignore storage errors; the size still applies for this visit.
    }
  };

  const restoreSelection = (start: number, end: number) => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    requestAnimationFrame(() => el.setSelectionRange(start, end));
  };

  const toggleInline = (before: string, after: string, placeholderText: string) => {
    const el = textareaRef.current;
    if (!el) return;

    const { selectionStart: start, selectionEnd: end } = el;
    const selected = value.slice(start, end) || placeholderText;

    const isPartOfLongerRun =
      before === "*" && (value[start - 2] === "*" || value[end + 1] === "*");
    const beforeMatches =
      !isPartOfLongerRun && value.slice(Math.max(0, start - before.length), start) === before;
    const afterMatches =
      !isPartOfLongerRun && value.slice(end, end + after.length) === after;

    if (beforeMatches && afterMatches) {
      // Already wrapped — unwrap.
      const next =
        value.slice(0, start - before.length) +
        selected +
        value.slice(end + after.length);
      onChange(next);
      restoreSelection(start - before.length, start - before.length + selected.length);
      return;
    }

    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    restoreSelection(start + before.length, start + before.length + selected.length);
  };

  const lineRange = (el: HTMLTextAreaElement) => {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const startLine = value.lastIndexOf("\n", start - 1) + 1;
    let endLine = value.indexOf("\n", end);
    if (endLine === -1) endLine = value.length;
    return { startLine, endLine };
  };

  const reselectBlock = (start: number, text: string) => {
    restoreSelection(start, start + text.length);
  };

  const toggleLinePrefix = (prefix: string) => {
    const el = textareaRef.current;
    if (!el) return;

    const { startLine, endLine } = lineRange(el);
    const before = value.slice(0, startLine);
    const block = value.slice(startLine, endLine);
    const after = value.slice(endLine);
    const lines = block.split("\n");

    const nonEmpty = lines.filter((line) => line.trim() !== "");
    const allHave =
      nonEmpty.length > 0 && nonEmpty.every((line) => line.startsWith(prefix));

    const nextLines = lines.map((line) => {
      if (line.trim() === "") return line;
      if (allHave) return line.startsWith(prefix) ? line.slice(prefix.length) : line;
      return prefix + line;
    });

    const joined = nextLines.join("\n");
    onChange(before + joined + after);
    reselectBlock(startLine, joined);
  };

  const toggleNumberedList = () => {
    const el = textareaRef.current;
    if (!el) return;

    const { startLine, endLine } = lineRange(el);
    const before = value.slice(0, startLine);
    const block = value.slice(startLine, endLine);
    const after = value.slice(endLine);
    const lines = block.split("\n");

    const nonEmpty = lines.filter((line) => line.trim() !== "");
    const allNumbered =
      nonEmpty.length > 0 && nonEmpty.every((line) => /^\d+\.\s/.test(line));

    let index = 0;
    const nextLines = lines.map((line) => {
      if (line.trim() === "") return line;
      if (allNumbered) return line.replace(/^\d+\.\s/, "");
      index += 1;
      return `${index}. ${line}`;
    });

    const joined = nextLines.join("\n");
    onChange(before + joined + after);
    reselectBlock(startLine, joined);
  };

  const insertHorizontalRule = () => {
    const el = textareaRef.current;
    if (!el) return;

    const { selectionStart: start, selectionEnd: end } = el;
    const beforeText = value.slice(0, start);
    const block = `${beforeText.endsWith("\n") ? "" : "\n"}\n---\n\n`;
    const next = beforeText + block + value.slice(end);
    onChange(next);
    restoreSelection(beforeText.length + block.length, beforeText.length + block.length);
  };

  const openLinkPanel = () => {
    const el = textareaRef.current;
    if (!el) return;

    const { selectionStart: start, selectionEnd: end } = el;
    const selected = value.slice(start, end);
    linkSelectionRef.current = { start, end };
    setLinkLabel(selected);
    setLinkUrl("");
    setLinkOpen(true);
  };

  const closeLinkPanel = () => {
    setLinkOpen(false);
    setLinkUrl("");
    setLinkLabel("");
    linkSelectionRef.current = null;
    textareaRef.current?.focus();
  };

  const applyLink = () => {
    const target = linkSelectionRef.current;
    if (!target) return;

    const trimmedUrl = linkUrl.trim();
    if (trimmedUrl === "") {
      closeLinkPanel();
      return;
    }

    const normalized =
      /^(https?:\/\/|mailto:)/i.test(trimmedUrl)
        ? trimmedUrl
        : `https://${trimmedUrl}`;
    const label = linkLabel.trim() || "link";
    const insertion = `[${label}](${normalized})`;

    const next = value.slice(0, target.start) + insertion + value.slice(target.end);
    onChange(next);
    setLinkOpen(false);
    setLinkUrl("");
    setLinkLabel("");
    linkSelectionRef.current = null;
    restoreSelection(target.start + insertion.length, target.start + insertion.length);
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

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return;

    const key = event.key.toLowerCase();
    if (key === "b") {
      event.preventDefault();
      toggleInline("**", "**", "bold text");
    } else if (key === "i") {
      event.preventDefault();
      toggleInline("*", "*", "italic text");
    } else if (key === "k") {
      event.preventDefault();
      openLinkPanel();
    } else if (key === "enter" && onSubmit) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div
        role="tablist"
        aria-label="Markdown editor mode"
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

      <div>
        <div
          className={`min-w-0 ${mode === "write" ? "block" : "hidden"}`}
          role="tabpanel"
          aria-label="Markdown editor"
        >
          <div
            className="flex flex-wrap items-center gap-0.5 border-b border-line px-1.5 py-1"
          >
            <ToolbarButton label="Bold (Ctrl+B)" onClick={() => toggleInline("**", "**", "bold text")}>
              <Bold className="size-4" />
            </ToolbarButton>
            <ToolbarButton label="Italic (Ctrl+I)" onClick={() => toggleInline("*", "*", "italic text")}>
              <Italic className="size-4" />
            </ToolbarButton>
            <ToolbarButton label="Strikethrough" onClick={() => toggleInline("~~", "~~", "struck text")}>
              <Strikethrough className="size-4" />
            </ToolbarButton>
            <ToolbarButton label="Inline code" onClick={() => toggleInline("`", "`", "code")}>
              <Code className="size-4" />
            </ToolbarButton>
            <ToolbarButton label="Link (Ctrl+K)" onClick={openLinkPanel}>
              <Link2 className="size-4" />
            </ToolbarButton>
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
            <label className="sr-only" htmlFor={fontSizeId}>
              Editor font size
            </label>
            <select
              id={fontSizeId}
              aria-label="Editor font size"
              title="Editor font size"
              value={fontSize}
              onChange={(event) =>
                changeFontSize(event.target.value as EditorFontSize)
              }
              className="h-8 rounded border border-line bg-surface px-1.5 text-xs font-semibold text-muted focus:outline-none focus:ring-2 focus:ring-orange-700"
            >
              <option value="sm">Small</option>
              <option value="md">Medium</option>
              <option value="lg">Large</option>
              <option value="xl">X-Large</option>
            </select>
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
            <ToolbarButton label="Quote" onClick={() => toggleLinePrefix("> ")}>
              <TextQuote className="size-4" />
            </ToolbarButton>
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
            <ToolbarButton label="Bulleted list" onClick={() => toggleLinePrefix("- ")}>
              <List className="size-4" />
            </ToolbarButton>
            <ToolbarButton label="Numbered list" onClick={toggleNumberedList}>
              <ListOrdered className="size-4" />
            </ToolbarButton>
            <ToolbarButton label="Horizontal rule" onClick={insertHorizontalRule}>
              <Minus className="size-4" />
            </ToolbarButton>
          </div>

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

          <textarea
            ref={setRefs}
            id={id}
            rows={rows}
            aria-label={ariaLabel}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            spellCheck={false}
            style={{ fontSize: EDITOR_FONT_SIZES[fontSize] }}
            className="block w-full resize-y bg-surface px-3 py-3 font-mono leading-relaxed text-ink placeholder:text-faint focus:outline-none"
          />
          <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-faint">
            <span>Markdown supported · paste a supported link on its own line to embed it</span>
            <span aria-live="polite">
              {value.length.toLocaleString()} characters
            </span>
          </div>
        </div>

        <div
          className={`min-w-0 ${mode === "preview" ? "block" : "hidden"}`}
          role="tabpanel"
          aria-label="Markdown preview"
        >
          <div className="flex items-center gap-1.5 border-b border-line bg-surface-muted px-3 py-2 text-xs font-semibold text-muted">
            <Eye className="size-4" />
            Live preview
          </div>
          <div
            className="max-h-[34rem] min-h-[14rem] overflow-y-auto px-3 py-3"
            style={
              {
                "--markdown-font-size": EDITOR_FONT_SIZES[fontSize],
              } as CSSProperties
            }
          >
            {value.trim() === "" ? (
              <p className="py-10 text-center text-sm text-faint">
                Nothing to preview yet. Start writing in the Write tab.
              </p>
            ) : (
              <MarkdownContent>{value}</MarkdownContent>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}