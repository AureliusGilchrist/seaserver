import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { Nullish } from "@/types/common"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

// ─── To-watch list ───────────────────────────────────────────────────
//
// A profile's list of what they mean to watch, in the order they arranged. It starts blank and is
// built from the button on an anime's own page — see internal/handlers/profile_towatch.go. The list
// is what their public profile shows, so it lives on the server rather than in a browser, and it is
// allowed to be as long as its owner wants.
//
// Every mutation answers with the whole list, so the cache is set from the answer rather than
// invalidated and re-fetched.

/** One row of the list — the snapshot taken when it was added, plus the anime's id. */
export interface ToWatchEntry {
    animeId: number
    title: string
    description?: string
    coverImage?: string
    bannerImage?: string
    format?: string
    episodes?: number
    duration?: number
    season?: string
    seasonYear?: number
    status?: string
    meanScore?: number
    genres?: string[]
    studio?: string
}

export interface AddToWatchBody {
    animeId: number
    title: string
    description?: string
    coverImage?: string
    bannerImage?: string
    format?: string
    episodes?: number
    duration?: number
    season?: string
    seasonYear?: number
    status?: string
    meanScore?: number
    genres?: string[]
    studio?: string
}

const TO_WATCH_KEY = ["to-watch"]

function useToWatchCacheWriter() {
    const queryClient = useQueryClient()
    return (data?: ToWatchEntry[] | boolean) => {
        if (Array.isArray(data)) {
            queryClient.setQueryData(TO_WATCH_KEY, data)
        } else {
            // A clear answers true — the list is now empty, and the cache can say so without a fetch.
            queryClient.setQueryData(TO_WATCH_KEY, [])
        }
    }
}

export function useGetToWatch() {
    return useServerQuery<ToWatchEntry[]>({
        endpoint: "/api/v1/profile/to-watch",
        method: "GET",
        queryKey: TO_WATCH_KEY,
        staleTime: 30_000,
        refetchOnWindowFocus: true,
    })
}

/** Somebody else's list — what their public profile shows. */
export function useGetToWatchForProfile(profileId: Nullish<number>) {
    return useServerQuery<ToWatchEntry[]>({
        endpoint: `/api/v1/profile/to-watch/user/${profileId ?? 0}`,
        method: "GET",
        queryKey: ["to-watch", String(profileId ?? 0)],
        staleTime: 30_000,
        enabled: !!profileId,
    })
}

export function useAddToWatch(onSuccess?: (data?: ToWatchEntry[]) => void) {
    const writeCache = useToWatchCacheWriter()

    return useServerMutation<ToWatchEntry[], AddToWatchBody>({
        endpoint: "/api/v1/profile/to-watch/add",
        method: "POST",
        mutationKey: ["to-watch-add"],
        onSuccess: async (data) => {
            toast.success("Added to your to-watch list")
            writeCache(data)
            onSuccess?.(data)
        },
        onError: (error) => {
            const message = (error as Error)?.message || ""
            if (message.includes("already in the to-watch list")) {
                toast.info("Already in your to-watch list")
                return
            }
            toast.error("Could not add to your to-watch list", { description: message })
        },
    })
}

export function useRemoveFromToWatch() {
    const writeCache = useToWatchCacheWriter()
    return useServerMutation<ToWatchEntry[], { animeId: number }>({
        endpoint: "/api/v1/profile/to-watch/remove",
        method: "POST",
        mutationKey: ["to-watch-remove"],
        onSuccess: async (data) => writeCache(data),
    })
}

/**
 * Rewrites the running order. The body is the anime ids in their new order, whole — so a move is
 * one request rather than a sequence of them.
 */
export function useReorderToWatch() {
    const writeCache = useToWatchCacheWriter()
    return useServerMutation<ToWatchEntry[], { animeIds: number[] }>({
        endpoint: "/api/v1/profile/to-watch/reorder",
        method: "POST",
        mutationKey: ["to-watch-reorder"],
        onSuccess: async (data) => writeCache(data),
    })
}

export function useClearToWatch() {
    const writeCache = useToWatchCacheWriter()
    return useServerMutation<boolean, {}>({
        endpoint: "/api/v1/profile/to-watch/clear",
        method: "POST",
        mutationKey: ["to-watch-clear"],
        onSuccess: async () => {
            toast.success("To-watch list cleared")
            writeCache(true)
        },
    })
}
