"use client"

import { useGetLibraryCollection } from "@/api/hooks/anime_collection.hooks"
import { useGetAchievementSummary } from "@/api/hooks/achievement.hooks"
import { useGetToWatch } from "@/api/hooks/towatch.hooks"
import { useGetUnmatchedTorrents } from "@/api/hooks/unmatched.hooks"
import { useCurrentUser, useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { useMissingEpisodeCount } from "@/app/(main)/_hooks/missing-episodes-loader"
import { ContinueWatching } from "@/app/(main)/(library)/_containers/continue-watching"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { cn } from "@/components/ui/core/styling"
import { useRouter } from "@/lib/navigation"
import React from "react"
import { BiBook, BiCalendar } from "react-icons/bi"
import { FiSearch } from "react-icons/fi"
import { GiTrophyCup } from "react-icons/gi"
import { LuArrowRight, LuCompass, LuFolderSearch, LuListVideo, LuMonitorPlay, LuUsers, LuWand } from "react-icons/lu"
import { RiListCheck3 } from "react-icons/ri"

/**
 * The landing page.
 *
 * A hub rather than a library: the app has a dozen places worth going, and opening on one of them
 * made the rest a hunt through the sidebar. This is the map — the areas people actually go to,
 * each a card that says what it is and how much is waiting in it — and the anime library is one
 * door among them rather than the room you start in.
 *
 * Every number here is a count the app already knows: nothing on this page is a second source of
 * truth, and a card without anything to count simply says what it is.
 */
export function LandingHub() {
    const router = useRouter()
    const user = useCurrentUser()
    const serverStatus = useServerStatus()

    const { data: libraryCollection } = useGetLibraryCollection({ staleTime: 30_000 })
    const { data: toWatch } = useGetToWatch()
    const { data: unmatched } = useGetUnmatchedTorrents({ staleTime: 60_000 })
    const { data: achievements } = useGetAchievementSummary()
    const missingEpisodes = useMissingEpisodeCount()

    const libraryCount = React.useMemo(() => {
        let count = 0
        for (const list of libraryCollection?.lists ?? []) {
            count += list.entries?.length ?? 0
        }
        return count
    }, [libraryCollection])

    const hasManga = !!serverStatus?.settings?.library?.enableManga

    const destinations = React.useMemo(() => [
        {
            id: "anime",
            name: "Anime",
            description: "Your library, everything you have.",
            href: "/anime",
            icon: LuMonitorPlay,
            stat: libraryCount > 0 ? `${libraryCount} ${libraryCount === 1 ? "entry" : "entries"}` : undefined,
        },
        {
            id: "schedule",
            name: "Schedule",
            description: "What airs next, and what you are behind on.",
            href: "/schedule",
            icon: BiCalendar,
            stat: missingEpisodes > 0 ? `${missingEpisodes} missing` : undefined,
        },
        ...(hasManga ? [{
            id: "manga",
            name: "Manga",
            description: "Your reading, and what is new.",
            href: "/manga",
            icon: BiBook,
            stat: undefined,
        }] : []),
        {
            id: "to-watch",
            name: "To Watch",
            description: "The list you arranged, in your order.",
            href: "/to-watch",
            icon: LuListVideo,
            stat: toWatch?.length ? `${toWatch.length} queued` : undefined,
        },
        {
            id: "discover",
            name: "Discover",
            description: "Something new, from what you already like.",
            href: "/discover",
            icon: LuCompass,
            stat: undefined,
        },
        {
            id: "lists",
            name: "My List",
            description: "Your AniList lists, as AniList keeps them.",
            href: "/lists",
            icon: RiListCheck3,
            stat: undefined,
        },
        {
            id: "unmatched",
            name: "Unmatched Downloads",
            description: "Finished downloads waiting to be matched.",
            href: "/unmatched",
            icon: LuFolderSearch,
            stat: unmatched?.length ? `${unmatched.length} waiting` : undefined,
        },
        {
            id: "torrents",
            name: "Torrent list",
            description: "What is downloading, and what is seeding.",
            href: "/torrent-list",
            icon: LuWand,
            stat: undefined,
        },
        {
            id: "community",
            name: "Community",
            description: "Who else is here, and what they are watching.",
            href: "/community",
            icon: LuUsers,
            stat: undefined,
        },
        {
            id: "achievements",
            name: "Achievements",
            description: "Everything you have unlocked so far.",
            href: "/achievements",
            icon: GiTrophyCup,
            stat: achievements?.unlockedCount ? `${achievements.unlockedCount} unlocked` : undefined,
        },
    ], [libraryCount, missingEpisodes, hasManga, toWatch?.length, unmatched?.length, achievements?.unlockedCount])

    return (
        <>
            <CustomLibraryBanner discrete />
            <PageWrapper className="p-4 sm:p-8 space-y-8">
                <div className="flex items-end justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-3xl font-bold">
                            {user?.viewer?.name ? <>Welcome back, {user.viewer.name}</> : <>Welcome back</>}
                        </h1>
                        <p className="text-sm text-[--muted] mt-1">Where do you want to go?</p>
                    </div>
                    <button
                        onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
                        className="flex items-center gap-2 rounded-lg border border-[--border] bg-gray-900/60 px-3 py-2 text-xs text-[--muted] hover:text-white hover:border-gray-600 transition-colors"
                    >
                        <FiSearch className="w-3.5 h-3.5" />
                        Search everything
                    </button>
                </div>

                {/* Whatever was being watched, first — it is the one thing a landing page can know
                    that a menu cannot. */}
                <ContinueWatching />

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {destinations.map(destination => (
                        <button
                            key={destination.id}
                            onClick={() => router.push(destination.href)}
                            className={cn(
                                "group text-left rounded-xl border border-gray-800 bg-gray-950/50 p-5",
                                "transition-all hover:border-brand-600/60 hover:bg-gray-900/50",
                            )}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-800/70 text-brand-300">
                                    <destination.icon className="w-5 h-5" />
                                </div>
                                <LuArrowRight className="w-4 h-4 text-[--muted] opacity-0 group-hover:opacity-100 group-hover:text-brand-300 transition-all" />
                            </div>
                            <p className="font-semibold mt-4">{destination.name}</p>
                            <p className="text-xs text-[--muted] leading-relaxed mt-1">{destination.description}</p>
                            {destination.stat && (
                                <p className="text-[11px] text-brand-300/90 mt-2 tabular-nums">{destination.stat}</p>
                            )}
                        </button>
                    ))}
                </div>
            </PageWrapper>
        </>
    )
}
