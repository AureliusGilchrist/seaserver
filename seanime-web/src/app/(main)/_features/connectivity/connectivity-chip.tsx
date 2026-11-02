"use client"

import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { getConnectivity, setConnectivity, setOfflineForced } from "@/lib/server/connectivity"
import { WSEvents } from "@/lib/server/ws-events"
import { useQueryClient } from "@tanstack/react-query"
import React from "react"

/** Keeps the app's idea of the connection up to date, and refetches on the way back online. */
export function ConnectivityListener() {
    const serverStatus = useServerStatus()
    const queryClient = useQueryClient()

    const update = React.useCallback((next: string | undefined) => {
        const wasOnline = getConnectivity() === "online"
        setConnectivity(next)
        if (!wasOnline && getConnectivity() === "online") void queryClient.invalidateQueries()
    }, [queryClient])

    React.useEffect(() => update(serverStatus?.connectivity), [serverStatus?.connectivity, update])
    React.useEffect(() => setOfflineForced(!!serverStatus?.offlineForced), [serverStatus?.offlineForced])

    useWebsocketMessageListener<string>({
        type: WSEvents.CONNECTIVITY_CHANGED,
        onMessage: next => {
            update(next)
            // The event carries the state only; whether it was switched on by hand comes with the status.
            void queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.STATUS.GetStatus.key] })
        },
        deps: [update],
    })

    return null
}
