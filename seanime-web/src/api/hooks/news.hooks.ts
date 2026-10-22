import { useServerQuery, buildSeaQuery } from "@/api/client/requests"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useAtomValue } from "jotai/react"
import { serverAuthTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { API_ENDPOINTS } from "@/api/generated/endpoints"

export type RssItem = {
    title: string
    link: string
    description: string
    image: string
    publishedAt: number
    feedTitle: string
    author: string
    categories: string[]
}

export type RssFeedResponse = {
    items: RssItem[]
    feeds: string[]
    errors: string[]
    updatedAt: number
}

export function useGetNewsFeed() {
    return useServerQuery<RssFeedResponse>({
        endpoint: "/api/v1/news",
        method: "GET",
        queryKey: ["news-feed"],
        // The server caches for 15 minutes; revalidate whenever the home page is reopened.
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    })
}

// ─── RSS notifications + cross-profile timeline (the News page's timeline section) ───────

export type NewsNotification = {
    id: number
    createdAt: string
    type: string
    title: string
    body: string
    imageUrl: string
    mediaId: number
    isRead: boolean
    /** JSON string; for news notifications it carries { link, feedTitle, publishedAt }. */
    metadata: string
}

export type NewsNotificationsResponse = {
    notifications: NewsNotification[]
    totalCount: number
    unreadCount: number
}

// RSS notifications arrive five at a time — that is the whole point of the News page's
// timeline: a digest, not a firehose. "Load more" appends the next five. Keyed under the
// notifications query's prefix so the drawer's mark-read actions refresh these pages too.
export const NEWS_NOTIFICATIONS_PER_PAGE = 5

export function useGetNewsNotifications(enabled: boolean = true) {
    const password = useAtomValue(serverAuthTokenAtom)
    return useInfiniteQuery({
        queryKey: [API_ENDPOINTS.NOTIFICATION.GetNotifications.key, "news", NEWS_NOTIFICATIONS_PER_PAGE],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
            return buildSeaQuery<NewsNotificationsResponse>({
                endpoint: `/api/v1/notifications?type=news&page=${pageParam}&limit=${NEWS_NOTIFICATIONS_PER_PAGE}`,
                method: "GET",
                password: password,
            })
        },
        getNextPageParam: (lastPage, allPages) => {
            if (!lastPage) return undefined
            const loaded = allPages.reduce((sum, p) => sum + (p?.notifications?.length ?? 0), 0)
            return loaded < (lastPage.totalCount ?? 0) ? allPages.length + 1 : undefined
        },
        enabled,
        staleTime: 60 * 1000,
    })
}

export type ProfileTimelineEvent = {
    id: number
    eventType: string
    mediaId: number
    metadata: string
    createdAt: string
    mediaTitle?: string | null
    mediaImage?: string | null
    mediaType: string
    achievementIconSvg?: string | null
    achievementDesc?: string | null
    profileId: number
    username: string
}

export type ProfilesTimelineResponse = {
    events: ProfileTimelineEvent[]
    page: number
    hasMore: boolean
    total: number
}

// What every profile on the server has been doing, merged newest-first by the server.
export function useGetProfilesTimeline(enabled: boolean = true) {
    const password = useAtomValue(serverAuthTokenAtom)
    return useInfiniteQuery({
        queryKey: ["profiles-timeline"],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
            return buildSeaQuery<ProfilesTimelineResponse>({
                endpoint: `/api/v1/profiles/timeline?page=${pageParam}&pageSize=10`,
                method: "GET",
                password: password,
            })
        },
        getNextPageParam: (lastPage) => (lastPage?.hasMore ? lastPage.page + 1 : undefined),
        enabled,
        staleTime: 60 * 1000,
    })
}

/** Compact relative time for a feed item: "3h ago", "2d ago", or the date. */
export function formatNewsDate(unix: number): string {
    const diff = Date.now() / 1000 - unix
    if (diff < 0) return "just now"
    if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`
    return new Date(unix * 1000).toLocaleDateString()
}
