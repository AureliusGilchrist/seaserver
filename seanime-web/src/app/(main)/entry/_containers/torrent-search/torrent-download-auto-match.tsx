import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Switch } from "@/components/ui/switch"
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
 * When enabled alongside auto-match, only the download's first season is matched.
 *
 * Batches are very often not one season — franchise packs and "complete series" releases arrive as a
 * folder per season — and an automatic match walks all of it, numbering season 2 episode 1 as
 * episode 13. With this on, a download with season folders matches season 1 and nothing else, and
 * one with no folders at all matches whole (a Specials or Extra folder is not season structure).
 * A download whose folders name no season 1 is left for manual matching rather than guessed at.
 *
 * Meaningless without auto-match, which is why every switch that offers it is disabled while
 * auto-match is off, and why the server drops it for any torrent not being auto-matched.
 */
export const __torrentDownload_matchSeasonOneAtom = atomWithStorage("sea-torrent-download-match-season-one", false)

/**
 * Copy for the season-1 switch. In one place because it appears on three screens — the destination
 * sheet, the auto-match confirmation, and the Enqueue Future queue — and three drifting explanations
 * of the same rule is worse than none.
 */
export const MATCH_SEASON_ONE_LABEL = "Match Season 1 automatically"
export const MATCH_SEASON_ONE_HELP =
    "For batches that carry more than one season. If the download has season folders, only Season 1 is matched — if it has none, all of it is (a Specials or Extra folder doesn't count). If it has folders but no Season 1, it waits in the Unmatched screen instead."
export const MATCH_SEASON_ONE_DISABLED_HELP = "Turn on automatic matching to use this."

/**
 * Per-torrent answers, keyed by torrent link, overriding the preference above for those torrents.
 *
 * The choice belongs to the torrent, not to the search: one selection can hold a release from a
 * group you trust enough to let it file itself and another you want to look at first. A single
 * answer for the whole batch meant reviewing what needed no review, or auto-filing what did.
 *
 * Deliberately not persisted, and cleared when the selection is. These are answers about the
 * specific releases in front of you right now — a link remembered from last week would be applying
 * a decision to a torrent nobody is looking at.
 */
export const __torrentDownload_autoMatchByTorrentAtom = atom<Record<string, boolean>>({})

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
export function AutoMatchConfirmationModal({ open, onOpenChange, onConfirm, animeTitle, matchSeasonOne, onMatchSeasonOneChange }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onConfirm: () => void
    animeTitle?: string
    /**
     * The season-1 switch, offered here as well as on the sheet behind it: this modal is the last
     * thing between the decision and the download, and scoping the match is part of the same
     * decision. Omit both to leave it out.
     */
    matchSeasonOne?: boolean
    onMatchSeasonOneChange?: (value: boolean) => void
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
                {onMatchSeasonOneChange && (
                    <Switch
                        label={MATCH_SEASON_ONE_LABEL}
                        help={MATCH_SEASON_ONE_HELP}
                        value={!!matchSeasonOne}
                        onValueChange={onMatchSeasonOneChange}
                        data-torrent-auto-match-confirmation-modal-season-one-switch
                    />
                )}
                <div className="flex justify-center gap-2 pt-2">
                    <Button intent="gray-outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button intent="white" onClick={onConfirm}>Yes, auto-match</Button>
                </div>
            </div>
        </Modal>
    )
}
