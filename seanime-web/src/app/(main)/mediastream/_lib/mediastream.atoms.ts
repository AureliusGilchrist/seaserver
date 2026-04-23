import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { __isTauriDesktop__ } from "@/types/constants"
import { useAtom } from "jotai/react"
import { atomWithStorage, createJSONStorage } from "jotai/utils"
import React from "react"

// Per-tab session storage adapter — isolates state between browser tabs
const sessionStorageAdapter = createJSONStorage<any>(() => sessionStorage)

const __mediastream_filePath = atomWithStorage<string | undefined>("sea-mediastream-filepath", undefined, sessionStorageAdapter, { getOnInit: true })

export function useMediastreamCurrentFile() {
    const [filePath, setFilePath] = useAtom(__mediastream_filePath)

    return {
        filePath,
        setFilePath,
    }
}

/**
 * Returns a stable, per-tab mediastream session ID.
 * Used as the clientId for all mediastream API calls, ensuring multi-tab/multi-profile isolation.
 */
export function getMediastreamSessionId(): string {
    let id = sessionStorage.getItem("sea-mediastream-session-id")
    if (!id) {
        id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`
        sessionStorage.setItem("sea-mediastream-session-id", id)
    }
    return id
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const __mediastream_jassubOffscreenRender = atomWithStorage<boolean>("sea-mediastream-jassub-offscreen-render", false, undefined, { getOnInit: true })

export function useMediastreamJassubOffscreenRender() {
    const [jassubOffscreenRender, setJassubOffscreenRender] = useAtom(__mediastream_jassubOffscreenRender)

    return {
        jassubOffscreenRender,
        setJassubOffscreenRender,
    }
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Whether media streaming should be done on this device
 */
const __mediastream_activeOnDevice = atomWithStorage<boolean | null>("sea-mediastream-active-on-device", null, undefined, { getOnInit: true })

export function useMediastreamActiveOnDevice() {
    const serverStatus = useServerStatus()
    const [activeOnDevice, setActiveOnDevice] = useAtom(__mediastream_activeOnDevice)

    // Set default behavior
    React.useLayoutEffect(() => {
        if (!!serverStatus) {

            if (activeOnDevice === null) {

                if (serverStatus?.clientDevice !== "desktop") {
                    setActiveOnDevice(true) // Always active on mobile devices
                } else if (__isTauriDesktop__) {
                    setActiveOnDevice(true) // Active by default on Tauri desktop
                } else {
                    setActiveOnDevice(false) // Always inactive on non-Tauri desktop devices
                }

            }
        }
    }, [serverStatus?.clientUserAgent, activeOnDevice])

    return {
        activeOnDevice,
        setActiveOnDevice,
    }
}
