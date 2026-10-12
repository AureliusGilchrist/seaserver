import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { GetContinuityWatchHistoryItem_Variables, UpdateContinuityWatchHistoryItem_Variables } from "@/api/generated/endpoint.types"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { Continuity_WatchHistory, Continuity_WatchHistoryItemResponse, Nullish } from "@/api/generated/types"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { vc_exactResumeAtom } from "@/app/(main)/_features/video-core/video-core.atoms"
import { useAtomValue } from "jotai"
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
    const exactResume = useAtomValue(vc_exactResumeAtom)
    let endpoint = `${API_ENDPOINTS.CONTINUITY.GetContinuityWatchHistoryItem.endpoint.replace("{id}", String(mediaId))}${force ? "?force=true" : ""}`
    if (exactResume) {
        endpoint += (endpoint.includes("?") ? "&" : "?") + "resume=exact"
    }
    // Append episode param for per-episode query
    if (episodeNumber != null && episodeNumber > 0) {
        endpoint += (endpoint.includes("?") ? "&" : "?") + `episode=${episodeNumber}`
    }
    return useServerQuery<Continuity_WatchHistoryItemResponse, GetContinuityWatchHistoryItem_Variables>({
        endpoint,
        method: API_ENDPOINTS.CONTINUITY.GetContinuityWatchHistoryItem.methods[0],
        queryKey: [API_ENDPOINTS.CONTINUITY.GetContinuityWatchHistoryItem.key, String(mediaId), force ? "force" : "default", String(episodeNumber ?? 0), exactResume ? "exact" : "std"],
        enabled: enabled && !!mediaId,
        staleTime: 0,
        refetchOnMount: "always",
    })
}

export function useGetContinuityWatchHistory() {
    return useServerQuery<Continuity_WatchHistory>({
        endpoint: API_ENDPOINTS.CONTINUITY.GetContinuityWatchHistory.endpoint,
        method: API_ENDPOINTS.CONTINUITY.GetContinuityWatchHistory.methods[0],
        queryKey: [API_ENDPOINTS.CONTINUITY.GetContinuityWatchHistory.key],
        enabled: true,
        staleTime: 0,
        refetchOnMount: "always",
    })
}

export function getEpisodePercentageComplete(history: Nullish<Continuity_WatchHistory>, mediaId: number, progressNumber: number) {
    const item = getInProgressItem(history, mediaId, progressNumber)
    if (!item) return 0
    return Math.max(1, Math.round((item.currentTime / item.duration) * 100))
}

export function getEpisodeSecondsRemaining(history: Nullish<Continuity_WatchHistory>, mediaId: number, progressNumber: number) {
    const item = getInProgressItem(history, mediaId, progressNumber)
    if (!item) return 0
    return Math.max(1, Math.round(item.duration - item.currentTime))
}

export function getEpisodeTotalSeconds(history: Nullish<Continuity_WatchHistory>, mediaId: number, progressNumber: number) {
    const item = getInProgressItem(history, mediaId, progressNumber)
    if (!item) return 0
    return Math.max(1, Math.round(item.duration))
}

// "17m 23s"; drops the minutes below a minute.
export function formatMinSec(totalSeconds: number) {
    const s = Math.max(0, Math.round(totalSeconds))
    const m = Math.floor(s / 60)
    const r = s % 60
    return m > 0 ? `${m}m ${r}s` : `${r}s`
}

// "17m 23s in · 12m 7s left of 29m 30s"
export function formatProgressText(secondsRemaining: number, totalSeconds?: number) {
    const inPart = totalSeconds ? `${formatMinSec(Math.max(0, totalSeconds - secondsRemaining))} in · ` : ""
    const ofPart = totalSeconds ? ` of ${formatMinSec(totalSeconds)}` : ""
    return `${inPart}${formatMinSec(secondsRemaining)} left${ofPart}`
}

// Episodes are considered watched from this ratio onwards (mirrors the server's IgnoreRatioThreshold)
export const CONTINUITY_FINISHED_RATIO = 0.85

function getInProgressItem(history: Nullish<Continuity_WatchHistory>, mediaId: number, progressNumber: number) {
    if (!history) return undefined
    const item = history[mediaId]
    if (!item) return undefined
    const candidate = item.episodes?.[progressNumber] ?? (item.episodeNumber === progressNumber ? item : undefined)
    if (!candidate || candidate.currentTime < 30 || !candidate.duration) return undefined
    if (candidate.currentTime / candidate.duration >= CONTINUITY_FINISHED_RATIO) return undefined
    return candidate
}

export function getEpisodeMinutesAt(history: Nullish<Continuity_WatchHistory>, mediaId: number, progressNumber: number) {
    const item = getInProgressItem(history, mediaId, progressNumber)
    if (!item) return 0
    return Math.max(0, Math.floor(item.currentTime / 60))
}

// Resolves effective continuity enabled state. Tracking is on by default, only an explicit per-player "off" disables it.
function resolveContinuityEnabled(_globalEnabled: boolean | undefined, playerOverride?: "inherit" | "on" | "off"): boolean {
    return playerOverride !== "off"
}

export function useHandleContinuityWithMediaPlayer(playerRef: React.RefObject<MediaPlayerInstance | HTMLVideoElement | null>,
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

    // Last position seen from the player, kept so it can still be saved once the player element is gone
    const lastPositionRef = React.useRef<{ currentTime: number, duration: number } | null>(null)
    const latestRef = React.useRef({ enabled, mediaId, episodeNumber, updateWatchHistory })
    latestRef.current = { enabled, mediaId, episodeNumber, updateWatchHistory }

    const savePosition = React.useCallback((episodeOverride?: Nullish<number>) => {
        const { enabled, mediaId, episodeNumber, updateWatchHistory } = latestRef.current
        const pos = lastPositionRef.current
        if (!enabled || !mediaId || !pos?.duration || !pos?.currentTime) return
        updateWatchHistory({
            options: {
                currentTime: pos.currentTime,
                duration: pos.duration,
                mediaId: Number(mediaId),
                episodeNumber: (episodeOverride ?? episodeNumber) ?? 0,
                kind: "onlinestream",
            },
        })
    }, [])

    // Save the position of the episode being left (episode change or page unmount)
    React.useEffect(() => {
        const ep = episodeNumber
        return () => {
            const p = playerRef.current
            if (p?.duration && p?.currentTime) {
                lastPositionRef.current = { currentTime: p.currentTime, duration: p.duration }
            }
            savePosition(ep)
            lastPositionRef.current = null
        }
    }, [episodeNumber])

    function handleUpdateWatchHistory() {
        if (!enabled) return

        if (playerRef.current?.duration && playerRef.current?.currentTime) {
            logger("CONTINUITY").info("Watch history updated", {
                currentTime: playerRef.current?.currentTime,
                duration: playerRef.current?.duration,
            })
            lastPositionRef.current = { currentTime: playerRef.current.currentTime, duration: playerRef.current.duration }
            savePosition()
        }
    }

    // Track the position every second, and save it when the player is paused, hidden or unmounted (leaving the page)
    React.useEffect(() => {
        const track = () => {
            const p = playerRef.current
            if (p?.duration && p?.currentTime) {
                lastPositionRef.current = { currentTime: p.currentTime, duration: p.duration }
            }
        }
        const interval = setInterval(track, 1000)
        const saveInterval = setInterval(() => {
            track()
            savePosition()
        }, 5000)
        const onHide = () => {
            if (document.visibilityState === "hidden") {
                track()
                savePosition()
            }
        }
        document.addEventListener("visibilitychange", onHide)
        window.addEventListener("pagehide", onHide)
        return () => {
            clearInterval(interval)
            clearInterval(saveInterval)
            document.removeEventListener("visibilitychange", onHide)
            window.removeEventListener("pagehide", onHide)
        }
    }, [])

    return { handleUpdateWatchHistory }
}


export function useHandleCurrentMediaContinuity(mediaId: Nullish<number | string>, playerOverride?: "inherit" | "on" | "off", episodeNumber?: Nullish<number>) {
    const serverStatus = useServerStatus()
    const enabled = resolveContinuityEnabled(serverStatus?.settings?.library?.enableWatchContinuity, playerOverride)

    const { data: watchHistory, isLoading: watchHistoryLoading } = useGetContinuityWatchHistoryItem(mediaId, enabled, playerOverride === "on", episodeNumber)

    const waitForWatchHistory = watchHistoryLoading && enabled

    const exactResume = useAtomValue(vc_exactResumeAtom)

    function getEpisodeContinuitySeekTo(episodeNumber: Nullish<number>, playerCurrentTime: Nullish<number>, playerDuration: Nullish<number>) {
        if (!enabled || !mediaId || !watchHistory || !playerDuration || !episodeNumber) return 0
        const item = watchHistory?.item
        if (!item || !item.currentTime || !item.duration || item.episodeNumber !== episodeNumber) return 0
        const ratio = item.currentTime / item.duration
        if (exactResume) {
            if (ratio >= CONTINUITY_FINISHED_RATIO) return 0
            return item.currentTime
        }
        if (!(item.currentTime > 0 && item.currentTime < playerDuration) || ratio >= CONTINUITY_FINISHED_RATIO) return 0
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
