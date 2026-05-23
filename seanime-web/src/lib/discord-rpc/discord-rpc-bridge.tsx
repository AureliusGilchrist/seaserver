"use client"

import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { __isElectronDesktop__ } from "@/types/constants"
import { WSEvents } from "@/lib/server/ws-events"
import * as React from "react"

/**
 * DiscordRpcBridge
 *
 * Subscribes to Discord rich-presence updates broadcast by the server over the
 * WebSocket and applies them to the LOCAL Discord client running on the same
 * machine as Electron via the preload-exposed `window.electron.discord` API.
 *
 * This allows Discord Rich Presence to work even when the seanime server is
 * running on a different machine (e.g. a headless home server) than the
 * Electron desktop app (and Discord).
 *
 * Renders nothing. Safe to mount unconditionally; the bridge is a no-op when
 * `window.electron.discord` is unavailable (e.g. browser or older Electron).
 */
export type DiscordActivityPayload = {
    applicationId: string
    name?: string
    details?: string
    detailsUrl?: string
    state?: string
    largeImage?: string
    largeText?: string
    largeUrl?: string
    smallImage?: string
    smallText?: string
    smallUrl?: string
    startTimestamp?: number
    endTimestamp?: number
    buttons?: Array<{ label: string; url: string }>
    instance?: boolean
    type?: number
}

export function DiscordRpcBridge() {
    useWebsocketMessageListener<DiscordActivityPayload | null>({
        type: WSEvents.DISCORD_ACTIVITY_UPDATE,
        onMessage: (payload) => {
            console.log("[DiscordRpcBridge] activity-update", payload)
            if (!payload) return
            const api = typeof window !== "undefined" ? window.electron?.discord : undefined
            if (!api) {
                console.warn("[DiscordRpcBridge] window.electron.discord is unavailable; rich presence will not be applied")
                return
            }
            api.setActivity(payload).then(ok => {
                console.log("[DiscordRpcBridge] setActivity result", ok)
            }).catch(err => {
                console.warn("[DiscordRpcBridge] setActivity threw", err)
            })
        },
    })

    useWebsocketMessageListener<unknown>({
        type: WSEvents.DISCORD_ACTIVITY_CLEAR,
        onMessage: () => {
            console.log("[DiscordRpcBridge] activity-clear")
            const api = typeof window !== "undefined" ? window.electron?.discord : undefined
            if (!api) return
            api.clearActivity().catch(err => {
                console.warn("[DiscordRpcBridge] clearActivity threw", err)
            })
        },
    })

    // Only meaningful inside Electron desktop, but harmless elsewhere.
    React.useEffect(() => {
        if (!__isElectronDesktop__) return
    }, [])

    return null
}
