import { useServerQuery } from "@/api/client/requests"

export interface HomeCounts {
    animeFiles: number
    mangaChapters: number
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
