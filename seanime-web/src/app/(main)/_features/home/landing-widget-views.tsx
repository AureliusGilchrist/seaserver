"use client"

import { useGetLibraryCollection } from "@/api/hooks/anime_collection.hooks"
import { useGetToWatch } from "@/api/hooks/towatch.hooks"
import { useGetUnmatchedTorrents } from "@/api/hooks/unmatched.hooks"
import { useGetAchievementSummary } from "@/api/hooks/achievement.hooks"
import { useMissingEpisodeCount } from "@/app/(main)/_hooks/missing-episodes-loader"
import { useGetAnimeGojuuonMap } from "@/api/hooks/services.hooks"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { useGetMangaCollection } from "@/api/hooks/manga.hooks"
import { useAnilistListRecentAiringAnime } from "@/api/hooks/anilist.hooks"
import { LANDING_QUICK_LINKS, LANDING_WIDGET_META, type LandingWidgetId } from "@/app/(main)/_features/home/landing-widgets"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { SeaLink } from "@/components/shared/sea-link"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import {
    LuArrowRight, LuBook, LuCalendar, LuCircleAlert, LuCompass, LuDownload,
    LuFolderSearch, LuListVideo, LuMonitorPlay, LuRss, LuUsers, LuWand, LuTrophy,
} from "react-icons/lu"
import { BiBook, BiCalendar } from "react-icons/bi"
import { GiTrophyCup } from "react-icons/gi"

/**
 * The widgets themselves.
 *
 * Each one is a thing the app already knows how to show, drawn as a card that says what it is and,
 * where there is a number for it, what that number is. Nothing here is a second source of truth —
 * every widget reads the hooks the rest of the app reads — and a widget without anything to show
 * simply says what it is, or nothing at all.
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
}

export function LandingQuickLinksWidget({ visibleLinks }: { visibleLinks?: string[] }) {
    const links = React.useMemo(
        () => LANDING_QUICK_LINKS.filter(link => !visibleLinks?.length || visibleLinks.includes(link.id)),
        [visibleLinks],
    )

    if (!links.length) return null

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {links.map(link => {
                const Icon = quickLinkIcons[link.id] ?? LuArrowRight
                return (
                    <SeaLink key={link.id} href={link.href}>
                        <button
                            className={cn(
                                "group w-full text-left rounded-xl border border-gray-800 bg-gray-950/50 p-5",
                                "transition-all hover:border-brand-600/60 hover:bg-gray-900/50",
                            )}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-800/70 text-brand-300">
                                    <Icon className="w-5 h-5" />
                                </div>
                                <LuArrowRight className="w-4 h-4 text-[--muted] opacity-0 group-hover:opacity-100 group-hover:text-brand-300 transition-all" />
                            </div>
                            <p className="font-semibold mt-4">{link.name}</p>
                            <p className="text-xs text-[--muted] leading-relaxed mt-1">{link.description}</p>
                        </button>
                    </SeaLink>
                )
            })}
        </div>
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
        <StatsCard
            title="Anime"
            icon={<LuMonitorPlay className="w-5 h-5" />}
            stats={[
                { label: "In your library", value: count },
                { label: "Watching", value: watching },
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
        <StatsCard
            title="Manga"
            icon={<BiBook className="w-5 h-5" />}
            stats={[
                { label: "In your library", value: count },
                { label: "Reading", value: reading },
            ]}
            href="/manga"
        />
    )
}

export function LandingScheduleWidget() {
    const missingEpisodes = useMissingEpisodeCount()
    const serverStatus = useServerStatus()

    return (
        <StatsCard
            title="Schedule"
            icon={<LuCalendar className="w-5 h-5" />}
            stats={[
                { label: "Missing episodes", value: missingEpisodes },
            ]}
            href="/schedule"
        />
    )
}

export function LandingToWatchWidget() {
    const { data: toWatch } = useGetToWatch()

    return (
        <StatsCard
            title="To Watch"
            icon={<LuListVideo className="w-5 h-5" />}
            stats={[
                { label: "Queued", value: toWatch?.length ?? 0 },
            ]}
            href="/to-watch"
        />
    )
}

export function LandingUnmatchedWidget() {
    const { data: unmatched } = useGetUnmatchedTorrents({ staleTime: 60_000 })

    return (
        <StatsCard
            title="Unmatched Downloads"
            icon={<LuFolderSearch className="w-5 h-5" />}
            stats={[
                { label: "Waiting", value: unmatched?.length ?? 0 },
            ]}
            href="/unmatched"
        />
    )
}

export function LandingTorrentsWidget() {
    const { data: unmatched } = useGetUnmatchedTorrents({ staleTime: 60_000 })

    return (
        <StatsCard
            title="Torrent list"
            icon={<LuWand className="w-5 h-5" />}
            stats={[]}
            href="/torrent-list"
        />
    )
}

export function LandingAchievementsWidget() {
    const { data: achievements } = useGetAchievementSummary()

    return (
        <StatsCard
            title="Achievements"
            icon={<GiTrophyCup className="w-5 h-5" />}
            stats={[
                { label: "Unlocked", value: achievements?.unlockedCount ?? 0 },
            ]}
            href="/achievements"
        />
    )
}

function StatsCard({ title, icon, stats, href }: {
    title: string
    icon: React.ReactNode
    stats: { label: string, value: number }[]
    href: string
}) {
    return (
        <SeaLink href={href}>
            <button
                className={cn(
                    "group w-full text-left rounded-xl border border-gray-800 bg-gray-950/50 p-5",
                    "transition-all hover:border-brand-600/60 hover:bg-gray-900/50",
                )}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-800/70 text-brand-300">
                        {icon}
                    </div>
                    <LuArrowRight className="w-4 h-4 text-[--muted] opacity-0 group-hover:opacity-100 group-hover:text-brand-300 transition-all" />
                </div>
                <p className="font-semibold mt-4">{title}</p>
                {!!stats.length && (
                    <div className="mt-2 space-y-1">
                        {stats.map(stat => (
                            <p key={stat.label} className="text-xs text-[--muted]">
                                <span className="text-brand-300/90 font-semibold tabular-nums">{stat.value.toLocaleString()}</span>
                                {" "}{stat.label}
                            </p>
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
        <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-5">
            <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-800/70">
                    <LuRss className="w-4 h-4 text-brand-300" />
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
