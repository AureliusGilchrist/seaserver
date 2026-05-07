import { __isDesktop__ } from "@/types/constants"
import { MediaEnterFullscreenRequestEvent, MediaFullscreenRequestTarget, MediaPlayerInstance } from "@vidstack/react"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { Window, Monitor } from "@tauri-apps/api/window"
import { platform } from "@tauri-apps/plugin-os"
import React from "react"

export function useFullscreenHandler(playerRef: React.RefObject<MediaPlayerInstance>) {

    React.useEffect(() => {
        let unlisten: any | null = null
        if ((window as any)?.__TAURI__) {
            const currentWindow: any | undefined = (window as any)?.__TAURI__?.window?.getCurrentWindow?.()
            if (currentWindow) {
                (async () => {
                    unlisten = await currentWindow.listen("macos-activation-policy-accessory-done", () => {
                        console.log("macos policy accessory event done")
                        try {
                            console.log("requesting fullscreen")
                            playerRef.current?.enterFullscreen()
                        }
                        catch (e) {
                            console.log("failed to enter fullscreen from 'macos-activation-policy-accessory-done'", e)
                        }
                    })
                })()
            }
        }
        return () => {
            unlisten?.()
        }
    }, [])

    // Add CSS overrides when fullscreen to remove any padding/margin/border issues
    React.useEffect(() => {
        const handleFullscreenChange = () => {
            const isFullscreen = document.fullscreenElement !== null
            if (isFullscreen) {
                // Store original styles and apply fullscreen CSS
                document.documentElement.style.padding = "0"
                document.documentElement.style.margin = "0"
                document.documentElement.style.border = "0"
                document.body.style.padding = "0"
                document.body.style.margin = "0"
                document.body.style.border = "0"
                document.body.style.width = "100%"
                document.body.style.height = "100%"
                document.body.style.minHeight = "100%"
                document.body.style.overflow = "hidden"
                
                // Find and fix media player container
                const playerContainer = document.querySelector("[data-sea-media-player-container]")
                if (playerContainer) {
                    (playerContainer as HTMLElement).style.width = "100%"
                    (playerContainer as HTMLElement).style.height = "100%"
                    (playerContainer as HTMLElement).style.margin = "0"
                    (playerContainer as HTMLElement).style.padding = "0"
                    (playerContainer as HTMLElement).style.border = "0"
                }
            } else {
                // Restore
                document.documentElement.style.padding = ""
                document.documentElement.style.margin = ""
                document.documentElement.style.border = ""
                document.body.style.padding = ""
                document.body.style.margin = ""
                document.body.style.border = ""
                document.body.style.width = ""
                document.body.style.height = ""
                document.body.style.minHeight = ""
                document.body.style.overflow = ""

                const playerContainer = document.querySelector("[data-sea-media-player-container]")
                if (playerContainer) {
                    (playerContainer as HTMLElement).style.width = ""
                    (playerContainer as HTMLElement).style.height = ""
                    (playerContainer as HTMLElement).style.margin = ""
                    (playerContainer as HTMLElement).style.padding = ""
                    (playerContainer as HTMLElement).style.border = ""
                }
            }
        }

        document.addEventListener("fullscreenchange", handleFullscreenChange)
        return () => document.removeEventListener("fullscreenchange", handleFullscreenChange)
    }, [])

    function onMediaEnterFullscreenRequest(detail: MediaFullscreenRequestTarget, nativeEvent: MediaEnterFullscreenRequestEvent) {
        if (__isDesktop__) {
            try {
                if ((window as any)?.__TAURI__) {
                    const currentPlatform = platform()
                    if (currentPlatform === "macos") {
                        const currentWindow: any | undefined = (window as any)?.__TAURI__?.window?.getCurrentWindow?.()
                        nativeEvent.preventDefault()
                        console.log("native fullscreen event prevented, sending macos policy accessory event")
                        currentWindow.emit("macos-activation-policy-accessory").then(() => {
                            console.log("macos policy accessory event sent")
                        })
                    } else {
                        // For Windows/Linux: expand the OS window to cover the entire screen
                        // Get the primary monitor and maximize the window to those dimensions
                        const appWindow = new Window("main")
                        if (getCurrentWebviewWindow().label === "main") {
                            (async () => {
                                try {
                                    // Get the monitor of the window
                                    const monitor = await appWindow.currentMonitor()
                                    if (monitor) {
                                        // Set window to cover the entire monitor (including taskbar area)
                                        await appWindow.setSize({
                                            width: Math.round(monitor.size.width * monitor.scaleFactor),
                                            height: Math.round(monitor.size.height * monitor.scaleFactor),
                                        })
                                        await appWindow.setPosition({
                                            x: Math.round(monitor.position.x),
                                            y: Math.round(monitor.position.y),
                                        })
                                    }
                                    await appWindow.setDecorations(false)
                                    await appWindow.setFullscreen(true)
                                    await appWindow.setAlwaysOnTop(true)
                                } catch (e) {
                                    console.error("failed to set fullscreen:", e)
                                    // Fallback to the original method
                                    try {
                                        await appWindow.setDecorations(false)
                                        await appWindow.setFullscreen(true)
                                        await appWindow.setAlwaysOnTop(true)
                                    } catch {}
                                }
                            })()
                        }
                    }
                }
            }
            catch (e) {
                console.error("error in onMediaEnterFullscreenRequest:", e)
            }
        }
    }

    /**
     * Call this from the player's onFullscreenChange handler.
     * On non-macOS Tauri builds it syncs the OS window fullscreen state so the
     * window shrinks back correctly when the user exits player fullscreen.
     */
    function onTauriFullscreenChange(isFullscreen: boolean) {
        if (!__isDesktop__) return
        try {
            if ((window as any)?.__TAURI__) {
                const currentPlatform = platform()
                if (currentPlatform !== "macos") {
                    const appWindow = new Window("main")
                    if (getCurrentWebviewWindow().label === "main") {
                        if (isFullscreen) {
                            (async () => {
                                try {
                                    // Get the monitor of the window
                                    const monitor = await appWindow.currentMonitor()
                                    if (monitor) {
                                        // Set window to cover the entire monitor
                                        await appWindow.setSize({
                                            width: Math.round(monitor.size.width * monitor.scaleFactor),
                                            height: Math.round(monitor.size.height * monitor.scaleFactor),
                                        })
                                        await appWindow.setPosition({
                                            x: Math.round(monitor.position.x),
                                            y: Math.round(monitor.position.y),
                                        })
                                    }
                                    await appWindow.setDecorations(false)
                                    await appWindow.setFullscreen(true)
                                    await appWindow.setAlwaysOnTop(true)
                                } catch (e) {
                                    console.error("failed to set fullscreen:", e)
                                    // Fallback
                                    try {
                                        await appWindow.setDecorations(false)
                                        await appWindow.setFullscreen(true)
                                        await appWindow.setAlwaysOnTop(true)
                                    } catch {}
                                }
                            })()
                        } else {
                            appWindow.setAlwaysOnTop(false)
                                .then(() => appWindow.setFullscreen(false))
                                .then(() => appWindow.setDecorations(true))
                                .catch((e) => console.error("failed to exit fullscreen:", e))
                        }
                    }
                }
            }
        }
        catch (e) {
            console.error("error in onTauriFullscreenChange:", e)
        }
    }

    return {
        onMediaEnterFullscreenRequest,
        onTauriFullscreenChange,
    }
}
