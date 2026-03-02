import { useServerMutation, useServerQuery } from "@/api/client/requests"

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

// Global en masse and synthetic anime removed

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
