"use client"

import {
    AdminAnnouncement,
    useCreateAdminAnnouncement,
    useDeleteAdminAnnouncement,
    useDismissAdminAnnouncement,
    useGetAdminAnnouncements,
    useGetAllAdminAnnouncements,
} from "@/api/hooks/admin.hooks"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { AppLayoutStack } from "@/components/ui/app-layout"
import { cn } from "@/components/ui/core/styling"
import { ConfirmationDialog, useConfirmationDialog } from "@/components/shared/confirmation-dialog"
import React from "react"
import { LuBellRing, LuMegaphone, LuTrash2, LuX } from "react-icons/lu"

const MAX_MESSAGE_LENGTH = 1000
const MAX_DURATION_HOURS = 24 * 365

export function AdminAnnouncementsBanner() {
    const { data: announcements } = useGetAdminAnnouncements(true)
    const { mutate: dismissAnnouncement } = useDismissAdminAnnouncement()

    if (!announcements?.length) {
        return null
    }

    return <div className="fixed inset-x-0 bottom-0 z-[998] space-y-2 p-3 sm:p-5 pointer-events-none" role="region" aria-live="polite" aria-label="Admin announcements">
        {announcements.slice(0, 2).map(announcement => (
            <AnnouncementBannerItem
                key={announcement.id}
                announcement={announcement}
                onDismiss={() => dismissAnnouncement({ id: announcement.id })}
            />
        ))}
    </div>
}

function AnnouncementBannerItem({ announcement, onDismiss }: { announcement: AdminAnnouncement, onDismiss: () => void }) {
    const expiresAt = new Date(announcement.expiresAt).getTime()
    const [isExpired, setIsExpired] = React.useState(() => expiresAt <= Date.now())

    React.useEffect(() => {
        let timer: number | undefined
        const expireWhenDue = () => {
            const remainingMs = expiresAt - Date.now()
            if (remainingMs <= 0) {
                setIsExpired(true)
                return
            }
            timer = window.setTimeout(expireWhenDue, Math.min(remainingMs, 2_147_483_647))
        }

        expireWhenDue()
        return () => {
            if (timer !== undefined) window.clearTimeout(timer)
        }
    }, [expiresAt])

    if (isExpired) {
        return null
    }

    return (
        <div className="pointer-events-auto mx-auto w-full max-w-3xl">
            <AnnouncementCard message={announcement.message} expiresAt={announcement.expiresAt} onDismiss={onDismiss} />
        </div>
    )
}

function AnnouncementCard({
    message,
    expiresAt,
    onDismiss,
    preview = false,
}: {
    message: string
    expiresAt?: string
    onDismiss?: () => void
    preview?: boolean
}) {
    const expiration = expiresAt ? new Date(expiresAt) : null
    const expirationLabel = expiration && !Number.isNaN(expiration.getTime())
        ? expiration.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
        : null

    return (
        <article className="relative isolate overflow-hidden rounded-2xl border border-amber-200/20 bg-gradient-to-br from-gray-950/95 via-gray-950/90 to-amber-950/35 shadow-2xl shadow-black/40 backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-amber-200 via-amber-400 to-orange-500" />
            <div className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-amber-400/10 blur-3xl" />
            <div className="relative flex items-start gap-3 p-4 pl-5 sm:gap-4 sm:p-5 sm:pl-6">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/20 bg-amber-300/10 text-amber-100 shadow-inner shadow-amber-100/5">
                    <LuMegaphone className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-100">
                            Server announcement
                        </span>
                        <span className="rounded-full border border-amber-200/15 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-100/80">
                            {preview ? "Preview" : "Active"}
                        </span>
                        {expirationLabel && (
                            <span className="text-xs text-white/50">Ends {expirationLabel}</span>
                        )}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/90 sm:text-[15px]">
                        {message}
                    </p>
                    {preview && (
                        <p className="mt-3 text-xs text-white/45">This is how it will appear to everyone using the server.</p>
                    )}
                </div>
                {onDismiss && (
                    <button
                        type="button"
                        onClick={onDismiss}
                        aria-label="Dismiss announcement"
                        title="Dismiss announcement"
                        className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/60 transition hover:border-white/20 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                    >
                        <LuX className="size-4" />
                    </button>
                )}
            </div>
        </article>
    )
}

export function AdminAnnouncementsPage() {
    const serverStatus = useServerStatus()
    const { data: announcements, isLoading: isLoadingAnnouncements } = useGetAllAdminAnnouncements(!!serverStatus?.currentProfile?.isAdmin)
    const { mutate: createAnnouncement, isPending: isCreating } = useCreateAdminAnnouncement()
    const { mutate: deleteAnnouncement, isPending: isDeleting } = useDeleteAdminAnnouncement()
    const [message, setMessage] = React.useState("")
    const [durationHours, setDurationHours] = React.useState("24")
    const [error, setError] = React.useState<string | null>(null)
    const [deleteTargetId, setDeleteTargetId] = React.useState<number | null>(null)

    const confirmDelete = useConfirmationDialog({
        title: "Delete announcement?",
        description: "This action cannot be undone.",
        actionText: "Delete",
        actionIntent: "alert",
        onConfirm: () => {
            if (deleteTargetId !== null) {
                deleteAnnouncement({ id: deleteTargetId }, {
                    onError: (err) => {
                        setError(err?.message || "Failed to delete announcement")
                    },
                })
                setDeleteTargetId(null)
            }
        },
    })

    const sortedAnnouncements = [...(announcements || [])].sort((a, b) => {
        const aExpiresAt = new Date(a.expiresAt).getTime()
        const bExpiresAt = new Date(b.expiresAt).getTime()
        const aIsActive = aExpiresAt > Date.now()
        const bIsActive = bExpiresAt > Date.now()
        if (aIsActive !== bIsActive) return aIsActive ? -1 : 1
        return aExpiresAt - bExpiresAt
    })
    const activeAnnouncements = sortedAnnouncements.filter(a => new Date(a.expiresAt).getTime() > Date.now()).length
    const parsedDurationHours = Number(durationHours)
    const isDurationValid = Number.isInteger(parsedDurationHours)
        && parsedDurationHours >= 1
        && parsedDurationHours <= MAX_DURATION_HOURS
    const durationHoursNum = isDurationValid ? parsedDurationHours : 0
    const previewExpiresAt = isDurationValid
        ? new Date(Date.now() + durationHoursNum * 60 * 60 * 1000).toISOString()
        : undefined

    if (!serverStatus?.currentProfile?.isAdmin) {
        return <PageWrapper className="mx-auto w-full max-w-5xl p-4 sm:p-8">
            <Card className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-black/30 p-6 shadow-xl shadow-black/20 backdrop-blur-2xl sm:p-8">
                <AppLayoutStack className="relative">
                    <div className="flex size-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/10 text-amber-100">
                        <LuBellRing className="size-6" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold">Admin access required</h3>
                        <p className="mt-1 text-sm text-[--muted]">Only admin profiles can manage server announcements.</p>
                    </div>
                </AppLayoutStack>
            </Card>
        </PageWrapper>
    }

    return (
        <PageWrapper className="mx-auto w-full max-w-[1600px] space-y-5 p-4 sm:p-8">
            <header className="relative isolate overflow-hidden rounded-3xl border border-amber-200/15 bg-gradient-to-br from-amber-500/[0.12] via-black/35 to-black/50 p-5 shadow-xl shadow-black/20 backdrop-blur-2xl sm:p-7">
                <div className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full bg-amber-400/10 blur-3xl" />
                <div className="relative flex flex-wrap items-center gap-4">
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-amber-200/20 bg-amber-300/10 text-amber-100 shadow-lg shadow-black/20">
                        <LuMegaphone className="size-7" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-100/80">Server communication</p>
                        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">Announcements</h1>
                        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/65">
                            Share timely updates with everyone using your server. Announcements disappear when dismissed or when their duration ends.
                        </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-center">
                        <p className="text-xl font-bold tabular-nums text-white">{activeAnnouncements}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Active</p>
                    </div>
                </div>
            </header>

            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
                <Card className="relative z-[1] space-y-5 overflow-hidden rounded-3xl border border-white/10 bg-black/30 p-5 shadow-xl shadow-black/20 backdrop-blur-2xl sm:p-7">
                    <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-brand-300/20 bg-brand-400/10 text-brand-200">
                            <LuBellRing className="size-5" />
                        </div>
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-200">Compose</p>
                            <h2 className="mt-0.5 text-lg font-bold text-white">New announcement</h2>
                            <p className="mt-1 text-sm text-[--muted]">Keep it clear and useful; the message is shown as a dismissible banner.</p>
                        </div>
                    </div>

                    {error && (
                        <div role="alert" className="rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-200">
                            {error}
                        </div>
                    )}

                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_17rem]">
                        <label className="block min-w-0 space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-semibold text-white/85">Message</span>
                                <span className="text-xs tabular-nums text-[--muted]">{message.length} / {MAX_MESSAGE_LENGTH}</span>
                            </div>
                            <textarea
                                value={message}
                                onChange={e => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                                maxLength={MAX_MESSAGE_LENGTH}
                                rows={7}
                                className="min-h-40 w-full resize-y rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-relaxed text-white placeholder:text-white/35 focus:border-brand-300/40 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                placeholder="Maintenance tonight at 11 PM. Manga downloads may pause briefly."
                                aria-label="Announcement message"
                            />
                            <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-brand-300 to-amber-300 transition-[width]"
                                    style={{ width: `${Math.min(100, (message.length / MAX_MESSAGE_LENGTH) * 100)}%` }}
                                />
                            </div>
                        </label>

                        <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-white/85">Duration</span>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={durationHours}
                                        onChange={e => setDurationHours(e.target.value)}
                                        inputMode="numeric"
                                        min="1"
                                        max={MAX_DURATION_HOURS}
                                        step="1"
                                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 pr-16 text-sm text-white focus:border-brand-300/40 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                        aria-label="Announcement duration in hours"
                                    />
                                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-white/40">hours</span>
                                </div>
                                <p className="text-xs leading-relaxed text-[--muted]">Choose 1 hour to 1 year.</p>
                                {!isDurationValid && (
                                    <p role="alert" className="text-xs text-red-300">
                                        Enter a whole number from 1 to {MAX_DURATION_HOURS} hours.
                                    </p>
                                )}
                            </label>

                            <div className="space-y-2">
                                <span className="text-xs font-semibold uppercase tracking-wider text-white/45">Quick set</span>
                                <div className="flex flex-wrap gap-2">
                                    {[1, 6, 24, 168].map(hours => (
                                        <Button
                                            key={hours}
                                            intent={durationHoursNum === hours ? "primary" : "gray-outline"}
                                            size="sm"
                                            className="rounded-full px-3"
                                            aria-pressed={durationHoursNum === hours}
                                            onClick={() => setDurationHours(String(hours))}
                                        >
                                            {hours === 1 ? "1h" : hours === 6 ? "6h" : hours === 24 ? "1d" : "1w"}
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            <Button
                                intent="primary"
                                loading={isCreating}
                                disabled={!message.trim() || !isDurationValid || isCreating}
                                className="w-full"
                                onClick={() => {
                                    setError(null)
                                    createAnnouncement({
                                        message: message.trim(),
                                        durationHours: durationHoursNum,
                                    }, {
                                        onSuccess: () => {
                                            setMessage("")
                                            setDurationHours("24")
                                        },
                                        onError: (err) => {
                                            setError(err?.message || "Failed to create announcement")
                                        },
                                    })
                                }}
                            >
                                <span className="inline-flex items-center gap-2">
                                    <LuMegaphone className="size-4" />
                                    Publish announcement
                                </span>
                            </Button>
                        </div>
                    </div>
                </Card>

                <div className="space-y-5">
                    <Card className="relative z-[1] space-y-4 overflow-hidden rounded-3xl border border-white/10 bg-black/30 p-5 shadow-xl shadow-black/20 backdrop-blur-2xl sm:p-6">
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-100/80">Audience preview</p>
                            <h2 className="mt-1 text-lg font-bold text-white">What people will see</h2>
                        </div>
                        {message.trim() ? (
                            <AnnouncementCard message={message.trim()} expiresAt={previewExpiresAt} preview />
                        ) : (
                            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
                                <LuMegaphone className="mx-auto size-6 text-white/25" />
                                <p className="mt-3 text-sm font-medium text-white/65">Your preview will appear here</p>
                                <p className="mt-1 text-xs text-white/40">Type a message to see how it looks as a banner.</p>
                            </div>
                        )}
                    </Card>

                    <Card className="relative z-[1] space-y-4 overflow-hidden rounded-3xl border border-white/10 bg-black/30 p-5 shadow-xl shadow-black/20 backdrop-blur-2xl sm:p-6">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">History</p>
                                <h2 className="mt-1 text-lg font-bold text-white">Announcements</h2>
                            </div>
                            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold tabular-nums text-white/65">
                                {sortedAnnouncements.length}
                            </span>
                        </div>
                        {isLoadingAnnouncements ? (
                            <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-sm text-[--muted]">Loading announcements…</p>
                        ) : !sortedAnnouncements.length ? (
                            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
                                <LuBellRing className="mx-auto size-6 text-white/25" />
                                <p className="mt-3 text-sm font-medium text-white/65">No announcements yet</p>
                                <p className="mt-1 text-xs text-white/40">Published messages and their expiration dates will show up here.</p>
                            </div>
                        ) : (
                            <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
                                {sortedAnnouncements.map((announcement: AdminAnnouncement) => {
                                    const isActive = new Date(announcement.expiresAt).getTime() > Date.now()
                                    const createdAt = announcement.createdAt
                                        ? new Date(announcement.createdAt).toLocaleString()
                                        : null
                                    const expiresAt = new Date(announcement.expiresAt).toLocaleString()
                                    return (
                                        <article key={announcement.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 transition-colors hover:border-white/15 hover:bg-white/[0.04]">
                                            <div className="flex items-center justify-between gap-3">
                                                <span className={cn(
                                                    "rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                                                    isActive
                                                        ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
                                                        : "border-white/10 bg-white/[0.04] text-white/45",
                                                )}>
                                                    {isActive ? "Active" : "Expired"}
                                                </span>
                                                <Button
                                                    intent="alert-subtle"
                                                    size="sm"
                                                    leftIcon={<LuTrash2 className="size-4" />}
                                                    loading={isDeleting}
                                                    onClick={() => {
                                                        setDeleteTargetId(announcement.id)
                                                        confirmDelete.open()
                                                    }}
                                                    aria-label={`Delete announcement: ${announcement.message.substring(0, 30)}`}
                                                >
                                                    Delete
                                                </Button>
                                            </div>
                                            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/85">
                                                {announcement.message}
                                            </p>
                                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/45">
                                                {createdAt && <span>Created {createdAt}</span>}
                                                <span>Expires {expiresAt}</span>
                                            </div>
                                        </article>
                                    )
                                })}
                            </div>
                        )}
                    </Card>
                </div>
            </div>

            <ConfirmationDialog {...confirmDelete} />
        </PageWrapper>
    )
}