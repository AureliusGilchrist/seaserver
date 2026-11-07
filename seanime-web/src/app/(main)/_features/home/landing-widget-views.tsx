"use client"

import { useServerQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { TorrentClient_Torrent } from "@/api/generated/types"
import { useGetHomeCounts } from "@/api/hooks/home-counts.hooks"
import { formatNewsDate, useGetNewsFeed, type RssItem } from "@/api/hooks/news.hooks"
import { useGetToWatch } from "@/api/hooks/towatch.hooks"
import { useGetUnmatchedTorrents } from "@/api/hooks/unmatched.hooks"
import { useGetAchievementSummary } from "@/api/hooks/achievement.hooks"
import { useAnilistListRecentAiringAnime, useGetRawAnimeCollection } from "@/api/hooks/anilist.hooks"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { countLists } from "@/app/(main)/_features/home/list-insights"
import { useGetTorrentAddQueue } from "@/api/hooks/torrent_client.hooks"
import { useMissingEpisodeCount } from "@/app/(main)/_hooks/missing-episodes-loader"
import { useGetRawAnilistMangaCollection } from "@/api/hooks/manga.hooks"
import { MangaContinueReading } from "@/app/(main)/manga/_containers/manga-continue-reading"
import { useMangaContinueReadingList } from "@/app/(main)/manga/_lib/use-manga-continue-reading"
import { LANDING_QUICK_LINKS, useLandingFolders } from "@/app/(main)/_features/home/landing-widgets"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { SeaLink } from "@/components/shared/sea-link"
import { cn } from "@/components/ui/core/styling"
import { formatNumber } from "@/lib/helpers/number"
import React from "react"
import {
    LuArrowRight, LuCalendar, LuChevronLeft, LuCompass, LuDownload,
    LuFolder, LuFolderOpen, LuFolderSearch, LuListVideo, LuMonitorPlay, LuNewspaper, LuRss,
    LuUsers, LuWand, LuHardDrive, LuClipboardCheck, LuSettings, LuPalette, LuRefreshCw, LuLayers,
} from "react-icons/lu"
import { BiBook } from "react-icons/bi"
import { GiTrophyCup } from "react-icons/gi"

/**
 * The widgets themselves.
 *
 * Each one is a thing the app already knows how to show, drawn with the app's own materials: the
 * stat doors are cells of the landing strip — an icon, a name, and where there is a number for it,
 * that number set large. Nothing here is a second source of truth — every widget reads the hooks
 * the rest of the app reads — and a widget without anything to show simply says what it is, or
 * nothing at all.
 */

const quickLinkIcons: Record<string, React.ElementType> = {
    anime: LuMonitorPlay,
    schedule: LuCalendar,
    manga: BiBook,
    "to-watch": LuListVideo,
    discover: LuCompass,
    news: LuNewspaper,
    lists: LuListVideo,
    unmatched: LuFolderSearch,
    "torrent-list": LuWand,
    community: LuUsers,
    achievements: GiTrophyCup,
    "enqueue-future": LuDownload,
    milestones: LuCalendar,
    debrid: LuHardDrive,
    "auto-downloader": LuDownload,
    "scan-summaries": LuClipboardCheck,
    profile: LuUsers,
    "enmasse-anime": LuLayers,
    "enmasse-manga": LuLayers,
    extensions: LuWand,
    sync: LuRefreshCw,
    "theme-manager": LuPalette,
    settings: LuSettings,
}

export function LandingQuickLinksWidget({ visibleLinks }: { visibleLinks?: string[] }) {
    const { folders } = useLandingFolders()
    const [openFolderId, setOpenFolderId] = React.useState<string | null>(null)
    const links = React.useMemo(
        () => LANDING_QUICK_LINKS.filter(link => !visibleLinks?.length || visibleLinks.includes(link.id)),
        [visibleLinks],
    )

    const groups = React.useMemo(() => {
        const assignedIds = new Set(folders.flatMap(folder => folder.linkIds))
        const result = folders.map(folder => ({
            ...folder,
            links: links.filter(link => folder.linkIds.includes(link.id)),
        }))
        const unfiled = links.filter(link => !assignedIds.has(link.id))
        if (unfiled.length) result.push({ id: "unfiled", name: "Unsorted", linkIds: [], links: unfiled })
        return result
    }, [folders, links])
    const selectedFolder = groups.find(folder => folder.id === openFolderId)

    if (!links.length) return null

    return (
        <PageWrapper className="px-0">
            <div className="flex flex-wrap items-end justify-between gap-3 px-1">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Your folders</h2>
                    <p className="mt-1 text-sm text-[--muted]">A tidy place for every part of Deus Ex Aeternae.</p>
                </div>
                {selectedFolder && (
                    <button
                        type="button"
                        onClick={() => setOpenFolderId(null)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 backdrop-blur-md transition hover:bg-white/10 hover:text-white"
                    >
                        <LuChevronLeft className="size-4" />
                        All folders
                    </button>
                )}
            </div>

            {selectedFolder ? (
                <section className="relative z-[1] mt-4 rounded-3xl border border-white/10 bg-black/25 p-4 shadow-xl shadow-black/20 backdrop-blur-md sm:p-5">
                    <div className="mb-4 flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-brand-500/15 text-[--brand]">
                            <LuFolderOpen className="size-5" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="truncate text-lg font-semibold">{selectedFolder.name}</h3>
                            <p className="text-xs text-[--muted]">{selectedFolder.links.length} destinations</p>
                        </div>
                    </div>
                    {selectedFolder.links.length ? (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {selectedFolder.links.map(link => <QuickLinkCard key={link.id} link={link} />)}
                        </div>
                    ) : (
                        <p className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-8 text-center text-sm text-[--muted] backdrop-blur-md">
                            This folder is empty. Add destinations from Customize.
                        </p>
                    )}
                </section>
            ) : (
                <div className="mt-4 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {groups.map(folder => (
                        <button
                            key={folder.id}
                            type="button"
                            onClick={() => setOpenFolderId(folder.id)}
                            className="group relative z-[1] flex min-h-28 items-center gap-4 overflow-hidden rounded-2xl border border-white/10 bg-black/25 p-4 text-left shadow-xl shadow-black/20 backdrop-blur-md transition hover:-translate-y-0.5 hover:border-[--brand]/60 hover:bg-black/35 sm:p-5"
                        >
                            <span className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-[--brand]/15 blur-2xl transition-opacity group-hover:opacity-100" />
                            <span className="relative flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400/30 to-brand-600/20 text-white ring-1 ring-white/10">
                                <LuFolder className="size-6" />
                            </span>
                            <span className="relative min-w-0 flex-1">
                                <span className="block truncate font-semibold text-white">{folder.name}</span>
                                <span className="mt-1 block text-xs text-white/65">{folder.links.length} destinations</span>
                            </span>
                            <LuArrowRight className="relative size-4 shrink-0 text-white/40 transition group-hover:translate-x-1 group-hover:text-[--brand]" />
                        </button>
                    ))}
                </div>
            )}
        </PageWrapper>
    )
}

function QuickLinkCard({ link }: { link: typeof LANDING_QUICK_LINKS[number] }) {
    const Icon = quickLinkIcons[link.id] ?? LuArrowRight
    return (
        <SeaLink href={link.href} className="block h-full">
            <div className="group relative z-[1] h-full min-h-32 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4 text-left shadow-lg shadow-black/15 backdrop-blur-md transition hover:-translate-y-0.5 hover:border-[--brand]/60 hover:bg-black/30 sm:p-5">
                <div className="pointer-events-none absolute -right-10 -bottom-10 size-32 rounded-full bg-[--brand]/15 blur-2xl opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative flex items-center justify-between gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400/35 to-brand-600/20 text-white ring-1 ring-white/10">
                        <Icon className="size-5" />
                    </span>
                    <LuArrowRight className="size-4 text-white/40 transition group-hover:translate-x-1 group-hover:text-[--brand]" />
                </div>
                <p className="relative mt-3 font-semibold text-white">{link.name}</p>
                <p className="relative mt-1 text-xs leading-relaxed text-white/70">{link.description}</p>
            </div>
        </SeaLink>
    )
}

/**
 * Your own numbers, counted the same way for anime and manga from the signed-in profile's AniList
 * lists. Those answer in milliseconds, unlike the server-wide library collections, which take many
 * seconds and also hold every local file on the server and the shared account's entries.
 */
export function useLandingAnimeStats() {
    const profile = useServerStatus()?.currentProfile
    const { data, isLoading, isError } = useGetRawAnimeCollection(!!profile?.id && profile.anilistAuthenticated, profile?.id)
    const stats = React.useMemo(() => profile?.id && profile.anilistAuthenticated ? countLists(data) : null, [data, profile?.id, profile?.anilistAuthenticated])
    return { stats, isLoading, isError }
}

export function useLandingMangaStats() {
    const profile = useServerStatus()?.currentProfile
    const { data, isLoading, isError } = useGetRawAnilistMangaCollection(!!profile?.id && profile.anilistAuthenticated, profile?.id)
    const stats = React.useMemo(() => profile?.id && profile.anilistAuthenticated ? countLists(data) : null, [data, profile?.id, profile?.anilistAuthenticated])
    return { stats, isLoading, isError }
}

export function LandingAnimeStatsWidget() {
    const { stats, isLoading, isError } = useLandingAnimeStats()
    const { data: counts } = useGetHomeCounts()

    return (
        <StatsDoor
            // No AniList linked (or it failed): dashes, never someone else's numbers.
            title={!isLoading && (isError || !stats) ? "Anime · link AniList" : "Anime"}
            icon={<LuMonitorPlay className="w-5 h-5" />}
            stats={[
                { label: "on your lists", value: stats?.onLists ?? null },
                { label: "watching / rewatching", value: stats?.current ?? null },
                { label: "completed", value: stats?.completed ?? null },
                { label: "episodes watched", value: stats?.progress ?? null },
                { label: "planning", value: stats?.planning ?? null },
                // Every episode on disk, whoever downloaded it: the server's library is shared.
                { label: "server anime files", value: counts?.animeFiles ?? null },
            ]}
            href="/anime"
        />
    )
}

export function LandingMangaStatsWidget() {
    const { stats, isLoading, isError } = useLandingMangaStats()
    const { data: counts } = useGetHomeCounts()

    return (
        <StatsDoor
            title={!isLoading && (isError || !stats) ? "Manga · link AniList" : "Manga"}
            icon={<BiBook className="w-5 h-5" />}
            stats={[
                { label: "on your lists", value: stats?.onLists ?? null },
                { label: "reading / rereading", value: stats?.current ?? null },
                { label: "completed", value: stats?.completed ?? null },
                { label: "chapters read", value: stats?.progress ?? null },
                { label: "planning", value: stats?.planning ?? null },
                // Every chapter on disk, whoever downloaded it: the server's manga library is shared.
                { label: "server chapters downloaded", value: counts?.mangaAvailable ? counts.mangaChapters : null },
            ]}
            href="/manga"
        />
    )
}

/**
 * The airing queries start from the top of the hour, so the same request is sent all hour: it is
 * answered from the saved cache at once rather than asking AniList for a new window on every open.
 * What has already aired is then dropped here, so the figures are still right to the minute.
 */
function useAiringWindow(end: "day" | "week") {
    const start = Math.floor(Date.now() / 3_600_000) * 3600
    const dayEnd = new Date()
    dayEnd.setHours(24, 0, 0, 0)
    const lesser = end === "day" ? Math.floor(dayEnd.getTime() / 1000) : start + 7 * 24 * 60 * 60
    const { data, isLoading } = useAnilistListRecentAiringAnime({
        page: 1,
        perPage: 50,
        airingAt_greater: start,
        airingAt_lesser: lesser,
        notYetAired: true,
    }, true, true)
    const now = Math.floor(Date.now() / 1000)
    const schedules = (data?.Page?.airingSchedules ?? []).filter(s => s.airingAt > now)
    // AniList returns 50 to a page, so past that the page's total is the count.
    const total = data?.Page?.pageInfo?.hasNextPage ? data.Page.pageInfo.total ?? schedules.length : schedules.length
    return { schedules, total, isLoading: isLoading && !data }
}

function formatTimeUntil(seconds: number) {
    if (seconds < 3600) return `${Math.max(1, Math.ceil(seconds / 60))}m`
    return `${Math.ceil(seconds / 3600)}h`
}

export function LandingScheduleWidget() {
    const missingEpisodes = useMissingEpisodeCount()
    const { total, isLoading } = useAiringWindow("week")

    return (
        <StatsDoor
            title="Schedule"
            icon={<LuCalendar className="w-5 h-5" />}
            stats={[
                { label: "missing episodes", value: missingEpisodes },
                { label: "airing this week", value: isLoading ? null : total },
            ]}
            href="/schedule"
        />
    )
}

export function LandingAiringTodayWidget() {
    const { schedules, total, isLoading } = useAiringWindow("day")
    const next = [...schedules].sort((a, b) => a.airingAt - b.airingAt)[0]

    return (
        <StatsDoor
            title="Airing today"
            icon={<LuCalendar className="w-5 h-5" />}
            stats={[
                { label: "left today", value: isLoading ? null : total },
                {
                    label: "next release",
                    value: isLoading ? null : next ? formatTimeUntil(next.airingAt - Math.floor(Date.now() / 1000)) : "none",
                },
            ]}
            href="/schedule"
        />
    )
}

export function LandingToWatchWidget() {
    const { data: toWatch, isLoading } = useGetToWatch()
    const animeCount = toWatch?.filter(entry => (entry.mediaType ?? "ANIME") === "ANIME").length ?? 0
    const mangaCount = toWatch?.filter(entry => entry.mediaType === "MANGA").length ?? 0

    return (
        <StatsDoor
            title="Todo List"
            icon={<LuListVideo className="w-5 h-5" />}
            stats={[
                { label: "total queued", value: isLoading ? null : toWatch?.length ?? 0 },
                { label: "anime", value: isLoading ? null : animeCount },
                { label: "manga", value: isLoading ? null : mangaCount },
            ]}
            href="/to-watch"
        />
    )
}

export function LandingUnmatchedWidget() {
    const { data: unmatched } = useGetUnmatchedTorrents({ staleTime: 60_000 })

    return (
        <StatsDoor
            title="Unmatched"
            icon={<LuFolderSearch className="w-5 h-5" />}
            stats={[
                { label: "waiting", value: unmatched?.length ?? null },
            ]}
            href="/unmatched"
        />
    )
}

export function LandingTorrentsWidget() {
    const { data: queue } = useGetTorrentAddQueue()
    const { data: torrents } = useServerQuery<TorrentClient_Torrent[]>({
        endpoint: API_ENDPOINTS.TORRENT_CLIENT.GetActiveTorrentList.endpoint,
        method: API_ENDPOINTS.TORRENT_CLIENT.GetActiveTorrentList.methods[0],
        queryKey: ["LANDING-torrent-list"],
        refetchInterval: 15_000,
        staleTime: 0,
        // The client being off is the widget's business to show, not a toast on the landing page.
        muteError: true,
    })
    const count = (status: string) => torrents ? torrents.filter(t => t?.status === status).length : null

    return (
        <StatsDoor
            title="Torrent list"
            icon={<LuWand className="w-5 h-5" />}
            stats={[
                { label: "downloading", value: count("downloading") },
                { label: "seeding", value: count("seeding") },
                { label: "paused", value: count("paused") },
                { label: "waiting to add", value: queue?.waiting ?? null },
            ]}
            href="/torrent-list"
        />
    )
}

export function LandingAchievementsWidget() {
    const { data: achievements, isLoading } = useGetAchievementSummary()
    const completion = achievements?.totalCount
        ? `${Math.round((achievements.unlockedCount / achievements.totalCount) * 100)}%`
        : "—"

    return (
        <StatsDoor
            title="Achievements"
            icon={<GiTrophyCup className="w-5 h-5" />}
            stats={[
                { label: "unlocked", value: isLoading ? null : achievements?.unlockedCount ?? 0 },
                { label: "available", value: isLoading ? null : achievements?.totalCount ?? 0 },
                { label: "completion", value: isLoading ? null : completion },
            ]}
            href="/achievements"
        />
    )
}

export function LandingLibraryInsightsWidget() {
    const { stats: anime, isLoading: animeLoading } = useLandingAnimeStats()
    const { stats: manga, isLoading: mangaLoading } = useLandingMangaStats()
    const { data: counts } = useGetHomeCounts()
    const { data: todo, isLoading: todoLoading, isError: todoError } = useGetToWatch()
    const totalEntries = anime && manga ? anime.onLists + manga.onLists : null

    const metrics: { label: string, value: number | null, detail: string }[] = [
        { label: "Anime", value: anime?.onLists ?? null, detail: anime ? `${anime.current} watching or rewatching` : "Personal AniList unavailable" },
        { label: "Manga", value: manga?.onLists ?? null, detail: manga ? `${manga.current} reading or rereading` : "Personal AniList unavailable" },
        { label: "Episodes watched", value: anime?.progress ?? null, detail: "Progress recorded in AniList" },
        { label: "Chapters read", value: manga?.progress ?? null, detail: "Progress recorded in AniList" },
        { label: "Downloaded chapters", value: counts?.mangaAvailable ? counts.mangaChapters : null, detail: "On the server" },
        { label: "Todo items", value: todo?.length ?? null, detail: todoError ? "Could not load Todo List" : "Anime and manga planned" },
    ]

    return (
        <section
            className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-black/40 via-black/25 to-brand-950/25 p-5 shadow-2xl shadow-black/25 backdrop-blur-xl sm:p-7"
            data-library-insights
        >
            <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-[--brand]/15 blur-3xl" />
            <header className="relative flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[--brand]">Your numbers</p>
                    <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">Library insights</h2>
                    <p className="mt-1 text-sm text-white/60">
                        {animeLoading || mangaLoading ? "Updating your collection…" : totalEntries === null ? "Connect your profile's AniList account to see your personal totals." : `${formatNumber(totalEntries)} titles on your lists, not counting planning.`}
                    </p>
                </div>
                <div className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-white/70">
                    {todoLoading ? "Loading queue…" : todo ? `${formatNumber(todo.length)} in your Todo List` : "Todo List unavailable"}
                </div>
            </header>
            <div className="relative mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
                {metrics.map(metric => (
                    <div key={metric.label} className="min-w-0 rounded-2xl border border-white/[0.08] bg-black/25 p-3.5 shadow-lg shadow-black/10 backdrop-blur-md">
                        <p className="text-2xl font-extrabold tabular-nums text-white sm:text-3xl">
                            {metric.value === null ? "—" : formatNumber(metric.value)}
                        </p>
                        <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wider text-white/75">{metric.label}</p>
                        <p className="mt-1 line-clamp-1 text-[11px] text-white/45">{metric.detail}</p>
                    </div>
                ))}
            </div>
        </section>
    )
}

export function LandingContinueReadingWidget({ onHoverImage }: {
    onHoverImage?: (imageUrl: string | null) => void
}) {
    const { entries, isLoading } = useMangaContinueReadingList()
    if (isLoading) {
        return <div className="px-4 py-6 text-sm text-[--muted]">Loading your reading list…</div>
    }
    return <MangaContinueReading list={entries} withTitle onHoverImage={onHoverImage} />
}

/**
 * One cell of the landing strip.
 *
 * A door drawn as a card, the way the quick links below the strip are drawn: the app's card
 * material behind it, so the numbers stay readable over the wallpaper — the strip sits directly on
 * the background, and a figure with no material under it fought the artwork for legibility. An
 * icon, a name, the figure it carries, and room between them so a card is read at a glance.
 */
function StatsDoor({ title, icon, stats, href }: {
    title: string
    icon: React.ReactNode
    stats: { label: string, value: number | string | null }[]
    href: string
}) {
    return (
        <SeaLink href={href} className="group/door block h-full">
            <div
                className={cn(
                    "group relative z-[1] w-full h-full text-left rounded-2xl border border-white/10 bg-black/25 backdrop-blur-md shadow-lg shadow-black/20 p-4 lg:p-5 overflow-hidden",
                    "transition-all duration-300 hover:-translate-y-1 hover:border-[--brand]/70 hover:bg-black/60 hover:shadow-xl hover:shadow-[--brand]/20",
                )}
            >
                <div className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-[--brand]/20 blur-2xl opacity-60 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center size-10 rounded-xl bg-gradient-to-br from-brand-400/40 to-brand-600/30 text-white ring-1 ring-white/10">
                            {icon}
                        </div>
                        <p className="font-semibold text-white">{title}</p>
                    </div>
                    <LuArrowRight className="w-4 h-4 text-white/40 -translate-x-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-[--brand] transition-all" />
                </div>
                {!!stats.length && (
                    <div className="relative mt-4 grid grid-cols-2 gap-x-3 gap-y-3">
                        {stats.map(stat => (
                            <div key={stat.label} className="min-w-0 leading-none">
                                <p className="text-2xl font-extrabold text-white tabular-nums lg:text-3xl">
                                    {stat.value === null
                                        ? "—"
                                        : typeof stat.value === "number"
                                            ? formatNumber(stat.value)
                                            : stat.value}
                                </p>
                                <p className="mt-1.5 truncate text-[10px] uppercase tracking-wider text-white/75">{stat.label}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </SeaLink>
    )
}

/**
 * What the server was last updated to, and the recent commits before it.
 *
 * The notice banner says the last one; this widget says what the server has been, over time — the
 * commits the updater pulled, newest first. Read from the same file the notice is, which is the one
 * thing that knows.
 */
export function LandingUpdatesWidget() {
    return (
        <div className="relative z-[1] rounded-xl border border-brand-500/20 bg-black/25 backdrop-blur-md shadow-lg shadow-black/20 p-5">
            <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-500/15">
                    <LuRss className="w-4 h-4 text-[--brand]" />
                </div>
                <div>
                    <p className="font-semibold">Updates</p>
                    <p className="text-xs text-[--muted]">What the server has been updated to.</p>
                </div>
            </div>
            <p className="text-xs text-[--muted] mt-3">
                The last update is announced in the banner above. This widget shows what the server has
                been over time, and the changelog lives at the fork's repository.
            </p>
        </div>
    )
}

/**
 * News — anime and manga headlines from the RSS feeds configured in Settings -> App, merged
 * newest-first by the server. The rich card: a thumbnail when the feed supplies one, the feed's
 * name as a chip, categories when there are any. Headlines open the source in a new tab; the
 * full list — as many entries as Personal settings asks for — lives on the News page, which the
 * footer's "Show more" opens.
 */
export function LandingNewsWidget() {
    const { data, isLoading, isError, refetch, isRefetching } = useGetNewsFeed()

    const items = React.useMemo(() => data?.items ?? [], [data?.items])
    // The widget is a headline rack, not an archive: the freshest six, the rest on the page.
    const visible = React.useMemo(() => items.slice(0, 6), [items])
    const hiddenCount = items.length - visible.length

    return (
        <div className="relative z-[1] overflow-hidden rounded-xl border border-brand-500/20 bg-black/25 backdrop-blur-md shadow-lg shadow-black/20">
            <div className="flex items-center gap-3 p-5 pb-4">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-500/15">
                    <LuRss className="w-4 h-4 text-[--brand]" />
                </div>
                <div>
                    <p className="font-semibold">News</p>
                    <p className="text-xs text-[--muted]">Anime and manga headlines from your feeds.</p>
                </div>
                <button
                    onClick={() => refetch()}
                    className="ml-auto text-[--muted] hover:text-[--foreground] transition-colors"
                    title="Refresh"
                >
                    <LuRefreshCw className={cn("w-4 h-4", isRefetching && "animate-spin")} />
                </button>
            </div>
            <div className="px-3 pb-3 space-y-1">
                {isLoading && (
                    <div className="space-y-2 px-2">
                        {[0, 1, 2].map(i => (
                            <div key={i} className="flex gap-3">
                                <div className="h-16 w-24 rounded-lg bg-white/5 animate-pulse" />
                                <div className="flex-1 space-y-2 py-1">
                                    <div className="h-3.5 w-4/5 rounded bg-white/5 animate-pulse" />
                                    <div className="h-3 w-2/5 rounded bg-white/5 animate-pulse" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {!isLoading && isError && (
                    <p className="px-2 text-xs text-[--muted]">Could not load the news feeds. Check your connection and try again.</p>
                )}
                {!isLoading && !isError && items.length === 0 && (
                    <p className="px-2 text-xs text-[--muted]">No items yet — feeds refresh every 15 minutes.</p>
                )}
                {!isLoading && !isError && visible.map((item, idx) => (
                    <NewsRow key={`${item.link}-${idx}`} item={item} />
                ))}
            </div>
            {!isLoading && !isError && (
                <SeaLink
                    href="/news"
                    className="flex items-center justify-between border-t border-white/5 bg-white/[0.02] px-5 py-3 text-sm font-medium text-[--brand] transition-colors hover:bg-white/[0.05]"
                >
                    <span>Show more{hiddenCount > 0 ? ` — ${hiddenCount} more on the News page` : ""}</span>
                    <LuArrowRight className="w-4 h-4" />
                </SeaLink>
            )}
        </div>
    )
}

/** One headline: thumbnail when there is one, feed chip, title, snippet, age. */
export function NewsRow({ item, withDescription = true }: { item: RssItem, withDescription?: boolean }) {
    return (
        <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/5"
        >
            {item.image ? (
                <img
                    src={item.image}
                    alt=""
                    loading="lazy"
                    className="h-16 w-24 flex-none rounded-lg object-cover ring-1 ring-white/10"
                />
            ) : (
                <div className="flex h-16 w-24 flex-none items-center justify-center rounded-lg bg-gradient-to-br from-brand-500/15 to-brand-900/20 ring-1 ring-white/5">
                    <LuRss className="size-5 text-[--brand]/60" />
                </div>
            )}
            <div className="min-w-0 flex-1 py-0.5">
                <p className="text-sm font-medium line-clamp-2 leading-snug transition-colors group-hover:text-[--brand]">
                    {item.title}
                </p>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-[--muted]">
                    {!!item.feedTitle && (
                        <span className="max-w-[10rem] truncate rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                            {item.feedTitle}
                        </span>
                    )}
                    {!!item.publishedAt && <span className="flex-none">{formatNewsDate(item.publishedAt)}</span>}
                </div>
                {withDescription && !!item.description && (
                    <p className="mt-1 text-xs leading-relaxed text-[--muted] line-clamp-2">{item.description}</p>
                )}
            </div>
        </a>
    )
}
