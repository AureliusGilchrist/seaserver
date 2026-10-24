"use client"

import {
    formatNewsDate,
    useGetNewsFeed,
    useGetNewsNotifications,
    useGetProfilesTimeline,
    type NewsNotification,
    type ProfileTimelineEvent,
    type RssItem,
} from "@/api/hooks/news.hooks"
import { useGetProfilesActivity } from "@/api/hooks/profile-activity.hooks"
import { useMarkAllNotificationsRead, useMarkNotificationRead } from "@/api/hooks/notifications.hooks"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { SeaLink } from "@/components/shared/sea-link"
import { usePersonalSettings } from "@/app/(main)/_hooks/use-personal-settings"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { BiCheckDouble } from "react-icons/bi"
import {
    LuActivity,
    LuBell,
    LuBookOpen,
    LuChevronDown,
    LuExternalLink,
    LuPlay,
    LuRefreshCw,
    LuRss,
    LuStar,
    LuTv,
} from "react-icons/lu"

/**
 * The News page — the widget's "Show more" tab, opened up.
 *
 * The home widget keeps the rack short; this page holds the whole catch, as many of the
 * freshest entries as Personal settings asks for, filterable by feed. Entries open the source
 * in a new tab.
 */
export default function Page() {
    const { data, isLoading, isError, refetch, isRefetching } = useGetNewsFeed()
    const personal = usePersonalSettings()

    // The timeline: RSS notifications five at a time, alongside what each profile has
    // been doing. One "Load more" advances both feeds.
    const newsNotifs = useGetNewsNotifications()
    const profilesTimeline = useGetProfilesTimeline()
    const profilesActivity = useGetProfilesActivity()

    const newsItems = React.useMemo(
        () => (newsNotifs.data?.pages ?? []).flatMap(page => page?.notifications ?? []),
        [newsNotifs.data],
    )
    const timelineEvents = React.useMemo(
        () => (profilesTimeline.data?.pages ?? []).flatMap(page => page?.events ?? []),
        [profilesTimeline.data],
    )
    const canLoadMoreTimeline = Boolean(newsNotifs.hasNextPage || profilesTimeline.hasNextPage)
    const loadMoreTimeline = () => {
        if (newsNotifs.hasNextPage) newsNotifs.fetchNextPage()
        if (profilesTimeline.hasNextPage) profilesTimeline.fetchNextPage()
    }

    const items = React.useMemo(() => data?.items ?? [], [data?.items])
    const shown = React.useMemo(
        () => items.slice(0, Math.max(10, Math.min(200, personal.newsFeedShowMoreCount))),
        [items, personal.newsFeedShowMoreCount],
    )

    const feeds = React.useMemo(() => {
        const seen = new Map<string, number>()
        for (const item of shown) {
            const name = item.feedTitle || "Unknown feed"
            seen.set(name, (seen.get(name) ?? 0) + 1)
        }
        return [...seen.entries()].sort((a, b) => b[1] - a[1])
    }, [shown])

    const [activeFeed, setActiveFeed] = React.useState<string | null>(null)
    const filtered = React.useMemo(
        () => activeFeed ? shown.filter(item => (item.feedTitle || "Unknown feed") === activeFeed) : shown,
        [shown, activeFeed],
    )

    return (
        <>
            <CustomLibraryBanner discrete />
            <PageWrapper className="p-4 sm:p-8 space-y-6 pb-16">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="flex size-11 items-center justify-center rounded-xl bg-brand-500/15 ring-1 ring-brand-500/30">
                                <LuRss className="size-5 text-[--brand]" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">News</h1>
                                <p className="text-sm text-[--muted]">
                                    The freshest from your feeds
                                    {data?.updatedAt ? <> — updated {formatNewsDate(data.updatedAt)}</> : null}.
                                </p>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => refetch()}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 backdrop-blur-md transition hover:bg-white/10 hover:text-white"
                    >
                        <LuRefreshCw className={cn("size-4", isRefetching && "animate-spin")} />
                        Refresh
                    </button>
                </div>

                {isLoading && <LoadingSpinner />}

                {/* ─── Timeline: RSS notifications + what each profile was doing ─── */}
                <NewsTimeline
                    notifications={newsItems}
                    events={timelineEvents}
                    activity={profilesActivity.data?.items ?? []}
                    canLoadMore={canLoadMoreTimeline}
                    onLoadMore={loadMoreTimeline}
                    isFetchingMore={newsNotifs.isFetchingNextPage || profilesTimeline.isFetchingNextPage}
                />
                {isError && (
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-8 text-center backdrop-blur-md">
                        <p className="text-[--muted]">Could not load the news feeds. Check your connection and try again.</p>
                    </div>
                )}

                {/* A feed that failed to load is not fatal — the others still show — but silently
                    dropping it would look like the source simply went quiet. */}
                {!isError && !!data?.errors?.length && (
                    <div className="rounded-2xl border border-amber-300/25 bg-amber-400/[0.07] p-4 backdrop-blur-md">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-200/90">
                            <LuBell className="size-3.5" />
                            {data.errors.length === 1 ? "A feed could not be loaded" : `${data.errors.length} feeds could not be loaded`}
                        </div>
                        <ul className="mt-2 space-y-1">
                            {data.errors.slice(0, 5).map((err, i) => (
                                <li key={i} className="text-xs text-white/65">{err}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {!isLoading && !isError && shown.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-10 text-center backdrop-blur-md">
                        <LuRss className="mx-auto mb-3 size-8 text-[--muted]" />
                        <p className="text-sm text-[--muted]">
                            Nothing here yet — feeds refresh every 15 minutes. Add or change them under
                            Settings → App.
                        </p>
                    </div>
                )}

                {!isLoading && !isError && shown.length > 0 && (
                    <>
                        <div className="flex items-center gap-2 pt-2">
                            <LuRss className="size-4 text-[--muted]" />
                            <h2 className="text-sm font-semibold uppercase tracking-wider text-[--muted]">Feed</h2>
                        </div>
                        {feeds.length > 1 && (
                            <div className="flex flex-wrap gap-2">
                                <FeedChip
                                    label="All feeds"
                                    count={shown.length}
                                    active={activeFeed === null}
                                    onClick={() => setActiveFeed(null)}
                                />
                                {feeds.map(([name, count]) => (
                                    <FeedChip
                                        key={name}
                                        label={name}
                                        count={count}
                                        active={activeFeed === name}
                                        onClick={() => setActiveFeed(current => current === name ? null : name)}
                                    />
                                ))}
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                            {filtered.map((item, idx) => (
                                <NewsCard key={`${item.link}-${idx}`} item={item} />
                            ))}
                        </div>
                    </>
                )}
            </PageWrapper>
        </>
    )
}

function FeedChip({ label, count, active, onClick }: {
    label: string
    count: number
    active: boolean
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "flex max-w-[14rem] items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                active
                    ? "border-[--brand]/60 bg-[--brand]/15 text-white"
                    : "border-white/10 bg-black/25 text-white/70 backdrop-blur-md hover:bg-black/40 hover:text-white",
            )}
        >
            <span className="truncate">{label}</span>
            <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                active ? "bg-[--brand]/30 text-white" : "bg-white/10 text-white/60",
            )}>
                {count}
            </span>
        </button>
    )
}

/** The full-page card: big image when the feed supplies one, title, snippet, feed, age. */
function NewsCard({ item }: { item: RssItem }) {
    return (
        <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/25 shadow-lg shadow-black/20 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-[--brand]/60 hover:bg-black/40 hover:shadow-xl hover:shadow-[--brand]/10"
        >
            <div className="pointer-events-none absolute -right-8 -top-8 z-0 size-28 rounded-full bg-[--brand]/15 blur-2xl opacity-0 transition-opacity group-hover:opacity-100" />
            {item.image && (
                <div className="relative z-[1] h-36 w-full overflow-hidden">
                    <img
                        src={item.image}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                </div>
            )}
            <div className={cn("relative z-[1] flex flex-1 flex-col p-4", item.image && "pt-3")}>
                <div className="flex items-center gap-2 text-xs text-[--muted]">
                    {!!item.feedTitle && (
                        <span className="max-w-[10rem] truncate rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                            {item.feedTitle}
                        </span>
                    )}
                    {!!item.publishedAt && <span>{formatNewsDate(item.publishedAt)}</span>}
                    <LuExternalLink className="ml-auto size-3.5 text-white/30 transition-colors group-hover:text-[--brand]" />
                </div>
                <p className="mt-2 line-clamp-3 font-semibold leading-snug transition-colors group-hover:text-[--brand]">
                    {item.title}
                </p>
                {!!item.description && (
                    <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-[--muted]">{item.description}</p>
                )}
                {!!item.categories?.length && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {item.categories.slice(0, 4).map(cat => (
                            <span
                                key={cat}
                                className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60"
                            >
                                {cat}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </a>
    )
}

// ────────────────────────── Timeline ──────────────────────────
//
// One chronological feed of two sources: the server's RSS notifications (delivered five at
// a time — this is a digest, not a firehose) and the activity events of every profile on
// the server ("Aurelius watched Episode 4 of Frieren"). Profiles doing something right now
// sit on top as live rows.

type ActivityItem = {
    profileId: number
    username: string
    isOnline: boolean
    kind: string // "watching" | "reading" | "idle"
    mediaTitle?: string
    episodeNumber?: number
    chapterNumber?: number
    progressPercent?: number
}

type TimelineRow = {
    key: string
    at: number // epoch ms
    kind: "news" | "event"
    notification?: NewsNotification
    event?: ProfileTimelineEvent
}

function NewsTimeline({ notifications, events, activity, canLoadMore, onLoadMore, isFetchingMore }: {
    notifications: NewsNotification[]
    events: ProfileTimelineEvent[]
    activity: ActivityItem[]
    canLoadMore: boolean
    onLoadMore: () => void
    isFetchingMore: boolean
}) {
    const rows = React.useMemo(() => {
        const out: TimelineRow[] = []
        for (const n of notifications) {
            out.push({ key: `n-${n.id}`, at: new Date(n.createdAt).getTime(), kind: "news", notification: n })
        }
        for (const e of events) {
            out.push({ key: `e-${e.id}`, at: new Date(e.createdAt).getTime(), kind: "event", event: e })
        }
        // A row whose clock could not be parsed sorts last instead of throwing the merge off.
        return out.sort((a, b) => (Number.isNaN(b.at) ? -1 : Number.isNaN(a.at) ? 1 : b.at - a.at))
    }, [notifications, events])

    // Live rows: profiles currently watching or reading. Idle profiles are not news.
    const live = React.useMemo(
        () => activity.filter(a => (a.kind === "watching" || a.kind === "reading") && a.mediaTitle),
        [activity],
    )

    const { mutate: markAllRead } = useMarkAllNotificationsRead()

    if (rows.length === 0 && live.length === 0) return null

    return (
        <section className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-6 backdrop-blur-md">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <LuActivity className="size-4 text-[--brand]" />
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-[--muted]">Timeline</h2>
                </div>
                <button
                    type="button"
                    onClick={() => markAllRead()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                    <BiCheckDouble className="size-3.5" />
                    Mark read
                </button>
            </div>

            {live.length > 0 && (
                <div className="mb-5 flex flex-col gap-2">
                    {live.map(item => (
                        <div key={item.profileId} className="flex items-center gap-2.5 text-sm">
                            <span className="relative flex size-2.5 shrink-0">
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
                            </span>
                            <span className="font-medium">{item.username}</span>
                            <span className="text-[--muted]">
                                {item.kind === "watching"
                                    ? <>is watching <Em>{item.mediaTitle}</Em>{item.episodeNumber ? <> — EP{item.episodeNumber}</> : null}</>
                                    : <>is reading <Em>{item.mediaTitle}</Em>{item.chapterNumber ? <> — CH{item.chapterNumber}</> : null}</>}
                            </span>
                            {!!item.progressPercent && item.progressPercent > 0 && (
                                <span className="text-xs text-[--muted] opacity-70">{Math.round(item.progressPercent)}%</span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {rows.length > 0 && (
                <div className="flex flex-col">
                    {rows.map(row => (
                        <TimelineRowItem key={row.key} row={row} />
                    ))}
                </div>
            )}

            {canLoadMore && (
                <button
                    type="button"
                    onClick={onLoadMore}
                    disabled={isFetchingMore}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                    <LuChevronDown className={cn("size-4", isFetchingMore && "animate-bounce")} />
                    Load more
                </button>
            )}
        </section>
    )
}

function Em({ children }: { children: React.ReactNode }) {
    return <span className="font-medium text-white/90">{children}</span>
}

function TimelineRowItem({ row }: { row: TimelineRow }) {
    if (row.kind === "news" && row.notification) {
        return <NewsRow notification={row.notification} at={row.at} />
    }
    if (row.kind === "event" && row.event) {
        return <EventRow event={row.event} at={row.at} />
    }
    return null
}

/** An RSS notification row: dot, thumb, headline, feed chip, age; opens the article. */
function NewsRow({ notification, at }: { notification: NewsNotification, at: number }) {
    const { mutate: markRead } = useMarkNotificationRead()
    const openArticle = () => {
        if (!notification.isRead) markRead({ notificationId: notification.id })
    }
    const meta = React.useMemo(() => {
        try { return JSON.parse(notification.metadata || "{}") as { link?: string, feedTitle?: string } } catch { return {} }
    }, [notification.metadata])

    const content = (
        <>
            {notification.imageUrl
                ? <img src={notification.imageUrl} alt="" loading="lazy" className="size-11 shrink-0 rounded-lg object-cover border border-[--border]" />
                : <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[--brand]/10 border border-[--brand]/20"><LuRss className="size-4 text-[--brand]" /></div>}
            <div className="min-w-0 flex-1">
                <p className={cn("text-sm leading-snug line-clamp-2", !notification.isRead && "font-medium")}>{notification.title}</p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-[--muted]">
                    {!!meta.feedTitle && (
                        <span className="max-w-[9rem] truncate rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">{meta.feedTitle}</span>
                    )}
                    <span>{Number.isNaN(at) ? "" : formatNewsDate(at / 1000)}</span>
                    {meta.link && <LuExternalLink className="size-3 opacity-50" />}
                </div>
            </div>
            {!notification.isRead && <span className="mt-1 size-2 shrink-0 rounded-full bg-[--brand]" />}
        </>
    )

    return (
        <div className="flex items-start gap-3 pb-4">
            <TimelineDot tone="brand" />
            {meta.link
                ? <a href={meta.link} target="_blank" rel="noopener noreferrer" onClick={openArticle} className="flex min-w-0 flex-1 items-start gap-2.5 rounded-lg transition-colors hover:text-[--brand]">{content}</a>
                : <button type="button" onClick={openArticle} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">{content}</button>}
        </div>
    )
}

/** An activity row: what a profile did, with its name and the media it happened on. */
function EventRow({ event, at }: { event: ProfileTimelineEvent, at: number }) {
    const cfg = EVENT_CONFIG[event.eventType] || { icon: LuActivity, label: event.eventType }
    const Icon = cfg.icon
    const meta = React.useMemo(() => {
        try { return JSON.parse(event.metadata || "{}") as Record<string, any> } catch { return {} }
    }, [event.metadata])

    const metaTitle = typeof meta?.title === "string" ? meta.title : ""
    const title = event.mediaTitle || metaTitle || ""

    let description: string
    switch (event.eventType) {
        case "episode_watched": {
            const ep = meta?.episode
            description = ep != null ? `watched Episode ${ep}${title ? ` of ` : ""}` : "watched"
            description += title ? title : ""
            break
        }
        case "manga_chapter_read": {
            const ch = meta?.chapter
            description = ch != null ? `read Chapter ${ch}${title ? ` of ` : ""}` : "read"
            description += title ? title : ""
            break
        }
        case "anilist_entry_edited": {
            const status = typeof meta?.status === "string" ? meta.status : ""
            const prefix = { CURRENT: "started", PLANNING: "planned", COMPLETED: "completed", PAUSED: "paused", DROPPED: "dropped" }[status]
            description = prefix ? `${prefix}${title ? ` ` : ""}` : "updated"
            description += title ? title : ""
            break
        }
        case "achievement_unlocked":
            description = typeof meta?.name === "string" && meta.name ? `unlocked "${meta.name}"` : "unlocked an achievement"
            break
        case "series_complete":
            description = `finished${title ? ` ` : ""}${title || "a series"}`
            break
        default:
            description = cfg.label
    }

    const isManga = event.mediaType === "manga" || event.eventType === "manga_chapter_read" || meta?.type === "manga"
    const href = event.mediaId > 0 ? (isManga ? `/manga/entry?id=${event.mediaId}` : `/entry?id=${event.mediaId}`) : null

    const body = (
        <>
            {isManga
                ? <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-white/5 border border-[--border]"><LuBookOpen className="size-4 text-[--muted]" /></div>
                : event.mediaImage
                    ? <img src={event.mediaImage} alt="" loading="lazy" className="size-11 shrink-0 rounded-lg object-cover border border-[--border]" />
                    : <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-white/5 border border-[--border]"><Icon className="size-4 text-[--muted]" /></div>}
            <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug">
                    <span className="font-medium">{event.username}</span> <span className="text-[--muted]">{description}</span>
                </p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-[--muted]">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px]">
                        <Icon className="size-3" />
                        {cfg.label}
                    </span>
                    <span>{Number.isNaN(at) ? "" : formatNewsDate(at / 1000)}</span>
                </div>
            </div>
        </>
    )

    return (
        <div className="flex items-start gap-3 pb-4">
            <TimelineDot tone="media" />
            {href
                ? <SeaLink href={href} className="flex min-w-0 flex-1 items-start gap-2.5 transition-colors hover:text-[--brand]">{body}</SeaLink>
                : <div className="flex min-w-0 flex-1 items-start gap-2.5">{body}</div>}
        </div>
    )
}

/** The connecting line + dot of the timeline; media events are green, news is branded. */
function TimelineDot({ tone }: { tone: "brand" | "media" }) {
    return (
        <div className="flex flex-col items-center self-stretch">
            <span className={cn("mt-1 size-2.5 shrink-0 rounded-full ring-2",
                tone === "brand" ? "bg-[--brand] ring-[--brand]/30" : "bg-emerald-400 ring-emerald-400/30",
            )} />
            <span className="w-px flex-1 bg-[--border] mt-1 min-h-[1.25rem]" />
        </div>
    )
}

const EVENT_CONFIG: Record<string, { icon: React.ElementType, label: string }> = {
    episode_watched: { icon: LuTv, label: "Episode" },
    manga_chapter_read: { icon: LuBookOpen, label: "Chapter" },
    anilist_entry_edited: { icon: LuStar, label: "List" },
    achievement_unlocked: { icon: LuStar, label: "Achievement" },
    series_complete: { icon: LuPlay, label: "Finished" },
    library_scanned: { icon: LuActivity, label: "Library" },
    file_matched: { icon: LuActivity, label: "Matched" },
    file_unmatched: { icon: LuBell, label: "Unmatched" },
}
