"use client"

import { NotificationCreatedEvent } from "@/api/hooks/notifications.hooks"
import { IconButton } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { LuBell, LuX } from "react-icons/lu"

type LiveNotification = NotificationCreatedEvent & { liveID: string }

type LiveNotificationPanelProps = {
    notifications: LiveNotification[]
    onDismiss: (liveID: string) => void
    onOpenNotificationBox: () => void
}

export function LiveNotificationPanel({
    notifications,
    onDismiss,
    onOpenNotificationBox,
}: LiveNotificationPanelProps) {
    if (notifications.length === 0) return null

    return (
        <section
            aria-label="New notifications"
            aria-live="polite"
            className="fixed bottom-5 right-5 z-[100] flex w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col gap-3"
        >
            {notifications.map(notification => (
                <article
                    key={notification.liveID}
                    className={cn(
                        "animate-in slide-in-from-right-4 fade-in duration-300",
                        "overflow-hidden rounded-xl border border-[--border] bg-[--paper] shadow-2xl backdrop-blur-xl",
                    )}
                >
                    <div className="flex items-start gap-3 p-4">
                        {notification.imageUrl ? (
                            <img
                                src={notification.imageUrl}
                                alt=""
                                className="h-16 w-12 flex-shrink-0 rounded-md object-cover"
                            />
                        ) : (
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-300">
                                <LuBell />
                            </div>
                        )}
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-300">
                                New notification
                            </p>
                            <p className="mt-1 line-clamp-2 text-sm font-semibold text-[--foreground]">
                                {notification.title}
                            </p>
                            {notification.body && (
                                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[--muted]">
                                    {notification.body}
                                </p>
                            )}
                        </div>
                        <IconButton
                            icon={<LuX />}
                            size="xs"
                            intent="gray-subtle"
                            aria-label="Dismiss notification preview"
                            onClick={() => onDismiss(notification.liveID)}
                        />
                    </div>
                    <button
                        type="button"
                        className="w-full border-t border-[--border] px-4 py-2.5 text-left text-xs font-medium text-brand-300 transition-colors hover:bg-[--subtle]"
                        onClick={onOpenNotificationBox}
                    >
                        View in notification box
                    </button>
                </article>
            ))}
        </section>
    )
}
