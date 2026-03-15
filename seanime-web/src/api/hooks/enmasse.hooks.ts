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
    hasSavedProgress: boolean
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

export function useEnMasseStatus(enabled: boolean = true) {
    return useServerQuery<EnMasseDownloaderStatus>({
        endpoint: ENMASSE_ENDPOINTS.GetStatus.endpoint,
        method: ENMASSE_ENDPOINTS.GetStatus.methods[0],
        queryKey: [ENMASSE_ENDPOINTS.GetStatus.key],
        refetchInterval: 2000,
        enabled,
    })
}

export function useEnMasseStart(onSuccess?: () => void) {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, { resume: boolean }>({
        endpoint: ENMASSE_ENDPOINTS.Start.endpoint,
        method: ENMASSE_ENDPOINTS.Start.methods[0],
        mutationKey: [ENMASSE_ENDPOINTS.Start.key],
        onSuccess: async () => {
            toast.success("En Masse Downloader started")
            await queryClient.invalidateQueries({ queryKey: [ENMASSE_ENDPOINTS.GetStatus.key] })
            onSuccess?.()
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
    status: string
    hasSavedProgress: boolean
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

