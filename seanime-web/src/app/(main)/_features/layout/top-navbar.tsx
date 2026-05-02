import { OfflineTopMenu } from "@/app/(main)/_features/offline/_components/offline-top-menu"
import { LayoutHeaderBackground } from "@/app/(main)/_features/layout/_components/layout-header-background"
import { TopMenu } from "@/app/(main)/_features/navigation/top-menu"
import { ManualProgressTrackingButton } from "@/app/(main)/_features/progress-tracking/manual-progress-tracking"
import { PlaybackManagerProgressTrackingButton } from "@/app/(main)/_features/progress-tracking/playback-manager-progress-tracking"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { ChapterDownloadsButton } from "@/app/(main)/manga/_containers/chapter-downloads/chapter-downloads-button"
import { __manga_chapterDownloadsDrawerIsOpenAtom } from "@/app/(main)/manga/_containers/chapter-downloads/chapter-downloads-drawer"
import { AppSidebarTrigger } from "@/components/ui/app-layout"
import { cn } from "@/components/ui/core/styling"
import { VerticalMenu } from "@/components/ui/vertical-menu"
import { useThemeSettings } from "@/lib/theme/hooks"
import { __isDesktop__ } from "@/types/constants"
import { useSetAtom } from "jotai/react"
import { usePathname } from "@/lib/navigation"
import React from "react"
import { LuFolderDown, LuChevronLeft, LuChevronRight } from "react-icons/lu"
import { PluginSidebarTray } from "../plugin/tray/plugin-sidebar-tray"
import { Tooltip } from "@/components/ui/tooltip"

function NavHistoryButtons({ vertical = false }: { vertical?: boolean }) {
    const [canGoBack, setCanGoBack] = React.useState(false)
    const [canGoForward, setCanGoForward] = React.useState(false)
    const pathname = usePathname()

    React.useEffect(() => {
        setCanGoBack(window.history.length > 1)
        // No standard API to detect forward availability; track it with popstate
        const onPop = () => {
            setCanGoBack(window.history.length > 1)
        }
        window.addEventListener("popstate", onPop)
        return () => window.removeEventListener("popstate", onPop)
    }, [pathname])

    const btnClass = cn(
        "flex items-center justify-center rounded-md transition-colors",
        "text-[--muted] hover:text-[--foreground] hover:bg-white/10",
        vertical ? "w-9 h-9" : "w-8 h-8",
    )

    return (
        <div className={cn("flex items-center gap-0.5", vertical && "flex-col")}>
            <Tooltip trigger={
                <button
                    className={cn(btnClass, !canGoBack && "opacity-30 pointer-events-none")}
                    onClick={() => window.history.back()}
                    aria-label="Go back"
                >
                    <LuChevronLeft className="w-4 h-4" />
                </button>
            }>Back</Tooltip>
            <Tooltip trigger={
                <button
                    className={cn(btnClass)}
                    onClick={() => window.history.forward()}
                    aria-label="Go forward"
                >
                    <LuChevronRight className="w-4 h-4" />
                </button>
            }>Forward</Tooltip>
        </div>
    )
}

type TopNavbarProps = {
    children?: React.ReactNode
}

export function TopNavbar(props: TopNavbarProps) {

    const {
        children,
        ...rest
    } = props

    const serverStatus = useServerStatus()
    const isOffline = serverStatus?.isOffline
    const ts = useThemeSettings()

    return (
        <>
            <div
                data-top-navbar
                className={cn(
                    "w-full h-[5rem] relative overflow-hidden flex items-center",
                    (ts.hideTopNavbar || __isDesktop__) && "lg:hidden",
                )}
            >
                <div
                    data-top-navbar-content-container
                    className="relative z-10 px-4 w-full flex flex-row md:items-center overflow-x-auto overflow-y-hidden"
                >
                    <div data-top-navbar-content className="flex items-center w-full gap-3">
                        <AppSidebarTrigger />
                        <NavHistoryButtons />
                        {!isOffline ? <TopMenu /> : <OfflineTopMenu />}
                        <PlaybackManagerProgressTrackingButton />
                        <ManualProgressTrackingButton />
                        <div data-top-navbar-content-separator className="flex flex-1"></div>
                        <PluginSidebarTray place="top" />
                        {!isOffline && <ChapterDownloadsButton />}
                        {/*{!isOffline && <RefreshAnilistButton />}*/}
                    </div>
                </div>
                <LayoutHeaderBackground />
            </div>
        </>
    )
}


type SidebarNavbarProps = {
    isCollapsed: boolean
    handleExpandSidebar: () => void
    handleUnexpandedSidebar: () => void
}

export function SidebarNavbar(props: SidebarNavbarProps) {

    const {
        isCollapsed,
        handleExpandSidebar,
        handleUnexpandedSidebar,
        ...rest
    } = props

    const serverStatus = useServerStatus()
    const ts = useThemeSettings()
    const openDownloadQueue = useSetAtom(__manga_chapterDownloadsDrawerIsOpenAtom)

    if (!ts.hideTopNavbar && process.env.NEXT_PUBLIC_PLATFORM !== "desktop") return null

    return (
        <div data-sidebar-navbar className="flex flex-col gap-1">
            <div className="flex justify-center py-1">
                <NavHistoryButtons vertical />
            </div>
            {!serverStatus?.isOffline && <VerticalMenu
                data-sidebar-navbar-vertical-menu
                className="px-4"
                collapsed={isCollapsed}
                itemClass="relative"
                onMouseEnter={handleExpandSidebar}
                onMouseLeave={handleUnexpandedSidebar}
                isSidebar
                items={[
                    {
                        iconType: LuFolderDown,
                        name: "Manga Downloads",
                        onClick: () => {
                            openDownloadQueue(true)
                        },
                    },
                ]}
            />}
            <div data-sidebar-navbar-playback-manager-progress-tracking-button className="flex justify-center">
                <PlaybackManagerProgressTrackingButton asSidebarButton />
            </div>
            <div data-sidebar-navbar-manual-progress-tracking-button className="flex justify-center">
                <ManualProgressTrackingButton asSidebarButton />
            </div>
        </div>
    )
}
