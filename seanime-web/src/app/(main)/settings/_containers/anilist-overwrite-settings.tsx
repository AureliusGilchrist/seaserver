import { OverwriteChange, OverwritePreview, useOverwriteAnilist, useOverwriteAnilistPreview } from "@/api/hooks/update-notice.hooks"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { SettingsCard } from "@/app/(main)/settings/_components/settings-card"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { WSEvents } from "@/lib/server/ws-events"
import React from "react"
import { toast } from "sonner"

const KIND_STYLE: Record<OverwriteChange["kind"], { label: string, badge: string }> = {
    add: { label: "Add", badge: "bg-green-500/15 text-green-300 border-green-500/30" },
    update: { label: "Update", badge: "bg-brand-500/15 text-brand-200 border-brand-500/30" },
    remove: { label: "Remove", badge: "bg-red-500/15 text-red-300 border-red-500/30" },
}

function StatBox({ label, value, className }: { label: string, value: number, className?: string }) {
    return (
        <div className="flex-1 rounded-lg border border-[--border] bg-[--subtle] px-3 py-2 text-center">
            <div className={`text-2xl font-bold ${className ?? ""}`}>{value}</div>
            <div className="text-xs text-[--muted] uppercase tracking-wide">{label}</div>
        </div>
    )
}

export function AnilistOverwriteCard() {
    const { mutateAsync, isPending } = useOverwriteAnilist()
    const { mutateAsync: loadPreview, isPending: isPreviewing } = useOverwriteAnilistPreview()
    const [busy, setBusy] = React.useState(false)
    const [preview, setPreview] = React.useState<OverwritePreview | null>(null)

    useWebsocketMessageListener<{ ok: boolean, message: string }>({
        type: WSEvents.ANILIST_OVERWRITE_COMPLETED,
        onMessage: data => {
            setBusy(false)
            if (data.ok) toast.success(data.message)
            else toast.error(data.message)
        },
    })

    async function review() {
        try {
            setPreview((await loadPreview({})) ?? null)
        }
        catch {
            setPreview(null)
        }
    }

    async function apply() {
        try {
            await mutateAsync({})
            setBusy(true)
            setPreview(null)
            toast.info("Updating AniList with the changes...")
        }
        catch {
            setBusy(false)
        }
    }

    const total = preview ? preview.add + preview.update + preview.remove : 0

    return (
        <SettingsCard title="AniList">
            <p className="text-sm text-[--muted]">
                Makes AniList match your library. Only what differs is changed; you review the changes first.
            </p>
            <Button intent="alert-subtle" loading={isPreviewing || isPending || busy} disabled={isPreviewing || isPending || busy} onClick={review}>
                Overwrite AniList
            </Button>

            <Modal
                open={!!preview}
                onOpenChange={o => { if (!o) setPreview(null) }}
                title="Review AniList changes"
                contentClass="max-w-2xl"
                footer={preview && (
                    <div className="flex w-full justify-end gap-2">
                        <Button intent="gray-outline" onClick={() => setPreview(null)}>Cancel</Button>
                        <Button intent="alert" disabled={total === 0 || isPending} loading={isPending} onClick={apply}>
                            {total === 0 ? "Nothing to change" : `Apply ${total} change${total === 1 ? "" : "s"}`}
                        </Button>
                    </div>
                )}
            >
                {preview && (
                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <StatBox label="Add" value={preview.add} className="text-green-400" />
                            <StatBox label="Update" value={preview.update} className="text-brand-300" />
                            <StatBox label="Remove" value={preview.remove} className="text-red-400" />
                            <StatBox label="Already matching" value={preview.unchanged} />
                        </div>
                        {preview.remove > 0 && (
                            <p className="text-sm text-red-300">
                                {preview.remove} entries are on AniList but not in your library and will be deleted from AniList.
                            </p>
                        )}
                        {total === 0 ? (
                            <p className="text-center text-[--muted] py-6">AniList already matches your library.</p>
                        ) : (
                            <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
                                {preview.changes.map(c => (
                                    <div key={`${c.media}-${c.mediaId}`} className="rounded-lg border border-[--border] bg-[--subtle] p-3">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${KIND_STYLE[c.kind].badge}`}>
                                                {KIND_STYLE[c.kind].label}
                                            </span>
                                            <span className="text-[10px] uppercase text-[--muted]">{c.media}</span>
                                            <span className="font-medium truncate">{c.title || `#${c.mediaId}`}</span>
                                        </div>
                                        <ul className="mt-1.5 space-y-0.5 text-sm text-[--muted]">
                                            {c.fields.map(f => <li key={f}>{f}</li>)}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </SettingsCard>
    )
}
