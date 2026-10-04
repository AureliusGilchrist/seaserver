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
    UnmatchedMatchQueueStatus,
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
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConfirmationDialog, useConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { SeaImage } from "@/components/shared/sea-image"
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
    LuTriangleAlert,
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
        // Searched across every name a download goes by, not just the folder name. A release is
        // named after whichever title the group used — often the romaji, sometimes the native one,
        // occasionally neither — so typing the name you know has to find it however the folder is
        // spelled. Substring and case-insensitive: nobody types a title in full, and nobody types
        // it with the capitals AniList happens to use.
        return list.filter(t => {
            const haystack = [
                t.name,
                t.animeTitleRomaji,
                t.animeTitleNative,
            ]
            return haystack.some(value => value?.toLowerCase().includes(q))
        })
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
                triggerClass={"h-auto py-2 px-4 rounded-lg w-fit border-none text-sm gap-2 data-[state=active]:bg-[--subtle] data-[state=active]:text-white dark:hover:text-white"}
                listClass={"w-fit h-fit"}
            >
                <TabsList className="flex-wrap max-w-full bg-[--paper] p-1 border rounded-xl gap-1">
                    <TabsTrigger value="downloads">
                        <LuFolderSearch className="text-base" />
                        Downloads
                        {hasTorrents && (
                            <span className="ml-1 text-xs text-[--muted] tabular-nums">{torrentsList.length}</span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="queue">
                        <LuListTodo className="text-base" />
                        To Match
                        {queueItems.length > 0 && (
                            <Badge className="ml-1 font-bold" intent="alert" size="sm">
                                {queueItems.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="downloads" className="space-y-4 pt-4">
                    <p className="text-[--muted]">
                        Downloaded torrents that haven't been matched to an anime yet. Select a torrent to choose episodes and match them to an anime.
                    </p>

                    {/* The queue doing its work, said on the tab where the deciding happens — so it
                        is clear the last match is still being carried out while the next download
                        is being dealt with. */}
                    {queueActive && (
                        <div className="flex items-center gap-3 flex-wrap border border-gray-800 rounded-xl px-4 py-2.5 bg-gray-900/40">
                            {queueStatus!.matching || (queueStatus!.holding && !queueStatus!.paused)
                                ? <LoadingSpinner className="h-4 w-4 flex-shrink-0 text-brand-300" />
                                : <LuListTodo className="h-4 w-4 flex-shrink-0 text-brand-300" />}
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
                                {queueStatus!.needsDecision > 0 ? `${queueStatus!.needsDecision} needs a decision · ` : ""}
                                {queueStatus!.matched > 0 ? `${queueStatus!.matched} matched this session` : ""}
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
                            <div className="w-16 h-16 rounded-2xl bg-gray-900/70 border border-gray-800 flex items-center justify-center mb-5">
                                <LuListTodo className="text-3xl text-brand-300" />
                            </div>
                            <p className="text-lg font-medium">Nothing queued to match</p>
                            <p className="text-sm text-[--muted] max-w-md mt-1">
                                Matching a download from the list puts it here, and the server carries it out in the
                                order you decided on things — so the next download can be dealt with straight away.
                            </p>
                            <Button intent="gray-outline" size="sm" className="mt-5" onClick={() => setTab("downloads")}>
                                Browse downloads
                            </Button>
                        </div>
                    ) : (
                        <>
                            <QueueHeader
                                status={queueStatus}
                                onPause={() => pauseQueue({})}
                                onResume={() => resumeQueue({})}
                                onClear={clearQueueConfirmation.open}
                            />

                            <div className="space-y-2.5">
                                {queueItems.map((item, index) => (
                                    <QueueItemRow
                                        key={item.id}
                                        item={item}
                                        position={index + 1}
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
 * The queue's header: what it is doing, how much of it there is, and the two things you can do to
 * it as a whole. One line of state — paused, waiting on AniList, matching something, or simply
 * working through what is left — because that is the question the screen is here to answer.
 */
function QueueHeader({
    status,
    onPause,
    onResume,
    onClear,
}: {
    status?: UnmatchedMatchQueueStatus
    onPause: () => void
    onResume: () => void
    onClear: () => void
}) {
    const paused = !!status?.paused
    const holding = !!status?.holding
    const matching = !!status?.matching && !!status?.current

    const state = paused
        ? { label: "Paused", detail: "The queue keeps its place and picks up where it left off.", tone: "muted" as const }
        : holding
            ? { label: "Waiting", detail: status?.holdReason || "The queue is waiting on something.", tone: "waiting" as const }
            : matching
                ? { label: "Matching now", detail: status?.current?.animeTitle || status?.current?.torrentName || "", tone: "active" as const }
                : { label: "Working through the queue", detail: "Matches run in the order you decided on them.", tone: "idle" as const }

    return (
        <div className="border border-gray-800 rounded-xl bg-gray-900/40 overflow-hidden">
            <div className="flex items-center gap-3 flex-wrap px-4 py-3">
                {/* The one live indicator on the page: what the queue is doing this second. */}
                <div className="flex items-center gap-2.5 min-w-0">
                    {matching || holding ? (
                        <LoadingSpinner className="h-4 w-4 flex-shrink-0 text-brand-300" />
                    ) : paused ? (
                        <LuPause className="h-4 w-4 flex-shrink-0 text-[--muted]" />
                    ) : (
                        <LuListTodo className="h-4 w-4 flex-shrink-0 text-brand-300" />
                    )}
                    <div className="min-w-0">
                        <p className="text-sm font-medium leading-tight">{state.label}</p>
                        <p className="text-xs text-[--muted] leading-tight truncate max-w-[28rem]" title={state.detail}>
                            {state.detail}
                        </p>
                    </div>
                </div>

                <div className="flex-1" />

                {/* The numbers, as numbers — waiting is the one that matters. */}
                <div className="flex items-center gap-4">
                    <QueueStat label="Waiting" value={status?.pending ?? 0} />
                    {!!status?.needsDecision && <QueueStat label="Needs you" value={status.needsDecision} tone="warning" />}
                    {!!status?.matched && <QueueStat label="Matched" value={status.matched} tone="success" />}
                </div>

                <div className="flex items-center gap-2">
                    {paused ? (
                        <Button size="sm" intent="primary" leftIcon={<LuPlay />} onClick={onResume}>
                            Resume
                        </Button>
                    ) : (
                        <Button size="sm" intent="gray-outline" leftIcon={<LuPause />} onClick={onPause}>
                            Pause
                        </Button>
                    )}
                    <Button size="sm" intent="gray-outline" leftIcon={<LuTrash2 />} onClick={onClear}>
                        Clear
                    </Button>
                </div>
            </div>
        </div>
    )
}

function QueueStat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warning" | "success" }) {
    return (
        <div className="text-right">
            <p className={cn(
                "text-base font-semibold leading-none tabular-nums",
                tone === "warning" ? "text-amber-300" : tone === "success" ? "text-green-300" : "text-gray-200",
            )}>
                {value}
            </p>
            <p className="text-[10px] text-[--muted] uppercase tracking-wide mt-1">{label}</p>
        </div>
    )
}

/**
 * One row of the match queue.
 *
 * The status is the whole point of the row: whether the match is waiting its turn, running now,
 * waiting to be tried again after a failure, or stopped on a question. An item that failed is not a
 * dead end — it is retried on its own, for as long as it takes — so the row says when it will be
 * tried again rather than presenting it as something to fix.
 *
 * The cover is what makes a row recognisable at a glance: a queue of twenty rows is a list of
 * titles, and the artwork is what tells them apart without reading.
 */
function QueueItemRow({
    item,
    position,
    onRemove,
    onRetry,
    onAnswer,
    isBusy,
}: {
    item: UnmatchedMatchQueueItem
    position: number
    onRemove: () => void
    onRetry: () => void
    onAnswer: () => void
    isBusy: boolean
}) {
    const failed = item.status === "pending" && item.attempts > 0 && !!item.errorMessage
    const needsDecision = item.status === "needs_decision"
    const matching = item.status === "matching"
    const title = item.animeTitle || item.torrentName

    return (
        <div
            className={cn(
                "relative flex items-stretch gap-3 rounded-xl border overflow-hidden transition-colors",
                matching
                    ? "border-brand-600/60 bg-brand-900/20"
                    : needsDecision
                        ? "border-amber-600/40 bg-amber-950/10"
                        : "border-gray-800 bg-gray-950/50 hover:border-gray-700",
            )}
        >
            {/* Where it sits in the order. A queue is a sequence, so the number is information. */}
            <div className={cn(
                "flex flex-col items-center justify-center w-10 flex-shrink-0 border-r",
                matching ? "border-brand-700/40 text-brand-200" : "border-gray-800/70 text-[--muted]",
            )}>
                {matching ? <LoadingSpinner className="h-4 w-4" /> : <span className="text-sm font-semibold tabular-nums">{position}</span>}
            </div>

            {/* The cover, or a folder block for a match queued without one. */}
            <div className="py-3 flex-shrink-0">
                <div className="w-[46px] h-[64px] rounded-md overflow-hidden bg-gray-800/70 border border-gray-700/60">
                    {item.coverImage ? (
                        <SeaImage
                            src={item.coverImage}
                            alt={title}
                            width={46}
                            height={64}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <LuListTodo className="text-lg text-gray-500" />
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 min-w-0 py-3">
                <p className="font-semibold text-sm line-clamp-1">{title}</p>
                <p className="text-xs text-[--muted] line-clamp-1 mt-0.5" title={item.torrentName}>
                    {item.torrentName}
                </p>

                <div className="flex flex-wrap items-center gap-2 mt-2">
                    {matching && (
                        <Badge intent="primary-solid" size="sm">
                            Matching now
                        </Badge>
                    )}
                    {item.status === "pending" && !failed && (
                        <Badge intent="blue" size="sm">
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
                            <LuTriangleAlert className="mr-1" />
                            Needs your decision
                        </Badge>
                    )}
                    <span className="text-xs text-[--muted]">
                        {item.fileCount} file{item.fileCount === 1 ? "" : "s"}
                    </span>
                    <span className="text-xs text-[--muted]">·</span>
                    <span className="text-xs text-[--muted]">queued {formatQueuedAt(item.createdAt)}</span>
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

                {needsDecision && (
                    <p className="text-xs text-amber-200/90 mt-2">
                        {item.errorMessage || (item.conflict
                            ? `${item.conflict.files.length} of ${item.conflict.totalPlanned} episode${item.conflict.totalPlanned === 1 ? "" : "s"} are already in the library.`
                            : item.countMismatch
                                ? `This download has ${item.countMismatch.found} episode${item.countMismatch.found === 1 ? "" : "s"} but ${item.countMismatch.expected} were expected.`
                                : "")}
                    </p>
                )}
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0 pr-3">
                {needsDecision && (item.conflict || item.countMismatch) && (
                    <Button size="sm" intent="primary" onClick={onAnswer} disabled={isBusy}>
                        Answer
                    </Button>
                )}
                {item.status === "pending" && failed && (
                    <Button
                        size="sm"
                        intent="gray-outline"
                        leftIcon={<LuRotateCw />}
                        onClick={onRetry}
                        disabled={isBusy}
                        title="Try this match again now"
                    >
                        Try again
                    </Button>
                )}
                <Button
                    size="sm"
                    intent="gray-outline"
                    onClick={onRemove}
                    title="Take this match out of the queue"
                    className="px-2"
                >
                    <LuX />
                </Button>
            </div>
        </div>
    )
}

/** "2 minutes ago" / "just now" — when the decision was made. */
function formatQueuedAt(createdAt: string): string {
    const at = new Date(createdAt).getTime()
    if (!Number.isFinite(at)) return "just now"
    const seconds = Math.max(0, Math.round((Date.now() - at) / 1000))
    if (seconds < 45) return "just now"
    const minutes = Math.round(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.round(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.round(hours / 24)}d ago`
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
