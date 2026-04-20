import { useServerQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { Milestone_ListResponse, Milestone_UnlockPayload } from "@/api/generated/types"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { WSEvents } from "@/lib/server/ws-events"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useState } from "react"

export function useGetMilestones() {
    return useServerQuery<Milestone_ListResponse>({
        endpoint: API_ENDPOINTS.MILESTONE.GetMilestones.endpoint,
        method: API_ENDPOINTS.MILESTONE.GetMilestones.methods[0],
        queryKey: [API_ENDPOINTS.MILESTONE.GetMilestones.key],
    })
}

export function useMilestoneUnlockListener() {
    const [pendingUnlocks, setPendingUnlocks] = useState<Milestone_UnlockPayload[]>([])
    const qc = useQueryClient()

    const onMessage = useCallback((data: Milestone_UnlockPayload) => {
        setPendingUnlocks(prev => [...prev, data])
        qc.invalidateQueries({ queryKey: [API_ENDPOINTS.MILESTONE.GetMilestones.key] })
    }, [qc])

    useWebsocketMessageListener<Milestone_UnlockPayload>({
        type: WSEvents.MILESTONE_ACHIEVED,
        onMessage,
    })

    const dismiss = useCallback(() => {
        setPendingUnlocks(prev => prev.slice(1))
    }, [])

    return {
        currentUnlock: pendingUnlocks[0] ?? null,
        dismiss,
        hasPending: pendingUnlocks.length > 0,
    }
}
