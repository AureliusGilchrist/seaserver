"use client"

// The server reports the seanime-web version it was built to serve (frontendVersion in /status).
// This bundle was built from a different version, which means the server has been updated but the
// client is still running its old UI — a restart (or refresh) picks up the new one.
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { Button } from "@/components/ui/button"
import React from "react"
import { LuMonitorDown, LuX } from "react-icons/lu"

export function StaleFrontendBanner() {
    const serverStatus = useServerStatus()
    const [dismissed, setDismissed] = React.useState(false)

    const serverVersion = serverStatus?.frontendVersion
    const clientVersion = process.env.SEA_APP_VERSION

    // Missing on either side means an older server or a dev build — never nag there.
    const isStale = !!serverVersion && !!clientVersion && serverVersion !== clientVersion

    if (!isStale || dismissed) {
        return null
    }

    return (
        <div className="fixed inset-x-0 bottom-0 z-[999] space-y-2 p-3 sm:p-5 pointer-events-none" role="region" aria-live="polite" aria-label="Client update">
            <div className="pointer-events-auto mx-auto w-full max-w-3xl">
                <div className="relative flex items-start gap-3 rounded-2xl border border-brand-300/20 bg-gradient-to-br from-gray-950/95 via-gray-950/90 to-brand-950/35 p-4 pl-5 shadow-2xl shadow-black/40 backdrop-blur-2xl sm:p-5 sm:pl-6">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-brand-300/20 bg-brand-400/10 text-brand-100 shadow-inner">
                        <LuMonitorDown className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-100">
                            Client update available
                        </span>
                        <p className="mt-1.5 text-sm leading-relaxed text-white/90">
                            The server is running a newer interface ({serverVersion}) than this one ({clientVersion}).
                            Restart the app or refresh the page to load the latest version.
                        </p>
                    </div>
                    <Button
                        intent="primary"
                        size="sm"
                        className="shrink-0 self-center"
                        onClick={() => window.location.reload()}
                    >
                        Refresh
                    </Button>
                    <button
                        type="button"
                        onClick={() => setDismissed(true)}
                        aria-label="Dismiss"
                        title="Dismiss"
                        className="flex size-9 shrink-0 self-center items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/60 transition hover:border-white/20 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                    >
                        <LuX className="size-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}
