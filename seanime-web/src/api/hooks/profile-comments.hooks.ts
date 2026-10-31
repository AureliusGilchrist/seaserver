import { useServerQuery } from "../client/requests"
import { API_ENDPOINTS } from "../generated/endpoints"
import { ProfileCommentItem as GeneratedProfileCommentItem, ProfileCommentsResponse as GeneratedProfileCommentsResponse } from "../generated/types"

// ─────────────────────────────────────────────────────────────────────────────
// Profile comments (Comments tab on profile pages)

export type ProfileCommentItem = GeneratedProfileCommentItem & {
    mediaImage?: string
    isReply?: boolean
}

export type ProfileCommentsResponse = Omit<GeneratedProfileCommentsResponse, "comments"> & {
    comments?: ProfileCommentItem[]
}

export function useGetProfileComments(profileId: number | undefined, enabled: boolean = true) {
    return useServerQuery<ProfileCommentsResponse | null>({
        endpoint: `${API_ENDPOINTS.PROFILE_COMMENTS.GetProfileComments.endpoint}?profileId=${profileId ?? 0}`,
        method: API_ENDPOINTS.PROFILE_COMMENTS.GetProfileComments.methods[0],
        queryKey: [API_ENDPOINTS.PROFILE_COMMENTS.GetProfileComments.key, profileId],
        enabled: enabled && !!profileId,
    })
}
