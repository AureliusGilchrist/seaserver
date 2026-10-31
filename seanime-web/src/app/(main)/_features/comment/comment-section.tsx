"use client"
import React from "react"
import { useGetComments, useCreateComment, useVoteComment, useEditComment, useDeleteComment } from "@/api/hooks/comments.hooks"
import { CommentResponse } from "@/api/generated/types"
import { cn } from "@/components/ui/core/styling"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip } from "@/components/ui/tooltip"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { BiChevronDown, BiChevronUp, BiEdit, BiTrash, BiUpvote, BiDownvote, BiComment, BiSolidUpvote, BiSolidDownvote } from "react-icons/bi"
import { LuEyeOff, LuMessagesSquare, LuTriangleAlert } from "react-icons/lu"
import { formatDistanceToNow } from "date-fns"

const AUTO_COLLAPSE_DEPTH = 5

type CommentSectionProps = {
    mediaId: number
    mediaType: "anime" | "manga"
}

export function CommentSection({ mediaId, mediaType }: CommentSectionProps) {
    const [sort, setSort] = React.useState<string>("newest")
    const { data, isLoading } = useGetComments(mediaId, mediaType, sort)

    return (
        <section className="relative isolate mt-8 space-y-5 overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] via-black/25 to-black/40 p-4 shadow-xl shadow-black/20 backdrop-blur-md sm:p-6" data-comment-section>
            <div className="pointer-events-none absolute -right-16 -top-20 -z-10 size-56 rounded-full bg-brand-500/15 blur-3xl" />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400/30 to-brand-700/20 text-brand-100 ring-1 ring-white/10">
                        <LuMessagesSquare className="size-5" />
                    </span>
                    <div>
                        <h3 className="text-lg font-semibold leading-tight text-white">Comments</h3>
                        <p className="text-xs text-[--muted]">
                            {data?.totalCount ? `${data.totalCount} comment${data.totalCount === 1 ? "" : "s"}` : "Start the conversation"}
                        </p>
                    </div>
                </div>
                <SortSelector value={sort} onChange={setSort} />
            </div>

            <CommentComposer
                mediaId={mediaId}
                mediaType={mediaType}
                sort={sort}
            />

            {isLoading && (
                <div className="space-y-2.5">
                    {[0, 1, 2].map(i => (
                        <div key={i} className="flex gap-3 rounded-2xl bg-black/25 p-3.5 ring-1 ring-white/[0.06]">
                            <div className="size-9 shrink-0 animate-pulse rounded-full bg-white/[0.06]" />
                            <div className="flex-1 space-y-2 py-1">
                                <div className="h-3 w-1/4 animate-pulse rounded bg-white/[0.06]" />
                                <div className="h-3 w-3/4 animate-pulse rounded bg-white/[0.06]" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!isLoading && data?.comments && data.comments.length === 0 && (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 py-10 text-center">
                    <BiComment className="text-2xl text-[--muted]" />
                    <p className="text-sm text-[--muted]">No comments yet. Be the first to comment!</p>
                </div>
            )}

            {!isLoading && data?.comments && data.comments.length > 0 && (
                <div className="space-y-2.5">
                    {data.comments.map(comment => (
                        <CommentItem
                            key={comment.id}
                            comment={comment}
                            mediaId={mediaId}
                            mediaType={mediaType}
                            sort={sort}
                            depth={0}
                        />
                    ))}
                </div>
            )}
        </section>
    )
}

type SortSelectorProps = {
    value: string
    onChange: (v: string) => void
}

function SortSelector({ value, onChange }: SortSelectorProps) {
    const options = [
        { value: "top", label: "Top" },
        { value: "newest", label: "Newest" },
        { value: "oldest", label: "Oldest" },
    ]
    return (
        <div className="inline-flex rounded-full bg-black/25 p-0.5 ring-1 ring-white/10">
            {options.map(opt => (
                <button
                    key={opt.value}
                    type="button"
                    className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium transition-all",
                        value === opt.value
                            ? "bg-white/[0.14] text-white shadow-sm"
                            : "text-white/55 hover:text-white",
                    )}
                    onClick={() => onChange(opt.value)}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    )
}

type CommentComposerProps = {
    mediaId: number
    mediaType: string
    sort: string
    parentId?: number
    onCancel?: () => void
    onSuccess?: () => void
    autoFocus?: boolean
    placeholder?: string
}

function CommentComposer({ mediaId, mediaType, sort, parentId, onCancel, onSuccess, autoFocus, placeholder }: CommentComposerProps) {
    const [content, setContent] = React.useState("")
    const [isSpoiler, setIsSpoiler] = React.useState(false)
    const { mutate: createComment, isPending } = useCreateComment(mediaId, mediaType, sort)
    const serverStatus = useServerStatus()

    const handleSubmit = () => {
        const trimmed = content.trim()
        if (!trimmed) return

        createComment({
            mediaId: Number(mediaId),
            mediaType,
            parentId,
            content: trimmed,
            isSpoiler,
        }, {
            onSuccess: () => {
                setContent("")
                setIsSpoiler(false)
                onSuccess?.()
            },
        })
    }

    if (!serverStatus?.currentProfile) {
        return (
            <div className="rounded-2xl bg-black/25 py-4 text-center text-sm text-[--muted] ring-1 ring-white/[0.06]">
                Log in to a profile to comment.
            </div>
        )
    }

    return (
        <div className="rounded-2xl bg-black/25 ring-1 ring-white/[0.08] transition focus-within:ring-brand-400/40">
            <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={placeholder || "Share what you thought..."}
                className="min-h-[76px] resize-y border-0 bg-transparent shadow-none focus:ring-0"
                autoFocus={autoFocus}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault()
                        handleSubmit()
                    }
                }}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-3 py-2">
                <button
                    type="button"
                    aria-pressed={isSpoiler}
                    onClick={() => setIsSpoiler(v => !v)}
                    className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition",
                        isSpoiler
                            ? "bg-amber-400/15 text-amber-200 ring-amber-300/30"
                            : "bg-white/[0.04] text-white/55 ring-white/10 hover:text-white",
                    )}
                >
                    <LuEyeOff className="size-3.5" />
                    Spoiler
                </button>
                <div className="flex items-center gap-2">
                    <span className="hidden text-[11px] text-white/35 sm:inline">Ctrl + Enter to post</span>
                    {onCancel && (
                        <Button intent="gray-outline" size="sm" onClick={onCancel}>
                            Cancel
                        </Button>
                    )}
                    <Button
                        intent="primary"
                        size="sm"
                        onClick={handleSubmit}
                        disabled={isPending || !content.trim()}
                    >
                        {isPending ? "Posting..." : parentId ? "Reply" : "Comment"}
                    </Button>
                </div>
            </div>
        </div>
    )
}

type CommentItemProps = {
    comment: CommentResponse
    mediaId: number
    mediaType: string
    sort: string
    depth: number
}

function CommentItem({ comment, mediaId, mediaType, sort, depth }: CommentItemProps) {
    const [isCollapsed, setIsCollapsed] = React.useState(depth >= AUTO_COLLAPSE_DEPTH)
    const [showReplyComposer, setShowReplyComposer] = React.useState(false)
    const [isEditing, setIsEditing] = React.useState(false)
    const [editContent, setEditContent] = React.useState(comment.content)
    const [spoilerRevealed, setSpoilerRevealed] = React.useState(false)

    const serverStatus = useServerStatus()
    const currentProfile = serverStatus?.currentProfile

    const { mutate: voteComment } = useVoteComment(mediaId, mediaType, sort)
    const { mutate: editComment, isPending: isEditPending } = useEditComment(mediaId, mediaType, sort)
    const { mutate: deleteComment } = useDeleteComment(mediaId, mediaType, sort)

    const isAuthor = currentProfile && comment.author && currentProfile.id === comment.author.id
    const isAdmin = currentProfile?.isAdmin
    const replyCount = countAllChildren(comment)

    const handleVote = (value: number) => {
        if (!currentProfile) return
        const newValue = comment.myVote === value ? 0 : value
        voteComment({ commentId: comment.id, value: newValue })
    }

    const handleEdit = () => {
        const trimmed = editContent.trim()
        if (!trimmed) return
        editComment({ commentId: comment.id, content: trimmed }, {
            onSuccess: () => setIsEditing(false),
        })
    }

    const handleDelete = () => {
        if (!confirm("Delete this comment? This cannot be undone.")) return
        deleteComment({ commentId: comment.id })
    }

    const timeAgo = React.useMemo(() => {
        try {
            return formatDistanceToNow(new Date(comment.createdAt!), { addSuffix: true })
        } catch {
            return ""
        }
    }, [comment.createdAt])

    if (isCollapsed && depth >= AUTO_COLLAPSE_DEPTH) {
        return (
            <div className="ml-4 border-l border-white/[0.08] pl-3 sm:ml-5 sm:pl-4">
                <button
                    className="flex items-center gap-2 py-1 text-sm text-[--muted] hover:text-white"
                    onClick={() => setIsCollapsed(false)}
                >
                    <BiChevronDown className="text-base" />
                    Continue thread ({replyCount} more {replyCount === 1 ? "reply" : "replies"})
                </button>
            </div>
        )
    }

    return (
        <div
            className={cn(
                depth === 0
                    ? "rounded-2xl bg-black/25 p-3.5 ring-1 ring-white/[0.06] sm:p-4"
                    : "ml-4 mt-2 border-l border-white/[0.08] pl-3 sm:ml-5 sm:pl-4",
            )}
        >
            <div className="group flex gap-3">
                <Avatar
                    src={comment.author?.anilistAvatar || comment.author?.avatarPath}
                    size="sm"
                    className="shrink-0 ring-1 ring-white/10"
                    fallback={comment.author?.name?.charAt(0)?.toUpperCase() || "?"}
                />
                <div className="min-w-0 flex-1">
                    {/* Header: name, time */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                        {comment.author ? (
                            <>
                                <span className={cn("font-semibold text-white", comment.author.isAdmin && "text-brand-200")}>
                                    {comment.author.name}
                                </span>
                                {comment.author.isAdmin && (
                                    <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold text-brand-200 ring-1 ring-brand-400/30">Admin</span>
                                )}
                            </>
                        ) : (
                            <span className="italic text-[--muted]">Deleted profile</span>
                        )}
                        <span className="text-xs text-[--muted]">{timeAgo}</span>
                        {comment.isEdited && (
                            <span className="text-xs italic text-[--muted]">edited</span>
                        )}
                        {depth >= AUTO_COLLAPSE_DEPTH && (
                            <button
                                className="ml-auto text-[--muted] hover:text-white"
                                onClick={() => setIsCollapsed(true)}
                            >
                                <BiChevronUp className="text-base" />
                            </button>
                        )}
                    </div>

                    {/* Content */}
                    {isEditing ? (
                        <div className="mt-2 space-y-2">
                            <Textarea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                className="min-h-[60px] resize-y border-white/10 bg-black/30"
                                autoFocus
                            />
                            <div className="flex items-center gap-2">
                                <Button intent="primary" size="sm" onClick={handleEdit} disabled={isEditPending || !editContent.trim()}>
                                    {isEditPending ? "Saving..." : "Save"}
                                </Button>
                                <Button intent="gray-outline" size="sm" onClick={() => { setIsEditing(false); setEditContent(comment.content) }}>
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-1">
                            {comment.isSpoiler && !spoilerRevealed ? (
                                <button
                                    className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-200 ring-1 ring-amber-300/20 transition hover:bg-amber-400/20"
                                    onClick={() => setSpoilerRevealed(true)}
                                >
                                    <LuTriangleAlert className="size-3.5" />
                                    Spoiler, click to reveal
                                </button>
                            ) : (
                                <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/90">
                                    <SpoilerContent content={comment.content} />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Actions: vote, reply, edit, delete */}
                    {!isEditing && (
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                            <div className="inline-flex items-center rounded-full bg-white/[0.04] ring-1 ring-white/[0.08]">
                                <Tooltip trigger={
                                    <button
                                        aria-label="Upvote"
                                        className={cn(
                                            "rounded-full p-1.5 text-sm transition hover:bg-white/10",
                                            comment.myVote === 1 ? "text-brand-300" : "text-[--muted]",
                                        )}
                                        onClick={() => handleVote(1)}
                                    >
                                        {comment.myVote === 1 ? <BiSolidUpvote /> : <BiUpvote />}
                                    </button>
                                }>Upvote</Tooltip>

                                <span className={cn(
                                    "min-w-[18px] text-center text-xs font-semibold tabular-nums",
                                    comment.score > 0 ? "text-brand-300" : comment.score < 0 ? "text-red-400" : "text-[--muted]",
                                )}>
                                    {comment.score}
                                </span>

                                <Tooltip trigger={
                                    <button
                                        aria-label="Downvote"
                                        className={cn(
                                            "rounded-full p-1.5 text-sm transition hover:bg-white/10",
                                            comment.myVote === -1 ? "text-red-400" : "text-[--muted]",
                                        )}
                                        onClick={() => handleVote(-1)}
                                    >
                                        {comment.myVote === -1 ? <BiSolidDownvote /> : <BiDownvote />}
                                    </button>
                                }>Downvote</Tooltip>
                            </div>

                            {/* Reply */}
                            {currentProfile && (
                                <button
                                    className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-[--muted] transition hover:bg-white/[0.07] hover:text-white"
                                    onClick={() => setShowReplyComposer(!showReplyComposer)}
                                >
                                    <BiComment />
                                    Reply
                                </button>
                            )}

                            {/* Hide or show the thread below */}
                            {replyCount > 0 && depth < AUTO_COLLAPSE_DEPTH && (
                                <button
                                    className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-[--muted] transition hover:bg-white/[0.07] hover:text-white"
                                    onClick={() => setIsCollapsed(v => !v)}
                                >
                                    {isCollapsed ? <BiChevronDown /> : <BiChevronUp />}
                                    {isCollapsed ? `Show ${replyCount} ${replyCount === 1 ? "reply" : "replies"}` : "Hide replies"}
                                </button>
                            )}

                            {/* Edit (author only) */}
                            {isAuthor && (
                                <button
                                    className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-[--muted] transition hover:bg-white/[0.07] hover:text-white sm:opacity-0 sm:focus:opacity-100 sm:group-hover:opacity-100"
                                    onClick={() => { setIsEditing(true); setEditContent(comment.content) }}
                                >
                                    <BiEdit />
                                    Edit
                                </button>
                            )}

                            {/* Delete (author or admin) */}
                            {(isAuthor || isAdmin) && (
                                <button
                                    className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-[--muted] transition hover:bg-red-500/10 hover:text-red-300 sm:opacity-0 sm:focus:opacity-100 sm:group-hover:opacity-100"
                                    onClick={handleDelete}
                                >
                                    <BiTrash />
                                    Delete
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Reply composer */}
            {showReplyComposer && (
                <div className="ml-4 mt-3 sm:ml-12">
                    <CommentComposer
                        mediaId={mediaId}
                        mediaType={mediaType}
                        sort={sort}
                        parentId={comment.id}
                        onCancel={() => setShowReplyComposer(false)}
                        onSuccess={() => setShowReplyComposer(false)}
                        autoFocus
                        placeholder={`Reply to ${comment.author?.name || "comment"}...`}
                    />
                </div>
            )}

            {/* Children */}
            {comment.children && comment.children.length > 0 && !isCollapsed && (
                <div className="mt-1">
                    {comment.children.map(child => (
                        <CommentItem
                            key={child.id}
                            comment={child}
                            mediaId={mediaId}
                            mediaType={mediaType}
                            sort={sort}
                            depth={depth + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

/**
 * Renders comment content with inline [spoiler]...[/spoiler] tags as blurred text
 */
export function SpoilerContent({ content }: { content: string }) {
    const parts = React.useMemo(() => {
        const regex = /\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi
        const result: Array<{ text: string; isSpoiler: boolean }> = []
        let lastIndex = 0
        let match: RegExpExecArray | null

        while ((match = regex.exec(content)) !== null) {
            if (match.index > lastIndex) {
                result.push({ text: content.slice(lastIndex, match.index), isSpoiler: false })
            }
            result.push({ text: match[1], isSpoiler: true })
            lastIndex = match.index + match[0].length
        }
        if (lastIndex < content.length) {
            result.push({ text: content.slice(lastIndex), isSpoiler: false })
        }
        return result
    }, [content])

    return (
        <>
            {parts.map((part, i) =>
                part.isSpoiler ? (
                    <SpoilerInline key={i} text={part.text} />
                ) : (
                    <span key={i}>{part.text}</span>
                ),
            )}
        </>
    )
}

function SpoilerInline({ text }: { text: string }) {
    const [revealed, setRevealed] = React.useState(false)
    return (
        <span
            className={cn(
                "cursor-pointer rounded px-0.5 transition-all",
                revealed
                    ? "bg-white/10"
                    : "bg-gray-600 text-transparent select-none blur-sm hover:blur-[3px]",
            )}
            onClick={() => setRevealed(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setRevealed(true) }}
        >
            {text}
        </span>
    )
}

function countAllChildren(comment: CommentResponse): number {
    if (!comment.children || comment.children.length === 0) return 0
    let count = comment.children.length
    for (const child of comment.children) {
        count += countAllChildren(child)
    }
    return count
}
