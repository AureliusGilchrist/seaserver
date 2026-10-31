"use client"

import { useAnilistMediaById } from "@/app/(main)/profile/me/_lib/anilist-media-by-id"
import { useGetProfileComments, type ProfileCommentItem } from "@/api/hooks/profile-comments.hooks"
import { SpoilerContent } from "@/app/(main)/_features/comment/comment-section"
import { SeaLink } from "@/components/shared/sea-link"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { getImageUrl } from "@/lib/server/assets"
import { formatDistanceToNow } from "date-fns"
import React from "react"
import { LuCornerDownRight, LuMessageCircle, LuMessageSquare, LuTriangleAlert } from "react-icons/lu"

/**
 * Every comment and reply this profile has left on any show or manga, newest first. With `limit` it
 * is the short version the Activity tab shows, with a way through to the rest.
 */
export function ProfileCommentsTab({ userId, limit, onShowAll }: { userId: number, limit?: number, onShowAll?: () => void }) {
    const { data, isLoading } = useGetProfileComments(userId, true)
    const comments = data?.comments ?? []
    const shown = limit ? comments.slice(0, limit) : comments

    if (isLoading) {
        return limit ? null : <div className="flex justify-center py-12"><LoadingSpinner /></div>
    }

    if (comments.length === 0) {
        if (limit) return null
        return (
            <div className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-white/10 py-14 text-center">
                <LuMessageCircle className="size-8 text-[--muted]" />
                <p className="text-[--muted]">No comments yet</p>
            </div>
        )
    }

    const total = data?.totalCount ?? comments.length

    return (
        <section className="space-y-4">
            <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400/30 to-brand-700/20 text-brand-100 ring-1 ring-white/10">
                    <LuMessageSquare className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold">{limit ? "Recent comments" : "Comments"}</h2>
                    <p className="text-xs text-[--muted]">{total} comment{total === 1 ? "" : "s"} across anime and manga</p>
                </div>
                {!!limit && comments.length > limit && (
                    <button type="button" onClick={onShowAll} className="text-sm font-medium text-[--muted] transition hover:text-white">
                        Show all
                    </button>
                )}
            </div>
            <div className="space-y-2.5">
                {shown.map(c => <ProfileCommentRow key={c.id} comment={c} />)}
            </div>
        </section>
    )
}

function ProfileCommentRow({ comment }: { comment: ProfileCommentItem }) {
    const [revealed, setRevealed] = React.useState(false)
    const isManga = comment.mediaType === "manga"
    const href = isManga ? `/manga/entry?id=${comment.mediaId}` : `/entry?id=${comment.mediaId}`
    const date = comment.createdAt ? new Date(comment.createdAt) : undefined

    return (
        <article className="flex gap-3.5 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] via-black/25 to-black/40 p-3.5 shadow-lg shadow-black/15 backdrop-blur-md sm:p-4">
            <SeaLink href={href} className="shrink-0">
                <span className="block aspect-[6/8] w-12 overflow-hidden rounded-lg bg-white/[0.05] ring-1 ring-white/10 sm:w-14">
                    {!!comment.mediaImage && <img src={getImageUrl(comment.mediaImage)} alt="" loading="lazy" className="size-full object-cover" />}
                </span>
            </SeaLink>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <SeaLink href={href} className="min-w-0 truncate text-sm font-semibold text-white hover:underline">
                        {comment.mediaTitle || <MediaTitleFallback id={comment.mediaId} isManga={isManga} />}
                    </SeaLink>
                    <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/60">
                        {isManga ? "Manga" : "Anime"}
                    </span>
                    {comment.isReply && (
                        <span className="flex items-center gap-1 text-[11px] text-[--muted]"><LuCornerDownRight className="size-3" />Reply</span>
                    )}
                    <span className="ml-auto text-xs text-[--muted]" title={date?.toLocaleString()}>
                        {date ? formatDistanceToNow(date, { addSuffix: true }) : ""}{comment.isEdited ? " · edited" : ""}
                    </span>
                </div>
                {comment.isSpoiler && !revealed ? (
                    <button
                        type="button"
                        onClick={() => setRevealed(true)}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-200 ring-1 ring-amber-300/20 transition hover:bg-amber-400/20"
                    >
                        <LuTriangleAlert className="size-3.5" /> Spoiler, click to reveal
                    </button>
                ) : (
                    <p className="mt-1.5 line-clamp-6 whitespace-pre-wrap break-words text-sm text-white/85"><SpoilerContent content={comment.content} /></p>
                )}
            </div>
        </article>
    )
}

/** For a title that is not on the author's lists, so the server could not name it. */
function MediaTitleFallback({ id, isManga }: { id: number, isManga: boolean }) {
    const { data } = useAnilistMediaById(id, isManga ? "manga" : "anime")
    return <>{data?.title?.userPreferred || `#${id}`}</>
}
