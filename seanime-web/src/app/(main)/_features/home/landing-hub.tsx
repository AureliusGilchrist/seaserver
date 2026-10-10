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
 * A map of the app, set like a front door rather than a dashboard: the greeting is the one large
 * thing on the page, the thing that was being watched sits directly under it, the doors the app
 * opens read as a row the way the sidebar does — a name, not a card — and the library's numbers are
 * a line of figures rather than a grid of boxes. Everything after that is the person's own
 * arrangement: every widget optional, every one reorderable, from the gear.
 *
 * The page inherits the app's materials — its background, borders and brand color, so it changes
 * with the wallpaper the way every other screen does — and adds nothing of its own except scale.
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

    // The stat doors: the widgets that are a number and a way in. The rest render below, full width.
    const statIds: LandingWidgetId[] = [
        "quick-links", "anime-stats", "manga-stats", "schedule", "to-watch", "unmatched", "torrents", "achievements",
    ]
    const stats = React.useMemo(() => ordered.filter(w => statIds.includes(w.id)), [ordered])
    const sections = React.useMemo(() => ordered.filter(w => !statIds.includes(w.id)), [ordered])

    return (
        <>
            <CustomLibraryBanner discrete />
            <PageWrapper className="p-4 sm:p-6 lg:p-8 space-y-8">

                {/* ── The greeting, set large ──
                    One row: the name, and the two actions that are worth their place. The search is
                    the page's real question — "Where do you want to go?" is what the row answers. */}
                <div className="flex items-end justify-between gap-6 flex-wrap">
                    <div className="min-w-0">
                        <h1 className="text-4xl lg:text-6xl font-bold tracking-tight leading-[1.05] text-white">
                            {user?.viewer?.name
                                ? <>Welcome back, <span className="text-[--brand]">{user.viewer.name}</span></>
                                : <>Welcome back</>}
                        </h1>
                        <p className="text-lg text-[--muted] mt-2 font-medium">Where do you want to go?</p>
                    </div>
                    <div className="flex items-center gap-2 pb-1">
                        <button
                            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
                            className="flex items-center gap-2 rounded-lg border border-[--border] bg-[--card] px-3.5 py-2 text-sm text-[--muted] hover:text-white hover:border-[--brand]/50 transition-colors"
                        >
                            <FiSearch className="w-4 h-4" />
                            Search
                        </button>
                        <button
                            onClick={() => setSettingsOpen(true)}
                            className="flex items-center gap-2 rounded-lg border border-[--border] bg-[--card] px-3.5 py-2 text-sm text-[--muted] hover:text-white hover:border-[--brand]/50 transition-colors"
                            title="Landing page settings"
                        >
                            <LuSettings2 className="w-4 h-4" />
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

                {/* ── The doors and their numbers ──
                    One quiet strip: the widgets that are a number and a way in, drawn as the sidebar
                    draws itself — an icon, a name, and where there is one, the figure. No boxes: the
                    separators between them are the only structure, so the numbers carry the weight. */}
                {!!stats.length && (
                    <div
                        className="flex flex-wrap items-stretch gap-x-0 gap-y-4 divide-x divide-[--border]"
                        data-landing-stats-strip
                    >
                        {stats.map(widget => (
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
