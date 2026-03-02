import { useServerQuery } from "@/api/client/requests"

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synthetic Anime Types
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export interface SyntheticAnime {
    id: number
    syntheticId: number
    title: string
    titleEnglish: string
    coverImage: string
    thumbnail: string
    type: string // TV, MOVIE, OVA, ONA, SPECIAL
    episodes: number
    status: string // FINISHED, ONGOING, UPCOMING
    season: string // SPRING, SUMMER, FALL, WINTER
    seasonYear: number
    description: string
    synonyms: string // JSON array
    tags: string // JSON array
    studios: string // JSON array
    sources: string // JSON array
    anilistId: number
    malId: number
}

export interface GlobalEnMasseDownloaderStatus {
    isRunning: boolean
    isPaused: boolean
    currentAnime: string
    currentAnimeId: number
    processedCount: number
    totalCount: number
    downloadedAnime: string[]
    failedAnime: string[]
    status: string
    hasSavedProgress: boolean
    databaseCount: number
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synthetic Anime Endpoints
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const SYNTHETIC_ANIME_ENDPOINTS = {
    Search: {
        key: "synthetic-anime-search",
        endpoint: "/api/v1/anime/synthetic/search",
        methods: ["POST"] as const,
    },
    Details: {
        key: "synthetic-anime-details",
        endpoint: (id: string) => `/api/v1/anime/synthetic/${id}`,
        methods: ["GET"] as const,
    },
}

export function useSearchSyntheticAnime(query: string, enabled: boolean = true) {
    return useServerQuery<SyntheticAnime[], { query: string, limit: number }>({
        endpoint: SYNTHETIC_ANIME_ENDPOINTS.Search.endpoint,
        method: SYNTHETIC_ANIME_ENDPOINTS.Search.methods[0],
        queryKey: [SYNTHETIC_ANIME_ENDPOINTS.Search.key, query],
        data: { query, limit: 10 },
        enabled: enabled && query.length >= 2,
    })
}

export function useGetSyntheticAnimeDetails(id: string | number | null) {
    const syntheticId = id ?? undefined
    return useServerQuery<SyntheticAnime>({
        endpoint: syntheticId ? SYNTHETIC_ANIME_ENDPOINTS.Details.endpoint(String(syntheticId)) : "",
        method: SYNTHETIC_ANIME_ENDPOINTS.Details.methods[0],
        queryKey: [SYNTHETIC_ANIME_ENDPOINTS.Details.key, syntheticId],
        enabled: !!syntheticId,
    })
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Helper functions
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export function parseSyntheticAnimeArray(jsonString: string): string[] {
    try {
        const parsed = JSON.parse(jsonString)
        if (Array.isArray(parsed)) {
            return parsed.filter((item): item is string => typeof item === "string")
        }
        return []
    } catch {
        return []
    }
}

export function getSyntheticAnimeSynonyms(anime: SyntheticAnime): string[] {
    return parseSyntheticAnimeArray(anime.synonyms)
}

export function getSyntheticAnimeTags(anime: SyntheticAnime): string[] {
    return parseSyntheticAnimeArray(anime.tags)
}

export function getSyntheticAnimeStudios(anime: SyntheticAnime): string[] {
    return parseSyntheticAnimeArray(anime.studios)
}

export function getSyntheticAnimeSources(anime: SyntheticAnime): string[] {
    return parseSyntheticAnimeArray(anime.sources)
}
