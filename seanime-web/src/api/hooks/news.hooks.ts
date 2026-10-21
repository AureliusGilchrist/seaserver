import { useServerQuery } from "@/api/client/requests"

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

/** Compact relative time for a feed item: "3h ago", "2d ago", or the date. */
export function formatNewsDate(unix: number): string {
    const diff = Date.now() / 1000 - unix
    if (diff < 0) return "just now"
    if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`
    return new Date(unix * 1000).toLocaleDateString()
}
