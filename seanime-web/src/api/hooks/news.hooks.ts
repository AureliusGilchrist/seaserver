import { useServerQuery } from "@/api/client/requests"

export type RssItem = {
    title: string
    link: string
    description: string
    image: string
    publishedAt: number
    feedTitle: string
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
