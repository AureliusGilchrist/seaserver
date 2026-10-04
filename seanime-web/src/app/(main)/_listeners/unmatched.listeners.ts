import { UNMATCHED_ENDPOINTS } from "@/api/hooks/unmatched.hooks"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { WSEvents } from "@/lib/server/ws-events"
import { useQueryClient } from "@tanstack/react-query"

/**
 * @description
 * - Listens to UNMATCHED_MATCH_QUEUE_UPDATED and re-fetches the match queue and the download list
 *
 * The server works through the match queue on its own, so the screen has to be told when it moves:
 * an item that started matching, finished, or stopped on a question is not something this client
 * asked for and cannot infer. The queue query is also polled, so a missed event costs a few
 * seconds rather than a wrong picture — but matching completes between polls often enough that the
 * event is what makes the screen feel live.
 *
 * The download list is re-fetched too: a match that went through removes the download from it.
 *
 * - Listens to TORRENT_ADD_QUEUE_UPDATED and re-fetches the torrent list
 *
 * A torrent that could not be handed to an offline client is queued and imported by the server the
 * moment the client answers again — which is exactly when the torrents list has to be told, because
 * a download that appears out of nowhere is otherwise only noticed at the next poll.
 */
export function useUnmatchedListener() {

    const qc = useQueryClient()

    useWebsocketMessageListener({
        type: WSEvents.UNMATCHED_MATCH_QUEUE_UPDATED,
        onMessage: () => {
            (async () => {
                await qc.invalidateQueries({ queryKey: [UNMATCHED_ENDPOINTS.GetMatchQueue.key] })
                await qc.invalidateQueries({ queryKey: [UNMATCHED_ENDPOINTS.GetUnmatchedTorrents.key] })
            })()
        },
    })

    useWebsocketMessageListener({
        type: WSEvents.TORRENT_ADD_QUEUE_UPDATED,
        onMessage: () => {
            (async () => {
                await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.TORRENT_CLIENT.GetActiveTorrentList.key] })
            })()
        },
    })

}
