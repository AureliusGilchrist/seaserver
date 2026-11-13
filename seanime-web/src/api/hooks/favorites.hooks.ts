import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { useQueryClient } from "@tanstack/react-query"

export function useGetAnimeFavorites() {
    return useServerQuery<number[]>({
        endpoint: API_ENDPOINTS.ANIME_FAVORITE.GetAnimeFavorites.endpoint,
        method: API_ENDPOINTS.ANIME_FAVORITE.GetAnimeFavorites.methods[0],
        queryKey: [API_ENDPOINTS.ANIME_FAVORITE.GetAnimeFavorites.key],
        enabled: true,
    })
}

export function useToggleAnimeFavorite() {
    const qc = useQueryClient()
    return useServerMutation<boolean, { mediaId: number }>({
        endpoint: API_ENDPOINTS.ANIME_FAVORITE.ToggleAnimeFavorite.endpoint,
        method: API_ENDPOINTS.ANIME_FAVORITE.ToggleAnimeFavorite.methods[0],
        mutationKey: [API_ENDPOINTS.ANIME_FAVORITE.ToggleAnimeFavorite.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_FAVORITE.GetAnimeFavorites.key] })
        },
    })
}

export function useGetMangaFavorites() {
    return useServerQuery<number[]>({
        endpoint: API_ENDPOINTS.MANGA_FAVORITE.GetMangaFavorites.endpoint,
        method: API_ENDPOINTS.MANGA_FAVORITE.GetMangaFavorites.methods[0],
        queryKey: [API_ENDPOINTS.MANGA_FAVORITE.GetMangaFavorites.key],
        enabled: true,
    })
}

export function useToggleMangaFavorite() {
    const qc = useQueryClient()
    return useServerMutation<boolean, { mediaId: number }>({
        endpoint: API_ENDPOINTS.MANGA_FAVORITE.ToggleMangaFavorite.endpoint,
        method: API_ENDPOINTS.MANGA_FAVORITE.ToggleMangaFavorite.methods[0],
        mutationKey: [API_ENDPOINTS.MANGA_FAVORITE.ToggleMangaFavorite.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.MANGA_FAVORITE.GetMangaFavorites.key] })
        },
    })
}

export function useGetCharacterFavorites() {
    return useServerQuery<number[]>({
        endpoint: API_ENDPOINTS.ENTITY_FAVORITE.GetCharacterFavorites.endpoint,
        method: API_ENDPOINTS.ENTITY_FAVORITE.GetCharacterFavorites.methods[0],
        queryKey: [API_ENDPOINTS.ENTITY_FAVORITE.GetCharacterFavorites.key],
        enabled: true,
    })
}

export function useToggleCharacterFavorite() {
    const qc = useQueryClient()
    return useServerMutation<boolean, { characterId: number }>({
        endpoint: API_ENDPOINTS.ENTITY_FAVORITE.ToggleCharacterFavorite.endpoint,
        method: API_ENDPOINTS.ENTITY_FAVORITE.ToggleCharacterFavorite.methods[0],
        mutationKey: [API_ENDPOINTS.ENTITY_FAVORITE.ToggleCharacterFavorite.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ENTITY_FAVORITE.GetCharacterFavorites.key] })
        },
    })
}

export function useGetStaffFavorites() {
    return useServerQuery<number[]>({
        endpoint: API_ENDPOINTS.ENTITY_FAVORITE.GetStaffFavorites.endpoint,
        method: API_ENDPOINTS.ENTITY_FAVORITE.GetStaffFavorites.methods[0],
        queryKey: [API_ENDPOINTS.ENTITY_FAVORITE.GetStaffFavorites.key],
        enabled: true,
    })
}

export function useToggleStaffFavorite() {
    const qc = useQueryClient()
    return useServerMutation<boolean, { staffId: number }>({
        endpoint: API_ENDPOINTS.ENTITY_FAVORITE.ToggleStaffFavorite.endpoint,
        method: API_ENDPOINTS.ENTITY_FAVORITE.ToggleStaffFavorite.methods[0],
        mutationKey: [API_ENDPOINTS.ENTITY_FAVORITE.ToggleStaffFavorite.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ENTITY_FAVORITE.GetStaffFavorites.key] })
        },
    })
}

export function useGetStudioFavorites() {
    return useServerQuery<number[]>({
        endpoint: API_ENDPOINTS.ENTITY_FAVORITE.GetStudioFavorites.endpoint,
        method: API_ENDPOINTS.ENTITY_FAVORITE.GetStudioFavorites.methods[0],
        queryKey: [API_ENDPOINTS.ENTITY_FAVORITE.GetStudioFavorites.key],
        enabled: true,
    })
}

export function useToggleStudioFavorite() {
    const qc = useQueryClient()
    return useServerMutation<boolean, { studioId: number }>({
        endpoint: API_ENDPOINTS.ENTITY_FAVORITE.ToggleStudioFavorite.endpoint,
        method: API_ENDPOINTS.ENTITY_FAVORITE.ToggleStudioFavorite.methods[0],
        mutationKey: [API_ENDPOINTS.ENTITY_FAVORITE.ToggleStudioFavorite.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ENTITY_FAVORITE.GetStudioFavorites.key] })
        },
    })
}

export type FavoriteKind = "anime" | "manga" | "character" | "staff" | "studio"

const FAVORITE_QUERY_KEYS: Record<FavoriteKind, string> = {
    anime: API_ENDPOINTS.ANIME_FAVORITE.GetAnimeFavorites.key,
    manga: API_ENDPOINTS.MANGA_FAVORITE.GetMangaFavorites.key,
    character: API_ENDPOINTS.ENTITY_FAVORITE.GetCharacterFavorites.key,
    staff: API_ENDPOINTS.ENTITY_FAVORITE.GetStaffFavorites.key,
    studio: API_ENDPOINTS.ENTITY_FAVORITE.GetStudioFavorites.key,
}

/**
 * Saves the order of one kind of favourite (the first ID is number one). The list on screen takes
 * the new order at once; the server is told in the background, and the list is re-read if it says no.
 */
export function useReorderFavorites(kind: FavoriteKind) {
    const qc = useQueryClient()
    const queryKey = [FAVORITE_QUERY_KEYS[kind]]
    const mutation = useServerMutation<boolean, { type: FavoriteKind, ids: number[] }>({
        endpoint: "/api/v1/favorites/reorder",
        method: "POST",
        mutationKey: ["FAVORITES-reorder", kind],
        onError: async () => {
            await qc.invalidateQueries({ queryKey })
        },
    })
    return {
        reorder: (ids: number[]) => {
            qc.setQueryData<number[]>(queryKey, ids)
            mutation.mutate({ type: kind, ids })
        },
        isPending: mutation.isPending,
    }
}

// ─────────────────────── Favourite episodes ───────────────────────

/** A favourite episode, with the title and image saved when it was favourited. */
export type EpisodeFavorite = {
    id: number
    mediaId: number
    episodeNumber: number
    title: string
    image: string
    addedAt?: string
    rank: number
}

export function useGetEpisodeFavorites(enabled = true) {
    return useServerQuery<EpisodeFavorite[]>({
        endpoint: API_ENDPOINTS.EPISODE_FAVORITE.GetEpisodeFavorites.endpoint,
        method: API_ENDPOINTS.EPISODE_FAVORITE.GetEpisodeFavorites.methods[0],
        queryKey: [API_ENDPOINTS.EPISODE_FAVORITE.GetEpisodeFavorites.key],
        enabled,
    })
}

export function useToggleEpisodeFavorite() {
    const qc = useQueryClient()
    return useServerMutation<boolean, { mediaId: number, episodeNumber: number, title?: string, image?: string }>({
        endpoint: API_ENDPOINTS.EPISODE_FAVORITE.ToggleEpisodeFavorite.endpoint,
        method: API_ENDPOINTS.EPISODE_FAVORITE.ToggleEpisodeFavorite.methods[0],
        mutationKey: [API_ENDPOINTS.EPISODE_FAVORITE.ToggleEpisodeFavorite.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.EPISODE_FAVORITE.GetEpisodeFavorites.key] })
        },
    })
}

/** Whether one episode is a favourite, and a toggle for it. */
export function useEpisodeFavorite(mediaId: number | undefined, episodeNumber: number | undefined) {
    const { data } = useGetEpisodeFavorites(!!mediaId)
    const { mutate, isPending } = useToggleEpisodeFavorite()
    const isFavorite = !!data?.some(f => f.mediaId === mediaId && f.episodeNumber === episodeNumber)
    return {
        isFavorite,
        isPending,
        toggle: (meta?: { title?: string, image?: string }) => {
            if (!mediaId || episodeNumber === undefined) return
            mutate({ mediaId, episodeNumber, title: meta?.title, image: meta?.image })
        },
    }
}

/** Saves the order of favourite episodes; ids are the favourites' row ids, first is number one. */
export function useReorderEpisodeFavorites() {
    const qc = useQueryClient()
    const queryKey = [API_ENDPOINTS.EPISODE_FAVORITE.GetEpisodeFavorites.key]
    const mutation = useServerMutation<boolean, { type: "episode", ids: number[] }>({
        endpoint: "/api/v1/favorites/reorder",
        method: "POST",
        mutationKey: ["FAVORITES-reorder", "episode"],
        onError: async () => {
            await qc.invalidateQueries({ queryKey })
        },
    })
    return {
        reorder: (ids: number[]) => {
            qc.setQueryData<EpisodeFavorite[]>(queryKey, prev => {
                if (!prev) return prev
                const byId = new Map(prev.map(f => [f.id, f]))
                return ids.map(id => byId.get(id)).filter((f): f is EpisodeFavorite => !!f)
            })
            mutation.mutate({ type: "episode", ids })
        },
        isPending: mutation.isPending,
    }
}
