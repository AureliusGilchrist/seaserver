import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { CancelOnlinestreamDownload_Variables, OnlinestreamDownload_Variables } from "@/api/generated/endpoint.types"
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

/** One episode in the online stream download queue (internal/onlinestream/download/manager.go). */
export type OnlinestreamDownload_Item = {
    id: string
    mediaId: number
    episodeNumber: number
    provider: string
    server?: string
    quality?: string
    dubbed: boolean
    title: string
    image?: string
    status: OnlinestreamDownload_Status
    /** 0..1 within the current status */
    progress: number
    segmentsDone: number
    segmentsTotal: number
    bytes: number
    subtitleCount: number
    hardsubbed: boolean
    warnings?: string[]
    error?: string
    destination?: string
    createdAt: string
}

export function isOnlinestreamDownloadActive(item: OnlinestreamDownload_Item) {
    return item.status !== "completed" && item.status !== "failed" && item.status !== "cancelled"
}

/** The download queue, kept current by the server's websocket event. */
export function useGetOnlinestreamDownloads(enabled = true) {
    const qc = useQueryClient()

    useWebsocketMessageListener<OnlinestreamDownload_Item[]>({
        type: WSEvents.ONLINESTREAM_DOWNLOAD_QUEUE_UPDATED,
        onMessage: data => {
            const prev = qc.getQueryData<OnlinestreamDownload_Item[]>([API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloads.key])
            qc.setQueryData([API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloads.key], data ?? [])
            // Announce transitions to a finished state once.
            for (const item of data ?? []) {
                const before = prev?.find(p => p.id === item.id)
                if (!before || before.status === item.status) continue
                if (item.status === "completed") {
                    toast.success(`Episode ${item.episodeNumber} of ${item.title} was added to your library`)
                } else if (item.status === "failed") {
                    toast.error(`Download of episode ${item.episodeNumber} failed: ${item.error ?? "unknown error"}`)
                }
            }
        },
    })

    return useServerQuery<OnlinestreamDownload_Item[]>({
        endpoint: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloads.endpoint,
        method: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloads.methods[0],
        queryKey: [API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloads.key],
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
            toast.info(n === 1 ? `Episode ${data![0].episodeNumber} queued for download` : `${n} episodes queued for download`)
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloads.key] })
        },
    })
}

export function useCancelOnlinestreamDownload() {
    const qc = useQueryClient()
    return useServerMutation<boolean, CancelOnlinestreamDownload_Variables>({
        endpoint: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.CancelOnlinestreamDownload.endpoint,
        method: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.CancelOnlinestreamDownload.methods[0],
        mutationKey: [API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.CancelOnlinestreamDownload.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloads.key] })
        },
    })
}

export function useClearOnlinestreamDownloads() {
    const qc = useQueryClient()
    return useServerMutation<boolean>({
        endpoint: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.ClearOnlinestreamDownloads.endpoint,
        method: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.ClearOnlinestreamDownloads.methods[0],
        mutationKey: [API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.ClearOnlinestreamDownloads.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloads.key] })
        },
    })
}
