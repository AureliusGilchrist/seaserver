"use client"

import {
    useGetUnmatchedSweepStatus,
    useGetUnmatchedTorrents,
    useStopUnmatchedSweep,
    useSweepUnmatchedTorrents,
    useGetUnmatchedMatchQueue,
    useRemoveUnmatchedMatchQueueItem,
    useClearUnmatchedMatchQueue,
    usePauseUnmatchedMatchQueue,
    useResumeUnmatchedMatchQueue,
    useRetryUnmatchedMatchQueueItem,
    useResolveUnmatchedMatchQueueItem,
    UnmatchedTorrent,
    UnmatchedMatchQueueItem,
    MatchConflict,
    CountMismatch,
} from "@/api/hooks/unmatched.hooks"
import { useGetLibraryCollection } from "@/api/hooks/anime_collection.hooks"
import { UnmatchedTorrentCard } from "@/app/(main)/unmatched/_components/unmatched-torrent-card"
import { UnmatchedMatchModal } from "@/app/(main)/unmatched/_components/unmatched-match-modal"
import { UnmatchedUndoModal } from "@/app/(main)/unmatched/_components/unmatched-undo-modal"
import { UnmatchedDiagnosticsModal } from "@/app/(main)/unmatched/_components/unmatched-diagnostics-modal"
import { UnmatchedConflictModal } from "@/app/(main)/unmatched/_components/unmatched-conflict-modal"
import { UnmatchedCountMismatchModal } from "@/app/(main)/unmatched/_components/unmatched-count-mismatch-modal"
import { AppLayoutStack } from "@/components/ui/app-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConfirmationDialog, useConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { atom, useAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import React from "react"
import {
    LuFolderSearch,
    LuEye,
    LuEyeOff,
    LuUndo2,
    LuStethoscope,
    LuWandSparkles,
    LuCircleStop,
    LuListTodo,
    LuPause,
    LuPlay,
    LuRotateCw,
    LuTrash2,
    LuX,
} from "react-icons/lu"

export const selectedUnmatchedTorrentAtom = atom<UnmatchedTorrent | null>(null)

/** Which tab the page was last on — kept across a reload, since the queue is worked from here. */
export const unmatchedPageTabAtom = atomWithStorage<"downloads" | "queue">(
    "sea-unmatched-tab",
    "downloads",
    undefined,
    { getOnInit: true },
)

/**
 * The Unmatched Downloads screen.
 *
 * Two things live here now, and they are different kinds of thing:
 *
 *   - The downloads list, which is a list of work to be decided on.
 *   - The match queue, which is a list of decisions being carried out by the server.
 *
 * Deciding on a match — picking the files, picking the anime, confirming — writes it into the
 * server's queue and returns. Nothing is moved by this screen, so the next download can be opened
 * the moment the last one is confirmed; the queue works through them in order, in the background,
 * and says what it is doing. See internal/handlers/unmatched_match_queue.go.
 */
export function UnmatchedTorrentsPage() {
    const { data: torrents, isLoading, refetch, error, isError, isFetching } = useGetUnmatchedTorrents({
        // Answering this means walking every file of every download in the staging area, over the
        // network. The server caches that for ten seconds, so a five-second poll spent every other
        // request forcing a fresh walk — and after a match, when the cache has just been dropped and
        // the disk is busiest, that is the worst possible moment to be asking again.
        //
        // Fifteen seconds sits outside the server's cache window, so a poll either finds a fresh
        // answer waiting or asks for one that is genuinely due. A new download still appears without
        // touching anything, which is what the frequent polling was for; matching a download
        // refreshes this list directly and does not wait for a poll at all.
        refetchInterval: 15_000,
        staleTime: 10_000,
        refetchOnWindowFocus: true,
    })
    const { data: libraryCollection } = useGetLibraryCollection({ staleTime: 30_000 })
    const { data: queue } = useGetUnmatchedMatchQueue()
    const [selectedTorrent, setSelectedTorrent] = useAtom(selectedUnmatchedTorrentAtom)
    const [tab, setTab] = useAtom(unmatchedPageTabAtom)
    const [search, setSearch] = React.useState("")
    const [hideMatched, setHideMatched] = React.useState(true)
    const [undoOpen, setUndoOpen] = React.useState(false)
    const [diagnosticsOpen, setDiagnosticsOpen] = React.useState(false)

    const { data: sweep } = useGetUnmatchedSweepStatus()
    const { mutate: startSweep, isPending: isStartingSweep } = useSweepUnmatchedTorrents()
    const { mutate: stopSweep } = useStopUnmatchedSweep()
    const sweepRunning = !!sweep?.running

    // A finished sweep leaves matched downloads behind in the cached list until it is refetched.
    const sweepWasRunning = React.useRef(false)
    React.useEffect(() => {
        if (sweepWasRunning.current && !sweepRunning) {
            refetch()
        }
        sweepWasRunning.current = sweepRunning
    }, [sweepRunning, refetch])

    const torrentsList = torrents ?? []
    const initialLoading = isLoading && torrentsList.length === 0
    const isRefreshing = isFetching && !isLoading

    // Build a set of mediaIds already present in the library
    const libraryMediaIds = React.useMemo(() => {
        const ids = new Set<number>()
        for (const list of libraryCollection?.lists ?? []) {
            for (const entry of list.entries ?? []) {
                ids.add(entry.mediaId)
            }
        }
        return ids
    }, [libraryCollection])

    const filteredTorrents = React.useMemo(() => {
        let list = torrentsList
        if (hideMatched) {
            list = list.filter(t => !t.animeId || !libraryMediaIds.has(t.animeId))
        }
        const q = search.trim().toLowerCase()
        if (!q) return list
        return list.filter(t => t.name.toLowerCase().includes(q))
    }, [torrentsList, search, hideMatched, libraryMediaIds])

    // How many of the listed downloads the sweep would actually take on: it matches from the anime
    // recorded when the download was queued, so one without a recorded anime still needs the modal.
    const sweepableCount = React.useMemo(
        () => torrentsList.filter(t => !!t.animeId).length,
        [torrentsList],
    )

    // ─── The match queue ─────────────────────────────────────────────
    //
    // Read-only from here: the server owns the queue and works through it on its own. What this
    // screen does with it is show it, and answer the questions it stops on.

    const queueItems = queue?.items ?? []
    const queueStatus = queue?.status
    const queueEmpty = queueItems.length === 0

    // Downloads with a match waiting in the queue, so the list can say so on the card itself.
    const queuedTorrentNames = React.useMemo(
        () => new Set(queueItems.map(i => i.torrentName)),
        [queueItems],
    )

    const { mutate: removeQueueItem } = useRemoveUnmatchedMatchQueueItem()
    const { mutate: retryQueueItem, isPending: isRetrying } = useRetryUnmatchedMatchQueueItem()
    const { mutate: resolveQueueItem, isPending: isResolving } = useResolveUnmatchedMatchQueueItem()
    const { mutate: pauseQueue } = usePauseUnmatchedMatchQueue()
    const { mutate: resumeQueue } = useResumeUnmatchedMatchQueue()
    const { mutate: clearQueue } = useClearUnmatchedMatchQueue()

    const clearQueueConfirmation = useConfirmationDialog({
        title: "Clear the match queue",
        description: "Removes every queued match without carrying it out. Downloads already matched stay matched; nothing on disk is touched.",
        onConfirm: () => clearQueue({}),
    })

    // The question a queued match stopped on, and the item it belongs to. Opened from the queue.
    const [answering, setAnswering] = React.useState<UnmatchedMatchQueueItem | null>(null)

    if (initialLoading) {
        return (
            <PageWrapper className="p-4 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                    <LuFolderSearch className="text-3xl text-brand-200" />
                    <h2 className="text-2xl font-bold">Unmatched Downloads</h2>
                </div>
                <div className="flex justify-center py-10">
                    <LoadingSpinner />
                </div>
            </PageWrapper>
        )
    }

    const handleRetry = () => {
        refetch()
    }

    const hasTorrents = torrentsList.length > 0

    // Whether the queue is doing anything worth showing a strip about on the downloads tab.
    const queueActive = !!queueStatus && (queueStatus.total > 0 || queueStatus.matching > 0)

    return (
        <PageWrapper className="p-4 sm:p-8 space-y-4">
            <div className="flex items-center gap-3">
                <LuFolderSearch className="text-3xl text-brand-200" />
                <h2 className="text-2xl font-bold">Unmatched Downloads</h2>
                <LoadingSpinner className={`h-4 w-4 transition-opacity duration-200 ${isRefreshing ? "opacity-100" : "opacity-0"}`} />
                <div className="flex-1" />
                {/* Matching from the anime each download already carries, instead of one modal at a time. */}
                {sweepRunning ? (
                    <Button intent="alert-subtle" size="sm" leftIcon={<LuCircleStop />} onClick={() => stopSweep({})} disabled={sweep?.stopping}>
                        {sweep?.stopping ? "Stopping…" : "Stop"}
                    </Button>
                ) : (
                    <Button
                        intent="primary-subtle"
                        size="sm"
                        leftIcon={<LuWandSparkles />}
                        loading={isStartingSweep}
                        disabled={sweepableCount === 0}
                        onClick={() => startSweep({})}
                    >
                        Match all{sweepableCount > 0 ? ` (${sweepableCount})` : ""}
                    </Button>
                )}
                {/* For "my download isn't here" — the screen can't say why on its own. */}
                <Button intent="gray-outline" size="sm" leftIcon={<LuStethoscope />} onClick={() => setDiagnosticsOpen(true)}>
                    Diagnose
                </Button>
                {/* Matching renames files and moves them out of this folder. This is the way back. */}
                <Button intent="gray-outline" size="sm" leftIcon={<LuUndo2 />} onClick={() => setUndoOpen(true)}>
                    Undo matches
                </Button>
            </div>

            {/* Shown while a sweep runs, and left up afterwards so the outcome can be read. */}
            {(sweepRunning || (sweep?.finishedAt && sweep.processed > 0)) && (
                <div className="border rounded-md p-4 bg-gray-900/60 space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                        {sweepRunning && <LoadingSpinner className="h-4 w-4" />}
                        <p className="font-semibold">
                            {sweepRunning
                                ? `Matching ${sweep!.processed + 1} of ${sweep!.total}`
                                : `Matched ${sweep!.matched} of ${sweep!.total}`}
                        </p>
                        <span className="text-sm text-[--muted]">
                            {sweep!.matched} matched
                            {sweep!.failed > 0 ? ` · ${sweep!.failed} failed` : ""}
                            {sweep!.skipped > 0 ? ` · ${sweep!.skipped} skipped` : ""}
                            {sweep!.conflicts > 0 ? ` · ${sweep!.conflicts} already in library` : ""}
                        </span>
                    </div>

                    {sweep!.total > 0 && (
                        <div className="h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
                            <div
                                className="h-full bg-brand-500 transition-[width] duration-300"
                                style={{ width: `${Math.min(100, Math.round((sweep!.processed / sweep!.total) * 100))}%` }}
                            />
                        </div>
                    )}

                    {sweepRunning && !!sweep!.current && (
                        <p className="text-xs text-[--muted] truncate" title={sweep!.current}>{sweep!.current}</p>
                    )}

                    {sweep!.skipped > 0 && !sweepRunning && (
                        <p className="text-xs text-[--muted]">
                            Skipped downloads are ones with no anime recorded, or still in progress — match those from the list below.
                        </p>
                    )}

                    {sweep!.conflicts > 0 && !sweepRunning && (
                        <p className="text-xs text-amber-200/90">
                            {sweep!.conflicts} download{sweep!.conflicts === 1 ? "" : "s"} already had{" "}
                            {sweep!.conflicts === 1 ? "its" : "their"} episodes in the library, so nothing was overwritten.
                            Match {sweep!.conflicts === 1 ? "it" : "them"} from the list below to choose which copy to keep.
                        </p>
                    )}

                    {sweep!.errors?.length > 0 && (
                        <details className="text-xs text-amber-200/90">
                            <summary className="cursor-pointer">{sweep!.errors.length} couldn't be matched</summary>
                            <ul className="mt-2 space-y-1">
                                {sweep!.errors.map((e, i) => <li key={i} className="break-all">{e}</li>)}
                            </ul>
                        </details>
                    )}
                </div>
            )}

            <Tabs
                value={tab}
                onValueChange={(value) => setTab(value as "downloads" | "queue")}
                triggerClass={"text-base px-6 h-auto py-2 rounded-[--radius-md] w-fit border-none data-[state=active]:bg-[--subtle] data-[state=active]:text-white dark:hover:text-white"}
                listClass={"w-full flex flex-wrap md:flex-nowrap h-fit"}
            >
                <TabsList className="flex-wrap max-w-full bg-[--paper] p-2 border rounded-xl">
                    <TabsTrigger value="downloads">
                        Downloads
                        {hasTorrents && (
                            <Badge className="ml-2 font-bold" intent="gray" size="sm">
                                {torrentsList.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="queue">
                        To Match
                        {queueItems.length > 0 && (
                            <Badge className="ml-2 font-bold" intent="alert" size="sm">
                                {queueItems.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="downloads" className="space-y-4">
                    <p className="text-[--muted]">
                        Downloaded torrents that haven't been matched to an anime yet. Select a torrent to choose episodes and match them to an anime.
                    </p>

                    {/* The queue doing its work, said on the tab where the deciding happens — so it
                        is clear the last match is still being carried out while the next download
                        is being dealt with. */}
                    {queueActive && (
                        <div className="flex items-center gap-3 flex-wrap border rounded-md px-4 py-2.5 bg-gray-900/50">
                            {queueStatus!.matching || (queueStatus!.holding && !queueStatus!.paused)
                                ? <LoadingSpinner className="h-4 w-4 flex-shrink-0" />
                                : <LuListTodo className="h-4 w-4 flex-shrink-0 text-brand-200" />}
                            <p className="text-sm">
                                {queueStatus!.matching && queueStatus!.current
                                    ? <>Matching <span className="font-medium text-gray-200">{queueStatus!.current.animeTitle || queueStatus!.current.torrentName}</span> now</>
                                    : queueStatus!.paused
                                        ? "Match queue paused"
                                        : queueStatus!.holding
                                            ? queueStatus!.holdReason || "Match queue waiting"
                                            : `${queueStatus!.pending} match${queueStatus!.pending === 1 ? "" : "es"} waiting in the queue`}
                            </p>
                            <span className="text-xs text-[--muted]">
                                {queueStatus!.total} queued
                                {queueStatus!.needsDecision > 0 ? ` · ${queueStatus!.needsDecision} needs a decision` : ""}
                                {queueStatus!.matched > 0 ? ` · ${queueStatus!.matched} matched this session` : ""}
                            </span>
                            <div className="flex-1" />
                            <Button intent="gray-outline" size="sm" onClick={() => setTab("queue")}>
                                View queue
                            </Button>
                        </div>
                    )}

                    {hasTorrents && (
                        <div className="flex items-center gap-3 flex-wrap">
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search downloaded torrents..."
                                className="w-full max-w-sm rounded-lg bg-gray-900/70 border border-gray-800 px-3 py-2 text-sm text-white focus:border-brand-400 focus:outline-none"
                            />
                            <button
                                onClick={() => setHideMatched(p => !p)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                                    hideMatched
                                        ? "bg-brand-700/30 border-brand-600 text-brand-200 hover:bg-brand-700/50"
                                        : "bg-gray-900/70 border-gray-700 text-[--muted] hover:border-gray-500"
                                }`}
                                title={hideMatched ? "Showing: unmatched only" : "Showing: all torrents"}
                            >
                                {hideMatched ? <LuEyeOff className="w-3.5 h-3.5" /> : <LuEye className="w-3.5 h-3.5" />}
                                {hideMatched ? "Hide matched" : "Show all"}
                            </button>
                        </div>
                    )}

                    {isError && (
                        <div className="flex flex-col gap-3 border rounded-md p-4 bg-amber-950/40 text-amber-100">
                            <p className="font-semibold">Failed to load unmatched downloads.</p>
                            <p className="text-sm opacity-80">{String((error as Error)?.message || "Unknown error")}</p>
                            <div>
                                <Button intent="primary" size="sm" onClick={handleRetry}>Retry</Button>
                            </div>
                        </div>
                    )}

                    {!isError && !hasTorrents ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <LuFolderSearch className="text-6xl text-[--muted] mb-4" />
                            <p className="text-lg text-[--muted]">No unmatched downloads</p>
                            <p className="text-sm text-[--muted]">
                                Downloaded torrents will appear here for manual matching
                            </p>
                        </div>
                    ) : (!isError && hasTorrents ? (
                        <AppLayoutStack>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredTorrents.map((torrent) => (
                                    <UnmatchedTorrentCard
                                        key={torrent.path}
                                        torrent={torrent}
                                        matchQueued={queuedTorrentNames.has(torrent.name)}
                                        onSelect={() => setSelectedTorrent(torrent)}
                                    />
                                ))}
                                {filteredTorrents.length === 0 && (
                                    <p className="text-[--muted] text-sm col-span-full py-4">No torrents match your search.</p>
                                )}
                            </div>
                        </AppLayoutStack>
                    ) : null)}
                </TabsContent>

                <TabsContent value="queue" className="space-y-4">
                    {queueEmpty ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <LuListTodo className="text-6xl text-[--muted] mb-4" />
                            <p className="text-lg text-[--muted]">Nothing queued to match</p>
                            <p className="text-sm text-[--muted] max-w-md">
                                Matching a download from the list puts it here, and the server carries it out in the
                                order you decided on things — so the next download can be dealt with straight away.
                            </p>
                            <Button intent="gray-outline" size="sm" className="mt-4" onClick={() => setTab("downloads")}>
                                Browse downloads
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-3 flex-wrap">
                                {queueStatus?.paused ? (
                                    <Button intent="primary" leftIcon={<LuPlay />} onClick={() => resumeQueue({})}>
                                        Resume matching
                                    </Button>
                                ) : (
                                    <Button intent="gray-outline" leftIcon={<LuPause />} onClick={() => pauseQueue({})}>
                                        Pause
                                    </Button>
                                )}
                                <span className="text-sm text-[--muted]">
                                    {queueStatus?.matching && queueStatus.current
                                        ? `Matching ${queueStatus.current.animeTitle || queueStatus.current.torrentName} now`
                                        : `${queueStatus?.pending ?? 0} waiting`}
                                    {queueStatus?.needsDecision ? ` · ${queueStatus.needsDecision} needs a decision` : ""}
                                    {queueStatus?.matched ? ` · ${queueStatus.matched} matched this session` : ""}
                                </span>
                                <div className="flex-1" />
                                <Button
                                    intent="gray-outline"
                                    size="sm"
                                    leftIcon={<LuTrash2 />}
                                    onClick={clearQueueConfirmation.open}
                                >
                                    Clear queue
                                </Button>
                            </div>

                            {/* The queue waiting on something by itself. Said once, at the top,
                                rather than on every item it is holding back. */}
                            {queueStatus?.holding && (
                                <div className="flex items-center gap-3 border rounded-md px-4 py-3 bg-amber-950/30 text-amber-100">
                                    <LoadingSpinner className="h-4 w-4 flex-shrink-0" />
                                    <p className="text-sm">{queueStatus.holdReason || "The queue is waiting"}</p>
                                </div>
                            )}

                            <div className="space-y-3">
                                {queueItems.map((item) => (
                                    <QueueItemRow
                                        key={item.id}
                                        item={item}
                                        onRemove={() => removeQueueItem({ id: item.id })}
                                        onRetry={() => retryQueueItem({ id: item.id })}
                                        onAnswer={() => setAnswering(item)}
                                        isBusy={isRetrying || isResolving}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </TabsContent>
            </Tabs>

            <UnmatchedMatchModal
                torrent={selectedTorrent}
                onClose={() => setSelectedTorrent(null)}
                onSuccess={() => {
                    setSelectedTorrent(null)
                    refetch()
                    // NOTE: no library scan here on purpose. The server already injects the moved
                    // files into the library DB as hydrated, locked local files, so a scan adds
                    // nothing — and a full enhanced scan after *every* match is what made matching
                    // get slower and slower the longer a matching session ran.
                }}
            />

            <UnmatchedDiagnosticsModal open={diagnosticsOpen} onClose={() => setDiagnosticsOpen(false)} />

            <UnmatchedUndoModal
                open={undoOpen}
                onClose={() => {
                    setUndoOpen(false)
                    // A revert puts files back in the staging folder, so the list behind the modal
                    // is out of date the moment one runs.
                    refetch()
                }}
            />

            {/* The questions the queue stopped on. The same dialogs a match used to raise, now
                answered against the queued item rather than mid-match — the answer is recorded on
                the stored request and the match goes back in line. */}
            {!!answering?.countMismatch && (
                <UnmatchedCountMismatchModal
                    mismatch={answering.countMismatch}
                    torrentName={answering.torrentName}
                    animeTitle={answering.animeTitle || answering.torrentName}
                    isMatching={isResolving}
                    onConfirm={() => {
                        resolveQueueItem({ id: answering.id, confirmCountMismatch: true })
                        setAnswering(null)
                    }}
                    onCancel={() => setAnswering(null)}
                />
            )}

            {!!answering?.conflict && (
                <UnmatchedConflictModal
                    conflict={answering.conflict}
                    torrentName={answering.torrentName}
                    animeTitle={answering.animeTitle || answering.torrentName}
                    isReplacing={isResolving}
                    onAccept={() => {
                        resolveQueueItem({ id: answering.id, overwriteExisting: true, confirmCountMismatch: true })
                        setAnswering(null)
                    }}
                    onDecline={() => setAnswering(null)}
                    onCancel={() => setAnswering(null)}
                />
            )}

            <ConfirmationDialog {...clearQueueConfirmation} />
        </PageWrapper>
    )
}

/**
 * One row of the match queue.
 *
 * The status is the whole point of the row: whether the match is waiting its turn, running now,
 * waiting to be tried again after a failure, or stopped on a question. An item that failed is not a
 * dead end — it is retried on its own, for as long as it takes — so the row says when it will be
 * tried again rather than presenting it as something to fix.
 */
function QueueItemRow({
    item,
    onRemove,
    onRetry,
    onAnswer,
    isBusy,
}: {
    item: UnmatchedMatchQueueItem
    onRemove: () => void
    onRetry: () => void
    onAnswer: () => void
    isBusy: boolean
}) {
    const failed = item.status === "pending" && item.attempts > 0 && !!item.errorMessage
    const needsDecision = item.status === "needs_decision"

    return (
        <div className="p-4 border rounded-lg bg-gray-950/50 flex items-start gap-3">
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm line-clamp-1">
                    {item.animeTitle || item.torrentName}
                </p>
                <p className="text-xs text-[--muted] line-clamp-1 mt-0.5" title={item.torrentName}>
                    {item.torrentName}
                </p>

                <div className="flex flex-wrap gap-2 mt-2">
                    {item.status === "matching" && (
                        <Badge intent="primary-solid" size="sm">
                            <LoadingSpinner className="mr-1 h-3 w-3" />
                            Matching now
                        </Badge>
                    )}
                    {item.status === "pending" && !failed && (
                        <Badge intent="blue" size="sm">
                            <LuListTodo className="mr-1" />
                            Waiting
                        </Badge>
                    )}
                    {failed && (
                        <Badge intent="warning" size="sm">
                            <LuRotateCw className="mr-1" />
                            Retrying
                        </Badge>
                    )}
                    {needsDecision && (
                        <Badge intent="warning" size="sm">
                            Needs your decision
                        </Badge>
                    )}
                    <Badge intent="gray" size="sm">
                        {item.fileCount} file{item.fileCount === 1 ? "" : "s"}
                    </Badge>
                </div>

                {/* Why it failed, and when it comes back round. Nothing here is a dead end. */}
                {failed && (
                    <p className="text-xs text-amber-200/90 mt-2">
                        {item.errorMessage}
                        {item.nextAttemptAt && (
                            <> · trying again {formatNextAttempt(item.nextAttemptAt)}</>
                        )}
                    </p>
                )}

                {needsDecision && !!item.errorMessage && (
                    <p className="text-xs text-amber-200/90 mt-2">{item.errorMessage}</p>
                )}

                {needsDecision && !item.errorMessage && (
                    <p className="text-xs text-[--muted] mt-2">
                        {item.conflict
                            ? `${item.conflict.files.length} of ${item.conflict.totalPlanned} episode${item.conflict.totalPlanned === 1 ? "" : "s"} are already in the library.`
                            : item.countMismatch
                                ? `This download has ${item.countMismatch.found} episode${item.countMismatch.found === 1 ? "" : "s"} but ${item.countMismatch.expected} were expected.`
                                : ""}
                    </p>
                )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
                {needsDecision && (item.conflict || item.countMismatch) && (
                    <Button size="sm" intent="primary" onClick={onAnswer} disabled={isBusy}>
                        Answer
                    </Button>
                )}
                {item.status === "pending" && (
                    <Button
                        size="sm"
                        intent="gray-outline"
                        leftIcon={<LuRotateCw />}
                        onClick={onRetry}
                        disabled={isBusy || !failed}
                        title={failed ? "Try this match again now" : "Waiting its turn"}
                    >
                        Try again
                    </Button>
                )}
                <Button
                    size="sm"
                    intent="gray-outline"
                    leftIcon={<LuX />}
                    onClick={onRemove}
                    title="Take this match out of the queue"
                >
                    Remove
                </Button>
            </div>
        </div>
    )
}

/** "in 2 minutes" / "in 45 seconds" — the retry backoff, said the way a person would. */
function formatNextAttempt(next: string): string {
    const at = new Date(next).getTime()
    if (!Number.isFinite(at)) return "shortly"
    const seconds = Math.max(0, Math.round((at - Date.now()) / 1000))
    if (seconds < 60) return `in ${seconds}s`
    const minutes = Math.round(seconds / 60)
    if (minutes < 60) return `in ${minutes}m`
    return `in ${Math.round(minutes / 60)}h`
}
