"use client"

import { useGetLibraryCollection } from "@/api/hooks/anime_collection.hooks"
import { useGetToWatch } from "@/api/hooks/towatch.hooks"
import { useGetUnmatchedTorrents } from "@/api/hooks/unmatched.hooks"
import { useGetAchievementSummary } from "@/api/hooks/achievement.hooks"
import { useMissingEpisodeCount } from "@/app/(main)/_hooks/missing-episodes-loader"
import { useGetMangaCollection } from "@/api/hooks/manga.hooks"
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

    const count = React.useMemo(() => {
        let total = 0
        for (const list of libraryCollection?.lists ?? []) {
            total += list.entries?.length ?? 0
        }
        return total
    }, [libraryCollection])

    const watching = libraryCollection?.lists?.find(l => l.type === "CURRENT")?.entries?.length ?? 0

    return (
        <StatsDoor
            title="Anime"
            icon={<LuMonitorPlay className="w-5 h-5" />}
            stats={[
                { label: "in your library", value: count },
                { label: "watching", value: watching },
            ]}
            href="/anime"
        />
    )
}

export function LandingMangaStatsWidget() {
    const { data: mangaCollection } = useGetMangaCollection()

    const count = React.useMemo(() => {
        let total = 0
        for (const list of mangaCollection?.lists ?? []) {
            total += list.entries?.length ?? 0
        }
        return total
    }, [mangaCollection])

    const reading = mangaCollection?.lists?.find(l => l.type === "CURRENT")?.entries?.length ?? 0

    return (
        <StatsDoor
            title="Manga"
            icon={<BiBook className="w-5 h-5" />}
            stats={[
                { label: "in your library", value: count },
                { label: "reading", value: reading },
            ]}
            href="/manga"
        />
    )
}

export function LandingScheduleWidget() {
    const missingEpisodes = useMissingEpisodeCount()

    return (
        <StatsDoor
            title="Schedule"
            icon={<LuCalendar className="w-5 h-5" />}
            stats={[
                { label: "missing episodes", value: missingEpisodes },
            ]}
            href="/schedule"
        />
    )
}

export function LandingToWatchWidget() {
    const { data: toWatch } = useGetToWatch()

    return (
        <StatsDoor
            title="Todo List"
            icon={<LuListVideo className="w-5 h-5" />}
            stats={[
                { label: "queued", value: toWatch?.length ?? 0 },
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
    const { data: unmatched } = useGetUnmatchedTorrents({ staleTime: 60_000 })

    return (
        <StatsDoor
            title="Torrent list"
            icon={<LuWand className="w-5 h-5" />}
            stats={[
                { label: "waiting", value: unmatched?.length ?? 0 },
            ]}
            href="/torrent-list"
        />
    )
}

export function LandingAchievementsWidget() {
    const { data: achievements } = useGetAchievementSummary()

    return (
        <StatsDoor
            title="Achievements"
            icon={<GiTrophyCup className="w-5 h-5" />}
            stats={[
                { label: "unlocked", value: achievements?.unlockedCount ?? 0 },
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
    return (
        <SeaLink href={href} className="group/door block h-full">
            <button
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
                    <div className="relative mt-4 flex flex-wrap items-end gap-x-5 gap-y-2">
                        {stats.map(stat => (
                            <div key={stat.label} className="leading-none">
                                <p className="text-3xl lg:text-4xl font-extrabold text-white tabular-nums">{formatNumber(stat.value)}</p>
                                <p className="text-[11px] uppercase tracking-wider text-white/80 mt-1.5 whitespace-nowrap">{stat.label}</p>
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
