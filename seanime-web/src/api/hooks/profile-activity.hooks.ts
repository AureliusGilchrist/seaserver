import { useServerMutation, useServerQuery } from "../client/requests"
import { ProfileActivity_List } from "../generated/types"
import { API_ENDPOINTS } from "../generated/endpoints"

export type SetProfileActivityVariables = {
    mediaTitle: string
    chapterNumber: number
    progressPercent: number
}

export function useGetProfilesActivity(enabled: boolean = true) {
    return useServerQuery<ProfileActivity_List | null>({
        endpoint: API_ENDPOINTS.PROFILE_ACTIVITY.GetProfilesActivity.endpoint,
        method: API_ENDPOINTS.PROFILE_ACTIVITY.GetProfilesActivity.methods[0],
        queryKey: [API_ENDPOINTS.PROFILE_ACTIVITY.GetProfilesActivity.key],
        enabled,
        refetchInterval: 15000,
    })
}

export function useSetProfileActivity() {
    return useServerMutation<boolean, SetProfileActivityVariables>({
        endpoint: API_ENDPOINTS.PROFILE_ACTIVITY.SetProfileActivity.endpoint,
        method: API_ENDPOINTS.PROFILE_ACTIVITY.SetProfileActivity.methods[0],
        mutationKey: [API_ENDPOINTS.PROFILE_ACTIVITY.SetProfileActivity.key],
    })
}
