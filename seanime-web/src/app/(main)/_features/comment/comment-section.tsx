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
import { BiChevronDown, BiChevronUp, BiEdit, BiTrash, BiUpvote, BiDownvote, BiComment, BiSortAlt2 } from "react-icons/bi"
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
        <div className="space-y-4 mt-8">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold flex items-center gap-2">
                    <BiComment className="text-[--muted]" />
                    Comments
                    {data?.totalCount != null && data.totalCount > 0 && (
                        <span className="text-sm font-normal text-[--muted]">({data.totalCount})</span>
                    )}
                </h3>
                <SortSelector value={sort} onChange={setSort} />
            </div>

            <CommentComposer
                mediaId={mediaId}
                mediaType={mediaType}
                sort={sort}
            />

            {isLoading && (
                <div className="py-6 text-center text-[--muted]">Loading comments...</div>
            )}

            {!isLoading && data?.comments && data.comments.length === 0 && (
                <div className="py-6 text-center text-[--muted]">No comments yet. Be the first to comment!</div>
            )}

            {!isLoading && data?.comments && data.comments.length > 0 && (
                <div className="space-y-1">
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
        </div>
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
        <div className="flex items-center gap-1">
            <BiSortAlt2 className="text-[--muted]" />
            {options.map(opt => (
                <button
                    key={opt.value}
                    className={cn(
                        "px-2 py-1 text-sm rounded-md transition",
                        value === opt.value
                            ? "bg-gray-700 text-white"
                            : "text-[--muted] hover:text-white hover:bg-gray-800",
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
            <div className="py-3 text-center text-[--muted] text-sm">
                Log in to a profile to comment.
            </div>
        )
    }

    return (
        <div className="space-y-2">
            <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={placeholder || "Write a comment..."}
                className="min-h-[80px] resize-y bg-gray-900 border-gray-700"
                autoFocus={autoFocus}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault()
                        handleSubmit()
                    }
                }}
            />
            <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-[--muted] cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={isSpoiler}
                        onChange={(e) => setIsSpoiler(e.target.checked)}
                        className="rounded"
                    />
                    Spoiler
                </label>
                <div className="flex items-center gap-2">
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
            <div
                className={cn("pl-4 border-l border-gray-700/50", depth > 0 && "ml-4")}
            >
                <button
                    className="flex items-center gap-2 text-sm text-[--muted] hover:text-white py-1"
                    onClick={() => setIsCollapsed(false)}
                >
                    <BiChevronDown className="text-base" />
                    Continue thread ({countAllChildren(comment)} more {countAllChildren(comment) === 1 ? "reply" : "replies"})
                </button>
            </div>
        )
    }

    return (
        <div className={cn(depth > 0 && "ml-4 pl-4 border-l border-gray-700/50")}>
            <div className="py-2 group">
                {/* Header: avatar, name, time */}
                <div className="flex items-center gap-2 text-sm">
                    {comment.author ? (
                        <>
                            <Avatar
                                src={comment.author.anilistAvatar || comment.author.avatarPath}
                                size="xs"
                                fallback={comment.author.name?.charAt(0)?.toUpperCase()}
                            />
                            <span className={cn("font-medium", comment.author.isAdmin && "text-brand-300")}>
                                {comment.author.name}
                            </span>
                            {comment.author.isAdmin && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-brand-900/50 text-brand-300">Admin</span>
                            )}
                        </>
                    ) : (
                        <span className="text-[--muted] italic">Deleted profile</span>
                    )}
                    <span className="text-[--muted]">·</span>
                    <span className="text-[--muted]">{timeAgo}</span>
                    {comment.isEdited && (
                        <span className="text-[--muted] text-xs italic">(edited)</span>
                    )}
                    {depth >= AUTO_COLLAPSE_DEPTH && (
                        <button
                            className="text-[--muted] hover:text-white ml-auto"
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
                            className="min-h-[60px] resize-y bg-gray-900 border-gray-700"
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
                                className="text-sm text-[--muted] italic bg-gray-800 rounded px-2 py-1 hover:bg-gray-700 transition"
                                onClick={() => setSpoilerRevealed(true)}
                            >
                                ⚠ Spoiler — click to reveal
                            </button>
                        ) : (
                            <div className={cn(
                                "text-sm whitespace-pre-wrap break-words",
                                comment.isSpoiler && "relative",
                            )}>
                                <SpoilerContent content={comment.content} />
                            </div>
                        )}
                    </div>
                )}

                {/* Actions: vote, reply, edit, delete */}
                {!isEditing && (
                    <div className="flex items-center gap-1 mt-1.5">
                        {/* Vote buttons */}
                        <Tooltip trigger={
                            <button
                                className={cn(
                                    "p-1 rounded hover:bg-gray-800 transition text-sm",
                                    comment.myVote === 1 ? "text-brand-400" : "text-[--muted]",
                                )}
                                onClick={() => handleVote(1)}
                            >
                                <BiUpvote />
                            </button>
                        }>Upvote</Tooltip>

                        <span className={cn(
                            "text-xs font-medium min-w-[20px] text-center",
                            comment.score > 0 ? "text-brand-400" : comment.score < 0 ? "text-red-400" : "text-[--muted]",
                        )}>
                            {comment.score}
                        </span>

                        <Tooltip trigger={
                            <button
                                className={cn(
                                    "p-1 rounded hover:bg-gray-800 transition text-sm",
                                    comment.myVote === -1 ? "text-red-400" : "text-[--muted]",
                                )}
                                onClick={() => handleVote(-1)}
                            >
                                <BiDownvote />
                            </button>
                        }>Downvote</Tooltip>

                        <span className="w-px h-4 bg-gray-700 mx-1" />

                        {/* Reply */}
                        {currentProfile && (
                            <button
                                className="flex items-center gap-1 px-2 py-1 text-xs text-[--muted] hover:text-white hover:bg-gray-800 rounded transition"
                                onClick={() => setShowReplyComposer(!showReplyComposer)}
                            >
                                <BiComment />
                                Reply
                            </button>
                        )}

                        {/* Edit (author only) */}
                        {isAuthor && (
                            <button
                                className="flex items-center gap-1 px-2 py-1 text-xs text-[--muted] hover:text-white hover:bg-gray-800 rounded transition opacity-0 group-hover:opacity-100"
                                onClick={() => { setIsEditing(true); setEditContent(comment.content) }}
                            >
                                <BiEdit />
                                Edit
                            </button>
                        )}

                        {/* Delete (author or admin) */}
                        {(isAuthor || isAdmin) && (
                            <button
                                className="flex items-center gap-1 px-2 py-1 text-xs text-[--muted] hover:text-red-400 hover:bg-gray-800 rounded transition opacity-0 group-hover:opacity-100"
                                onClick={handleDelete}
                            >
                                <BiTrash />
                                Delete
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Reply composer */}
            {showReplyComposer && (
                <div className="ml-4 mt-1 mb-2">
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
                <div className="space-y-0">
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
function SpoilerContent({ content }: { content: string }) {
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
                    ? "bg-gray-700/50"
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
