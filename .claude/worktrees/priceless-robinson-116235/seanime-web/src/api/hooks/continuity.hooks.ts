import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { GetContinuityWatchHistoryItem_Variables, UpdateContinuityWatchHistoryItem_Variables } from "@/api/generated/endpoint.types"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { Continuity_WatchHistory, Continuity_WatchHistoryItemResponse, Nullish } from "@/api/generated/types"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { logger } from "@/lib/helpers/debug"
import { useQueryClient } from "@tanstack/react-query"
import { MediaPlayerInstance } from "@vidstack/react"
import React from "react"

export function useUpdateContinuityWatchHistoryItem() {
    const qc = useQueryClient()
    return useServerMutation<boolean, UpdateContinuityWatchHistoryItem_Variables>({
        endpoint: API_ENDPOINTS.CONTINUITY.UpdateContinuityWatchHistoryItem.endpoint,
        method: API_ENDPOINTS.CONTINUITY.UpdateContinuityWatchHistoryItem.methods[0],
        mutationKey: [API_ENDPOINTS.CONTINUITY.UpdateContinuityWatchHistoryItem.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.CONTINUITY.GetContinuityWatchHistory.key] })
        },
    })
}

export function useGetContinuityWatchHistoryItem(mediaId: Nullish<number | string>, enabled = true, force = false, episodeNumber?: Nullish<number>) {
    let endpoint = `${API_ENDPOINTS.CONTINUITY.GetContinuityWatchHistoryItem.endpoint.replace("{id}", String(mediaId))}${force ? "?force=true" : ""}`
    // Append episode param for per-episode query
    if (episodeNumber != null && episodeNumber > 0) {
        endpoint += (endpoint.includes("?") ? "&" : "?") + `episode=${episodeNumber}`
    }
    return useServerQuery<Continuity_WatchHistoryItemResponse, GetContinuityWatchHistoryItem_Variables>({
        endpoint,
        method: API_ENDPOINTS.CONTINUITY.GetContinuityWatchHistoryItem.methods[0],
        queryKey: [API_ENDPOINTS.CONTINUITY.GetContinuityWatchHistoryItem.key, String(mediaId), force ? "force" : "default", String(episodeNumber ?? 0)],
        enabled: enabled && !!mediaId,
    })
}

export function useGetContinuityWatchHistory() {
    return useServerQuery<Continuity_WatchHistory>({
        endpoint: API_ENDPOINTS.CONTINUITY.GetContinuityWatchHistory.endpoint,
        method: API_ENDPOINTS.CONTINUITY.GetContinuityWatchHistory.methods[0],
        queryKey: [API_ENDPOINTS.CONTINUITY.GetContinuityWatchHistory.key],
        enabled: true,
    })
}

export function getEpisodePercentageComplete(history: Nullish<Continuity_WatchHistory>, mediaId: number, progressNumber: number) {
    if (!history) return 0
    const item = history[mediaId]
    if (!item || !item.currentTime || !item.duration) return 0
    if (item.episodeNumber !== progressNumber) return 0
    const percent = Math.round((item.currentTime / item.duration) * 100)
    if (percent > 90 || percent < 5) return 0
    return percent
}

export function getEpisodeMinutesRemaining(history: Nullish<Continuity_WatchHistory>, mediaId: number, progressNumber: number) {
    if (!history) return 0
    const item = history[mediaId]
    if (!item || !item.currentTime || !item.duration) return 0
    if (item.episodeNumber !== progressNumber) return 0
    return Math.round((item.duration - item.currentTime) / 60)
}

// Resolves effective continuity enabled state from global setting + per-player override.
function resolveContinuityEnabled(globalEnabled: boolean | undefined, playerOverride?: "inherit" | "on" | "off"): boolean {
    if (playerOverride === "on") return true
    if (playerOverride === "off") return false
    return !!globalEnabled
}

export function useHandleContinuityWithMediaPlayer(playerRef: React.RefObject<MediaPlayerInstance | HTMLVideoElement>,
    episodeNumber: Nullish<number>,
    mediaId: Nullish<number | string>,
    playerOverride?: "inherit" | "on" | "off",
) {
    const serverStatus = useServerStatus()
    const qc = useQueryClient()
    const enabled = resolveContinuityEnabled(serverStatus?.settings?.library?.enableWatchContinuity, playerOverride)

    React.useEffect(() => {
        (async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.CONTINUITY.GetContinuityWatchHistory.key] })
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.CONTINUITY.GetContinuityWatchHistoryItem.key] })
        })()
    }, [episodeNumber ?? 0])

    const { mutate: updateWatchHistory } = useUpdateContinuityWatchHistoryItem()

    function handleUpdateWatchHistory() {
        if (!enabled) return

        if (playerRef.current?.duration && playerRef.current?.currentTime) {
            logger("CONTINUITY").info("Watch history updated", {
                currentTime: playerRef.current?.currentTime,
                duration: playerRef.current?.duration,
            })

            updateWatchHistory({
                options: {
                    currentTime: playerRef.current?.currentTime ?? 0,
                    duration: playerRef.current?.duration ?? 0,
                    mediaId: Number(mediaId),
                    episodeNumber: episodeNumber ?? 0,
                    kind: "onlinestream",
                },
            })
        }
    }

    return { handleUpdateWatchHistory }
}

export function useHandleCurrentMediaContinuity(mediaId: Nullish<number | string>, playerOverride?: "inherit" | "on" | "off", episodeNumber?: Nullish<number>) {
    const serverStatus = useServerStatus()
    const enabled = resolveContinuityEnabled(serverStatus?.settings?.library?.enableWatchContinuity, playerOverride)

    const { data: watchHistory, isLoading: watchHistoryLoading } = useGetContinuityWatchHistoryItem(mediaId, enabled, playerOverride === "on", episodeNumber)

    const waitForWatchHistory = watchHistoryLoading && enabled

    function getEpisodeContinuitySeekTo(episodeNumber: Nullish<number>, playerCurrentTime: Nullish<number>, playerDuration: Nullish<number>) {
        if (!enabled || !mediaId || !watchHistory || !playerDuration || !episodeNumber) return 0
        const item = watchHistory?.item
        if (!item || !item.currentTime || !item.duration || item.episodeNumber !== episodeNumber) return 0
        if (!(item.currentTime > 0 && item.currentTime < playerDuration) || (item.currentTime / item.duration) > 0.9) return 0
        logger("CONTINUITY").info("Found last watched time", {
            currentTime: item.currentTime,
            duration: item.duration,
            episodeNumber: item.episodeNumber,
        })
        return item.currentTime
    }

    return {
        watchHistory,
        waitForWatchHistory,
        shouldWaitForWatchHistory: enabled,
        getEpisodeContinuitySeekTo,
    }
}
