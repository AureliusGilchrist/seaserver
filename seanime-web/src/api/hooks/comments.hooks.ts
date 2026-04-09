import { useServerMutation, useServerQuery, buildSeaQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { CommentsResponse } from "@/api/generated/types"
import { profileSessionTokenAtom, serverAuthTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useQueryClient } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"

export function useGetComments(mediaId: number | string, mediaType: string, sort: string, enabled?: boolean) {
    return useServerQuery<CommentsResponse>({
        endpoint: API_ENDPOINTS.COMMENTS.GetComments.endpoint + `?mediaId=${mediaId}&mediaType=${mediaType}&sort=${sort}`,
        method: API_ENDPOINTS.COMMENTS.GetComments.methods[0],
        queryKey: [API_ENDPOINTS.COMMENTS.GetComments.key, String(mediaId), mediaType, sort],
        enabled: enabled !== false && !!mediaId && !!mediaType,
    })
}

export function useCreateComment(mediaId: number | string, mediaType: string, sort: string) {
    const qc = useQueryClient()

    return useServerMutation<any, { mediaId: number; mediaType: string; parentId?: number; content: string; isSpoiler?: boolean }>({
        endpoint: API_ENDPOINTS.COMMENTS.CreateComment.endpoint,
        method: API_ENDPOINTS.COMMENTS.CreateComment.methods[0],
        mutationKey: [API_ENDPOINTS.COMMENTS.CreateComment.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.COMMENTS.GetComments.key, String(mediaId), mediaType, sort] })
        },
    })
}

export function useEditComment(mediaId: number | string, mediaType: string, sort: string) {
    const qc = useQueryClient()
    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)

    return useMutation({
        mutationKey: [API_ENDPOINTS.COMMENTS.EditComment.key],
        mutationFn: async (variables: { commentId: number; content: string }) => {
            return buildSeaQuery<any, { content: string }>({
                endpoint: `/api/v1/comments/${variables.commentId}`,
                method: "PATCH",
                data: { content: variables.content },
                password: password,
                profileToken: profileToken,
            })
        },
        onError: (error: any) => {
            const msg = error?.response?.data?.error || "Failed to edit comment"
            toast.error(msg)
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.COMMENTS.GetComments.key, String(mediaId), mediaType, sort] })
        },
    })
}

export function useDeleteComment(mediaId: number | string, mediaType: string, sort: string) {
    const qc = useQueryClient()
    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)

    return useMutation({
        mutationKey: [API_ENDPOINTS.COMMENTS.DeleteComment.key],
        mutationFn: async (variables: { commentId: number }) => {
            return buildSeaQuery<any>({
                endpoint: `/api/v1/comments/${variables.commentId}`,
                method: "DELETE",
                password: password,
                profileToken: profileToken,
            })
        },
        onError: (error: any) => {
            const msg = error?.response?.data?.error || "Failed to delete comment"
            toast.error(msg)
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.COMMENTS.GetComments.key, String(mediaId), mediaType, sort] })
        },
    })
}

export function useVoteComment(mediaId: number | string, mediaType: string, sort: string) {
    const qc = useQueryClient()
    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)

    return useMutation({
        mutationKey: [API_ENDPOINTS.COMMENTS.VoteComment.key],
        mutationFn: async (variables: { commentId: number; value: number }) => {
            return buildSeaQuery<any, { value: number }>({
                endpoint: `/api/v1/comments/${variables.commentId}/vote`,
                method: "POST",
                data: { value: variables.value },
                password: password,
                profileToken: profileToken,
            })
        },
        onError: (error: any) => {
            const msg = error?.response?.data?.error || "Failed to vote"
            toast.error(msg)
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.COMMENTS.GetComments.key, String(mediaId), mediaType, sort] })
        },
    })
}
