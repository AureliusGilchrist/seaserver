import { useServerQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"

export type AnimeThemeVideo = {
    link: string
    resolution: number
    nc: boolean
    subbed: boolean
    tags: string
    basename: string
}

export type AnimeThemeEntry = {
    version: number
    episodes: string
    nsfw: boolean
    spoiler: boolean
    videos: AnimeThemeVideo[]
}

export type AnimeThemeSong = {
    title: string
    artists: { name: string; slug: string }[]
}

export type AnimeTheme = {
    type: "OP" | "ED"
    sequence: number
    slug: string
    song: AnimeThemeSong | null
    entries: AnimeThemeEntry[]
}

export type AnimeThemesResponse = {
    themes: AnimeTheme[]
}

export function useGetAnimeThemes(malId: number | null | undefined) {
    return useServerQuery<AnimeThemesResponse>({
        endpoint: API_ENDPOINTS.ANIME_THEMES.GetAnimeThemes.endpoint.replace("{id}", String(malId ?? 0)),
        method: API_ENDPOINTS.ANIME_THEMES.GetAnimeThemes.methods[0],
        queryKey: [API_ENDPOINTS.ANIME_THEMES.GetAnimeThemes.key, String(malId)],
        enabled: !!malId && malId > 0,
    })
}
