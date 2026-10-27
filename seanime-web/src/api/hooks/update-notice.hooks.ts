import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

// ─── Update notice ───────────────────────────────────────────────────
//
// What the server last updated to, kept on the server until the client has seen it — see
// internal/handlers/update_notice.go. It is shown after sign-in (never at the PIN screen) and it
// never dismisses itself: the person looking at it presses the X.

export interface UpdateNotice {
    /** The commit's subject line. */
    title: string
    /** The commit's body. */
    description?: string
    commit?: string
    updatedAt: string
    filesChanged?: number
    insertions?: number
    deletions?: number
}

export function useGetUpdateNotice({ enabled }: { enabled?: boolean } = {}) {
    return useServerQuery<UpdateNotice | null>({
        endpoint: "/api/v1/update/notice",
        method: "GET",
        queryKey: ["update-notice"],
        staleTime: 0,
        refetchInterval: 60_000,
        enabled,
    })
}

export function useUpdateBackend() {
    return useServerMutation<{
        started: boolean,
        message: string,
        files?: { path: string, insertions: number, deletions: number }[]
    }, {}>({
        endpoint: "/api/v1/update/backend",
        method: "POST",
        mutationKey: ["update-backend"],
    })
}

export interface FileDelta {
    path: string
    insertions: number
    deletions: number
}

export interface PendingCommit {
    hash: string
    subject: string
    author: string
    /** Unix seconds. */
    date: number
}

/** The server's cached update status (internal/updater/gitstatus.go), refreshed every 5 minutes. */
export interface BackendUpdateStatus {
    version: string
    commit: string
    behind: boolean
    commitsBehind: number
    commits: PendingCommit[]
    files: FileDelta[]
    blocked?: string
    updating: boolean
    checking: boolean
    lastChecked?: number
    nextCheck?: number
    lastError?: string
    lastUpdated?: string
}

export const BACKEND_UPDATE_STATUS_KEY = ["update-backend-status"]

export function useBackendUpdateStatus(enabled: boolean = true) {
    return useServerQuery<BackendUpdateStatus>({
        endpoint: "/api/v1/update/backend/status",
        method: "GET",
        queryKey: BACKEND_UPDATE_STATUS_KEY,
        staleTime: 0,
        refetchInterval: 30_000,
        enabled,
        muteError: true,
    })
}

/** The reason a server request failed, in the server's own words when it sent any. */
export function serverErrorMessage(e: any): string {
    return e?.response?.data?.error || e?.message || "unknown error"
}

export function useCheckBackendUpdate() {
    return useServerMutation<{ behind: boolean, blocked?: string, files: FileDelta[] }, {}>({
        endpoint: "/api/v1/update/backend/check",
        method: "POST",
        mutationKey: ["update-backend-check"],
    })
}

export function useRecordEpisodeWatched() {
    return useServerMutation<boolean, { mediaId: number, episodeNumber: number, totalEpisodes: number }>({
        endpoint: "/api/v1/profile/timeline/episode-watched",
        method: "POST",
        mutationKey: ["record-episode-watched"],
    })
}

export function useOverwriteAnilist() {
    return useServerMutation<boolean, {}>({
        endpoint: "/api/v1/anilist/overwrite",
        method: "POST",
        mutationKey: ["anilist-overwrite"],
    })
}

export interface OverwriteChange {
    kind: "add" | "update" | "remove"
    media: "anime" | "manga"
    mediaId: number
    title: string
    fields: string[]
}

export interface OverwritePreview {
    changes: OverwriteChange[]
    add: number
    update: number
    remove: number
    unchanged: number
}

export function useOverwriteAnilistPreview() {
    return useServerMutation<OverwritePreview, {}>({
        endpoint: "/api/v1/anilist/overwrite/preview",
        method: "POST",
        mutationKey: ["anilist-overwrite-preview"],
    })
}

export function useDismissUpdateNotice() {
    const queryClient = useQueryClient()
    return useServerMutation<boolean, {}>({
        endpoint: "/api/v1/update/notice/dismiss",
        method: "POST",
        mutationKey: ["update-notice-dismiss"],
        onSuccess: async () => {
            await queryClient.setQueryData(["update-notice"], null)
        },
        onError: () => {
            toast.error("Could not dismiss the update notice")
        },
    })
}
