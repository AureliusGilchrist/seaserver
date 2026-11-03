import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { QueryClient } from "@tanstack/react-query"

// Queries whose answer is the stream the player is playing right now. Refetching one swaps the
// stream URL, which tears the player down and starts it again — from the beginning, and playing
// even if it had been paused. They are fetched again whenever an episode is actually started.
const PLAYBACK_SESSION_QUERY_KEYS = new Set<string>([
    API_ENDPOINTS.MEDIASTREAM.RequestMediastreamMediaContainer.key,
    API_ENDPOINTS.ONLINESTREAM.GetOnlineStreamEpisodeSource.key,
])

/**
 * Invalidates every query except the ones backing a playing stream.
 *
 * For blanket refreshes that happen on their own — the websocket reconnecting, the connection
 * coming back online — which after a player has sat paused for hours (sleep, a Wi-Fi drop) used
 * to restart the episode from the start.
 */
export function invalidateAllQueriesExceptPlayback(queryClient: QueryClient) {
    return queryClient.invalidateQueries({
        predicate: query => !PLAYBACK_SESSION_QUERY_KEYS.has(query.queryKey?.[0] as string),
    })
}
