"use client"

import {
    TimelineAchievement,
    TimelineFeedItem,
    TimelineNewsBrief,
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
import { SeaLink } from "@/components/shared/sea-link"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useQueryClient } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import React from "react"
import {
    LuBookOpen,
    LuChevronDown,
    LuExternalLink,
    LuEyeOff,
    LuHeart,
    LuMessageCircle,
    LuNewspaper,
    LuPencil,
    LuPenLine,
    LuRefreshCw,
    LuSend,
    LuSparkles,
    LuTrash2,
    LuTrophy,
    LuTv,
} from "react-icons/lu"

/**
 * AniList-style timeline. With `profileId` it is that profile's wall: status posts, messages others
 * left there, and the profile's watch activity. With `community` it is everybody's, with
 * achievement unlocks and paced news mixed in (internal/handlers/timeline_extras.go).
 */
export function ProfileTimeline({ profileId, profileName, community = false, hideComposer = false }: {
    profileId?: number
    profileName?: string
    community?: boolean
    hideComposer?: boolean
}) {
    const me = useAtomValue(currentProfileAtom)
    const qc = useQueryClient()
    const feed = useTimelineFeed(profileId, community)

    useWebsocketMessageListener({
        type: "profile-timeline-updated",
        onMessage: () => qc.invalidateQueries({ queryKey: [TIMELINE_FEED_KEY] }),
    })

    const items = React.useMemo(() => feed.data?.pages.flatMap(p => p.items ?? []) ?? [], [feed.data])
    const wallId = community ? me?.id : profileId
    const isOwnWall = !!me && wallId === me.id

    const sentinelRef = useInfiniteSentinel(() => {
        if (feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage()
    }, [feed.hasNextPage, feed.isFetchingNextPage])

    return (
        <div className="space-y-4" data-profile-timeline>
            {!hideComposer && !!me && !!wallId && (
                <TimelineComposer
                    wallProfileId={wallId}
                    author={me}
                    placeholder={isOwnWall ? "What are you watching? Share a thought…" : `Write on ${profileName ?? "their"} wall…`}
                />
            )}

            {feed.isLoading && <TimelineSkeleton />}
            {!feed.isLoading && items.length === 0 && <TimelineEmpty />}

            <div className="space-y-3">
                {withDayBreaks(items, i => i.createdAt).map(row => row.type === "day"
                    ? <TimelineDayDivider key={`day-${row.day}`} day={row.day} />
                    : <TimelineCard key={row.item.key} item={row.item} />)}
            </div>

            <div ref={sentinelRef} className="h-px" />
            {feed.isFetchingNextPage && <TimelineSkeleton count={2} />}
        </div>
    )
}

// ── Shared pieces ──────────────────────────────────────────────────────────────

/** Calls `onVisible` whenever the returned sentinel scrolls near the viewport. */
export function useInfiniteSentinel(onVisible: () => void, deps: React.DependencyList) {
    const ref = React.useRef<HTMLDivElement>(null)
    const cb = React.useRef(onVisible)
    cb.current = onVisible
    React.useEffect(() => {
        const el = ref.current
        if (!el) return
        const io = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) cb.current()
        }, { rootMargin: "600px 0px" })
        io.observe(el)
        return () => io.disconnect()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps)
    return ref
}

/** Interleaves "day" rows between items from different days (items newest first). */
export function withDayBreaks<T>(items: T[], at: (t: T) => string): ({ type: "day", day: string } | { type: "item", item: T })[] {
    const out: ({ type: "day", day: string } | { type: "item", item: T })[] = []
    let current = ""
    for (const item of items) {
        const d = new Date(at(item))
        const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
        if (day !== current) {
            current = day
            out.push({ type: "day", day })
        }
        out.push({ type: "item", item })
    }
    return out
}

export function TimelineDayDivider({ day }: { day: string }) {
    const d = new Date(day + "T00:00:00")
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)
    const label = d.toDateString() === today.toDateString()
        ? "Today"
        : d.toDateString() === yesterday.toDateString()
            ? "Yesterday"
            : d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) })
    return (
        <div className="flex items-center gap-3 pt-3 first:pt-0">
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[--muted]">{label}</span>
            <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
        </div>
    )
}

export function TimelineSkeleton({ count = 4 }: { count?: number }) {
    return (
        <div className="space-y-3">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="flex gap-3 rounded-2xl bg-white/[0.025] p-4 ring-1 ring-white/[0.06]">
                    <Skeleton className="size-10 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-4 w-4/5" />
                        <Skeleton className="h-4 w-2/3" />
                    </div>
                </div>
            ))}
        </div>
    )
}

function TimelineEmpty() {
    return (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-white/[0.02] px-6 py-14 text-center ring-1 ring-white/[0.06]">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300"><LuSparkles className="size-6" /></span>
            <p className="font-semibold">Nothing here yet</p>
            <p className="max-w-xs text-sm text-[--muted]">Watch something, unlock an achievement or post a thought, and it shows up here.</p>
        </div>
    )
}

export function TimelineComposer({ wallProfileId, placeholder, author }: {
    wallProfileId: number
    placeholder: string
    author?: { name?: string, avatar?: string, anilistAvatar?: string, avatarPath?: string } | null
}) {
    const [content, setContent] = React.useState("")
    const [isSpoiler, setIsSpoiler] = React.useState(false)
    const [focused, setFocused] = React.useState(false)
    const { mutate, isPending } = useCreateProfilePost()
    const textRef = React.useRef<HTMLTextAreaElement>(null)

    // Grow with the text, up to a point.
    React.useLayoutEffect(() => {
        const el = textRef.current
        if (!el) return
        el.style.height = "auto"
        el.style.height = `${Math.min(el.scrollHeight, 320)}px`
    }, [content])

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

    const avatar = author?.avatar || author?.avatarPath || author?.anilistAvatar
    const open = focused || !!content

    return (
        <div
            data-timeline-composer
            className={cn(
                "rounded-2xl bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-3 ring-1 transition-shadow sm:p-4",
                open ? "ring-brand-400/40 shadow-[0_10px_40px_-20px_rgb(var(--color-brand-500)/0.7)]" : "ring-white/[0.08]",
            )}
        >
            <div className="flex gap-3">
                <AvatarImg src={avatar} name={author?.name} className="size-10" />
                <textarea
                    ref={textRef}
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder={placeholder}
                    rows={open ? 3 : 1}
                    maxLength={4000}
                    className="min-h-[2.5rem] w-full resize-none border-0 bg-transparent py-2 text-[0.95rem] leading-relaxed placeholder:text-[--muted] focus:outline-none focus:ring-0"
                    onKeyDown={e => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit()
                    }}
                />
            </div>
            <div className={cn("grid transition-all duration-200", open ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                <div className="overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => setIsSpoiler(s => !s)}
                                className={cn(
                                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition",
                                    isSpoiler ? "bg-amber-500/15 text-amber-200 ring-amber-400/40" : "text-[--muted] ring-white/10 hover:text-white",
                                )}
                            >
                                <LuEyeOff className="size-3.5" /> Spoiler
                            </button>
                            <span className="hidden text-xs text-[--muted] sm:inline">**bold**, _italic_, ~!spoiler!~, links and images · Ctrl+Enter</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className={cn("text-xs tabular-nums", content.length > 3800 ? "text-amber-300" : "text-[--muted]")}>{content.length}/4000</span>
                            <Button
                                size="sm"
                                intent="primary"
                                loading={isPending}
                                disabled={!content.trim()}
                                onMouseDown={e => e.preventDefault()}
                                onClick={submit}
                                leftIcon={<LuSend className="size-3.5" />}
                                className="rounded-full px-4"
                            >
                                Post
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function AvatarImg({ src, name, className }: { src?: string, name?: string, className?: string }) {
    return src
        ? <img src={src} alt={name ?? ""} className={cn("shrink-0 rounded-full object-cover ring-2 ring-white/10", className)} />
        : <div className={cn("flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/40 to-indigo-600/40 font-bold ring-2 ring-white/10", className)}>{name?.[0]?.toUpperCase() ?? "?"}</div>
}

function ProfileName({ p }: { p?: TimelineProfileSummary }) {
    if (!p) return null
    return (
        <SeaLink href={`/profile/user?id=${p.id}`} className="font-semibold hover:underline" style={p.nameColorCss ? { color: p.nameColorCss } : undefined}>
            {p.name}
        </SeaLink>
    )
}

function Avatar({ p, className = "size-10" }: { p?: TimelineProfileSummary, className?: string }) {
    const img = <AvatarImg src={p?.avatar} name={p?.name} className={className} />
    return p ? <SeaLink href={`/profile/user?id=${p.id}`} className="shrink-0">{img}</SeaLink> : img
}

// ── Cards ──────────────────────────────────────────────────────────────────────

const KIND_ACCENT: Record<string, string> = {
    post: "before:bg-brand-400",
    watch: "before:bg-emerald-400",
    read: "before:bg-teal-400",
    achievement: "before:bg-amber-400",
    news: "before:bg-sky-400",
    other: "before:bg-white/30",
}

function cardKind(item: TimelineFeedItem) {
    if (item.kind === "news") return "news"
    if (item.kind === "post") return "post"
    switch (item.activity?.eventType) {
        case "episode_watched": return "watch"
        case "manga_chapter_read": return "read"
        case "achievement_unlocked": return "achievement"
    }
    return "other"
}

export function TimelineCard({ item }: { item: TimelineFeedItem }) {
    const kind = cardKind(item)
    return (
        <div
            data-timeline-card
            data-kind={item.kind}
            className={cn(
                "group/tl relative overflow-hidden rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.07] transition duration-200",
                "hover:-translate-y-px hover:bg-white/[0.045] hover:ring-white/[0.12]",
                "before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r-full before:opacity-70",
                KIND_ACCENT[kind],
            )}
        >
            {kind === "news" && item.news
                ? <NewsCardBody item={item} />
                : kind === "achievement"
                    ? <AchievementCardBody item={item} />
                    : (kind === "watch" || kind === "read" || kind === "other") && item.kind === "activity"
                        ? <ActivityCardBody item={item} />
                        : <PostCardBody item={item} />}
            <CardActions item={item} />
        </div>
    )
}

function CardHeader({ item, children }: { item: TimelineFeedItem, children?: React.ReactNode }) {
    return (
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-sm">
            <ProfileName p={item.author} />
            {item.wallProfile && <>
                <span className="text-[--muted]">→</span>
                <ProfileName p={item.wallProfile} />
            </>}
            {children}
            <span className="ml-auto shrink-0 pl-2 text-xs text-[--muted]" title={new Date(item.createdAt).toLocaleString()}>
                {timeAgo(item.createdAt)}
            </span>
        </div>
    )
}

function PostCardBody({ item }: { item: TimelineFeedItem }) {
    const [editing, setEditing] = React.useState(false)
    return (
        <div className="flex gap-3 p-4 pb-2">
            <Avatar p={item.author} />
            <div className="min-w-0 flex-1 space-y-1.5">
                <CardHeader item={item}>
                    {item.author?.displayTitle && <span className="truncate text-xs text-[--muted]">{item.author.displayTitle}</span>}
                </CardHeader>
                {!editing ? (
                    <div className="whitespace-pre-wrap break-words text-[0.95rem] leading-relaxed text-white/90">
                        {item.isSpoiler ? <SpoilerBlock><RichText text={item.content ?? ""} /></SpoilerBlock> : <RichText text={item.content ?? ""} />}
                        {item.isEdited && <span className="ml-2 text-xs text-[--muted]">(edited)</span>}
                    </div>
                ) : <EditPost item={item} onDone={() => setEditing(false)} />}
            </div>
            {item.canEdit && !editing && (
                <button
                    onClick={() => setEditing(true)}
                    className="h-fit rounded-full p-1.5 text-[--muted] opacity-0 transition hover:bg-white/10 hover:text-white group-hover/tl:opacity-100"
                    title="Edit"
                >
                    <LuPencil className="size-3.5" />
                </button>
            )}
        </div>
    )
}

function ActivityCardBody({ item }: { item: TimelineFeedItem }) {
    const a = item.activity!
    const href = a.mediaId ? `/${a.mediaType === "manga" ? "manga/entry" : "entry"}?id=${a.mediaId}` : null
    const meta = safeJson(a.metadata)
    const total = Number(meta?.totalEpisodes ?? meta?.totalChapters ?? 0) || 0
    const to = item.episodeTo ?? Number(meta?.episode ?? meta?.chapter ?? 0)
    const pct = total > 0 && to > 0 ? Math.min(100, (to / total) * 100) : null
    const isRead = a.eventType === "manga_chapter_read"

    const title = a.mediaTitle ?? (a.mediaId ? `#${a.mediaId}` : "")
    const mediaLink = href ? <SeaLink href={href} className="font-medium text-white hover:text-brand-200 hover:underline">{title}</SeaLink> : <span>{title}</span>

    let line: React.ReactNode
    switch (a.eventType) {
        case "episode_watched": {
            const from = item.episodeFrom ?? 0
            line = <>watched {from && to && from !== to ? <>episodes <b className="text-white">{from} – {to}</b></> : <>episode <b className="text-white">{to || from}</b></>} of {mediaLink}</>
            break
        }
        case "manga_chapter_read":
            line = <>read {to ? <>chapter <b className="text-white">{to}</b> of </> : "a chapter of "}{mediaLink}</>
            break
        case "status_changed":
            line = <>set {mediaLink} to <b className="text-white">{String(meta?.status ?? meta?.newStatus ?? "a new status").toLowerCase()}</b></>
            break
        case "anilist_entry_edited":
            line = <>updated {mediaLink}</>
            break
        default:
            line = <>{a.eventType.replaceAll("_", " ")} {mediaLink}</>
    }

    return (
        <div className="relative">
            {a.mediaImage && (
                <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.12] blur-2xl" style={{ backgroundImage: `url(${a.mediaImage})`, backgroundSize: "cover", backgroundPosition: "center" }} />
            )}
            <div className="relative flex gap-3 p-4 pb-2">
                {a.mediaImage && href ? (
                    <SeaLink href={href} className="shrink-0">
                        <img src={a.mediaImage} alt="" className="aspect-[2/3] w-14 rounded-lg object-cover shadow-lg ring-1 ring-white/10 transition group-hover/tl:ring-white/25" />
                    </SeaLink>
                ) : <Avatar p={item.author} />}
                <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                        {a.mediaImage && <Avatar p={item.author} className="size-6" />}
                        <CardHeader item={item} />
                    </div>
                    <p className="text-sm leading-snug text-white/70">
                        <span className="mr-1.5 inline-flex translate-y-0.5 text-emerald-300">{isRead ? <LuBookOpen className="size-4" /> : <LuTv className="size-4" />}</span>
                        {line}
                    </p>
                    {pct !== null && (
                        <div className="flex items-center gap-2 pt-0.5">
                            <div className="h-1.5 max-w-[14rem] flex-1 overflow-hidden rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs tabular-nums text-[--muted]">{to}/{total}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

const TIER_STYLE = [
    "from-amber-700/40 to-amber-900/30 text-amber-200 ring-amber-600/40 shadow-amber-700/30", // bronze
    "from-slate-300/30 to-slate-500/20 text-slate-100 ring-slate-300/40 shadow-slate-300/20", // silver
    "from-yellow-400/35 to-amber-600/25 text-yellow-100 ring-yellow-400/50 shadow-yellow-500/40", // gold
    "from-cyan-300/35 to-indigo-500/25 text-cyan-50 ring-cyan-300/50 shadow-cyan-400/40", // platinum+
]
const tierStyle = (tier: number) => TIER_STYLE[Math.min(Math.max(tier, 1), TIER_STYLE.length) - 1]

function AchievementBadge({ a, size = "lg" }: { a: TimelineAchievement, size?: "lg" | "sm" }) {
    return (
        <span
            className={cn(
                "flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 shadow-lg [&_svg]:size-full",
                tierStyle(a.tier),
                size === "lg" ? "size-12 p-2.5" : "size-8 p-1.5",
            )}
            title={a.name}
            // Icon markup comes from the server's own achievement definitions.
            dangerouslySetInnerHTML={a.iconSvg ? { __html: a.iconSvg } : undefined}
        >
            {a.iconSvg ? undefined : <LuTrophy className="size-full" />}
        </span>
    )
}

function AchievementCardBody({ item }: { item: TimelineFeedItem }) {
    const list = item.achievements?.length ? item.achievements : [{ key: "", name: String(safeJson(item.activity?.metadata)?.name ?? "an achievement"), tier: 1 }]
    const [open, setOpen] = React.useState(false)
    const first = list[0]
    const totalXp = list.reduce((s, a) => s + (a.xp ?? 0), 0)
    const many = list.length > 1

    return (
        <div className="flex gap-3 p-4 pb-2">
            <Avatar p={item.author} />
            <div className="min-w-0 flex-1 space-y-2">
                <CardHeader item={item}>
                    <span className="text-[--muted]">unlocked {many ? <b className="text-white">{list.length} achievements</b> : "an achievement"}</span>
                </CardHeader>
                {!many ? (
                    <div className="flex items-center gap-3 rounded-xl bg-black/20 p-2.5 ring-1 ring-white/[0.06]">
                        <AchievementBadge a={first} />
                        <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold">
                                {first.name}
                                {first.tierName && <span className="ml-2 rounded-md bg-white/10 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-white/80">{first.tierName}</span>}
                            </p>
                            {first.description && <p className="line-clamp-2 text-xs text-[--muted]">{first.description}</p>}
                        </div>
                        {!!first.xp && <span className="shrink-0 rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-bold text-amber-200 ring-1 ring-amber-400/30">+{first.xp} XP</span>}
                    </div>
                ) : (
                    <div className="space-y-2">
                        <button onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-2 rounded-xl bg-black/20 p-2.5 text-left ring-1 ring-white/[0.06] transition hover:ring-white/15">
                            <div className="flex -space-x-2">
                                {list.slice(0, 6).map((a, i) => <span key={`${a.key}-${a.tier}-${i}`} className="rounded-xl ring-2 ring-[--background]"><AchievementBadge a={a} size="sm" /></span>)}
                            </div>
                            <span className="min-w-0 flex-1 truncate text-sm text-white/80">{list.map(a => a.name).slice(0, 3).join(", ")}{list.length > 3 ? ` and ${list.length - 3} more` : ""}</span>
                            {totalXp > 0 && <span className="shrink-0 rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-bold text-amber-200">+{totalXp} XP</span>}
                            <LuChevronDown className={cn("size-4 shrink-0 text-[--muted] transition-transform", open && "rotate-180")} />
                        </button>
                        {open && (
                            <div className="grid gap-1.5 sm:grid-cols-2 animate-in fade-in slide-in-from-top-1">
                                {list.map((a, i) => (
                                    <div key={`${a.key}-${a.tier}-${i}`} className="flex items-center gap-2.5 rounded-lg bg-white/[0.03] p-2 ring-1 ring-white/[0.05]">
                                        <AchievementBadge a={a} size="sm" />
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">{a.name}{a.tierName ? <span className="text-[--muted]"> · {a.tierName}</span> : null}</p>
                                            {a.description && <p className="truncate text-xs text-[--muted]">{a.description}</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

function NewsCardBody({ item }: { item: TimelineFeedItem }) {
    const lead = item.news?.lead
    const digest = item.news?.digest ?? []
    const [showAll, setShowAll] = React.useState(false)
    const visible = showAll ? digest : digest.slice(0, 4)

    return (
        <div className="space-y-0">
            {lead && (
                <a href={lead.link} target="_blank" rel="noopener noreferrer nofollow" className="block">
                    {lead.image && (
                        <div className="relative aspect-[16/7] overflow-hidden">
                            <img src={lead.image} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition duration-500 group-hover/tl:scale-[1.02]" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                        </div>
                    )}
                    <div className="space-y-1.5 p-4 pb-2">
                        <NewsMetaRow brief={lead} at={item.createdAt} />
                        <p className="text-base font-semibold leading-snug text-white transition group-hover/tl:text-sky-100">{lead.title}</p>
                        {lead.description && <p className="line-clamp-2 text-sm text-[--muted]">{lead.description}</p>}
                        {lead.matchedTitle && <MatchChip brief={lead} />}
                    </div>
                </a>
            )}
            {digest.length > 0 && (
                <div className={cn("p-4 pb-2", lead && "pt-1")}>
                    {!lead && (
                        <div className="mb-2 flex items-center gap-2 text-sm">
                            <span className="flex size-7 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300"><LuNewspaper className="size-4" /></span>
                            <span className="font-semibold">{digest.length} {digest.length === 1 ? "headline" : "headlines"}</span>
                            <span className="ml-auto text-xs text-[--muted]">{timeAgo(item.createdAt)}</span>
                        </div>
                    )}
                    {lead && <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[--muted]">More headlines</p>}
                    <div className="divide-y divide-white/[0.05] overflow-hidden rounded-xl bg-black/20 ring-1 ring-white/[0.06]">
                        {visible.map(b => (
                            <a key={b.link} href={b.link} target="_blank" rel="noopener noreferrer nofollow" className="group/nr flex items-center gap-3 px-3 py-2 transition hover:bg-white/[0.04]">
                                {b.image
                                    ? <img src={b.image} alt="" loading="lazy" className="size-10 shrink-0 rounded-md object-cover" />
                                    : <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-white/[0.04] text-[--muted]"><LuNewspaper className="size-4" /></span>}
                                <div className="min-w-0 flex-1">
                                    <p className="line-clamp-1 text-sm font-medium group-hover/nr:text-sky-100">{b.title}</p>
                                    <p className="truncate text-xs text-[--muted]">{b.feedTitle}{b.matchedTitle ? ` · ${b.matchedTitle} (${b.matchedList})` : ""}</p>
                                </div>
                                <LuExternalLink className="size-3.5 shrink-0 text-[--muted] opacity-0 transition group-hover/nr:opacity-100" />
                            </a>
                        ))}
                    </div>
                    {digest.length > 4 && (
                        <button onClick={() => setShowAll(s => !s)} className="mt-2 text-xs font-medium text-sky-300 hover:text-sky-200">
                            {showAll ? "Show fewer" : `Show all ${digest.length}`}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}

function NewsMetaRow({ brief, at }: { brief: TimelineNewsBrief, at: string }) {
    return (
        <div className="flex items-center gap-2 text-xs text-[--muted]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-2 py-0.5 font-medium text-sky-200">
                <LuNewspaper className="size-3" /> {brief.feedTitle || "News"}
            </span>
            <span className="ml-auto">{timeAgo(at)}</span>
        </div>
    )
}

function MatchChip({ brief }: { brief: TimelineNewsBrief }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/15 px-2.5 py-0.5 text-xs text-brand-100 ring-1 ring-brand-400/30">
            <LuSparkles className="size-3" /> {brief.matchedTitle} is on your {brief.matchedList} list
        </span>
    )
}

function CardActions({ item }: { item: TimelineFeedItem }) {
    const [liked, setLiked] = React.useState(item.likedByMe)
    const [likeCount, setLikeCount] = React.useState(item.likeCount)
    const [repliesOpen, setRepliesOpen] = React.useState(false)
    const [pop, setPop] = React.useState(false)
    const { mutate: toggleLike } = useToggleTimelineLike()
    const { mutate: deletePost } = useDeleteProfilePost(item.postId ?? 0)

    React.useEffect(() => {
        setLiked(item.likedByMe)
        setLikeCount(item.likeCount)
    }, [item.likedByMe, item.likeCount])

    const onLike = () => {
        // Optimistic; the server answer settles it.
        if (!liked) {
            setPop(true)
            setTimeout(() => setPop(false), 350)
        }
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
        <div className="px-4 pb-3">
            <div className="flex items-center gap-1 pl-[3.25rem] text-sm text-[--muted]">
                <button
                    className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition hover:bg-red-500/10 hover:text-red-300", liked && "text-red-400")}
                    onClick={onLike}
                    aria-label={liked ? "Unlike" : "Like"}
                >
                    <LuHeart className={cn("size-4 transition-transform", liked && "fill-current", pop && "scale-125")} />
                    {likeCount > 0 && <span className="tabular-nums">{likeCount}</span>}
                </button>
                <button
                    className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition hover:bg-white/[0.06] hover:text-white", repliesOpen && "text-white")}
                    onClick={() => setRepliesOpen(o => !o)}
                    aria-label="Replies"
                >
                    <LuMessageCircle className="size-4" />
                    {item.replyCount > 0 && <span className="tabular-nums">{item.replyCount}</span>}
                </button>
                {item.canDelete && (
                    <button
                        className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 opacity-0 transition hover:bg-red-500/10 hover:text-red-300 group-hover/tl:opacity-100 focus:opacity-100"
                        onClick={() => {
                            if (window.confirm("Delete this post?")) deletePost()
                        }}
                        aria-label="Delete"
                    >
                        <LuTrash2 className="size-4" />
                    </button>
                )}
            </div>
            {repliesOpen && <TimelineReplies targetKey={item.key} />}
        </div>
    )
}

function EditPost({ item, onDone }: { item: TimelineFeedItem, onDone: () => void }) {
    const [content, setContent] = React.useState(item.content ?? "")
    const [isSpoiler, setIsSpoiler] = React.useState(!!item.isSpoiler)
    const { mutate, isPending } = useUpdateProfilePost(item.postId ?? 0)
    return (
        <div className="space-y-2">
            <Textarea value={content} onValueChange={setContent} maxLength={4000} />
            <div className="flex items-center justify-end gap-2">
                <button
                    type="button"
                    onClick={() => setIsSpoiler(s => !s)}
                    className={cn("mr-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ring-1", isSpoiler ? "bg-amber-500/15 text-amber-200 ring-amber-400/40" : "text-[--muted] ring-white/10")}
                >
                    <LuEyeOff className="size-3.5" /> Spoiler
                </button>
                <Button size="sm" intent="gray-subtle" onClick={onDone}>Cancel</Button>
                <Button size="sm" intent="primary" loading={isPending} leftIcon={<LuPenLine className="size-3.5" />} onClick={() => mutate({ content, isSpoiler }, { onSuccess: onDone })}>Save</Button>
            </div>
        </div>
    )
}

function TimelineReplies({ targetKey }: { targetKey: string }) {
    const me = useAtomValue(currentProfileAtom)
    const { data: replies, isLoading, refetch, isFetching } = useTimelineReplies(targetKey, true)
    const { mutate: create, isPending } = useCreateTimelineReply(targetKey)
    const { mutate: remove } = useDeleteTimelineReply(targetKey)
    const [text, setText] = React.useState("")

    const submit = () => {
        const t = text.trim()
        if (!t) return
        create({ targetKey, content: t }, { onSuccess: () => setText("") })
    }

    return (
        <div className="ml-[3.25rem] mt-2 space-y-3 border-l-2 border-white/[0.07] pl-4 animate-in fade-in slide-in-from-top-1" data-timeline-replies>
            {isLoading && <p className="text-xs text-[--muted]">Loading replies…</p>}
            {replies?.map(r => (
                <div key={r.id} className="group/reply flex gap-2.5 text-sm">
                    <Avatar p={r.author} className="size-7" />
                    <div className="min-w-0 flex-1 rounded-xl bg-white/[0.03] px-3 py-2 ring-1 ring-white/[0.05]">
                        <div className="flex items-baseline gap-2">
                            <ProfileName p={r.author} />
                            <span className="text-xs text-[--muted]">{timeAgo(r.createdAt)}</span>
                            {r.canDelete && (
                                <button className="ml-auto text-xs text-[--muted] opacity-0 transition hover:text-red-400 group-hover/reply:opacity-100" onClick={() => remove(r.id)}>
                                    <LuTrash2 />
                                </button>
                            )}
                        </div>
                        <div className="whitespace-pre-wrap break-words text-white/85"><RichText text={r.content} /></div>
                    </div>
                </div>
            ))}
            {!!me && (
                <div className="flex items-end gap-2">
                    <Textarea
                        value={text}
                        onValueChange={setText}
                        placeholder="Write a reply…"
                        className="min-h-[2.5rem] rounded-xl"
                        maxLength={2000}
                        onKeyDown={e => {
                            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit()
                        }}
                    />
                    <Button size="sm" intent="primary-subtle" loading={isPending} disabled={!text.trim()} onClick={submit} className="rounded-full">Reply</Button>
                    {!isLoading && (
                        <button onClick={() => refetch()} className="mb-2 text-[--muted] hover:text-white" title="Refresh replies">
                            <LuRefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}

function SpoilerBlock({ children }: { children: React.ReactNode }) {
    const [shown, setShown] = React.useState(false)
    return (
        <span
            className={cn("cursor-pointer rounded px-1 transition", !shown && "select-none bg-[--subtle] blur-sm")}
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
        else if (m[7]) nodes.push(<img key={k} src={m[8]} alt="" className="my-1 inline-block max-h-80 rounded-lg" loading="lazy" />)
        else if (m[9]) {
            const url = m[9]
            nodes.push(IMG_RE.test(url)
                ? <img key={k} src={url} alt="" className="my-1 block max-h-80 rounded-lg" loading="lazy" />
                : <a key={k} href={url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-brand-300 underline">{url}</a>)
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

export function timeAgo(iso: string) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000
    if (diff < 60) return "just now"
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`
    return new Date(iso).toLocaleDateString()
}
