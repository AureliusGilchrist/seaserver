"use client"

import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { getConnectivity, setConnectivity, useConnectivity } from "@/lib/server/connectivity"
import { WSEvents } from "@/lib/server/ws-events"
import { useQueryClient } from "@tanstack/react-query"
import React from "react"
import { LuCloudOff, LuShieldOff } from "react-icons/lu"

/**
 * The one sign the app gives of being offline: everything else looks and works the same. It keeps
 * the rest of the app's idea of the connection up to date too, and refetches on the way back online.
 */
export function ConnectivityChip() {
    const serverStatus = useServerStatus()
    const queryClient = useQueryClient()
    const connectivity = useConnectivity()

    const update = React.useCallback((next: string | undefined) => {
        const wasOnline = getConnectivity() === "online"
        setConnectivity(next)
        if (!wasOnline && getConnectivity() === "online") void queryClient.invalidateQueries()
    }, [queryClient])

    React.useEffect(() => update(serverStatus?.connectivity), [serverStatus?.connectivity, update])

    useWebsocketMessageListener<string>({
        type: WSEvents.CONNECTIVITY_CHANGED,
        onMessage: update,
        deps: [update],
    })

    if (connectivity === "online") return null

    const blocked = connectivity === "blocked"
    return (
        <div
            data-connectivity-chip
            title={blocked
                ? "AniList is blocked in settings. Your changes stay pending until you turn this off."
                : "The server has no internet. Your library works as usual, and changes sync when it's back."}
            className="fixed right-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[170] flex items-center gap-1.5 rounded-full border border-white/10 bg-gray-950/85 px-2.5 py-1 text-xs font-medium text-white/75 shadow-lg backdrop-blur-md"
        >
            {blocked ? <LuShieldOff className="size-3.5" /> : <LuCloudOff className="size-3.5" />}
            {blocked ? "AniList blocked" : "Offline"}
        </div>
    )
}
