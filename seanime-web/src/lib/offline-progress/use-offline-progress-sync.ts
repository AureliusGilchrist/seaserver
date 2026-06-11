import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { pendingProgressUpdatesAtom, removePendingProgress, syncPendingProgress } from "@/lib/offline-progress/offline-progress"
import { useQueryClient } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import React from "react"
import { toast } from "sonner"

/**
 * Retries any AniList progress updates that were saved offline (because AniList couldn't be
 * reached at the time). Runs on mount, whenever the queue changes, when the browser regains
 * network, and on a slow interval. Successfully-synced entries are removed from the queue.
 *
 * Mount once near the app root.
 */
export function useOfflineProgressSync() {
    const qc = useQueryClient()
    const pending = useAtomValue(pendingProgressUpdatesAtom)
    const runningRef = React.useRef(false)

    const flush = React.useCallback(async () => {
        if (runningRef.current) return
        const items = [...pending]
        if (items.length === 0) return
        runningRef.current = true
        let synced = 0
        try {
            for (const item of items) {
                try {
                    await syncPendingProgress(item)
                    removePendingProgress(item.mediaId, item.episodeNumber)
                    synced++
                }
                catch {
                    // Still unreachable — leave it queued for the next attempt.
                }
            }
        }
        finally {
            runningRef.current = false
        }
        if (synced > 0) {
            toast.success(`Synced ${synced} offline progress update${synced > 1 ? "s" : ""} to AniList`)
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ANILIST.GetAnimeCollection.key] })
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.key] })
        }
    }, [pending, qc])

    React.useEffect(() => {
        flush()
        const onOnline = () => flush()
        window.addEventListener("online", onOnline)
        const interval = window.setInterval(flush, 60_000)
        return () => {
            window.removeEventListener("online", onOnline)
            window.clearInterval(interval)
        }
    }, [flush])
}
