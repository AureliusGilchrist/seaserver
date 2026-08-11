import { useServerQuery } from "@/api/client/requests"
import { logger } from "@/lib/helpers/debug"
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import React from "react"

/**
 * The server is the only thing that knows what is downloading, and now it is the only thing asked.
 *
 * It answers from live evidence — what the torrent client is currently pulling, and what is actually
 * sitting in the staging area on disk — so it is correct by construction: delete the downloads and
 * the answer is empty on the very next poll. There is nothing to keep in step with it and nothing
 * that can drift out of step.
 *
 * What used to be here was a second copy, kept in localStorage, that decayed on its own schedule: an
 * entry needed three consecutive polls of the server denying it before it came down, or sixty for
 * one this session had queued optimistically. Both counts assumed the polls were arriving, and the
 * query is deliberately quiet about failure, so any stretch where the server could not be reached
 * simply froze the list. Persisted, it then survived reloads and restarts. That is how a library
 * with every download deleted still showed downloading badges: the badges were not describing the
 * server's answer, they were describing a file written weeks ago that nothing was left to retract.
 *
 * Nothing is persisted now. The only thing held besides the server's answer is a short-lived
 * optimistic entry, in memory, so that pressing Download marks the anime immediately instead of
 * waiting for the next poll — and it is expired by the clock, not by a count of polls, so it cannot
 * outlive its usefulness just because the server went quiet.
 */

/** How long an optimistic entry stands before the server has to be backing it up. */
const OPTIMISTIC_GRACE_MS = 2 * 60 * 1000

/** An anime this session queued, waiting for the server to confirm it has started. */
type OptimisticDownload = {
    mediaId: number
    /** When it was queued, so it can expire by the clock rather than by counting polls. */
    at: number
}

/** In memory only. A reload has no business remembering that a button was pressed. */
export const optimisticDownloadsAtom = atom<OptimisticDownload[]>([])

/** Anime IDs the server reports as having an unfinished download right now. */
export const serverDownloadingAnimeIdsAtom = atom<Set<number>>(new Set<number>())

/**
 * Anime the badge is being kept up for, persisted so a reload does not wipe it.
 *
 * Sticky on purpose: once a badge has appeared it stays until something positively says the download
 * is over. It is not taken down by a reload, by a torrent client that went quiet for one poll, or by
 * the server briefly failing to tie a torrent back to its anime — all of which make a badge blink
 * out mid-download, which reads as the download having failed.
 *
 * What it is *not* is permanent. The last version of this only came down after three consecutive
 * polls contradicted it — sixty for one queued optimistically — and those counts only tick while
 * polls are arriving, so an unreachable server froze the list and a stale entry could outlive the
 * download by weeks. Here a poll that positively reports an anime as finished, or one that reports a
 * healthy list this anime is absent from, retires it: see the sync below.
 */
export const stickyDownloadingIdsAtom = atomWithStorage<number[]>(
    "sea-downloading-anime-sticky",
    [],
    undefined,
    { getOnInit: true },
)

/**
 * Anime whose download the torrent client has finished, but which is still sitting in the staging
 * area waiting to be matched into the library.
 *
 * The same poll already answers this, so it costs nothing beyond reading a field that was being
 * thrown away — and it is the exact state the neutral badge stands for. Deriving it here rather
 * than from the Unmatched listing also keeps every card off that endpoint.
 */
export const serverFinishedAnimeIdsAtom = atom<Set<number>>(new Set<number>())

/**
 * The stale localStorage key from the previous design, cleared once on load.
 *
 * Without this the phantom badges it holds would stay until each entry happened to decay, which for
 * an unconfirmed one meant ten minutes of uninterrupted successful polling — and the whole reason
 * for this change is that those entries were never coming down on their own.
 */
const LEGACY_STICKY_KEY = "sea-downloading-anime"
if (typeof window !== "undefined") {
    try {
        window.localStorage.removeItem(LEGACY_STICKY_KEY)
    }
    catch {
        // Storage unavailable. Nothing was read from it either, so there is nothing to undo.
    }
}

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
 * Keeps the server's answer in the atom above. Mount once, app-wide.
 */
export function useSyncDownloadingAnime() {
    const { data } = useGetDownloadingMediaStatus()
    const setServerIds = useSetAtom(serverDownloadingAnimeIdsAtom)
    const setServerFinishedIds = useSetAtom(serverFinishedAnimeIdsAtom)
    const setOptimistic = useSetAtom(optimisticDownloadsAtom)
    const setSticky = useSetAtom(stickyDownloadingIdsAtom)

    React.useEffect(() => {
        if (!data) return

        const downloading = new Set(data.downloading ?? [])
        const finished = new Set(data.finished ?? [])

        // One line per change, so a badge that does not appear can be told apart from data that
        // never arrived. The server reporting ids while this stays empty means the fault is on this
        // side; nothing logged at all means the query is not reaching the server.
        logger("Downloading").info(
            `Server reports ${downloading.size} downloading, ${finished.size} finished`,
            { downloading: [...downloading], finished: [...finished] },
        )

        setServerIds(prev => setsAreEqual(prev, downloading) ? prev : downloading)
        setServerFinishedIds(prev => setsAreEqual(prev, finished) ? prev : finished)

        // Keep the sticky list in step, adding on sight and removing only on evidence.
        //
        // "Evidence" is the part that stops this becoming the phantom badges of the previous
        // version: an anime the server calls finished is done, and — only when the server has
        // answered with a healthy list — an anime absent from both lists is gone. A poll that
        // reports nothing at all retires nothing, because an empty answer is what a server having
        // trouble looks like, and that is precisely when a badge must not disappear.
        const serverAnswered = downloading.size > 0 || finished.size > 0
        setSticky(prev => {
            const next = prev.filter(id => {
                if (finished.has(id)) return false
                if (downloading.has(id)) return true
                return !serverAnswered
            })
            for (const id of downloading) {
                if (!next.includes(id)) next.push(id)
            }
            return next.length === prev.length && next.every((id, i) => id === prev[i]) ? prev : next
        })

        // An optimistic entry has done its job once the server is speaking for the download, and is
        // wrong once the server calls it finished. Anything else it outlives by the grace period
        // above and no longer — a download that never started must not leave a badge behind.
        const cutoff = Date.now() - OPTIMISTIC_GRACE_MS
        setOptimistic(prev => {
            const next = prev.filter(entry =>
                !downloading.has(entry.mediaId)
                && !finished.has(entry.mediaId)
                && entry.at > cutoff,
            )
            return next.length === prev.length ? prev : next
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

/**
 * Whether an anime has a download in flight, and how to mark one optimistically.
 */
export function useDownloadingAnime() {
    const [optimistic, setOptimistic] = useAtom(optimisticDownloadsAtom)
    const serverDownloadingIds = useAtomValue(serverDownloadingAnimeIdsAtom)
    const sticky = useAtomValue(stickyDownloadingIdsAtom)

    const addDownloadingAnime = React.useCallback((mediaId: number) => {
        setOptimistic(prev => prev.some(e => e.mediaId === mediaId)
            ? prev
            : [...prev, { mediaId, at: Date.now() }])
    }, [setOptimistic])

    const removeDownloadingAnime = React.useCallback((mediaId: number) => {
        setOptimistic(prev => prev.some(e => e.mediaId === mediaId) ? prev.filter(e => e.mediaId !== mediaId) : prev)
    }, [setOptimistic])

    const isDownloading = React.useCallback((mediaId: number) => {
        if (serverDownloadingIds.has(mediaId)) return true
        // The sticky layer: a badge already shown stays up through a poll that lost sight of it.
        if (sticky.includes(mediaId)) return true
        // Checked against the clock here as well as in the sync, so an entry expires even if the
        // server has stopped answering entirely.
        const cutoff = Date.now() - OPTIMISTIC_GRACE_MS
        return optimistic.some(e => e.mediaId === mediaId && e.at > cutoff)
    }, [optimistic, serverDownloadingIds, sticky])

    const downloadingIds = React.useMemo(() => {
        const cutoff = Date.now() - OPTIMISTIC_GRACE_MS
        const ids = new Set(serverDownloadingIds)
        for (const id of sticky) ids.add(id)
        for (const entry of optimistic) {
            if (entry.at > cutoff) ids.add(entry.mediaId)
        }
        return ids
    }, [optimistic, serverDownloadingIds, sticky])

    return {
        downloadingIds,
        serverDownloadingIds,
        addDownloadingAnime,
        removeDownloadingAnime,
        isDownloading,
    }
}
