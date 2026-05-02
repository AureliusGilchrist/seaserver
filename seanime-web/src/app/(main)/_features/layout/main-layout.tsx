"use client"
import { MangaHydrationProgressBar, ScanProgressBar } from "@/app/(main)/(library)/_containers/scan-progress-bar"
import { ScannerModal } from "@/app/(main)/(library)/_containers/scanner-modal"
import { ErrorExplainer } from "@/app/(main)/_features/error-explainer/error-explainer"
import { IssueReport } from "@/app/(main)/_features/issue-report/issue-report"
import { LibraryExplorerDrawer } from "@/app/(main)/_features/library-explorer/library-explorer-drawer"
import { LibraryWatcher } from "@/app/(main)/_features/library-watcher/library-watcher"
import { MediaPreviewModal } from "@/app/(main)/_features/media/_containers/media-preview-modal"
import { MainSidebar } from "@/app/(main)/_features/navigation/main-sidebar"
import { GlobalPlaylistManager } from "@/app/(main)/_features/playlists/_containers/global-playlist-manager"
import { PlaylistListModal } from "@/app/(main)/_features/playlists/playlist-list-modal"
import { PluginManager } from "@/app/(main)/_features/plugin/plugin-manager"
import { PluginWebviewSlot } from "@/app/(main)/_features/plugin/webview/plugin-webviews"
import { ManualProgressTracking } from "@/app/(main)/_features/progress-tracking/manual-progress-tracking"
import { PlaybackManagerProgressTracking } from "@/app/(main)/_features/progress-tracking/playback-manager-progress-tracking"
import { SeaCommand } from "@/app/(main)/_features/sea-command/sea-command"
import { VideoCoreProvider } from "@/app/(main)/_features/video-core/video-core"
import { useAnimeCollectionLoader } from "@/app/(main)/_hooks/anilist-collection-loader"
import { useAnimeLibraryCollectionLoader } from "@/app/(main)/_hooks/anime-library-collection-loader"
import { useMissingEpisodesLoader } from "@/app/(main)/_hooks/missing-episodes-loader"
import { useAnimeCollectionListener } from "@/app/(main)/_listeners/anilist-collection.listeners"
import { useAutoDownloaderItemListener } from "@/app/(main)/_listeners/autodownloader.listeners"
import { useExtensionListener } from "@/app/(main)/_listeners/extensions.listeners"
import { useExternalPlayerLinkListener } from "@/app/(main)/_listeners/external-player-link.listeners"
import { useMangaListener } from "@/app/(main)/_listeners/manga.listeners"
import { useMiscEventListeners } from "@/app/(main)/_listeners/misc-events.listeners"
import { useSyncListener } from "@/app/(main)/_listeners/sync.listeners"
import { DebridStreamOverlay } from "@/app/(main)/entry/_containers/debrid-stream/debrid-stream-overlay"
import { useTorrentStreamListener } from "@/app/(main)/entry/_containers/torrent-stream/_lib/handle-torrent-stream"
import { TorrentStreamOverlay } from "@/app/(main)/entry/_containers/torrent-stream/torrent-stream-overlay"
import { ChapterDownloadsDrawer } from "@/app/(main)/manga/_containers/chapter-downloads/chapter-downloads-drawer"
import { LoadingOverlayWithLogo } from "@/components/shared/loading-overlay-with-logo"
import { AppLayout, AppLayoutContent, AppLayoutSidebar, AppSidebarProvider } from "@/components/ui/app-layout"
import { __isElectronDesktop__ } from "@/types/constants"
import { usePathname, useRouter } from "@/lib/navigation"
import React from "react"
import { useServerStatus } from "../../_hooks/use-server-status"
import { useInvalidateQueriesListener } from "../../_listeners/invalidate-queries.listeners"
import { AdminAnnouncementsBanner } from "../admin-announcements"
import { AnilistStatusBanner } from "../anilist-status-banner"
import { OSTPlayer } from "../ost-player/ost-player"
import { Announcements } from "../announcements"
import { AnimeThemeProvider } from "@/lib/theme/anime-themes/anime-theme-provider"
import { CursorProvider } from "@/lib/cursors/cursor-provider"
import { RewardProvider } from "@/lib/rewards/reward-provider"
import { UICustomizeProvider } from "@/lib/ui-customize/ui-customize-provider"
import { SoundProvider } from "@/lib/sounds/sound-provider"
import { EasterEggEngine } from "@/lib/easter-eggs/easter-egg-engine"
import { NakamaManager } from "../nakama/nakama-manager"
import { NakamaWatchPartyChat, NakamaWatchPartyChatProvider } from "../nakama/nakama-watch-party-chat"
import { NativePlayer } from "../native-player/native-player"
import { TopIndefiniteLoader } from "../top-indefinite-loader"
import { NewEpisodeNotifier } from "../new-episode-notifier"
import { GlobalRewardShopButton } from "../navigation/global-reward-shop-button"
import { RewardParticlesLayer } from "@/lib/rewards/reward-particles"
import { WorkspaceBar, WORKSPACE_BAR_HEIGHT } from "../navigation/workspace-bar"
import { useGetProfiles } from "@/api/hooks/profiles.hooks"

export const MainLayout = ({ children }: { children: React.ReactNode }) => {
    const { data: profiles } = useGetProfiles(true)
    const hasMultipleProfiles = (profiles?.length ?? 0) > 1
    const topOffset = hasMultipleProfiles ? WORKSPACE_BAR_HEIGHT : 0

    return (
        <>
            <AnimeThemeProvider>
            <UICustomizeProvider>
            <RewardProvider>
            <EasterEggEngine>
            <CursorProvider>
            <SoundProvider>
            <RewardParticlesLayer />
            <Loader />
            <ScanProgressBar />
            <MangaHydrationProgressBar />
            <LibraryWatcher />
            <ScannerModal />
            <PlaylistListModal />
            <GlobalPlaylistManager />
            <ChapterDownloadsDrawer />
            <TorrentStreamOverlay />
            <DebridStreamOverlay />
            <MediaPreviewModal />
            <PlaybackManagerProgressTracking />
            <ManualProgressTracking />
            <IssueReport />
            <ErrorExplainer />
            <SeaCommand />
            <PluginManager />
            {(__isElectronDesktop__) && <VideoCoreProvider key="native-player" id="native-player">
                <NativePlayer />
            </VideoCoreProvider>}
            <NakamaManager />
            <NakamaWatchPartyChatProvider />
            <NakamaWatchPartyChat />
            <TopIndefiniteLoader />
            <NewEpisodeNotifier />
            <AnilistStatusBanner />
            <Announcements />
            <AdminAnnouncementsBanner />
            <LibraryExplorerDrawer />
            <PluginWebviewSlot slot="fixed" />
            <GlobalRewardShopButton />
            <OSTPlayer />
            <WorkspaceBar />

            <AppSidebarProvider>
                <AppLayout withSidebar sidebarSize="slim" style={{ paddingTop: topOffset }}>
                    <AppLayoutSidebar>
                        <MainSidebar />
                    </AppLayoutSidebar>
                    <AppLayout>
                        <AppLayoutContent>
                            {children}
                        </AppLayoutContent>
                    </AppLayout>
                </AppLayout>
            </AppSidebarProvider>
            </SoundProvider>
            </CursorProvider>
            </EasterEggEngine>
            </RewardProvider>
            </UICustomizeProvider>
            </AnimeThemeProvider>
        </>
    )
}

function Loader() {
    /**
     * Data loaders
     */
    useAnimeLibraryCollectionLoader()
    useAnimeCollectionLoader()
    useMissingEpisodesLoader()

    /**
     * Websocket listeners
     */
    useAutoDownloaderItemListener()
    useAnimeCollectionListener()
    useMiscEventListeners()
    useExtensionListener()
    useMangaListener()
    useExternalPlayerLinkListener()
    useSyncListener()
    useInvalidateQueriesListener()
    useTorrentStreamListener()

    const serverStatus = useServerStatus()
    const router = useRouter()
    const pathname = usePathname()

    const [hasNavigated, setHasNavigated] = React.useState(false)

    // dumb fix for duplicated player
    const prevPathname = React.useRef(pathname)
    React.useEffect(() => {
        if (prevPathname.current !== pathname && pathname !== "/") {
            setHasNavigated(true)
        }
        prevPathname.current = pathname
    }, [pathname])

    React.useEffect(() => {
        if (pathname.startsWith("/offline")) {
            router.push("/")
        }
    }, [pathname])

    return null
}
