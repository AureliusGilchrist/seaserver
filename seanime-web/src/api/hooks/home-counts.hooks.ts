import { useServerQuery } from "@/api/client/requests"

export interface HomeCounts {
    animeFiles: number
    mangaChapters: number
    mangaAvailable: boolean
    animeSize: string
}

/** What is on the server's disks. Cheap, so it is refetched on every visit to stay exact. */
export function useGetHomeCounts() {
    return useServerQuery<HomeCounts>({
        endpoint: "/api/v1/home/counts",
        method: "GET",
        queryKey: ["HOME-get-counts"],
        staleTime: 0,
        refetchOnWindowFocus: true,
    })
}

export function useGetMangaDownloadSize() {
    return useServerQuery<{ ready: boolean, size: string }>({
        endpoint: "/api/v1/home/manga-size",
        method: "GET",
        queryKey: ["HOME-get-manga-size"],
        refetchInterval: query => query.state.status === "error" ? false : query.state.data?.ready ? 300_000 : 2000,
    })
}
