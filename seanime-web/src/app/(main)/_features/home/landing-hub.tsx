"use client"

import { useCurrentUser, useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { ContinueWatching } from "@/app/(main)/(library)/_containers/continue-watching"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { useHandleLibraryCollection } from "@/app/(main)/(library)/_lib/handle-library-collection"
import { useLandingWidgets, type LandingWidgetId } from "@/app/(main)/_features/home/landing-widgets"
import {
    LandingAchievementsWidget,
    LandingAnimeStatsWidget,
    LandingMangaStatsWidget,
    LandingQuickLinksWidget,
    LandingScheduleWidget,
    LandingToWatchWidget,
    LandingTorrentsWidget,
    LandingUnmatchedWidget,
    LandingUpdatesWidget,
} from "@/app/(main)/_features/home/landing-widget-views"
import { __landingSettingsModalOpen, LandingSettingsModal } from "@/app/(main)/_features/home/landing-settings-modal"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { FiSearch } from "react-icons/fi"
import { LuSettings2 } from "react-icons/lu"
import { useAtom } from "jotai/react"
import React from "react"

/**
 * The landing page.
 *
 * A dashboard rather than a feed: everything the app can say on one screen, arranged so that none
 * of it wastes the space it sits in. The tiles share one band — each a door, each carrying its
 * number — the sections below it are the things that are more than a number, and the person's own
 * arrangement sits over all of it: every widget optional, every one reorderable, from the gear.
 *
 * Every number here is a count the app already knows: nothing on this page is a second source of
 * truth, and a widget without anything to show simply says what it is.
 */
export function LandingHub() {
    const user = useCurrentUser()
    const serverStatus = useServerStatus()
    const { widgets } = useLandingWidgets()
    const { continueWatchingList, isLoading: isLibraryLoading } = useHandleLibraryCollection()

    const [settingsOpen, setSettingsOpen] = useAtom(__landingSettingsModalOpen)

    // Whatever was being watched reads full width when it is the first thing on — the one thing a
    // landing page can know that a menu cannot. Inside the person's order otherwise.
    const ordered = React.useMemo(() => widgets.filter(w => w.enabled), [widgets])
    const firstWidgetId = ordered[0]?.id

    // The tile band: the widgets that are a number and a door. The rest render below, full width.
    const tileIds: LandingWidgetId[] = [
        "quick-links", "anime-stats", "manga-stats", "schedule", "to-watch", "unmatched", "torrents", "achievements",
    ]
    const tiles = React.useMemo(() => ordered.filter(w => tileIds.includes(w.id)), [ordered])
    const sections = React.useMemo(() => ordered.filter(w => !tileIds.includes(w.id)), [ordered])

    return (
        <>
            <CustomLibraryBanner discrete />
            <PageWrapper className="p-4 sm:p-6 lg:p-8 space-y-6">

                {/* ── The hero: greeting, search, customize — one row, no wasted height ── */}
                <div className="rounded-2xl border border-[--border] bg-gray-950/60 backdrop-blur-sm px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                        <h1 className="text-2xl lg:text-3xl font-bold leading-tight">
                            {user?.viewer?.name ? <>Welcome back, {user.viewer.name}</> : <>Welcome back</>}
                        </h1>
                        <p className="text-sm text-[--muted] mt-0.5">Where do you want to go?</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
                            className="flex items-center gap-2 rounded-lg border border-[--border] bg-gray-900/60 px-3 py-2 text-xs text-[--muted] hover:text-white hover:border-gray-600 transition-colors"
                        >
                            <FiSearch className="w-3.5 h-3.5" />
                            Search everything
                        </button>
                        <button
                            onClick={() => setSettingsOpen(true)}
                            className="flex items-center gap-2 rounded-lg border border-[--border] bg-gray-900/60 px-3 py-2 text-xs text-[--muted] hover:text-white hover:border-gray-600 transition-colors"
                            title="Landing page settings"
                        >
                            <LuSettings2 className="w-3.5 h-3.5" />
                            Customize
                        </button>
                    </div>
                </div>

                {/* ── Whatever was being watched ── */}
                {firstWidgetId === "continue-watching" && (
                    <ContinueWatching
                        episodes={continueWatchingList}
                        isLoading={isLibraryLoading}
                    />
                )}

                {/* ── The tile band: every door and its number, on one grid ── */}
                {!!tiles.length && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3">
                        {tiles.map(widget => (
                            <LandingWidget key={widget.id} id={widget.id} />
                        ))}
                    </div>
                )}

                {/* ── The sections: the widgets that are more than a number, full width ── */}
                {sections.filter(w => w.id !== (firstWidgetId === "continue-watching" ? "continue-watching" : null)).map(widget => (
                    <LandingWidget key={widget.id} id={widget.id} />
                ))}

                <LandingSettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
            </PageWrapper>
        </>
    )
}

function LandingWidget({ id }: { id: LandingWidgetId }) {
    switch (id) {
        case "quick-links":
            return <LandingQuickLinksWidget />
        case "anime-stats":
            return <LandingAnimeStatsWidget />
        case "manga-stats":
            return <LandingMangaStatsWidget />
        case "schedule":
            return <LandingScheduleWidget />
        case "to-watch":
            return <LandingToWatchWidget />
        case "unmatched":
            return <LandingUnmatchedWidget />
        case "torrents":
            return <LandingTorrentsWidget />
        case "achievements":
            return <LandingAchievementsWidget />
        case "updates":
            return <LandingUpdatesWidget />
        case "continue-watching":
        case "continue-reading":
        case "airing-today":
            return null
        default:
            return null
    }
}
