import { AutoTorrentQueueStatus, EnqueueFuture_AutoPick, EnqueueFuture_Item } from "@/api/generated/types"
import { useAutoPickEnqueueFuture, useAutoTorrentAdd, useGetAutoTorrentAddStatus } from "@/api/hooks/enqueue_future.hooks"
import {
    __torrentDownload_matchSeasonOneAtom as matchSeasonOneAtom,
    MATCH_SEASON_ONE_HELP,
    MATCH_SEASON_ONE_LABEL,
} from "@/app/(main)/entry/_containers/torrent-search/torrent-download-auto-match"
import { Button, IconButton } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Modal } from "@/components/ui/modal"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/components/ui/core/styling"
import { useAtom } from "jotai/react"
import React from "react"
import { LuTriangleAlert, LuX } from "react-icons/lu"
import { toast } from "sonner"

/** How many anime are proposed for review at once. */
export const AUTO_TORRENT_BATCH_SIZE = 40

/**
 * Auto torrent: proposes a SeaDex release for each queued anime, forty at a time, for you to review.
 *
 * The server does the choosing (see internal/enqueuefuture/autopick.go): SeaDex only, at least two
 * seeders, Dual Audio first, then the most files — and a TV show must have more than one file. Here
 * you strike out anything that looks wrong with ×, then confirm; what is left is handed to the server
 * and the next forty are fetched straight away. The server sends them to the torrent client in the
 * background, paced so the client is never flooded (internal/handlers/auto_torrent_queue.go) —
 * closing the popup does not stop that, it only stops reviewing.
 *
 * The list of anime to work through is frozen when the popup opens, so the queue changing underneath
 * (a run still going, a download badge arriving) never reshuffles a batch you are looking at.
 */
export function EnqueueFutureAutoTorrent({ open, onOpenChange, candidates }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Ready, actionable queue rows in the order the queue shows them. */
    candidates: EnqueueFuture_Item[]
}) {
    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            contentClass="max-w-4xl"
            title="Auto torrent"
            description="SeaDex releases only · 2+ seeders · Dual Audio preferred · most files wins (TV needs more than 1)"
            data-enqueue-future-auto-torrent-modal
        >
            {open && <AutoTorrentBody candidates={candidates} onExit={() => onOpenChange(false)} />}
        </Modal>
    )
}

function AutoTorrentBody({ candidates, onExit }: { candidates: EnqueueFuture_Item[], onExit: () => void }) {
    // Frozen on open — see the component comment.
    const [frozen] = React.useState(() => candidates.map(c => c.mediaId))
    // Which of them have not been prepared yet: those are looked up on AniList first, slowly.
    const [unprepared] = React.useState(() => new Set(candidates.filter(c => c.status !== "ready").map(c => c.mediaId)))

    // Every anime already put in front of you this session, whether downloaded or struck out.
    const [handled, setHandled] = React.useState<Set<number>>(() => new Set())
    const [batchIds, setBatchIds] = React.useState<number[]>([])
    const [picks, setPicks] = React.useState<EnqueueFuture_AutoPick[]>([])
    const [removed, setRemoved] = React.useState<Set<number>>(() => new Set())

    // Decided per torrent: on unless you turned it off for that row. Reset with each batch.
    const [autoMatchOff, setAutoMatchOff] = React.useState<Set<number>>(() => new Set())
    const isAutoMatch = (mediaId: number) => !autoMatchOff.has(mediaId)
    function setAutoMatchFor(mediaId: number, value: boolean) {
        setAutoMatchOff(prev => {
            const next = new Set(prev)
            if (value) next.delete(mediaId)
            else next.add(mediaId)
            return next
        })
    }
    const [matchSeasonOne, setMatchSeasonOne] = useAtom(matchSeasonOneAtom)

    const { mutateAsync: autoPick, isPending: isPicking } = useAutoPickEnqueueFuture()
    const { mutateAsync: queueAdds, isPending: isQueueing } = useAutoTorrentAdd()
    const { data: addStatus } = useGetAutoTorrentAddStatus(true)

    const [error, setError] = React.useState<string | null>(null)

    const remaining = React.useMemo(() => frozen.filter(id => !handled.has(id)), [frozen, handled])

    // Guards against a stale response landing after the popup moved on (or closed).
    const requestRef = React.useRef(0)

    const loadNextBatch = React.useCallback(async (from: number[]) => {
        const next = from.slice(0, AUTO_TORRENT_BATCH_SIZE)
        setBatchIds(next)
        setPicks([])
        setRemoved(new Set())
        setAutoMatchOff(new Set())
        setError(null)
        if (!next.length) return
        const req = ++requestRef.current
        try {
            const result = await autoPick({ mediaIds: next })
            if (req !== requestRef.current) return
            setPicks(result ?? [])
            // A flagged pick is most likely the whole series for a special — filing that into the
            // special's entry automatically would be wrong, so those start with auto-match off.
            setAutoMatchOff(new Set((result ?? []).filter(p => !!p.torrent && !!p.flag).map(p => p.mediaId)))
        }
        catch (e: any) {
            if (req !== requestRef.current) return
            setError(e?.response?.data?.error || e?.message || "Could not search SeaDex")
        }
    }, [autoPick])

    // First batch on open.
    React.useEffect(() => {
        void loadNextBatch(frozen)
        return () => {
            requestRef.current++
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const withTorrent = picks.filter(p => !!p.torrent)
    const withoutTorrent = picks.filter(p => !p.torrent)
    const toDownload = withTorrent.filter(p => !removed.has(p.mediaId))

    function remove(mediaId: number) {
        setRemoved(prev => new Set(prev).add(mediaId))
    }

    function finishBatch() {
        const nextHandled = new Set(handled)
        batchIds.forEach(id => nextHandled.add(id))
        setHandled(nextHandled)
        void loadNextBatch(frozen.filter(id => !nextHandled.has(id)))
    }

    async function handleConfirm() {
        if (!toDownload.length) {
            finishBatch()
            return
        }
        try {
            await queueAdds({
                items: toDownload.map(pick => ({
                    torrent: pick.torrent!,
                    media: pick.media,
                    autoMatch: isAutoMatch(pick.mediaId),
                    matchSeasonOneOnly: isAutoMatch(pick.mediaId) && matchSeasonOne,
                })),
            })
        }
        catch {
            // The request itself failed — nothing was queued, so stay on this batch to retry.
            toast.error("Could not hand the torrents to the server. Nothing was added.")
            return
        }
        toast.success(`${toDownload.length} torrent${toDownload.length === 1 ? "" : "s"} queued — the server adds them in the background`)
        finishBatch()
    }

    const batchNumber = Math.floor((frozen.length - remaining.length) / AUTO_TORRENT_BATCH_SIZE) + 1
    const totalBatches = Math.max(1, Math.ceil(frozen.length / AUTO_TORRENT_BATCH_SIZE))

    if (!frozen.length) {
        return (
            <div className="py-10 text-center space-y-3">
                <p className="text-sm text-[--muted]">Nothing in the queue is ready to auto torrent.</p>
                <Button intent="gray-outline" onClick={onExit}>Back to Enqueue Future</Button>
            </div>
        )
    }

    if (!batchIds.length) {
        return (
            <div className="py-10 text-center space-y-3" data-enqueue-future-auto-torrent-done>
                <p className="text-lg font-semibold">All done</p>
                <p className="text-sm text-[--muted]">Every ready anime in the queue has been reviewed.</p>
                <Button intent="white" onClick={onExit}>Back to Enqueue Future</Button>
            </div>
        )
    }

    return (
        <div className="space-y-4" data-enqueue-future-auto-torrent>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[--muted]">
                <span>
                    Batch {batchNumber} of {totalBatches} · {batchIds.length} anime
                    {remaining.length > batchIds.length ? ` · ${remaining.length - batchIds.length} more after this` : ""}
                </span>
                {!isPicking && !!picks.length && (
                    <span>
                        <span className="text-[--foreground] font-semibold">{toDownload.length}</span> to download
                        {withoutTorrent.length ? ` · ${withoutTorrent.length} with no pick` : ""}
                        {toDownload.some(p => !!p.flag) && (
                            <span className="text-orange-300">{` · ${toDownload.filter(p => !!p.flag).length} flagged`}</span>
                        )}
                    </span>
                )}
            </div>

            <AutoTorrentAddProgress status={addStatus} />

            {isPicking ? (
                <div className="py-12 text-center space-y-3">
                    <LoadingSpinner />
                    <p className="text-sm text-[--muted]">Searching SeaDex for {batchIds.length} anime… this can take a minute.</p>
                    {batchIds.some(id => unprepared.has(id)) && (
                        <p className="text-xs text-[--muted] max-w-md mx-auto">
                            {batchIds.filter(id => unprepared.has(id)).length} of these have not been prepared yet, so each is looked
                            up on AniList first — about four a minute, to stay inside AniList's limits. This batch will take a while.
                        </p>
                    )}
                </div>
            ) : error ? (
                <div className="py-10 text-center space-y-3">
                    <p className="text-sm text-red-300">{error}</p>
                    <Button intent="gray-outline" onClick={() => void loadNextBatch(remaining)}>Try again</Button>
                </div>
            ) : (
                <div className="max-h-[60vh] overflow-y-auto space-y-1 pr-1" data-enqueue-future-auto-torrent-list>
                    {withTorrent.map(pick => {
                        if (removed.has(pick.mediaId)) return null
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
                                    onClick={() => remove(pick.mediaId)}
                                    data-enqueue-future-auto-torrent-remove
                                />
                            </div>
                        )
                    })}

                    {!toDownload.length && !!withTorrent.length && (
                        <p className="py-4 text-center text-sm text-[--muted]">
                            Everything in this batch was removed.
                        </p>
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
                        onClick={() => setAutoMatchOff(new Set())}
                        data-enqueue-future-auto-torrent-auto-match-all-on
                    >
                        All on
                    </Button>
                    <Button
                        size="xs"
                        intent="gray-subtle"
                        onClick={() => setAutoMatchOff(new Set(withTorrent.map(p => p.mediaId)))}
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

            <div className="flex flex-wrap justify-end gap-2">
                <Button
                    intent="gray-outline"
                    onClick={onExit}
                    disabled={isQueueing}
                    data-enqueue-future-auto-torrent-exit
                >
                    Exit
                </Button>
                <Button
                    intent="white"
                    onClick={() => void handleConfirm()}
                    loading={isQueueing}
                    disabled={isPicking || !!error}
                    data-enqueue-future-auto-torrent-confirm
                >
                    {toDownload.length
                            ? `Download ${toDownload.length}${remaining.length > batchIds.length ? " & next batch" : ""}`
                            : remaining.length > batchIds.length ? "Next batch" : "Finish"}
                </Button>
            </div>
        </div>
    )
}

/** One line about the server's background adds, while it has any. */
function AutoTorrentAddProgress({ status }: { status: AutoTorrentQueueStatus | undefined }) {
    if (!status) return null
    const busy = status.pending > 0 || !!status.current
    if (!busy && !status.added && !status.failed && !status.skipped && !status.settled) return null
    return (
        <div className="rounded-[--radius-md] border bg-gray-950 px-3 py-2 text-xs text-[--muted] space-y-0.5" data-enqueue-future-auto-torrent-progress>
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
