import { useSyncDownloadingAnime } from "@/app/(main)/_atoms/downloading.atoms"
import { useSyncMangaBadges } from "@/app/(main)/_atoms/manga-badges.atoms"
import { AchievementUnlockPanel } from "@/app/(main)/_features/achievement/achievement-unlock-panel"
import { AnilistAvailabilityBanner } from "@/app/(main)/_features/anilist/anilist-availability-banner"
import { MainLayout } from "@/app/(main)/_features/layout/main-layout"
import { OfflineLayout } from "@/app/(main)/_features/layout/offline-layout"
import { TopNavbar } from "@/app/(main)/_features/layout/top-navbar"
import { TourOverlay } from "@/app/(main)/_features/tour/tour-overlay"
import { PendingSyncIndicator } from "@/lib/offline-progress/pending-sync-indicator"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { ServerDataWrapper } from "@/app/(main)/server-data-wrapper"
import { AppErrorBoundary } from "@/components/shared/app-error-boundary"
import { createFileRoute, Outlet } from "@tanstack/react-router"
import React from "react"
import { ErrorBoundary } from "react-error-boundary"

export const Route = createFileRoute("/_main")({
    component: Layout,
})

function Layout() {
    const serverStatus = useServerStatus()
    const [host, setHost] = React.useState<string>("")

    // The single app-wide poll that every download badge is drawn from. Mounted here because this
    // is the layout the app actually renders.
    //
    // It used to be called from `app/(main)/layout.tsx`, which is a Next.js-style layout left over
    // from before this app moved to a router with its own route files — nothing imports it, so
    // nothing ever ran it. The badges therefore had no data on any build, on any client, however
    // freshly installed: the only badge that ever appeared was the optimistic one the Download
    // button sets by hand, which expires after two minutes, which is why a badge would show up and
    // then vanish for good. The request never left the browser, which is why this endpoint left no
    // trace in the server log while everything else did.
    useSyncDownloadingAnime()
    // The manga counterpart, polled the same way. See manga-badges.atoms.
    useSyncMangaBadges()

    React.useEffect(() => {
        setHost(window?.location?.host || "")
    }, [])

    if (serverStatus?.isOffline) {
        return (
            <ServerDataWrapper host={host}>
                <OfflineLayout>
                    <div data-offline-layout-container className="h-auto">
                        <TopNavbar />
                        <div data-offline-layout-content>
                            <Outlet />
                        </div>
                    </div>
                </OfflineLayout>
            </ServerDataWrapper>
        )
    }

    return (
        <ServerDataWrapper host={host}>
            <MainLayout>
                <div data-main-layout-container className="h-auto">
                    {/* Above everything, because when AniList is down every screen below fails and
                        none of them can explain why. */}
                    <AnilistAvailabilityBanner />
                    <TopNavbar />
                    <div data-main-layout-content>
                        <ErrorBoundary FallbackComponent={AppErrorBoundary}>
                            <Outlet />
                        </ErrorBoundary>
                    </div>
                </div>
            </MainLayout>
            <TourOverlay />
            <AchievementUnlockPanel />
            <PendingSyncIndicator />
        </ServerDataWrapper>
    )
}
