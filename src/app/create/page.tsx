"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ChevronDown, Check, Send } from "lucide-react";
import { Toaster, toast } from "sonner";

import { SiteHeader } from "@/components/site-header";
import { BoardNav } from "@/components/board-nav";
import { MarkdownEditor } from "@/components/markdown-editor";
import { BOARDS } from "@/lib/boards";
import { savePost, type SavedPost } from "@/lib/feed-store";

function validBoardId(candidate: string | null): string {
  return BOARDS.some((board) => board.id === candidate) ? (candidate as string) : "general";
}

function BoardPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (boardId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = BOARDS.find((board) => board.id === value) ?? BOARDS[0];

  useEffect(() => {
    if (!open) return;

    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);
    return () => document.removeEventListener("mousedown", handleDocumentMouseDown);
  }, [open]);

  const handleListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const options = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    );
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      toggleRef.current?.focus();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      options[Math.min(currentIndex + 1, options.length - 1)]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      options[Math.max(currentIndex - 1, 0)]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      options[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      options[options.length - 1]?.focus();
    }
  };

  return (
    <div ref={wrapperRef} className="relative max-w-xs">
      <button
        ref={toggleRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby="board-picker-label board-picker-value"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-left transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-orange-600"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-orange-700 text-[10px] font-bold text-white">
          {selected.initial}
        </span>
        <span className="min-w-0 flex-1">
          <span id="board-picker-value" className="block truncate text-sm font-semibold text-ink">
            {selected.name}
          </span>
          <span className="block truncate text-[11px] text-muted">{selected.description}</span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <ul
          ref={listRef}
          role="listbox"
          aria-labelledby="board-picker-label"
          onKeyDown={handleListKeyDown}
          className="absolute z-20 mt-2 max-h-96 w-full min-w-64 overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-xl"
        >
          {BOARDS.map((board) => {
            const isSelected = board.id === value;
            return (
              <li key={board.id} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(board.id);
                    setOpen(false);
                    toggleRef.current?.focus();
                  }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-orange-600 ${
                    isSelected ? "bg-orange-50 dark:bg-orange-950/30" : "hover:bg-surface-muted"
                  }`}
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-muted text-[10px] font-bold text-muted">
                    {board.initial}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {board.name}
                    </span>
                    <span className="block truncate text-[11px] text-muted">
                      {board.description}
                    </span>
                  </span>
                  {isSelected ? (
                    <Check className="size-4 shrink-0 text-orange-700 dark:text-orange-400" aria-hidden="true" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function CreatePostForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialBoard = searchParams.get("board");

  const [boardId, setBoardId] = useState(() => validBoardId(initialBoard));
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    setBoardId(validBoardId(searchParams.get("board")));
  }, [searchParams]);

  const board = BOARDS.find((candidate) => candidate.id === boardId) ?? BOARDS[0];

  const handleSubmitPost = () => {
    const trimmedTitle = title.trim();
    if (trimmedTitle === "") {
      toast.error("Give it a title first");
      titleRef.current?.focus();
      return;
    }

    const post: SavedPost = {
      id: Date.now(),
      boardId: board.id,
      boardName: board.name,
      boardInitial: board.initial,
      author: "you",
      authorInitial: "y",
      title: trimmedTitle,
      content: content.trim(),
      createdAt: new Date().toISOString(),
      commentCount: 0,
      isPreview: false,
    };

    if (!savePost(post)) {
      toast.error("Couldn't save the post", {
        description: "Browser storage is unavailable or full.",
      });
      return;
    }

    toast.success("Posted!");
    router.push(`/t/${post.id}`);
  };

  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmitPost();
      }}
    >
      <div>
        <span id="board-picker-label" className="mb-1 block text-xs font-medium text-muted">
          Board
        </span>
        <BoardPicker value={boardId} onChange={setBoardId} />
      </div>

      <div>
        <label htmlFor="post-title" className="mb-1 block text-xs font-medium text-muted">
          Title
        </label>
        <input
          ref={titleRef}
          id="post-title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base font-semibold text-ink placeholder:font-normal placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-orange-700"
          placeholder="An interesting title"
          maxLength={300}
          autoComplete="off"
        />
      </div>

      <div>
        <label htmlFor="post-body" className="mb-1 block text-xs font-medium text-muted">
          Body <span className="font-normal text-faint">(optional)</span>
        </label>
        <MarkdownEditor
          id="post-body"
          rows={14}
          value={content}
          onChange={setContent}
          placeholder="Say something interesting…"
          ariaLabel="Post body"
          onSubmit={handleSubmitPost}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <Link
          href="/"
          className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-ink"
        >
          Cancel
        </Link>
        <div className="flex items-center gap-3">
          <p className="hidden text-[11px] text-faint sm:block">Ctrl+Enter to post</p>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-full bg-orange-700 px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
          >
            <Send className="size-4" />
            Post
          </button>
        </div>
      </div>
    </form>
  );
}

export default function CreatePostPage() {
  const router = useRouter();

  const handleBoardNavSelect = (boardId: string | null) => {
    router.push(boardId ? `/?board=${encodeURIComponent(boardId)}` : "/");
  };

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <div className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-6 px-3 py-3 sm:px-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <div className="hidden lg:block">
          <BoardNav activeBoard={undefined} onBoardChange={handleBoardNavSelect} />
        </div>

        <section className="min-w-0">
          <div className="border-b border-line pb-3">
            <h1 className="text-lg font-semibold tracking-tight text-ink">
              Create a post
            </h1>
            <p className="mt-1 text-sm text-muted">
              Posts and comments are saved on this device until accounts and the database
              are added. Markdown is supported.
            </p>
          </div>

          <Suspense fallback={<p className="mt-6 text-sm text-muted">Loading…</p>}>
            <CreatePostForm />
          </Suspense>
        </section>
      </div>

      <Toaster
        position="top-right"
        theme="system"
        toastOptions={{
          classNames: {
            toast: "rounded-lg border border-line bg-surface text-ink",
            description: "text-muted",
            actionButton: "bg-orange-700 hover:bg-orange-800",
            cancelButton: "bg-surface-muted hover:bg-surface",
          },
        }}
      />
    </main>
  );
}