import { Anime_LibraryCollectionList } from "@/api/generated/types"
import { useGetLibraryCollection, useGetLightLibraryCollection } from "@/api/hooks/anime_collection.hooks"
import { useGetContinuityWatchHistory } from "@/api/hooks/continuity.hooks"
import { useGetAnimeGojuuonMap } from "@/api/hooks/services.hooks"
import { animeLibraryCollectionAtom } from "@/app/(main)/_atoms/anime-library-collection.atoms"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import {
    CollectionParams,
    DEFAULT_ANIME_COLLECTION_PARAMS,
    filterAnimeCollectionEntries,
    sortContinueWatchingEntries,
} from "@/lib/helpers/filtering"
import { useThemeSettings } from "@/lib/theme/hooks"
import { atomWithImmer } from "jotai-immer"
import { useAtomValue, useSetAtom } from "jotai/react"
import React from "react"

export const MAIN_LIBRARY_DEFAULT_PARAMS: CollectionParams<"anime"> = {
    ...DEFAULT_ANIME_COLLECTION_PARAMS,
    sorting: "TITLE", // Will be set to default sorting on mount
    continueWatchingOnly: false,
}

export const __mainLibrary_paramsAtom = atomWithImmer<CollectionParams<"anime">>(MAIN_LIBRARY_DEFAULT_PARAMS)

export const __mainLibrary_paramsInputAtom = atomWithImmer<CollectionParams<"anime">>(MAIN_LIBRARY_DEFAULT_PARAMS)

export function useHandleLibraryCollection() {
    const serverStatus = useServerStatus()

    const atom_setLibraryCollection = useSetAtom(animeLibraryCollectionAtom)

    const { animeLibraryCollectionDefaultSorting, continueWatchingDefaultSorting } = useThemeSettings()

    const { data: watchHistory } = useGetContinuityWatchHistory()
    const { data: animeGojuuonMap } = useGetAnimeGojuuonMap()

    /**
     * Fetch light collection first (AniList lists only, instant),
     * then full collection (with local files) lazily.
     */
    const { data: lightData } = useGetLightLibraryCollection()
    const { data: fullData, isLoading: fullIsLoading } = useGetLibraryCollection({
        // The library collection is the largest response this app asks for — every list, every
        // entry, a media object each — and this used to re-fetch the whole of it every five
        // seconds, all day, whether anything had changed or not.
        //
        // On a LAN that is invisible, which is why it stood. Over the internet it is the reason
        // nothing else arrives: the link spends its time carrying the same collection over and
        // over, and a browser will only hold six connections to a host, so every other request in
        // the app queues behind a transfer that starts again as soon as it finishes.
        //
        // A minute instead, which is still well inside "without manual refresh" for the unmatched
        // and ignored groups this cadence existed for — and the things that actually change it say
        // so directly: a scan, a match and a metadata refresh all invalidate this query when they
        // finish, and coming back to the window re-reads it.
        refetchInterval: 60_000,
        staleTime: 30_000,
        // `true` rather than `"always"`, which is the setting that ignores staleTime entirely.
        // Coming back to the window still re-reads the collection; alt-tabbing away and back three
        // times in ten seconds no longer pulls the whole thing down three times.
        refetchOnWindowFocus: true,
    })

    // Use full data when available, fall back to light data for instant rendering
    const _data = fullData ?? lightData
    const isLoading = !_data && fullIsLoading

    const data = React.useMemo(() => {
        if (!_data) return undefined
        if (!!_data.stream) {
            // Add to current list
            let currentList = _data.lists?.find(n => n.type === "CURRENT")
            let entries = [...(currentList?.entries ?? [])]
            for (let anime of (_data.stream.anime ?? [])) {
                if (!entries.some(e => e.mediaId === anime.id)) {
                    entries.push({
                        media: anime,
                        mediaId: anime.id,
                        listData: _data.stream.listData?.[anime.id],
                        libraryData: undefined,
                    })
                }
            }
            return {
                ..._data,
                lists: [
                    {
                        type: "CURRENT",
                        status: "CURRENT",
                        entries: entries,
                    } as Anime_LibraryCollectionList,
                    ...(_data.lists ?? [])?.filter(n => n.type !== "CURRENT") ?? [],
                ].filter(Boolean),
            }
        } else {
            return _data
        }
    }, [_data])

    /**
     * Store the received data in `libraryCollectionAtom`
     */
    React.useEffect(() => {
        if (!!data) {
            atom_setLibraryCollection(data)
        }
    }, [data])

    /**
     * Get the current params
     */
    const params = useAtomValue(__mainLibrary_paramsAtom)

    /**
     * Sort the collection
     * - This is displayed when there's no filters applied
     */
    const sortedCollection = React.useMemo(() => {
        if (!data || !data.lists) return []

        // Stream
        // if (data.stream) {
        //     // Add to current list
        //     let currentList = data.lists.find(n => n.type === "CURRENT")
        //     if (currentList) {
        //         let entries = [...(currentList.entries ?? [])]
        //         for (let anime of (data.stream.anime ?? [])) {
        //             if (!entries.some(e => e.mediaId === anime.id)) {
        //                 entries.push({
        //                     media: anime,
        //                     mediaId: anime.id,
        //                     listData: data.stream.listData?.[anime.id],
        //                     libraryData: undefined,
        //                 })
        //             }
        //         }
        //         data.lists.find(n => n.type === "CURRENT")!.entries = entries
        //     }
        // }

        let _lists = data.lists.map(obj => {
            if (!obj) return obj

            //
            let sortingParams = {
                ...DEFAULT_ANIME_COLLECTION_PARAMS,
                continueWatchingOnly: params.continueWatchingOnly,
                sorting: animeLibraryCollectionDefaultSorting as any,
            } as CollectionParams<"anime">

            let continueWatchingList = [...(data.continueWatchingList ?? [])]

            if (data.stream) {
                for (let entry of (data.stream?.continueWatchingList ?? [])) {
                    continueWatchingList = [...continueWatchingList, entry]
                }
            }
            let arr = filterAnimeCollectionEntries(
                obj.entries,
                sortingParams,
                serverStatus?.settings?.anilist?.enableAdultContent,
                continueWatchingList,
                watchHistory,
                animeGojuuonMap,
            )

            // Reset `continueWatchingOnly` to false if it's about to make the list disappear
            if (arr.length === 0 && sortingParams.continueWatchingOnly) {

                // TODO: Add a toast to notify the user that the list is empty
                sortingParams = {
                    ...sortingParams,
                    continueWatchingOnly: false, // Override
                }

                arr = filterAnimeCollectionEntries(
                    obj.entries,
                    sortingParams,
                    serverStatus?.settings?.anilist?.enableAdultContent,
                    continueWatchingList,
                    watchHistory,
                    animeGojuuonMap,
                )
            }

            return {
                type: obj.type,
                status: obj.status,
                entries: arr,
            }
        })
        return [
            _lists.find(n => n.type === "LOCAL" as any),
            _lists.find(n => n.type === "CURRENT"),
            _lists.find(n => n.type === "PAUSED"),
            _lists.find(n => n.type === "PLANNING"),
            _lists.find(n => n.type === "COMPLETED"),
            _lists.find(n => n.type === "DROPPED"),
        ].filter(Boolean)
    }, [data, params, animeLibraryCollectionDefaultSorting, serverStatus?.settings?.anilist?.enableAdultContent, watchHistory, animeGojuuonMap])

    /**
     * Filter the collection
     * - This is displayed when there's filters applied
     */
    const filteredCollection = React.useMemo(() => {
        if (!data || !data.lists) return []

        let _lists = data.lists.map(obj => {
            if (!obj) return obj
            const paramsToApply = {
                ...params,
                sorting: animeLibraryCollectionDefaultSorting,
            } as CollectionParams<"anime">
            const arr = filterAnimeCollectionEntries(obj.entries,
                paramsToApply,
                serverStatus?.settings?.anilist?.enableAdultContent,
                data.continueWatchingList,
                watchHistory,
                animeGojuuonMap)

            // For the LOCAL list, sort by title with special characters first, then A-Z
            if (obj.type?.toString() === "LOCAL") {
                const sortKey = (title?: string | null) => {
                    if (!title) return "zzzzzz"
                    const trimmed = title.trim()
                    if (!trimmed) return "zzzzzz"
                    const first = trimmed[0]
                    const isAlpha = /^[A-Za-z]$/.test(first)
                    // Prefix with 0 for special chars, 1 for letters to ensure special chars first
                    return `${isAlpha ? "1" : "0"}${trimmed.toLowerCase()}`
                }
                arr.sort((a, b) => sortKey(a.media?.title?.userPreferred).localeCompare(sortKey(b.media?.title?.userPreferred)))
            }
            return {
                type: obj.type,
                status: obj.status,
                entries: arr,
            }
        })
        return [
            _lists.find(n => n.type === "LOCAL" as any),
            _lists.find(n => n.type === "CURRENT"),
            _lists.find(n => n.type === "PAUSED"),
            _lists.find(n => n.type === "PLANNING"),
            _lists.find(n => n.type === "COMPLETED"),
            _lists.find(n => n.type === "DROPPED"),
        ].filter(Boolean)
    }, [data, params, serverStatus?.settings?.anilist?.enableAdultContent, watchHistory, animeGojuuonMap])

    /**
     * Entries the user marked COMPLETED on their own AniList account that the full collection
     * dropped because nothing is downloaded for them anymore.
     *
     * The full collection only keeps entries backed by local files, so a series only stayed
     * visible if it happened to overlap with the shared (planning slut) library. The light
     * collection is the user's own lists untouched, so it's the right source for "everything
     * I've finished".
     */
    const completedEntriesWithoutLocalFiles = React.useMemo(() => {
        const lightCompleted = lightData?.lists?.find(n => n.type === "COMPLETED")?.entries ?? []
        if (!lightCompleted.length) return []
        const known = new Set((data?.lists?.find(n => n.type === "COMPLETED")?.entries ?? []).map(e => e.mediaId))
        return lightCompleted.filter(e => !known.has(e.mediaId))
    }, [lightData?.lists, data?.lists])

    /**
     * Lists for the home screen's status sections ("Currently watching", "Completed", ...).
     *
     * Two differences from the library lists:
     * - COMPLETED also carries the entries above, so finished series show without needing a
     *   local copy.
     * - The LOCAL list is dropped, because these sections are the user's own lists and LOCAL is by
     *   definition everything that is not on one. It is not lost by being dropped here: the home
     *   screen's "Local Anime Library" item draws it, out of `libraryCollectionList` rather than
     *   these, which is where a grid of what is on disk belongs.
     */
    const buildStatusLists = React.useCallback((
        lists: Anime_LibraryCollectionList[],
        extraCompletedParams: CollectionParams<"anime">,
    ) => {
        const allLists = lists.filter(l => (l.type as string) !== "LOCAL")

        if (!completedEntriesWithoutLocalFiles.length) return allLists

        // Run the extra entries through the same filter/sort as the rest of the collection so
        // the genre selector and search keep working on them.
        const extra = filterAnimeCollectionEntries(
            completedEntriesWithoutLocalFiles,
            extraCompletedParams,
            serverStatus?.settings?.anilist?.enableAdultContent,
            [],
            watchHistory,
            animeGojuuonMap,
        )

        if (!extra.length) return allLists

        if (!allLists.some(l => l.type === "COMPLETED")) {
            // Nothing completed is downloaded — the section doesn't exist yet, so create it in
            // its usual place (before "Dropped").
            const completedList = { type: "COMPLETED", status: "COMPLETED", entries: extra } as Anime_LibraryCollectionList
            const droppedIdx = allLists.findIndex(l => l.type === "DROPPED")
            if (droppedIdx === -1) return [...allLists, completedList]
            return [...allLists.slice(0, droppedIdx), completedList, ...allLists.slice(droppedIdx)]
        }

        return allLists.map(l => l.type !== "COMPLETED" ? l : {
            ...l,
            entries: [...(l.entries ?? []), ...extra]
                .sort((a, b) => (a.media?.title?.userPreferred ?? "").localeCompare(b.media?.title?.userPreferred ?? "")),
        })
    }, [
        completedEntriesWithoutLocalFiles,
        serverStatus?.settings?.anilist?.enableAdultContent,
        watchHistory,
        animeGojuuonMap,
    ])

    const statusCollectionList = React.useMemo(() => buildStatusLists(sortedCollection, {
        ...DEFAULT_ANIME_COLLECTION_PARAMS,
        sorting: animeLibraryCollectionDefaultSorting as any,
    } as CollectionParams<"anime">), [sortedCollection, buildStatusLists, animeLibraryCollectionDefaultSorting])

    const filteredStatusCollectionList = React.useMemo(() => buildStatusLists(filteredCollection, {
        ...params,
        sorting: animeLibraryCollectionDefaultSorting,
    } as CollectionParams<"anime">), [filteredCollection, buildStatusLists, params, animeLibraryCollectionDefaultSorting])

    /**
     * Sort the continue watching list
     */
    const continueWatchingList = React.useMemo(() => {
        if (!data?.continueWatchingList) return []

        let list = [...data.continueWatchingList]


        if (data.stream) {
            for (let entry of (data.stream.continueWatchingList ?? [])) {
                list = [...list, entry]
            }
        }

        const entries = sortedCollection.flatMap(n => n.entries)

        list = sortContinueWatchingEntries(list, continueWatchingDefaultSorting as any, entries, watchHistory)

        if (!serverStatus?.settings?.anilist?.enableAdultContent || serverStatus?.settings?.anilist?.blurAdultContent) {
            return list.filter(entry => entry.baseAnime?.isAdult === false)
        }

        return list
    }, [
        data?.stream,
        sortedCollection,
        data?.continueWatchingList,
        continueWatchingDefaultSorting,
        serverStatus?.settings?.anilist?.enableAdultContent,
        serverStatus?.settings?.anilist?.blurAdultContent,
        watchHistory,
    ])

    /**
     * Get the genres from all media in the library
     */
    const libraryGenres = React.useMemo(() => {
        const allGenres = filteredCollection?.flatMap(l => {
            return l.entries?.flatMap(e => e.media?.genres) ?? []
        })
        return [...new Set(allGenres)].filter(Boolean)?.sort((a, b) => a.localeCompare(b))
    }, [filteredCollection])

    return {
        libraryGenres,
        isLoading: isLoading,
        libraryCollectionList: sortedCollection,
        filteredLibraryCollectionList: filteredCollection,
        // Same lists, for the home screen's status sections. See `buildStatusLists`.
        statusCollectionList,
        filteredStatusCollectionList,
        continueWatchingList: continueWatchingList,
        unmatchedLocalFiles: data?.unmatchedLocalFiles ?? [],
        ignoredLocalFiles: data?.ignoredLocalFiles ?? [],
        unmatchedGroups: data?.unmatchedGroups ?? [],
        unknownGroups: data?.unknownGroups ?? [],
        streamingMediaIds: data?.stream?.anime?.map(n => n.id) ?? [],
        hasEntries: sortedCollection.some(n => n.entries?.length > 0),
        isStreamingOnly: sortedCollection.every(n => n.entries?.every(e => !e.libraryData)),
        isNakamaLibrary: React.useMemo(() => data?.lists?.some(l => l.entries?.some(e => !!e.nakamaLibraryData)) ?? false, [data?.lists]),
    }

}

export type HandleLibraryCollectionProps = ReturnType<typeof useHandleLibraryCollection>
