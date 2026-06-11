import { buildSeaQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { store } from "@/app/jotai-store"
import { atomWithStorage } from "jotai/utils"

/**
 * Offline progress queue.
 *
 * When an AniList progress update can't be applied (AniList unreachable/rate-limited/down, or no
 * network), the update is kept here so it can be retried automatically later. The exact playback
 * timestamp is stored alongside it so the position can be restored on return — the player's
 * continuity system normally handles the seek, but keeping the timestamp makes the saved entry
 * self-contained ("offline data to return to").
 */
export type PendingProgressUpdate = {
    mediaId: number
    episodeNumber: number
    totalEpisodes: number
    malId?: number
    /** Exact playback position (seconds) when the update was saved, for resuming. */
    currentTime?: number
    title?: string
    savedAt: number
}

export const pendingProgressUpdatesAtom = atomWithStorage<PendingProgressUpdate[]>(
    "sea-pending-progress-updates",
    [],
    undefined,
    { getOnInit: true },
)

/** Adds (or replaces) a pending update for a given media + episode. */
export function enqueuePendingProgress(update: PendingProgressUpdate) {
    const current = store.get(pendingProgressUpdatesAtom)
    const filtered = current.filter(u => !(u.mediaId === update.mediaId && u.episodeNumber === update.episodeNumber))
    store.set(pendingProgressUpdatesAtom, [...filtered, update])
}

export function removePendingProgress(mediaId: number, episodeNumber: number) {
    const current = store.get(pendingProgressUpdatesAtom)
    store.set(
        pendingProgressUpdatesAtom,
        current.filter(u => !(u.mediaId === mediaId && u.episodeNumber === episodeNumber)),
    )
}

/** Returns the most recent saved offline position for a media + episode, if any. */
export function getPendingProgressFor(mediaId: number, episodeNumber: number): PendingProgressUpdate | undefined {
    return store.get(pendingProgressUpdatesAtom).find(u => u.mediaId === mediaId && u.episodeNumber === episodeNumber)
}

/** Pushes a single pending update to AniList. Throws on failure so the caller can keep it queued. */
export async function syncPendingProgress(u: PendingProgressUpdate): Promise<void> {
    await buildSeaQuery<boolean>({
        endpoint: API_ENDPOINTS.ANIME_ENTRIES.UpdateAnimeEntryProgress.endpoint,
        method: API_ENDPOINTS.ANIME_ENTRIES.UpdateAnimeEntryProgress.methods[0],
        data: {
            mediaId: u.mediaId,
            episodeNumber: u.episodeNumber,
            totalEpisodes: u.totalEpisodes,
            malId: u.malId,
        },
    })
}
