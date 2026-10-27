import { useServerQuery, buildSeaQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import {
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

// This device used to keep its own list of unlocked achievements and show anything on it as
// unlocked, whatever the server said. The list was one per device, not per profile, so every
// profile on a computer showed every other profile's unlocks, and nothing the server revoked or
// reset ever looked locked again. The server keeps unlocks that legitimately lapse on its own, so
// its answer is the one shown; the old list is removed.
const LEGACY_ACHIEVEMENT_CACHE_KEY = "seanime-unlocked-achievements-v1"

try {
    if (typeof window !== "undefined") window.localStorage.removeItem(LEGACY_ACHIEVEMENT_CACHE_KEY)
}
catch {
    // No storage access: nothing was stored either.
}

export function useGetAchievements() {
    return useServerQuery<Achievement_ListResponse>({
        endpoint: API_ENDPOINTS.ACHIEVEMENT.GetAchievements.endpoint,
        method: API_ENDPOINTS.ACHIEVEMENT.GetAchievements.methods[0],
        queryKey: [API_ENDPOINTS.ACHIEVEMENT.GetAchievements.key],
    })
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
    xpAwarded?: number
}

/**
 * Everything one evaluation pass unlocked, announced in a single message.
 *
 * Mirrors achievement.BatchUnlockPayload. One event routinely unlocks several achievements at once —
 * a collection refresh crossing thresholds, and the meta achievements each unlock re-evaluates — and
 * sending them one at a time made a single award read as a stream of popups.
 */
export type AchievementBatchUnlockPayload = {
    achievements: AchievementUnlockPayload[]
    totalXp?: number
    newLevel?: number
    leveledUp?: boolean
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

export function useResetAchievements() {
    const qc = useQueryClient()
    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)

    return useMutation({
        mutationKey: [API_ENDPOINTS.ACHIEVEMENT.ResetAchievements.key],
        mutationFn: async () => {
            return buildSeaQuery<boolean>({
                endpoint: API_ENDPOINTS.ACHIEVEMENT.ResetAchievements.endpoint,
                method: "POST",
                data: {},
                password: password,
                profileToken: profileToken,
            })
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ACHIEVEMENT.GetAchievements.key] })
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ACHIEVEMENT.GetAchievementSummary.key] })
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ACHIEVEMENT.GetAchievementShowcase.key] })
        },
    })
}

export function useAchievementUnlockListener() {
    const [pendingUnlocks, setPendingUnlocks] = useState<AchievementUnlockPayload[]>([])
    const qc = useQueryClient()

    const onMessage = useCallback((data: AchievementUnlockPayload) => {
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

// ─────────────────────────────────────────────────────────────────
// Active-engagement heartbeat
// Fires a server-authoritative "I'm actively watching/reading right now"
// ping. The server measures wall-clock between heartbeats (clamped to
// 90s, reset after 1h of inactivity) and uses that for the continuous-
// session hour achievements. Client-reported durations are NEVER trusted.
// ─────────────────────────────────────────────────────────────────

export type AchievementActivityKind = "anime" | "manga"

export function useAchievementHeartbeat() {
    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)

    return useCallback(async (kind: AchievementActivityKind) => {
        try {
            await buildSeaQuery<boolean>({
                endpoint: API_ENDPOINTS.ACHIEVEMENT.AchievementHeartbeat.endpoint,
                method: API_ENDPOINTS.ACHIEVEMENT.AchievementHeartbeat.methods[0],
                data: { kind },
                password: password,
                profileToken: profileToken,
            })
        } catch {
            // best-effort; never disrupt UX over a heartbeat failure
        }
    }, [password, profileToken])
}

/**
 * Drives a 30-second heartbeat while `isActive` is true. The caller
 * should pass a stable predicate that reflects ACTUAL engagement
 * (e.g. video playing AND tab visible, or recent reader interaction).
 *
 * Server treats >1h between heartbeats as session reset, so a missed
 * tick or two is harmless.
 */
export function useAchievementActivityHeartbeat(
    kind: AchievementActivityKind,
    isActive: () => boolean,
    intervalMs: number = 30_000,
) {
    const heartbeat = useAchievementHeartbeat()
    useEffect(() => {
        const tick = () => {
            try {
                if (isActive()) void heartbeat(kind)
            } catch { /* ignore */ }
        }
        // Fire immediately so a short session still gets one heartbeat.
        tick()
        const id = window.setInterval(tick, intervalMs)
        return () => window.clearInterval(id)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [kind, intervalMs, heartbeat])
}
