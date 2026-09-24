import { useServerMutation, useServerQuery } from "@/api/client/requests"
import {
    TorrentClientAction_Variables,
    TorrentClientAddMagnetFromRule_Variables,
    TorrentClientDownload_Variables,
    TorrentClientGetFiles_Variables,
} from "@/api/generated/endpoint.types"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { HibikeTorrent_AnimeTorrent, Nullish, TorrentClient_Torrent } from "@/api/generated/types"
import { DOWNLOADING_MEDIA_QUERY_KEY, useDownloadingAnime } from "@/app/(main)/_atoms/downloading.atoms"
import { useQueryClient } from "@tanstack/react-query"
import React from "react"
import { toast } from "sonner"

export function useGetActiveTorrentList(enabled: boolean, category: string, sort: string) {
    const query = React.useMemo(() => {
        if (!category && !sort) return ""
        let q = "?"
        if (category) q += `category=${category}&`
        if (sort) q += `sort=${sort}`
        return q
    }, [category, sort])
    return useServerQuery<Array<TorrentClient_Torrent>>({
        endpoint: API_ENDPOINTS.TORRENT_CLIENT.GetActiveTorrentList.endpoint + query,
        method: API_ENDPOINTS.TORRENT_CLIENT.GetActiveTorrentList.methods[0],
        queryKey: [API_ENDPOINTS.TORRENT_CLIENT.GetActiveTorrentList.key, category, sort],
        refetchInterval: 1500,
        gcTime: 0,
        enabled: enabled,
    })
}

export function useTorrentClientAction(onSuccess?: () => void) {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, TorrentClientAction_Variables>({
        endpoint: API_ENDPOINTS.TORRENT_CLIENT.TorrentClientAction.endpoint,
        method: API_ENDPOINTS.TORRENT_CLIENT.TorrentClientAction.methods[0],
        mutationKey: [API_ENDPOINTS.TORRENT_CLIENT.TorrentClientAction.key],
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.TORRENT_CLIENT.GetActiveTorrentList.key] })
            toast.success("Action performed")
            onSuccess?.()
        },
    })
}

export function useTorrentClientDownload(onSuccess?: () => void, mediaId?: number) {
    const { addDownloadingAnime } = useDownloadingAnime()

    return useServerMutation<boolean, TorrentClientDownload_Variables>({
        endpoint: API_ENDPOINTS.TORRENT_CLIENT.TorrentClientDownload.endpoint,
        method: API_ENDPOINTS.TORRENT_CLIENT.TorrentClientDownload.methods[0],
        mutationKey: [API_ENDPOINTS.TORRENT_CLIENT.TorrentClientDownload.key],
        onSuccess: async () => {
            if (mediaId) {
                addDownloadingAnime(mediaId)
            }
            toast.success("Download started")
            onSuccess?.()
        },
    })
}

export function useTorrentClientAddMagnetFromRule() {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, TorrentClientAddMagnetFromRule_Variables>({
        endpoint: API_ENDPOINTS.TORRENT_CLIENT.TorrentClientAddMagnetFromRule.endpoint,
        method: API_ENDPOINTS.TORRENT_CLIENT.TorrentClientAddMagnetFromRule.methods[0],
        mutationKey: [API_ENDPOINTS.TORRENT_CLIENT.TorrentClientAddMagnetFromRule.key],
        onSuccess: async () => {
            toast.success("Download started")
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.AUTO_DOWNLOADER.GetAutoDownloaderItems.key] })
        },
    })
}

export function useTorrentClientGetFiles({ torrent, provider }: { torrent: Nullish<HibikeTorrent_AnimeTorrent>, provider: Nullish<string> }) {
    return useServerQuery<Array<string>, TorrentClientGetFiles_Variables>({
        endpoint: API_ENDPOINTS.TORRENT_CLIENT.TorrentClientGetFiles.endpoint,
        method: API_ENDPOINTS.TORRENT_CLIENT.TorrentClientGetFiles.methods[0],
        queryKey: [API_ENDPOINTS.TORRENT_CLIENT.TorrentClientGetFiles.key, torrent, provider],
        enabled: !!torrent && !!provider,
        data: {
            torrent: torrent!,
            provider: provider!,
        },
    })
}

/**
 * Takes down one anime's "downloading" badge by hand, for when it is stuck on-screen with nothing
 * behind it in the torrent client — the torrent was removed elsewhere, or a queue attempt failed
 * after the badge was already written. The server only acts while the badge still reads
 * "downloading"; a finished or matched badge is left alone no matter what this is called with.
 *
 * Invalidates both surfaces that read this state: the library-wide badge poll, and the Enqueue
 * Future queue, whose `settled`/actionable check keys off the same recorded state.
 */
export function useClearDownloadingMediaState(mediaId: number | undefined) {
    const queryClient = useQueryClient()
    const { removeDownloadingAnime } = useDownloadingAnime()

    return useServerMutation<boolean>({
        endpoint: API_ENDPOINTS.TORRENT_CLIENT.ClearDownloadingMediaState.endpoint.replace("{mediaId}", String(mediaId ?? 0)),
        method: API_ENDPOINTS.TORRENT_CLIENT.ClearDownloadingMediaState.methods[0],
        mutationKey: [API_ENDPOINTS.TORRENT_CLIENT.ClearDownloadingMediaState.key, String(mediaId)],
        onSuccess: async cleared => {
            if (cleared && mediaId) removeDownloadingAnime(mediaId)
            await queryClient.invalidateQueries({ queryKey: DOWNLOADING_MEDIA_QUERY_KEY })
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureQueue.key] })
        },
    })
}

/**
 * The advisory "stuck downloading" list Enqueue Future's bulk-clear button reads: media IDs whose
 * badge has nothing live behind it in the torrent client, recomputed by a background check every few
 * minutes. Polled far more slowly than the badge poll above — nothing here needs to be as fresh as
 * HandleGetDownloadingMediaIds' 10s poll, since the server itself only recomputes this every 3 minutes.
 */
export function useGetStuckDownloadingMediaIds() {
    return useServerQuery<Array<number>>({
        endpoint: API_ENDPOINTS.TORRENT_CLIENT.GetStuckDownloadingMediaIds.endpoint,
        method: API_ENDPOINTS.TORRENT_CLIENT.GetStuckDownloadingMediaIds.methods[0],
        queryKey: [API_ENDPOINTS.TORRENT_CLIENT.GetStuckDownloadingMediaIds.key],
        refetchInterval: 60_000,
    })
}

/**
 * Bulk form of useClearDownloadingMediaState, for Enqueue Future's "clear all stuck" button. Takes the
 * ids currently shown as stuck so it can drop their optimistic entries the same way the single-item
 * clear does; the server re-validates every one of them at write time regardless, so a stale list here
 * costs at most a skipped id, never a wrongly cleared one.
 */
export function useClearAllStuckDownloadingMediaState(mediaIds: number[]) {
    const queryClient = useQueryClient()
    const { removeDownloadingAnime } = useDownloadingAnime()

    return useServerMutation<number>({
        endpoint: API_ENDPOINTS.TORRENT_CLIENT.ClearAllStuckDownloadingMediaState.endpoint,
        method: API_ENDPOINTS.TORRENT_CLIENT.ClearAllStuckDownloadingMediaState.methods[0],
        mutationKey: [API_ENDPOINTS.TORRENT_CLIENT.ClearAllStuckDownloadingMediaState.key],
        onSuccess: async cleared => {
            const n = cleared ?? 0
            for (const mediaId of mediaIds) removeDownloadingAnime(mediaId)
            toast.success(n > 0 ? `Cleared ${n} stuck download${n > 1 ? "s" : ""}` : "No stuck downloads to clear")
            await queryClient.invalidateQueries({ queryKey: DOWNLOADING_MEDIA_QUERY_KEY })
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ENQUEUE_FUTURE.GetEnqueueFutureQueue.key] })
            await queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.TORRENT_CLIENT.GetStuckDownloadingMediaIds.key] })
        },
    })
}
