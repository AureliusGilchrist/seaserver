"use client"
import { buildSeaQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { Anime_Entry, Manga_Entry, AL_AnimeDetailsById_Media, AL_MangaDetailsById_Media } from "@/api/generated/types"
import { profileSessionTokenAtom, serverAuthTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useGetLibraryCollection } from "@/api/hooks/anime_collection.hooks"
import { useGetRawAnilistMangaCollection } from "@/api/hooks/manga.hooks"
import { animeLibraryCollectionAtom } from "@/app/(main)/_atoms/anime-library-collection.atoms"
import { useAtomValue, useSetAtom } from "jotai/react"
import { useQueryClient } from "@tanstack/react-query"
import React from "react"

const PREFETCH_STALE = 3 * 60 * 1000
const BATCH_SIZE = 5
const BATCH_GAP_MS = 120

type QueryDef = { key: string; endpoint: string; method: string }

async function prefetchIds(
    ids: number[],
    queryClient: ReturnType<typeof useQueryClient>,
    password: string | undefined,
    profileToken: string | undefined,
    queries: QueryDef[],
) {
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE)
        await Promise.allSettled(
            batch.flatMap(id => {
                const sid = String(id)
                return queries
                    .filter(q => !queryClient.getQueryData([q.key, sid]))
                    .map(q => queryClient.prefetchQuery({
                        queryKey: [q.key, sid],
                        queryFn: () => buildSeaQuery({
                            endpoint: q.endpoint.replace("{id}", sid),
                            method: q.method as "GET",
                            password,
                            profileToken,
                        }),
                        staleTime: PREFETCH_STALE,
                    }))
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
    const profileToken = useAtomValue(profileSessionTokenAtom)

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

        prefetchIds(ids, queryClient, password ?? undefined, profileToken ?? undefined, [
            {
                key: API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key,
                endpoint: API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.endpoint,
                method: API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.methods[0],
            },
            {
                key: API_ENDPOINTS.ANILIST.GetAnilistAnimeDetails.key,
                endpoint: API_ENDPOINTS.ANILIST.GetAnilistAnimeDetails.endpoint,
                method: API_ENDPOINTS.ANILIST.GetAnilistAnimeDetails.methods[0],
            },
            {
                key: API_ENDPOINTS.METADATA.GetMediaMetadataParent.key,
                endpoint: API_ENDPOINTS.METADATA.GetMediaMetadataParent.endpoint,
                method: API_ENDPOINTS.METADATA.GetMediaMetadataParent.methods[0],
            },
            {
                key: API_ENDPOINTS.ANIME.GetAnimeEpisodeCollection.key,
                endpoint: API_ENDPOINTS.ANIME.GetAnimeEpisodeCollection.endpoint,
                method: API_ENDPOINTS.ANIME.GetAnimeEpisodeCollection.methods[0],
            },
        ])
    }, [status])

    // Prefetch manga entries after manga collection loads
    React.useEffect(() => {
        if (!mangaCollection?.MediaListCollection?.lists) return

        const ids = mangaCollection.MediaListCollection.lists
            .flatMap(l => l?.entries ?? [])
            .map(e => e?.media?.id)
            .filter((id): id is number => !!id)

        if (ids.length === 0) return

        prefetchIds(ids, queryClient, password ?? undefined, profileToken ?? undefined, [
            {
                key: API_ENDPOINTS.MANGA.GetMangaEntry.key,
                endpoint: API_ENDPOINTS.MANGA.GetMangaEntry.endpoint,
                method: API_ENDPOINTS.MANGA.GetMangaEntry.methods[0],
            },
            {
                key: API_ENDPOINTS.MANGA.GetMangaEntryDetails.key,
                endpoint: API_ENDPOINTS.MANGA.GetMangaEntryDetails.endpoint,
                method: API_ENDPOINTS.MANGA.GetMangaEntryDetails.methods[0],
            },
        ])
    }, [mangaCollection])

    return null
}

export function useLibraryCollection() {
    return useAtomValue(animeLibraryCollectionAtom)
}
