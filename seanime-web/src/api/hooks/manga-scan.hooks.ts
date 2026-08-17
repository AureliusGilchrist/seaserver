import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import {
    Manga_MangaScanCandidate,
    Manga_MangaScanResult,
    Manga_MangaScanReviewDecision,
    Manga_MangaScanReviewResult,
} from "@/api/generated/types"

export function useScanMangaDirectories() {
    return useServerMutation<boolean, { forceRematch: boolean, reviewMatches: boolean }>({
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

/**
 * Accepts or dismisses the matches a scan proposed. Nothing is linked until this runs.
 */
export function useResolveMangaScanReview() {
    return useServerMutation<Manga_MangaScanReviewResult, { decisions: Manga_MangaScanReviewDecision[] }>({
        endpoint: API_ENDPOINTS.MANGA_SCAN.ResolveMangaScanReview.endpoint,
        method: API_ENDPOINTS.MANGA_SCAN.ResolveMangaScanReview.methods[0],
        mutationKey: [API_ENDPOINTS.MANGA_SCAN.ResolveMangaScanReview.key],
    })
}

/**
 * Finds the AniList entries a name might refer to, searching it several ways — see the server's
 * titleSearchVariants. Used to open the Link dialog with candidates already found.
 */
export function useSuggestMangaScanMatches() {
    return useServerMutation<Manga_MangaScanCandidate[], { title: string }>({
        endpoint: API_ENDPOINTS.MANGA_SCAN.SuggestMangaScanMatches.endpoint,
        method: API_ENDPOINTS.MANGA_SCAN.SuggestMangaScanMatches.methods[0],
        mutationKey: [API_ENDPOINTS.MANGA_SCAN.SuggestMangaScanMatches.key],
    })
}

export function useMangaScanManualLink() {
    return useServerMutation<boolean, { folderName: string; mediaId: number }>({
        endpoint: API_ENDPOINTS.MANGA_SCAN.MangaScanManualLink.endpoint,
        method: API_ENDPOINTS.MANGA_SCAN.MangaScanManualLink.methods[0],
        mutationKey: [API_ENDPOINTS.MANGA_SCAN.MangaScanManualLink.key],
    })
}
