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
import { CommunityHomeSection } from "@/app/(main)/_features/community/community-home-section"
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
            <PageWrapper className="relative p-4 sm:p-6 lg:p-10 space-y-10 min-h-screen">
                {/* Soft brand glows give the wallpaper some colour without covering it */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] -z-0 bg-[radial-gradient(60%_80%_at_15%_0%,rgb(var(--color-brand-500)/0.28),transparent_70%),radial-gradient(45%_70%_at_90%_10%,rgb(var(--color-brand-300)/0.16),transparent_70%)]" />

                {/* Hero */}
                <section className="relative z-[1] rounded-3xl border border-white/10 bg-black/25 backdrop-blur-xl shadow-2xl shadow-black/30 p-6 lg:p-10 overflow-hidden">
                    <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[--brand]/25 blur-3xl" />
                    <div className="relative flex items-end justify-between gap-6 flex-wrap">
                        <div className="min-w-0">
                            <p className="text-sm uppercase tracking-[0.25em] text-[--brand] font-semibold">{greeting()}</p>
                            <h1 className="mt-2 text-4xl lg:text-6xl font-extrabold tracking-tight leading-[1.05] text-white drop-shadow-lg">
                                {user?.viewer?.name
                                    ? <>Welcome back, <span className="bg-gradient-to-r from-brand-200 to-brand-500 bg-clip-text text-transparent">{user.viewer.name}</span></>
                                    : <>Welcome back</>}
                            </h1>
                            <p className="text-lg text-white/70 mt-3 font-medium">Where do you want to go?</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
                                className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 backdrop-blur-xl px-5 py-2.5 text-sm font-medium text-white hover:bg-black/60 hover:border-[--brand]/70 transition-all"
                            >
                                <FiSearch className="w-4 h-4" />
                                Search
                            </button>
                            <button
                                onClick={() => setSettingsOpen(true)}
                                className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 backdrop-blur-xl px-5 py-2.5 text-sm font-medium text-white hover:bg-black/60 hover:border-[--brand]/70 transition-all"
                                title="Landing page settings"
                            >
                                <LuSettings2 className="w-4 h-4" />
                                Customize
                            </button>
                        </div>
                    </div>
                </section>

                {/* Whatever was being watched */}
                {firstWidgetId === "continue-watching" && (
                    <div className="relative z-[1] rounded-3xl border border-white/10 bg-black/25 backdrop-blur-xl shadow-xl shadow-black/20 p-4 lg:p-6">
                        <ContinueWatching
                            episodes={continueWatchingList}
                            isLoading={isLibraryLoading}
                        />
                    </div>
                )}

                {/* The doors and their numbers */}
                {!!stats.length && (
                    <div
                        className="relative z-[1] grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4"
                        data-landing-stats-strip
                    >
                        {stats.map(widget => (
                            <LandingWidget key={widget.id} id={widget.id} />
                        ))}
                    </div>
                )}

                {/* Sections, full width */}
                {sections.filter(w => w.id !== (firstWidgetId === "continue-watching" ? "continue-watching" : null)).map(widget => (
                    <div key={widget.id} className="relative z-[1] rounded-3xl border border-white/10 bg-black/25 backdrop-blur-xl shadow-xl shadow-black/20 p-4 lg:p-6">
                        <LandingWidget id={widget.id} />
                    </div>
                ))}

                {/* Community */}
                <div className="relative z-[1] rounded-3xl border border-white/10 bg-black/25 backdrop-blur-xl shadow-xl shadow-black/20 p-4 lg:p-6">
                    <CommunityHomeSection />
                </div>

                <LandingSettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
            </PageWrapper>
        </>
    )
}

function greeting() {
    const h = new Date().getHours()
    if (h < 5) return "Up late"
    if (h < 12) return "Good morning"
    if (h < 18) return "Good afternoon"
    return "Good evening"
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
