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

export function useGetUserProfileStats(id: number, year?: number) {
    const base = `/api/v1/profile/user/${id}/stats`
    const endpoint = year ? `${base}?year=${year}` : base
    return useServerQuery<ProfileStats_ProfileStats>({
        endpoint,
        method: "GET",
        queryKey: ["USER-profile-stats", id, year ?? "rolling"],
        enabled: id > 0,
    })
}
