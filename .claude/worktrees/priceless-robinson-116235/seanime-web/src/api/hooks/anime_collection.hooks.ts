import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { AddUnknownMedia_Variables } from "@/api/generated/endpoint.types"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { AL_AnimeCollection, Anime_LibraryCollection, Anime_ScheduleItem } from "@/api/generated/types"
import { useRefreshAnimeCollection } from "@/api/hooks/anilist.hooks"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

export function useGetLibraryCollection({ enabled, refetchInterval, staleTime, refetchOnWindowFocus }: {
    enabled?: boolean
    refetchInterval?: number
    staleTime?: number
    refetchOnWindowFocus?: boolean | "always"
} = { enabled: true }) {
    return useServerQuery<Anime_LibraryCollection>({
        endpoint: API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.endpoint,
        method: API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.methods[0],
        queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.key],
        enabled: enabled,
        refetchInterval,
        staleTime,
        refetchOnWindowFocus,
    })
}

export function useGetLightLibraryCollection({ enabled }: { enabled?: boolean } = { enabled: true }) {
    return useServerQuery<Anime_LibraryCollection>({
        endpoint: API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.endpoint,
        method: API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.methods[0],
        queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.key, "light"],
        params: { light: "true" },
        enabled: enabled,
        staleTime: 60_000,
    })
}

export function useAddUnknownMedia() {
    const queryClient = useQueryClient()
    const { mutate } = useRefreshAnimeCollection()

    return useServerMutation<AL_AnimeCollection, AddUnknownMedia_Variables>({
        endpoint: API_ENDPOINTS.ANIME_COLLECTION.AddUnknownMedia.endpoint,
        method: API_ENDPOINTS.ANIME_COLLECTION.AddUnknownMedia.methods[0],
        mutationKey: [API_ENDPOINTS.ANIME_COLLECTION.AddUnknownMedia.key],
        onSuccess: async () => {
            toast.success("Media added successfully")
            mutate(undefined, {
                onSuccess: () => {
                    queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.LIBRARY_EXPLORER.GetLibraryExplorerFileTree.key] })
                },
            })
        },
    })
}

export function useGetAnimeCollectionSchedule({ enabled }: { enabled?: boolean } = { enabled: true }) {
    return useServerQuery<Array<Anime_ScheduleItem>>({
        endpoint: API_ENDPOINTS.ANIME_COLLECTION.GetAnimeCollectionSchedule.endpoint,
        method: API_ENDPOINTS.ANIME_COLLECTION.GetAnimeCollectionSchedule.methods[0],
        queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetAnimeCollectionSchedule.key],
        enabled: enabled,
    })
}

// Anime metadata hydration

export type AnimeHydrationDetail = {
    timestamp: string
    mediaId: number
    title: string
    action: string
    message?: string
}

export type AnimeHydrationStatus = {
    isRunning: boolean
    cancelRequested: boolean
    wasCancelled: boolean
    total: number
    processed: number
    hydrated: number
    skipped: number
    failed: number
    progress: number
    startedAt?: string
    finishedAt?: string
    lastUpdatedAt?: string
    details: AnimeHydrationDetail[]
}

export function useHydrateAllAnime() {
    const queryClient = useQueryClient()

    return useServerMutation<boolean>({
        endpoint: "/api/v1/library/hydrate-all",
        method: "POST",
        mutationKey: ["ANIME-hydrate-all"],
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["ANIME-hydrate-all-status"] })
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.key] })
            toast.success("Anime hydration started")
        },
    })
}

export function useCancelAnimeHydration() {
    const queryClient = useQueryClient()

    return useServerMutation<boolean>({
        endpoint: "/api/v1/library/hydrate-all/cancel",
        method: "POST",
        mutationKey: ["ANIME-hydrate-all-cancel"],
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["ANIME-hydrate-all-status"] })
            toast.success("Hydration cancellation requested")
        },
    })
}

export function useGetAnimeHydrationStatus() {
    return useServerQuery<AnimeHydrationStatus>({
        endpoint: "/api/v1/library/hydrate-all/status",
        method: "GET",
        queryKey: ["ANIME-hydrate-all-status"],
        refetchInterval: query => query.state.data?.isRunning ? 1200 : 5000,
        enabled: true,
        muteError: true,
    })
}
