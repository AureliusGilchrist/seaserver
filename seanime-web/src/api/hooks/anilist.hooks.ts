import { buildSeaQuery, useServerMutation, useServerQuery } from "@/api/client/requests"
import { serverAuthTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useAtomValue } from "jotai/react"
import {
    AddAnimeToPlanning_Variables,
    AnilistListAnime_Variables,
    AnilistListRecentAiringAnime_Variables,
    DeleteAnilistListEntry_Variables,
    EditAnilistListEntry_Variables,
} from "@/api/generated/endpoint.types"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import {
    AL_AnimeCollection,
    AL_AnimeDetailsById_Media,
    AL_BaseAnime,
    AL_ListAnime,
    AL_ListRecentAnime,
    AL_Stats,
    AL_StudioDetails,
    AL_StaffDetails,
    AddToPlanningResponse,
    Nullish,
} from "@/api/generated/types"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

export function useGetAnimeCollection() {
    return useServerQuery<AL_AnimeCollection>({
        endpoint: API_ENDPOINTS.ANILIST.GetAnimeCollection.endpoint,
        method: API_ENDPOINTS.ANILIST.GetAnimeCollection.methods[0],
        queryKey: [API_ENDPOINTS.ANILIST.GetAnimeCollection.key],
        enabled: true,
    })
}

export function useGetRawAnimeCollection() {
    return useServerQuery<AL_AnimeCollection>({
        endpoint: API_ENDPOINTS.ANILIST.GetRawAnimeCollection.endpoint,
        method: API_ENDPOINTS.ANILIST.GetRawAnimeCollection.methods[0],
        queryKey: [API_ENDPOINTS.ANILIST.GetRawAnimeCollection.key],
        enabled: true,
    })
}

export function useRefreshAnimeCollection() {
    const queryClient = useQueryClient()

    return useServerMutation<AL_AnimeCollection>({
        endpoint: API_ENDPOINTS.ANILIST.GetAnimeCollection.endpoint,
        method: API_ENDPOINTS.ANILIST.GetAnimeCollection.methods[1],
        mutationKey: [API_ENDPOINTS.ANILIST.GetAnimeCollection.key],
        onSuccess: async () => {
            toast.success("AniList is up-to-date")
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.key] })
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANILIST.GetAnimeCollection.key] })
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANILIST.GetRawAnimeCollection.key] })
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetMissingEpisodes.key] })
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.MANGA.GetMangaCollection.key] })
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key] })
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.MANGA.GetMangaEntry.key] })
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetAnimeCollectionSchedule.key] })
        },
    })
}

/**
 * Adds an anime to the user's OWN AniList planning list (not the shared planning account).
 * If AniList is unreachable the change is queued server-side and replayed automatically.
 */
export function useAddAnimeToPlanning(mediaId: Nullish<string | number>) {
    const queryClient = useQueryClient()

    return useServerMutation<AddToPlanningResponse, AddAnimeToPlanning_Variables>({
        endpoint: API_ENDPOINTS.ANILIST_PLANNING.AddAnimeToPlanning.endpoint,
        method: API_ENDPOINTS.ANILIST_PLANNING.AddAnimeToPlanning.methods[0],
        mutationKey: [API_ENDPOINTS.ANILIST_PLANNING.AddAnimeToPlanning.key, String(mediaId)],
        onSuccess: async (data) => {
            if (data?.queued) {
                toast.info("AniList is unreachable — queued, it'll sync automatically")
            } else {
                toast.success("Added to planning")
            }
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANILIST.GetAnimeCollection.key] })
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANILIST.GetRawAnimeCollection.key] })
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.key] })
        },
    })
}

export function useEditAnilistListEntry(id: Nullish<string | number>, type: "anime" | "manga") {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, EditAnilistListEntry_Variables>({
        endpoint: API_ENDPOINTS.ANILIST.EditAnilistListEntry.endpoint,
        method: API_ENDPOINTS.ANILIST.EditAnilistListEntry.methods[0],
        mutationKey: [API_ENDPOINTS.ANILIST.EditAnilistListEntry.key, String(id)],
        onSuccess: async () => {
            toast.success("Entry updated")
            if (type === "anime") {
                await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key, String(id)] })
                await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.key] })
                await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANILIST.GetAnimeCollection.key] })
                await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANILIST.GetRawAnimeCollection.key] })
            } else if (type === "manga") {
                await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.MANGA.GetMangaEntry.key, String(id)] })
                await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.MANGA.GetAnilistMangaCollection.key] })
                await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.MANGA.GetMangaCollection.key] })
            }
        },
    })
}

export function useGetAnilistAnimeDetails(id: Nullish<number | string>) {
    return useServerQuery<AL_AnimeDetailsById_Media>({
        endpoint: API_ENDPOINTS.ANILIST.GetAnilistAnimeDetails.endpoint.replace("{id}", String(id)),
        method: API_ENDPOINTS.ANILIST.GetAnilistAnimeDetails.methods[0],
        queryKey: [API_ENDPOINTS.ANILIST.GetAnilistAnimeDetails.key, String(id)],
        enabled: !!id,
        // This is where the relations and recommendations on a details page come from, and the one
        // request most likely to be turned away: while a graph walk is running, AniList's budget is
        // spent and the server answers "ask again shortly" rather than queueing forever. Without a
        // retry that refusal is permanent — the section renders its error state and stays there
        // until the whole library is refreshed by hand, which is a hard way to find out the answer
        // was available two seconds later.
        //
        // Three tries, backing off to a few seconds, which comfortably outlasts the burst that
        // caused it. A genuine failure still surfaces, just a little later.
        retry: 3,
        retryDelay: attempt => Math.min(1000 * 2 ** attempt, 8000),
    })
}

export function useDeleteAnilistListEntry(id: Nullish<string | number>, type: "anime" | "manga", onSuccess: () => void) {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, DeleteAnilistListEntry_Variables>({
        endpoint: API_ENDPOINTS.ANILIST.DeleteAnilistListEntry.endpoint,
        method: API_ENDPOINTS.ANILIST.DeleteAnilistListEntry.methods[0],
        mutationKey: [API_ENDPOINTS.ANILIST.DeleteAnilistListEntry.key],
        onSuccess: async () => {
            toast.success("Entry deleted")
            if (type === "anime") {
                await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key, String(id)] })
                await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.key] })
                await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANILIST.GetAnimeCollection.key] })
                await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANILIST.GetRawAnimeCollection.key] })
            } else if (type === "manga") {
                await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.MANGA.GetMangaEntry.key, String(id)] })
                await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.MANGA.GetAnilistMangaCollection.key] })
                await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.MANGA.GetMangaCollection.key] })
            }
            onSuccess()
        },
    })
}

export function useAnilistListAnime(variables: AnilistListAnime_Variables, enabled: boolean) {
    return useServerQuery<AL_ListAnime, AnilistListAnime_Variables>({
        endpoint: API_ENDPOINTS.ANILIST.AnilistListAnime.endpoint,
        method: API_ENDPOINTS.ANILIST.AnilistListAnime.methods[0],
        queryKey: [API_ENDPOINTS.ANILIST.AnilistListAnime.key, variables],
        data: variables,
        enabled: enabled ?? true,
    })
}

export function useAnilistListRecentAiringAnime(
    variables: AnilistListRecentAiringAnime_Variables,
    enabled: boolean = true,
    muteCacheMiss: boolean = false,
) {
    return useServerQuery<AL_ListRecentAnime, AnilistListRecentAiringAnime_Variables>({
        endpoint: API_ENDPOINTS.ANILIST.AnilistListRecentAiringAnime.endpoint,
        method: API_ENDPOINTS.ANILIST.AnilistListRecentAiringAnime.methods[0],
        queryKey: [API_ENDPOINTS.ANILIST.AnilistListRecentAiringAnime.key, JSON.stringify(variables)],
        data: variables,
        enabled: enabled,
        muteCacheMiss,
    })
}

export function useGetAnilistStudioDetails(id: number) {
    return useServerQuery<AL_StudioDetails>({
        endpoint: API_ENDPOINTS.ANILIST.GetAnilistStudioDetails.endpoint.replace("{id}", String(id)),
        method: API_ENDPOINTS.ANILIST.GetAnilistStudioDetails.methods[0],
        queryKey: [API_ENDPOINTS.ANILIST.GetAnilistStudioDetails.key, String(id)],
        enabled: true,
        staleTime: 30 * 60 * 1000,  // 30 minutes — studio data rarely changes
        gcTime: 60 * 60 * 1000,     // 1 hour in cache after unmount
    })
}

export function useGetAnilistStaffDetails(id: number) {
    return useServerQuery<AL_StaffDetails>({
        endpoint: API_ENDPOINTS.ANILIST.GetAnilistStaffDetails.endpoint.replace("{id}", String(id)),
        method: API_ENDPOINTS.ANILIST.GetAnilistStaffDetails.methods[0],
        queryKey: [API_ENDPOINTS.ANILIST.GetAnilistStaffDetails.key, String(id)],
        enabled: true,
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
    })
}

export type CharacterDate = { year?: number | null, month?: number | null, day?: number | null }
export type CharacterVoiceActor = {
    id: number
    name?: { full?: string, native?: string }
    image?: { large?: string, medium?: string }
    languageV2?: string
}
export type CharacterMediaNode = {
    id: number
    idMal?: number | null
    siteUrl?: string
    status?: string
    season?: string
    seasonYear?: number | null
    type?: "ANIME" | "MANGA"
    format?: string
    bannerImage?: string
    episodes?: number | null
    chapters?: number | null
    volumes?: number | null
    synonyms?: string[]
    isAdult?: boolean
    countryOfOrigin?: string
    meanScore?: number | null
    averageScore?: number | null
    popularity?: number | null
    description?: string
    genres?: string[]
    title?: { userPreferred?: string, romaji?: string, english?: string, native?: string }
    coverImage?: { extraLarge?: string, large?: string, medium?: string, color?: string }
    startDate?: CharacterDate
    endDate?: CharacterDate
}
export type CharacterDetails = {
    id: number
    name?: {
        first?: string, middle?: string, last?: string, full?: string, native?: string, userPreferred?: string
        alternative?: string[], alternativeSpoiler?: string[]
    }
    image?: { large?: string, medium?: string }
    description?: string
    gender?: string
    age?: string
    bloodType?: string
    siteUrl?: string
    dateOfBirth?: CharacterDate
    favourites?: number
    media?: {
        edges?: {
            characterRole?: "MAIN" | "SUPPORTING" | "BACKGROUND"
            voiceActors?: CharacterVoiceActor[]
            voiceActorRoles?: { roleNotes?: string, dubGroup?: string, voiceActor?: CharacterVoiceActor }[]
            node?: CharacterMediaNode
        }[]
    }
}

export function useGetAnilistCharacterDetails(id: number) {
    return useServerQuery<CharacterDetails>({
        endpoint: API_ENDPOINTS.CHARACTER.GetAnilistCharacterDetails.endpoint.replace("{id}", String(id)),
        method: API_ENDPOINTS.CHARACTER.GetAnilistCharacterDetails.methods[0],
        queryKey: [API_ENDPOINTS.CHARACTER.GetAnilistCharacterDetails.key, String(id)],
        enabled: id > 0,
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
    })
}

export function useGetAniListStats(enabled: boolean = true) {
    return useServerQuery<AL_Stats>({
        endpoint: API_ENDPOINTS.ANILIST.GetAniListStats.endpoint,
        method: API_ENDPOINTS.ANILIST.GetAniListStats.methods[0],
        queryKey: [API_ENDPOINTS.ANILIST.GetAniListStats.key],
        enabled: enabled,
    })
}

export function useGetAnilistCacheLayerStatus() {
    return useServerQuery<boolean>({
        endpoint: API_ENDPOINTS.ANILIST.GetAnilistCacheLayerStatus.endpoint,
        method: API_ENDPOINTS.ANILIST.GetAnilistCacheLayerStatus.methods[0],
        queryKey: [API_ENDPOINTS.ANILIST.GetAnilistCacheLayerStatus.key],
        gcTime: 0,
        enabled: true,
    })
}

export function useToggleAnilistCacheLayerStatus() {
    const queryClient = useQueryClient()
    return useServerMutation<boolean>({
        endpoint: API_ENDPOINTS.ANILIST.ToggleAnilistCacheLayerStatus.endpoint,
        method: API_ENDPOINTS.ANILIST.ToggleAnilistCacheLayerStatus.methods[0],
        mutationKey: [API_ENDPOINTS.ANILIST.ToggleAnilistCacheLayerStatus.key],
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANILIST.GetAnilistCacheLayerStatus.key] })
        },
    })
}

export type MediaCharacterEdge = {
    role?: "MAIN" | "SUPPORTING" | "BACKGROUND"
    node?: {
        id: number
        name?: { full?: string, native?: string, userPreferred?: string }
        image?: { large?: string, medium?: string }
        age?: string
        gender?: string
        favourites?: number
        isFavourite?: boolean
    }
    voiceActors?: CharacterVoiceActor[]
}
export type MediaCharactersPage = { total: number, hasNextPage: boolean, page: number, edges: MediaCharacterEdge[] }

/** Every character of an anime or manga, a page of 25 at a time (main roles first). */
export function useGetMediaCharacters(mediaId: number | null | undefined, enabled = true) {
    const password = useAtomValue(serverAuthTokenAtom)
    return useInfiniteQuery({
        queryKey: ["ANILIST-get-media-characters", mediaId],
        initialPageParam: 1,
        enabled: !!mediaId && enabled,
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        queryFn: async ({ pageParam }) => {
            return buildSeaQuery<MediaCharactersPage>({
                endpoint: `/api/v1/anilist/media-characters/${mediaId}`,
                method: "GET",
                params: { page: pageParam },
                password: password,
            })
        },
        getNextPageParam: (lastPage) => lastPage?.hasNextPage ? lastPage.page + 1 : undefined,
    })
}
