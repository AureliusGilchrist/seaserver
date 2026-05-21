import { useServerQuery, useServerMutation, buildSeaQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
type Handlers_ActivityFeedEntry = any
type Handlers_CommunityResponse = any
type Handlers_LevelResponse = any
type Handlers_ProfilePageResponse = any
type Handlers_TimelineResponse = any
import { serverAuthTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { useAtomValue } from "jotai/react"
import { toast } from "sonner"

export function useGetCommunityProfiles() {
    return useServerQuery<Handlers_CommunityResponse>({
        endpoint: API_ENDPOINTS.COMMUNITY.GetCommunityProfiles.endpoint,
        method: API_ENDPOINTS.COMMUNITY.GetCommunityProfiles.methods[0],
        queryKey: [API_ENDPOINTS.COMMUNITY.GetCommunityProfiles.key],
    })
}

export function useGetActivityFeed() {
    return useServerQuery<Handlers_ActivityFeedEntry[]>({
        endpoint: API_ENDPOINTS.COMMUNITY.GetActivityFeed.endpoint,
        method: API_ENDPOINTS.COMMUNITY.GetActivityFeed.methods[0],
        queryKey: [API_ENDPOINTS.COMMUNITY.GetActivityFeed.key],
    })
}

export function useGetMyProfile() {
    return useServerQuery<Handlers_ProfilePageResponse>({
        endpoint: API_ENDPOINTS.PROFILE_PAGE.GetMyProfile.endpoint,
        method: API_ENDPOINTS.PROFILE_PAGE.GetMyProfile.methods[0],
        queryKey: [API_ENDPOINTS.PROFILE_PAGE.GetMyProfile.key],
    })
}

export function useGetUserProfile(id: number) {
    return useServerQuery<Handlers_ProfilePageResponse>({
        endpoint: API_ENDPOINTS.PROFILE_PAGE.GetUserProfile.endpoint.replace("{id}", String(id)),
        method: API_ENDPOINTS.PROFILE_PAGE.GetUserProfile.methods[0],
        queryKey: [API_ENDPOINTS.PROFILE_PAGE.GetUserProfile.key, id],
        enabled: id > 0,
    })
}

export function useGetLevel() {
    return useServerQuery<Handlers_LevelResponse>({
        endpoint: API_ENDPOINTS.PROFILE_PAGE.GetLevel.endpoint,
        method: API_ENDPOINTS.PROFILE_PAGE.GetLevel.methods[0],
        queryKey: [API_ENDPOINTS.PROFILE_PAGE.GetLevel.key],
    })
}

export function useUpdateBio() {
    const qc = useQueryClient()
    return useServerMutation<unknown, { bio: string }>({
        endpoint: API_ENDPOINTS.PROFILE_PAGE.UpdateBio.endpoint,
        method: API_ENDPOINTS.PROFILE_PAGE.UpdateBio.methods[0],
        mutationKey: [API_ENDPOINTS.PROFILE_PAGE.UpdateBio.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.PROFILE_PAGE.GetMyProfile.key] })
            toast.success("Bio updated")
        },
    })
}

export function useGetTimeline(pageSize = 50) {
    const password = useAtomValue(serverAuthTokenAtom)
    return useInfiniteQuery({
        queryKey: [API_ENDPOINTS.TIMELINE.GetTimeline.key, pageSize],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
            return buildSeaQuery<Handlers_TimelineResponse>({
                endpoint: API_ENDPOINTS.TIMELINE.GetTimeline.endpoint,
                method: "GET",
                params: { page: pageParam, pageSize },
                password: password,
            })
        },
        getNextPageParam: (lastPage) => {
            if (!lastPage?.hasMore) return undefined
            return lastPage.page + 1
        },
    })
}
