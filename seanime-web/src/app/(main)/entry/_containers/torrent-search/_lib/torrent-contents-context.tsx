import { HibikeTorrent_AnimeTorrent } from "@/api/generated/types"
import { TorrentContents, torrentContentsKey, useTorrentContents } from "@/app/(main)/entry/_containers/torrent-search/_lib/use-torrent-contents"
import React from "react"

/**
 * Carries what each torrent holds down to the rows that draw it.
 *
 * A context rather than a prop because the row is rendered from three places — the results table,
 * the preview list and the container's own single-torrent view — and every one of them would
 * otherwise have to thread the same map through unchanged. The lookup belongs to the row; the
 * fetching belongs to whatever knows the whole list, which is the search container.
 *
 * Empty by default, so a row rendered outside a provider simply shows nothing.
 */
const TorrentContentsContext = React.createContext<Record<string, TorrentContents>>({})

export function TorrentContentsProvider({ torrents, children }: {
    torrents: HibikeTorrent_AnimeTorrent[] | null | undefined
    children: React.ReactNode
}) {
    const contents = useTorrentContents(torrents)
    return <TorrentContentsContext.Provider value={contents}>{children}</TorrentContentsContext.Provider>
}

/**
 * What this torrent holds, or undefined while it is unknown — not yet fetched, magnet-only, or a
 * .torrent the server could not read. Undefined is deliberately distinct from zero files.
 */
export function useTorrentContentsFor(torrent: HibikeTorrent_AnimeTorrent | null | undefined): TorrentContents | undefined {
    const contents = React.useContext(TorrentContentsContext)
    const key = torrentContentsKey(torrent)
    if (!key) return undefined
    return contents[key]
}
