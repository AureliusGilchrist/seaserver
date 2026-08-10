"use client"

import { CountMismatch } from "@/api/hooks/unmatched.hooks"
import { Alert } from "@/components/ui/alert/alert"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import React from "react"
import { LuTriangleAlert } from "react-icons/lu"

/**
 * A match numbers episodes by position: the files are sorted and given episode numbers by where they
 * fall. That is only right when the files really are the episodes of the anime being matched to, and
 * the episode count is the cheap check on that. When it does not agree exactly, the numbering is
 * wrong in a way nothing downstream can detect — the files land in the library under numbers that
 * mean something else.
 *
 * So the server stops and sends back the plan. This is where it is shown, because the numbering is
 * the thing that goes wrong and it is only obvious when you can see it: which file becomes which
 * episode, in order, for every file in the download.
 */

/** How many rows are rendered before scrolling starts pulling in more. */
const PAGE_SIZE = 40

interface UnmatchedCountMismatchModalProps {
    mismatch: CountMismatch | null
    torrentName: string
    animeTitle: string
    isMatching: boolean
    /** Re-run the match with confirmCountMismatch set, exactly as previewed. */
    onConfirm: () => void
    onCancel: () => void
}

export function UnmatchedCountMismatchModal({
    mismatch,
    torrentName,
    animeTitle,
    isMatching,
    onConfirm,
    onCancel,
}: UnmatchedCountMismatchModalProps) {

    // Rendered a page at a time. A batch can hold hundreds of files, and mounting every row up front
    // makes opening this dialog the slowest thing on the screen — for rows nobody has scrolled to.
    const [visible, setVisible] = React.useState(PAGE_SIZE)

    // Reset whenever a different download is being asked about, so the next one does not open
    // already scrolled through the last one's list.
    React.useEffect(() => {
        setVisible(PAGE_SIZE)
    }, [torrentName, mismatch?.planned?.length])

    if (!mismatch) return null

    const planned = mismatch.planned ?? []
    const shown = planned.slice(0, visible)
    const tooMany = mismatch.found > mismatch.expected

    function handleScroll(e: React.UIEvent<HTMLDivElement>) {
        const el = e.currentTarget
        // One page ahead of the bottom, so the next rows exist by the time they are reached.
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) {
            setVisible(n => (n >= planned.length ? n : n + PAGE_SIZE))
        }
    }

    return (
        <Modal
            open={!!mismatch}
            onOpenChange={open => {
                if (!open) onCancel()
            }}
            title="Check the episode numbering"
            contentClass="max-w-3xl"
        >
            <div className="space-y-4">
                <Alert
                    intent="warning"
                    icon={<LuTriangleAlert />}
                    title={
                        tooMany
                            ? `This download has ${mismatch.found} episodes — ${animeTitle} has ${mismatch.expected}`
                            : `This download has only ${mismatch.found} of ${animeTitle}'s ${mismatch.expected} episodes`
                    }
                    description={
                        tooMany
                            ? "The extra files will be filed as episodes past the end of the season. That is usually a release carrying something the season does not — extras, specials, or a second season in the same folder."
                            : "The missing episodes are not filed at all, and what is here is numbered from the start. If the download is unfinished, the numbering below will be wrong."
                    }
                />

                <div>
                    <p className="text-sm text-[--muted] mb-2">
                        {planned.length} file{planned.length === 1 ? "" : "s"} would be filed into{" "}
                        <span className="text-[--foreground]">{mismatch.destination}</span> like this:
                    </p>

                    <div
                        className="max-h-[45vh] overflow-y-auto rounded-[--radius-md] border bg-gray-950 divide-y"
                        onScroll={handleScroll}
                        data-count-mismatch-preview
                    >
                        {shown.map((episode, i) => (
                            <div key={`${episode.relPath}-${i}`} className="p-2 text-xs">
                                <p className="font-medium truncate" title={episode.newName}>
                                    {episode.newName}
                                </p>
                                <p className="text-[--muted] truncate" title={episode.relPath}>
                                    from {episode.relPath}
                                </p>
                            </div>
                        ))}
                        {visible < planned.length && (
                            <p className="p-2 text-xs text-center text-[--muted]">
                                {planned.length - visible} more — scroll to load
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex gap-2 justify-end">
                    <Button intent="white-subtle" onClick={onCancel} disabled={isMatching}>
                        Cancel
                    </Button>
                    <Button intent="warning" onClick={onConfirm} loading={isMatching}>
                        Match anyway
                    </Button>
                </div>
            </div>
        </Modal>
    )
}
