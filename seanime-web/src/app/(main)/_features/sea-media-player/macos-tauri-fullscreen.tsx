import { __isDesktop__ } from "@/types/constants"
import { MediaEnterFullscreenRequestEvent, MediaFullscreenRequestTarget, MediaPlayerInstance } from "@vidstack/react"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { Window } from "@tauri-apps/api/window"
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
                        // For Windows/Linux: expand the OS window to cover the taskbar.
                        // setFullscreen alone leaves a taskbar gap; setAlwaysOnTop is required
                        // to render the window over the taskbar (same as toggleFullscreen in tauri-manager).
                        const appWindow = new Window("main")
                        if (getCurrentWebviewWindow().label === "main") {
                            appWindow.setDecorations(false)
                                .then(() => appWindow.setFullscreen(true))
                                .then(() => appWindow.setAlwaysOnTop(true))
                                .catch(() => {})
                        }
                    }
                }
            }
            catch {

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
                            appWindow.setDecorations(false)
                                .then(() => appWindow.setFullscreen(true))
                                .then(() => appWindow.setAlwaysOnTop(true))
                                .catch(() => {})
                        } else {
                            appWindow.setAlwaysOnTop(false)
                                .then(() => appWindow.setFullscreen(false))
                                .then(() => appWindow.setDecorations(true))
                                .catch(() => {})
                        }
                    }
                }
            }
        }
        catch {
        }
    }

    return {
        onMediaEnterFullscreenRequest,
        onTauriFullscreenChange,
    }
}
