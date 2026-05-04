"use client"

import { listen } from "@tauri-apps/api/event"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { Window } from "@tauri-apps/api/window"
import React from "react"

type TauriManagerProps = {
    children?: React.ReactNode
}

// This is only rendered on the Desktop client
export function TauriManager(props: TauriManagerProps) {

    const {
        children,
        ...rest
    } = props

    React.useEffect(() => {
        const u = listen("message", (event) => {
            const message = event.payload
            console.log("Received message from Rust:", message)
        })

        // WebView2 on Windows intercepts F11 and calls documentElement.requestFullscreen()
        // before any JS keydown fires. We intercept fullscreenchange instead: if the ROOT
        // element entered fullscreen (WebView2 F11), undo it and use Tauri native fullscreen.
        // Video player fullscreen uses a specific container element, so they're distinguishable.
        const handleFullscreenChange = async () => {
            if (!document.fullscreenElement) return
            if (document.fullscreenElement === document.documentElement) {
                // WebView2 F11 — swap for Tauri native fullscreen
                await document.exitFullscreen().catch(() => {})
                await toggleFullscreen()
            }
            // Any other element = video player — leave it alone
        }

        // Keydown handler: F11 always toggles Tauri native window fullscreen,
        // even when the video player is in DOM fullscreen (both can be active at once).
        // Escape exits Tauri fullscreen only when video is NOT in DOM fullscreen
        // (video's own Escape handler covers the video-fullscreen case).
        const handleKeydown = (e: KeyboardEvent) => {
            if (e.key === "F11") {
                e.preventDefault()
                e.stopPropagation()
                // Always toggle window fullscreen — independent of video DOM fullscreen state
                toggleFullscreen()
                return
            }
            if (e.key === "Escape" && !document.fullscreenElement) {
                const appWindow = new Window("main")
                appWindow.isFullscreen().then((isFs) => { if (isFs) toggleFullscreen() })
            }
        }

        document.addEventListener("fullscreenchange", handleFullscreenChange)
        window.addEventListener("keydown", handleKeydown, { capture: true })

        return () => {
            u.then((f) => f())
            document.removeEventListener("fullscreenchange", handleFullscreenChange)
            window.removeEventListener("keydown", handleKeydown, { capture: true })
        }
    }, [])

    async function toggleFullscreen() {
        const appWindow = new Window("main")

        // Only toggle fullscreen on the main window
        if (getCurrentWebviewWindow().label !== "main") return

        const fullscreen = await appWindow.isFullscreen()
        if (!fullscreen) {
            // Entering fullscreen:
            // 1. Remove decorations first to eliminate the title bar gap at the top.
            // 2. Set fullscreen — on Windows this alone can still leave a taskbar gap.
            // 3. setAlwaysOnTop(true) causes the window to render over the taskbar,
            //    filling the full screen area including where the taskbar sits.
            await appWindow.setDecorations(false)
            await appWindow.setFullscreen(true)
            await appWindow.setAlwaysOnTop(true)
        } else {
            // Exiting fullscreen:
            // 1. Clear alwaysOnTop so the taskbar regains its normal z-order.
            // 2. Exit fullscreen — window returns to its previous size.
            // 3. Restore decorations (title bar).
            await appWindow.setAlwaysOnTop(false)
            await appWindow.setFullscreen(false)
            await appWindow.setDecorations(true)
        }

        // Notify all listeners (title bar, video manager, etc.) of the new state.
        window.dispatchEvent(new CustomEvent("tauri:fullscreenchange", { detail: { isFullscreen: !fullscreen } }))
    }

    return (
        <>

        </>
    )
}
