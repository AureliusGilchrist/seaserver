import { useServerMutation, useServerQuery } from "@/api/client/requests"
import {
    AnimeEntryBulkAction_Variables,
    AnimeEntryManualMatch_Variables,
    FetchAnimeEntrySuggestions_Variables,
    OpenAnimeEntryInExplorer_Variables,
    ResetAnimeEntryMetadata_Variables,
    ToggleAnimeEntrySilenceStatus_Variables,
    UpdateAnimeEntryProgress_Variables,
    UpdateAnimeEntryRepeat_Variables,
} from "@/api/generated/endpoint.types"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { AL_BaseAnime, Anime_Entry, Anime_LocalFile, Anime_MissingEpisodes, Nullish } from "@/api/generated/types"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

export function useGetAnimeEntry(id: Nullish<string | number>) {
    return useServerQuery<Anime_Entry>({
        endpoint: API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.endpoint.replace("{id}", String(id)),
        method: API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.methods[0],
        queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key, String(id)],
        enabled: !!id,
    })
}

export function useAnimeEntryRematch() {
    const queryClient = useQueryClient()

    return useServerMutation<Array<Anime_LocalFile>, { paths: string[]; mediaId: number; useIndexBasedEpisodes?: boolean; episodeOffset?: number }>({
        endpoint: "/api/v1/library/anime-entry/rematch",
        method: "POST",
        mutationKey: ["ANIME-ENTRIES-rematch"],
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.key] }),
                queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key] }),
                queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.LIBRARY_EXPLORER.GetLibraryExplorerFileTree.key] }),
            ])
        },
    })
}

export function useAnimeEntryBulkAction(id?: Nullish<number>, onSuccess?: () => void) {
    const queryClient = useQueryClient()

    return useServerMutation<Array<Anime_LocalFile>, AnimeEntryBulkAction_Variables>({
        endpoint: API_ENDPOINTS.ANIME_ENTRIES.AnimeEntryBulkAction.endpoint,
        method: API_ENDPOINTS.ANIME_ENTRIES.AnimeEntryBulkAction.methods[0],
        mutationKey: [API_ENDPOINTS.ANIME_ENTRIES.AnimeEntryBulkAction.key, String(id)],
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.key] })
            queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key, String(id)] })
            queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.LIBRARY_EXPLORER.GetLibraryExplorerFileTree.key] })
            onSuccess?.()
        },
    })
}

export function useOpenAnimeEntryInExplorer() {
    return useServerMutation<boolean, OpenAnimeEntryInExplorer_Variables>({
        endpoint: API_ENDPOINTS.ANIME_ENTRIES.OpenAnimeEntryInExplorer.endpoint,
        method: API_ENDPOINTS.ANIME_ENTRIES.OpenAnimeEntryInExplorer.methods[0],
        mutationKey: [API_ENDPOINTS.ANIME_ENTRIES.OpenAnimeEntryInExplorer.key],
        onSuccess: async () => {

        },
    })
}

export function useFetchAnimeEntrySuggestions() {
    return useServerMutation<Array<AL_BaseAnime>, FetchAnimeEntrySuggestions_Variables>({
        endpoint: API_ENDPOINTS.ANIME_ENTRIES.FetchAnimeEntrySuggestions.endpoint,
        method: API_ENDPOINTS.ANIME_ENTRIES.FetchAnimeEntrySuggestions.methods[0],
        mutationKey: [API_ENDPOINTS.ANIME_ENTRIES.FetchAnimeEntrySuggestions.key],
        onSuccess: async () => {

        },
    })
}

export function useAnimeEntryManualMatch() {
    const queryClient = useQueryClient()

    return useServerMutation<Array<Anime_LocalFile>, AnimeEntryManualMatch_Variables>({
        endpoint: API_ENDPOINTS.ANIME_ENTRIES.AnimeEntryManualMatch.endpoint,
        method: API_ENDPOINTS.ANIME_ENTRIES.AnimeEntryManualMatch.methods[0],
        mutationKey: [API_ENDPOINTS.ANIME_ENTRIES.AnimeEntryManualMatch.key],
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.key] })
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key] })
            queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.LIBRARY_EXPLORER.GetLibraryExplorerFileTree.key] })
            toast.success("Files matched")
        },
    })
}

export function useGetMissingEpisodes(enabled?: boolean) {
    return useServerQuery<Anime_MissingEpisodes>({
        endpoint: API_ENDPOINTS.ANIME_ENTRIES.GetMissingEpisodes.endpoint,
        method: API_ENDPOINTS.ANIME_ENTRIES.GetMissingEpisodes.methods[0],
        queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetMissingEpisodes.key],
        enabled: enabled ?? true, // Default to true if not provided
    })
}

export function useGetAnimeEntrySilenceStatus(id: Nullish<string | number>) {
    const { data, ...rest } = useServerQuery({
        endpoint: API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntrySilenceStatus.endpoint.replace("{id}", String(id)),
        method: API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntrySilenceStatus.methods[0],
        queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntrySilenceStatus.key],
        enabled: !!id,
    })

    return { isSilenced: !!data, ...rest }
}

export function useToggleAnimeEntrySilenceStatus() {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, ToggleAnimeEntrySilenceStatus_Variables>({
        endpoint: API_ENDPOINTS.ANIME_ENTRIES.ToggleAnimeEntrySilenceStatus.endpoint,
        method: API_ENDPOINTS.ANIME_ENTRIES.ToggleAnimeEntrySilenceStatus.methods[0],
        mutationKey: [API_ENDPOINTS.ANIME_ENTRIES.ToggleAnimeEntrySilenceStatus.key],
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntrySilenceStatus.key] })
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetMissingEpisodes.key] })
        },
    })
}

/**
 * Clears all cached metadata for one anime (episode metadata, AniList media object, filler
 * data) and refetches the entry. Used by the "Reset metadata" action and automatically when
 * an entry fails to load, since stale/poisoned cache entries are the usual cause.
 */
export function useResetAnimeEntryMetadata(mediaId: Nullish<string | number>, showToast: boolean = true) {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, ResetAnimeEntryMetadata_Variables>({
        endpoint: API_ENDPOINTS.ANIME_ENTRIES.ResetAnimeEntryMetadata.endpoint,
        method: API_ENDPOINTS.ANIME_ENTRIES.ResetAnimeEntryMetadata.methods[0],
        mutationKey: [API_ENDPOINTS.ANIME_ENTRIES.ResetAnimeEntryMetadata.key, String(mediaId)],
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key, String(mediaId)] })
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetMissingEpisodes.key] })
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANILIST.GetAnilistAnimeDetails.key, String(mediaId)] })
            if (showToast) toast.success("Metadata reset")
        },
    })
}

/**
 * Deep refresh of one entry: the server drops every cache keyed to the media and refetches the
 * AniList collection, then we throw away the client-side copies so the page rebuilds from it.
 */
export function useRefreshAnimeEntryStats(mediaId: Nullish<string | number>) {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, { mediaId: number }>({
        endpoint: "/api/v1/library/anime-entry/refresh-stats",
        method: "POST",
        mutationKey: ["refresh-anime-entry-stats", String(mediaId)],
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key, String(mediaId)] }),
                queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetMissingEpisodes.key] }),
                queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANILIST.GetAnilistAnimeDetails.key, String(mediaId)] }),
                queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME.GetAnimeEpisodeCollection.key, String(mediaId)] }),
                queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.key] }),
            ])
            toast.success("Library stats refreshed")
        },
    })
}

export function useUpdateAnimeEntryProgress(id: Nullish<string | number>, episodeNumber: number, showToast: boolean = true) {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, UpdateAnimeEntryProgress_Variables>({
        endpoint: API_ENDPOINTS.ANIME_ENTRIES.UpdateAnimeEntryProgress.endpoint,
        method: API_ENDPOINTS.ANIME_ENTRIES.UpdateAnimeEntryProgress.methods[0],
        mutationKey: [API_ENDPOINTS.ANIME_ENTRIES.UpdateAnimeEntryProgress.key, id, episodeNumber],
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANILIST.GetAnimeCollection.key] })
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.key] })
            if (id) {
                await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key, String(id)] })
            }
            if (showToast) {
                toast.success("Progress updated successfully")
            }
        },
    })
}

export function useUpdateAnimeEntryRepeat(id: Nullish<string | number>) {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, UpdateAnimeEntryRepeat_Variables>({
        endpoint: API_ENDPOINTS.ANIME_ENTRIES.UpdateAnimeEntryRepeat.endpoint,
        method: API_ENDPOINTS.ANIME_ENTRIES.UpdateAnimeEntryRepeat.methods[0],
        mutationKey: [API_ENDPOINTS.ANIME_ENTRIES.UpdateAnimeEntryRepeat.key, id],
        onSuccess: async () => {
            // if (id) {
            //     await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key, String(id)] })
            // }
            // toast.success("Updated successfully")
        },
    })
}
