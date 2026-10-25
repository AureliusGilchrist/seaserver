"use client"

import {
    TimelineFeedItem,
    TimelineProfileSummary,
    TIMELINE_FEED_KEY,
    useCreateProfilePost,
    useCreateTimelineReply,
    useDeleteProfilePost,
    useDeleteTimelineReply,
    useTimelineFeed,
    useTimelineReplies,
    useToggleTimelineLike,
    useUpdateProfilePost,
} from "@/api/hooks/profile-timeline.hooks"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { SeaLink } from "@/components/shared/sea-link"
import { useQueryClient } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import React from "react"
import { LuHeart, LuMessageCircle, LuPencil, LuTrash2 } from "react-icons/lu"

/**
 * AniList-style timeline. With `profileId` it is that profile's wall: status posts, messages others
 * left there, and the profile's watch activity. With `community` it is everybody's.
 */
export function ProfileTimeline({ profileId, profileName, community = false }: {
    profileId?: number
    profileName?: string
    community?: boolean
}) {
    const me = useAtomValue(currentProfileAtom)
    const qc = useQueryClient()
    const feed = useTimelineFeed(profileId, community)

    useWebsocketMessageListener({
        type: "profile-timeline-updated",
        onMessage: () => qc.invalidateQueries({ queryKey: [TIMELINE_FEED_KEY] }),
    })

    const items = feed.data?.pages.flatMap(p => p.items ?? []) ?? []
    const wallId = community ? me?.id : profileId
    const isOwnWall = !!me && wallId === me.id

    return (
        <div className="space-y-4" data-profile-timeline>
            {!!me && !!wallId && (
                <TimelineComposer
                    wallProfileId={wallId}
                    placeholder={isOwnWall ? "Write a status…" : `Write on ${profileName ?? "their"} wall…`}
                />
            )}

            {feed.isLoading && <p className="text-sm text-[--muted] text-center py-6">Loading timeline…</p>}
            {!feed.isLoading && items.length === 0 && (
                <p className="text-sm text-[--muted] text-center py-10">Nothing here yet.</p>
            )}

            <div className="space-y-3">
                {items.map(item => <TimelineCard key={item.key} item={item} showWall={community} />)}
            </div>

            {feed.hasNextPage && (
                <div className="flex justify-center">
                    <Button intent="gray-subtle" size="sm" loading={feed.isFetchingNextPage} onClick={() => feed.fetchNextPage()}>
                        Load more
                    </Button>
                </div>
            )}
        </div>
    )
}

function TimelineComposer({ wallProfileId, placeholder }: { wallProfileId: number, placeholder: string }) {
    const [content, setContent] = React.useState("")
    const [isSpoiler, setIsSpoiler] = React.useState(false)
    const { mutate, isPending } = useCreateProfilePost()

    const submit = () => {
        const text = content.trim()
        if (!text) return
        mutate({ wallProfileId, content: text, isSpoiler }, {
            onSuccess: () => {
                setContent("")
                setIsSpoiler(false)
            },
        })
    }

    return (
        <div className="rounded-xl border border-[--border] bg-[--paper] p-3 space-y-2" data-timeline-composer>
            <Textarea
                value={content}
                onValueChange={setContent}
                placeholder={placeholder}
                className="min-h-[4.5rem] resize-y"
                maxLength={4000}
                onKeyDown={e => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit()
                }}
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs text-[--muted]">
                    **bold**, _italic_, ~!spoiler!~, links and image URLs work. Ctrl+Enter to post.
                </p>
                <div className="flex items-center gap-3">
                    <Switch label="Spoiler" value={isSpoiler} onValueChange={setIsSpoiler} size="sm" />
                    <Button size="sm" intent="primary" loading={isPending} disabled={!content.trim()} onClick={submit}>
                        Post
                    </Button>
                </div>
            </div>
        </div>
    )
}

function ProfileName({ p }: { p?: TimelineProfileSummary }) {
    if (!p) return null
    return (
        <SeaLink href={`/profile/user?id=${p.id}`} className="font-semibold hover:underline" style={p.nameColorCss ? { color: p.nameColorCss } : undefined}>
            {p.name}
        </SeaLink>
    )
}

function Avatar({ p }: { p?: TimelineProfileSummary }) {
    return p?.avatar
        ? <img src={p.avatar} alt={p.name} className="size-10 rounded-full object-cover flex-none" />
        : <div className="size-10 rounded-full bg-[--subtle] flex items-center justify-center font-bold flex-none">{p?.name?.[0] ?? "?"}</div>
}

function TimelineCard({ item, showWall }: { item: TimelineFeedItem, showWall: boolean }) {
    const [liked, setLiked] = React.useState(item.likedByMe)
    const [likeCount, setLikeCount] = React.useState(item.likeCount)
    const [repliesOpen, setRepliesOpen] = React.useState(false)
    const [editing, setEditing] = React.useState(false)
    const { mutate: toggleLike } = useToggleTimelineLike()
    const { mutate: deletePost } = useDeleteProfilePost(item.postId ?? 0)

    React.useEffect(() => {
        setLiked(item.likedByMe)
        setLikeCount(item.likeCount)
    }, [item.likedByMe, item.likeCount])

    const onLike = () => {
        // Optimistic; the server answer settles it.
        setLiked(l => !l)
        setLikeCount(n => n + (liked ? -1 : 1))
        toggleLike({ targetKey: item.key }, {
            onSuccess: res => {
                if (res) {
                    setLiked(res.liked)
                    setLikeCount(res.likeCount)
                }
            },
        })
    }

    return (
        <div className="rounded-xl border border-[--border] bg-[--paper] p-4" data-timeline-card data-kind={item.kind}>
            <div className="flex gap-3">
                {item.kind === "activity" && item.activity?.mediaImage
                    ? <img src={item.activity.mediaImage} alt="" className="w-12 h-16 rounded-md object-cover flex-none" />
                    : <Avatar p={item.author} />}
                <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-baseline gap-1.5 flex-wrap text-sm">
                        <ProfileName p={item.author} />
                        {item.wallProfile && <>
                            <span className="text-[--muted]">→</span>
                            <ProfileName p={item.wallProfile} />
                        </>}
                        {item.kind === "activity" && <ActivityLine item={item} />}
                        <span className="text-xs text-[--muted] ml-auto" title={new Date(item.createdAt).toLocaleString()}>
                            {timeAgo(item.createdAt)}
                        </span>
                    </div>

                    {item.kind === "post" && !editing && (
                        <div className="text-sm whitespace-pre-wrap break-words">
                            {item.isSpoiler ? <SpoilerBlock><RichText text={item.content ?? ""} /></SpoilerBlock> : <RichText text={item.content ?? ""} />}
                            {item.isEdited && <span className="text-xs text-[--muted] ml-2">(edited)</span>}
                        </div>
                    )}
                    {item.kind === "post" && editing && (
                        <EditPost item={item} onDone={() => setEditing(false)} />
                    )}
                </div>
            </div>

            <div className="flex items-center gap-4 mt-3 text-sm text-[--muted]">
                <button className={cn("flex items-center gap-1 hover:text-[--foreground]", liked && "text-red-400")} onClick={onLike}>
                    <LuHeart className={cn(liked && "fill-current")} /> {likeCount > 0 && likeCount}
                </button>
                <button className="flex items-center gap-1 hover:text-[--foreground]" onClick={() => setRepliesOpen(o => !o)}>
                    <LuMessageCircle /> {item.replyCount > 0 && item.replyCount}
                </button>
                {item.canEdit && !editing && (
                    <button className="flex items-center gap-1 hover:text-[--foreground]" onClick={() => setEditing(true)}>
                        <LuPencil /> Edit
                    </button>
                )}
                {item.canDelete && (
                    <button
                        className="flex items-center gap-1 hover:text-red-400"
                        onClick={() => {
                            if (window.confirm("Delete this post?")) deletePost()
                        }}
                    >
                        <LuTrash2 /> Delete
                    </button>
                )}
            </div>

            {repliesOpen && <TimelineReplies targetKey={item.key} />}
        </div>
    )
}

function ActivityLine({ item }: { item: TimelineFeedItem }) {
    const a = item.activity
    if (!a) return null
    const media = a.mediaTitle
        ? <SeaLink href={`/${a.mediaType === "manga" ? "manga" : "entry"}?id=${a.mediaId}`} className="text-brand-300 hover:underline">{a.mediaTitle}</SeaLink>
        : <span>{a.mediaId ? `#${a.mediaId}` : ""}</span>
    switch (a.eventType) {
        case "episode_watched": {
            const from = item.episodeFrom ?? 0, to = item.episodeTo ?? 0
            const eps = from && to && from !== to ? `episodes ${from} – ${to}` : `episode ${to || from}`
            return <span className="text-[--muted]">watched {eps} of {media}</span>
        }
        case "manga_chapter_read":
            return <span className="text-[--muted]">read a chapter of {media}</span>
        case "status_changed": {
            const meta = safeJson(a.metadata)
            return <span className="text-[--muted]">set {media} to {String(meta?.status ?? meta?.newStatus ?? "a new status").toLowerCase()}</span>
        }
        case "anilist_entry_edited":
            return <span className="text-[--muted]">updated {media}</span>
        case "achievement_unlocked": {
            const meta = safeJson(a.metadata)
            return <span className="text-[--muted]">unlocked <span className="text-[--foreground]">{String(meta?.name ?? meta?.key ?? "an achievement")}</span></span>
        }
        default:
            return <span className="text-[--muted]">{a.eventType.replaceAll("_", " ")} {media}</span>
    }
}

function EditPost({ item, onDone }: { item: TimelineFeedItem, onDone: () => void }) {
    const [content, setContent] = React.useState(item.content ?? "")
    const [isSpoiler, setIsSpoiler] = React.useState(!!item.isSpoiler)
    const { mutate, isPending } = useUpdateProfilePost(item.postId ?? 0)
    return (
        <div className="space-y-2">
            <Textarea value={content} onValueChange={setContent} maxLength={4000} />
            <div className="flex items-center gap-3 justify-end">
                <Switch label="Spoiler" value={isSpoiler} onValueChange={setIsSpoiler} size="sm" />
                <Button size="sm" intent="gray-subtle" onClick={onDone}>Cancel</Button>
                <Button size="sm" intent="primary" loading={isPending} onClick={() => mutate({ content, isSpoiler }, { onSuccess: onDone })}>Save</Button>
            </div>
        </div>
    )
}

function TimelineReplies({ targetKey }: { targetKey: string }) {
    const me = useAtomValue(currentProfileAtom)
    const { data: replies, isLoading } = useTimelineReplies(targetKey, true)
    const { mutate: create, isPending } = useCreateTimelineReply(targetKey)
    const { mutate: remove } = useDeleteTimelineReply(targetKey)
    const [text, setText] = React.useState("")

    const submit = () => {
        const t = text.trim()
        if (!t) return
        create({ targetKey, content: t }, { onSuccess: () => setText("") })
    }

    return (
        <div className="mt-3 pl-4 border-l border-[--border] space-y-3" data-timeline-replies>
            {isLoading && <p className="text-xs text-[--muted]">Loading replies…</p>}
            {replies?.map(r => (
                <div key={r.id} className="flex gap-2 text-sm">
                    <Avatar p={r.author} />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                            <ProfileName p={r.author} />
                            <span className="text-xs text-[--muted]">{timeAgo(r.createdAt)}</span>
                            {r.canDelete && (
                                <button className="text-xs text-[--muted] hover:text-red-400 ml-auto" onClick={() => remove(r.id)}>
                                    <LuTrash2 />
                                </button>
                            )}
                        </div>
                        <div className="whitespace-pre-wrap break-words"><RichText text={r.content} /></div>
                    </div>
                </div>
            ))}
            {!!me && (
                <div className="flex gap-2 items-end">
                    <Textarea
                        value={text}
                        onValueChange={setText}
                        placeholder="Write a reply…"
                        className="min-h-[2.5rem]"
                        maxLength={2000}
                        onKeyDown={e => {
                            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit()
                        }}
                    />
                    <Button size="sm" intent="primary-subtle" loading={isPending} disabled={!text.trim()} onClick={submit}>Reply</Button>
                </div>
            )}
        </div>
    )
}

function SpoilerBlock({ children }: { children: React.ReactNode }) {
    const [shown, setShown] = React.useState(false)
    return (
        <span
            className={cn("rounded px-1 transition cursor-pointer", !shown && "blur-sm select-none bg-[--subtle]")}
            onClick={() => setShown(true)}
            title={shown ? undefined : "Spoiler — click to reveal"}
        >{children}</span>
    )
}

// ── Markdown-lite ──────────────────────────────────────────────────────────────
// Rendered as React nodes, never as HTML, so user content cannot inject markup.

const IMG_RE = /\.(png|jpe?g|gif|webp|avif)(\?\S*)?$/i
const TOKEN_RE = /(~!([\s\S]+?)!~)|(\*\*([\s\S]+?)\*\*)|(_([^_\n]+?)_)|(img\((https?:\/\/[^\s)]+)\))|(https?:\/\/[^\s<]+)/g

export function RichText({ text }: { text: string }): React.ReactElement {
    const nodes: React.ReactNode[] = []
    let last = 0
    let i = 0
    for (const m of text.matchAll(TOKEN_RE)) {
        const idx = m.index ?? 0
        if (idx > last) nodes.push(text.slice(last, idx))
        const k = `t${i++}`
        if (m[1]) nodes.push(<SpoilerBlock key={k}><RichText text={m[2]} /></SpoilerBlock>)
        else if (m[3]) nodes.push(<strong key={k}><RichText text={m[4]} /></strong>)
        else if (m[5]) nodes.push(<em key={k}>{m[6]}</em>)
        else if (m[7]) nodes.push(<img key={k} src={m[8]} alt="" className="max-h-80 rounded-md my-1 inline-block" loading="lazy" />)
        else if (m[9]) {
            const url = m[9]
            nodes.push(IMG_RE.test(url)
                ? <img key={k} src={url} alt="" className="max-h-80 rounded-md my-1 block" loading="lazy" />
                : <a key={k} href={url} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-300 underline break-all">{url}</a>)
        }
        last = idx + m[0].length
    }
    if (last < text.length) nodes.push(text.slice(last))
    return <>{nodes}</>
}

function safeJson(s?: string): Record<string, unknown> | null {
    try {
        return s ? JSON.parse(s) as Record<string, unknown> : null
    }
    catch {
        return null
    }
}

function timeAgo(iso: string) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000
    if (diff < 60) return "just now"
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`
    return new Date(iso).toLocaleDateString()
}
