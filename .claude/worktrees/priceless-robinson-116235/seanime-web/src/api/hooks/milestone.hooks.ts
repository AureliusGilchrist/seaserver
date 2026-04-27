import { useServerQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { Milestone_AchievedMilestone, Milestone_ListResponse, Milestone_UnlockPayload } from "@/api/generated/types"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { WSEvents } from "@/lib/server/ws-events"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useState } from "react"

// ─────────────────────────────────────────────────────────────────
// Non-retrospective milestone cache (localStorage)
// ─────────────────────────────────────────────────────────────────

const MILESTONE_CACHE_KEY = "seanime-unlocked-milestones-v1"

function loadMilestoneCache(): Set<string> {
    try {
        const raw = localStorage.getItem(MILESTONE_CACHE_KEY)
        if (!raw) return new Set()
        const arr = JSON.parse(raw) as string[]
        return new Set(Array.isArray(arr) ? arr : [])
    } catch {
        return new Set()
    }
}

function saveMilestoneCache(set: Set<string>) {
    try {
        localStorage.setItem(MILESTONE_CACHE_KEY, JSON.stringify([...set]))
    } catch { /* ignore */ }
}

export function useGetMilestones() {
    const query = useServerQuery<Milestone_ListResponse>({
        endpoint: API_ENDPOINTS.MILESTONE.GetMilestones.endpoint,
        method: API_ENDPOINTS.MILESTONE.GetMilestones.methods[0],
        queryKey: [API_ENDPOINTS.MILESTONE.GetMilestones.key],
    })

    const [cachedKeys, setCachedKeys] = useState<Set<string>>(loadMilestoneCache)

    useEffect(() => {
        if (!query.data?.achieved) return
        const currentCache = loadMilestoneCache()
        let changed = false
        for (const a of query.data.achieved) {
            const k = `${a.key}:${a.profileId}`
            if (!currentCache.has(k)) {
                currentCache.add(k)
                changed = true
            }
        }
        if (changed) {
            saveMilestoneCache(currentCache)
            setCachedKeys(new Set(currentCache))
        }
    }, [query.data])

    if (!query.data) return query

    // Build synthetic achieved entries from cache for any missing ones
    const serverKeys = new Set(query.data.achieved.map(a => `${a.key}:${a.profileId}`))
    const extraFromCache: Milestone_AchievedMilestone[] = []
    for (const k of cachedKeys) {
        if (!serverKeys.has(k)) {
            const [key] = k.split(":")
            extraFromCache.push({
                key,
                category: "",
                tier: 0,
                isFirstToAchieve: false,
                profileId: 0,
                profileName: "",
            })
        }
    }

    return {
        ...query,
        data: {
            ...query.data,
            achieved: [...query.data.achieved, ...extraFromCache],
        },
    }
}

export function useMilestoneUnlockListener() {
    const [pendingUnlocks, setPendingUnlocks] = useState<Milestone_UnlockPayload[]>([])
    const qc = useQueryClient()

    const onMessage = useCallback((data: Milestone_UnlockPayload) => {
        // Persist to local cache immediately
        const cache = loadMilestoneCache()
        cache.add(`${data.key}:0`)
        saveMilestoneCache(cache)

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
