import { useServerQuery } from "@/api/client/requests"
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"
import React from "react"

/**
 * Anime IDs that this session started a download for.
 * Optimistic: it lights the badge up the moment the download is queued, before the torrent
 * client has anything to report.
 */
export const downloadingAnimeIdsAtom = atom<Set<number>>(new Set<number>())

/**
 * Anime IDs the server reports as having an unfinished download.
 *
 * Derived from the metadata sidecar written when the download was started from a media page,
 * so the badge is permanent: it survives reloads, other devices and server restarts, and only
 * goes away once the torrent is actually finished.
 */
export const serverDownloadingAnimeIdsAtom = atom<Set<number>>(new Set<number>())

/**
 * Media IDs the server reports as having an unfinished download.
 * Defined here rather than in the generated API hooks to avoid an import cycle with
 * `useTorrentClientDownload`, which writes to the optimistic atom above.
 */
function useGetDownloadingMediaIds() {
    return useServerQuery<Array<number>>({
        endpoint: "/api/v1/torrent-client/downloading-media",
        method: "GET",
        queryKey: ["get-downloading-media-ids"],
        refetchInterval: 10_000,
        refetchOnWindowFocus: "always",
        muteError: true,
    })
}

/**
 * Keeps `serverDownloadingAnimeIdsAtom` in sync with the server. Mount once, app-wide.
 */
export function useSyncDownloadingAnime() {
    const { data } = useGetDownloadingMediaIds()
    const setServerIds = useSetAtom(serverDownloadingAnimeIdsAtom)
    const setLocalIds = useSetAtom(downloadingAnimeIdsAtom)

    React.useEffect(() => {
        if (!data) return
        const next = new Set(data)
        setServerIds(next)
        // Drop optimistic IDs the server has taken over or finished, so a completed download
        // doesn't stay marked as downloading forever.
        setLocalIds(prev => {
            if (!prev.size) return prev
            const remaining = new Set([...prev].filter(id => next.has(id)))
            return remaining.size === prev.size ? prev : remaining
        })
    }, [data])
}

/**
 * Hook to manage downloading anime state
 */
export function useDownloadingAnime() {
    const [downloadingIds, setDownloadingIds] = useAtom(downloadingAnimeIdsAtom)
    const serverDownloadingIds = useAtomValue(serverDownloadingAnimeIdsAtom)

    const addDownloadingAnime = (mediaId: number) => {
        setDownloadingIds((prev: Set<number>) => new Set([...prev, mediaId]))
    }

    const removeDownloadingAnime = (mediaId: number) => {
        setDownloadingIds((prev: Set<number>) => {
            const next = new Set(prev)
            next.delete(mediaId)
            return next
        })
    }

    const isDownloading = (mediaId: number) => {
        return downloadingIds.has(mediaId) || serverDownloadingIds.has(mediaId)
    }

    return {
        downloadingIds,
        serverDownloadingIds,
        addDownloadingAnime,
        removeDownloadingAnime,
        isDownloading,
    }
}
