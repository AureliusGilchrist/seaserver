import { buildSeaQuery, useServerMutation, useServerQuery } from "@/api/client/requests"
import { serverAuthTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useInfiniteQuery } from "@tanstack/react-query"
import { AnilistSaveState, anilistSaveStateAtom } from "@/app/(main)/_atoms/anilist-sync.atoms"
import { useAtomValue, useSetAtom } from "jotai/react"
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

type EditListEntryResult = boolean | { queued?: boolean }
type EditListEntryContext = { previous?: unknown, key: unknown[] }

function fuzzyToString(d: EditAnilistListEntry_Variables["startedAt"]): string | undefined {
    if (!d?.year) return undefined
    const pad = (n?: number) => String(n || 1).padStart(2, "0")
    return `${d.year}-${pad(d.month)}-${pad(d.day)}`
}

/**
 * Saves a list entry.
 *
 * The page shows the new values the moment Save is pressed (the cached entry is patched here, and
 * the server writes the same edit into its cached collection before asking AniList), so nothing
 * waits on AniList. The server gives AniList a few seconds and queues the edit if it isn't
 * accepted by then; the refetches that follow run in the background. Save used to stay pending
 * until four full refetches had finished one after another, behind whatever AniList was doing —
 * the button and the list status spun with the edit long since done.
 */
export function useEditAnilistListEntry(id: Nullish<string | number>, type: "anime" | "manga") {
    const queryClient = useQueryClient()
    const setSaveState = useSetAtom(anilistSaveStateAtom)

    const setState = (mediaId: number | undefined, state: AnilistSaveState | null) => mediaId && setSaveState(prev => {
        const next = { ...prev }
        if (state) next[mediaId] = state
        else delete next[mediaId]
        return next
    })

    return useServerMutation<EditListEntryResult, EditAnilistListEntry_Variables, EditListEntryContext>({
        endpoint: API_ENDPOINTS.ANILIST.EditAnilistListEntry.endpoint,
        method: API_ENDPOINTS.ANILIST.EditAnilistListEntry.methods[0],
        mutationKey: [API_ENDPOINTS.ANILIST.EditAnilistListEntry.key, String(id)],
        // The server answers within ~10s by design; past this something is stuck.
        timeout: 30_000,
        onMutate: async (variables) => {
            const key = type === "anime"
                ? [API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key, String(variables.mediaId)]
                : [API_ENDPOINTS.MANGA.GetMangaEntry.key, String(variables.mediaId)]
            await queryClient.cancelQueries({ queryKey: key })
            const previous = queryClient.getQueryData(key)
            queryClient.setQueryData(key, (old: any) => {
                if (!old) return old
                return {
                    ...old,
                    listData: {
                        ...(old.listData ?? {}),
                        status: variables.status ?? old.listData?.status,
                        score: variables.score ?? old.listData?.score,
                        progress: variables.progress ?? old.listData?.progress,
                        startedAt: fuzzyToString(variables.startedAt) ?? old.listData?.startedAt,
                        completedAt: fuzzyToString(variables.completedAt) ?? old.listData?.completedAt,
                    },
                }
            })
            setState(variables.mediaId, "saving")
            return { previous, key }
        },
        onError: (error, variables, context) => {
            if (context?.key) queryClient.setQueryData(context.key, context.previous)
            setState(variables.mediaId, null)
            toast.error("AniList didn't take that change", { description: error?.response?.data?.error || error?.message })
        },
        onSuccess: (data, variables) => {
            const queued = typeof data === "object" && !!data?.queued
            if (queued) {
                toast.info("Saved — AniList is busy, it'll sync in the background")
                setState(variables.mediaId, "queued")
                void queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANILIST.GetAnilistEditQueue.key] })
            } else {
                toast.success("Entry updated")
                setState(variables.mediaId, "done")
                const mediaId = variables.mediaId
                if (mediaId) setTimeout(() => setSaveState(prev => {
                    if (prev[mediaId] !== "done") return prev
                    const next = { ...prev }
                    delete next[mediaId]
                    return next
                }), 1800)
            }
            // Not awaited: the page already shows the edit, and these are only catching up.
            if (type === "anime") {
                void queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key, String(id)] })
                void queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.key] })
                void queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANILIST.GetAnimeCollection.key] })
                void queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANILIST.GetRawAnimeCollection.key] })
            } else if (type === "manga") {
                void queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.MANGA.GetMangaEntry.key, String(id)] })
                void queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.MANGA.GetAnilistMangaCollection.key] })
                void queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.MANGA.GetMangaCollection.key] })
            }
        },
    })
}

export type AnilistQueuedListEdit = {
    profileId: number
    mediaId: number
    type: string
    title?: string
    queuedAt: string
    attempts: number
    lastError?: string
    nextAttempt: string
}

/** List edits the server is still sending to AniList. Kept current by a websocket event. */
export function useGetAnilistEditQueue() {
    return useServerQuery<AnilistQueuedListEdit[]>({
        endpoint: API_ENDPOINTS.ANILIST.GetAnilistEditQueue.endpoint,
        method: API_ENDPOINTS.ANILIST.GetAnilistEditQueue.methods[0],
        queryKey: [API_ENDPOINTS.ANILIST.GetAnilistEditQueue.key],
        refetchInterval: 60_000,
        muteError: true,
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

export type MediaFuzzyDate = { year?: number, month?: number, day?: number }

/** One media in a franchise, as seen from the media being viewed. */
export type MediaFamilyMember = {
    id: number
    type: "ANIME" | "MANGA"
    format?: string
    status?: string
    title?: { userPreferred?: string, romaji?: string, english?: string, native?: string }
    coverImage?: { extraLarge?: string, large?: string, medium?: string, color?: string }
    bannerImage?: string
    startDate?: MediaFuzzyDate
    season?: string
    seasonYear?: number
    episodes?: number
    chapters?: number
    meanScore?: number
    isAdult?: boolean
    /** How the viewed media relates to this one: SEQUEL, SIDE_STORY… or CURRENT for itself. */
    relation: string
    /** Listed among the viewed media's own relations (rather than found further along). */
    direct: boolean
    depth: number
}

export type MediaFamily = { members: MediaFamilyMember[], truncated: boolean }

/** The whole franchise of a media (every season, film, spin-off, source…), oldest first. */
export function useGetMediaFamily(id: Nullish<number | string>) {
    return useServerQuery<MediaFamily>({
        endpoint: API_ENDPOINTS.ANILIST.GetMediaFamily.endpoint.replace("{id}", String(id)),
        method: API_ENDPOINTS.ANILIST.GetMediaFamily.methods[0],
        queryKey: [API_ENDPOINTS.ANILIST.GetMediaFamily.key, String(id)],
        enabled: !!id && Number(id) > 0,
        staleTime: 1000 * 60 * 60,
        retry: 3,
        retryDelay: attempt => Math.min(2000 * 2 ** attempt, 15000),
        muteError: true,
    })
}

/** The details-page metadata the base queries don't carry. */
export type MediaInfo = {
    id: number
    idMal?: number
    type?: "ANIME" | "MANGA"
    format?: string
    status?: string
    source?: string
    favourites?: number
    hashtag?: string
    trending?: number
    popularity?: number
    averageScore?: number
    meanScore?: number
    episodes?: number
    duration?: number
    chapters?: number
    volumes?: number
    countryOfOrigin?: string
    isAdult?: boolean
    isLicensed?: boolean
    synonyms?: string[]
    season?: string
    seasonYear?: number
    siteUrl?: string
    startDate?: MediaFuzzyDate
    endDate?: MediaFuzzyDate
    externalLinks?: { id: number, site: string, url?: string, type?: "INFO" | "STREAMING" | "SOCIAL", icon?: string, color?: string, language?: string }[]
    studios?: { edges?: { isMain: boolean, node?: { id: number, name: string, isAnimationStudio?: boolean, siteUrl?: string } }[] }
    staff?: { edges?: { role?: string, node?: { id: number, name?: { full?: string, native?: string }, image?: { medium?: string }, siteUrl?: string } }[] }
    rankings?: { id: number, rank: number, type: "RATED" | "POPULAR", allTime?: boolean, season?: string, year?: number, context: string, format?: string }[]
    tags?: { id: number, name: string, rank?: number, category?: string, isMediaSpoiler?: boolean, isGeneralSpoiler?: boolean }[]
    trailer?: { id?: string, site?: string, thumbnail?: string }
    nextAiringEpisode?: { episode: number, airingAt: number, timeUntilAiring: number }
    stats?: {
        statusDistribution?: { status: string, amount: number }[]
        scoreDistribution?: { score: number, amount: number }[]
    }
}

export function useGetMediaInfo(id: Nullish<number | string>) {
    return useServerQuery<MediaInfo>({
        endpoint: API_ENDPOINTS.ANILIST.GetMediaInfo.endpoint.replace("{id}", String(id)),
        method: API_ENDPOINTS.ANILIST.GetMediaInfo.methods[0],
        queryKey: [API_ENDPOINTS.ANILIST.GetMediaInfo.key, String(id)],
        enabled: !!id && Number(id) > 0,
        staleTime: 1000 * 60 * 30,
        retry: 2,
        retryDelay: attempt => Math.min(2000 * 2 ** attempt, 8000),
        muteError: true,
    })
}

export type StudioWork = {
    id: number
    idMal?: number
    format?: string
    status?: string
    episodes?: number
    duration?: number
    season?: string
    seasonYear?: number
    startDate?: MediaFuzzyDate
    title?: { userPreferred?: string, romaji?: string, english?: string, native?: string }
    coverImage?: { extraLarge?: string, large?: string, medium?: string, color?: string }
    bannerImage?: string
    meanScore?: number
    popularity?: number
    favourites?: number
    genres?: string[]
    isAdult?: boolean
    isMainStudio: boolean
    directors?: number[]
}

export type StudioPerson = { id: number, name: string, native?: string, image?: string, role: string, works: number[] }
export type StudioCount = { key: string, count: number }

export type StudioProfile = {
    id: number
    name: string
    isAnimationStudio: boolean
    siteUrl?: string
    favourites: number
    totalWorks: number
    works: StudioWork[]
    directors: StudioPerson[]
    stats: {
        mainCount: number
        supportingCount: number
        firstYear?: number
        lastYear?: number
        meanScore?: number
        totalEpisodes: number
        totalMinutes: number
        totalPopularity: number
        totalFavourites: number
        airing: number
        upcoming: number
        formats: StudioCount[]
        genres: StudioCount[]
        years: StudioCount[]
    }
}

/** A studio's filmography, directors and statistics, for the studio page. */
export function useGetStudioProfile(id: Nullish<number | string>) {
    return useServerQuery<StudioProfile>({
        endpoint: API_ENDPOINTS.ANILIST.GetStudioProfile.endpoint.replace("{id}", String(id)),
        method: API_ENDPOINTS.ANILIST.GetStudioProfile.methods[0],
        queryKey: [API_ENDPOINTS.ANILIST.GetStudioProfile.key, String(id)],
        enabled: !!id && Number(id) > 0,
        staleTime: 1000 * 60 * 30,
        retry: 2,
        retryDelay: attempt => Math.min(3000 * 2 ** attempt, 12000),
        muteError: true,
    })
}

/** The trailer to preview, in the profile's sub or dub (a dub is searched for; AniList's is the fallback). */
export function useGetMediaTrailer(id: Nullish<number>, lang: "sub" | "dub", enabled: boolean) {
    return useServerQuery<{ id: string, dub: boolean }>({
        endpoint: API_ENDPOINTS.ANILIST.GetMediaTrailer.endpoint.replace("{id}", String(id)) + `?lang=${lang}`,
        method: API_ENDPOINTS.ANILIST.GetMediaTrailer.methods[0],
        queryKey: [API_ENDPOINTS.ANILIST.GetMediaTrailer.key, String(id), lang],
        enabled: enabled && !!id && id > 0,
        staleTime: 1000 * 60 * 60 * 24,
        muteError: true,
    })
}
