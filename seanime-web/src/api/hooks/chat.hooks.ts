import { useQueryClient, useMutation } from "@tanstack/react-query"
import { API_ENDPOINTS } from "../generated/endpoints"
import { Chat_Conversation, Chat_Conversations, Chat_ImageUpload, Chat_Message, Chat_Messages, Chat_PeerKey, Chat_State } from "../generated/types"
import { useServerMutation, useServerQuery } from "../client/requests"

// ─────────────────────────────────────────────────────────────────────────────
// Variables types (server binds the JSON bodies in internal/handlers/chat.go)

export type ChatSetupPinVariables = {
    salt: string
    verifier: string
    publicKey: string
    encryptedPrivateKey: string
}

export type ChatSendMessageVariables = {
    toProfileId: number
    iv: string
    ciphertext: string
    replyToId?: string
    imageId?: string
    imageIv?: string
}

export type ChatEditMessageVariables = {
    messageId: string
    iv: string
    ciphertext: string
}

export type ChatDeleteMessageVariables = {
    messageId: string
}

export type ChatReactMessageVariables = {
    messageId: string
    iv: string
    ciphertext: string
}

export type ChatMarkReadVariables = {
    withProfileId: number
}

export type ChatTypingVariables = {
    toProfileId: number
    isTyping: boolean
}

export type ChatUploadImageVariables = {
    toProfileId: number
    iv: string
    ciphertext: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile comments (Comments tab on profile pages)

export type ProfileCommentItem = {
    id: number
    mediaId: number
    mediaType: string
    mediaTitle: string
    content: string
    isEdited: boolean
    isSpoiler: boolean
    createdAt: string
    updatedAt: string
}

export type ProfileCommentsResponse = {
    comments: ProfileCommentItem[]
    totalCount: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries

export function useGetChatState(enabled: boolean = true) {
    return useServerQuery<Chat_State | null>({
        endpoint: API_ENDPOINTS.CHAT.GetChatState.endpoint,
        method: API_ENDPOINTS.CHAT.GetChatState.methods[0],
        queryKey: [API_ENDPOINTS.CHAT.GetChatState.key],
        enabled,
    })
}

export function useGetChatConversations(enabled: boolean = true) {
    return useServerQuery<Chat_Conversations | null>({
        endpoint: API_ENDPOINTS.CHAT.GetChatConversations.endpoint,
        method: API_ENDPOINTS.CHAT.GetChatConversations.methods[0],
        queryKey: [API_ENDPOINTS.CHAT.GetChatConversations.key],
        enabled,
        refetchInterval: 30000,
    })
}

export function useGetChatMessages(withProfileId: number | undefined, enabled: boolean = true) {
    return useServerQuery<Chat_Messages | null>({
        endpoint: `${API_ENDPOINTS.CHAT.GetChatMessages.endpoint}?profileId=${withProfileId ?? 0}`,
        method: API_ENDPOINTS.CHAT.GetChatMessages.methods[0],
        queryKey: [API_ENDPOINTS.CHAT.GetChatMessages.key, withProfileId],
        enabled: enabled && !!withProfileId,
    })
}

export function useGetChatPeerKey(profileId: number | undefined, enabled: boolean = true) {
    return useServerQuery<Chat_PeerKey | null>({
        endpoint: `${API_ENDPOINTS.CHAT.GetChatPeerKey.endpoint}?profileId=${profileId ?? 0}`,
        method: API_ENDPOINTS.CHAT.GetChatPeerKey.methods[0],
        queryKey: [API_ENDPOINTS.CHAT.GetChatPeerKey.key, profileId],
        enabled: enabled && !!profileId,
    })
}

export function useGetProfileComments(profileId: number | undefined, enabled: boolean = true) {
    return useServerQuery<ProfileCommentsResponse | null>({
        endpoint: `${API_ENDPOINTS.CHAT.GetProfileComments.endpoint}?profileId=${profileId ?? 0}`,
        method: API_ENDPOINTS.CHAT.GetProfileComments.methods[0],
        queryKey: [API_ENDPOINTS.CHAT.GetProfileComments.key, profileId],
        enabled: enabled && !!profileId,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations

export function useSetupChatPin() {
    const qc = useQueryClient()
    return useServerMutation<Chat_State, ChatSetupPinVariables>({
        endpoint: API_ENDPOINTS.CHAT.SetupChatPin.endpoint,
        method: API_ENDPOINTS.CHAT.SetupChatPin.methods[0],
        mutationKey: [API_ENDPOINTS.CHAT.SetupChatPin.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.CHAT.GetChatState.key] })
        },
    })
}

export function useSendChatMessage() {
    return useServerMutation<Chat_Message, ChatSendMessageVariables>({
        endpoint: API_ENDPOINTS.CHAT.SendChatMessage.endpoint,
        method: API_ENDPOINTS.CHAT.SendChatMessage.methods[0],
        mutationKey: [API_ENDPOINTS.CHAT.SendChatMessage.key],
    })
}

export function useEditChatMessage() {
    return useServerMutation<Chat_Message, ChatEditMessageVariables>({
        endpoint: API_ENDPOINTS.CHAT.EditChatMessage.endpoint,
        method: API_ENDPOINTS.CHAT.EditChatMessage.methods[0],
        mutationKey: [API_ENDPOINTS.CHAT.EditChatMessage.key],
    })
}

export function useDeleteChatMessage() {
    return useServerMutation<Chat_Message, ChatDeleteMessageVariables>({
        endpoint: API_ENDPOINTS.CHAT.DeleteChatMessage.endpoint,
        method: API_ENDPOINTS.CHAT.DeleteChatMessage.methods[0],
        mutationKey: [API_ENDPOINTS.CHAT.DeleteChatMessage.key],
    })
}

export function useReactChatMessage() {
    return useServerMutation<Chat_Message, ChatReactMessageVariables>({
        endpoint: API_ENDPOINTS.CHAT.ReactChatMessage.endpoint,
        method: API_ENDPOINTS.CHAT.ReactChatMessage.methods[0],
        mutationKey: [API_ENDPOINTS.CHAT.ReactChatMessage.key],
    })
}

export function useMarkChatRead() {
    return useServerMutation<boolean, ChatMarkReadVariables>({
        endpoint: API_ENDPOINTS.CHAT.MarkChatRead.endpoint,
        method: API_ENDPOINTS.CHAT.MarkChatRead.methods[0],
        mutationKey: [API_ENDPOINTS.CHAT.MarkChatRead.key],
    })
}

export function useChatTyping() {
    return useServerMutation<boolean, ChatTypingVariables>({
        endpoint: API_ENDPOINTS.CHAT.ChatTyping.endpoint,
        method: API_ENDPOINTS.CHAT.ChatTyping.methods[0],
        mutationKey: [API_ENDPOINTS.CHAT.ChatTyping.key],
    })
}

export function useUploadChatImage() {
    return useServerMutation<Chat_ImageUpload, ChatUploadImageVariables>({
        endpoint: API_ENDPOINTS.CHAT.UploadChatImage.endpoint,
        method: API_ENDPOINTS.CHAT.UploadChatImage.methods[0],
        mutationKey: [API_ENDPOINTS.CHAT.UploadChatImage.key],
    })
}
