"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { MessageSquare, Send, Reply } from "lucide-react";
import { Toaster, toast } from "sonner";

import { SiteHeader } from "@/components/site-header";
import { BoardNav } from "@/components/board-nav";
import { BackHomeButton } from "@/components/back-home-button";
import { MarkdownEditor } from "@/components/markdown-editor";
import { MarkdownContent } from "@/components/markdown-content";
import { PostActions } from "@/components/post-actions";
import { BOARDS } from "@/lib/boards";
import { SEED_POSTS } from "@/lib/seed-posts";
import {
  loadPosts,
  loadComments,
  saveComment,
  type SavedComment,
  type SavedPost,
} from "@/lib/feed-store";
import { formatRelativeTime } from "@/lib/time";

function ForumLayout({
  activeBoard,
  children,
}: {
  activeBoard?: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const handleBoardNavSelect = (boardId: string | null) => {
    router.push(boardId ? `/?board=${encodeURIComponent(boardId)}` : "/");
  };

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <div className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-6 px-3 py-3 sm:px-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <div className="hidden lg:block">
          <BoardNav activeBoard={activeBoard} onBoardChange={handleBoardNavSelect} />
        </div>

        <section className="min-w-0">{children}</section>
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

function ThreadContent() {
  const params = useParams<{ id: string }>();
  const postId = Number(params.id);

  const [post, setPost] = useState<SavedPost | null | undefined>(undefined);
  const [comments, setComments] = useState<SavedComment[]>([]);
  const [draft, setDraft] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!Number.isFinite(postId)) {
      setPost(null);
      return;
    }
    const found =
      loadPosts().find((candidate) => candidate.id === postId) ??
      SEED_POSTS.find((candidate) => candidate.id === postId) ??
      null;
    setPost(found);
    setComments(loadComments(postId));
  }, [postId]);

  const handleSubmitComment = () => {
    const body = draft.trim();
    if (body === "" || !post) return;

    const comment: SavedComment = {
      id: Date.now(),
      postId: post.id,
      author: "you",
      authorInitial: "y",
      body,
      createdAt: new Date().toISOString(),
    };

    if (!saveComment(comment)) {
      toast.error("Couldn't save the comment", {
        description: "Browser storage is unavailable or full.",
      });
      return;
    }

    setComments((current) => [...current, comment]);
    setDraft("");
  };

  const handleReply = (author: string) => {
    setDraft((current) => (current ? `${current}\n@${author} ` : `@${author} `));
    requestAnimationFrame(() => {
      const composer = composerRef.current;
      if (!composer) return;
      composer.focus();
      composer.setSelectionRange(composer.value.length, composer.value.length);
    });
  };

  return (
    <ForumLayout activeBoard={post?.boardId ?? undefined}>
      <BackHomeButton />

      {post === undefined ? (
        <div
          className="mt-4 rounded border border-line bg-surface px-4 py-10 text-center text-sm text-muted"
          aria-busy="true"
        >
          Loading…
        </div>
      ) : post === null ? (
        <div className="mt-4 rounded border border-line bg-surface px-4 py-10 text-center">
          <p className="text-sm font-semibold text-ink">Post not found</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted">
            It may have been created on another device or browser, since posts
            are stored locally for now.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-orange-700 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-800"
          >
            Back to feed
          </Link>
        </div>
      ) : (
          <>
            <article className="mt-4 rounded border border-line bg-surface p-4 sm:p-6">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted">
                <span className="grid size-5 place-items-center rounded-full bg-orange-700 text-[10px] font-bold text-white">
                  {post.boardInitial}
                </span>
                <Link
                  href="/"
                  className="font-semibold text-ink hover:underline"
                >
                  {post.boardName}
                </Link>
                <span>•</span>
                <span>Posted by {post.author}</span>
                <span>•</span>
                <span suppressHydrationWarning>
                  {now ? formatRelativeTime(post.createdAt, now) : "just now"}
                </span>
                {post.isPreview && (
                  <span className="ml-1 rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-800 dark:bg-orange-950/60 dark:text-orange-300">
                    Preview
                  </span>
                )}
              </div>
              <h1 className="mt-2 text-xl font-bold leading-7 text-ink sm:text-2xl">
                {post.title}
              </h1>
              {post.content.trim() !== "" ? (
                <div className="mt-4">
                  <MarkdownContent>{post.content}</MarkdownContent>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-line pt-3 text-[11px] font-semibold text-muted">
                <span className="flex items-center gap-1">
                  <MessageSquare className="size-3.5" />
                  {comments.length} {comments.length === 1 ? "comment" : "comments"}
                </span>
                <PostActions postId={post.id} title={post.title} body={post.content} />
              </div>
            </article>

            <section className="mt-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                {comments.length} {comments.length === 1 ? "comment" : "comments"}
              </h2>

              <form
                className="mt-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSubmitComment();
                }}
              >
                <MarkdownEditor
                  id="comment-body"
                  rows={5}
                  value={draft}
                  onChange={setDraft}
                  placeholder="What are your thoughts?"
                  ariaLabel="Comment body"
                  onSubmit={handleSubmitComment}
                  textareaRef={composerRef}
                />
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[11px] text-faint">Ctrl+Enter to comment</p>
                  <button
                    type="submit"
                    disabled={draft.trim() === ""}
                    className="flex items-center gap-1.5 rounded-full bg-orange-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Send className="size-3.5" />
                    Comment
                  </button>
                </div>
              </form>

              <ol className="mt-4 space-y-3">
                {comments.map((comment) => (
                  <li
                    key={comment.id}
                    className="rounded border border-line bg-surface p-3 sm:p-4"
                  >
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted">
                      <span className="grid size-5 place-items-center rounded-full bg-surface-muted text-[10px] font-bold text-muted">
                        {comment.authorInitial.toUpperCase()}
                      </span>
                      <span className="font-semibold text-ink">{comment.author}</span>
                      <span>•</span>
                      <span suppressHydrationWarning>
                        {now ? formatRelativeTime(comment.createdAt, now) : "just now"}
                      </span>
                    </div>
                    <div className="mt-2">
                      <MarkdownContent>{comment.body}</MarkdownContent>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11px] font-semibold text-muted">
                      <button
                        type="button"
                        onClick={() => handleReply(comment.author)}
                        className="flex items-center gap-1 transition-colors hover:text-ink"
                        aria-label={`Reply to ${comment.author}`}
                      >
                        <Reply className="size-3.5" />
                        Reply
                      </button>
                    </div>
                  </li>
                ))}
              </ol>

              {comments.length === 0 ? (
                <p className="mt-4 rounded border border-dashed border-line bg-surface px-4 py-6 text-center text-xs text-muted">
                  No comments yet — be the first to share an opinion.
                </p>
              ) : null}
            </section>
          </>
        )}
    </ForumLayout>
  );
}

function ThreadFallback() {
  return (
    <ForumLayout>
      <div aria-busy="true">
        <div className="h-4 w-28 rounded bg-surface-muted" />
        <div className="mt-4 h-64 rounded border border-line bg-surface" />
      </div>
    </ForumLayout>
  );
}

export default function ThreadPage() {
  return (
    <Suspense fallback={<ThreadFallback />}>
      <ThreadContent />
    </Suspense>
  );
}