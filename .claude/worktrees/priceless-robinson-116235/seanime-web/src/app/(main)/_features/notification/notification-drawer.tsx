"use client"
import { useDeleteNotification, useGetNotifications, useMarkAllNotificationsRead, useMarkNotificationRead } from "@/api/hooks/notifications.hooks"

type Notification = {
    id: number
    createdAt: string
    updatedAt: string
    type: string
    title: string
    body: string
    imageUrl: string
    mediaId: number
    isRead: boolean
    metadata: string
}

import { Button, IconButton } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { Drawer } from "@/components/ui/drawer"
import { useRouter } from "@/lib/navigation"
import { formatDistanceToNow } from "date-fns"
import React from "react"
import { BiCheck, BiCheckDouble, BiTrash } from "react-icons/bi"
import { LuBell, LuBookOpen, LuCalendar, LuCrown, LuStar, LuTv, LuUsers } from "react-icons/lu"

type NotificationDrawerProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
}

const NOTIFICATION_TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; mediaRoute: string }> = {
    new_episode: { icon: LuTv, label: "New Episode", mediaRoute: "/entry" },
    sequel_announced: { icon: LuStar, label: "Sequel Announced", mediaRoute: "/entry" },
    related_airing: { icon: LuCalendar, label: "Related Airing", mediaRoute: "/entry" },
    character_birthday: { icon: LuCrown, label: "Character Birthday", mediaRoute: "/entry" },
    achievement_unlocked: { icon: LuStar, label: "Achievement", mediaRoute: "" },
    manga_chapter: { icon: LuBookOpen, label: "New Chapter", mediaRoute: "/manga/entry" },
}

function getNotificationConfig(type: string) {
    return NOTIFICATION_TYPE_CONFIG[type] || { icon: LuBell, label: "Notification", mediaRoute: "" }
}

export function NotificationDrawer({ open, onOpenChange }: NotificationDrawerProps) {
    const router = useRouter()
    const [page, setPage] = React.useState(1)

    const { data, isLoading } = useGetNotifications(page, 20, open)
    const { mutate: markRead } = useMarkNotificationRead()
    const { mutate: markAllRead } = useMarkAllNotificationsRead()
    const { mutate: deleteNotification } = useDeleteNotification()

    const notifications = data?.notifications || []
    const totalCount = data?.totalCount || 0
    const hasMore = notifications.length < totalCount && page * 20 < totalCount

    const handleNotificationClick = React.useCallback((notification: Notification) => {
        if (!notification.isRead) {
            markRead({ notificationId: notification.id })
        }

        const config = getNotificationConfig(notification.type)
        if (config.mediaRoute && notification.mediaId > 0) {
            onOpenChange(false)
            router.push(`${config.mediaRoute}?id=${notification.mediaId}`)
        }
    }, [markRead, onOpenChange, router])

    const handleDelete = React.useCallback((e: React.MouseEvent, notificationId: number) => {
        e.stopPropagation()
        deleteNotification({ notificationId })
    }, [deleteNotification])

    return (
        <Drawer
            open={open}
            onOpenChange={onOpenChange}
            side="right"
            size="md"
            title="Notifications"
            footer={hasMore ? (
                <Button
                    intent="gray-outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setPage(p => p + 1)}
                >
                    Load more
                </Button>
            ) : undefined}
        >
            <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-[--muted]">
                    {totalCount > 0 ? `${totalCount} notification${totalCount !== 1 ? "s" : ""}` : ""}
                </p>
                {(data?.unreadCount ?? 0) > 0 && (
                    <Button
                        intent="gray-subtle"
                        size="sm"
                        leftIcon={<BiCheckDouble />}
                        onClick={() => markAllRead()}
                    >
                        Mark all read
                    </Button>
                )}
            </div>

            {isLoading && notifications.length === 0 && (
                <div className="flex items-center justify-center py-12 text-[--muted]">
                    Loading...
                </div>
            )}

            {!isLoading && notifications.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-[--muted]">
                    <LuBell className="text-4xl mb-2 opacity-50" />
                    <p>No notifications yet</p>
                </div>
            )}

            <div className="flex flex-col gap-1">
                {notifications.map((notification: Notification) => (
                    <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onClick={handleNotificationClick}
                        onDelete={handleDelete}
                    />
                ))}
            </div>
        </Drawer>
    )
}

type NotificationItemProps = {
    notification: Notification
    onClick: (notification: Notification) => void
    onDelete: (e: React.MouseEvent, notificationId: number) => void
}

function NotificationItem({ notification, onClick, onDelete }: NotificationItemProps) {
    const config = getNotificationConfig(notification.type)
    const Icon = config.icon
    const isClickable = config.mediaRoute && notification.mediaId > 0

    const timeAgo = React.useMemo(() => {
        try {
            return formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })
        } catch {
            return ""
        }
    }, [notification.createdAt])

    return (
        <div
            className={cn(
                "group relative flex gap-3 p-3 rounded-lg transition-colors",
                isClickable && "cursor-pointer hover:bg-[--subtle]",
                !notification.isRead && "bg-[--subtle]",
            )}
            onClick={() => onClick(notification)}
        >
            {/* Type icon */}
            <div className={cn(
                "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center",
                !notification.isRead ? "bg-brand-500/20 text-brand-300" : "bg-[--subtle] text-[--muted]",
            )}>
                <Icon className="text-lg" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <p className={cn(
                        "text-sm leading-snug truncate",
                        !notification.isRead ? "font-medium text-[--foreground]" : "text-[--muted]",
                    )}>
                        {notification.title}
                    </p>

                    {/* Unread dot */}
                    {!notification.isRead && (
                        <div className="flex-shrink-0 mt-1.5 w-2 h-2 rounded-full bg-brand-500" />
                    )}
                </div>

                {notification.body && (
                    <p className="text-xs text-[--muted] mt-0.5 line-clamp-2">
                        {notification.body}
                    </p>
                )}

                <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-[--muted] opacity-70">{timeAgo}</span>
                    <span className="text-xs text-[--muted] opacity-50">{config.label}</span>
                </div>
            </div>

            {/* Thumbnail */}
            {notification.imageUrl && (
                <img
                    src={notification.imageUrl}
                    alt=""
                    className="flex-shrink-0 w-10 h-14 rounded object-cover"
                />
            )}

            {/* Delete button (shown on hover) */}
            <IconButton
                size="xs"
                intent="gray-subtle"
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                icon={<BiTrash />}
                onClick={(e) => onDelete(e, notification.id)}
            />
        </div>
    )
}
