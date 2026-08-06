import { AL_AnimeCollection_MediaListCollection_Lists, AL_AnimeCollection_MediaListCollection_Lists_Entries } from "@/api/generated/types"
import { useGetRawAnimeCollection } from "@/api/hooks/anilist.hooks"
import { useGetRawAnilistMangaCollection } from "@/api/hooks/manga.hooks"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { CollectionParams, CollectionType, DEFAULT_COLLECTION_PARAMS, filterEntriesByTitle, filterListEntries } from "@/lib/helpers/filtering"
import { atomWithImmer } from "jotai-immer"
import { useAtom } from "jotai/react"
import React from "react"
import { useDebounce } from "use-debounce"

export const MYLISTS_DEFAULT_PARAMS: CollectionParams<"anime"> | CollectionParams<"manga"> = {
    ...DEFAULT_COLLECTION_PARAMS,
    sorting: "SCORE_DESC",
    unreadOnly: false,
    continueWatchingOnly: false,
}

export const __myListsSearch_paramsAtom = atomWithImmer<CollectionParams<"anime"> | CollectionParams<"manga">>(MYLISTS_DEFAULT_PARAMS)

export const __myListsSearch_paramsInputAtom = atomWithImmer<CollectionParams<"anime"> | CollectionParams<"manga">>(MYLISTS_DEFAULT_PARAMS)

export const __myLists_selectedTypeAtom = atomWithImmer<"anime" | "manga" | "stats">("anime")

/**
 * Heading of the section holding anime that has been announced but hasn't started airing.
 * Not an AniList list — it's carved out of Planning client-side, so the entries still live in
 * PLANNING on the account and keep behaving like planning entries everywhere else.
 */
export const TO_BE_RELEASED_LIST_NAME = "To Be Released"

/** Whether a list entry is for a series that hasn't started airing. */
function isUnreleasedEntry(entry: AL_AnimeCollection_MediaListCollection_Lists_Entries | undefined): boolean {
    return entry?.media?.status === "NOT_YET_RELEASED"
}

export function useHandleUserAnilistLists(debouncedSearchInput: string, type?: "anime" | "manga") {

    const serverStatus = useServerStatus()
    const [selectedType, setSelectedType] = useAtom(__myLists_selectedTypeAtom)
    const { data: animeData } = useGetRawAnimeCollection()
    const { data: mangaData } = useGetRawAnilistMangaCollection()

    const data = React.useMemo(() => {
        if (type) {
            return type === "anime" ? animeData : mangaData
        }
        return selectedType === "anime" ? animeData : mangaData
    }, [selectedType, animeData, mangaData, type])

    const lists = React.useMemo(() => data?.MediaListCollection?.lists, [data])

    const [params, _setParams] = useAtom(__myListsSearch_paramsAtom)
    const [debouncedParams] = useDebounce(params, 500)

    React.useLayoutEffect(() => {
        if (selectedType === "manga" && !serverStatus?.settings?.library?.enableManga) {
            setSelectedType("anime")
        }
    }, [serverStatus?.settings?.library?.enableManga])

    React.useLayoutEffect(() => {
        _setParams(MYLISTS_DEFAULT_PARAMS)
    }, [selectedType])

    const _filteredLists: AL_AnimeCollection_MediaListCollection_Lists[] = React.useMemo(() => {
        return lists?.map(obj => {
            if (!obj) return undefined
            const arr = filterListEntries(selectedType as CollectionType, obj?.entries, params, serverStatus?.settings?.anilist?.enableAdultContent)
            return {
                name: obj?.name,
                isCustomList: obj?.isCustomList,
                status: obj?.status,
                entries: arr,
            }
        }).filter(Boolean) ?? []
    }, [lists, debouncedParams, selectedType, serverStatus?.settings?.anilist?.enableAdultContent])

    const filteredLists: AL_AnimeCollection_MediaListCollection_Lists[] = React.useMemo(() => {
        return _filteredLists?.map(obj => {
            if (!obj) return undefined
            const arr = filterEntriesByTitle(obj?.entries, debouncedSearchInput)
            return {
                name: obj?.name,
                isCustomList: obj?.isCustomList,
                status: obj?.status,
                entries: arr,
            }
        })?.filter(Boolean) ?? []
    }, [_filteredLists, debouncedSearchInput])

    const customLists = React.useMemo(() => {
        return filteredLists?.filter(obj => obj?.isCustomList) ?? []
    }, [filteredLists])

    // The type actually being shown: the caller's when it pins one, otherwise the page's tab.
    const resolvedType = type ?? selectedType

    const rawPlanningList = React.useMemo(() => filteredLists?.find(l => l?.status === "PLANNING"), [filteredLists])

    // Anime that hasn't aired yet is split out of Planning into its own section. Planning is a
    // list of things you can start right now; an announced series you cannot watch for months
    // buries the ones you can, so it gets a section of its own instead.
    //
    // Anime only — manga keeps a single Planning list.
    const splitToBeReleased = resolvedType === "anime"

    const toBeReleasedList: AL_AnimeCollection_MediaListCollection_Lists | undefined = React.useMemo(() => {
        if (!splitToBeReleased || !rawPlanningList) return undefined
        const entries = rawPlanningList.entries?.filter(isUnreleasedEntry) ?? []
        if (!entries.length) return undefined
        return {
            name: TO_BE_RELEASED_LIST_NAME,
            isCustomList: false,
            status: rawPlanningList.status,
            entries,
        }
    }, [rawPlanningList, splitToBeReleased])

    const planningList: AL_AnimeCollection_MediaListCollection_Lists | undefined = React.useMemo(() => {
        if (!splitToBeReleased || !rawPlanningList) return rawPlanningList
        return {
            ...rawPlanningList,
            entries: rawPlanningList.entries?.filter(entry => !isUnreleasedEntry(entry)) ?? [],
        }
    }, [rawPlanningList, splitToBeReleased])

    return {
        currentList: React.useMemo(() => filteredLists?.find(l => l?.status === "CURRENT"), [filteredLists]),
        repeatingList: React.useMemo(() => filteredLists?.find(l => l?.status === "REPEATING"), [filteredLists]),
        planningList,
        toBeReleasedList,
        pausedList: React.useMemo(() => filteredLists?.find(l => l?.status === "PAUSED"), [filteredLists]),
        completedList: React.useMemo(() => filteredLists?.find(l => l?.status === "COMPLETED"), [filteredLists]),
        droppedList: React.useMemo(() => filteredLists?.find(l => l?.status === "DROPPED"), [filteredLists]),
        customLists,
    }
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
