import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { EnqueueFuture_AutoTorrentAddStatus, EnqueueFuture_AutoTorrentView, EnqueueFuture_Item } from "@/api/generated/types"
import {
    useConfirmAutoTorrent,
    useEditAutoTorrent,
    useEndAutoTorrent,
    useGetAutoTorrent,
    useRetryAutoTorrent,
    useStartAutoTorrent,
} from "@/api/hooks/enqueue_future.hooks"
import {
    __torrentDownload_matchSeasonOneAtom as matchSeasonOneAtom,
    MATCH_SEASON_ONE_HELP,
    MATCH_SEASON_ONE_LABEL,
} from "@/app/(main)/entry/_containers/torrent-search/torrent-download-auto-match"
import { Button, IconButton } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Modal } from "@/components/ui/modal"
import { Switch } from "@/components/ui/switch"
import { useQueryClient } from "@tanstack/react-query"
import { useAtom } from "jotai/react"
import React from "react"
import { LuTriangleAlert, LuX } from "react-icons/lu"
import { toast } from "sonner"

/**
 * Auto torrent: proposes a SeaDex release for each queued anime, forty at a time, for you to review.
 *
 * This popup is only a window onto a session that runs on the server (internal/enqueuefuture/
 * autotorrent.go). The server keeps the list, your place in it, the batch on screen with its picks
 * and every edit you make, searches the next batch while you review this one, and sends confirmed
 * picks to the torrent client in the background, paced so the client is never flooded. All of it
 * is saved to disk: closing this popup, leaving the page or restarting the server loses nothing.
 *
 * The picking rules live with the server too (autopick.go): SeaDex only, at least two seeders,
 * Dual Audio first, then the most files — a TV show must have more than one — and for a special,
 * the special's own release, or a flag saying it could only find the series.
 */
export function EnqueueFutureAutoTorrent({ open, onOpenChange, candidates }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Every undecided anime in the queue, in the order to work through them. Used to start a session. */
    candidates: EnqueueFuture_Item[]
}) {
    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            contentClass="max-w-4xl"
            title="Auto torrent"
            description="SeaDex releases only · 2+ seeders · Dual Audio preferred · most files wins (TV needs more than 1) · specials get their own release"
            data-enqueue-future-auto-torrent-modal
        >
            {open && <AutoTorrentBody candidates={candidates} onExit={() => onOpenChange(false)} />}
        </Modal>
    )
}

function AutoTorrentBody({ candidates, onExit }: { candidates: EnqueueFuture_Item[], onExit: () => void }) {
    const queryClient = useQueryClient()
    const { data: view, isLoading } = useGetAutoTorrent(true)
    const { mutate: start, isPending: isStarting } = useStartAutoTorrent()
    const { mutate: edit } = useEditAutoTorrent()
    const { mutate: confirm, isPending: isConfirming } = useConfirmAutoTorrent()
    const { mutate: retry, isPending: isRetrying } = useRetryAutoTorrent()
    const { mutate: end, isPending: isEnding } = useEndAutoTorrent()
    const [matchSeasonOne, setMatchSeasonOne] = useAtom(matchSeasonOneAtom)

    function startSession() {
        start({ mediaIds: candidates.map(c => c.mediaId) })
    }

    // Opening the popup with no session starts one straight away, as it always did. Once.
    const startedRef = React.useRef(false)
    React.useEffect(() => {
        if (startedRef.current || isLoading || !view || view.active || !candidates.length) return
        startedRef.current = true
        startSession()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, view?.active])

    // Edits are applied to the cached session at once and saved in the background, so striking
    // rows out never waits on the server.
    function saveEdits(removed: number[], autoMatchOff: number[]) {
        queryClient.setQueryData<EnqueueFuture_AutoTorrentView>([API_ENDPOINTS.AUTO_TORRENT.GetAutoTorrent.key], prev =>
            prev ? { ...prev, removed, autoMatchOff } : prev)
        edit({ removed, autoMatchOff })
    }

    if (isLoading || !view) {
        return <div className="py-12"><LoadingSpinner /></div>
    }

    if (!view.active) {
        return (
            <div className="py-10 text-center space-y-3">
                <AutoTorrentAddProgress status={view.adds} />
                {candidates.length ? (
                    <>
                        <p className="text-sm text-[--muted]">{candidates.length} anime in the queue to work through.</p>
                        <Button intent="white" loading={isStarting} onClick={startSession}>Start auto torrent</Button>
                    </>
                ) : (
                    <p className="text-sm text-[--muted]">Nothing in the queue is left to auto torrent.</p>
                )}
                <div><Button intent="gray-outline" onClick={onExit}>Back to Enqueue Future</Button></div>
            </div>
        )
    }

    if (view.done) {
        return (
            <div className="py-10 text-center space-y-3" data-enqueue-future-auto-torrent-done>
                <AutoTorrentAddProgress status={view.adds} />
                <p className="text-lg font-semibold">All done</p>
                <p className="text-sm text-[--muted]">All {view.total} anime in this run have been reviewed.</p>
                <div className="flex justify-center gap-2">
                    <Button intent="gray-outline" onClick={onExit}>Back to Enqueue Future</Button>
                    <Button intent="white" loading={isEnding} onClick={() => end()}>Close this run</Button>
                </div>
            </div>
        )
    }

    const picks = view.picks ?? []
    const removed = view.removed ?? []
    const autoMatchOff = view.autoMatchOff ?? []
    const withTorrent = picks.filter(p => !!p.torrent)
    const withoutTorrent = picks.filter(p => !p.torrent)
    const toDownload = withTorrent.filter(p => !removed.includes(p.mediaId))
    const isAutoMatch = (mediaId: number) => !autoMatchOff.includes(mediaId)

    function setAutoMatchFor(mediaId: number, value: boolean) {
        const next = value ? autoMatchOff.filter(id => id !== mediaId) : [...autoMatchOff, mediaId]
        saveEdits(removed, next)
    }

    function handleConfirm() {
        confirm({ matchSeasonOneOnly: matchSeasonOne }, {
            onSuccess: () => {
                if (toDownload.length) {
                    toast.success(`${toDownload.length} torrent${toDownload.length === 1 ? "" : "s"} queued — added in the background`)
                }
            },
        })
    }

    return (
        <div className="space-y-4" data-enqueue-future-auto-torrent>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[--muted]">
                <span>
                    Batch {view.batchNumber} of {view.totalBatches} · {view.batch?.length ?? 0} anime
                    {view.moreAfter ? ` · ${view.moreAfter} more after this` : ""}
                    {view.moreAfter > 0 && !view.picking && (
                        <span className={view.nextReady ? "text-green-300" : ""}>
                            {view.nextReady ? " · next batch ready" : " · next batch being searched"}
                        </span>
                    )}
                </span>
                {!view.picking && !!picks.length && (
                    <span>
                        <span className="text-[--foreground] font-semibold">{toDownload.length}</span> to download
                        {withoutTorrent.length ? ` · ${withoutTorrent.length} with no pick` : ""}
                        {toDownload.some(p => !!p.flag) && (
                            <span className="text-orange-300">{` · ${toDownload.filter(p => !!p.flag).length} flagged`}</span>
                        )}
                    </span>
                )}
            </div>

            <AutoTorrentAddProgress status={view.adds} />

            {view.picking ? (
                <div className="py-12 text-center space-y-3">
                    <LoadingSpinner />
                    <p className="text-sm text-[--muted]">
                        Searching SeaDex · <span className="text-[--foreground] font-semibold">{view.searched}</span> of {view.batch?.length ?? 0} done
                    </p>
                    <div className="mx-auto h-1.5 w-64 overflow-hidden rounded-full bg-gray-800">
                        <div
                            className="h-full bg-[--brand] transition-all"
                            style={{ width: `${Math.round((view.searched / Math.max(1, view.batch?.length ?? 1)) * 100)}%` }}
                        />
                    </div>
                    <p className="text-xs text-[--muted] max-w-md mx-auto">
                        This runs on the server, so you can close this and come back. Anime the queue has not prepared yet are
                        looked up on AniList first, about six a minute to stay inside AniList's limits, so a batch of those takes a
                        few minutes.
                    </p>
                </div>
            ) : view.pickError ? (
                <div className="py-10 text-center space-y-3">
                    <p className="text-sm text-red-300">{view.pickError}</p>
                    <Button intent="gray-outline" loading={isRetrying} onClick={() => retry()}>Try again</Button>
                </div>
            ) : (
                <div className="max-h-[60vh] overflow-y-auto space-y-1 pr-1" data-enqueue-future-auto-torrent-list>
                    {withTorrent.map(pick => {
                        if (removed.includes(pick.mediaId)) return null
                        return (
                            <div
                                key={pick.mediaId}
                                className={cn(
                                    "flex items-start gap-3 rounded-[--radius-md] border bg-gray-950 px-3 py-2",
                                    !!pick.flag && "border-orange-500/50",
                                )}
                                data-enqueue-future-auto-torrent-row
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium break-words">{pick.torrent!.name}</p>
                                    <p className="text-xs text-[--muted] break-words">
                                        Looking for: <span className="text-gray-300">{pick.title}</span>
                                        {pick.searchedFor ? ` — ${pick.searchedFor}` : ""}
                                    </p>
                                    <p className="text-xs text-[--muted]">
                                        {pick.files} file{pick.files === 1 ? "" : "s"} · {pick.torrent!.seeders} seeders
                                        {pick.torrent!.formattedSize ? ` · ${pick.torrent!.formattedSize}` : ""}
                                        {pick.dualAudio && <span className="ml-2 text-[--brand] font-semibold">Dual Audio</span>}
                                    </p>
                                    {!!pick.flag && (
                                        <p className="mt-1 flex items-start gap-1.5 text-xs text-orange-300" data-enqueue-future-auto-torrent-flag>
                                            <LuTriangleAlert className="mt-0.5 flex-none" />
                                            <span>{pick.flag}</span>
                                        </p>
                                    )}
                                </div>
                                <div className="flex-none pt-0.5" title="Match this one into your library automatically when it finishes">
                                    <Switch
                                        size="sm"
                                        label="Auto-match"
                                        value={isAutoMatch(pick.mediaId)}
                                        onValueChange={v => setAutoMatchFor(pick.mediaId, v)}
                                        data-enqueue-future-auto-torrent-row-auto-match
                                    />
                                </div>
                                <IconButton
                                    size="sm"
                                    intent="gray-basic"
                                    icon={<LuX />}
                                    aria-label="Remove from this batch"
                                    onClick={() => saveEdits([...removed, pick.mediaId], autoMatchOff)}
                                    data-enqueue-future-auto-torrent-remove
                                />
                            </div>
                        )
                    })}

                    {!toDownload.length && !!withTorrent.length && (
                        <p className="py-4 text-center text-sm text-[--muted]">Everything in this batch was removed.</p>
                    )}

                    {!!withoutTorrent.length && (
                        <details className="pt-2">
                            <summary className="cursor-pointer text-xs text-[--muted] select-none">
                                {withoutTorrent.length} with no pick — left alone in the queue
                            </summary>
                            <div className="space-y-1 pt-1">
                                {withoutTorrent.map(pick => (
                                    <div key={pick.mediaId} className="px-3 py-1.5 text-xs text-[--muted] rounded-[--radius-md] border border-dashed">
                                        <span className="text-gray-300">{pick.title || `#${pick.mediaId}`}</span>
                                        {" — "}{pick.reason || "No pick"}
                                    </div>
                                ))}
                            </div>
                        </details>
                    )}
                </div>
            )}

            <div className="space-y-2 border-t pt-3">
                <div className="flex flex-wrap items-center gap-2 text-sm text-[--muted]">
                    <span>Match automatically when finished:</span>
                    <span className="text-[--foreground]">
                        {toDownload.filter(p => isAutoMatch(p.mediaId)).length} of {toDownload.length}
                    </span>
                    <Button
                        size="xs"
                        intent="gray-subtle"
                        onClick={() => saveEdits(removed, [])}
                        data-enqueue-future-auto-torrent-auto-match-all-on
                    >
                        All on
                    </Button>
                    <Button
                        size="xs"
                        intent="gray-subtle"
                        onClick={() => saveEdits(removed, withTorrent.map(p => p.mediaId))}
                        data-enqueue-future-auto-torrent-auto-match-all-off
                    >
                        All off
                    </Button>
                </div>
                <Switch
                    label={MATCH_SEASON_ONE_LABEL}
                    help={MATCH_SEASON_ONE_HELP + " Applies to the torrents with auto-match on."}
                    value={matchSeasonOne}
                    onValueChange={setMatchSeasonOne}
                />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                    intent="alert-subtle"
                    size="sm"
                    loading={isEnding}
                    onClick={() => end()}
                    data-enqueue-future-auto-torrent-end
                >
                    End this run
                </Button>
                <div className="flex flex-wrap gap-2">
                    <Button
                        intent="gray-outline"
                        onClick={onExit}
                        data-enqueue-future-auto-torrent-exit
                    >
                        Exit
                    </Button>
                    <Button
                        intent="white"
                        onClick={handleConfirm}
                        loading={isConfirming}
                        disabled={view.picking || !!view.pickError}
                        data-enqueue-future-auto-torrent-confirm
                    >
                        {toDownload.length
                            ? `Download ${toDownload.length}${view.moreAfter ? " & next batch" : ""}`
                            : view.moreAfter ? "Next batch" : "Finish"}
                    </Button>
                </div>
            </div>
            <p className="text-xs text-[--muted] text-right">
                Exit keeps your place — this run carries on in the background and is here when you come back.
            </p>
        </div>
    )
}

/** One line about the server's background adds, while it has any. */
function AutoTorrentAddProgress({ status }: { status: EnqueueFuture_AutoTorrentAddStatus | undefined }) {
    if (!status) return null
    const busy = status.pending > 0 || !!status.current
    if (!busy && !status.added && !status.failed && !status.skipped && !status.settled) return null
    return (
        <div className="rounded-[--radius-md] border bg-gray-950 px-3 py-2 text-left text-xs text-[--muted] space-y-0.5" data-enqueue-future-auto-torrent-progress>
            <p>
                {busy
                    ? <><span className="text-[--foreground] font-semibold">{status.pending + (status.current ? 1 : 0)}</span> still being added in the background, one every 10s</>
                    : "Background adds finished"}
                {` · ${status.added} added`}
                {status.skipped ? ` · ${status.skipped} already in the client` : ""}
                {status.settled ? ` · ${status.settled} dropped, already dealt with` : ""}
                {status.failed ? ` · ${status.failed} failed` : ""}
            </p>
            {!!status.waiting && <p className="text-orange-300">{status.waiting}</p>}
            {!!status.failed && !!status.lastError && <p className="text-red-300">Last error: {status.lastError}</p>}
        </div>
    )
}
