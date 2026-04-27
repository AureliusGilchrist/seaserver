import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { useQueryClient } from "@tanstack/react-query"
import React from "react"

const STORAGE_KEY = "anime_favorites"
const MIGRATED_KEY = "anime_favorites_migrated"

function loadLocalFavorites(): number[] {
    if (typeof window === "undefined") return []
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw) as unknown
        if (!Array.isArray(parsed)) return []
        return parsed.filter((n): n is number => typeof n === "number")
    } catch {
        return []
    }
}

export function useAnimeFavorites() {
    const qc = useQueryClient()
    const queryKey = [API_ENDPOINTS.ANIME_FAVORITE.GetAnimeFavorites.key]

    const { data: favorites = [], isLoading } = useServerQuery<number[]>({
        endpoint: API_ENDPOINTS.ANIME_FAVORITE.GetAnimeFavorites.endpoint,
        method: API_ENDPOINTS.ANIME_FAVORITE.GetAnimeFavorites.methods[0],
        queryKey,
    })

    const { mutate: toggleMutate } = useServerMutation<boolean, { mediaId: number }>({
        endpoint: API_ENDPOINTS.ANIME_FAVORITE.ToggleAnimeFavorite.endpoint,
        method: API_ENDPOINTS.ANIME_FAVORITE.ToggleAnimeFavorite.methods[0],
        mutationKey: [API_ENDPOINTS.ANIME_FAVORITE.ToggleAnimeFavorite.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey })
        },
    })

    const { mutate: bulkAddMutate } = useServerMutation<boolean, { mediaIds: number[] }>({
        endpoint: API_ENDPOINTS.ANIME_FAVORITE.BulkAddAnimeFavorites.endpoint,
        method: API_ENDPOINTS.ANIME_FAVORITE.BulkAddAnimeFavorites.methods[0],
        mutationKey: [API_ENDPOINTS.ANIME_FAVORITE.BulkAddAnimeFavorites.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey })
        },
    })

    // Auto-migrate from localStorage on first load
    React.useEffect(() => {
        if (isLoading) return
        if (typeof window === "undefined") return

        const alreadyMigrated = localStorage.getItem(MIGRATED_KEY)
        if (alreadyMigrated) return

        const localFavs = loadLocalFavorites()
        if (localFavs.length > 0) {
            bulkAddMutate({ mediaIds: localFavs }, {
                onSuccess: () => {
                    localStorage.removeItem(STORAGE_KEY)
                    localStorage.setItem(MIGRATED_KEY, "1")
                },
            })
        } else {
            localStorage.setItem(MIGRATED_KEY, "1")
        }
    }, [isLoading])

    const isFavorite = React.useCallback((id?: number | string | null) => {
        if (id == null) return false
        return favorites.includes(Number(id))
    }, [favorites])

    const toggleFavorite = React.useCallback((id?: number | string | null) => {
        if (id == null) return
        toggleMutate({ mediaId: Number(id) })
    }, [toggleMutate])

    return { favorites, isFavorite, toggleFavorite, isLoading }
}
