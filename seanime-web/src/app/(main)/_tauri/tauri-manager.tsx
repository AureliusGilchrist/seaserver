"use client"

import { listen } from "@tauri-apps/api/event"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { Window } from "@tauri-apps/api/window"
import mousetrap from "mousetrap"
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

        // F11 toggles the Tauri native window fullscreen (not video browser fullscreen)
        mousetrap.bind("f11", (e) => {
            e.preventDefault()
            // Don't toggle app fullscreen if the video player has browser fullscreen
            if (!document.fullscreenElement) {
                toggleFullscreen()
            }
        })

        mousetrap.bind("esc", () => {
            // Only exit app fullscreen if there's no active browser fullscreen element
            if (document.fullscreenElement) return
            const appWindow = new Window("main")
            appWindow.isFullscreen().then((isFullscreen) => {
                if (isFullscreen) {
                    toggleFullscreen()
                }
            })
        })

        // NOTE: Do NOT listen to fullscreenchange here — that would conflict with the
        // video player's browser fullscreen and cause the app window to toggle too.

        return () => {
            u.then((f) => f())
            mousetrap.unbind("f11")
            mousetrap.unbind("esc")
        }
    }, [])

    async function toggleFullscreen() {
        const appWindow = new Window("main")

        // Only toggle fullscreen on the main window
        if (getCurrentWebviewWindow().label !== "main") return

        const fullscreen = await appWindow.isFullscreen()
        // DEVNOTE: When decorations are not shown in fullscreen move there will be a gap at the bottom of the window (Windows)
        // Hide the decorations when exiting fullscreen
        // Show the decorations when entering fullscreen
        await appWindow.setDecorations(!fullscreen)
        await appWindow.setFullscreen(!fullscreen)

        // Dispatch event so VideoCoreFullscreenManager can sync state
        window.dispatchEvent(new CustomEvent("tauri:fullscreenchange", { detail: { isFullscreen: !fullscreen } }))
    }

    return (
        <>

        </>
    )
}
