"use client"

import { useSetOfflineMode } from "@/api/hooks/local.hooks"
import { vc_isFullscreen } from "@/app/(main)/_features/video-core/video-core-atoms"
import { SeaLink } from "@/components/shared/sea-link"
import { cn } from "@/components/ui/core/styling"
import { useConnectivity, useOfflineForced } from "@/lib/server/connectivity"
import { useAtomValue } from "jotai"
import React from "react"
import { IoCloudOfflineOutline } from "react-icons/io5"

/**
 * The one place that says the app is offline, on every screen and every client.
 *
 * Three different states, each said plainly: offline mode turned on by hand (with the way back), no
 * internet on the server, and AniList blocked in the settings. Out of the way of fullscreen video.
 */
export function OfflineBanner() {
    const connectivity = useConnectivity()
    const forced = useOfflineForced()
    const fullscreen = useAtomValue(vc_isFullscreen)
    const { mutate: setOfflineMode, isPending } = useSetOfflineMode()

    if (connectivity === "online" || fullscreen) return null

    const blocked = connectivity === "blocked"

    return (
        <div
            data-offline-banner={connectivity}
            role="status"
            className={cn(
                "sticky top-0 z-[60] w-full",
                "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2",
                "border-b border-amber-700/60 bg-amber-950/90 backdrop-blur",
                "text-sm text-amber-100",
            )}
        >
            <IoCloudOfflineOutline className="size-5 flex-none text-amber-400" />
            <span className="text-center">
                <span className="font-semibold">
                    {blocked ? "AniList is blocked" : forced ? "You're offline" : "No internet on the server"}
                </span>
                <span className="text-amber-200/80">
                    {" "}— {blocked
                        ? "nothing is sent to AniList; changes wait until you unblock it."
                        : forced
                            ? "offline mode is on. Showing what's saved; changes sync when you go online."
                            : "showing what's saved. Changes sync when it's back."}
                </span>
            </span>
            {forced && !blocked && (
                <button
                    type="button"
                    disabled={isPending}
                    onClick={() => setOfflineMode({ enabled: false })}
                    className="rounded-full bg-amber-400 px-3 py-0.5 text-xs font-semibold text-black transition hover:bg-amber-300 disabled:opacity-60"
                >
                    Go online
                </button>
            )}
            {blocked && (
                <SeaLink href="/settings" className="rounded-full border border-amber-400/60 px-3 py-0.5 text-xs font-semibold text-amber-100 hover:bg-amber-400/10">
                    Settings
                </SeaLink>
            )}
        </div>
    )
}
