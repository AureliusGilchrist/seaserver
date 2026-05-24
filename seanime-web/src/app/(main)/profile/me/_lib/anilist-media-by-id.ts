import { useQuery } from "@tanstack/react-query"

const ANIME_QUERY = `query ($id: Int) {
    Media(id: $id, type: ANIME) {
        id
        title { english romaji native userPreferred }
        coverImage { extraLarge large medium }
        format
        seasonYear
        startDate { year }
        description(asHtml: false)
    }
}`

const MANGA_QUERY = `query ($id: Int) {
    Media(id: $id, type: MANGA) {
        id
        title { english romaji native userPreferred }
        coverImage { extraLarge large medium }
        format
        startDate { year }
        description(asHtml: false)
    }
}`

export type AnilistMedia = {
    id: number
    title?: { english?: string | null; romaji?: string | null; native?: string | null; userPreferred?: string | null }
    coverImage?: { extraLarge?: string | null; large?: string | null; medium?: string | null }
    format?: string | null
    seasonYear?: number | null
    startDate?: { year?: number | null }
    description?: string | null
}

export function useAnilistMediaById(id: number, type: "anime" | "manga") {
    return useQuery<AnilistMedia | null>({
        queryKey: ["anilist-media-by-id", type, id],
        queryFn: async () => {
            const res = await fetch("https://graphql.anilist.co", {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({
                    query: type === "anime" ? ANIME_QUERY : MANGA_QUERY,
                    variables: { id },
                }),
            })
            if (!res.ok) return null
            const j: any = await res.json()
            return (j?.data?.Media as AnilistMedia) ?? null
        },
        enabled: id > 0,
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        retry: 1,
    })
}
