import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

// Types for unmatched torrents
export interface UnmatchedFile {
    name: string
    path: string
    relativePath: string
    size: number
    isVideo: boolean
    season?: string
    seasonNumber?: number
}

export interface UnmatchedSeason {
    name: string
    path: string
    files: UnmatchedFile[]
    number: number
}

export interface UnmatchedTorrent {
    name: string
    path: string
    size: number
    fileCount: number
    files: UnmatchedFile[]
    seasons?: UnmatchedSeason[]
    // Anime metadata (from AniList, stored when torrent is added)
    animeId?: number
    animeTitleRomaji?: string
    animeTitleNative?: string
}

export interface MatchRequest {
    torrentName: string
    selectedFiles: string[]
    animeId: number
    animeTitleJp: string
    animeTitleClean: string
}

export interface MatchResult {
    success: boolean
    movedFiles: string[]
    failedFiles: string[]
    destination: string
    errorMessage?: string
}

const UNMATCHED_ENDPOINTS = {
    GetUnmatchedTorrents: {
        key: "UNMATCHED-get-unmatched-torrents",
        methods: ["GET"] as const,
        endpoint: "/api/v1/unmatched/torrents",
    },
    GetUnmatchedTorrentContents: {
        key: "UNMATCHED-get-unmatched-torrent-contents",
        methods: ["POST"] as const,
        endpoint: "/api/v1/unmatched/torrent/contents",
    },
    MatchUnmatchedTorrent: {
        key: "UNMATCHED-match-unmatched-torrent",
        methods: ["POST"] as const,
        endpoint: "/api/v1/unmatched/match",
    },
    DeleteUnmatchedTorrent: {
        key: "UNMATCHED-delete-unmatched-torrent",
        methods: ["POST"] as const,
        endpoint: "/api/v1/unmatched/torrent/delete",
    },
}

export function useGetUnmatchedTorrents() {
    return useServerQuery<UnmatchedTorrent[]>({
        endpoint: UNMATCHED_ENDPOINTS.GetUnmatchedTorrents.endpoint,
        method: UNMATCHED_ENDPOINTS.GetUnmatchedTorrents.methods[0],
        queryKey: [UNMATCHED_ENDPOINTS.GetUnmatchedTorrents.key],
        gcTime: 0,
    })
}

export function useGetUnmatchedTorrentContents(torrentName: string | null) {
    return useServerMutation<UnmatchedTorrent, { name: string }>({
        endpoint: UNMATCHED_ENDPOINTS.GetUnmatchedTorrentContents.endpoint,
        method: UNMATCHED_ENDPOINTS.GetUnmatchedTorrentContents.methods[0],
        mutationKey: [UNMATCHED_ENDPOINTS.GetUnmatchedTorrentContents.key, torrentName],
    })
}

export function useMatchUnmatchedTorrent(onSuccess?: () => void) {
    const queryClient = useQueryClient()

    return useServerMutation<MatchResult, MatchRequest>({
        endpoint: UNMATCHED_ENDPOINTS.MatchUnmatchedTorrent.endpoint,
        method: UNMATCHED_ENDPOINTS.MatchUnmatchedTorrent.methods[0],
        mutationKey: [UNMATCHED_ENDPOINTS.MatchUnmatchedTorrent.key],
        onSuccess: async (data) => {
            if (data?.success) {
                toast.success(`Matched ${data.movedFiles?.length || 0} files successfully`)
            } else {
                toast.error(data?.errorMessage || "Some files failed to move")
            }
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: [UNMATCHED_ENDPOINTS.GetUnmatchedTorrents.key] }),
                queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.key] }),
                queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key] }),
                queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.LIBRARY_EXPLORER.GetLibraryExplorerFileTree.key] }),
            ])
            onSuccess?.()
        },
    })
}

export function useDeleteUnmatchedTorrent(onSuccess?: () => void) {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, { name: string }>({
        endpoint: UNMATCHED_ENDPOINTS.DeleteUnmatchedTorrent.endpoint,
        method: UNMATCHED_ENDPOINTS.DeleteUnmatchedTorrent.methods[0],
        mutationKey: [UNMATCHED_ENDPOINTS.DeleteUnmatchedTorrent.key],
        onSuccess: async () => {
            toast.success("Torrent deleted")
            await queryClient.invalidateQueries({ queryKey: [UNMATCHED_ENDPOINTS.GetUnmatchedTorrents.key] })
            onSuccess?.()
        },
    })
}
