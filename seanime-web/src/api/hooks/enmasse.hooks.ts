import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

export interface EnMasseDownloaderStatus {
    isRunning: boolean
    isPaused: boolean
    currentAnime: string | null
    currentAnimeId: number | null
    processedCount: number
    totalCount: number
    downloadedAnime: string[]
    failedAnime: string[]
    status: string
    details?: AnimeEnMasseDetails
    hasSavedProgress: boolean
    /** Cover of the series being looked up */
    currentImage?: string
    /** When this run started */
    startedAt?: string
    /** Series handled since startedAt */
    processedThisRun?: number
    /** Episodes waiting in the online download queue */
    downloadQueueWaiting?: number
    /** Latest results, newest first */
    recent?: AnimeEnMasseActivity[]
    /** Series looked up while the download queue was full, queued in order as room appears */
    ready?: AnimeEnMasseReady[]
}

export interface AnimeEnMasseReady {
    mediaId: number
    title: string
    image?: string
    provider: string
    episodes?: number
    readyAt: string
}

export interface AnimeEnMasseActivity {
    time: string
    title: string
    mediaId?: number
    image?: string
    result: "queued" | "not_found" | "skipped"
    detail?: string
    episodes?: number
    /** Provider the series was queued from (kickassanime, or animeheaven as the backup) */
    provider?: string
}

export interface AnimeEnMasseDetails {
    phase: string
    step: string
    currentAnimeIndex: number
    currentAnimeTotal: number
    currentProvider: string
    providersDone: number
    providersTotal: number
    torrentIndex?: number
    torrentTotal?: number
    currentQuery: string
    variantIndex: number
    variantsTotal: number
    torrentsCollected: number
    selectedTorrent: string
    destination: string
    expectedEpisodes: number
    downloadedCount: number
    failedCount: number
    lastError: string
    /** Series left alone: already in the library or downloading, adult, not aired, no AniList entry */
    skippedCount?: number
    /** Episodes queued for online download in this run */
    episodesQueued?: number
}

const ENMASSE_ENDPOINTS = {
    GetStatus: {
        key: "enmasse-status",
        endpoint: "/api/v1/enmasse/status",
        methods: ["GET"] as const,
    },
    Start: {
        key: "enmasse-start",
        endpoint: "/api/v1/enmasse/start",
        methods: ["POST"] as const,
    },
    Stop: {
        key: "enmasse-stop",
        endpoint: "/api/v1/enmasse/stop",
        methods: ["POST"] as const,
    },
}

export function useEnMasseStatus(enabled: boolean = true, pollOnlyWhenRunning: boolean = false) {
    return useServerQuery<EnMasseDownloaderStatus>({
        endpoint: ENMASSE_ENDPOINTS.GetStatus.endpoint,
        method: ENMASSE_ENDPOINTS.GetStatus.methods[0],
        queryKey: [ENMASSE_ENDPOINTS.GetStatus.key],
        refetchInterval: pollOnlyWhenRunning ? 2000 : undefined,
        enabled,
    })
}

export function useEnMasseStart(onSuccess?: () => void) {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, { resume: boolean }>({
        endpoint: ENMASSE_ENDPOINTS.Start.endpoint,
        method: ENMASSE_ENDPOINTS.Start.methods[0],
        mutationKey: [ENMASSE_ENDPOINTS.Start.key],
        // Starting can include downloading the anime database (~60 MB) the first time.
        timeout: 6 * 60 * 1000,
        onSuccess: async () => {
            toast.success("En Masse Downloader started")
            await queryClient.invalidateQueries({ queryKey: [ENMASSE_ENDPOINTS.GetStatus.key] })
            onSuccess?.()
        },
        // A failed start leaves its reason in the status; fetch it so the page shows it.
        onSettled: async () => {
            await queryClient.invalidateQueries({ queryKey: [ENMASSE_ENDPOINTS.GetStatus.key] })
        },
    })
}

export function useEnMasseStop(onSuccess?: () => void) {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, { saveProgress: boolean }>({
        endpoint: ENMASSE_ENDPOINTS.Stop.endpoint,
        method: ENMASSE_ENDPOINTS.Stop.methods[0],
        mutationKey: [ENMASSE_ENDPOINTS.Stop.key],
        onSuccess: async () => {
            toast.info("En Masse Downloader stopped")
            await queryClient.invalidateQueries({ queryKey: [ENMASSE_ENDPOINTS.GetStatus.key] })
            onSuccess?.()
        },
    })
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Manga En Masse Downloader
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export interface MangaEnMasseDownloaderStatus {
    isRunning: boolean
    isPaused: boolean
    currentManga: string | null
    currentChapter?: string | null
    processedCount: number
    totalCount: number
    downloadedManga: string[]
    failedManga: string[]
    skippedManga: string[]
    deferredManga?: string[]
    status: string
    details?: MangaEnMasseDetails
    hasSavedProgress: boolean
}

export interface MangaEnMasseDetails {
    phase: string
    step: string
    currentMangaIndex: number
    currentMangaTotal: number
    provider: string
    mangaId: string
    currentChapterId: string
    currentChapter: string
    chapterIndex: number
    chapterTotal: number
    pageIndex: number
    pageTotal: number
    queuedChapters: number
    downloadedCount: number
    failedCount: number
    skippedCount: number
    deferredCount: number
    lastError: string
    waitingForProvider: boolean
    providerWaitAttempt: number
    providerWaitSince: string
    providerNextProbeAt: string
    providerGiveUpAt: string
}

const MANGA_ENMASSE_ENDPOINTS = {
    GetStatus: {
        key: "manga-enmasse-status",
        endpoint: "/api/v1/enmasse/manga/status",
        methods: ["GET"] as const,
    },
    Start: {
        key: "manga-enmasse-start",
        endpoint: "/api/v1/enmasse/manga/start",
        methods: ["POST"] as const,
    },
    Stop: {
        key: "manga-enmasse-stop",
        endpoint: "/api/v1/enmasse/manga/stop",
        methods: ["POST"] as const,
    },
}

export function useMangaEnMasseStatus(enabled: boolean = true) {
    return useServerQuery<MangaEnMasseDownloaderStatus>({
        endpoint: MANGA_ENMASSE_ENDPOINTS.GetStatus.endpoint,
        method: MANGA_ENMASSE_ENDPOINTS.GetStatus.methods[0],
        queryKey: [MANGA_ENMASSE_ENDPOINTS.GetStatus.key],
        refetchInterval: 2000,
        enabled,
    })
}

export function useMangaEnMasseStart(onSuccess?: () => void) {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, { resume: boolean }>({
        endpoint: MANGA_ENMASSE_ENDPOINTS.Start.endpoint,
        method: MANGA_ENMASSE_ENDPOINTS.Start.methods[0],
        mutationKey: [MANGA_ENMASSE_ENDPOINTS.Start.key],
        onSuccess: async () => {
            toast.success("Manga En Masse Downloader started")
            await queryClient.invalidateQueries({ queryKey: [MANGA_ENMASSE_ENDPOINTS.GetStatus.key] })
            onSuccess?.()
        },
    })
}

export function useMangaEnMasseStop(onSuccess?: () => void) {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, { saveProgress: boolean }>({
        endpoint: MANGA_ENMASSE_ENDPOINTS.Stop.endpoint,
        method: MANGA_ENMASSE_ENDPOINTS.Stop.methods[0],
        mutationKey: [MANGA_ENMASSE_ENDPOINTS.Stop.key],
        onSuccess: async () => {
            toast.info("Manga En Masse Downloader stopped")
            await queryClient.invalidateQueries({ queryKey: [MANGA_ENMASSE_ENDPOINTS.GetStatus.key] })
            onSuccess?.()
        },
    })
}

