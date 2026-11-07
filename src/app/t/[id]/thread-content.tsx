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
import { MessageSquare, Reply, Send, TextQuote, X } from "lucide-react";
import { Toaster, toast } from "sonner";

import { BackHomeButton } from "@/components/back-home-button";
import { ForumShell } from "@/components/forum-shell";
import { UploadAttachButton, type PendingAttachment } from "@/components/upload-attach-button";
import { AttachmentGallery } from "@/components/attachment-gallery";
import { LoginGate } from "@/components/login-gate";
import { MarkdownContent } from "@/components/markdown-content";
import { MarkdownEditor } from "@/components/markdown-editor";
import { ModerationControls } from "@/components/moderation-controls";
import { PostActions } from "@/components/post-actions";
import { ReactionBar } from "@/components/reaction-bar";
import { ReportButton } from "@/components/report-button";
import {
  TurnstileField,
  type TurnstileFieldHandle,
} from "@/components/turnstile-field";
import { UserHoverCard } from "@/components/user-hover-card";
import { BOARDS } from "@/lib/boards";
import { createComment, loadMoreComments } from "@/lib/forum/actions";
import type {
  OpeningPostView,
  ThreadComment,
  ThreadReactions,
  ThreadView,
  ThreadViewer,
} from "@/lib/forum/types";
import { htmlToText } from "@/lib/mentions";
import { addQuote } from "@/lib/quotes";
import { emptyReactionCounts } from "@/lib/reactions";
import { hasRichText } from "@/lib/rich-text";
import { formatRelativeTime } from "@/lib/time";
import type { Attachment, UploadState } from "@/lib/attachments";

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
  return (
    <>
      <ForumShell activeBoard={activeBoard}>{children}</ForumShell>

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
    </>
  );
}

function reactionFor(reactions: ThreadReactions, postId: number) {
  return (
    reactions[postId] ?? {
      counts: emptyReactionCounts(),
      mine: null,
    }
  );
}

function mergeComments(
  current: ThreadComment[],
  incoming: ThreadComment[],
): ThreadComment[] {
  const seen = new Set(current.map((comment) => comment.id));
  return [...current, ...incoming.filter((comment) => !seen.has(comment.id))];
}

function deletionNote(
  deletedBy: string | null,
  deletedReason: string | null,
): string {
  const who = deletedBy ? `@${deletedBy}` : "a moderator";
  const why = deletedReason ? `: ${deletedReason}` : "";
  return `Deleted by ${who}${why}`;
}

export default function ThreadPageClient({
  thread,
  openingPost,
  comments: initialComments,
  reactions: initialReactions,
  nextCommentCursor: initialNextCursor,
  commentTotal,
  viewer,
  initialAttachments,
  uploadStates: initialUploadStates,
}: {
  thread: ThreadView;
  openingPost: OpeningPostView;
  comments: ThreadComment[];
  reactions: ThreadReactions;
  nextCommentCursor: string | null;
  commentTotal: number;
  viewer: ThreadViewer | null;
  initialAttachments: Record<number, Attachment[]>;
  uploadStates: Record<string, UploadState>;
}) {
  const router = useRouter();
  const [comments, setComments] = useState(initialComments);
  const [reactions, setReactions] = useState(initialReactions);
  const [attachmentsByPost, setAttachmentsByPost] =
    useState(initialAttachments);
  const [uploadStates, setUploadStates] = useState(initialUploadStates);
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [totalComments, setTotalComments] = useState(commentTotal);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [selection, setSelection] = useState<SelectionQuote | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const captchaRef = useRef<TurnstileFieldHandle>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const jumpStartedRef = useRef(false);
  const setComposer = useCallback((element: HTMLDivElement | null) => {
    composerRef.current = element;
  }, []);

  const setAttachmentStatus = useCallback(
    (id: string, status: "active" | "removed") => {
      setAttachmentsByPost((current) => {
        const next: Record<number, Attachment[]> = {};

        for (const [postId, list] of Object.entries(current)) {
          next[Number(postId)] = list.map((attachment) =>
            attachment.id === id ? { ...attachment, status } : attachment,
          );
        }

        return next;
      });

      setUploadStates((current) => {
        const next = { ...current };

        for (const list of Object.values(attachmentsByPost)) {
          for (const attachment of list) {
            if (attachment.id === id && attachment.url) {
              next[attachment.url] = status;
            }
          }
        }

        return next;
      });
    },
    [attachmentsByPost],
  );

  const isNewMember = viewer?.role === "new_member";
  const isStaff = Boolean(
    viewer &&
      !viewer.isBanned &&
      (viewer.role === "moderator" || viewer.role === "admin"),
  );
  const canPost = Boolean(
    viewer &&
      !viewer.isBanned &&
      !thread.isLocked &&
      !thread.isDeleted &&
      !openingPost.isDeleted,
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start the relative-time clock on the client
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

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

  // Notifications link to #comment-<id>. If that comment is beyond the first
  // page, load forward until it is present, then scroll to it. The page cap
  // prevents a crafted hash from fetching an unbounded thread.
  useEffect(() => {
    if (jumpStartedRef.current) {
      return;
    }

    const match = /^#comment-(\d+)$/.exec(window.location.hash);

    if (!match) {
      return;
    }

    const targetId = Number(match[1]);

    if (!Number.isSafeInteger(targetId) || targetId <= 0) {
      return;
    }

    const scrollToTarget = () => {
      document
        .getElementById(`comment-${targetId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    if (document.getElementById(`comment-${targetId}`)) {
      scrollToTarget();
      return;
    }

    if (!initialNextCursor) {
      return;
    }

    jumpStartedRef.current = true;
    let cancelled = false;
    let cursor: string | null = initialNextCursor;
    const collected: ThreadComment[] = [];
    const reactionUpdates: ThreadReactions = {};
    const attachmentUpdates: Record<number, Attachment[]> = {};
    const stateUpdates: Record<string, UploadState> = {};

    const run = async () => {
      for (let page = 0; page < 20 && cursor; page += 1) {
        const result = await loadMoreComments({
          threadId: thread.id,
          cursor,
        });

        if (!result.ok) {
          break;
        }

        collected.push(...result.comments);
        Object.assign(reactionUpdates, result.reactions);
        Object.assign(attachmentUpdates, result.attachments);
        Object.assign(stateUpdates, result.uploadStates);
        cursor = result.nextCursor;

        if (result.comments.some((comment) => comment.id === targetId)) {
          break;
        }
      }

      if (cancelled) {
        return;
      }

      setComments((current) => mergeComments(current, collected));
      setReactions((current) => ({ ...current, ...reactionUpdates }));
      setAttachmentsByPost((current) => ({ ...current, ...attachmentUpdates }));
      setUploadStates((current) => ({ ...current, ...stateUpdates }));
      setNextCursor(cursor);
      window.setTimeout(scrollToTarget, 60);
    };

    void run();

    return () => {
      cancelled = true;
      jumpStartedRef.current = false;
    };
  }, [initialNextCursor, thread.id]);

  const scrollToComposer = () => {
    window.setTimeout(() => {
      composerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 0);
  };

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) {
      return;
    }

    setLoadingMore(true);

    try {
      const result = await loadMoreComments({
        threadId: thread.id,
        cursor: nextCursor,
      });

      if (!result.ok) {
        toast.error("Couldn't load more comments", {
          description: result.error,
        });
        return;
      }

      setComments((current) => mergeComments(current, result.comments));
      setReactions((current) => ({ ...current, ...result.reactions }));
      setAttachmentsByPost((current) => ({
        ...current,
        ...result.attachments,
      }));
      setUploadStates((current) => ({ ...current, ...result.uploadStates }));
      setNextCursor(result.nextCursor);
    } catch {
      toast.error("Couldn't load more comments", {
        description: "Check your connection and try again.",
      });
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!viewer || !canPost || submitting) {
      return;
    }

    const body = draft.trim();

    if (!hasRichText(body)) {
      return;
    }

    if (isNewMember && !captchaToken) {
      toast.error("Complete the CAPTCHA before commenting");
      return;
    }

    setSubmitting(true);

    try {
      const result = await createComment({
        threadId: thread.id,
        content: body,
        replyToPostId: replyTarget?.id ?? null,
        captchaToken,
        uploadIds: pendingAttachments.map((attachment) => attachment.id),
      });

      if (!result.ok) {
        toast.error("Couldn't post the comment", {
          description: result.error,
        });
        captchaRef.current?.reset();
        return;
      }

      const seededAttachments: Attachment[] = pendingAttachments.map(
        (attachment) => ({
          id: attachment.id,
          postId: result.comment.id,
          url: attachment.url,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          status: "active",
          removalReason: null,
          removedByUsername: null,
        }),
      );

      if (seededAttachments.length > 0 && !result.attachmentsFailed) {
        setAttachmentsByPost((current) => ({
          ...current,
          [result.comment.id]: seededAttachments,
        }));
        setUploadStates((current) => {
          const next = { ...current };

          for (const attachment of seededAttachments) {
            if (attachment.url) {
              next[attachment.url] = "active";
            }
          }

          return next;
        });
      }

      if (result.attachmentsFailed) {
        toast.warning("Comment posted, but the attachments couldn't be linked");
      }

      if (!nextCursor) {
        setComments((current) => [
          ...current,
          {
            ...result.comment,
            isDeleted: false,
            deletedReason: null,
            deletedBy: null,
          },
        ]);
      } else {
        toast.success("Comment posted", {
          description: "Load more comments to see it in order.",
        });
      }

      setTotalComments((current) => current + 1);
      setDraft("");
      setReplyTarget(null);
      setPendingAttachments([]);
      captchaRef.current?.reset();
      router.refresh();
    } catch {
      toast.error("Couldn't reach the server", {
        description: "Check your connection and try again.",
      });
      captchaRef.current?.reset();
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = (comment: ThreadComment) => {
    if (!canPost || comment.isDeleted) {
      return;
    }

    const quote = addQuote({
      author: comment.author,
      text: htmlToText(comment.body),
      sourceType: "comment",
      sourceId: comment.id,
      threadId: thread.id,
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
    if (!canPost) {
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
    if (!selection || !canPost) {
      return;
    }

    const quote = addQuote({
      author: selection.author,
      text: selection.text,
      sourceType: "comment",
      sourceId: selection.commentId,
      threadId: thread.id,
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

  const board = BOARDS.find((candidate) => candidate.id === thread.boardId);
  const BoardIcon = board?.icon;
  const openingReactions = reactionFor(reactions, openingPost.id);

  return (
    <ForumLayout activeBoard={thread.boardId}>
      <BackHomeButton />

      {thread.isDeleted ? (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-semibold">This thread is deleted</p>
          <p className="mt-1 text-xs">
            {deletionNote(thread.deletedBy, thread.deletedReason)}. Staff can
            still read and restore it.
          </p>
        </div>
      ) : null}

      <article
        id={`comment-${openingPost.id}`}
        className={`mt-4 rounded border bg-surface p-4 sm:p-6 ${
          openingPost.isDeleted ? "border-amber-300" : "border-line"
        }`}
      >
        {openingPost.isDeleted ? (
          <p className="mb-3 rounded bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {deletionNote(openingPost.deletedBy, openingPost.deletedReason)}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted">
          <span className="grid size-5 place-items-center rounded-full bg-orange-700 text-white">
            {BoardIcon ? (
              <BoardIcon className="size-3" aria-hidden="true" />
            ) : (
              <span className="text-[10px] font-bold">
                {thread.boardName.slice(0, 1)}
              </span>
            )}
          </span>
          <Link href="/" className="font-semibold text-ink hover:underline">
            {thread.boardName}
          </Link>
          <span>•</span>
          <span>
            Posted by{" "}
            {thread.author === "unknown" ? (
              <span className="font-semibold text-ink">deleted member</span>
            ) : (
              <UserHoverCard
                username={thread.author}
                initial={thread.authorInitial}
              />
            )}
          </span>
          <span>•</span>
          <span suppressHydrationWarning>
            {now ? formatRelativeTime(thread.createdAt, now) : "just now"}
          </span>
          {thread.isLocked ? (
            <span className="ml-1 rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
              Locked
            </span>
          ) : null}
        </div>
        <h1 className="mt-2 text-xl font-bold leading-7 text-ink sm:text-2xl">
          {thread.title}
        </h1>
        {openingPost.body.trim() !== "" ? (
          <div className="mt-4">
            <MarkdownContent uploadStates={uploadStates}>
              {openingPost.body}
            </MarkdownContent>
            <AttachmentGallery
              attachments={attachmentsByPost[openingPost.id] ?? []}
              isStaff={isStaff}
              currentUserId={viewer?.id ?? null}
              onStatusChange={setAttachmentStatus}
            />
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-[11px] font-semibold text-muted">
          <span className="flex items-center gap-1">
            <MessageSquare className="size-3.5" />
            {totalComments} {totalComments === 1 ? "comment" : "comments"}
          </span>
          {!thread.isDeleted && !openingPost.isDeleted ? (
            <ReactionBar
              postId={openingPost.id}
              authorId={openingPost.authorId}
              currentUserId={viewer?.id ?? null}
              initialCounts={openingReactions.counts}
              initialMine={openingReactions.mine}
            />
          ) : null}
          <PostActions
            postId={thread.id}
            title={thread.title}
            body={openingPost.body}
          />
          <ReportButton
            targetType="post"
            postId={openingPost.id}
            authorId={openingPost.authorId}
            currentUserId={viewer?.id ?? null}
            label="Report post"
          />
          <ModerationControls
            isStaff={isStaff}
            target={{
              type: "thread",
              id: thread.id,
              title: thread.title,
              boardId: thread.boardId,
              isDeleted: thread.isDeleted,
              isLocked: thread.isLocked,
              isPinned: thread.isPinned,
            }}
            attachments={attachmentsByPost[openingPost.id] ?? []}
          />
        </div>
      </article>

      <section className="mt-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Showing {comments.length} of {totalComments}{" "}
          {totalComments === 1 ? "comment" : "comments"}
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
            {comments.map((comment) => {
              const commentReactions = reactionFor(reactions, comment.id);

              return (
                <li
                  key={comment.id}
                  id={`comment-${comment.id}`}
                  data-comment-id={comment.id}
                  data-comment-author={comment.author}
                  className={`rounded border bg-surface p-3 sm:p-4 ${
                    comment.isDeleted ? "border-amber-300" : "border-line"
                  }`}
                >
                  {comment.isDeleted ? (
                    <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                      {deletionNote(comment.deletedBy, comment.deletedReason)}
                    </p>
                  ) : null}

                  <div className="flex items-start gap-3">
                    <UserHoverCard
                      username={comment.author}
                      initial={comment.authorInitial}
                      className="flex w-16 shrink-0 flex-col items-center gap-1.5 sm:w-20"
                    >
                      <span
                        className="grid size-11 place-items-center rounded-full bg-orange-700 text-base font-bold uppercase text-white sm:size-12"
                        aria-hidden="true"
                      >
                        {comment.authorInitial}
                      </span>
                      <span className="w-full break-words text-center text-xs font-semibold leading-snug text-ink sm:text-sm">
                        {comment.author}
                      </span>
                    </UserHoverCard>

                    <div className="min-w-0 flex-1">
                      <div
                        className="text-[11px] text-muted"
                        suppressHydrationWarning
                      >
                        {now
                          ? formatRelativeTime(comment.createdAt, now)
                          : "just now"}
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
                        <MarkdownContent uploadStates={uploadStates}>
                          {comment.body}
                        </MarkdownContent>
                        <AttachmentGallery
                          attachments={attachmentsByPost[comment.id] ?? []}
                          isStaff={isStaff}
                          currentUserId={viewer?.id ?? null}
                          onStatusChange={setAttachmentStatus}
                        />
                      </div>

                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        {!comment.isDeleted ? (
                          <ReactionBar
                            postId={comment.id}
                            authorId={comment.authorId}
                            currentUserId={viewer?.id ?? null}
                            initialCounts={commentReactions.counts}
                            initialMine={commentReactions.mine}
                          />
                        ) : null}
                        {viewer ? (
                          <div className="flex items-center gap-3 text-[11px] font-semibold text-muted">
                            {canPost && !comment.isDeleted ? (
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
                            <ReportButton
                              targetType="post"
                              postId={comment.id}
                              authorId={comment.authorId}
                              currentUserId={viewer.id}
                              label="Report comment"
                            />
                            <ModerationControls
                              isStaff={isStaff}
                              target={{
                                type: "post",
                                id: comment.id,
                                threadId: thread.id,
                                label: `comment by @${comment.author}`,
                                isDeleted: comment.isDeleted,
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {nextCursor ? (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => void handleLoadMore()}
              disabled={loadingMore}
              className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:cursor-wait disabled:opacity-60"
            >
              {loadingMore ? "Loading…" : "Load more comments"}
            </button>
          </div>
        ) : null}

        <div className="mt-5 border-t border-line pt-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Add a comment
          </h3>

          {!viewer ? (
            <LoginGate
              next={`/t/${thread.id}`}
              title="Log in to comment"
              description="Only members can reply to threads."
            />
          ) : viewer.isBanned ? (
            <div className="mt-3 rounded-lg border border-line bg-surface px-4 py-5 text-center">
              <p className="text-sm font-semibold text-ink">
                Your account is banned
              </p>
              <p className="mt-1 text-xs leading-5 text-muted">
                You can still read and react, but you cannot comment or start a
                post.
              </p>
            </div>
          ) : thread.isDeleted || openingPost.isDeleted ? (
            <div className="mt-3 rounded-lg border border-line bg-surface px-4 py-5 text-center">
              <p className="text-sm font-semibold text-ink">
                This thread is deleted
              </p>
              <p className="mt-1 text-xs leading-5 text-muted">
                Staff can restore it before new comments are accepted.
              </p>
            </div>
          ) : thread.isLocked ? (
            <div className="mt-3 rounded-lg border border-line bg-surface px-4 py-5 text-center">
              <p className="text-sm font-semibold text-ink">
                This thread is locked
              </p>
              <p className="mt-1 text-xs leading-5 text-muted">
                You can still read and react, but new comments are closed.
              </p>
            </div>
          ) : (
            <form
              className="mt-2"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSubmitComment();
              }}
            >
              {replyTarget ? (
                <div className="mb-2 flex items-center gap-2 rounded border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] text-orange-900 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200">
                  <Reply className="size-3.5 shrink-0" />
                  <span>
                    Replying to <strong>@{replyTarget.author}</strong>
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
                onSubmit={() => {
                  void handleSubmitComment();
                }}
                onEditorReady={setComposer}
                quoteClipboard
              />

              <div className="mt-2">
                <UploadAttachButton
                  attachments={pendingAttachments}
                  onChange={setPendingAttachments}
                  disabled={submitting || !canPost}
                />
              </div>

              {isNewMember ? (
                <div className="mt-2">
                  <p className="mb-1 text-[11px] text-muted">
                    New accounts complete a CAPTCHA before commenting.
                  </p>
                  <TurnstileField
                    ref={captchaRef}
                    onTokenChange={setCaptchaToken}
                    onError={(message) => toast.error(message)}
                  />
                </div>
              ) : null}

              <div className="mt-2 flex items-center justify-between">
                <p className="text-[11px] text-faint">Ctrl+Enter to comment</p>
                <button
                  type="submit"
                  disabled={!hasRichText(draft) || submitting}
                  className="flex items-center gap-1.5 rounded-full bg-orange-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send className="size-3.5" />
                  {submitting ? "Posting…" : "Comment"}
                </button>
              </div>
            </form>
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
