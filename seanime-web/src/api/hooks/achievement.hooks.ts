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
import { useCallback, useState } from "react"

export function useGetAchievements() {
    return useServerQuery<Achievement_ListResponse>({
        endpoint: API_ENDPOINTS.ACHIEVEMENT.GetAchievements.endpoint,
        method: API_ENDPOINTS.ACHIEVEMENT.GetAchievements.methods[0],
        queryKey: [API_ENDPOINTS.ACHIEVEMENT.GetAchievements.key],
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
