import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { EnqueueFuture_Variables, SetEnqueueFutureItemStatus_Variables } from "@/api/generated/endpoint.types"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { EnqueueFuture_Item, EnqueueFuture_Status } from "@/api/generated/types"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

/**
 * Statuses an item moves through. The first four are the worker's; the last two are yours.
 */
export const ENQUEUE_FUTURE_STATUS = {
    PENDING: "pending",
    PREPARING: "preparing",
    READY: "ready",
    NO_RESULTS: "no_results",
    FAILED: "failed",
    DOWNLOADED: "downloaded",
    SKIPPED: "skipped",
    IGNORED: "ignored",
} as const

/**
 * An item you have not dealt with yet — what the queue viewer walks and the sidebar badge counts.
 * "No results" is included on purpose: it needs a look with a different provider, not hiding.
 */
export function isEnqueueFuturePending(item: EnqueueFuture_Item): boolean {
    return item.status === ENQUEUE_FUTURE_STATUS.READY
        || item.status === ENQUEUE_FUTURE_STATUS.NO_RESULTS
        || item.status === ENQUEUE_FUTURE_STATUS.PENDING
        || item.status === ENQUEUE_FUTURE_STATUS.PREPARING
}

/**
 * An item the viewer can actually open. Pending ones are still being prepared.
 */
export function isEnqueueFutureOpenable(item: EnqueueFuture_Item): boolean {
    return item.status === ENQUEUE_FUTURE_STATUS.READY || item.status === ENQUEUE_FUTURE_STATUS.NO_RESULTS
}

export function useEnqueueFuture() {
    const queryClient = useQueryClient()

    return useServerMutation<EnqueueFuture_Status, EnqueueFuture_Variables>({
        endpoint: API_ENDPOINTS.ENQUEUE_FUTURE.EnqueueFuture.endpoint,
        method: API_ENDPOINTS.ENQUEUE_FUTURE.EnqueueFuture.methods[0],
        mutationKey: [API_ENDPOINTS.ENQUEUE_FUTURE.EnqueueFuture.key],
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureStatus.key] })
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureQueue.key] })
        },
    })
}

/**
 * Polls only while a run is going, matching how the unmatched sweep reports progress.
 */
export function useGetEnqueueFutureStatus(enabled: boolean = true) {
    return useServerQuery<EnqueueFuture_Status>({
        endpoint: API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureStatus.endpoint,
        method: API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureStatus.methods[0],
        queryKey: [API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureStatus.key],
        enabled: enabled,
        gcTime: 0,
        refetchInterval: query => (query.state.data?.running ? 2_000 : false),
    })
}

export function useStopEnqueueFuture() {
    const queryClient = useQueryClient()

    return useServerMutation<EnqueueFuture_Status>({
        endpoint: API_ENDPOINTS.ENQUEUE_FUTURE.StopEnqueueFuture.endpoint,
        method: API_ENDPOINTS.ENQUEUE_FUTURE.StopEnqueueFuture.methods[0],
        mutationKey: [API_ENDPOINTS.ENQUEUE_FUTURE.StopEnqueueFuture.key],
        onSuccess: async () => {
            toast.info("Stopped preparing")
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureStatus.key] })
        },
    })
}

/**
 * The queue itself. Refetched while a run is filling it so new anime appear as they are prepared.
 */
export function useGetEnqueueFutureQueue({ isRunning }: { isRunning?: boolean } = {}) {
    return useServerQuery<EnqueueFuture_Item[]>({
        endpoint: API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureQueue.endpoint,
        method: API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureQueue.methods[0],
        queryKey: [API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureQueue.key],
        enabled: true,
        gcTime: 0,
        refetchInterval: isRunning ? 4_000 : false,
    })
}

/**
 * One item with its prepared snapshot — the anime entry and the torrent results.
 *
 * Held in cache rather than refetched, so stepping back to an anime you have already looked at
 * is instant and costs the server nothing.
 */
export function useGetEnqueueFutureItem(mediaId: number | undefined) {
    return useServerQuery<EnqueueFuture_Item>({
        endpoint: API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureItem.endpoint.replace("{mediaId}", String(mediaId ?? 0)),
        method: API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureItem.methods[0],
        queryKey: [API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureItem.key, String(mediaId)],
        enabled: !!mediaId,
        staleTime: Infinity,
    })
}

export function useSetEnqueueFutureItemStatus(mediaId: number | undefined) {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, SetEnqueueFutureItemStatus_Variables>({
        endpoint: API_ENDPOINTS.ENQUEUE_FUTURE.SetEnqueueFutureItemStatus.endpoint.replace("{mediaId}", String(mediaId ?? 0)),
        method: API_ENDPOINTS.ENQUEUE_FUTURE.SetEnqueueFutureItemStatus.methods[0],
        mutationKey: [API_ENDPOINTS.ENQUEUE_FUTURE.SetEnqueueFutureItemStatus.key, String(mediaId)],
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureQueue.key] })
        },
    })
}

export function useDeleteEnqueueFutureItem(mediaId: number | undefined) {
    const queryClient = useQueryClient()

    return useServerMutation<boolean>({
        endpoint: API_ENDPOINTS.ENQUEUE_FUTURE.DeleteEnqueueFutureItem.endpoint.replace("{mediaId}", String(mediaId ?? 0)),
        method: API_ENDPOINTS.ENQUEUE_FUTURE.DeleteEnqueueFutureItem.methods[0],
        mutationKey: [API_ENDPOINTS.ENQUEUE_FUTURE.DeleteEnqueueFutureItem.key, String(mediaId)],
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureQueue.key] })
        },
    })
}

export function useClearEnqueueFuture() {
    const queryClient = useQueryClient()

    return useServerMutation<boolean>({
        endpoint: API_ENDPOINTS.ENQUEUE_FUTURE.ClearEnqueueFuture.endpoint,
        method: API_ENDPOINTS.ENQUEUE_FUTURE.ClearEnqueueFuture.methods[0],
        mutationKey: [API_ENDPOINTS.ENQUEUE_FUTURE.ClearEnqueueFuture.key],
        onSuccess: async () => {
            toast.success("Queue cleared")
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureQueue.key] })
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureStatus.key] })
        },
    })
}
