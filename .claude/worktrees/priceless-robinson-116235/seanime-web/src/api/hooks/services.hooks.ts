import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

export type GojuuonSortEntry = {
    mediaId: number
    groupKey: string
    groupRomajiTitle: string
    chronologicalOrder: number
}

export function useRunUpdateAnimeLibrary() {
    return useServerMutation<boolean>({
        endpoint: API_ENDPOINTS.SERVICES.RunUpdateAnimeLibrary.endpoint,
        method: API_ENDPOINTS.SERVICES.RunUpdateAnimeLibrary.methods[0],
        mutationKey: [API_ENDPOINTS.SERVICES.RunUpdateAnimeLibrary.key],
        onSuccess: async () => {
            toast.success("Anime library updated")
        },
    })
}

export function useRunUpdateMangaLibrary() {
    return useServerMutation<boolean>({
        endpoint: API_ENDPOINTS.SERVICES.RunUpdateMangaLibrary.endpoint,
        method: API_ENDPOINTS.SERVICES.RunUpdateMangaLibrary.methods[0],
        mutationKey: [API_ENDPOINTS.SERVICES.RunUpdateMangaLibrary.key],
        onSuccess: async () => {
            toast.success("Manga library updated")
        },
    })
}

export function useRunScanAnimeLibrary() {
    return useServerMutation<boolean>({
        endpoint: API_ENDPOINTS.SERVICES.RunScanAnimeLibrary.endpoint,
        method: API_ENDPOINTS.SERVICES.RunScanAnimeLibrary.methods[0],
        mutationKey: [API_ENDPOINTS.SERVICES.RunScanAnimeLibrary.key],
        onSuccess: async () => {
            toast.success("Anime library scan triggered")
        },
    })
}

export function useRunScanMangaLibrary() {
    return useServerMutation<boolean>({
        endpoint: API_ENDPOINTS.SERVICES.RunScanMangaLibrary.endpoint,
        method: API_ENDPOINTS.SERVICES.RunScanMangaLibrary.methods[0],
        mutationKey: [API_ENDPOINTS.SERVICES.RunScanMangaLibrary.key],
        onSuccess: async () => {
            toast.success("Manga library scan triggered")
        },
    })
}

export function useRunFindAnimeLibrarySorting() {
    const queryClient = useQueryClient()
    return useServerMutation<Record<number, GojuuonSortEntry>>({
        endpoint: API_ENDPOINTS.SERVICES.RunFindAnimeLibrarySorting.endpoint,
        method: API_ENDPOINTS.SERVICES.RunFindAnimeLibrarySorting.methods[0],
        mutationKey: [API_ENDPOINTS.SERVICES.RunFindAnimeLibrarySorting.key],
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.SERVICES.GetAnimeGojuuonMap.key] })
            toast.success("Anime library sorting computed")
        },
    })
}

export function useRunFindMangaLibrarySorting() {
    const queryClient = useQueryClient()
    return useServerMutation<Record<number, GojuuonSortEntry>>({
        endpoint: API_ENDPOINTS.SERVICES.RunFindMangaLibrarySorting.endpoint,
        method: API_ENDPOINTS.SERVICES.RunFindMangaLibrarySorting.methods[0],
        mutationKey: [API_ENDPOINTS.SERVICES.RunFindMangaLibrarySorting.key],
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.SERVICES.GetMangaGojuuonMap.key] })
            toast.success("Manga library sorting computed")
        },
    })
}

export function useGetAnimeGojuuonMap(enabled: boolean = true) {
    return useServerQuery<Record<number, GojuuonSortEntry>>({
        endpoint: API_ENDPOINTS.SERVICES.GetAnimeGojuuonMap.endpoint,
        method: API_ENDPOINTS.SERVICES.GetAnimeGojuuonMap.methods[0],
        queryKey: [API_ENDPOINTS.SERVICES.GetAnimeGojuuonMap.key],
        enabled,
    })
}

export function useGetMangaGojuuonMap(enabled: boolean = true) {
    return useServerQuery<Record<number, GojuuonSortEntry>>({
        endpoint: API_ENDPOINTS.SERVICES.GetMangaGojuuonMap.endpoint,
        method: API_ENDPOINTS.SERVICES.GetMangaGojuuonMap.methods[0],
        queryKey: [API_ENDPOINTS.SERVICES.GetMangaGojuuonMap.key],
        enabled,
    })
}
