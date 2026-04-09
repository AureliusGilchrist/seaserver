import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { Manga_MangaScanResult } from "@/api/generated/types"

export function useScanMangaDirectories() {
    return useServerMutation<boolean, { forceRematch: boolean }>({
        endpoint: API_ENDPOINTS.MANGA_SCAN.ScanMangaDirectories.endpoint,
        method: API_ENDPOINTS.MANGA_SCAN.ScanMangaDirectories.methods[0],
        mutationKey: [API_ENDPOINTS.MANGA_SCAN.ScanMangaDirectories.key],
    })
}

export function useGetMangaScanResult(enabled?: boolean) {
    return useServerQuery<Manga_MangaScanResult>({
        endpoint: API_ENDPOINTS.MANGA_SCAN.GetMangaScanResult.endpoint,
        method: API_ENDPOINTS.MANGA_SCAN.GetMangaScanResult.methods[0],
        queryKey: [API_ENDPOINTS.MANGA_SCAN.GetMangaScanResult.key],
        enabled: enabled !== false,
    })
}

export function useMangaScanManualLink() {
    return useServerMutation<boolean, { folderName: string; mediaId: number }>({
        endpoint: API_ENDPOINTS.MANGA_SCAN.MangaScanManualLink.endpoint,
        method: API_ENDPOINTS.MANGA_SCAN.MangaScanManualLink.methods[0],
        mutationKey: [API_ENDPOINTS.MANGA_SCAN.MangaScanManualLink.key],
    })
}
