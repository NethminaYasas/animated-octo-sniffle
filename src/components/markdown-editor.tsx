"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
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
  ImagePlus,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { MarkdownContent } from "@/components/markdown-content";
import { quoteToHtml } from "@/lib/mentions";
import { clearQuotes, removeQuote, useQuotes } from "@/lib/quotes";
import { hasRichText } from "@/lib/rich-text";
import {
  MAX_ATTACHMENTS,
  isImageFile,
  uploadFilesToServer,
  type PendingAttachment,
} from "@/lib/upload-client";

const INLINE_SIZES = {
  sm: "Small",
  md: "Medium",
  lg: "Large",
} as const;

type InlineSize = keyof typeof INLINE_SIZES;

const MIN_IMAGE_WIDTH = 15;
const MAX_IMAGE_WIDTH = 100;
const DEFAULT_IMAGE_WIDTH = 50;

function clampImageWidth(width: number): number {
  return Math.min(MAX_IMAGE_WIDTH, Math.max(MIN_IMAGE_WIDTH, width));
}

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
  /** Enables drag-drop/paste image upload and the resize handle. */
  attachments?: PendingAttachment[];
  onAttachmentsAdded?: (added: PendingAttachment[]) => void;
  onAttachmentRemoved?: (url: string) => void;
  disabled?: boolean;
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
  attachments,
  onAttachmentsAdded,
  onAttachmentRemoved,
  disabled = false,
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

  // Drag-drop / paste image upload.
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const dragCountRef = useRef(0);
  const uploadingRef = useRef(false);
  const attachmentsRef = useRef<PendingAttachment[]>(attachments ?? []);
  useEffect(() => {
    attachmentsRef.current = attachments ?? [];
  }, [attachments]);
  // URLs inserted by this editor session. The parent adds them to
  // `attachments` too, but this keeps Preview correct before that lands.
  const [sessionImageUrls, setSessionImageUrls] = useState<Set<string>>(
    () => new Set(),
  );
  const sessionImageUrlsRef = useRef<Set<string>>(sessionImageUrls);
  useEffect(() => {
    sessionImageUrlsRef.current = sessionImageUrls;
  }, [sessionImageUrls]);

  // Image selection + resize handle.
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(
    null,
  );
  const selectedImageRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    selectedImageRef.current = selectedImage;
  }, [selectedImage]);
  const [handlePos, setHandlePos] = useState({ left: 0, top: 0 });
  const resizeDragRef = useRef<{
    startX: number;
    startWidthPx: number;
    containerWidth: number;
  } | null>(null);
  const onAttachmentsAddedRef = useRef(onAttachmentsAdded);
  const onAttachmentRemovedRef = useRef(onAttachmentRemoved);
  const disabledRef = useRef(disabled);
  useEffect(() => {
    onAttachmentsAddedRef.current = onAttachmentsAdded;
    onAttachmentRemovedRef.current = onAttachmentRemoved;
    disabledRef.current = disabled;
  }, [onAttachmentsAdded, onAttachmentRemoved, disabled]);

  const updateHandlePos = useCallback((img: HTMLImageElement) => {
    const rect = img.getBoundingClientRect();
    setHandlePos({ left: rect.right - 8, top: rect.bottom - 8 });
  }, []);

  const deselectImage = useCallback(() => {
    const current = selectedImageRef.current;
    if (current) {
      current.classList.remove("editor-image-selected");
    }
    selectedImageRef.current = null;
    setSelectedImage(null);
  }, []);

  const selectImage = useCallback(
    (img: HTMLImageElement) => {
      const previous = selectedImageRef.current;
      if (previous && previous !== img) {
        previous.classList.remove("editor-image-selected");
      }
      img.classList.add("editor-image-selected");
      selectedImageRef.current = img;
      setSelectedImage(img);
      updateHandlePos(img);
    },
    [updateHandlePos],
  );

  // Kept attached so the floating resize handle follows its image while the
  // page scrolls or the viewport changes.
  useEffect(() => {
    if (!selectedImage) {
      return;
    }
    const reposition = () => {
      const current = selectedImageRef.current;
      if (current) {
        updateHandlePos(current);
      }
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("load", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("load", reposition);
    };
  }, [selectedImage, updateHandlePos]);

  // If the value is replaced externally, a selected image may be gone.
  useEffect(() => {
    const current = selectedImageRef.current;
    if (current && !current.isConnected) {
      selectedImageRef.current = null;
      setSelectedImage(null);
    }
  }, [value]);

  // Apply stored `data-width` values as inline widths. The stored HTML is
  // canonical (data-width only); the live editor needs a real width to show
  // continuous drag handles, so we re-apply it after every sync.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) {
      return;
    }
    el.querySelectorAll("img[data-width]").forEach((node) => {
      const img = node as HTMLImageElement;
      const width = Number.parseInt(
        img.getAttribute("data-width") ?? "",
        10,
      );
      if (Number.isInteger(width) && width >= MIN_IMAGE_WIDTH && width <= MAX_IMAGE_WIDTH) {
        img.style.width = `${width}%`;
      }
    });
  }, [value]);

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

  const syncValue = useCallback(() => {
    const el = editorRef.current;

    if (!el) {
      return;
    }

    const text = el.textContent?.replace(/\u200B/g, "") ?? "";
    // `data-width` is the source of truth. The inline `style` width stays in
    // the value so it matches `innerHTML`; the server sanitiser and
    // `rehype-sanitize` both drop `style`.
    const html = el.innerHTML.replace(/\u200B/g, "");
    const hasContentElement = Array.from(el.querySelectorAll("*")).some(
      (node) => !["br", "p", "div"].includes(node.tagName.toLowerCase()),
    );

    onChange(text.trim() === "" && !hasContentElement ? "" : html);
  }, [onChange]);

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

  const insertImage = useCallback(
    (attachment: PendingAttachment) => {
      const el = editorRef.current;
      if (!el) {
        return;
      }

      const img = document.createElement("img");
      img.src = attachment.url;
      img.alt = attachment.fileName;
      img.setAttribute("data-width", String(DEFAULT_IMAGE_WIDTH));
      img.setAttribute("loading", "lazy");
      img.style.width = `${DEFAULT_IMAGE_WIDTH}%`;
      img.addEventListener("load", () => {
        if (selectedImageRef.current === img) {
          updateHandlePos(img);
        }
      });

      const range = getActiveRange();
      focusEditor();

      const after = document.createElement("p");
      after.innerHTML = "<br>";

      if (range) {
        restoreRange(range);
        range.deleteContents();
        range.insertNode(after);
        range.insertNode(img);
        const next = document.createRange();
        next.setStartAfter(after);
        next.collapse(true);
        restoreRange(next);
        savedRangeRef.current = next.cloneRange();
      } else {
        el.append(img, after);
      }

      deselectImage();
      syncValue();
      // Select what we just inserted so the author can resize it right away.
      selectImage(img);
    },
    [deselectImage, selectImage, syncValue, updateHandlePos],
  );

  const handleImageFiles = useCallback(
    async (files: File[]) => {
      if (disabledRef.current || uploadingRef.current) {
        return;
      }

      const images = files.filter(isImageFile);
      if (images.length === 0) {
        toast.error("Only images can be inserted into the editor", {
          description: "Use the paperclip button for audio and video.",
        });
        return;
      }

      const remaining =
        MAX_ATTACHMENTS - attachmentsRef.current.length;
      if (remaining <= 0) {
        toast.error("A post can have at most 8 attachments.");
        return;
      }

      uploadingRef.current = true;
      setUploadingImages(true);

      try {
        const { attachments: uploaded, errors } = await uploadFilesToServer(
          images,
          { max: remaining },
        );

        for (const error of errors) {
          toast.error("Couldn't upload the file", {
            description: error.error,
          });
        }

        if (uploaded.length === 0) {
          return;
        }

        setSessionImageUrls((current) => {
          const next = new Set(current);
          for (const attachment of uploaded) {
            next.add(attachment.url);
          }
          return next;
        });

        for (const attachment of uploaded) {
          insertImage(attachment);
        }

        onAttachmentsAddedRef.current?.(uploaded);
        toast.success(
          uploaded.length === 1
            ? "Image inserted"
            : `${uploaded.length} images inserted`,
        );
      } finally {
        uploadingRef.current = false;
        setUploadingImages(false);
      }
    },
    [insertImage],
  );

  const setCaretFromPoint = useCallback((clientX: number, clientY: number) => {
    const el = editorRef.current;
    if (!el || typeof document.caretRangeFromPoint !== "function") {
      return;
    }
    const range = document.caretRangeFromPoint(clientX, clientY);
    if (range && el.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  }, []);

  const handleDragEnter = (event: ReactDragEvent) => {
    if (disabled || uploadingImages || mode !== "write") {
      return;
    }
    if (!Array.from(event.dataTransfer?.types ?? []).includes("Files")) {
      return;
    }
    event.preventDefault();
    dragCountRef.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (event: ReactDragEvent) => {
    if (mode !== "write") {
      return;
    }
    if (!Array.from(event.dataTransfer?.types ?? []).includes("Files")) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = () => {
    dragCountRef.current = Math.max(0, dragCountRef.current - 1);
    if (dragCountRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (event: ReactDragEvent) => {
    event.preventDefault();
    dragCountRef.current = 0;
    setIsDragging(false);
    if (disabled || uploadingRef.current || mode !== "write") {
      return;
    }
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) {
      return;
    }
    setCaretFromPoint(event.clientX, event.clientY);
    void handleImageFiles(files);
  };

  const handleEditorClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const img = target?.closest("img");
    if (img && editorRef.current?.contains(img)) {
      selectImage(img);
    } else {
      deselectImage();
    }
  };

  const handleResizePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const img = selectedImageRef.current;
    const el = editorRef.current;
    if (!img || !el || disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
    resizeDragRef.current = {
      startX: event.clientX,
      startWidthPx: img.getBoundingClientRect().width,
      containerWidth: el.clientWidth,
    };
  };

  const handleResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const img = selectedImageRef.current;
    const drag = resizeDragRef.current;
    if (!img || !drag) {
      return;
    }
    event.preventDefault();
    const containerWidth = editorRef.current?.clientWidth ?? drag.containerWidth;
    const nextPx = drag.startWidthPx + (event.clientX - drag.startX);
    const percent = clampImageWidth(Math.round((nextPx / containerWidth) * 100));
    img.setAttribute("data-width", String(percent));
    img.style.width = `${percent}%`;
    updateHandlePos(img);
  };

  const handleResizePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeDragRef.current) {
      return;
    }
    event.preventDefault();
    resizeDragRef.current = null;
    syncValue();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Leave image mode on any key other than deletion so a later Backspace
    // while typing does not delete the previously selected image.
    if (
      selectedImageRef.current &&
      !["Delete", "Backspace", "Shift", "Control", "Meta", "Alt"].includes(
        event.key,
      )
    ) {
      deselectImage();
    }

    const selected = selectedImageRef.current;
    if (
      selected &&
      (event.key === "Delete" || event.key === "Backspace")
    ) {
      event.preventDefault();
      const src = selected.getAttribute("src") ?? "";
      deselectImage();
      selected.remove();
      if (src) {
        onAttachmentRemovedRef.current?.(src);
        setSessionImageUrls((current) => {
          const next = new Set(current);
          next.delete(src);
          return next;
        });
      }
      syncValue();
      return;
    }

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
    const items = Array.from(event.clipboardData?.items ?? []);
    const imageFiles = items
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);

    // Some sources (spreadsheets, office apps) put both text and an image
    // preview on the clipboard. Only upload when there is no text, so we
    // never silently drop pasted text.
    const pastedText = event.clipboardData?.getData("text/plain") ?? "";
    if (imageFiles.length > 0 && pastedText === "") {
      event.preventDefault();
      void handleImageFiles(imageFiles);
      return;
    }

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

  const previewUploadStates = (() => {
    const states: Record<string, "active"> = {};
    for (const attachment of attachments ?? []) {
      states[attachment.url] = "active";
    }
    for (const url of sessionImageUrls) {
      states[url] = "active";
    }
    return states;
  })();

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-line bg-surface"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-orange-700/10"
        >
          <div className="flex items-center gap-2 rounded-full border border-orange-700 bg-surface px-4 py-2 text-sm font-semibold text-orange-800 shadow-lg dark:text-orange-200">
            <ImagePlus className="size-4" />
            Drop images to insert
          </div>
        </div>
      ) : null}
      {uploadingImages ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-center gap-2 bg-surface/80 py-2 text-xs font-semibold text-muted backdrop-blur-sm"
        >
          <Loader2 className="size-3.5 animate-spin" />
          Uploading image…
        </div>
      ) : null}
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
            contentEditable={!disabled}
            suppressContentEditableWarning
            suppressHydrationWarning
            data-placeholder={placeholder}
            onInput={syncValue}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onClick={handleEditorClick}
            className="rich-editor block w-full whitespace-pre-wrap break-words bg-surface px-3 py-3 text-base leading-relaxed text-ink focus:outline-none"
            style={{ minHeight: `${Math.max(rows, 4) * 1.75}rem` }}
          />
          <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-faint">
            <span>
              {selectedImage
                ? "Drag the orange handle to resize. Press Delete to remove."
                : "Formatted text is saved with your post. Drop or paste images to insert them. Paste a supported link on its own line to embed it."}
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
            <MarkdownContent uploadStates={previewUploadStates}>
              {value}
            </MarkdownContent>
          )}
        </div>
      )}
      {mode === "write" && selectedImage ? (
        <div
          role="slider"
          aria-label="Resize image"
          aria-valuemin={MIN_IMAGE_WIDTH}
          aria-valuemax={MAX_IMAGE_WIDTH}
          aria-valuenow={Number.parseInt(
            selectedImage.getAttribute("data-width") ?? String(DEFAULT_IMAGE_WIDTH),
            10,
          )}
          tabIndex={0}
          className="editor-image-resize-handle"
          style={{ left: handlePos.left, top: handlePos.top }}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onKeyDown={(event) => {
            const target = selectedImageRef.current;
            if (!target || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) {
              return;
            }
            event.preventDefault();
            const current = Number.parseInt(
              target.getAttribute("data-width") ?? String(DEFAULT_IMAGE_WIDTH),
              10,
            );
            const delta = event.key === "ArrowRight" ? 5 : -5;
            const next = clampImageWidth(current + delta);
            target.setAttribute("data-width", String(next));
            target.style.width = `${next}%`;
            updateHandlePos(target);
            syncValue();
          }}
        />
      ) : null}
    </div>
  );
}
