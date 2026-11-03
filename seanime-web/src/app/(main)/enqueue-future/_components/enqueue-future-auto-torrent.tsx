import { useSeaQuery, useServerMutation } from "@/api/client/requests"
import { TorrentClientDownload_Variables } from "@/api/generated/endpoint.types"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { EnqueueFuture_AutoPick, EnqueueFuture_Item } from "@/api/generated/types"
import { useAutoPickEnqueueFuture } from "@/api/hooks/enqueue_future.hooks"
import { TorrentAddQueueView } from "@/api/hooks/torrent_client.hooks"
import { useDownloadingAnime } from "@/app/(main)/_atoms/downloading.atoms"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import {
    __torrentDownload_matchSeasonOneAtom as matchSeasonOneAtom,
    MATCH_SEASON_ONE_HELP,
    MATCH_SEASON_ONE_LABEL,
} from "@/app/(main)/entry/_containers/torrent-search/torrent-download-auto-match"
import { sanitizeDirectoryName } from "@/app/(main)/entry/_containers/torrent-search/torrent-download-file-selection"
import { Button, IconButton } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Modal } from "@/components/ui/modal"
import { Switch } from "@/components/ui/switch"
import { upath } from "@/lib/helpers/upath"
import { useAtom } from "jotai/react"
import React from "react"
import { LuX } from "react-icons/lu"
import { toast } from "sonner"

/** How many anime are proposed for review at once. */
export const AUTO_TORRENT_BATCH_SIZE = 40

/** Pause between two torrents sent to the client, so it can settle each one before the next. */
const AUTO_TORRENT_ADD_GAP_MS = 10_000

/** An add slower than this means the client is struggling; the run stops rather than piling on. */
const AUTO_TORRENT_SLOW_ADD_MS = 20_000

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Auto torrent: proposes a SeaDex release for each queued anime, forty at a time, for you to review.
 *
 * The server does the choosing (see internal/enqueuefuture/autopick.go): SeaDex only, at least two
 * seeders, Dual Audio first, then the most files — and a TV show must have more than one file. Here
 * you strike out anything that looks wrong with ×, then confirm; what is left is downloaded and the
 * next forty are fetched. Closing the popup stops it and drops you back on the queue.
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
    const serverStatus = useServerStatus()
    const libraryPath = serverStatus?.settings?.library?.libraryPath

    // Frozen on open — see the component comment.
    const [frozen] = React.useState(() => candidates.map(c => c.mediaId))

    // Every anime already put in front of you this session, whether downloaded or struck out.
    const [handled, setHandled] = React.useState<Set<number>>(() => new Set())
    const [batchIds, setBatchIds] = React.useState<number[]>([])
    const [picks, setPicks] = React.useState<EnqueueFuture_AutoPick[]>([])
    const [removed, setRemoved] = React.useState<Set<number>>(() => new Set())
    // Sent to the client already in this batch — dropped from the list so a retry never re-sends them.
    const [added, setAdded] = React.useState<Set<number>>(() => new Set())
    const { seaFetch } = useSeaQuery()

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
    const { mutateAsync: download } = useServerMutation<boolean, TorrentClientDownload_Variables>({
        endpoint: API_ENDPOINTS.TORRENT_CLIENT.TorrentClientDownload.endpoint,
        method: API_ENDPOINTS.TORRENT_CLIENT.TorrentClientDownload.methods[0],
        mutationKey: [API_ENDPOINTS.TORRENT_CLIENT.TorrentClientDownload.key, "auto-torrent"],
    })
    const { addDownloadingAnime } = useDownloadingAnime()

    const [downloading, setDownloading] = React.useState<{ done: number, total: number } | null>(null)
    const [error, setError] = React.useState<string | null>(null)

    const remaining = React.useMemo(() => frozen.filter(id => !handled.has(id)), [frozen, handled])

    // Guards against a stale response landing after the popup moved on (or closed).
    const requestRef = React.useRef(0)

    const loadNextBatch = React.useCallback(async (from: number[]) => {
        const next = from.slice(0, AUTO_TORRENT_BATCH_SIZE)
        setBatchIds(next)
        setPicks([])
        setRemoved(new Set())
        setAdded(new Set())
        setStopReason(null)
        setAutoMatchOff(new Set())
        setError(null)
        if (!next.length) return
        const req = ++requestRef.current
        try {
            const result = await autoPick({ mediaIds: next })
            if (req !== requestRef.current) return
            setPicks(result ?? [])
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
    const toDownload = withTorrent.filter(p => !removed.has(p.mediaId) && !added.has(p.mediaId))

    function remove(mediaId: number) {
        setRemoved(prev => new Set(prev).add(mediaId))
    }

    function finishBatch() {
        const nextHandled = new Set(handled)
        batchIds.forEach(id => nextHandled.add(id))
        setHandled(nextHandled)
        void loadNextBatch(frozen.filter(id => !nextHandled.has(id)))
    }

    // Set by Stop, Exit, or closing the popup. The add loop checks it before every torrent, so
    // nothing more is sent to the client once you have asked it to stop.
    const cancelRef = React.useRef(false)
    React.useEffect(() => () => {
        cancelRef.current = true
    }, [])

    // Why the last run stopped early, when it did. The torrents it did not get to stay in the list.
    const [stopReason, setStopReason] = React.useState<string | null>(null)

    async function clientIsOffline(): Promise<boolean> {
        try {
            const view = await seaFetch<TorrentAddQueueView>("/api/v1/torrent-client/add-queue", "GET")
            return (view?.total ?? 0) > 0
        }
        catch {
            return true
        }
    }

    async function handleConfirm() {
        if (!toDownload.length) {
            finishBatch()
            return
        }

        // One torrent at a time, with a pause between them, and a look at the client before each.
        //
        // Sending a batch of large season packs back to back hung qBittorrent outright: it was
        // still fetching metadata and creating files for the first few when the rest arrived, its
        // web API stopped answering, and every later add sat on a 60-second timeout. So the run
        // stops the moment the client looks unwell — offline, or slow to take a torrent — and
        // leaves what it did not add in the list for when it is back.
        cancelRef.current = false
        setStopReason(null)
        const queue = [...toDownload]
        setDownloading({ done: 0, total: queue.length })
        let ok = 0
        let failed = 0
        let stopped: string | null = null

        for (let i = 0; i < queue.length; i++) {
            const pick = queue[i]
            if (cancelRef.current) {
                stopped = "Stopped."
                break
            }
            if (i > 0) {
                await sleep(AUTO_TORRENT_ADD_GAP_MS)
                if (cancelRef.current) {
                    stopped = "Stopped."
                    break
                }
                if (await clientIsOffline()) {
                    stopped = "The torrent client is offline or not answering, so the rest were not sent. Try again once it is back."
                    break
                }
            }

            const media = pick.media
            const romaji = media?.title?.romaji || pick.title || ""
            const destination = pick.existingDir
                || (libraryPath ? upath.join(libraryPath, sanitizeDirectoryName(romaji)) : "")
            if (!media || !destination) {
                failed++
            } else {
                const startedAt = Date.now()
                try {
                    await download({
                        torrents: [pick.torrent!],
                        destination,
                        smartSelect: { enabled: false, missingEpisodeNumbers: [] },
                        media,
                        autoMatch: isAutoMatch(pick.mediaId),
                        matchSeasonOneOnly: isAutoMatch(pick.mediaId) && matchSeasonOne,
                    })
                    addDownloadingAnime(pick.mediaId)
                    setAdded(prev => new Set(prev).add(pick.mediaId))
                    ok++
                }
                catch (e: any) {
                    // Already in the client is as good as added.
                    if (e?.response?.status === 409) {
                        setAdded(prev => new Set(prev).add(pick.mediaId))
                    } else {
                        failed++
                    }
                }
                if (Date.now() - startedAt > AUTO_TORRENT_SLOW_ADD_MS) {
                    stopped = "The torrent client took too long to accept a torrent, so the rest were not sent. Give it a moment, then try again."
                    setDownloading(d => d ? { ...d, done: d.done + 1 } : d)
                    break
                }
            }
            setDownloading(d => d ? { ...d, done: d.done + 1 } : d)
        }

        setDownloading(null)
        if (ok) toast.success(`Queued ${ok} download${ok === 1 ? "" : "s"}`)
        if (failed) toast.error(`${failed} download${failed === 1 ? "" : "s"} could not be added`)

        if (stopped) {
            // Stay on this batch: whatever was not added is still here to retry or strike out.
            setStopReason(stopped)
            return
        }
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
                    </span>
                )}
            </div>

            {!!stopReason && !downloading && (
                <div
                    className="rounded-[--radius-md] border border-orange-500/40 bg-orange-950/40 px-3 py-2 text-sm text-orange-200"
                    data-enqueue-future-auto-torrent-stopped
                >
                    {stopReason}
                    {added.size ? ` ${added.size} already added in this batch.` : ""}
                </div>
            )}

            {!!downloading && (
                <p className="text-xs text-[--muted]">
                    Adding one at a time, {AUTO_TORRENT_ADD_GAP_MS / 1000}s apart, so the torrent client keeps up.
                </p>
            )}

            {isPicking ? (
                <div className="py-12 text-center space-y-3">
                    <LoadingSpinner />
                    <p className="text-sm text-[--muted]">Searching SeaDex for {batchIds.length} anime… this can take a minute.</p>
                </div>
            ) : error ? (
                <div className="py-10 text-center space-y-3">
                    <p className="text-sm text-red-300">{error}</p>
                    <Button intent="gray-outline" onClick={() => void loadNextBatch(remaining)}>Try again</Button>
                </div>
            ) : (
                <div className="max-h-[60vh] overflow-y-auto space-y-1 pr-1" data-enqueue-future-auto-torrent-list>
                    {withTorrent.map(pick => {
                        if (removed.has(pick.mediaId) || added.has(pick.mediaId)) return null
                        return (
                            <div
                                key={pick.mediaId}
                                className="flex items-start gap-3 rounded-[--radius-md] border bg-gray-950 px-3 py-2"
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
                                </div>
                                <div className="flex-none pt-0.5" title="Match this one into your library automatically when it finishes">
                                    <Switch
                                        size="sm"
                                        label="Auto-match"
                                        value={isAutoMatch(pick.mediaId)}
                                        onValueChange={v => setAutoMatchFor(pick.mediaId, v)}
                                        disabled={!!downloading}
                                        data-enqueue-future-auto-torrent-row-auto-match
                                    />
                                </div>
                                <IconButton
                                    size="sm"
                                    intent="gray-basic"
                                    icon={<LuX />}
                                    aria-label="Remove from this batch"
                                    onClick={() => remove(pick.mediaId)}
                                    disabled={!!downloading}
                                    data-enqueue-future-auto-torrent-remove
                                />
                            </div>
                        )
                    })}

                    {!toDownload.length && !!withTorrent.length && (
                        <p className="py-4 text-center text-sm text-[--muted]">
                            {added.size ? "Everything left in this batch has been added." : "Everything in this batch was removed."}
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
                        disabled={!!downloading}
                        onClick={() => setAutoMatchOff(new Set())}
                        data-enqueue-future-auto-torrent-auto-match-all-on
                    >
                        All on
                    </Button>
                    <Button
                        size="xs"
                        intent="gray-subtle"
                        disabled={!!downloading}
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
                    disabled={!!downloading}
                />
            </div>

            <div className="flex flex-wrap justify-end gap-2">
                {downloading ? (
                    <Button
                        intent="alert-subtle"
                        onClick={() => {
                            cancelRef.current = true
                        }}
                        data-enqueue-future-auto-torrent-stop
                    >
                        Stop
                    </Button>
                ) : (
                    <Button
                        intent="gray-outline"
                        onClick={onExit}
                        data-enqueue-future-auto-torrent-exit
                    >
                        Exit
                    </Button>
                )}
                <Button
                    intent="white"
                    onClick={() => void handleConfirm()}
                    loading={!!downloading}
                    disabled={isPicking || !!error}
                    data-enqueue-future-auto-torrent-confirm
                >
                    {downloading
                        ? `Adding ${downloading.done}/${downloading.total}…`
                        : toDownload.length
                            ? `Download ${toDownload.length}${remaining.length > batchIds.length ? " & next batch" : ""}`
                            : remaining.length > batchIds.length ? "Next batch" : "Finish"}
                </Button>
            </div>
        </div>
    )
}
