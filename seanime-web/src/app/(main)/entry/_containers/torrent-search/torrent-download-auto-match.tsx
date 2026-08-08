import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import React from "react"

/**
 * When enabled, a torrent is matched to its anime automatically as soon as it finishes
 * downloading — the same match the user would otherwise perform by hand in the Unmatched
 * screen. Persisted so the preference carries across downloads and sessions.
 *
 * Lives here rather than in the download sheet so the sheet and the file picker (which import
 * each other) can both reach it without an import cycle.
 */
export const __torrentDownload_autoMatchAtom = atomWithStorage("sea-torrent-download-auto-match", false)

/**
 * Whether auto-match has already been confirmed once in this session.
 *
 * Only consulted where downloads are queued back-to-back — the Enqueue Future queue, where you may
 * work through a hundred anime in a sitting and confirming the same thing a hundred times is not a
 * safeguard, it is an obstacle to clicking through. Deliberately not persisted: a new session asks
 * again, so the answer is never older than the sitting it was given in.
 */
export const __torrentDownload_autoMatchConfirmedAtom = atom(false)

/**
 * Confirmation shown before queueing a download that will match itself once it finishes.
 *
 * Auto-match is a sticky preference, so without this a toggle left on weeks ago silently moves a
 * download into the library with no chance to review what it matched to.
 */
export function AutoMatchConfirmationModal({ open, onOpenChange, onConfirm, animeTitle }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onConfirm: () => void
    animeTitle?: string
}) {
    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            contentClass="max-w-md"
            title="Auto-match"
            titleClass="text-center"
            data-torrent-auto-match-confirmation-modal
        >
            <div className="space-y-4 py-2">
                <p className="text-center text-lg">
                    Are you sure you want to <strong>auto-match?</strong>
                </p>
                <p className="text-center text-sm text-[--muted]">
                    When this download finishes, its files are moved straight into your library
                    {animeTitle ? <> as <span className="text-[--foreground] font-medium">{animeTitle}</span></> : ""} —
                    it won't stop in the Unmatched screen for you to review first.
                </p>
                <div className="flex justify-center gap-2 pt-2">
                    <Button intent="gray-outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button intent="white" onClick={onConfirm}>Yes, auto-match</Button>
                </div>
            </div>
        </Modal>
    )
}
