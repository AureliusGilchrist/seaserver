import { __isDesktop__ } from "@/types/constants"
import { MediaEnterFullscreenRequestEvent, MediaFullscreenRequestTarget, MediaPlayerInstance } from "@vidstack/react"
import React from "react"

// Flag to skip the expand-window-first logic when we re-trigger fullscreen internally
let _windowReadyForFullscreen = false

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

    function onMediaEnterFullscreenRequest(detail: MediaFullscreenRequestTarget, nativeEvent: MediaEnterFullscreenRequestEvent) {
        if (__isDesktop__) {
            try {
                if ((window as any)?.__TAURI__) {
                    const currentWindow: any | undefined = (window as any)?.__TAURI__?.window?.getCurrentWindow?.()

                    // Determine platform using Tauri v2 plugin-os (sync)
                    let currentPlatform: string | undefined
                    try {
                        const { platform } = require("@tauri-apps/plugin-os")
                        currentPlatform = platform()
                    } catch {
                        // Fallback to legacy v1 API if available
                        currentPlatform = (window as any)?.__TAURI__?.os?.platform?.()
                    }

                    if (currentPlatform === "macos") {
                        nativeEvent.preventDefault()
                        console.log("native fullscreen event prevented, sending macos policy accessory event")
                        currentWindow.emit("macos-activation-policy-accessory").then(() => {
                            console.log("macos policy accessory event sent")
                            if (nativeEvent.defaultPrevented) {
                                try {
                                    // playerRef.current?.enterFullscreen()
                                }
                                catch (e) {
                                    console.log("failed to enter fullscreen from onMediaEnterFullscreenRequest", e)
                                }
                            }
                        })
                    } else if (!_windowReadyForFullscreen) {
                        // Windows / Linux: WebView2 DOM fullscreen is bounded by the current window size.
                        // Prevent default, expand the Tauri window to full screen first,
                        // then re-trigger so requestFullscreen() covers the full display.
                        nativeEvent.preventDefault()
                        ;(async () => {
                            try {
                                const { Window } = await import("@tauri-apps/api/window")
                                const appWindow = new Window("main")
                                const isWinFs = await appWindow.isFullscreen()
                                if (!isWinFs) {
                                    await appWindow.setDecorations(false)
                                    await appWindow.setFullscreen(true)
                                    await appWindow.setAlwaysOnTop(true)
                                    // Signal tauri-manager to restore window when DOM fullscreen exits
                                    window.dispatchEvent(new CustomEvent("tauri:player-fullscreen-enter"))
                                    // Brief pause for WebView2 to update its viewport bounds
                                    await new Promise(r => setTimeout(r, 50))
                                }
                            } catch (e) {
                                console.log("failed to expand Tauri window before fullscreen", e)
                            }
                            // Re-trigger fullscreen; _windowReadyForFullscreen prevents recursion
                            _windowReadyForFullscreen = true
                            try {
                                playerRef.current?.enterFullscreen()
                            } catch (e) {
                                console.log("failed to re-enter fullscreen", e)
                            }
                            _windowReadyForFullscreen = false
                        })()
                    }
                }
            }
            catch {

            }
        }
    }

    return {
        onMediaEnterFullscreenRequest,
    }
}
