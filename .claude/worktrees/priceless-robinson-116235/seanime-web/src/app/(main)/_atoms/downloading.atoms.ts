import { atom, useAtom } from "jotai"

/**
 * Tracks anime IDs that are currently being downloaded.
 * This is used to show a "Downloading" indicator on anime cards.
 */
export const downloadingAnimeIdsAtom = atom<Set<number>>(new Set<number>())

/**
 * Hook to manage downloading anime state
 */
export function useDownloadingAnime() {
    const [downloadingIds, setDownloadingIds] = useAtom(downloadingAnimeIdsAtom)

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
        return downloadingIds.has(mediaId)
    }

    return {
        downloadingIds,
        addDownloadingAnime,
        removeDownloadingAnime,
        isDownloading,
    }
}
