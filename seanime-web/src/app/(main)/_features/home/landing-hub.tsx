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
 * A hub rather than a library: the app has a dozen places worth going, and opening on one of them
 * made the rest a hunt through the sidebar. This is the map — and it is the person's own map: the
 * page is a set of widgets, each optional, each reorderable, arranged in the settings the gear
 * above opens. The anime library is one door among them rather than the room you start in.
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

    // The one thing a landing page can know that a menu cannot — whatever was being watched — reads
    // full width above the cards when it is switched on, and inside the order it was put otherwise.
    const firstWidgetId = widgets.find(w => w.enabled)?.id

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

                {firstWidgetId === "continue-watching" && (
                    <ContinueWatching
                        episodes={continueWatchingList}
                        isLoading={isLibraryLoading}
                    />
                )}

                {widgets
                    .filter(w => w.enabled && w.id !== (firstWidgetId === "continue-watching" ? "continue-watching" : null))
                    .map(widget => (
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
            return null
        case "continue-reading":
            return null
        case "airing-today":
            return null
        default:
            return null
    }
}
