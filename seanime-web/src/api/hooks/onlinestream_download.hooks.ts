import { useServerMutation, useServerQuery } from "@/api/client/requests"
import {
    OnlinestreamDownload_Variables,
    OnlinestreamDownloadQueueAction_Variables,
    OnlinestreamDownloadSeries_Variables,
} from "@/api/generated/endpoint.types"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { WSEvents } from "@/lib/server/ws-events"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

export type OnlinestreamDownload_Status =
    | "queued"
    | "fetching"
    | "downloading"
    | "muxing"
    | "registering"
    | "completed"
    | "failed"
    | "cancelled"

/** One episode in the anime download queue (internal/onlinestream/download/queue.go). */
export type OnlinestreamDownload_Item = {
    id: string
    mediaId: number
    episodeNumber: number
    episodeTitle?: string
    provider: string
    server?: string
    quality?: string
    dubbed: boolean
    title: string
    image?: string
    banner?: string
    status: OnlinestreamDownload_Status
    /** 0..1 within the current status */
    progress: number
    segmentsDone: number
    segmentsTotal: number
    bytes: number
    /** bytes per second */
    speed: number
    etaSeconds: number
    subtitleCount: number
    hardsubbed: boolean
    warnings?: string[]
    error?: string
    destination?: string
    attempts: number
    createdAt: string
    startedAt?: string
    finishedAt?: string
}

export type OnlinestreamDownload_QueueState = {
    paused: boolean
    items: OnlinestreamDownload_Item[]
}

export type OnlinestreamDownload_HistoryEntry = {
    mediaId: number
    episodeNumber: number
    title: string
    image?: string
    provider: string
    destination: string
    bytes: number
    subtitleCount: number
    completedAt: string
}

export type OnlinestreamDownload_SeriesResult = {
    queued: OnlinestreamDownload_Item[]
    skipped: number[]
    total: number
}

export type OnlinestreamDownload_Action =
    | "start" | "stop" | "reset-errored" | "clear-finished" | "clear-all" | "clear-media"
    | "cancel" | "retry" | "remove" | "move-to-top"

export function isOnlinestreamDownloadActive(item: OnlinestreamDownload_Item) {
    return item.status !== "completed" && item.status !== "failed" && item.status !== "cancelled"
}

export function isOnlinestreamDownloadRunning(item: OnlinestreamDownload_Item) {
    return item.status === "fetching" || item.status === "downloading" || item.status === "muxing" || item.status === "registering"
}

const queueKey = [API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloads.key]
const historyKey = [API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloadHistory.key]

/**
 * Keeps the queue current from the server's websocket event and announces finished episodes.
 * Mounted once, in the main layout, so each toast is shown once.
 */
export function useOnlinestreamDownloadsListener() {
    const qc = useQueryClient()

    useWebsocketMessageListener<OnlinestreamDownload_QueueState>({
        type: WSEvents.ONLINESTREAM_DOWNLOAD_QUEUE_UPDATED,
        onMessage: data => {
            if (!data) return
            const prev = qc.getQueryData<OnlinestreamDownload_QueueState>(queueKey)
            qc.setQueryData(queueKey, data)
            let completed = false
            for (const item of data.items ?? []) {
                const before = prev?.items?.find(p => p.id === item.id)
                if (!before || before.status === item.status) continue
                if (item.status === "completed") {
                    completed = true
                    toast.success(`${item.title} — Episode ${item.episodeNumber} was added to your library`)
                } else if (item.status === "failed") {
                    toast.error(`${item.title} — Episode ${item.episodeNumber} failed: ${item.error ?? "unknown error"}`)
                }
            }
            if (completed) qc.invalidateQueries({ queryKey: historyKey })
        },
    })
}

export function useGetOnlinestreamDownloads(enabled = true) {
    return useServerQuery<OnlinestreamDownload_QueueState>({
        endpoint: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloads.endpoint,
        method: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloads.methods[0],
        queryKey: queueKey,
        enabled,
    })
}

export function useGetOnlinestreamDownloadHistory(enabled = true) {
    return useServerQuery<OnlinestreamDownload_HistoryEntry[]>({
        endpoint: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloadHistory.endpoint,
        method: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloadHistory.methods[0],
        queryKey: historyKey,
        enabled,
    })
}

export function useOnlinestreamDownload() {
    const qc = useQueryClient()
    return useServerMutation<OnlinestreamDownload_Item[], OnlinestreamDownload_Variables>({
        endpoint: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.OnlinestreamDownload.endpoint,
        method: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.OnlinestreamDownload.methods[0],
        mutationKey: [API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.OnlinestreamDownload.key],
        onSuccess: async data => {
            const n = data?.length ?? 0
            toast.info(n === 1 ? `Episode ${data![0].episodeNumber} added to the download queue` : `${n} episodes added to the download queue`)
            await qc.invalidateQueries({ queryKey: queueKey })
        },
    })
}

export function useOnlinestreamDownloadSeries() {
    const qc = useQueryClient()
    return useServerMutation<OnlinestreamDownload_SeriesResult, OnlinestreamDownloadSeries_Variables>({
        endpoint: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.OnlinestreamDownloadSeries.endpoint,
        method: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.OnlinestreamDownloadSeries.methods[0],
        mutationKey: [API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.OnlinestreamDownloadSeries.key],
        onSuccess: async data => {
            if (!data) return
            const q = data.queued?.length ?? 0
            const s = data.skipped?.length ?? 0
            if (q === 0) {
                toast.info(`Nothing to download — all ${data.total} episodes are already in your library or the queue`)
            } else {
                toast.success(`${q} of ${data.total} episodes added to the download queue${s ? ` (${s} skipped)` : ""}`)
            }
            await qc.invalidateQueries({ queryKey: queueKey })
        },
    })
}

export function useOnlinestreamDownloadQueueAction() {
    const qc = useQueryClient()
    return useServerMutation<boolean, OnlinestreamDownloadQueueAction_Variables & { action: OnlinestreamDownload_Action }>({
        endpoint: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.OnlinestreamDownloadQueueAction.endpoint,
        method: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.OnlinestreamDownloadQueueAction.methods[0],
        mutationKey: [API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.OnlinestreamDownloadQueueAction.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: queueKey })
        },
    })
}
