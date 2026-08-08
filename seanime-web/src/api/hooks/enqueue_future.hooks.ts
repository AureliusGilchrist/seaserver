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
 *
 * "No results" is excluded: the server gives an item that status when nothing downloadable was found
 * for it — no torrents at all, or nothing seeded well enough to actually finish. There is no decision
 * to make about an entry like that, so it stays as a row (which is what stops it being rediscovered)
 * without taking up a slot in the queue you work through.
 */
export function isEnqueueFuturePending(item: EnqueueFuture_Item): boolean {
    return item.status === ENQUEUE_FUTURE_STATUS.READY
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

/**
 * Picks an interrupted run back up. The server resumes by itself when it starts, so this is for a
 * run that was stopped by hand.
 */
export function useResumeEnqueueFuture() {
    const queryClient = useQueryClient()

    return useServerMutation<EnqueueFuture_Status>({
        endpoint: API_ENDPOINTS.ENQUEUE_FUTURE.ResumeEnqueueFuture.endpoint,
        method: API_ENDPOINTS.ENQUEUE_FUTURE.ResumeEnqueueFuture.methods[0],
        mutationKey: [API_ENDPOINTS.ENQUEUE_FUTURE.ResumeEnqueueFuture.key],
        onSuccess: async () => {
            toast.success("Picking up where it left off")
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureStatus.key] })
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureQueue.key] })
        },
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
 *
 * Note the absence of `gcTime: 0`, which this used to carry. With it, every invalidation — and Resume,
 * Skip, Ignore and Clear all invalidate this — threw the cached rows away, so the query went back to
 * pending and the screen, which gates its whole render on the first load, dropped to a full-page
 * spinner until the refetch landed. On a queue of any size that read as the page hanging. Keeping the
 * data means an invalidation refetches quietly underneath what is already on screen.
 */
export function useGetEnqueueFutureQueue({ isRunning }: { isRunning?: boolean } = {}) {
    return useServerQuery<EnqueueFuture_Item[]>({
        endpoint: API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureQueue.endpoint,
        method: API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureQueue.methods[0],
        queryKey: [API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureQueue.key],
        enabled: true,
        refetchInterval: isRunning ? 4_000 : false,
    })
}

/**
 * One item with its prepared snapshot — the anime entry and the torrent results.
 *
 * Held briefly in cache rather than refetched, so stepping back a couple of anime is instant.
 *
 * gcTime is the important part, and it is deliberately short. Each snapshot is a whole anime entry
 * plus a complete torrent search result — hundreds of kilobytes — and the query key is per media ID,
 * so every anime you step to leaves another one behind. On the default 5-minute collection that meant
 * working a little way down the queue accumulated dozens of them in memory and the page slowed to a
 * crawl; leaving the screen and coming back was the only thing that cleared it, because the remount
 * is what finally let them be collected. Now they are dropped shortly after you move on.
 */
export function useGetEnqueueFutureItem(mediaId: number | undefined) {
    return useServerQuery<EnqueueFuture_Item>({
        endpoint: API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureItem.endpoint.replace("{mediaId}", String(mediaId ?? 0)),
        method: API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureItem.methods[0],
        queryKey: [API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureItem.key, String(mediaId)],
        enabled: !!mediaId,
        staleTime: Infinity,
        gcTime: 20_000,
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
