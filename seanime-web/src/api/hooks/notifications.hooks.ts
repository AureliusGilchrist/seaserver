import { useServerQuery, buildSeaQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { NotificationsResponse } from "@/api/generated/types"
import { profileSessionTokenAtom, serverAuthTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { WSEvents } from "@/lib/server/ws-events"
import { useQueryClient } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { useMutation } from "@tanstack/react-query"

export function useGetNotifications(page: number, limit: number = 20, enabled?: boolean) {
    return useServerQuery<NotificationsResponse>({
        endpoint: API_ENDPOINTS.NOTIFICATION.GetNotifications.endpoint + `?page=${page}&limit=${limit}`,
        method: API_ENDPOINTS.NOTIFICATION.GetNotifications.methods[0],
        queryKey: [API_ENDPOINTS.NOTIFICATION.GetNotifications.key, String(page), String(limit)],
        enabled: enabled !== false,
    })
}

export function useGetUnreadNotificationCount() {
    return useServerQuery<number>({
        endpoint: API_ENDPOINTS.NOTIFICATION.GetUnreadNotificationCount.endpoint,
        method: API_ENDPOINTS.NOTIFICATION.GetUnreadNotificationCount.methods[0],
        queryKey: [API_ENDPOINTS.NOTIFICATION.GetUnreadNotificationCount.key],
    })
}

export function useMarkNotificationRead() {
    const qc = useQueryClient()
    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)

    return useMutation({
        mutationKey: [API_ENDPOINTS.NOTIFICATION.MarkNotificationRead.key],
        mutationFn: async (variables: { notificationId: number }) => {
            return buildSeaQuery<any>({
                endpoint: `/api/v1/notifications/${variables.notificationId}/read`,
                method: "POST",
                password: password,
                profileToken: profileToken,
            })
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.NOTIFICATION.GetNotifications.key] })
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.NOTIFICATION.GetUnreadNotificationCount.key] })
        },
    })
}

export function useMarkAllNotificationsRead() {
    const qc = useQueryClient()
    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)

    return useMutation({
        mutationKey: [API_ENDPOINTS.NOTIFICATION.MarkAllNotificationsRead.key],
        mutationFn: async () => {
            return buildSeaQuery<any>({
                endpoint: API_ENDPOINTS.NOTIFICATION.MarkAllNotificationsRead.endpoint,
                method: "POST",
                password: password,
                profileToken: profileToken,
            })
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.NOTIFICATION.GetNotifications.key] })
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.NOTIFICATION.GetUnreadNotificationCount.key] })
        },
    })
}

export function useDeleteNotification() {
    const qc = useQueryClient()
    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)

    return useMutation({
        mutationKey: [API_ENDPOINTS.NOTIFICATION.DeleteNotification.key],
        mutationFn: async (variables: { notificationId: number }) => {
            return buildSeaQuery<any>({
                endpoint: `/api/v1/notifications/${variables.notificationId}`,
                method: "DELETE",
                password: password,
                profileToken: profileToken,
            })
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.NOTIFICATION.GetNotifications.key] })
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.NOTIFICATION.GetUnreadNotificationCount.key] })
        },
    })
}

/**
 * Hook to listen for new notification WS events and invalidate queries.
 * Should be placed in a component that's always mounted (e.g., sidebar).
 */
export function useNotificationWSListener() {
    const qc = useQueryClient()

    useWebsocketMessageListener({
        type: WSEvents.NOTIFICATION_CREATED,
        onMessage: () => {
            qc.invalidateQueries({ queryKey: [API_ENDPOINTS.NOTIFICATION.GetNotifications.key] })
            qc.invalidateQueries({ queryKey: [API_ENDPOINTS.NOTIFICATION.GetUnreadNotificationCount.key] })
        },
    })
}
