"use client"
import { buildSeaQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { Anime_Entry, Manga_Entry, AL_AnimeDetailsById_Media, AL_MangaDetailsById_Media } from "@/api/generated/types"
import { serverAuthTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useGetLibraryCollection } from "@/api/hooks/anime_collection.hooks"
import { useGetRawAnilistMangaCollection } from "@/api/hooks/manga.hooks"
import { animeLibraryCollectionAtom } from "@/app/(main)/_atoms/anime-library-collection.atoms"
import { useAtomValue, useSetAtom } from "jotai/react"
import { useQueryClient } from "@tanstack/react-query"
import React from "react"

const PREFETCH_STALE = 3 * 60 * 1000
const BATCH_SIZE = 5
const BATCH_GAP_MS = 120

async function prefetchIds(
    ids: number[],
    queryClient: ReturnType<typeof useQueryClient>,
    password: string | undefined,
    entryKey: string,
    entryEndpoint: string,
    entryMethod: string,
    detailsKey: string,
    detailsEndpoint: string,
    detailsMethod: string,
) {
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE)
        await Promise.allSettled(
            batch.flatMap(id => {
                const sid = String(id)
                const tasks: Promise<unknown>[] = []

                if (!queryClient.getQueryData([entryKey, sid])) {
                    tasks.push(queryClient.prefetchQuery({
                        queryKey: [entryKey, sid],
                        queryFn: () => buildSeaQuery({
                            endpoint: entryEndpoint.replace("{id}", sid),
                            method: entryMethod as "GET",
                            password,
                        }),
                        staleTime: PREFETCH_STALE,
                    }))
                }

                if (!queryClient.getQueryData([detailsKey, sid])) {
                    tasks.push(queryClient.prefetchQuery({
                        queryKey: [detailsKey, sid],
                        queryFn: () => buildSeaQuery({
                            endpoint: detailsEndpoint.replace("{id}", sid),
                            method: detailsMethod as "GET",
                            password,
                        }),
                        staleTime: PREFETCH_STALE,
                    }))
                }

                return tasks
            }),
        )
        if (i + BATCH_SIZE < ids.length) {
            await new Promise(r => setTimeout(r, BATCH_GAP_MS))
        }
    }
}

/**
 * Fetches the library collection and sets it in the atom.
 * After success, prefetches all anime + manga entry details in background batches.
 */
export function useAnimeLibraryCollectionLoader() {
    const setter = useSetAtom(animeLibraryCollectionAtom)
    const queryClient = useQueryClient()
    const password = useAtomValue(serverAuthTokenAtom)

    const { data, status } = useGetLibraryCollection()
    const { data: mangaCollection } = useGetRawAnilistMangaCollection()

    React.useEffect(() => {
        if (status === "success") {
            setter(data)
        }
    }, [data, status])

    // Prefetch anime entries after library loads
    React.useEffect(() => {
        if (status !== "success" || !data?.lists) return

        const ids = data.lists
            .flatMap(l => l.entries ?? [])
            .map(e => e.mediaId)
            .filter((id): id is number => !!id)

        if (ids.length === 0) return

        prefetchIds(
            ids,
            queryClient,
            password ?? undefined,
            API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key,
            API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.endpoint,
            API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.methods[0],
            API_ENDPOINTS.ANILIST.GetAnilistAnimeDetails.key,
            API_ENDPOINTS.ANILIST.GetAnilistAnimeDetails.endpoint,
            API_ENDPOINTS.ANILIST.GetAnilistAnimeDetails.methods[0],
        )
    }, [status])

    // Prefetch manga entries after manga collection loads
    React.useEffect(() => {
        if (!mangaCollection?.MediaListCollection?.lists) return

        const ids = mangaCollection.MediaListCollection.lists
            .flatMap(l => l?.entries ?? [])
            .map(e => e?.media?.id)
            .filter((id): id is number => !!id)

        if (ids.length === 0) return

        prefetchIds(
            ids,
            queryClient,
            password ?? undefined,
            API_ENDPOINTS.MANGA.GetMangaEntry.key,
            API_ENDPOINTS.MANGA.GetMangaEntry.endpoint,
            API_ENDPOINTS.MANGA.GetMangaEntry.methods[0],
            API_ENDPOINTS.MANGA.GetMangaEntryDetails.key,
            API_ENDPOINTS.MANGA.GetMangaEntryDetails.endpoint,
            API_ENDPOINTS.MANGA.GetMangaEntryDetails.methods[0],
        )
    }, [mangaCollection])

    return null
}

export function useLibraryCollection() {
    return useAtomValue(animeLibraryCollectionAtom)
}
