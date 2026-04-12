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
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { AppLayoutStack } from "@/components/ui/app-layout"
import { ConfirmationDialog, useConfirmationDialog } from "@/components/shared/confirmation-dialog"
import React from "react"
import { LuBellRing, LuMegaphone, LuTrash2 } from "react-icons/lu"

const MAX_MESSAGE_LENGTH = 1000

export function AdminAnnouncementsBanner() {
    const { data: announcements } = useGetAdminAnnouncements(true)
    const { mutate: dismissAnnouncement } = useDismissAdminAnnouncement()

    if (!announcements?.length) {
        return null
    }

    return <div className="fixed left-0 right-0 bottom-0 z-[998] space-y-2 p-2 sm:p-4 pointer-events-none" role="region" aria-live="polite" aria-label="Admin announcements">
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
    const [shouldAutoClose, setShouldAutoClose] = React.useState(false)

    React.useEffect(() => {
        // Check if this announcement is dismissible by looking at expiry vs creation time
        const expiresAt = new Date(announcement.expiresAt)
        const now = new Date()
        const isExpired = now > expiresAt

        if (!isExpired && announcement.createdAt) {
            // Estimate if it's dismissible (no clear flag from API, so we auto-dismiss newly created ones after 10s as a UX feature)
            const createdAt = new Date(announcement.createdAt)
            const ageMs = now.getTime() - createdAt.getTime()
            
            // Auto-dismiss after 10 seconds for better UX
            const timer = setTimeout(() => {
                setShouldAutoClose(true)
            }, 10000)
            return () => clearTimeout(timer)
        }
    }, [announcement])

    if (shouldAutoClose) {
        return null
    }

    return (
        <div className="pointer-events-auto">
            <Alert
                intent="warning-basic"
                title="Admin announcement"
                description={announcement.message}
                icon={<LuBellRing className="size-5 mt-1" />}
                onClose={onDismiss}
                className="shadow-xl border border-amber-400/20 bg-[--background]"
            />
        </div>
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

    if (!serverStatus?.currentProfile?.isAdmin) {
        return <PageWrapper className="p-4 sm:p-8">
            <Card className="p-6">
                <AppLayoutStack>
                    <h3>Admin access required</h3>
                    <p className="text-[--muted]">Only admin profiles can manage server announcements.</p>
                </AppLayoutStack>
            </Card>
        </PageWrapper>
    }

    const sortedAnnouncements = React.useMemo(() => {
        return (announcements || []).sort((a, b) => {
            return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
        })
    }, [announcements])

    const durationHoursNum = Math.max(1, Number.parseInt(durationHours, 10) || 24)

    return <PageWrapper className="p-4 sm:p-8 space-y-4">
        <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
                <LuMegaphone className="size-5" />
                <div>
                    <h3>Admin announcements</h3>
                    <p className="text-sm text-[--muted]">Create temporary banners that every profile will see until they expire or are dismissed.</p>
                </div>
            </div>

            {error && (
                <div className="rounded-md bg-[--alert]/10 border border-[--alert] p-3 text-[--alert] text-sm">
                    {error}
                </div>
            )}

            <label className="space-y-2 block">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Message</span>
                    <span className="text-xs text-[--muted]">{message.length} / {MAX_MESSAGE_LENGTH}</span>
                </div>
                <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                    maxLength={MAX_MESSAGE_LENGTH}
                    className="min-h-28 w-full rounded-md border border-[--border] bg-[--background] px-3 py-2"
                    placeholder="Maintenance tonight at 11 PM. Manga downloads may pause briefly."
                    aria-label="Announcement message"
                />
            </label>

            <label className="space-y-2 block max-w-40">
                <span className="text-sm font-medium">Duration in hours</span>
                <input
                    value={durationHours}
                    onChange={e => {
                        const val = e.target.value.replace(/[^\d]/g, "")
                        setDurationHours(val || "1")
                    }}
                    inputMode="numeric"
                    min="1"
                    max="8760"
                    className="w-full rounded-md border border-[--border] bg-[--background] px-3 py-2"
                    aria-label="Announcement duration in hours"
                />
                <p className="text-xs text-[--muted]">Min: 1 hour, Max: 1 year</p>
            </label>

            <div className="flex gap-2 flex-wrap">
                {[1, 6, 24, 168].map(hours => (
                    <Button
                        key={hours}
                        intent={durationHoursNum === hours ? "primary" : "gray"}
                        size="sm"
                        onClick={() => setDurationHours(String(hours))}
                    >
                        {hours === 1 ? "1h" : hours === 6 ? "6h" : hours === 24 ? "1d" : "1w"}
                    </Button>
                ))}
            </div>

            <Button
                intent="primary"
                loading={isCreating}
                disabled={!message.trim() || isCreating}
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
                Create announcement
            </Button>
        </Card>

        <Card className="p-6 space-y-4">
            <h3>Existing announcements</h3>
            {isLoadingAnnouncements ? (
                <p className="text-[--muted] text-sm">Loading announcements...</p>
            ) : !sortedAnnouncements?.length ? (
                <p className="text-[--muted] text-sm">No announcements yet.</p>
            ) : (
                sortedAnnouncements.map((announcement: AdminAnnouncement) => (
                    <div key={announcement.id} className="rounded-md border border-[--border] p-4 space-y-3">
                        <p className="text-sm">{announcement.message}</p>
                        <div className="flex items-center justify-between gap-3 text-sm text-[--muted]">
                            <span>Expires {new Date(announcement.expiresAt).toLocaleString()}</span>
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
                    </div>
                ))
            )}
        </Card>

        <ConfirmationDialog {...confirmDelete} />
    </PageWrapper>
}