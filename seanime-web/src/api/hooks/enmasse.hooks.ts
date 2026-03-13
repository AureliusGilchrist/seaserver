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
    autoMatchInProgress: boolean
    autoMatchCurrent: string | null
    autoMatchProcessed: number
    autoMatchTotal: number
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

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Manga Validation
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export interface MangaMatchRecord {
    originalTitle: string
    providerId: string
    matchedId: number
    matchedTitle: string
    isSynthetic: boolean
    confidenceScore: number
    searchResults: any[] // AniList BaseManga array
    status: string
    timestamp: string
}

const MANGA_VALIDATION_ENDPOINTS = {
    GetMatchHistory: {
        key: "manga-match-history",
        endpoint: "/api/v1/enmasse/manga/match-history",
        methods: ["GET"] as const,
    },
    GetLowConfidenceCount: {
        key: "manga-low-confidence-count",
        endpoint: "/api/v1/enmasse/manga/low-confidence-count",
        methods: ["GET"] as const,
    },
    CorrectMatch: {
        key: "manga-correct-match",
        endpoint: "/api/v1/enmasse/manga/correct-match",
        methods: ["POST"] as const,
    },
    ConvertToSynthetic: {
        key: "manga-convert-synthetic",
        endpoint: "/api/v1/enmasse/manga/convert-synthetic",
        methods: ["POST"] as const,
    },
}

export function useMangaMatchHistory(enabled: boolean = true) {
    return useServerQuery<MangaMatchRecord[]>({
        endpoint: MANGA_VALIDATION_ENDPOINTS.GetMatchHistory.endpoint,
        method: MANGA_VALIDATION_ENDPOINTS.GetMatchHistory.methods[0],
        queryKey: [MANGA_VALIDATION_ENDPOINTS.GetMatchHistory.key],
        enabled,
    })
}

export function useLowConfidenceMangaMatchCount(enabled: boolean = true) {
    return useServerQuery<number>({
        endpoint: MANGA_VALIDATION_ENDPOINTS.GetLowConfidenceCount.endpoint,
        method: MANGA_VALIDATION_ENDPOINTS.GetLowConfidenceCount.methods[0],
        queryKey: [MANGA_VALIDATION_ENDPOINTS.GetLowConfidenceCount.key],
        refetchInterval: 5000,
        enabled,
    })
}

export function useCorrectMangaMatch(onSuccess?: () => void) {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, { providerId: string; newAnilistId: number }>({
        endpoint: MANGA_VALIDATION_ENDPOINTS.CorrectMatch.endpoint,
        method: MANGA_VALIDATION_ENDPOINTS.CorrectMatch.methods[0],
        mutationKey: [MANGA_VALIDATION_ENDPOINTS.CorrectMatch.key],
        onSuccess: async () => {
            toast.success("Manga match corrected successfully")
            await queryClient.invalidateQueries({ queryKey: [MANGA_VALIDATION_ENDPOINTS.GetMatchHistory.key] })
            await queryClient.invalidateQueries({ queryKey: [MANGA_VALIDATION_ENDPOINTS.GetLowConfidenceCount.key] })
            // Invalidate manga collection to refresh the UI with the new AniList entry
            await queryClient.invalidateQueries({ queryKey: ["manga-collection"] })
            await queryClient.invalidateQueries({ queryKey: ["anilist-manga-collection"] })
            await queryClient.invalidateQueries({ queryKey: ["manga-entry"] })
            onSuccess?.()
        },
    })
}

export function useConvertMangaToSynthetic(onSuccess?: () => void) {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, { providerId: string }>({
        endpoint: MANGA_VALIDATION_ENDPOINTS.ConvertToSynthetic.endpoint,
        method: MANGA_VALIDATION_ENDPOINTS.ConvertToSynthetic.methods[0],
        mutationKey: [MANGA_VALIDATION_ENDPOINTS.ConvertToSynthetic.key],
        onSuccess: async () => {
            toast.success("Converted to synthetic manga")
            await queryClient.invalidateQueries({ queryKey: [MANGA_VALIDATION_ENDPOINTS.GetMatchHistory.key] })
            await queryClient.invalidateQueries({ queryKey: [MANGA_VALIDATION_ENDPOINTS.GetLowConfidenceCount.key] })
            onSuccess?.()
        },
    })
}

export function useScanMangaCollection(onSuccess?: () => void) {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, void>({
        endpoint: "/api/v1/enmasse/manga/scan-collection",
        method: "POST",
        mutationKey: ["manga-scan-collection"],
        onSuccess: async () => {
            toast.success("Manga collection scanned successfully")
            await queryClient.invalidateQueries({ queryKey: [MANGA_VALIDATION_ENDPOINTS.GetMatchHistory.key] })
            await queryClient.invalidateQueries({ queryKey: [MANGA_VALIDATION_ENDPOINTS.GetLowConfidenceCount.key] })
            onSuccess?.()
        },
    })
}

export function useAutoMatchSyntheticManga(onSuccess?: () => void) {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, void>({
        endpoint: "/api/v1/enmasse/manga/auto-match-synthetic",
        method: "POST",
        mutationKey: ["manga-auto-match-synthetic"],
        onSuccess: async () => {
            toast.success("Synthetic manga auto-matched successfully")
            await queryClient.invalidateQueries({ queryKey: [MANGA_VALIDATION_ENDPOINTS.GetMatchHistory.key] })
            await queryClient.invalidateQueries({ queryKey: [MANGA_VALIDATION_ENDPOINTS.GetLowConfidenceCount.key] })
            onSuccess?.()
        },
    })
}
