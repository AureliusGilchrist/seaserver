"use client"

import Mousetrap from "mousetrap"
import { useRouter } from "@/lib/navigation"
import React from "react"
import { toast } from "sonner"
import { LuArrowDownLeft } from "react-icons/lu"
import { askPopoutToReturn } from "@/app/(main)/_features/video-core/video-core-popout-resume"
import {
    isPopoutPlayerWindow,
    onPopoutPlayingChange,
    startMainWindowPlaybackGuard,
    startPopoutPlaybackBeacon,
} from "@/app/(main)/_features/video-core/video-core-single-playback"

// This is only rendered on the Electron Desktop client
export function ElectronManager() {
    const { back, forward } = useRouter()

    React.useEffect(() => {
        if (!window.electron) return
        const isMac = window.electron?.platform === "darwin"
        const modifier = isMac ? "command" : "alt"

        Mousetrap.bind(`${modifier}+left`, (e) => {
            e.preventDefault()
            back()
            return false
        })

        Mousetrap.bind(`${modifier}+right`, (e) => {
            e.preventDefault()
            forward()
            return false
        })

        return () => {
            Mousetrap.unbind(`${modifier}+left`)
            Mousetrap.unbind(`${modifier}+right`)
        }
    }, [])

    return null
}

/**
 * Only one window plays at a time, and the popout player always wins: the popout reports its
 * playback, and the main window pauses (and refuses to start) while it plays. Mounted from the
 * root template, so it runs in both windows (app/layout.tsx is not used by the router).
 */
export function ElectronSinglePlayback() {
    React.useEffect(() => {
        if (!window.electron) return
        if (isPopoutPlayerWindow()) return startPopoutPlaybackBeacon()
        let lastToast = 0
        return startMainWindowPlaybackGuard(() => {
            if (Date.now() - lastToast < 4000) return
            lastToast = Date.now()
            toast.info("Playing in the popout player. Return it to watch here.")
        })
    }, [])

    if (isPopoutPlayerWindow()) return null
    return <PopoutReturnOverlay />
}

/**
 * While the popout (pip) window plays, the main window can't: the popout has priority over
 * every player here. So the window is blurred and disabled, with a "Return pip" box in the
 * middle — clicking it asks the popout to hand playback back, which restores the normal
 * player here and closes the pip. The popout window never renders this (its player keeps
 * drawing unblurred); it lives in the main window only.
 */
function PopoutReturnOverlay() {
    const [playing, setPlaying] = React.useState(false)
    React.useEffect(() => onPopoutPlayingChange(setPlaying), [])

    if (!playing) return null

    return (
        <div
            className="fixed inset-0 z-[2147483000] flex items-center justify-center select-none"
            style={{
                backdropFilter: "blur(18px)",
                WebkitBackdropFilter: "blur(18px)",
                backgroundColor: "rgba(0, 0, 0, 0.45)",
            }}
        >
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/15 bg-black/50 px-10 py-8 shadow-2xl">
                <p className="text-white/80 text-sm font-medium">Now playing in the pip window</p>
                <button
                    type="button"
                    onClick={() => askPopoutToReturn()}
                    className="flex items-center gap-2.5 rounded-full bg-white/10 px-6 py-2.5 text-white text-sm font-semibold border border-white/25 transition-colors hover:bg-white/20"
                >
                    <LuArrowDownLeft className="size-5" />
                    Return pip
                </button>
            </div>
        </div>
    )
}
