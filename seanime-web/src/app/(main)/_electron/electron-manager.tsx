"use client"

import Mousetrap from "mousetrap"
import { useRouter } from "@/lib/navigation"
import React from "react"
import { toast } from "sonner"
import {
    isPopoutPlayerWindow,
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
 *
 * The "Return pip" box over the main window's player lives in the player itself
 * (video-core.tsx), so only the player area is blurred — the rest of the app stays usable.
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

    return null
}
