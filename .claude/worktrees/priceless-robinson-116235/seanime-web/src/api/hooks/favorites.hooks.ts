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
        endpoint: API_ENDPOINTS.CHARACTER_FAVORITE.GetCharacterFavorites.endpoint,
        method: API_ENDPOINTS.CHARACTER_FAVORITE.GetCharacterFavorites.methods[0],
        queryKey: [API_ENDPOINTS.CHARACTER_FAVORITE.GetCharacterFavorites.key],
        enabled: true,
    })
}

export function useToggleCharacterFavorite() {
    const qc = useQueryClient()
    return useServerMutation<boolean, { characterId: number }>({
        endpoint: API_ENDPOINTS.CHARACTER_FAVORITE.ToggleCharacterFavorite.endpoint,
        method: API_ENDPOINTS.CHARACTER_FAVORITE.ToggleCharacterFavorite.methods[0],
        mutationKey: [API_ENDPOINTS.CHARACTER_FAVORITE.ToggleCharacterFavorite.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.CHARACTER_FAVORITE.GetCharacterFavorites.key] })
        },
    })
}

export function useGetStaffFavorites() {
    return useServerQuery<number[]>({
        endpoint: API_ENDPOINTS.STAFF_FAVORITE.GetStaffFavorites.endpoint,
        method: API_ENDPOINTS.STAFF_FAVORITE.GetStaffFavorites.methods[0],
        queryKey: [API_ENDPOINTS.STAFF_FAVORITE.GetStaffFavorites.key],
        enabled: true,
    })
}

export function useToggleStaffFavorite() {
    const qc = useQueryClient()
    return useServerMutation<boolean, { staffId: number }>({
        endpoint: API_ENDPOINTS.STAFF_FAVORITE.ToggleStaffFavorite.endpoint,
        method: API_ENDPOINTS.STAFF_FAVORITE.ToggleStaffFavorite.methods[0],
        mutationKey: [API_ENDPOINTS.STAFF_FAVORITE.ToggleStaffFavorite.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.STAFF_FAVORITE.GetStaffFavorites.key] })
        },
    })
}

export function useGetStudioFavorites() {
    return useServerQuery<number[]>({
        endpoint: API_ENDPOINTS.STUDIO_FAVORITE.GetStudioFavorites.endpoint,
        method: API_ENDPOINTS.STUDIO_FAVORITE.GetStudioFavorites.methods[0],
        queryKey: [API_ENDPOINTS.STUDIO_FAVORITE.GetStudioFavorites.key],
        enabled: true,
    })
}

export function useToggleStudioFavorite() {
    const qc = useQueryClient()
    return useServerMutation<boolean, { studioId: number }>({
        endpoint: API_ENDPOINTS.STUDIO_FAVORITE.ToggleStudioFavorite.endpoint,
        method: API_ENDPOINTS.STUDIO_FAVORITE.ToggleStudioFavorite.methods[0],
        mutationKey: [API_ENDPOINTS.STUDIO_FAVORITE.ToggleStudioFavorite.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.STUDIO_FAVORITE.GetStudioFavorites.key] })
        },
    })
}
