import { useServerQuery, buildSeaQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import {
    Achievement_Entry,
    Achievement_ListResponse,
    Achievement_SummaryResponse,
    Models_AchievementShowcase,
} from "@/api/generated/types"
import { profileSessionTokenAtom, serverAuthTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { WSEvents } from "@/lib/server/ws-events"
import { useQueryClient, useMutation } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { useCallback, useEffect, useState } from "react"

// ─────────────────────────────────────────────────────────────────
// Non-retrospective achievement cache (localStorage)
// Once an achievement is unlocked it stays unlocked in the local cache.
// ─────────────────────────────────────────────────────────────────

const ACHIEVEMENT_CACHE_KEY = "seanime-unlocked-achievements-v1"

function loadAchievementCache(): Set<string> {
    try {
        const raw = localStorage.getItem(ACHIEVEMENT_CACHE_KEY)
        if (!raw) return new Set()
        const arr = JSON.parse(raw) as string[]
        return new Set(Array.isArray(arr) ? arr : [])
    } catch {
        return new Set()
    }
}

function saveAchievementCache(set: Set<string>) {
    try {
        localStorage.setItem(ACHIEVEMENT_CACHE_KEY, JSON.stringify([...set]))
    } catch { /* ignore storage errors */ }
}

/**
 * Merges server achievement data with the local cache.
 * Once an entry is marked unlocked in the cache, it stays unlocked.
 * New unlocks from server are added to the cache.
 */
export function useGetAchievements() {
    const query = useServerQuery<Achievement_ListResponse>({
        endpoint: API_ENDPOINTS.ACHIEVEMENT.GetAchievements.endpoint,
        method: API_ENDPOINTS.ACHIEVEMENT.GetAchievements.methods[0],
        queryKey: [API_ENDPOINTS.ACHIEVEMENT.GetAchievements.key],
    })

    const [cachedUnlocked, setCachedUnlocked] = useState<Set<string>>(loadAchievementCache)

    useEffect(() => {
        if (!query.data?.achievements) return
        const currentCache = loadAchievementCache()
        let changed = false
        for (const a of query.data.achievements) {
            if (a.isUnlocked) {
                const k = `${a.key}:${a.tier}`
                if (!currentCache.has(k)) {
                    currentCache.add(k)
                    changed = true
                }
            }
        }
        if (changed) {
            saveAchievementCache(currentCache)
            setCachedUnlocked(new Set(currentCache))
        }
    }, [query.data])

    if (!query.data) return query

    // Merge: if cache says unlocked, honour it regardless of server value
    const mergedAchievements: Achievement_Entry[] = (query.data.achievements ?? []).map(a => {
        const k = `${a.key}:${a.tier}`
        if (!a.isUnlocked && cachedUnlocked.has(k)) {
            return { ...a, isUnlocked: true }
        }
        return a
    })

    const unlockedCount = mergedAchievements.filter(a => a.isUnlocked).length

    return {
        ...query,
        data: {
            ...query.data,
            achievements: mergedAchievements,
            summary: {
                ...query.data.summary,
                unlockedCount,
                totalCount: query.data.summary?.totalCount ?? mergedAchievements.length,
            },
        },
    }
}

export function useGetUserAchievements(id: number) {
    return useServerQuery<Achievement_ListResponse>({
        endpoint: `/api/v1/achievements/user/${id}`,
        method: "GET",
        queryKey: ["USER-achievements", id],
        enabled: id > 0,
    })
}

export function useGetAchievementSummary() {
    return useServerQuery<Achievement_SummaryResponse>({
        endpoint: API_ENDPOINTS.ACHIEVEMENT.GetAchievementSummary.endpoint,
        method: API_ENDPOINTS.ACHIEVEMENT.GetAchievementSummary.methods[0],
        queryKey: [API_ENDPOINTS.ACHIEVEMENT.GetAchievementSummary.key],
    })
}

export function useGetAchievementShowcase() {
    return useServerQuery<Models_AchievementShowcase[]>({
        endpoint: API_ENDPOINTS.ACHIEVEMENT.GetAchievementShowcase.endpoint,
        method: API_ENDPOINTS.ACHIEVEMENT.GetAchievementShowcase.methods[0],
        queryKey: [API_ENDPOINTS.ACHIEVEMENT.GetAchievementShowcase.key],
    })
}

export function useSetAchievementShowcase() {
    const qc = useQueryClient()
    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)

    return useMutation({
        mutationKey: [API_ENDPOINTS.ACHIEVEMENT.SetAchievementShowcase.key],
        mutationFn: async (variables: {
            slots: Array<{
                slot: number
                achievementKey: string
                achievementTier: number
            }>
        }) => {
            return buildSeaQuery<boolean>({
                endpoint: API_ENDPOINTS.ACHIEVEMENT.SetAchievementShowcase.endpoint,
                method: "POST",
                data: variables,
                password: password,
                profileToken: profileToken,
            })
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ACHIEVEMENT.GetAchievementShowcase.key] })
        },
    })
}

export type AchievementUnlockPayload = {
    key: string
    name: string
    description: string
    tier: number
    tierName: string
    category: string
    iconSVG: string
}

export function useImportAchievements() {
    const qc = useQueryClient()
    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)

    return useMutation({
        mutationKey: ["import-achievements"],
        mutationFn: async () => {
            return buildSeaQuery<AchievementUnlockPayload[]>({
                endpoint: "/api/v1/achievements/import",
                method: "POST",
                data: {},
                password: password,
                profileToken: profileToken,
            })
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ACHIEVEMENT.GetAchievements.key] })
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ACHIEVEMENT.GetAchievementSummary.key] })
        },
    })
}

export function useAchievementUnlockListener() {
    const [pendingUnlocks, setPendingUnlocks] = useState<AchievementUnlockPayload[]>([])
    const qc = useQueryClient()

    const onMessage = useCallback((data: AchievementUnlockPayload) => {
        // Persist to local cache immediately so it's never lost
        const cache = loadAchievementCache()
        cache.add(`${data.key}:0`)
        // Also add tier variants just in case
        for (let t = 1; t <= 5; t++) cache.add(`${data.key}:${t}`)
        saveAchievementCache(cache)

        setPendingUnlocks(prev => [...prev, data])
        qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ACHIEVEMENT.GetAchievements.key] })
        qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ACHIEVEMENT.GetAchievementSummary.key] })
    }, [qc])

    useWebsocketMessageListener<AchievementUnlockPayload>({
        type: WSEvents.ACHIEVEMENT_UNLOCKED,
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
