import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { useQueryClient } from "@tanstack/react-query"
import { API_ENDPOINTS } from "@/api/generated/endpoints"

export type AnimeThemeVideo = {
    link: string
    resolution: number
    nc: boolean
    subbed: boolean
    tags: string
    basename: string
    /** Audio-only rip (a.animethemes.moe), when known. */
    audio?: string
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

export type AnimeThemesSeriesAnime = {
    slug: string
    name: string
    year: number
    season: string
    anilistId: number
    image: string
    current: boolean
    themes: AnimeTheme[]
}

export type AnimeThemesSeriesResponse = {
    series: string[]
    anime: AnimeThemesSeriesAnime[]
}

/** The openings and endings of an anime and the rest of its series, in airing order (animethemes.moe). */
export function useGetAnimeThemesSeries(mediaId: number | null | undefined, malId: number | null | undefined) {
    return useServerQuery<AnimeThemesSeriesResponse>({
        endpoint: `/api/v1/anime-themes/series/${mediaId ?? 0}${malId ? `?malId=${malId}` : ""}`,
        method: "GET",
        queryKey: ["ANIME-THEMES-series", String(mediaId), String(malId ?? "")],
        enabled: !!mediaId && mediaId > 0,
        staleTime: 60 * 60 * 1000,
        retry: 1,
    })
}

export type ThemeFavorite = {
    id: number
    mediaId: number
    themeSlug: string
    animeName: string
    songTitle: string
    artists: string
    videoUrl: string
    audioUrl: string
    image: string
    addedAt: string
    rank: number
}

const THEME_FAVORITES_KEY = "THEME-FAVORITES-get"

export function useGetThemeFavorites(enabled = true) {
    return useServerQuery<ThemeFavorite[]>({
        endpoint: "/api/v1/theme/favorites",
        method: "GET",
        queryKey: [THEME_FAVORITES_KEY],
        enabled,
    })
}

export type ThemeFavoriteInput = Omit<ThemeFavorite, "id" | "addedAt" | "rank">

export function useToggleThemeFavorite() {
    const qc = useQueryClient()
    return useServerMutation<boolean, ThemeFavoriteInput>({
        endpoint: "/api/v1/theme/favorites/toggle",
        method: "POST",
        mutationKey: ["THEME-FAVORITES-toggle"],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [THEME_FAVORITES_KEY] })
        },
    })
}

/** Saves the order of favourite themes; ids are row ids, first is number one. */
export function useReorderThemeFavorites() {
    const qc = useQueryClient()
    const mutation = useServerMutation<boolean, { type: "theme", ids: number[] }>({
        endpoint: "/api/v1/favorites/reorder",
        method: "POST",
        mutationKey: ["FAVORITES-reorder", "theme"],
        onError: async () => {
            await qc.invalidateQueries({ queryKey: [THEME_FAVORITES_KEY] })
        },
    })
    return {
        reorder: (ids: number[]) => {
            qc.setQueryData<ThemeFavorite[]>([THEME_FAVORITES_KEY], prev => {
                if (!prev) return prev
                const byId = new Map(prev.map(f => [f.id, f]))
                return ids.map(id => byId.get(id)).filter((f): f is ThemeFavorite => !!f)
            })
            mutation.mutate({ type: "theme", ids })
        },
        isPending: mutation.isPending,
    }
}

/** The best video of a theme (no-credits, highest resolution, first version) and its audio rip. */
export function themeMedia(theme: AnimeTheme): { video: string | null, audio: string | null, resolution: number | null } {
    const entry = theme.entries?.[0]
    const videos = (entry?.videos ?? []).slice().sort((a, b) => (Number(b.nc) - Number(a.nc)) || (b.resolution - a.resolution))
    const v = videos[0]
    return { video: v?.link ?? null, audio: v?.audio || null, resolution: v?.resolution ?? null }
}
