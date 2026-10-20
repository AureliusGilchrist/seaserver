import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { WSEvents } from "@/lib/server/ws-events"
import { useQueryClient } from "@tanstack/react-query"

/**
 * The download queue can emit bursts of events (or one event every couple of
 * seconds while a bulk queue waits for space). Invalidating on every single
 * event makes the manga home page refetch the folder-analyzing downloads list
 * nonstop, which — combined with the query cache persister re-serializing the
 * whole cache on every change — can wedge the renderer's main thread. Collapse
 * the bursts: at most one invalidation per query key per `DEBOUNCE_MS`.
 */
const DEBOUNCE_MS = 10_000
const pendingInvalidations = new Map<string, ReturnType<typeof setTimeout>>()

function debouncedInvalidate(qc: ReturnType<typeof useQueryClient>, queryKey: string) {
    const existing = pendingInvalidations.get(queryKey)
    if (existing) clearTimeout(existing)
    pendingInvalidations.set(queryKey, setTimeout(() => {
        pendingInvalidations.delete(queryKey)
        void qc.invalidateQueries({ queryKey: [queryKey] })
    }, DEBOUNCE_MS))
}

/**
 * @description
 * - Listens to DOWNLOADED_CHAPTER events and re-fetches queries associated with media ID
 */
export function useMangaListener() {

    const qc = useQueryClient()

    useWebsocketMessageListener<number>({
        type: WSEvents.REFRESHED_MANGA_DOWNLOAD_DATA,
        onMessage: mediaId => {
            (async () => {
                debouncedInvalidate(qc, API_ENDPOINTS.MANGA_DOWNLOAD.GetMangaDownloadsList.key)
            })()
        },
    })

    useWebsocketMessageListener({
        type: WSEvents.CHAPTER_DOWNLOAD_QUEUE_UPDATED,
        onMessage: data => {
            (async () => {
                debouncedInvalidate(qc, API_ENDPOINTS.MANGA_DOWNLOAD.GetMangaDownloadData.key)
                debouncedInvalidate(qc, API_ENDPOINTS.MANGA_DOWNLOAD.GetMangaDownloadQueue.key)
                debouncedInvalidate(qc, API_ENDPOINTS.MANGA_DOWNLOAD.GetMangaDownloadsList.key)
            })()
        },
    })

}
