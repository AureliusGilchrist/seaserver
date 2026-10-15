import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { WSEvents } from "@/lib/server/ws-events"
import { useQueryClient } from "@tanstack/react-query"

/**
 * @description
 * - Listens to REFRESHED_ANILIST_COLLECTION events and re-fetches queries associated with AniList collection.
 */
export function useAnimeCollectionListener() {

    const qc = useQueryClient()

    useWebsocketMessageListener({
        type: WSEvents.REFRESHED_ANILIST_ANIME_COLLECTION,
        onMessage: data => {
            (async () => {
                await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.key] })
                await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ANILIST.GetAnimeCollection.key] })
                await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ANILIST.GetRawAnimeCollection.key] })
                await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key] })
                await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetMissingEpisodes.key] })
                await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetAnimeCollectionSchedule.key] })
            })()
        },
    })

    useWebsocketMessageListener({
        type: WSEvents.REFRESHED_ANILIST_MANGA_COLLECTION,
        onMessage: data => {
            (async () => {
                await Promise.all([
                    qc.invalidateQueries({ queryKey: [API_ENDPOINTS.MANGA.GetAnilistMangaCollection.key] }),
                    qc.invalidateQueries({ queryKey: [API_ENDPOINTS.MANGA.GetMangaCollection.key] }),
                    qc.invalidateQueries({ queryKey: [API_ENDPOINTS.MANGA.GetMangaEntry.key] }),
                    qc.invalidateQueries({ queryKey: [API_ENDPOINTS.MANGA.GetMangaLatestChapterNumbersMap.key] }),
                    qc.invalidateQueries({ queryKey: ["manga-reading-history"] }),
                    qc.invalidateQueries({ queryKey: ["manga-upcoming-chapters"] }),
                    qc.invalidateQueries({ queryKey: ["manga-recently-released"] }),
                    qc.invalidateQueries({ queryKey: ["manga-missed-sequels"] }),
                ])
            })()
        },
    })

}
