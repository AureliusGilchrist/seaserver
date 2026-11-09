import { useServerMutation, useServerQuery } from "@/api/client/requests"
import {
    GetOnlinestreamDownloadExisting_Variables,
    GetOnlinestreamDownloadSeries_Variables,
    OnlinestreamDownload_Variables,
    OnlinestreamDownloadQueueAction_Variables,
    OnlinestreamDownloadSeries_Variables,
} from "@/api/generated/endpoint.types"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { WSEvents } from "@/lib/server/ws-events"
import { keepPreviousData, useQueryClient } from "@tanstack/react-query"
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
    /** The stream being downloaded: "Japanese", then "English dub" for dual audio */
    phase?: string
    /** Audio languages of the file, in order (Japanese first) */
    audioTracks?: string[]
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

export type OnlinestreamDownload_QueueCounts = {
    queued: number
    running: number
    completed: number
    failed: number
    cancelled: number
    total: number
}

/** One anime's line in the queue (internal/onlinestream/download/summary.go). */
/** The two download queues, taken in turn a series at a time. */
export type OnlinestreamDownload_Queue = "personal" | "enmasse"

export type OnlinestreamDownload_SeriesSummary = {
    mediaId: number
    /** The queue the series is in */
    queue: OnlinestreamDownload_Queue
    title: string
    image?: string
    total: number
    queued: number
    done: number
    failed: number
    cancelled: number
    running: boolean
    runningEpisode?: number
    /** finished episodes plus the running one's fraction, 0..1 */
    progress: number
    bytes: number
}

/**
 * The queue as the server sends it: counts, one line per series and the running episode. A
 * series' episodes are fetched on their own (useGetOnlinestreamDownloadSeries), so a queue of
 * thousands of episodes stays light.
 */
export type OnlinestreamDownload_QueueSummary = {
    paused: boolean
    /** Why downloads are waiting on the server's disk (read-only, full), if they are */
    blocked?: string
    /** Changes whenever an episode is added, removed, reordered or changes state */
    rev: number
    counts: OnlinestreamDownload_QueueCounts
    running?: OnlinestreamDownload_Item
    series: OnlinestreamDownload_SeriesSummary[]
}

/** One anime in the Downloaded list. */
export type OnlinestreamDownload_HistorySeries = {
    mediaId: number
    title: string
    image?: string
    episodes: number
    bytes: number
    completedAt: string
}

export type OnlinestreamDownload_SeriesResult = {
    queued: OnlinestreamDownload_Item[]
    skipped: number[]
    total: number
    /** The provider the series was queued from (when the best available one was picked). */
    provider?: string
}

function providerDisplayName(id: string) {
    return ({ animepahe: "AnimePahe", kickassanime: "Kickassanime", anizone: "AniZone", animeheaven: "AnimeHeaven", animegg: "AnimeGG" } as Record<string, string>)[id] ?? id
}

export type OnlinestreamDownload_Action =
    | "start" | "stop" | "reset-errored" | "clear-finished" | "clear-all" | "clear-media"
    | "cancel" | "retry" | "remove" | "move-to-top" | "retry-media"

/** An episode the library already has, with its file names. */
export type OnlinestreamDownload_ExistingEpisode = {
    episodeNumber: number
    files: string[]
}

export function isOnlinestreamDownloadActive(item: OnlinestreamDownload_Item) {
    return item.status !== "completed" && item.status !== "failed" && item.status !== "cancelled"
}

export function isOnlinestreamDownloadRunning(item: OnlinestreamDownload_Item) {
    return item.status === "fetching" || item.status === "downloading" || item.status === "muxing" || item.status === "registering"
}

const queueKey = [API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloads.key]
const seriesKey = API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloadSeries.key
const historyKey = [API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloadHistory.key]
const existingKey = API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloadExisting.key

/**
 * Keeps the queue summary current from the server's websocket events and announces finished
 * episodes. Mounted once, in the main layout, so each toast is shown once.
 */
export function useOnlinestreamDownloadsListener() {
    const qc = useQueryClient()

    useWebsocketMessageListener<OnlinestreamDownload_QueueSummary>({
        type: WSEvents.ONLINESTREAM_DOWNLOAD_QUEUE_UPDATED,
        onMessage: data => {
            if (data) qc.setQueryData(queueKey, data)
        },
    })

    // Progress: only the running episode changes, so only it is patched into the summary.
    useWebsocketMessageListener<OnlinestreamDownload_Item>({
        type: WSEvents.ONLINESTREAM_DOWNLOAD_PROGRESS,
        onMessage: item => {
            if (!item) return
            qc.setQueryData<OnlinestreamDownload_QueueSummary>(queueKey, prev => {
                if (!prev) return prev
                const series = prev.series.map(s => {
                    if (s.mediaId !== item.mediaId || s.total === 0) return s
                    const fraction = item.status === "downloading" ? item.progress : 0
                    return { ...s, progress: (s.done + fraction) / s.total }
                })
                return { ...prev, running: item, series }
            })
        },
    })

    useWebsocketMessageListener<OnlinestreamDownload_Item>({
        type: WSEvents.ONLINESTREAM_DOWNLOAD_FINISHED,
        onMessage: item => {
            if (!item) return
            if (item.status === "completed") {
                toast.success(`${item.title} — Episode ${item.episodeNumber} was added to your library`)
                qc.invalidateQueries({ queryKey: historyKey })
                qc.invalidateQueries({ queryKey: [existingKey] })
            } else if (item.status === "failed") {
                toast.error(`${item.title} — Episode ${item.episodeNumber} failed: ${item.error ?? "unknown error"}`)
            }
        },
    })
}

export function useGetOnlinestreamDownloads(enabled = true) {
    return useServerQuery<OnlinestreamDownload_QueueSummary>({
        endpoint: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloads.endpoint,
        method: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloads.methods[0],
        queryKey: queueKey,
        enabled,
    })
}

/**
 * One anime's episodes in the queue, fetched only while something shows them. `rev` is the
 * summary's revision: the list is refetched when the queue changes, not on every progress tick.
 */
export function useGetOnlinestreamDownloadSeries(mediaId: number | null | undefined, rev: number | undefined, enabled = true) {
    return useServerQuery<OnlinestreamDownload_Item[], GetOnlinestreamDownloadSeries_Variables>({
        endpoint: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloadSeries.endpoint,
        method: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloadSeries.methods[0],
        queryKey: [seriesKey, mediaId, rev ?? 0],
        data: { mediaId: Number(mediaId) },
        enabled: enabled && !!mediaId,
        placeholderData: keepPreviousData,
    })
}

export function useGetOnlinestreamDownloadHistory(enabled = true) {
    return useServerQuery<OnlinestreamDownload_HistorySeries[]>({
        endpoint: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloadHistory.endpoint,
        method: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloadHistory.methods[0],
        queryKey: historyKey,
        enabled,
    })
}

/** The episodes of an anime already in the library, to ask before overwriting them. */
export function useGetOnlinestreamDownloadExisting(mediaId: number | null | undefined) {
    return useServerQuery<OnlinestreamDownload_ExistingEpisode[], GetOnlinestreamDownloadExisting_Variables>({
        endpoint: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloadExisting.endpoint,
        method: API_ENDPOINTS.ONLINESTREAM_DOWNLOAD.GetOnlinestreamDownloadExisting.methods[0],
        queryKey: [existingKey, mediaId],
        data: { mediaId: Number(mediaId) },
        enabled: !!mediaId,
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
        // Finding the series on a source can take a few searches, spaced out to go easy on the sites.
        timeout: 10 * 60 * 1000,
        onSuccess: async data => {
            if (!data) return
            const q = data.queued?.length ?? 0
            const s = data.skipped?.length ?? 0
            const from = data.provider ? ` from ${providerDisplayName(data.provider)}` : ""
            if (q === 0) {
                toast.info(`Nothing to download — all ${data.total} episodes are already in your library or the queue`)
            } else {
                toast.success(`${q} of ${data.total} episodes added to the download queue${from}${s ? ` (${s} skipped)` : ""}`)
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
