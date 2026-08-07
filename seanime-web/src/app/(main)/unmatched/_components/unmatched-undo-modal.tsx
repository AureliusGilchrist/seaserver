"use client"

import {
    MatchHistoryEntry,
    MatchHistoryFile,
    useDismissUnmatchedMatchRecord,
    useGetUnmatchedMatchHistory,
    useRevertUnmatchedMatch,
} from "@/api/hooks/unmatched.hooks"
import { Alert } from "@/components/ui/alert/alert"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Modal } from "@/components/ui/modal"
import { ConfirmationDialog, useConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { formatDistanceToNowSafe } from "@/lib/helpers/date"
import React, { useCallback, useMemo, useState } from "react"
import { BiArrowBack, BiCheck, BiUndo } from "react-icons/bi"
import { LuChevronDown, LuChevronRight, LuHistory } from "react-icons/lu"

/**
 * The undo screen for matches made from Unmatched Downloads.
 *
 * A match moves files out of the staging directory and renames every one of them, so getting a bad
 * match back used to mean finding the files in the library and renaming them by hand from memory.
 * This lists what each match did — original filename, new filename, where it went — and offers to
 * replay it backwards. Nothing is touched until the confirmation below is accepted.
 */
export function UnmatchedUndoModal({ open, onClose }: { open: boolean, onClose: () => void }) {
    const { data: history, isLoading, isFetching, refetch } = useGetUnmatchedMatchHistory({ enabled: open })

    const [expanded, setExpanded] = useState<Set<number>>(new Set())
    const [search, setSearch] = useState("")
    const [showReverted, setShowReverted] = useState(false)
    // The match the user asked to undo. Holding it here is what puts the confirmation on screen —
    // the revert itself only runs once that confirmation is accepted.
    const [confirming, setConfirming] = useState<MatchHistoryEntry | null>(null)
    const [dismissTarget, setDismissTarget] = useState<MatchHistoryEntry | null>(null)

    const { mutate: revertMatch, isPending: isReverting } = useRevertUnmatchedMatch(() => {
        setConfirming(null)
    })
    const { mutate: dismissRecord, isPending: isDismissing } = useDismissUnmatchedMatchRecord(() => {
        setDismissTarget(null)
    })

    const dismissConfirm = useConfirmationDialog({
        title: "Keep this match?",
        description: "The files stay exactly where they are. This only takes the match off the undo list, and it can't be undone from here afterwards.",
        actionText: "Keep it",
        actionIntent: "primary-subtle",
        onConfirm: () => {
            if (dismissTarget) dismissRecord({ id: dismissTarget.id })
        },
    })

    const askDismiss = useCallback((entry: MatchHistoryEntry) => {
        setDismissTarget(entry)
        dismissConfirm.open()
    }, [dismissConfirm])

    const toggleExpanded = useCallback((id: number) => {
        setExpanded(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }, [])

    const entries = useMemo(() => {
        const list = (history ?? []).filter(e => showReverted || !e.revertedAt)
        const q = search.trim().toLowerCase()
        if (!q) return list
        return list.filter(e =>
            e.animeTitle.toLowerCase().includes(q)
            || e.torrentName.toLowerCase().includes(q),
        )
    }, [history, search, showReverted])

    const revertedCount = (history ?? []).filter(e => !!e.revertedAt).length

    return (
        <>
            <Modal
                open={open}
                onOpenChange={(o) => !o && onClose()}
                contentClass="max-w-4xl"
                title="Undo matches"
            >
                <div className="space-y-4">
                    <p className="text-sm text-[--muted]">
                        Every match made from this screen is written down: which file came from where, and what it was
                        renamed to. Undoing one moves its files back to the Unmatched folder under their original
                        filenames.
                    </p>

                    {isLoading ? (
                        <div className="flex justify-center py-10"><LoadingSpinner /></div>
                    ) : (history?.length ?? 0) === 0 ? (
                        <div className="flex flex-col items-center justify-center py-14 text-center">
                            <LuHistory className="text-5xl text-[--muted] mb-3" />
                            <p className="text-[--muted]">No matches to undo</p>
                            <p className="text-sm text-[--muted]">Matches you make from this screen show up here.</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-3 flex-wrap">
                                <input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search by anime or torrent name..."
                                    className="flex-1 min-w-[220px] rounded-lg bg-gray-900/70 border border-gray-800 px-3 py-2 text-sm text-white focus:border-brand-400 focus:outline-none"
                                />
                                {revertedCount > 0 && (
                                    <button
                                        onClick={() => setShowReverted(p => !p)}
                                        className={cn(
                                            "px-3 py-2 rounded-lg text-xs font-medium border transition-colors",
                                            showReverted
                                                ? "bg-brand-700/30 border-brand-600 text-brand-200 hover:bg-brand-700/50"
                                                : "bg-gray-900/70 border-gray-700 text-[--muted] hover:border-gray-500",
                                        )}
                                    >
                                        {showReverted ? "Hiding nothing" : `Show ${revertedCount} already undone`}
                                    </button>
                                )}
                                <Button intent="gray-outline" size="sm" onClick={() => refetch()} loading={isFetching}>
                                    Refresh
                                </Button>
                            </div>

                            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
                                {entries.map(entry => (
                                    <MatchHistoryCard
                                        key={entry.id}
                                        entry={entry}
                                        isExpanded={expanded.has(entry.id)}
                                        onToggleExpanded={() => toggleExpanded(entry.id)}
                                        onUndo={() => setConfirming(entry)}
                                        onKeep={() => askDismiss(entry)}
                                        isBusy={isReverting || isDismissing}
                                    />
                                ))}
                                {entries.length === 0 && (
                                    <p className="text-[--muted] text-sm py-4">No matches here.</p>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </Modal>

            {/* The confirmation. Deliberately its own screen rather than a one-line prompt: a revert
                moves files across the disk, and what it can and cannot put back has to be visible
                before the button is pressed. */}
            {confirming && (
                <Modal
                    open={!!confirming}
                    onOpenChange={(o) => !o && !isReverting && setConfirming(null)}
                    contentClass="max-w-2xl"
                    title="Are you sure you want to undo this match?"
                >
                    <RevertConfirmation
                        entry={confirming}
                        isReverting={isReverting}
                        onCancel={() => setConfirming(null)}
                        onConfirm={() => revertMatch({ id: confirming.id, confirmed: true })}
                    />
                </Modal>
            )}

            <ConfirmationDialog {...dismissConfirm} />
        </>
    )
}

// ─── One recorded match ──────────────────────────────────────────────

function MatchHistoryCard({
    entry,
    isExpanded,
    onToggleExpanded,
    onUndo,
    onKeep,
    isBusy,
}: {
    entry: MatchHistoryEntry
    isExpanded: boolean
    onToggleExpanded: () => void
    onUndo: () => void
    onKeep: () => void
    isBusy: boolean
}) {
    const isReverted = !!entry.revertedAt

    return (
        <div className={cn(
            "border rounded-md overflow-hidden",
            isReverted ? "border-gray-800 bg-gray-950/40 opacity-80" : "border-gray-800 bg-gray-950/20",
        )}>
            <div className="p-3 space-y-2">
                <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-brand-200 truncate">{entry.animeTitle || "Unknown anime"}</p>
                            {isReverted && (
                                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">
                                    Undone {formatDistanceToNowSafe(entry.revertedAt!)}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-[--muted] truncate" title={entry.torrentName}>{entry.torrentName}</p>
                        <p className="text-xs text-[--muted]">
                            {entry.files.length} file{entry.files.length === 1 ? "" : "s"} · matched {formatDistanceToNowSafe(entry.matchedAt)}
                        </p>
                    </div>

                    {!isReverted && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <Button
                                intent="alert-subtle"
                                size="sm"
                                leftIcon={<BiUndo />}
                                onClick={onUndo}
                                disabled={isBusy || entry.readyCount === 0}
                                title={entry.readyCount === 0 ? "None of these files are still where the match left them" : undefined}
                            >
                                Undo
                            </Button>
                            <Button intent="gray-outline" size="sm" leftIcon={<BiCheck />} onClick={onKeep} disabled={isBusy}>
                                Keep
                            </Button>
                        </div>
                    )}
                </div>

                {!isReverted && (
                    <div className="flex items-center gap-2 flex-wrap text-[11px]">
                        {entry.readyCount > 0 && <StatusChip tone="ok">{entry.readyCount} can be restored</StatusChip>}
                        {entry.missingCount > 0 && <StatusChip tone="muted">{entry.missingCount} no longer there</StatusChip>}
                        {entry.blockedCount > 0 && <StatusChip tone="warn">{entry.blockedCount} blocked</StatusChip>}
                        {(entry.deletedFiles?.length ?? 0) > 0 && (
                            <StatusChip tone="warn">{entry.deletedFiles!.length} deleted at match time</StatusChip>
                        )}
                    </div>
                )}

                {isReverted && entry.revert && (
                    <p className="text-xs text-[--muted]">
                        {entry.revert.restored.length} file{entry.revert.restored.length === 1 ? "" : "s"} moved back
                        {(entry.revert.missing?.length ?? 0) > 0 && `, ${entry.revert.missing!.length} were no longer there`}
                        {(entry.revert.failed?.length ?? 0) > 0 && `, ${entry.revert.failed!.length} couldn't be restored`}
                        {entry.revert.destinationRemoved && ", and the emptied folder was removed"}.
                    </p>
                )}

                <button
                    onClick={onToggleExpanded}
                    className="flex items-center gap-1 text-xs text-[--muted] hover:text-white transition-colors"
                >
                    {isExpanded ? <LuChevronDown className="w-3.5 h-3.5" /> : <LuChevronRight className="w-3.5 h-3.5" />}
                    {isExpanded ? "Hide filenames" : "Show original and new filenames"}
                </button>
            </div>

            {isExpanded && (
                <div className="border-t border-gray-800/60">
                    <div className="px-3 py-2 text-[11px] text-[--muted] bg-gray-950/40 flex items-center justify-between gap-2">
                        <span className="truncate" title={entry.stagingPath}>From: {entry.stagingPath || "Unmatched folder"}</span>
                        <span className="truncate text-right" title={entry.destination}>To: {entry.destination}</span>
                    </div>
                    <div className="max-h-[220px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                        <div className="divide-y divide-gray-800/60">
                            {entry.files.map(file => <FileRow key={file.newPath} file={file} />)}
                        </div>
                    </div>
                    {(entry.deletedFiles?.length ?? 0) > 0 && (
                        <div className="px-3 py-2 border-t border-gray-800/60 text-[11px] text-amber-300/90">
                            Deleted at match time and not recoverable: {entry.deletedFiles!.join(", ")}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function FileRow({ file }: { file: MatchHistoryFile }) {
    return (
        <div className="px-3 py-1.5 text-xs flex items-center gap-2">
            <span className="flex-1 min-w-0 truncate text-gray-300" title={file.newPath}>{file.newName}</span>
            <BiArrowBack className="flex-shrink-0 text-[--muted]" />
            <span className="flex-1 min-w-0 truncate text-gray-400" title={file.originalPath}>{file.originalRelPath}</span>
            <FileStatusLabel status={file.status} />
        </div>
    )
}

function FileStatusLabel({ status }: { status: MatchHistoryFile["status"] }) {
    switch (status) {
        case "ready":
            return <span className="flex-shrink-0 text-[10px] text-brand-300">will be restored</span>
        case "missing":
            return <span className="flex-shrink-0 text-[10px] text-[--muted]">not where it was left</span>
        case "blocked":
            return <span className="flex-shrink-0 text-[10px] text-amber-400">blocked</span>
        case "restored":
            return <span className="flex-shrink-0 text-[10px] text-green-400">restored</span>
        default:
            return null
    }
}

function StatusChip({ tone, children }: { tone: "ok" | "warn" | "muted", children: React.ReactNode }) {
    return (
        <span className={cn(
            "px-1.5 py-0.5 rounded border",
            tone === "ok" && "border-brand-600/40 bg-brand-900/20 text-brand-200",
            tone === "warn" && "border-amber-600/40 bg-amber-900/20 text-amber-200",
            tone === "muted" && "border-gray-700 bg-gray-900/40 text-[--muted]",
        )}>
            {children}
        </span>
    )
}

// ─── Revert confirmation ─────────────────────────────────────────────

/**
 * Spells out everything the revert is about to do — which files move back, under which names, what
 * happens to the folder they came out of, and what it cannot bring back — before a single file is
 * touched. The mirror image of the match confirmation, and for the same reason.
 */
function RevertConfirmation({
    entry,
    isReverting,
    onCancel,
    onConfirm,
}: {
    entry: MatchHistoryEntry
    isReverting: boolean
    onCancel: () => void
    onConfirm: () => void
}) {
    const ready = entry.files.filter(f => f.status === "ready")
    const missing = entry.files.filter(f => f.status === "missing")
    const blocked = entry.files.filter(f => f.status === "blocked")

    const warnings: string[] = []
    if (missing.length > 0) {
        warnings.push(`${missing.length} file${missing.length === 1 ? " is" : "s are"} no longer where the match left ${missing.length === 1 ? "it" : "them"} — renamed, moved or deleted since. ${missing.length === 1 ? "It stays" : "They stay"} as ${missing.length === 1 ? "it is" : "they are"}.`)
    }
    if (blocked.length > 0) {
        warnings.push(`${blocked.length} file${blocked.length === 1 ? "" : "s"} can't go back: something is already sitting at the original path. Nothing is overwritten, so ${blocked.length === 1 ? "that file stays" : "those files stay"} in your library.`)
    }
    if ((entry.deletedFiles?.length ?? 0) > 0) {
        warnings.push(`${entry.deletedFiles!.length} creditless/bonus file${entry.deletedFiles!.length === 1 ? " was" : "s were"} deleted when this match ran. Undoing can't bring ${entry.deletedFiles!.length === 1 ? "it" : "them"} back.`)
    }

    return (
        <div className="space-y-4 py-2">
            <p className="text-sm">
                <span className="font-semibold">{ready.length}</span> file{ready.length === 1 ? "" : "s"} will be{" "}
                <span className="font-semibold">moved back</span> out of{" "}
                <span className="font-semibold text-brand-200">{entry.animeTitle}</span> in your library and into the
                Unmatched folder, renamed to the filename{ready.length === 1 ? "" : "s"} the torrent shipped with.
            </p>

            {ready.length > 0 ? (
                <div className="border rounded-md overflow-hidden">
                    <div className="px-3 py-2 border-b bg-gray-950/40 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[--muted]">Now → restored to</p>
                        <p className="text-xs text-[--muted]">{ready.length} file{ready.length === 1 ? "" : "s"}</p>
                    </div>
                    <div className="max-h-[220px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                        <div className="divide-y divide-gray-800/60">
                            {ready.map(file => (
                                <div key={file.newPath} className="px-3 py-1.5 text-xs flex items-center gap-2">
                                    <span className="flex-1 min-w-0 truncate text-gray-300" title={file.newPath}>{file.newName}</span>
                                    <BiArrowBack className="flex-shrink-0 text-[--muted]" />
                                    <span className="flex-1 min-w-0 truncate text-brand-300" title={file.originalPath}>{file.originalRelPath}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <Alert
                    intent="alert"
                    title="Nothing left to restore"
                    description="None of this match's files are still where it left them, so there is nothing to move back."
                    className="border border-red-500/30 bg-red-900/20"
                />
            )}

            <div className="p-3 border rounded-md bg-[--subtle] space-y-1 text-xs text-[--muted]">
                <p>Files go back to <span className="text-gray-300">{entry.stagingPath}</span>, season folders and all.</p>
                <p>The library entries this match created are removed, so the anime stops listing these episodes.</p>
                <p>
                    <span className="text-gray-300">{entry.destination}</span> is deleted only if the revert leaves it
                    completely empty — anything else in it means the folder stays.
                </p>
                <p>The torrent reappears in Unmatched Downloads with its anime still attached, ready to be matched again. Auto-match is switched off for it so it isn't immediately re-matched.</p>
            </div>

            {warnings.length > 0 && (
                <div className="space-y-2">
                    {warnings.map((w, i) => (
                        <Alert
                            key={i}
                            intent="warning"
                            description={w}
                            className="border border-amber-500/30 bg-amber-900/10 text-xs"
                        />
                    ))}
                </div>
            )}

            <p className="text-sm font-medium text-center pt-1">
                Are you sure you want to go through with this?
            </p>

            <div className="flex justify-end gap-2">
                <Button intent="gray-outline" onClick={onCancel} disabled={isReverting}>
                    No, leave it alone
                </Button>
                <Button
                    intent="alert"
                    onClick={onConfirm}
                    disabled={ready.length === 0 || isReverting}
                    loading={isReverting}
                    leftIcon={<BiUndo />}
                >
                    Yes, move {ready.length} file{ready.length === 1 ? "" : "s"} back
                </Button>
            </div>
        </div>
    )
}
