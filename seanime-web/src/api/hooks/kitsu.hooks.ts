import { useServerQuery } from "@/api/client/requests"

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
    chapterCount?: number
    volumeCount?: number
    serialization?: string
}

export function useGetKitsuInfo(malId: number | null | undefined, type: "anime" | "manga") {
    return useServerQuery<KitsuAnimeInfo>({
        endpoint: `/api/v1/kitsu/${type}/${malId ?? 0}`,
        method: "GET",
        queryKey: ["KITSU-get-info", type, String(malId)],
        enabled: !!malId && malId > 0,
        muteError: true,
    })
}
