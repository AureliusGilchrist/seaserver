"use client"

import { useGetLibraryCollection } from "@/api/hooks/anime_collection.hooks"
import { useGetToWatch } from "@/api/hooks/towatch.hooks"
import { useGetUnmatchedTorrents } from "@/api/hooks/unmatched.hooks"
import { useGetAchievementSummary } from "@/api/hooks/achievement.hooks"
import { useMissingEpisodeCount } from "@/app/(main)/_hooks/missing-episodes-loader"
import { useGetMangaCollection } from "@/api/hooks/manga.hooks"
import { LANDING_QUICK_LINKS } from "@/app/(main)/_features/home/landing-widgets"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { SeaLink } from "@/components/shared/sea-link"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import {
    LuArrowRight, LuCalendar, LuCompass, LuDownload,
    LuFolderSearch, LuListVideo, LuMonitorPlay, LuRss,
    LuUsers, LuWand,
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
}

export function LandingQuickLinksWidget({ visibleLinks }: { visibleLinks?: string[] }) {
    const links = React.useMemo(
        () => LANDING_QUICK_LINKS.filter(link => !visibleLinks?.length || visibleLinks.includes(link.id)),
        [visibleLinks],
    )

    if (!links.length) return null

    return (
        <PageWrapper className="px-0">
            <h2 className="px-4 lg:px-0">Quick links</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
                {links.map(link => {
                    const Icon = quickLinkIcons[link.id] ?? LuArrowRight
                    return (
                        <SeaLink key={link.id} href={link.href}>
                            <button
                                className={cn(
                                    "group w-full text-left rounded-xl border border-[--border] bg-[--card] p-5",
                                    "transition-colors hover:border-[--brand]/50 hover:bg-[--subtle]",
                                )}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[--subtle] text-[--brand]">
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <LuArrowRight className="w-4 h-4 text-[--muted] opacity-0 group-hover:opacity-100 group-hover:text-[--brand] transition-all" />
                                </div>
                                <p className="font-semibold mt-4">{link.name}</p>
                                <p className="text-xs text-[--muted] leading-relaxed mt-1">{link.description}</p>
                            </button>
                        </SeaLink>
                    )
                })}
            </div>
        </PageWrapper>
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
            title="To Watch"
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
 * A door, drawn the way the sidebar draws itself: an icon, a name, the figure it carries. The strip
 * supplies the separators; the cell supplies nothing but spacing — no border, no background, no
 * shadow — so the numbers carry the weight and the row reads as one line of figures rather than a
 * grid of boxes.
 */
function StatsDoor({ title, icon, stats, href }: {
    title: string
    icon: React.ReactNode
    stats: { label: string, value: number }[]
    href: string
}) {
    return (
        <SeaLink href={href} className="group/door block min-w-[10rem] flex-1">
            <button
                className="w-full text-left px-5 py-3 rounded-lg transition-colors hover:bg-[--subtle] focus-visible:ring-2 focus-visible:ring-[--brand] outline-none"
            >
                <div className="flex items-center gap-2.5 text-[--brand]">
                    {icon}
                    <p className="font-semibold text-white">{title}</p>
                </div>
                {!!stats.length && (
                    <div className="mt-2 space-y-0.5">
                        {stats.map(stat => (
                            <p key={stat.label} className="text-xs text-[--muted] leading-snug">
                                <span className="text-xl lg:text-2xl font-bold text-white tabular-nums mr-1.5 align-[-0.05em]">{stat.value.toLocaleString()}</span>
                                {stat.label}
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
        <div className="rounded-xl border border-[--border] bg-[--card] p-5">
            <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[--subtle]">
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
