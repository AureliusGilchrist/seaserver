"use client"

import { useSeaCommand } from "@/app/(main)/_features/sea-command/sea-command"
import { vc_isFullscreen } from "@/app/(main)/_features/video-core/video-core-atoms"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { useAppSidebarContext } from "@/components/ui/app-layout"
import { cn } from "@/components/ui/core/styling"
import { __isMobileShell__ } from "@/types/constants"
import { useAtomValue } from "jotai"
import { usePathname, useRouter } from "@/lib/navigation"
import React from "react"
import { LuBookOpen, LuCompass, LuLayoutDashboard, LuMenu, LuMonitorPlay, LuSearch } from "react-icons/lu"

/**
 * The Denshi Mobile bottom dock.
 *
 * Five destinations that deserve a thumb's reach — home, the library flip, discover, search, and
 * "more", which opens the full sidebar as a drawer (the same navigation the desktop uses, so
 * nothing is a second source of truth). The dock floats above the content like a pane of glass:
 * frosted, lifted, and lit with the theme's brand color on the active tab.
 */

type MobileTab = {
    id: string
    label: string
    icon: React.ElementType
    href?: string
    active?: boolean
    action?: () => void
}

export function MobileTabBar() {
    const pathname = usePathname()
    const router = useRouter()
    const serverStatus = useServerStatus()
    const sidebarCtx = useAppSidebarContext()
    const { setSeaCommandOpen } = useSeaCommand()
    const isFullscreen = useAtomValue(vc_isFullscreen)

    const enableManga = !!serverStatus?.settings?.library?.enableManga
    const isOnManga = enableManga && pathname.startsWith("/manga")

    const tabs: MobileTab[] = [
        {
            id: "home",
            label: "Home",
            icon: LuLayoutDashboard,
            href: "/",
            active: pathname === "/",
        },
        {
            id: "library",
            label: isOnManga ? "Manga" : "Library",
            icon: isOnManga ? LuBookOpen : LuMonitorPlay,
            href: isOnManga ? "/manga" : "/anime",
            active: pathname.startsWith("/anime") || pathname.startsWith("/manga"),
        },
        {
            id: "discover",
            label: "Discover",
            icon: LuCompass,
            href: "/discover",
            active: pathname.startsWith("/discover"),
        },
        {
            id: "search",
            label: "Search",
            icon: LuSearch,
            action: () => setSeaCommandOpen(true),
        },
        {
            id: "more",
            label: "More",
            icon: LuMenu,
            action: () => sidebarCtx.setOpen(true),
            active: sidebarCtx.open,
        },
    ]

    // Fullscreen video owns the screen; get out of its way.
    if (isFullscreen) return null

    return (
        <div
            data-mobile-dock=""
            className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] px-4 pb-[max(0.9rem,env(safe-area-inset-bottom))] print:hidden"
        >
            <nav
                aria-label="Main navigation"
                className={cn(
                    "pointer-events-auto mx-auto flex h-[4.25rem] w-full max-w-md items-stretch justify-around gap-0.5 rounded-[1.9rem] border border-white/10 bg-gray-950/70 px-1.5",
                    "shadow-[0_16px_48px_-12px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.08)]",
                    "backdrop-blur-2xl",
                    "animate-in slide-in-from-bottom-8 fade-in duration-500",
                )}
            >
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        aria-label={tab.label}
                        aria-current={tab.active ? "page" : undefined}
                        className="group relative flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-[1.4rem] py-1.5 outline-none transition-transform duration-150 ease-out active:scale-[0.88] focus-visible:ring-2 focus-visible:ring-[--brand]/60"
                        onClick={() => {
                            if (tab.action) {
                                tab.action()
                                return
                            }
                            if (tab.href && !tab.active) router.push(tab.href)
                            else if (tab.href && tab.active) router.push(tab.href)
                        }}
                    >
                        <span
                            className={cn(
                                "flex size-9 items-center justify-center rounded-2xl transition-all duration-300 ease-out",
                                tab.active
                                    ? "bg-gradient-to-br from-[--brand]/35 via-[--brand]/20 to-transparent text-[--brand] ring-1 ring-[--brand]/50 shadow-[0_0_24px_-6px_var(--brand)]"
                                    : "text-[--muted] group-hover:text-[--foreground] group-hover:bg-[--subtle]",
                            )}
                        >
                            <tab.icon className={cn("size-[1.15rem] transition-transform duration-300 ease-out", tab.active && "scale-[1.12]")} />
                        </span>
                        <span
                            className={cn(
                                "text-[9.5px] font-bold uppercase tracking-[0.08em] transition-colors duration-200",
                                tab.active ? "text-[--brand]" : "text-[--muted]",
                            )}
                        >
                            {tab.label}
                        </span>
                    </button>
                ))}
            </nav>
        </div>
    )
}
