"use client"

import { useGetLibraryCollection } from "@/api/hooks/anime_collection.hooks"
import { formatNewsDate, useGetNewsFeed, type RssItem } from "@/api/hooks/news.hooks"
import { useGetToWatch } from "@/api/hooks/towatch.hooks"
import { useGetUnmatchedTorrents } from "@/api/hooks/unmatched.hooks"
import { useGetAchievementSummary } from "@/api/hooks/achievement.hooks"
import { useAnilistListRecentAiringAnime, useGetAnimeCollection } from "@/api/hooks/anilist.hooks"
import { useGetTorrentAddQueue } from "@/api/hooks/torrent_client.hooks"
import { useMissingEpisodeCount } from "@/app/(main)/_hooks/missing-episodes-loader"
import { useGetMangaCollection } from "@/api/hooks/manga.hooks"
import { useGetMangaDownloadsList } from "@/api/hooks/manga_download.hooks"
import { useMangaDownloadsSnapshot } from "@/app/(main)/manga/_lib/use-manga-downloads-snapshot"
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
 * Your own anime numbers: counted from the signed-in profile's AniList lists (never the server-wide
 * library, which also holds every local file on the server and the shared account's entries).
 */
export function LandingAnimeStatsWidget() {
    const { data: animeCollection, isLoading, isError } = useGetAnimeCollection()
    // Only used to tell which of *your* titles have files on the server.
    const { data: libraryCollection } = useGetLibraryCollection({ staleTime: 30_000 })

    const stats = React.useMemo(() => {
        const lists = animeCollection?.MediaListCollection?.lists ?? []
        if (!lists.length) return null
        const withFiles = new Set<number>()
        for (const list of libraryCollection?.lists ?? []) {
            if ((list.type as string) === "LOCAL") continue
            for (const e of list.entries ?? []) if (e.libraryData && e.mediaId) withFiles.add(e.mediaId)
        }
        let onLists = 0, planning = 0, watching = 0, completed = 0, episodesWatched = 0, episodesTotal = 0, downloaded = 0
        const seen = new Set<number>()
        for (const list of lists) {
            for (const e of list?.entries ?? []) {
                const id = e?.media?.id
                if (!id || seen.has(id)) continue
                seen.add(id)
                const status = e.status ?? list?.status
                if (status === "PLANNING") {
                    planning++
                    continue
                }
                onLists++
                if (status === "CURRENT" || status === "REPEATING") watching++
                if (status === "COMPLETED") completed++
                episodesWatched += e.progress ?? 0
                episodesTotal += e.media?.episodes ?? e.progress ?? 0
                if (withFiles.has(id)) downloaded++
            }
        }
        const progress = episodesTotal > 0 ? `${Math.min(100, Math.round((episodesWatched / episodesTotal) * 100))}%` : "—"
        return { onLists, planning, watching, completed, episodesWatched, progress, downloaded }
    }, [animeCollection, libraryCollection])

    // No AniList linked (or it failed): dashes, never someone else's numbers.
    const v = (n: number | string | undefined) => isLoading || !stats ? null : n ?? null

    return (
        <StatsDoor
            title={!isLoading && (isError || !stats) ? "Anime · link AniList" : "Anime"}
            icon={<LuMonitorPlay className="w-5 h-5" />}
            stats={[
                { label: "on your lists", value: v(stats?.onLists) },
                { label: "watching / rewatching", value: v(stats?.watching) },
                { label: "completed", value: v(stats?.completed) },
                { label: "episodes watched", value: v(stats?.episodesWatched) },
                { label: "planning", value: v(stats?.planning) },
                // Every episode on disk, whoever downloaded it: the server's library is shared.
                { label: "downloaded episodes", value: libraryCollection ? (libraryCollection.stats?.totalFiles ?? 0) : null },
            ]}
            href="/anime"
        />
    )
}

export function LandingMangaStatsWidget() {
    const { data: mangaCollection, isLoading } = useGetMangaCollection()
    // Planning is left out: it is also where the shared account's downloaded manga are merged in,
    // and this card counts what you have read.
    const entries = React.useMemo(
        () => mangaCollection?.lists?.filter(list => list.type !== "PLANNING").flatMap(list => list.entries ?? []) ?? [],
        [mangaCollection],
    )
    const reading = mangaCollection?.lists?.find(list => list.type === "CURRENT")?.entries?.length ?? 0
    const completed = mangaCollection?.lists?.find(list => list.type === "COMPLETED")?.entries?.length ?? 0
    const chaptersRead = entries.reduce((total, entry) => total + (entry.listData?.progress ?? 0), 0)

    // Every chapter on disk, whoever downloaded it: the server's manga library is shared, like the
    // anime card's downloaded episodes. Counting only the entries above missed nearly all of them:
    // downloaded series you aren't reading are merged into Planning, which this card leaves out.
    const { data: liveDownloads } = useGetMangaDownloadsList()
    const downloadsSnapshot = useMangaDownloadsSnapshot(liveDownloads)
    const downloads = liveDownloads ?? downloadsSnapshot
    const chaptersDownloaded = React.useMemo(
        () => downloads?.reduce((total, d) => total + Object.values(d.downloadData ?? {}).flat().length, 0),
        [downloads],
    )

    return (
        <StatsDoor
            title="Manga"
            icon={<BiBook className="w-5 h-5" />}
            stats={[
                { label: "on your lists", value: isLoading ? null : entries.length },
                { label: "currently reading", value: isLoading ? null : reading },
                { label: "completed", value: isLoading ? null : completed },
                { label: "chapters read", value: isLoading ? null : chaptersRead },
                { label: "chapters downloaded", value: chaptersDownloaded ?? null },
            ]}
            href="/manga"
        />
    )
}

export function LandingScheduleWidget() {
    const missingEpisodes = useMissingEpisodeCount()
    const now = React.useMemo(() => Math.floor(Date.now() / 1000), [])
    const { data: upcoming } = useAnilistListRecentAiringAnime({
        page: 1,
        perPage: 50,
        airingAt_greater: now,
        airingAt_lesser: now + 7 * 24 * 60 * 60,
        notYetAired: true,
    }, true, true)

    return (
        <StatsDoor
            title="Schedule"
            icon={<LuCalendar className="w-5 h-5" />}
            stats={[
                { label: "missing episodes", value: missingEpisodes },
                { label: "airing this week", value: upcoming?.Page?.airingSchedules?.length ?? 0 },
            ]}
            href="/schedule"
        />
    )
}

export function LandingAiringTodayWidget() {
    const now = React.useMemo(() => Math.floor(Date.now() / 1000), [])
    const dayEnd = React.useMemo(() => {
        const end = new Date()
        end.setHours(24, 0, 0, 0)
        return Math.floor(end.getTime() / 1000)
    }, [])
    const { data, isLoading } = useAnilistListRecentAiringAnime({
        page: 1,
        perPage: 50,
        airingAt_greater: now,
        airingAt_lesser: dayEnd,
        notYetAired: true,
    }, true, true)
    const schedules = data?.Page?.airingSchedules ?? []
    const next = [...schedules].sort((a, b) => a.airingAt - b.airingAt)[0]

    return (
        <StatsDoor
            title="Airing today"
            icon={<LuCalendar className="w-5 h-5" />}
            stats={[
                { label: "episodes today", value: isLoading ? null : schedules.length },
                {
                    label: "next release",
                    value: isLoading ? null : next ? `${Math.max(0, Math.ceil(next.timeUntilAiring / 3600))}h` : "none",
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
                { label: "waiting", value: unmatched?.length ?? 0 },
            ]}
            href="/unmatched"
        />
    )
}

export function LandingTorrentsWidget() {
    const { data: queue, isLoading } = useGetTorrentAddQueue()

    return (
        <StatsDoor
            title="Torrent list"
            icon={<LuWand className="w-5 h-5" />}
            stats={[
                { label: "waiting to add", value: isLoading ? null : queue?.waiting ?? 0 },
                { label: "adding", value: isLoading ? null : queue?.adding ?? 0 },
                { label: "in queue", value: isLoading ? null : queue?.total ?? 0 },
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
    const { data: anime, isLoading: animeLoading } = useGetLibraryCollection({ staleTime: 30_000 })
    const { data: manga, isLoading: mangaLoading } = useGetMangaCollection()
    const { data: todo, isLoading: todoLoading } = useGetToWatch()

    const animeEntries = anime?.lists?.flatMap(list => list.entries ?? []) ?? []
    const mangaEntries = manga?.lists?.flatMap(list => list.entries ?? []) ?? []
    const animeCurrent = (anime?.lists?.find(list => list.type === "CURRENT")?.entries?.length ?? 0)
        + (anime?.lists?.find(list => list.type === "REPEATING")?.entries?.length ?? 0)
    const mangaCurrent = manga?.lists?.find(list => list.type === "CURRENT")?.entries?.length ?? 0
    const episodesWatched = animeEntries.reduce((total, entry) => total + (entry.listData?.progress ?? 0), 0)
    const chaptersRead = mangaEntries.reduce((total, entry) => total + (entry.listData?.progress ?? 0), 0)
    const chaptersDownloaded = mangaEntries.reduce((total, entry) => total + (entry.downloadedChapterCount ?? 0), 0)
    const totalEntries = animeEntries.length + mangaEntries.length

    const metrics: { label: string, value: number | null, detail: string }[] = [
        { label: "Anime", value: animeLoading ? null : animeEntries.length, detail: `${animeCurrent} watching or rewatching` },
        { label: "Manga", value: mangaLoading ? null : mangaEntries.length, detail: `${mangaCurrent} currently reading` },
        { label: "Episodes watched", value: animeLoading ? null : episodesWatched, detail: "Progress recorded in AniList" },
        { label: "Chapters read", value: mangaLoading ? null : chaptersRead, detail: "Progress recorded in AniList" },
        { label: "Downloaded chapters", value: mangaLoading ? null : chaptersDownloaded, detail: "Available in your local library" },
        { label: "Todo items", value: todoLoading ? null : todo?.length ?? 0, detail: "Anime and manga planned" },
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
                        {animeLoading || mangaLoading ? "Updating your collection…" : `${formatNumber(totalEntries)} titles tracked across anime and manga.`}
                    </p>
                </div>
                <div className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-white/70">
                    {todoLoading ? "Loading queue…" : `${formatNumber(todo?.length ?? 0)} in your Todo List`}
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

export function LandingContinueReadingWidget() {
    const { entries, isLoading } = useMangaContinueReadingList()
    if (isLoading) {
        return <div className="px-4 py-6 text-sm text-[--muted]">Loading your reading list…</div>
    }
    return <MangaContinueReading list={entries} withTitle />
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

