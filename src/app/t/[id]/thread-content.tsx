"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MessageSquare, Reply, Send, TextQuote, Trash, X } from "lucide-react";
import { Toaster, toast } from "sonner";

import { BoardNav } from "@/components/board-nav";
import { BackHomeButton } from "@/components/back-home-button";
import { LoginGate } from "@/components/login-gate";
import { MarkdownContent } from "@/components/markdown-content";
import { MarkdownEditor } from "@/components/markdown-editor";
import { PostActions } from "@/components/post-actions";
import { ReactionBar } from "@/components/reaction-bar";
import { normaliseUsername } from "@/lib/auth/validation";
import { BOARDS } from "@/lib/boards";
import {
  deleteComment,
  deletePost,
  isPostDeleted,
  loadComments,
  loadPosts,
  saveComment,
  type SavedComment,
  type SavedPost,
} from "@/lib/feed-store";
import {
  excerptFromHtml,
  extractMentions,
  extractQuoteAuthors,
  htmlToText,
} from "@/lib/mentions";
import { addNotification, type NotificationKind } from "@/lib/notifications";
import { addQuote } from "@/lib/quotes";
import { hasRichText } from "@/lib/rich-text";
import { SEED_POSTS } from "@/lib/seed-posts";
import { formatRelativeTime } from "@/lib/time";
import { useAuthUser } from "@/lib/use-auth-user";

type ReplyTarget = { id: number; author: string };

type SelectionQuote = {
  text: string;
  author: string;
  commentId: number;
  top: number;
  left: number;
};

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
      <div className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-6 px-3 py-3 sm:px-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
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

export default function ThreadPageClient() {
  const [postId, setPostId] = useState<number | null>(null);

  useEffect(() => {
    const match = window.location.pathname.match(/^\/t\/(\d+)/);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the thread id from the path after mount
    setPostId(match ? Number(match[1]) : Number.NaN);
  }, []);

  if (postId === null) {
    return <ThreadFallback />;
  }

  return <ThreadContent postId={postId} />;
}

export function ThreadContent({ postId }: { postId: number }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();
  const username = user?.username ? normaliseUsername(user.username) : null;
  const isBanned = user?.isBanned ?? false;
  const canModerate =
    !isBanned && (user?.role === "admin" || user?.role === "moderator");
  const [post, setPost] = useState<SavedPost | null | undefined>(undefined);
  const [comments, setComments] = useState<SavedComment[]>([]);
  const [draft, setDraft] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [selection, setSelection] = useState<SelectionQuote | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const setComposer = useCallback((element: HTMLDivElement | null) => {
    composerRef.current = element;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start the relative-time clock on the client
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!Number.isFinite(postId) || isPostDeleted(postId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the route id is only known after mount
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

  // Hide the floating Quote button when the selection is abandoned.
  useEffect(() => {
    if (!selection) {
      return;
    }

    const hide = (event: Event) => {
      if (event instanceof MouseEvent) {
        const target = event.target as HTMLElement | null;

        if (target?.closest("[data-quote-selection]")) {
          return;
        }
      }

      setSelection(null);
    };

    document.addEventListener("mousedown", hide);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);

    return () => {
      document.removeEventListener("mousedown", hide);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [selection]);

  const scrollToComposer = () => {
    window.setTimeout(() => {
      composerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 0);
  };

  const notifyComment = (comment: SavedComment, body: string) => {
    if (!post) {
      return;
    }

    const author = username ?? "you";
    const recipients = new Map<string, NotificationKind>();

    if (replyTarget) {
      recipients.set(normaliseUsername(replyTarget.author), "reply");
    } else if (post.author) {
      recipients.set(normaliseUsername(post.author), "reply");
    }

    for (const quoted of extractQuoteAuthors(body)) {
      if (!recipients.has(quoted)) {
        recipients.set(quoted, "quote");
      }
    }

    for (const mentioned of extractMentions(body)) {
      if (!recipients.has(mentioned)) {
        recipients.set(mentioned, "mention");
      }
    }

    recipients.delete(author);

    const excerpt = excerptFromHtml(body);

    for (const [recipient, kind] of recipients) {
      if (!recipient) {
        continue;
      }

      addNotification({
        recipient,
        actor: author,
        kind,
        threadId: post.id,
        threadTitle: post.title,
        commentId: comment.id,
        excerpt,
      });
    }
  };

  const handleSubmitComment = () => {
    const body = draft.trim();
    if (!user || user.isBanned || !hasRichText(body) || !post) return;

    const authorName = username ?? "you";

    const comment: SavedComment = {
      id: Date.now(),
      postId: post.id,
      author: authorName,
      authorInitial: authorName.slice(0, 1).toLowerCase() || "y",
      body,
      createdAt: new Date().toISOString(),
      replyToId: replyTarget?.id ?? null,
      replyToAuthor: replyTarget?.author ?? null,
    };

    if (!saveComment(comment)) {
      toast.error("Couldn't save the comment", {
        description: "Browser storage is unavailable or full.",
      });
      return;
    }

    setComments((current) => [...current, comment]);
    setDraft("");
    setReplyTarget(null);
    notifyComment(comment, body);
  };

  const handleReply = (comment: SavedComment) => {
    if (!user || user.isBanned || !post) {
      return;
    }

    const quote = addQuote({
      author: comment.author,
      text: htmlToText(comment.body),
      sourceType: "comment",
      sourceId: comment.id,
      threadId: post.id,
    });

    setReplyTarget({ id: comment.id, author: comment.author });
    toast.success(`Replying to @${comment.author}`, {
      description: quote
        ? "The quote is in your clipboard. Paste it from the editor."
        : "Write your reply below.",
    });
    scrollToComposer();
  };

  const captureSelection = () => {
    if (!user || user.isBanned) {
      return;
    }

    const current = window.getSelection();

    if (!current || current.isCollapsed || current.rangeCount === 0) {
      setSelection(null);
      return;
    }

    const range = current.getRangeAt(0);
    const anchor = range.commonAncestorContainer;
    const element =
      anchor.nodeType === Node.ELEMENT_NODE
        ? (anchor as Element)
        : anchor.parentElement;
    const commentElement = element?.closest<HTMLElement>("[data-comment-id]");

    if (!commentElement) {
      setSelection(null);
      return;
    }

    const commentId = Number(commentElement.dataset.commentId);
    const author = commentElement.dataset.commentAuthor ?? "";
    const text = current.toString().replace(/\s+/g, " ").trim();

    if (!text || !Number.isFinite(commentId) || !author) {
      setSelection(null);
      return;
    }

    const rect = range.getBoundingClientRect();

    setSelection({
      text: text.slice(0, 600),
      author,
      commentId,
      top: Math.min(rect.bottom + 8, window.innerHeight - 52),
      left: Math.min(
        Math.max(8, rect.left + rect.width / 2 - 48),
        window.innerWidth - 110,
      ),
    });
  };

  const handleQuoteSelection = () => {
    if (!selection || !user || user.isBanned || !post) {
      return;
    }

    const quote = addQuote({
      author: selection.author,
      text: selection.text,
      sourceType: "comment",
      sourceId: selection.commentId,
      threadId: post.id,
    });

    setSelection(null);
    window.getSelection()?.removeAllRanges();

    if (!quote) {
      toast.error("Couldn't copy the selected text");
      return;
    }

    toast.success(`Quote from @${selection.author} copied`, {
      description: "Paste it from the editor.",
    });
    scrollToComposer();
  };

  const handleDeletePost = () => {
    if (!post || !canModerate) {
      return;
    }

    if (!window.confirm("Delete this post? It will be hidden from the forum.")) {
      return;
    }

    if (!deletePost(post.id)) {
      toast.error("Couldn't delete the post", {
        description: "Browser storage is unavailable or full.",
      });
      return;
    }

    toast.success("Post deleted");
    router.push("/");
    router.refresh();
  };

  const handleDeleteComment = (comment: SavedComment) => {
    if (!canModerate) {
      return;
    }

    if (!window.confirm("Delete this comment? It will be hidden from the thread.")) {
      return;
    }

    if (!deleteComment(comment.id)) {
      toast.error("Couldn't delete the comment", {
        description: "Browser storage is unavailable or full.",
      });
      return;
    }

    setComments((current) =>
      current.filter((item) => item.id !== comment.id),
    );
    toast.success("Comment deleted");
  };

  const board = post ? BOARDS.find((candidate) => candidate.id === post.boardId) : undefined;
  const BoardIcon = board?.icon;

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
              <span className="grid size-5 place-items-center rounded-full bg-orange-700 text-white">
                {BoardIcon ? (
                  <BoardIcon className="size-3" aria-hidden="true" />
                ) : (
                  <span className="text-[10px] font-bold">{post.boardInitial}</span>
                )}
              </span>
              <Link href="/" className="font-semibold text-ink hover:underline">
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
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-[11px] font-semibold text-muted">
              <span className="flex items-center gap-1">
                <MessageSquare className="size-3.5" />
                {comments.length}{" "}
                {comments.length === 1 ? "comment" : "comments"}
              </span>
              <ReactionBar
                targetType="post"
                targetId={post.id}
                author={post.author}
                currentUsername={username}
              />
              <PostActions
                postId={post.id}
                title={post.title}
                body={post.content}
              />
              {canModerate ? (
                <button
                  type="button"
                  onClick={handleDeletePost}
                  aria-label="Delete post"
                  title="Delete post"
                  className="flex items-center gap-1 text-red-600 transition-colors hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  <Trash className="size-3.5" />
                  Delete
                </button>
              ) : null}
            </div>
          </article>

          <section className="mt-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {comments.length}{" "}
              {comments.length === 1 ? "comment" : "comments"}
            </h2>

            {comments.length === 0 ? (
              <p className="mt-3 rounded border border-dashed border-line bg-surface px-4 py-6 text-center text-xs text-muted">
                No comments yet — be the first to share an opinion.
              </p>
            ) : (
              <ol
                className="mt-3 space-y-3"
                onMouseUp={() => window.setTimeout(captureSelection, 0)}
                onTouchEnd={() => window.setTimeout(captureSelection, 50)}
              >
                {comments.map((comment) => (
                  <li
                    key={comment.id}
                    id={`comment-${comment.id}`}
                    data-comment-id={comment.id}
                    data-comment-author={comment.author}
                    className="rounded border border-line bg-surface p-3 sm:p-4"
                  >
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted">
                      <span className="grid size-5 place-items-center rounded-full bg-surface-muted text-[10px] font-bold text-muted">
                        {comment.authorInitial.toUpperCase()}
                      </span>
                      <span className="font-semibold text-ink">
                        {comment.author}
                      </span>
                      <span>•</span>
                      <span suppressHydrationWarning>
                        {now
                          ? formatRelativeTime(comment.createdAt, now)
                          : "just now"}
                      </span>
                    </div>

                    {comment.replyToAuthor ? (
                      <p className="mt-1.5 text-[11px] text-muted">
                        Replying to{" "}
                        <span className="font-semibold text-ink">
                          @{comment.replyToAuthor}
                        </span>
                      </p>
                    ) : null}

                    <div className="mt-2">
                      <MarkdownContent>{comment.body}</MarkdownContent>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <ReactionBar
                        targetType="comment"
                        targetId={comment.id}
                        author={comment.author}
                        currentUsername={username}
                      />
                      {user || canModerate ? (
                        <div className="flex items-center gap-3 text-[11px] font-semibold text-muted">
                          {user && !user.isBanned ? (
                            <button
                              type="button"
                              onClick={() => handleReply(comment)}
                              className="flex items-center gap-1 transition-colors hover:text-ink"
                              aria-label={`Reply to ${comment.author}`}
                            >
                              <Reply className="size-3.5" />
                              Reply
                            </button>
                          ) : null}
                          {canModerate ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(comment)}
                              className="flex items-center gap-1 text-red-600 transition-colors hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                              aria-label={`Delete comment by ${comment.author}`}
                              title="Delete comment"
                            >
                              <Trash className="size-3.5" />
                              Delete
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}

            <div className="mt-5 border-t border-line pt-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Add a comment
              </h3>

              {authLoading ? (
                <p className="mt-3 text-sm text-muted">
                  Checking your account...
                </p>
              ) : user?.isBanned ? (
                <div className="mt-3 rounded-lg border border-line bg-surface px-4 py-5 text-center">
                  <p className="text-sm font-semibold text-ink">
                    Your account is banned
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    You can still read and react, but you cannot comment or
                    start a post.
                  </p>
                </div>
              ) : user ? (
                <form
                  className="mt-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleSubmitComment();
                  }}
                >
                  {replyTarget ? (
                    <div className="mb-2 flex items-center gap-2 rounded border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] text-orange-900 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200">
                      <Reply className="size-3.5 shrink-0" />
                      <span>
                        Replying to{" "}
                        <strong>@{replyTarget.author}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setReplyTarget(null)}
                        aria-label="Cancel reply"
                        title="Cancel reply"
                        className="ml-auto grid size-5 shrink-0 place-items-center rounded hover:bg-orange-100 dark:hover:bg-orange-900/40"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ) : null}

                  <MarkdownEditor
                    id="comment-body"
                    rows={5}
                    value={draft}
                    onChange={setDraft}
                    placeholder="What are your thoughts?"
                    ariaLabel="Comment body"
                    onSubmit={handleSubmitComment}
                    onEditorReady={setComposer}
                    quoteClipboard
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-[11px] text-faint">
                      Ctrl+Enter to comment
                    </p>
                    <button
                      type="submit"
                      disabled={!hasRichText(draft)}
                      className="flex items-center gap-1.5 rounded-full bg-orange-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Send className="size-3.5" />
                      Comment
                    </button>
                  </div>
                </form>
              ) : (
                <LoginGate
                  next={`/t/${post.id}`}
                  title="Log in to comment"
                  description="Only members can reply to threads."
                />
              )}
            </div>
          </section>

          {selection ? (
            <button
              type="button"
              data-quote-selection
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleQuoteSelection}
              style={{ top: selection.top, left: selection.left }}
              className="fixed z-50 flex items-center gap-1 rounded-full border border-orange-700 bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-orange-800 shadow-lg transition-colors hover:bg-orange-50 dark:border-orange-500 dark:text-orange-300 dark:hover:bg-orange-950/40"
            >
              <TextQuote className="size-3.5" />
              Quote
            </button>
          ) : null}
        </>
      )}
    </ForumLayout>
  );
}

export function ThreadFallback() {
  return (
    <ForumLayout>
      <div aria-busy="true">
        <div className="h-4 w-28 rounded bg-surface-muted" />
        <div className="mt-4 h-64 rounded border border-line bg-surface" />
      </div>
    </ForumLayout>
  );
}
