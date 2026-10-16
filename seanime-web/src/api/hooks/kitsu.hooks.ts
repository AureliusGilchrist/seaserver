import { useServerQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"

export type KitsuAnimeInfo = {
    found: boolean
    id: string
    slug: string
    url: string
    canonicalTitle: string
    titles: Record<string, string> | null
    synopsis: string
    subtype: string
    status: string
    ageRating: string
    ageRatingGuide: string
    averageRating: string
    userCount: number
    favoritesCount: number
    popularityRank: number
    ratingRank: number
    startDate: string
    endDate: string
    episodeCount: number
    episodeLength: number
    totalLength: number
    youtubeVideoId: string
    posterImage: string
    coverImage: string
}

export function useGetKitsuAnimeInfo(malId: number | null | undefined) {
    return useServerQuery<KitsuAnimeInfo>({
        endpoint: API_ENDPOINTS.KITSU.GetKitsuAnimeInfo.endpoint.replace("{id}", String(malId ?? 0)),
        method: API_ENDPOINTS.KITSU.GetKitsuAnimeInfo.methods[0],
        queryKey: [API_ENDPOINTS.KITSU.GetKitsuAnimeInfo.key, String(malId)],
        enabled: !!malId && malId > 0,
    })
}
