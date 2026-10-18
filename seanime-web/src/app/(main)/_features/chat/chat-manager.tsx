import { useQueryClient } from "@tanstack/react-query"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import React from "react"
import { toast } from "sonner"

import { API_ENDPOINTS } from "@/api/generated/endpoints"
import {
    useMarkChatRead,
} from "@/api/hooks/chat.hooks"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import {
    chatModalOpenAtom,
    chatPeerTypingAtom,
    chatWsUnreadTickAtom,
} from "@/app/(main)/_features/chat/chat.atoms"
import { ChatModal } from "@/app/(main)/_features/chat/chat-modal"
import { clientIdAtom } from "@/app/websocket-provider"
import { WSEvents } from "@/lib/server/ws-events"
import { useLatestFunction } from "@/lib/helpers/debug"

/**
 * Payload pushed by the server on the "chat" WS event. One event type,
 * discriminated by `type`.
 */
export type ChatEventPayload = {
    type: "message" | "typing" | "read" | "pin-setup"
    message?: ChatEventMessage
    fromId?: number
    isTyping?: boolean
    at?: string
}

export type ChatEventMessage = {
    id: string
    from: number
    to: number
    iv: string
    ciphertext: string
    createdAt: string
    editedAt?: string
    deletedAt?: string
    readAt?: string
    replyToId?: string
    imageId?: string
    imageIv?: string
    imageMime?: string
    reactions?: Record<number, { iv: string, ciphertext: string }>
}

/**
 * ChatManager: mounts once, listens for chat WS events, keeps caches fresh,
 * shows toasts for incoming messages when the chat is closed, and renders the
 * chat modal.
 */
export function ChatManager() {
    const qc = useQueryClient()
    const [modalOpen, setModalOpen] = useAtom(chatModalOpenAtom)
    const setPeerTyping = useSetAtom(chatPeerTypingAtom)
    const setWsUnreadTick = useSetAtom(chatWsUnreadTickAtom)
    const clientId = useAtomValue(clientIdAtom)
    const profile = useAtomValue(currentProfileAtom)

    /**
     * A message arrived (or was edited/deleted). Refresh the caches and notify
     * if the chat modal isn't open on this conversation.
     */
    const onMessageEvent = useLatestFunction((message: ChatEventMessage) => {
        void qc.invalidateQueries({ queryKey: [API_ENDPOINTS.CHAT.GetChatConversations.key] })
        void qc.invalidateQueries({ queryKey: [API_ENDPOINTS.CHAT.GetChatMessages.key] })
        setWsUnreadTick(t => t + 1)

        // Toast only for genuinely new incoming messages while the modal is closed.
        if (message.deletedAt || message.editedAt) return
        if (modalOpen) return
        if (profile?.id && message.from !== profile.id) {
            toast("New encrypted message", {
                description: "Open the chat to read it.",
                duration: 5000,
            })
        }
    })

    useWebsocketMessageListener<ChatEventPayload>({
        type: WSEvents.CHAT,
        onMessage: useLatestFunction((payload: ChatEventPayload | null) => {
            if (!payload) return
            switch (payload.type) {
                case "message":
                    if (payload.message) onMessageEvent(payload.message)
                    break
                case "typing":
                    if (payload.fromId) {
                        setPeerTyping(prev => ({
                            ...prev,
                            [payload.fromId!]: { isTyping: !!payload.isTyping, at: Date.now() },
                        }))
                    }
                    break
                case "read":
                    // Peer read our messages — refresh so read receipts update.
                    void qc.invalidateQueries({ queryKey: [API_ENDPOINTS.CHAT.GetChatMessages.key] })
                    break
                case "pin-setup":
                    void qc.invalidateQueries({ queryKey: [API_ENDPOINTS.CHAT.GetChatState.key] })
                    break
            }
        }),
    })

    // Opening a conversation marks it read — handled by the modal; here we just
    // make sure the unread count in the sidebar stays fresh on a tick.
    React.useEffect(() => {
        if (!modalOpen) return
        void qc.invalidateQueries({ queryKey: [API_ENDPOINTS.CHAT.GetChatConversations.key] })
    }, [modalOpen, qc])

    return <ChatModal />
}
