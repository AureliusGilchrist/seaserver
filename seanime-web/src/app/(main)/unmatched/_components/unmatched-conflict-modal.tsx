"use client"

import { MatchConflict } from "@/api/hooks/unmatched.hooks"
import { Alert } from "@/components/ui/alert/alert"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { Modal } from "@/components/ui/modal"
import React from "react"
import { BiTrash } from "react-icons/bi"
import { LuTriangleAlert } from "react-icons/lu"

/**
 * Every match renames episodes to the same canonical form, so a second release of a show resolves to
 * exactly the destination names the first one already occupies — and a rename overwrites without
 * asking. The server now refuses that and reports the collision instead; this is where the user
 * decides which copy survives.
 *
 * Accept replaces the files in the library with the incoming ones. Decline throws the incoming copy
 * away: the staged torrent and its episodes are deleted, and the library is left untouched.
 */

function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return "—"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

interface UnmatchedConflictModalProps {
    conflict: MatchConflict | null
    /** The torrent being matched — the one Decline deletes. */
    torrentName: string
    animeTitle: string
    isReplacing: boolean
    isDeleting: boolean
    /** Re-run the match with overwriteExisting set. */
    onAccept: () => void
    /** Delete this staged torrent and its episodes, leaving the library alone. */
    onDecline: () => void
    onCancel: () => void
}

export function UnmatchedConflictModal({
    conflict,
    torrentName,
    animeTitle,
    isReplacing,
    isDeleting,
    onAccept,
    onDecline,
    onCancel,
}: UnmatchedConflictModalProps) {
    const [confirmDecline, setConfirmDecline] = React.useState(false)

    if (!conflict) return null

    const busy = isReplacing || isDeleting
    const count = conflict.files.length
    const sources = conflict.sourceTorrents ?? []
    const allConflict = count >= conflict.totalPlanned

    return (
        <Modal
            open={!!conflict}
            onOpenChange={(open) => !open && !busy && onCancel()}
            contentClass="max-w-3xl"
            title="These episodes are already in your library"
        >
            <div className="space-y-4 py-2">
                <div className="flex items-start gap-3 p-3 border rounded-md border-amber-500/30 bg-amber-900/10">
                    <LuTriangleAlert className="text-amber-400 text-xl flex-shrink-0 mt-0.5" />
                    <div className="space-y-1 text-sm">
                        <p>
                            <span className="font-semibold">{count}</span> of{" "}
                            <span className="font-semibold">{conflict.totalPlanned}</span> file
                            {conflict.totalPlanned === 1 ? "" : "s"} would land on episodes that have{" "}
                            <span className="font-semibold">already been moved and matched</span> under{" "}
                            <span className="font-semibold text-brand-200">{animeTitle}</span>.
                        </p>
                        {conflict.sameTorrent ? (
                            <p className="text-xs text-[--muted]">
                                They came from <span className="text-gray-300">this same torrent</span> — this match has
                                already been run once. Replacing them re-does what is already there.
                            </p>
                        ) : sources.length > 0 ? (
                            <p className="text-xs text-[--muted]">
                                They were matched from a <span className="text-amber-300 font-medium">different torrent</span>
                                {sources.length === 1 ? ": " : " — "}
                                {sources.map((s, i) => (
                                    <React.Fragment key={s}>
                                        {i > 0 && <span>, </span>}
                                        <span className="text-gray-300 break-all">{s}</span>
                                    </React.Fragment>
                                ))}
                                . That is a different release, so the subs, audio and encode are very likely not the same.
                            </p>
                        ) : (
                            <p className="text-xs text-[--muted]">
                                Nothing in the match history says where they came from, so they were placed by an older
                                version or by hand. Treat them as a{" "}
                                <span className="text-amber-300 font-medium">different release</span>.
                            </p>
                        )}
                    </div>
                </div>

                <div className="border rounded-md overflow-hidden">
                    <div className="px-3 py-2 border-b bg-gray-950/40 flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[--muted]">
                            Already in the library
                        </p>
                        <p className="text-xs text-[--muted]">in library → incoming</p>
                    </div>
                    <div className="max-h-[260px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                        <div className="divide-y divide-gray-800/60">
                            {conflict.files.map(f => {
                                const bigger = f.incomingSize > f.existingSize
                                const same = f.incomingSize === f.existingSize
                                return (
                                    <div key={f.newPath} className="px-3 py-1.5 text-xs space-y-0.5">
                                        <div className="flex items-center gap-3">
                                            <span className="flex-1 min-w-0 truncate text-gray-300" title={f.newPath}>
                                                {f.newName}
                                            </span>
                                            <span className="flex-shrink-0 text-[--muted]">{formatBytes(f.existingSize)}</span>
                                            <span className="flex-shrink-0 text-[--muted]">→</span>
                                            <span
                                                className={cn(
                                                    "flex-shrink-0 font-medium",
                                                    same ? "text-[--muted]" : bigger ? "text-green-400" : "text-amber-300",
                                                )}
                                                title={same ? "Same size" : bigger ? "Incoming file is larger" : "Incoming file is smaller"}
                                            >
                                                {formatBytes(f.incomingSize)}
                                            </span>
                                        </div>
                                        {f.sourceTorrent && !conflict.sameTorrent && (
                                            <p className="text-[10px] text-[--muted] truncate" title={f.sourceTorrent}>
                                                from {f.sourceTorrent}
                                            </p>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>

                {!allConflict && (
                    <Alert
                        intent="info"
                        description={`The other ${conflict.totalPlanned - count} file${conflict.totalPlanned - count === 1 ? "" : "s"} in this match have nowhere to collide. Replacing moves all ${conflict.totalPlanned}; declining deletes all of them along with the rest of the torrent.`}
                        className="border border-blue-500/30 bg-blue-900/10 text-xs"
                    />
                )}

                {!confirmDecline ? (
                    <>
                        <div className="text-xs text-[--muted] space-y-1">
                            <p>
                                <span className="text-gray-300 font-medium">Accept</span> overwrites the{" "}
                                {count} file{count === 1 ? "" : "s"} in your library with the ones from this torrent. The
                                copies currently there are gone for good.
                            </p>
                            <p>
                                <span className="text-gray-300 font-medium">Decline</span> keeps your library exactly as it
                                is and deletes this staged torrent along with all of its episodes. Only this one torrent is
                                touched.
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                            <Button intent="gray-outline" onClick={onCancel} disabled={busy}>
                                Cancel
                            </Button>
                            <Button
                                intent="alert-subtle"
                                leftIcon={<BiTrash />}
                                onClick={() => setConfirmDecline(true)}
                                disabled={busy}
                            >
                                Decline
                            </Button>
                            <Button intent="warning" onClick={onAccept} loading={isReplacing} disabled={busy}>
                                Accept &amp; replace
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <Alert
                            intent="alert"
                            title="Delete this torrent and all of its episodes?"
                            description={`"${torrentName}" and every file in it are deleted from the Unmatched folder. Your library is not touched. This cannot be undone.`}
                            className="border border-red-500/30 bg-red-900/20 text-xs"
                        />
                        <div className="flex justify-end gap-2 pt-1">
                            <Button intent="gray-outline" onClick={() => setConfirmDecline(false)} disabled={busy}>
                                Back
                            </Button>
                            <Button intent="alert" leftIcon={<BiTrash />} onClick={onDecline} loading={isDeleting} disabled={busy}>
                                Delete the torrent
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    )
}
