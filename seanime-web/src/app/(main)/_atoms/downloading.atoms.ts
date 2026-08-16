import { useServerQuery } from "@/api/client/requests"
import { logger } from "@/lib/helpers/debug"
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"
import React from "react"

/**
 * Where every download badge comes from, and the only place any of them comes from.
 *
 * The server records the state of each download at the moment it changes — queued, finished,
 * matched — in a row that outlives the things it was previously inferred from. That matters because
 * all of those were transient: the torrent client drops a torrent whenever it feels like it, and a
 * match deletes the staging folder as its last act. A badge derived from them went out with them,
 * mid-download and on nothing more than a client restart.
 *
 * Because the record is durable and lives in the shared database rather than a profile's own, the
 * three badges are the same after a server restart, after a client restart, and on every account.
 *
 * So nothing is kept on this side. There is no sticky list, no expiry, no miss-streak counting —
 * all of which existed here and all of which drifted, because a second copy of the answer with its
 * own idea of when to give up is a second answer. The one thing held besides the server's is a
 * short-lived optimistic entry, in memory, so pressing Download marks the anime at once rather than
 * on the next poll, and it is expired by the clock so it cannot outlive its usefulness if the
 * server goes quiet.
 */

/** How long an optimistic entry stands before the server has to be backing it up. */
const OPTIMISTIC_GRACE_MS = 2 * 60 * 1000

/**
 * The state a download is in, which is the state its badge shows. Exactly one, or none at all.
 *
 * They read as one progression — downloading, then downloaded, then matched — and the earliest one
 * still true wins, because that is the fact that decides what you do next: a show with one season
 * still coming down and another already filed away is a show that is still coming down.
 */
export type AnimeDownloadState = "downloading" | "downloaded" | "matched"

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
 * Anime whose download has finished and whose files are sitting in the staging area, waiting to be
 * matched into the library. The state the neutral badge stands for.
 */
export const serverFinishedAnimeIdsAtom = atom<Set<number>>(new Set<number>())

/**
 * Anime whose download was filed into the library, by the auto-matcher or by hand. The state the
 * orange badge stands for, and the end of the progression — nothing retracts it.
 */
export const serverMatchedAnimeIdsAtom = atom<Set<number>>(new Set<number>())

/**
 * Storage keys from designs that kept their own copy of all this, cleared once on load.
 *
 * Both held phantom badges that nothing was left to retract — the whole reason they are gone. Left
 * in place they would simply sit there, since the code that decayed them has gone with them.
 */
const LEGACY_STORAGE_KEYS = ["sea-downloading-anime", "sea-downloading-anime-sticky"]
if (typeof window !== "undefined") {
    for (const key of LEGACY_STORAGE_KEYS) {
        try {
            window.localStorage.removeItem(key)
        }
        catch {
            // Storage unavailable. Nothing is read from it either, so there is nothing to undo.
        }
    }
}

type DownloadingMediaStatus = {
    downloading?: Array<number> | null
    finished?: Array<number> | null
    matched?: Array<number> | null
    /** Identifies this exact answer; sent back on the next poll. See useGetDownloadingMediaStatus. */
    fingerprint?: string
    /** The lists are the ones already held, and were not re-sent. */
    unchanged?: boolean
}

/**
 * What the server knows about downloads. Defined here rather than in the generated API hooks to
 * avoid an import cycle with `useTorrentClientDownload`, which writes to the atom above.
 */
function useGetDownloadingMediaStatus() {
    // The answer is three lists of media IDs, polled by every screen that draws a badge. On a large
    // library that is a lot of bytes to re-send every ten seconds in order to discover that nothing
    // moved — so the fingerprint of the answer we already hold rides along, and an unchanged answer
    // comes back as a few bytes. The held lists below are then reused *by identity*, which matters
    // as much as the bytes: a new array poll would re-run every badge selector in the app.
    const heldRef = React.useRef<DownloadingMediaStatus | null>(null)

    const query = useServerQuery<DownloadingMediaStatus>({
        endpoint: "/api/v1/torrent-client/downloading-media"
            + (heldRef.current?.fingerprint ? `?known=${encodeURIComponent(heldRef.current.fingerprint)}` : ""),
        method: "GET",
        queryKey: ["get-downloading-media-ids"],
        refetchInterval: 10_000,
        refetchOnWindowFocus: "always",
        muteError: true,
    })

    if (query.data) {
        if (query.data.unchanged) {
            if (heldRef.current) heldRef.current.fingerprint = query.data.fingerprint
        } else {
            heldRef.current = query.data
        }
    }

    return { ...query, data: heldRef.current ?? undefined }
}

/**
 * Keeps the server's answer in the atoms above. Mount once, app-wide.
 */
export function useSyncDownloadingAnime() {
    const { data } = useGetDownloadingMediaStatus()
    const setServerIds = useSetAtom(serverDownloadingAnimeIdsAtom)
    const setServerFinishedIds = useSetAtom(serverFinishedAnimeIdsAtom)
    const setServerMatchedIds = useSetAtom(serverMatchedAnimeIdsAtom)
    const setOptimistic = useSetAtom(optimisticDownloadsAtom)

    React.useEffect(() => {
        // A failed poll leaves the last successful answer in place — the query cache holds it — so
        // this never runs with an empty payload standing in for "the server could not be reached".
        // That is what stops a badge blinking out over a network hiccup.
        if (!data) return

        const downloading = new Set(data.downloading ?? [])
        const finished = new Set(data.finished ?? [])
        const matched = new Set(data.matched ?? [])

        // One line per poll, so a badge that does not appear can be told apart from data that never
        // arrived. The server reporting ids while nothing shows means the fault is on this side;
        // nothing logged at all means the query is not reaching the server.
        logger("Downloading").info(
            `Server reports ${downloading.size} downloading, ${finished.size} downloaded, ${matched.size} matched`,
            { downloading: [...downloading], finished: [...finished], matched: [...matched] },
        )

        setServerIds(prev => setsAreEqual(prev, downloading) ? prev : downloading)
        setServerFinishedIds(prev => setsAreEqual(prev, finished) ? prev : finished)
        setServerMatchedIds(prev => setsAreEqual(prev, matched) ? prev : matched)

        // An optimistic entry has done its job once the server is speaking for the download, and is
        // wrong once the server has it past that. Anything else it outlives by the grace period
        // above and no longer — a download that never started must not leave a badge behind.
        const cutoff = Date.now() - OPTIMISTIC_GRACE_MS
        setOptimistic(prev => {
            const next = prev.filter(entry =>
                !downloading.has(entry.mediaId)
                && !finished.has(entry.mediaId)
                && !matched.has(entry.mediaId)
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
 * The download states of every anime at once, and how to mark one optimistically.
 *
 * Callers that only want one anime's state should use `useAnimeDownloadState` in the badge module,
 * which is this narrowed to a single id.
 */
export function useDownloadingAnime() {
    const [optimistic, setOptimistic] = useAtom(optimisticDownloadsAtom)
    const serverDownloadingIds = useAtomValue(serverDownloadingAnimeIdsAtom)
    const serverFinishedIds = useAtomValue(serverFinishedAnimeIdsAtom)
    const serverMatchedIds = useAtomValue(serverMatchedAnimeIdsAtom)

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
        // Checked against the clock here as well as in the sync, so an entry expires even if the
        // server has stopped answering entirely.
        const cutoff = Date.now() - OPTIMISTIC_GRACE_MS
        return optimistic.some(e => e.mediaId === mediaId && e.at > cutoff)
    }, [optimistic, serverDownloadingIds])

    const getDownloadState = React.useCallback((mediaId: number | null | undefined): AnimeDownloadState | null => {
        if (!mediaId) return null
        if (isDownloading(mediaId)) return "downloading"
        if (serverFinishedIds.has(mediaId)) return "downloaded"
        if (serverMatchedIds.has(mediaId)) return "matched"
        return null
    }, [isDownloading, serverFinishedIds, serverMatchedIds])

    const downloadingIds = React.useMemo(() => {
        const cutoff = Date.now() - OPTIMISTIC_GRACE_MS
        const ids = new Set(serverDownloadingIds)
        for (const entry of optimistic) {
            if (entry.at > cutoff) ids.add(entry.mediaId)
        }
        return ids
    }, [optimistic, serverDownloadingIds])

    return {
        downloadingIds,
        serverDownloadingIds,
        serverFinishedIds,
        serverMatchedIds,
        addDownloadingAnime,
        removeDownloadingAnime,
        isDownloading,
        getDownloadState,
    }
}
