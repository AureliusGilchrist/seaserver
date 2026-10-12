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
