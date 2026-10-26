"use client"

import { useCurrentUser, useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { ContinueWatching } from "@/app/(main)/(library)/_containers/continue-watching"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { useHandleLibraryCollection } from "@/app/(main)/(library)/_lib/handle-library-collection"
import { useLandingWidgets, type LandingWidgetId } from "@/app/(main)/_features/home/landing-widgets"
import {
    LandingAchievementsWidget,
    LandingAiringTodayWidget,
    LandingAnimeStatsWidget,
    LandingContinueReadingWidget,
    LandingLibraryInsightsWidget,
    LandingMangaStatsWidget,
    LandingNewsWidget,
    LandingQuickLinksWidget,
    LandingScheduleWidget,
    LandingToWatchWidget,
    LandingTorrentsWidget,
    LandingUnmatchedWidget,
    LandingUpdatesWidget,
} from "@/app/(main)/_features/home/landing-widget-views"
import { __landingSettingsModalOpen, LandingSettingsModal } from "@/app/(main)/_features/home/landing-settings-modal"
import { MangaUpcomingChapters } from "@/app/(main)/manga/_containers/manga-upcoming-chapters"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { CommunityHomeSection } from "@/app/(main)/_features/community/community-home-section"
import { FiSearch } from "react-icons/fi"
import { LuSettings2 } from "react-icons/lu"
import { useAtom } from "jotai/react"
import React from "react"

/**
 * The responsive home base for the app: media activity, library widgets, and every main
 * destination organized into profile-specific folders. Destination pages keep their own routes.
 */
export function LandingHub() {
    const user = useCurrentUser()
    const serverStatus = useServerStatus()
    const { widgets } = useLandingWidgets()
    const { continueWatchingList, isLoading: isLibraryLoading } = useHandleLibraryCollection()

    const [settingsOpen, setSettingsOpen] = useAtom(__landingSettingsModalOpen)
    const heroRef = React.useRef<HTMLElement>(null)

    React.useEffect(() => {
        const hero = heroRef.current
        if (!hero || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

        let frame = 0
        const updateOpacity = () => {
            if (frame) return
            frame = window.requestAnimationFrame(() => {
                frame = 0
                const fadeProgress = Math.min(1, Math.max(0, window.scrollY / 220))
                hero.style.opacity = String(1 - fadeProgress)
            })
        }

        updateOpacity()
        window.addEventListener("scroll", updateOpacity, { passive: true })
        return () => {
            window.removeEventListener("scroll", updateOpacity)
            if (frame) window.cancelAnimationFrame(frame)
        }
    }, [])

    // Whatever was being watched reads full width when it is the first thing on — the one thing a
    // landing page can know that a menu cannot. Inside the person's order otherwise.
    const ordered = React.useMemo(() => widgets.filter(w => w.enabled), [widgets])
    const firstWidgetId = ordered[0]?.id
    const quickLinksWidget = ordered.find(w => w.id === "quick-links")

    // The stat doors: compact number cards. Navigation folders and content sections use full width.
    const statIds: LandingWidgetId[] = [
        "anime-stats", "manga-stats", "schedule", "airing-today", "to-watch", "unmatched", "torrents", "achievements",
    ]
    const stats = React.useMemo(() => ordered.filter(w => statIds.includes(w.id)), [ordered])
    const sections = React.useMemo(
        () => ordered.filter(w => !statIds.includes(w.id) && w.id !== "quick-links"),
        [ordered],
    )

    return (
        <>
            <CustomLibraryBanner discrete />
            <PageWrapper className="relative mx-auto min-h-[100svh] w-full max-w-[1800px] space-y-6 overflow-x-hidden px-3 py-4 sm:space-y-8 sm:px-5 sm:py-6 lg:space-y-10 lg:px-8 xl:px-10">
                {/* Hero */}
                <section ref={heroRef} data-landing-hero className="relative z-[1] overflow-hidden rounded-3xl border border-white/10 bg-black/25 p-5 shadow-2xl shadow-black/30 backdrop-blur-md sm:p-7 lg:p-10">
                    <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[--brand]/25 blur-3xl" />
                    <div className="relative flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end sm:gap-6">
                        <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[--brand] sm:text-sm sm:tracking-[0.25em]">{greeting()}</p>
                            <h1 className="mt-2 break-words text-3xl font-extrabold leading-[1.05] tracking-tight text-white drop-shadow-lg sm:text-4xl lg:text-5xl 2xl:text-6xl">
                                {user?.viewer?.name
                                    ? <>Welcome back, <span className="bg-gradient-to-r from-brand-200 to-brand-500 bg-clip-text text-transparent">{user.viewer.name}</span></>
                                    : <>Welcome back</>}
                            </h1>
                            <p className="mt-3 text-base font-medium text-white/70 sm:text-lg">Your library, tools, and community in one place.</p>
                        </div>
                        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
                            <button
                                onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
                                className="flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-md transition-all hover:border-[--brand]/70 hover:bg-black/60 sm:flex-none sm:px-5"
                            >
                                <FiSearch className="w-4 h-4" />
                                Search
                            </button>
                            <button
                                onClick={() => setSettingsOpen(true)}
                                className="flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-md transition-all hover:border-[--brand]/70 hover:bg-black/60 sm:flex-none sm:px-5"
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
                    <div className="relative z-[1] rounded-3xl border border-white/10 bg-black/20 p-4 shadow-xl shadow-black/20 backdrop-blur-md sm:p-5">
                        <ContinueWatching
                            episodes={continueWatchingList}
                            isLoading={isLibraryLoading}
                            showWhenEmpty
                        />
                    </div>
                )}

                {quickLinksWidget && (
                    <div className="relative z-[1]">
                        <LandingWidget id={quickLinksWidget.id} />
                    </div>
                )}

                {/* The doors and their numbers */}
                {!!stats.length && (
                    <div
                        className="relative z-[1] grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 sm:gap-4"
                        data-landing-stats-strip
                    >
                        {stats.map(widget => (
                            <LandingWidget key={widget.id} id={widget.id} />
                        ))}
                    </div>
                )}

                {/* Sections, full width */}
                {sections.filter(w => w.id !== (firstWidgetId === "continue-watching" ? "continue-watching" : null)).map(widget => (
                    <div key={widget.id} className="relative z-[1]">
                        <LandingWidget
                            id={widget.id}
                            continueWatchingList={continueWatchingList}
                            isLibraryLoading={isLibraryLoading}
                        />
                    </div>
                ))}

                {/* Community */}
                <CommunityHomeSection />

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

function LandingWidget({ id, continueWatchingList = [], isLibraryLoading = false }: {
    id: LandingWidgetId
    continueWatchingList?: ReturnType<typeof useHandleLibraryCollection>["continueWatchingList"]
    isLibraryLoading?: boolean
}) {
    switch (id) {
        case "quick-links":
            return <LandingQuickLinksWidget />
        case "library-insights":
            return <LandingLibraryInsightsWidget />
        case "anime-stats":
            return <LandingAnimeStatsWidget />
        case "manga-stats":
            return <LandingMangaStatsWidget />
        case "upcoming-manga":
            return <MangaUpcomingChapters />
        case "schedule":
            return <LandingScheduleWidget />
        case "airing-today":
            return <LandingAiringTodayWidget />
        case "continue-watching":
            return (
                <div className="relative z-[1] rounded-3xl border border-white/10 bg-black/20 p-4 shadow-xl shadow-black/20 backdrop-blur-md sm:p-5">
                    <ContinueWatching episodes={continueWatchingList} isLoading={isLibraryLoading} withTitle showWhenEmpty />
                </div>
            )
        case "continue-reading":
            return <LandingContinueReadingWidget />
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
        case "news-feed":
            return <LandingNewsWidget />
        default:
            return null
    }
}
