"use client"
import { MainLayout } from "@/app/(main)/_features/layout/main-layout"
import { TopNavbar } from "@/app/(main)/_features/layout/top-navbar"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { ServerDataWrapper } from "@/app/(main)/server-data-wrapper"
import React from "react"
import { LuCloudOff, LuX } from "react-icons/lu"
import { useRouter } from "@/lib/navigation"

export default function Layout({ children }: { children: React.ReactNode }) {
    const serverStatus = useServerStatus()
    const [host, setHost] = React.useState<string>("")
    React.useEffect(() => { setHost(window?.location?.host || "") }, [])

    return (
        <ServerDataWrapper host={host}>
            <MainLayout>
                {serverStatus?.isOffline && <OfflineBanner />}
                <div data-main-layout-container className="h-auto">
                    <TopNavbar />
                    <div data-main-layout-content>
                        {children}
                    </div>
                </div>
            </MainLayout>
        </ServerDataWrapper>
    )
}

function OfflineBanner() {
    const [dismissed, setDismissed] = React.useState(false)
    const router = useRouter()
    if (dismissed) return null
    return (
        <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between gap-4 px-4 py-2 bg-amber-950/90 border-b border-amber-700/50 backdrop-blur-sm text-amber-200 text-xs">
            <div className="flex items-center gap-2">
                <LuCloudOff className="w-3.5 h-3.5 shrink-0" />
                <span>Offline mode — browsing cached data. Some features are unavailable.</span>
                <button
                    onClick={() => router.push("/sync")}
                    className="underline underline-offset-2 hover:text-amber-100 transition-colors"
                >
                    Manage
                </button>
            </div>
            <button onClick={() => setDismissed(true)} className="p-0.5 hover:text-amber-100 transition-colors shrink-0">
                <LuX className="w-3.5 h-3.5" />
            </button>
        </div>
    )
}


export const dynamic = "force-static"
