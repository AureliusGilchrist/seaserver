import { useServerQuery } from "@/api/client/requests"
import { atom, useAtomValue, useSetAtom } from "jotai"
import React from "react"

/**
 * Where every manga badge comes from, and the only place any of them comes from.
 *
 * The anime library has had this for a long time and the manga library had nothing, so a manga card
 * said nothing where the anime card beside it said "downloading", "downloaded" or "matched". This is
 * the same arrangement: the server answers with the set of series in each state and every card reads
 * from those sets, rather than each card working its own state out. Per-card is what a shelf of five
 * hundred cards cannot afford, and it is also how two cards come to disagree.
 *
 * Synthetic series are in here on the same terms as everything else — their IDs are simply negative.
 */

/** The state a manga's files are in, which is what its badge shows. Exactly one, or none at all. */
export type MangaBadgeState = "downloading" | "downloaded" | "matched"

export const mangaDownloadingIdsAtom = atom<Set<number>>(new Set<number>())
export const mangaDownloadedIdsAtom = atom<Set<number>>(new Set<number>())
export const mangaMatchedIdsAtom = atom<Set<number>>(new Set<number>())
/** Not a state — a note attached to whichever state applies. See MangaBadge. */
export const mangaSyntheticIdsAtom = atom<Set<number>>(new Set<number>())

type MangaBadgeStatus = {
    downloading?: Array<number> | null
    downloaded?: Array<number> | null
    matched?: Array<number> | null
    synthetic?: Array<number> | null
    /** Identifies this exact answer; sent back on the next poll. */
    fingerprint?: string
    /** The lists are the ones already held, and were not re-sent. */
    unchanged?: boolean
}

/**
 * What the server knows about manga badges.
 *
 * The fingerprint of the answer we already hold rides along, so a poll that changes nothing costs a
 * few bytes instead of four lists of IDs. The held lists are then reused *by identity*, which
 * matters as much as the bytes: a fresh array every poll would re-run every badge selector in the
 * app for an answer that did not change.
 */
function useGetMangaBadgeStatus() {
    const heldRef = React.useRef<MangaBadgeStatus | null>(null)

    const query = useServerQuery<MangaBadgeStatus>({
        endpoint: "/api/v1/manga/badges"
            + (heldRef.current?.fingerprint ? `?known=${encodeURIComponent(heldRef.current.fingerprint)}` : ""),
        method: "GET",
        queryKey: ["get-manga-badge-status"],
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

/** Keeps the server's answer in the atoms above. Mount once, app-wide. */
export function useSyncMangaBadges() {
    const { data } = useGetMangaBadgeStatus()
    const setDownloading = useSetAtom(mangaDownloadingIdsAtom)
    const setDownloaded = useSetAtom(mangaDownloadedIdsAtom)
    const setMatched = useSetAtom(mangaMatchedIdsAtom)
    const setSynthetic = useSetAtom(mangaSyntheticIdsAtom)

    React.useEffect(() => {
        // A failed poll leaves the last successful answer in place — the query cache holds it — so
        // this never runs with an empty payload standing in for "the server could not be reached".
        // That is what stops a badge blinking out over a network hiccup.
        if (!data) return

        const apply = (next: number[], setter: (update: (prev: Set<number>) => Set<number>) => void) => {
            setter(prev => {
                if (prev.size === next.length && next.every(id => prev.has(id))) return prev
                return new Set(next)
            })
        }

        apply(data.downloading ?? [], setDownloading)
        apply(data.downloaded ?? [], setDownloaded)
        apply(data.matched ?? [], setMatched)
        apply(data.synthetic ?? [], setSynthetic)
    }, [data])
}

/**
 * The badge state of one manga, and whether it is a synthetic record.
 *
 * The three states read as one progression — downloading, then matched, then downloaded — and the
 * most specific one still true wins. Matched outranks downloaded deliberately: on the Local Library
 * screen every card has chapters on disk, so "downloaded" there is on every card and says nothing,
 * while "matched" is the thing that differs between one card and the next.
 */
export function useMangaBadgeState(mediaId: number | null | undefined): {
    state: MangaBadgeState | null
    isSynthetic: boolean
} {
    const downloading = useAtomValue(mangaDownloadingIdsAtom)
    const downloaded = useAtomValue(mangaDownloadedIdsAtom)
    const matched = useAtomValue(mangaMatchedIdsAtom)
    const synthetic = useAtomValue(mangaSyntheticIdsAtom)

    return React.useMemo(() => {
        if (mediaId === null || mediaId === undefined) return { state: null, isSynthetic: false }

        const isSynthetic = synthetic.has(mediaId)

        if (downloading.has(mediaId)) return { state: "downloading", isSynthetic }
        if (matched.has(mediaId)) return { state: "matched", isSynthetic }
        if (downloaded.has(mediaId)) return { state: "downloaded", isSynthetic }

        return { state: null, isSynthetic }
    }, [mediaId, downloading, downloaded, matched, synthetic])
}
