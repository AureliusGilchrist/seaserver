import { __isDesktop__ } from "@/types/constants"
import { MediaEnterFullscreenRequestEvent, MediaFullscreenRequestTarget, MediaPlayerInstance } from "@vidstack/react"
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
                    const platform: string | undefined = (window as any)?.__TAURI__?.os?.platform?.()
                    const currentWindow: any | undefined = (window as any)?.__TAURI__?.window?.getCurrentWindow?.()
                    if (!!platform && platform === "macos") {
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
                    } else if (!!platform && currentWindow) {
                        // For Windows/Linux: expand the OS window to cover the taskbar before
                        // the browser element fullscreen request fires, so the video fills
                        // the entire screen rather than just the maximised window client area.
                        currentWindow.setFullscreen?.(true)
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
                const platform: string | undefined = (window as any)?.__TAURI__?.os?.platform?.()
                const currentWindow: any | undefined = (window as any)?.__TAURI__?.window?.getCurrentWindow?.()
                if (!!platform && platform !== "macos" && currentWindow) {
                    currentWindow.setFullscreen?.(isFullscreen)
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
