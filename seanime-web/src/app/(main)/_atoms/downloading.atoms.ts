import { useServerQuery } from "@/api/client/requests"
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import React from "react"

/**
 * One anime the downloading badge is being kept up for.
 *
 * The badge is sticky by design: once it has shown for an anime, even once, it stays until
 * something positively says the download is over. It is not taken down by a reload, by a torrent
 * client that went quiet for a poll, or by the server briefly failing to tie a torrent back to its
 * anime — all of which used to make it blink out mid-download.
 */
export type StickyDownload = {
    mediaId: number
    /** Whether the server has ever reported this download itself, as opposed to us queueing it. */
    confirmed: boolean
    /** Consecutive successful polls in which the server said nothing at all about this anime. */
    missStreak: number
}

/**
 * Anime the downloading badge is up for, persisted so a refresh doesn't wipe it.
 *
 * Written to by two places: optimistically when this session queues a download, and by the sync
 * below from what the server reports.
 */
export const downloadingAnimeIdsAtom = atomWithStorage<StickyDownload[]>(
    "sea-downloading-anime",
    [],
    undefined,
    { getOnInit: true },
)

/** Anime IDs the server reports as having an unfinished download right now. */
export const serverDownloadingAnimeIdsAtom = atom<Set<number>>(new Set<number>())

/**
 * How many polls of the server saying nothing about a download it had previously reported count as
 * "it's over". The server reads staging directories off disk, so a download in progress is visible
 * on every single poll; a few consecutive silences mean the download really is gone, not that a
 * request went wrong. Only used as a backstop — a download that finishes normally is reported as
 * finished and the badge comes down at once.
 */
const CONFIRMED_MISS_LIMIT = 3

/**
 * The same backstop for a download this session queued that the server has never confirmed. Far
 * more forgiving, because there is nothing to fall back on: if this is wrong the badge is lost for
 * a download that is genuinely running. Long enough (~10 min at the poll interval below) that it
 * only ever collects entries for downloads that never actually started.
 */
const UNCONFIRMED_MISS_LIMIT = 60

type DownloadingMediaStatus = {
    downloading?: Array<number> | null
    finished?: Array<number> | null
}

/**
 * What the server knows about downloads in flight. Defined here rather than in the generated API
 * hooks to avoid an import cycle with `useTorrentClientDownload`, which writes to the atom above.
 */
function useGetDownloadingMediaStatus() {
    return useServerQuery<DownloadingMediaStatus>({
        endpoint: "/api/v1/torrent-client/downloading-media",
        method: "GET",
        queryKey: ["get-downloading-media-ids"],
        refetchInterval: 10_000,
        refetchOnWindowFocus: "always",
        muteError: true,
    })
}

/**
 * Keeps the atoms above in sync with the server. Mount once, app-wide.
 */
export function useSyncDownloadingAnime() {
    const { data } = useGetDownloadingMediaStatus()
    const setServerIds = useSetAtom(serverDownloadingAnimeIdsAtom)
    const setSticky = useSetAtom(downloadingAnimeIdsAtom)

    React.useEffect(() => {
        if (!data) return

        const downloading = new Set(data.downloading ?? [])
        const finished = new Set(data.finished ?? [])

        setServerIds(prev => setsAreEqual(prev, downloading) ? prev : downloading)

        setSticky(prev => {
            const next: StickyDownload[] = []

            for (const entry of prev) {
                // Done. This is the one thing that takes the badge down promptly, and it is what
                // hands the card over to the "in your library" badge.
                if (finished.has(entry.mediaId)) continue

                if (downloading.has(entry.mediaId)) {
                    next.push({ mediaId: entry.mediaId, confirmed: true, missStreak: 0 })
                    continue
                }

                const missStreak = entry.missStreak + 1
                const limit = entry.confirmed ? CONFIRMED_MISS_LIMIT : UNCONFIRMED_MISS_LIMIT
                if (missStreak >= limit) continue

                next.push({ ...entry, missStreak })
            }

            // Downloads started elsewhere — another device, the auto-downloader, a previous run.
            const known = new Set(next.map(e => e.mediaId))
            for (const mediaId of downloading) {
                if (known.has(mediaId)) continue
                next.push({ mediaId, confirmed: true, missStreak: 0 })
            }

            return stickyListsAreEqual(prev, next) ? prev : next
        })
    }, [data])
}

function setsAreEqual(a: Set<number>, b: Set<number>) {
    if (a.size !== b.size) return false
    for (const value of a) {
        if (!b.has(value)) return false
    }
    return true
}

/** Compared field by field so an unchanged poll doesn't re-render every card, or touch storage. */
function stickyListsAreEqual(a: StickyDownload[], b: StickyDownload[]) {
    if (a.length !== b.length) return false
    return a.every((entry, i) =>
        entry.mediaId === b[i].mediaId
        && entry.confirmed === b[i].confirmed
        && entry.missStreak === b[i].missStreak,
    )
}

/**
 * Hook to manage downloading anime state
 */
export function useDownloadingAnime() {
    const [sticky, setSticky] = useAtom(downloadingAnimeIdsAtom)
    const serverDownloadingIds = useAtomValue(serverDownloadingAnimeIdsAtom)

    const downloadingIds = React.useMemo(() => new Set(sticky.map(e => e.mediaId)), [sticky])

    const addDownloadingAnime = React.useCallback((mediaId: number) => {
        setSticky(prev => prev.some(e => e.mediaId === mediaId)
            ? prev
            : [...prev, { mediaId, confirmed: false, missStreak: 0 }])
    }, [setSticky])

    const removeDownloadingAnime = React.useCallback((mediaId: number) => {
        setSticky(prev => prev.some(e => e.mediaId === mediaId) ? prev.filter(e => e.mediaId !== mediaId) : prev)
    }, [setSticky])

    const isDownloading = React.useCallback((mediaId: number) => {
        return downloadingIds.has(mediaId) || serverDownloadingIds.has(mediaId)
    }, [downloadingIds, serverDownloadingIds])

    return {
        downloadingIds,
        serverDownloadingIds,
        addDownloadingAnime,
        removeDownloadingAnime,
        isDownloading,
    }
}
