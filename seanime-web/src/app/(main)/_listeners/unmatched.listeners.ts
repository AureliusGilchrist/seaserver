import { UNMATCHED_ENDPOINTS } from "@/api/hooks/unmatched.hooks"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
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

}
