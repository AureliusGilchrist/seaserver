"use client"

import { useGetLibraryCollection } from "@/api/hooks/anime_collection.hooks"
import { useGetToWatch } from "@/api/hooks/towatch.hooks"
import { useGetUnmatchedTorrents } from "@/api/hooks/unmatched.hooks"
import { useGetAchievementSummary } from "@/api/hooks/achievement.hooks"
import { useMissingEpisodes } from "@/app/(main)/_hooks/missing-episodes-loader"
import { useGetMangaCollection, useGetMangaLatestChapterNumbersMap } from "@/api/hooks/manga.hooks"
import { useGetActiveTorrentList, useGetTorrentAddQueue } from "@/api/hooks/torrent_client.hooks"
import { LANDING_QUICK_LINKS, useLandingFolders } from "@/app/(main)/_features/home/landing-widgets"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { SeaLink } from "@/components/shared/sea-link"
import { cn } from "@/components/ui/core/styling"
import { formatNumber } from "@/lib/helpers/number"
import React from "react"
import {
    LuArrowRight, LuCalendar, LuChevronLeft, LuCompass, LuDownload,
    LuFolder, LuFolderOpen, LuFolderSearch, LuListVideo, LuMonitorPlay, LuRss,
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
    lists: LuListVideo,
    unmatched: LuFolderSearch,
    "torrent-list": LuWand,
    community: LuUsers,
    achievements: GiTrophyCup,
    "enqueue-future": LuDownload,
    milestones: LuCalendar,
    "missed-sequels": LuCalendar,
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
                    <p className="mt-1 text-sm text-[--muted]">A tidy place for every part of Seanime.</p>
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

export function LandingAnimeStatsWidget() {
    const { data: libraryCollection } = useGetLibraryCollection({ staleTime: 30_000 })

    const stats = React.useMemo(() => {
        const lists = libraryCollection?.lists ?? []
        const entries = lists.flatMap(list => list.entries ?? [])
        const entriesFor = (status: string) => lists.find(list => list.type === status)?.entries ?? []
        const episodesWatched = entries.reduce((total, entry) => total + (entry.listData?.progress ?? 0), 0)
        const estimatedWatchMinutes = entries.reduce(
            (total, entry) => total + (entry.listData?.progress ?? 0) * (entry.media?.duration ?? 0),
            0,
        )
        const episodesLeft = entriesFor("CURRENT").reduce((total, entry) => {
            const totalEpisodes = entry.media?.episodes
            return typeof totalEpisodes === "number"
                ? total + Math.max(0, totalEpisodes - (entry.listData?.progress ?? 0))
                : total
        }, 0)

        return [
            { label: "in your library", value: entries.length },
            { label: "watching", value: entriesFor("CURRENT").length },
            { label: "completed", value: entriesFor("COMPLETED").length },
            { label: "planned", value: entriesFor("PLANNING").length },
            { label: "episodes watched", value: episodesWatched },
            { label: "estimated hours watched", value: Math.floor(estimatedWatchMinutes / 60) },
            { label: "episodes left", value: episodesLeft },
            { label: "local files", value: libraryCollection?.stats?.totalFiles ?? 0 },
        ]
    }, [libraryCollection])

    return (
        <StatsDoor
            title="Anime"
            icon={<LuMonitorPlay className="w-5 h-5" />}
            stats={stats}
            href="/anime"
        />
    )
}

export function LandingMangaStatsWidget() {
    const { data: mangaCollection } = useGetMangaCollection()
    const { data: latestChapterNumbers } = useGetMangaLatestChapterNumbersMap()

    const stats = React.useMemo(() => {
        const lists = mangaCollection?.lists ?? []
        const entries = lists.flatMap(list => list.entries ?? [])
        const entriesFor = (status: string) => lists.find(list => list.type === status)?.entries ?? []
        const readingEntries = lists
            .filter(list => list.type === "CURRENT" || list.type === "REPEATING")
            .flatMap(list => list.entries ?? [])
        const chaptersRead = entries.reduce((total, entry) => total + (entry.listData?.progress ?? 0), 0)
        const downloadedChapters = entries.reduce((total, entry) => total + entry.downloadedChapterCount, 0)
        const chaptersAvailable = readingEntries.reduce((total, entry) => {
            const latestNumber = (latestChapterNumbers?.[entry.mediaId] ?? [])
                .reduce((latest, chapter) => Math.max(latest, chapter.number), 0)
            return total + Math.max(0, latestNumber - (entry.listData?.progress ?? 0))
        }, 0)
        const knownChaptersLeft = entries
            .filter(entry => entry.listData?.status !== "COMPLETED" && entry.listData?.status !== "DROPPED")
            .reduce((total, entry) => {
                const totalChapters = entry.media?.chapters
                return typeof totalChapters === "number"
                    ? total + Math.max(0, totalChapters - (entry.listData?.progress ?? 0))
                    : total
            }, 0)

        return [
            { label: "in your library", value: entries.length },
            { label: "reading", value: readingEntries.length },
            { label: "completed", value: entriesFor("COMPLETED").length },
            { label: "planned", value: entriesFor("PLANNING").length },
            { label: "chapters read", value: chaptersRead },
            { label: "new chapters available", value: chaptersAvailable },
            { label: "downloaded chapters", value: downloadedChapters },
            { label: "known chapters left", value: knownChaptersLeft },
        ]
    }, [mangaCollection, latestChapterNumbers])

    return (
        <StatsDoor
            title="Manga"
            icon={<BiBook className="w-5 h-5" />}
            stats={stats}
            href="/manga"
        />
    )
}

export function LandingScheduleWidget() {
    const missingEpisodes = useMissingEpisodes()
    const animeBehind = new Set(missingEpisodes.map(episode => episode.baseAnime?.id).filter((id): id is number => typeof id === "number")).size

    return (
        <StatsDoor
            title="Schedule"
            icon={<LuCalendar className="w-5 h-5" />}
            stats={[
                { label: "missing episodes", value: missingEpisodes.length },
                { label: "series behind", value: animeBehind },
            ]}
            href="/schedule"
        />
    )
}

export function LandingToWatchWidget() {
    const { data: toWatch } = useGetToWatch()
    const animeQueued = toWatch?.filter(item => item.mediaType === "ANIME") ?? []
    const mangaQueued = toWatch?.filter(item => item.mediaType === "MANGA") ?? []

    return (
        <StatsDoor
            title="Todo List"
            icon={<LuListVideo className="w-5 h-5" />}
            stats={[
                { label: "queued", value: toWatch?.length ?? 0 },
                { label: "anime", value: animeQueued.length },
                { label: "manga", value: mangaQueued.length },
                { label: "known episodes", value: animeQueued.reduce((total, item) => total + (item.episodes ?? 0), 0) },
                { label: "known chapters", value: mangaQueued.reduce((total, item) => total + (item.chapters ?? 0), 0) },
            ]}
            href="/to-watch"
        />
    )
}

export function LandingUnmatchedWidget() {
    const { data: unmatched } = useGetUnmatchedTorrents({ staleTime: 60_000 })
    const fileCount = unmatched?.reduce((total, item) => total + item.fileCount, 0) ?? 0
    const conflictCount = unmatched?.filter(item => !!item.pendingConflict || !!item.pendingCountMismatch).length ?? 0

    return (
        <StatsDoor
            title="Unmatched"
            icon={<LuFolderSearch className="w-5 h-5" />}
            stats={[
                { label: "waiting", value: unmatched?.length ?? 0 },
                { label: "files", value: fileCount },
                { label: "with conflicts", value: conflictCount },
            ]}
            href="/unmatched"
        />
    )
}

export function LandingTorrentsWidget() {
    const { data: torrents } = useGetActiveTorrentList(true, "", "")
    const { data: addQueue } = useGetTorrentAddQueue()

    return (
        <StatsDoor
            title="Torrent list"
            icon={<LuWand className="w-5 h-5" />}
            stats={[
                { label: "active", value: torrents?.length ?? 0 },
                { label: "downloading", value: torrents?.filter(item => item.status === "downloading").length ?? 0 },
                { label: "seeding", value: torrents?.filter(item => item.status === "seeding").length ?? 0 },
                { label: "paused", value: torrents?.filter(item => item.status === "paused").length ?? 0 },
                { label: "queued to add", value: addQueue?.total ?? 0 },
            ]}
            href="/torrent-list"
        />
    )
}

export function LandingAchievementsWidget() {
    const { data: achievements } = useGetAchievementSummary()
    const unlocked = achievements?.unlockedCount ?? 0
    const total = achievements?.totalCount ?? 0

    return (
        <StatsDoor
            title="Achievements"
            icon={<GiTrophyCup className="w-5 h-5" />}
            stats={[
                { label: "unlocked", value: unlocked },
                { label: "total", value: total },
                { label: "remaining", value: Math.max(0, total - unlocked) },
                { label: "complete %", value: total > 0 ? Math.round(unlocked / total * 100) : 0 },
            ]}
            href="/achievements"
        />
    )
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
    stats: { label: string, value: number }[]
    href: string
}) {
    const statsGridColumns = stats.length >= 6
        ? "grid-cols-2 min-[480px]:grid-cols-3 2xl:grid-cols-4"
        : stats.length === 3 || stats.length === 5
            ? "grid-cols-2 min-[480px]:grid-cols-3"
            : "grid-cols-2"

    const statsValueSize = stats.length >= 6 ? "text-lg sm:text-xl 2xl:text-lg" : "text-2xl lg:text-3xl 2xl:text-2xl"

    return (
        <SeaLink href={href} className="group/door block h-full">
            <button
                className={cn(
                    "group relative isolate z-[1] w-full h-full overflow-hidden rounded-2xl border border-white/10 bg-black/55 p-4 text-left shadow-lg shadow-black/30 ring-1 ring-white/[0.03] backdrop-blur-xl lg:p-5",
                    "transition-all duration-300 hover:-translate-y-1 hover:border-[--brand]/60 hover:bg-black/70 hover:shadow-xl hover:shadow-[--brand]/20",
                )}
            >
                <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-[--brand]/20 opacity-40 blur-3xl transition-opacity group-hover:opacity-80" />
                <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                <div className="relative flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400/40 to-brand-600/30 text-white shadow-inner ring-1 ring-white/10">
                            {icon}
                        </div>
                        <p className="truncate text-[15px] font-semibold tracking-tight text-white">{title}</p>
                    </div>
                    <LuArrowRight className="size-4 shrink-0 -translate-x-1 text-white/40 opacity-0 transition-all group-hover:translate-x-0 group-hover:text-[--brand] group-hover:opacity-100" />
                </div>
                {!!stats.length && (
                    <div className={cn("relative mt-4 grid gap-2", statsGridColumns)}>
                        {stats.map(stat => (
                            <div
                                key={stat.label}
                                title={`${stat.label}: ${formatNumber(stat.value)}`}
                                className="min-h-[4.25rem] min-w-0 rounded-xl border border-white/[0.08] bg-black/20 px-2.5 py-2.5 transition-colors group-hover:border-white/[0.12] group-hover:bg-white/[0.05]"
                            >
                                <p className={cn("whitespace-nowrap font-bold leading-none tracking-tight text-white tabular-nums", statsValueSize)}>
                                    {formatNumber(stat.value)}
                                </p>
                                <p className="mt-1.5 text-[10px] font-medium leading-tight text-white/60 capitalize">{stat.label}</p>
                            </div>
                        ))}
                    </div>
                )}
            </button>
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
