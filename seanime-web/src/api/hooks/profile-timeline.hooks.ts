import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { buildSeaQuery } from "@/api/client/requests"
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { profileSessionTokenAtom, serverAuthTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useAtomValue } from "jotai"

// ─────────────────────────────────────────────────────────────────────────────
// AniList-style profile timeline: posts + watch activity, likes, replies.
// Server: internal/handlers/profile_posts.go

export type TimelineProfileSummary = {
    id: number
    name: string
    avatar: string
    displayTitle?: string
    nameColorCss?: string
}

export type TimelineActivity = {
    id: number
    eventType: string
    mediaId: number
    metadata: string
    createdAt: string
    mediaTitle?: string
    mediaImage?: string
    mediaType: string
    achievementIconSvg?: string
    achievementDesc?: string
}

export type TimelineFeedItem = {
    key: string
    kind: "post" | "activity"
    createdAt: string
    author: TimelineProfileSummary
    wallProfile?: TimelineProfileSummary
    postId?: number
    content?: string
    isSpoiler?: boolean
    isEdited?: boolean
    mediaId?: number
    mediaType?: string
    activity?: TimelineActivity
    episodeFrom?: number
    episodeTo?: number
    likeCount: number
    likedByMe: boolean
    replyCount: number
    canEdit: boolean
    canDelete: boolean
}

export type TimelineFeedResponse = {
    items: TimelineFeedItem[]
    page: number
    hasMore: boolean
}

export type TimelineReplyItem = {
    id: number
    targetKey: string
    author: TimelineProfileSummary
    content: string
    createdAt: string
    canDelete: boolean
}

export const TIMELINE_FEED_KEY = "profile-timeline-feed"
const TIMELINE_REPLIES_KEY = "profile-timeline-replies"

/** profileId set → that profile's wall; undefined → the global community feed. */
export function useTimelineFeed(profileId: number | undefined, community: boolean) {
    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)
    return useInfiniteQuery({
        queryKey: [TIMELINE_FEED_KEY, community ? "community" : profileId],
        enabled: community || !!profileId,
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
            const endpoint = community
                ? `/api/v1/community/timeline-feed?page=${pageParam}`
                : `/api/v1/profile/timeline-feed?profileId=${profileId}&page=${pageParam}`
            const res = await buildSeaQuery<TimelineFeedResponse>({ endpoint, method: "GET", password, profileToken })
            return res ?? { items: [], page: pageParam as number, hasMore: false }
        },
        getNextPageParam: last => last.hasMore ? last.page + 1 : undefined,
    })
}

function useInvalidateTimeline() {
    const qc = useQueryClient()
    return () => qc.invalidateQueries({ queryKey: [TIMELINE_FEED_KEY] })
}

export function useCreateProfilePost() {
    const invalidate = useInvalidateTimeline()
    return useServerMutation<TimelineFeedItem, { wallProfileId: number, content: string, isSpoiler: boolean, mediaId?: number, mediaType?: string }>({
        endpoint: "/api/v1/profile/posts",
        method: "POST",
        mutationKey: ["create-profile-post"],
        onSuccess: () => invalidate(),
    })
}

export function useUpdateProfilePost(postId: number) {
    const invalidate = useInvalidateTimeline()
    return useServerMutation<boolean, { content: string, isSpoiler: boolean }>({
        endpoint: `/api/v1/profile/posts/${postId}`,
        method: "PATCH",
        mutationKey: ["update-profile-post", postId],
        onSuccess: () => invalidate(),
    })
}

export function useDeleteProfilePost(postId: number) {
    const invalidate = useInvalidateTimeline()
    return useServerMutation<boolean>({
        endpoint: `/api/v1/profile/posts/${postId}`,
        method: "DELETE",
        mutationKey: ["delete-profile-post", postId],
        onSuccess: () => invalidate(),
    })
}

export function useToggleTimelineLike() {
    return useServerMutation<{ liked: boolean, likeCount: number }, { targetKey: string }>({
        endpoint: "/api/v1/profile/timeline/like",
        method: "POST",
        mutationKey: ["toggle-timeline-like"],
    })
}

export function useTimelineReplies(targetKey: string, enabled: boolean) {
    return useServerQuery<TimelineReplyItem[]>({
        endpoint: `/api/v1/profile/timeline/replies?targetKey=${encodeURIComponent(targetKey)}`,
        method: "GET",
        queryKey: [TIMELINE_REPLIES_KEY, targetKey],
        enabled,
    })
}

export function useCreateTimelineReply(targetKey: string) {
    const qc = useQueryClient()
    return useServerMutation<TimelineReplyItem, { targetKey: string, content: string }>({
        endpoint: "/api/v1/profile/timeline/replies",
        method: "POST",
        mutationKey: ["create-timeline-reply", targetKey],
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: [TIMELINE_REPLIES_KEY, targetKey] })
            qc.invalidateQueries({ queryKey: [TIMELINE_FEED_KEY] })
        },
    })
}

export function useDeleteTimelineReply(targetKey: string) {
    const qc = useQueryClient()
    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)
    return useMutation({
        mutationKey: ["delete-timeline-reply", targetKey],
        mutationFn: (id: number) => buildSeaQuery<boolean>({
            endpoint: `/api/v1/profile/timeline/replies/${id}`,
            method: "DELETE",
            password,
            profileToken,
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: [TIMELINE_REPLIES_KEY, targetKey] })
            qc.invalidateQueries({ queryKey: [TIMELINE_FEED_KEY] })
        },
    })
}
