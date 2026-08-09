import { HibikeTorrent_AnimeTorrent } from "@/api/generated/types"
import { useServerMutation } from "@/api/client/requests"
import React from "react"

export type TorrentContents = {
    files: number
    folders: number
}

/**
 * The key a torrent's contents are stored and looked up under, matching what the server returns:
 * the info hash when there is one, the download URL otherwise.
 */
export function torrentContentsKey(torrent: HibikeTorrent_AnimeTorrent | null | undefined): string {
    if (!torrent) return ""
    if (torrent.infoHash) return torrent.infoHash.trim().toLowerCase()
    return torrent.downloadUrl?.trim() || ""
}

/**
 * How many files and folders each torrent in a list holds.
 *
 * The server reads this from the .torrent file itself, so it costs one small HTTP request per
 * torrent and nothing is added to the torrent client to answer it. Results are cached server-side by
 * info hash — a torrent's contents cannot change — so re-running a search, switching a filter or
 * reopening a modal asks for something already known.
 *
 * Sent as one request for the whole visible list rather than one per row, and only for torrents not
 * already answered. Magnet-only results have nothing to fetch and simply come back absent, which is
 * why the map is read with a lookup that can miss rather than a count that would read as zero.
 */
export function useTorrentContents(torrents: HibikeTorrent_AnimeTorrent[] | null | undefined) {
    const [contents, setContents] = React.useState<Record<string, TorrentContents>>({})

    const { mutate } = useServerMutation<Record<string, TorrentContents>, { torrents: { infoHash: string, downloadUrl: string }[] }>({
        endpoint: "/api/v1/torrent/contents",
        method: "POST",
        mutationKey: ["torrent-contents"],
        onSuccess: data => {
            if (!data) return
            setContents(prev => ({ ...prev, ...data }))
        },
    })

    // Asking is keyed on the set of torrents that still have no answer, so a list that has been
    // answered stops requesting — including across re-renders caused by filtering and sorting, which
    // rebuild the array without changing which torrents are in it.
    const unanswered = React.useMemo(() => {
        const out: { infoHash: string, downloadUrl: string }[] = []
        const seen = new Set<string>()
        for (const torrent of torrents ?? []) {
            const key = torrentContentsKey(torrent)
            // Nothing to fetch from without a download URL: reading a magnet means joining the
            // swarm, which is the cost this avoids.
            if (!key || !torrent.downloadUrl || contents[key] || seen.has(key)) continue
            seen.add(key)
            out.push({ infoHash: torrent.infoHash || "", downloadUrl: torrent.downloadUrl })
        }
        return out
    }, [torrents, contents])

    const requestedRef = React.useRef<string>("")

    React.useEffect(() => {
        if (!unanswered.length) return
        // A torrent the server could not read stays unanswered forever, so without this the same
        // failing request would fire on every render for as long as the list is open.
        const signature = unanswered.map(t => t.infoHash || t.downloadUrl).sort().join("|")
        if (requestedRef.current === signature) return
        requestedRef.current = signature

        mutate({ torrents: unanswered })
    }, [unanswered, mutate])

    return contents
}
