"use client"

import { listen } from "@tauri-apps/api/event"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { Window } from "@tauri-apps/api/window"
import { vc_fullscreenManager } from "@/app/(main)/_features/video-core/video-core-fullscreen"
import { getDefaultStore } from "jotai"
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
        //
        // For video player DOM fullscreen on Windows: WebView2 determines the fullscreen rect
        // at the moment requestFullscreen() is called, using the window's current client area.
        // If the window doesn't cover the taskbar, WebView2 leaves a taskbar-sized gap.
        //
        // Fix: monkey-patch HTMLElement.prototype.requestFullscreen so that for non-root
        // elements, we first expand the Tauri window to native fullscreen and wait for WebView2
        // to emit a resize event (confirming its viewport updated) before calling the real
        // requestFullscreen(). This way the DOM fullscreen rect covers the full display.
        //
        // When the player exits DOM fullscreen, we restore the window if we were the ones
        // who expanded it (tracked via windowFullscreenSetByPlayer).
        let windowFullscreenSetByPlayer = false
        let originalRequestFullscreen: typeof HTMLElement.prototype.requestFullscreen | null = null

        const setupFullscreenPatch = async () => {
            try {
                const { platform } = await import("@tauri-apps/plugin-os")
                if (platform() === "macos") return // macOS uses a different fullscreen path

                originalRequestFullscreen = HTMLElement.prototype.requestFullscreen
                HTMLElement.prototype.requestFullscreen = async function(options?: FullscreenOptions) {
                    if (this === document.documentElement) {
                        // documentElement fullscreen (WebView2 F11) is handled by handleFullscreenChange
                        return originalRequestFullscreen!.call(this, options)
                    }
                    try {
                        const { Window: TauriWindow } = await import("@tauri-apps/api/window")
                        const appWindow = new TauriWindow("main")
                        const isWinFs = await appWindow.isFullscreen().catch(() => false)
                        if (!isWinFs) {
                            // Order matters on Windows:
                            // 1. setAlwaysOnTop(true) BEFORE setFullscreen so the maximized
                            //    rectangle covers the taskbar area instead of just the work area.
                            // 2. setDecorations(false) to remove title bar.
                            // 3. setFullscreen(true) for the actual fullscreen state.
                            await appWindow.setAlwaysOnTop(true)
                            await appWindow.setDecorations(false)
                            await appWindow.setFullscreen(true)

                            // Poll until WebView2's viewport actually matches the screen size.
                            // The 'resize' event is unreliable: it fires when title bar is removed
                            // (work-area size) before the window grows past the taskbar.
                            const targetH = window.screen.height
                            const targetW = window.screen.width
                            const start = performance.now()
                            while (performance.now() - start < 1500) {
                                if (window.innerHeight >= targetH - 2 && window.innerWidth >= targetW - 2) break
                                await new Promise(r => requestAnimationFrame(() => r(null)))
                            }
                            // Extra frame to ensure WebView2 has painted at the new size
                            await new Promise(r => requestAnimationFrame(() => r(null)))

                            window.dispatchEvent(new CustomEvent("tauri:player-fullscreen-enter"))
                            windowFullscreenSetByPlayer = true
                        }
                    } catch (e) {
                        console.error("tauri-manager: failed to expand window before fullscreen", e)
                    }
                    return originalRequestFullscreen!.call(this, options)
                }
            } catch (e) {
                console.error("tauri-manager: failed to set up fullscreen patch", e)
            }
        }
        setupFullscreenPatch()

        const handleFullscreenChange = async () => {
            const appWindow = new Window("main")
            if (!document.fullscreenElement) {
                // DOM fullscreen exited — restore Tauri window only if the player expanded it
                if (windowFullscreenSetByPlayer) {
                    windowFullscreenSetByPlayer = false
                    const isWinFs = await appWindow.isFullscreen().catch(() => false)
                    if (isWinFs) {
                        await appWindow.setAlwaysOnTop(false).catch(() => {})
                        await appWindow.setFullscreen(false).catch(() => {})
                        await appWindow.setDecorations(true).catch(() => {})
                        window.dispatchEvent(new CustomEvent("tauri:fullscreenchange", { detail: { isFullscreen: false } }))
                    }
                }
                return
            }
            if (document.fullscreenElement === document.documentElement) {
                // WebView2 F11 — swap for Tauri native fullscreen
                await document.exitFullscreen().catch(() => {})
                await toggleFullscreen()
            }
            // Video player entered DOM fullscreen — window was already expanded by the patch above.
        }

        // Get video fullscreen manager from jotai store
        const getVideoFullscreenManager = () => {
            return getDefaultStore().get(vc_fullscreenManager)
        }

        // Keydown handler: F11 coordinates between window fullscreen and video fullscreen.
        // - If window is NOT fullscreen: toggle window fullscreen
        // - If window IS fullscreen and video is NOT fullscreen: toggle video fullscreen (illusion)
        // - If window IS fullscreen and video IS fullscreen: exit video fullscreen (window stays fullscreen)
        // Escape exits Tauri fullscreen only when video is NOT in DOM fullscreen
        const handleKeydown = async (e: KeyboardEvent) => {
            if (e.key === "F11") {
                e.preventDefault()
                e.stopPropagation()

                const appWindow = new Window("main")
                const isWindowFullscreen = await appWindow.isFullscreen()
                const videoManager = getVideoFullscreenManager()
                const isVideoFullscreen = !!document.fullscreenElement && document.fullscreenElement !== document.documentElement

                if (!isWindowFullscreen) {
                    // Window not fullscreen yet — toggle window fullscreen
                    await toggleFullscreen()
                } else if (videoManager && !isVideoFullscreen) {
                    // Window is fullscreen, video exists but not fullscreen — fullscreen the video
                    await videoManager.enterFullscreen()
                } else if (videoManager && isVideoFullscreen) {
                    // Window is fullscreen, video is fullscreen — exit video fullscreen (keep window fullscreen)
                    await videoManager.exitFullscreen()
                } else {
                    // Window is fullscreen, no video — exit window fullscreen
                    await toggleFullscreen()
                }
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
            if (originalRequestFullscreen) {
                HTMLElement.prototype.requestFullscreen = originalRequestFullscreen
            }
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
