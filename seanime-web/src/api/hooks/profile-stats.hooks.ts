import { useServerQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { ProfileStats_ProfileStats } from "@/api/generated/types"

export function useGetProfileStats(year?: number) {
    const endpoint = year
        ? `${API_ENDPOINTS.PROFILE_STATS.GetProfileStats.endpoint}?year=${year}`
        : API_ENDPOINTS.PROFILE_STATS.GetProfileStats.endpoint
    return useServerQuery<ProfileStats_ProfileStats>({
        endpoint,
        method: API_ENDPOINTS.PROFILE_STATS.GetProfileStats.methods[0],
        queryKey: [API_ENDPOINTS.PROFILE_STATS.GetProfileStats.key, year ?? "rolling"],
    })
}
