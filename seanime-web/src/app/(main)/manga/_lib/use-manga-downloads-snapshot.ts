import { Manga_DownloadListItem } from "@/api/generated/types"
import { serverStatusAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useAtomValue } from "jotai"
import React from "react"

/**
 * The last downloads list this profile saw, so the local library paints at once.
 *
 * The list is deliberately kept out of the persisted query cache (the download queue rewrites it
 * every few seconds, and re-serializing the whole cache each time froze the app). Without any copy
 * at all, though, the screen opened on "0 downloaded series, 0 chapters" and an empty grid until
 * the server answered. This keeps a separate copy, rewritten only when the list really changed
 * (different series or chapter counts) and only when the browser is idle.
 */
export function useMangaDownloadsSnapshot(live: Manga_DownloadListItem[] | undefined) {
    const status = useAtomValue(serverStatusAtom)
    const profileId = status?.currentProfile?.id ? String(status.currentProfile.id) : "default"
    const key = `sea-manga-downloads:${profileId}`

    const snapshot = React.useMemo<Manga_DownloadListItem[] | undefined>(() => {
        try {
            const raw = localStorage.getItem(key)
            if (!raw) return undefined
            const parsed: unknown = JSON.parse(raw)
            return Array.isArray(parsed) ? parsed as Manga_DownloadListItem[] : undefined
        }
        catch {
            return undefined
        }
    }, [key])

    const lastSignatureRef = React.useRef<string | null>(null)
    React.useEffect(() => {
        if (!live) return
        const signature = live
            .map(d => `${d.mediaId}:${Object.values(d.downloadData || {}).flat().length}:${d.media ? 1 : 0}`)
            .sort()
            .join(",")
        if (signature === lastSignatureRef.current) return

        const write = () => {
            lastSignatureRef.current = signature
            try {
                localStorage.setItem(key, JSON.stringify(live))
            }
            catch {
                // Storage full or unavailable: the screen simply loads the slow way next time.
            }
        }
        const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number, cancelIdleCallback?: (id: number) => void }
        if (w.requestIdleCallback) {
            const id = w.requestIdleCallback(write, { timeout: 5000 })
            return () => w.cancelIdleCallback?.(id)
        }
        const t = setTimeout(write, 1000)
        return () => clearTimeout(t)
    }, [live, key])

    return snapshot
}
