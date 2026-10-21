"use client"

import { NotificationCreatedEvent } from "@/api/hooks/notifications.hooks"
import { IconButton } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { formatNewsDate } from "@/api/hooks/news.hooks"
import React from "react"
import { LuArrowUpRight, LuBell, LuRss, LuX } from "react-icons/lu"

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
                notification.type === "news"
                    ? <LiveNewsNotification
                        key={notification.liveID}
                        notification={notification}
                        onDismiss={onDismiss}
                    />
                    : <LiveNotification
                        key={notification.liveID}
                        notification={notification}
                        onDismiss={onDismiss}
                        onOpenNotificationBox={onOpenNotificationBox}
                    />
            ))}
        </section>
    )
}

function parseNewsMetadata(notification: NotificationCreatedEvent): { link?: string, feedTitle?: string, publishedAt?: number } {
    if (!notification.metadata) return {}
    try {
        const meta = JSON.parse(notification.metadata) as { link?: unknown, feedTitle?: unknown, publishedAt?: unknown }
        return {
            link: typeof meta.link === "string" ? meta.link : undefined,
            feedTitle: typeof meta.feedTitle === "string" ? meta.feedTitle : undefined,
            publishedAt: typeof meta.publishedAt === "number" ? meta.publishedAt : undefined,
        }
    } catch {
        return {}
    }
}

/**
 * A freshly published article, popping in from the corner of the room.
 *
 * The news notification gets its own card rather than the generic bell: the article's image as
 * a wide banner when the feed supplies one, the feed's name in a chip, the headline, and the
 * age in the corner. The whole card is one button — pressing it reads the article. A reader's
 * glow (the brand color bleeding in from the image's edge) and a translucent pane over a
 * blurred backdrop carry it; the entrance slides up and settles, matching the app's motion.
 */
function LiveNewsNotification({ notification, onDismiss }: {
    notification: LiveNotification
    onDismiss: (liveID: string) => void
}) {
    const meta = parseNewsMetadata(notification)
    const [leaving, setLeaving] = React.useState(false)

    // Exit with a beat of motion instead of vanishing — the same reason it enters with one.
    const dismiss = React.useCallback(() => {
        setLeaving(true)
        window.setTimeout(() => onDismiss(notification.liveID), 180)
    }, [notification.liveID, onDismiss])

    const open = React.useCallback(() => {
        if (!meta.link) return
        window.open(meta.link, "_blank", "noopener,noreferrer")
        dismiss()
    }, [meta.link, dismiss])

    return (
        <article
            className={cn(
                "animate-in slide-in-from-bottom-4 fade-in zoom-in-[0.98] duration-300",
                leaving && "animate-out fade-out slide-out-to-bottom-4 duration-200",
            )}
        >
            <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gray-950/80 shadow-2xl shadow-black/50 backdrop-blur-xl">
                {/* The glow: brand light bleeding from behind the image, dim until hovered. */}
                <div className="pointer-events-none absolute -right-10 -top-14 z-0 size-40 rounded-full bg-[--brand]/30 blur-3xl opacity-60 transition-opacity duration-500 group-hover:opacity-100" />

                {notification.imageUrl && (
                    <button
                        type="button"
                        onClick={open}
                        aria-label={notification.title}
                        className="relative z-[1] block h-28 w-full overflow-hidden"
                    >
                        <img
                            src={notification.imageUrl}
                            alt=""
                            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-gray-950/95 via-gray-950/20 to-transparent" />
                    </button>
                )}

                <div className="relative z-[1] flex items-start gap-3 p-4">
                    <div className="mt-0.5 flex size-9 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-brand-400/40 to-brand-600/25 ring-1 ring-white/15">
                        <LuRss className="size-4 text-[--brand]" />
                    </div>

                    <button type="button" onClick={open} className="min-w-0 flex-1 text-left">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[--brand]">
                                News
                            </span>
                            {!!meta.feedTitle && (
                                <span className="max-w-[8rem] truncate rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/80">
                                    {meta.feedTitle}
                                </span>
                            )}
                            {!!meta.publishedAt && (
                                <span className="text-[10px] text-white/40">{formatNewsDate(meta.publishedAt)}</span>
                            )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-white">
                            {notification.title}
                        </p>
                        {notification.body && (
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/55">
                                {notification.body}
                            </p>
                        )}
                        <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[--brand] opacity-80 transition-opacity group-hover:opacity-100">
                            Read article
                            <LuArrowUpRight className="size-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        </span>
                    </button>

                    <IconButton
                        icon={<LuX />}
                        size="xs"
                        intent="gray-subtle"
                        aria-label="Dismiss notification"
                        className="relative z-[2] flex-none opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={dismiss}
                    />
                </div>
            </div>
        </article>
    )
}

function LiveNotification({ notification, onDismiss, onOpenNotificationBox }: {
    notification: LiveNotification
    onDismiss: (liveID: string) => void
    onOpenNotificationBox: () => void
}) {
    return (
        <article
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
    )
}
