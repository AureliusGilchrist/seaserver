"use client"

import {
    useGetUnmatchedSweepStatus,
    useGetUnmatchedTorrents,
    useStopUnmatchedSweep,
    useSweepUnmatchedTorrents,
    MatchResult,
    UnmatchedTorrent,
} from "@/api/hooks/unmatched.hooks"
import { useGetLibraryCollection } from "@/api/hooks/anime_collection.hooks"
import { UnmatchedTorrentCard } from "@/app/(main)/unmatched/_components/unmatched-torrent-card"
import { UnmatchedMatchModal } from "@/app/(main)/unmatched/_components/unmatched-match-modal"
import { UnmatchedUndoModal } from "@/app/(main)/unmatched/_components/unmatched-undo-modal"
import { UnmatchedDiagnosticsModal } from "@/app/(main)/unmatched/_components/unmatched-diagnostics-modal"
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
import { LuFolderSearch, LuEye, LuEyeOff, LuUndo2, LuStethoscope, LuWandSparkles, LuCircleStop, LuListTodo, LuPlay, LuTrash2 } from "react-icons/lu"

export const selectedUnmatchedTorrentAtom = atom<UnmatchedTorrent | null>(null)

/**
 * Downloads waiting to be matched, in the order they were queued (first in, first matched).
 *
 * Held by name, because that is what every unmatched endpoint keys on, and persisted so a queue
 * built up over a session survives a reload. Names that no longer appear in the downloads list —
 * matched elsewhere, swept, or deleted — are dropped from the queue once the list confirms they
 * are gone.
 */
export const unmatchedMatchQueueAtom = atomWithStorage<string[]>(
    "sea-unmatched-match-queue",
    [],
    undefined,
    { getOnInit: true },
)

/** Which tab the page was last on — working through a queue survives a reload. */
export const unmatchedPageTabAtom = atomWithStorage<"downloads" | "queue">(
    "sea-unmatched-tab",
    "downloads",
    undefined,
    { getOnInit: true },
)

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
    const [selectedTorrent, setSelectedTorrent] = useAtom(selectedUnmatchedTorrentAtom)
    const [matchQueue, setMatchQueue] = useAtom(unmatchedMatchQueueAtom)
    const [tab, setTab] = useAtom(unmatchedPageTabAtom)
    const [search, setSearch] = React.useState("")
    const [hideMatched, setHideMatched] = React.useState(true)
    const [undoOpen, setUndoOpen] = React.useState(false)
    const [diagnosticsOpen, setDiagnosticsOpen] = React.useState(false)
    // True while the open modal was started from the queue tab. Only then does a completed match
    // open the next queued download in its place — matching from the downloads list behaves as it
    // always has, and closes when it is done.
    const [queueMode, setQueueMode] = React.useState(false)

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

    // ─── To-match queue ──────────────────────────────────────────────
    //
    // Opening a download to match it puts it in the queue; a completed match takes it out, so what
    // is left in the queue is what still needs matching. The cards also carry a button to add and
    // remove without opening anything, which is how a run of downloads gets lined up to work
    // through. The queue only ever shows here — it is a work list for this screen, not a library
    // surface.

    const enqueueTorrent = React.useCallback((name: string) => {
        setMatchQueue(prev => prev.includes(name) ? prev : [...prev, name])
    }, [setMatchQueue])

    const dequeueTorrent = React.useCallback((name: string) => {
        setMatchQueue(prev => prev.filter(n => n !== name))
    }, [setMatchQueue])

    const toggleQueued = React.useCallback((name: string) => {
        setMatchQueue(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
    }, [setMatchQueue])

    // Queued downloads the list no longer knows about have nothing left to match, so they drop
    // out. Only done once the list has actually arrived, so a failed or slow fetch cannot empty a
    // queue that is still valid.
    React.useEffect(() => {
        if (isError || torrents === undefined) return
        const present = new Set(torrents.map(t => t.name))
        setMatchQueue(prev => {
            const next = prev.filter(name => present.has(name))
            return next.length === prev.length ? prev : next
        })
    }, [torrents, isError, setMatchQueue])

    // The queue, in order, resolved against the listed downloads.
    const queuedTorrents = React.useMemo(() => {
        const byName = new Map(torrentsList.map(t => [t.name, t]))
        return matchQueue.map(name => byName.get(name)).filter((t): t is UnmatchedTorrent => !!t)
    }, [matchQueue, torrentsList])

    const queuedNames = React.useMemo(() => new Set(matchQueue), [matchQueue])

    const clearQueueConfirmation = useConfirmationDialog({
        title: "Clear the to-match queue",
        description: "Removes every download from the queue. The downloads themselves are left untouched.",
        onConfirm: () => setMatchQueue([]),
    })

    const openForMatch = React.useCallback((torrent: UnmatchedTorrent, fromQueue: boolean = false) => {
        setQueueMode(fromQueue)
        setSelectedTorrent(torrent)
        // Trying to match a download is what queues it. Matching from the queue tab doesn't need
        // this — it is already there.
        if (!fromQueue) enqueueTorrent(torrent.name)
    }, [setSelectedTorrent, enqueueTorrent])

    const handleMatchNext = React.useCallback(() => {
        const next = queuedTorrents[0]
        if (!next) return
        openForMatch(next, true)
    }, [queuedTorrents, openForMatch])

    const handleMatchSuccess = React.useCallback((result?: MatchResult) => {
        const matchedName = selectedTorrent?.name
        // A match that failed stays in the queue: it still needs matching.
        const completed = !!result?.success && !!matchedName
        if (completed && matchedName) dequeueTorrent(matchedName)

        // Working from the queue: the next queued download opens in place of the one just matched,
        // so a backlog can be worked through without going back to the list in between. Closing
        // the modal stops the run; whatever was not reached stays queued.
        let next: UnmatchedTorrent | null = null
        if (completed && queueMode) {
            const nextName = matchQueue.find(name => name !== matchedName)
            if (nextName) next = torrentsList.find(t => t.name === nextName) ?? null
        }

        if (next) {
            setSelectedTorrent(next)
        } else {
            setSelectedTorrent(null)
            setQueueMode(false)
        }
        // NOTE: no library scan here on purpose. The server already injects the moved files into
        // the library DB as hydrated, locked local files, so a scan adds nothing — and a full
        // enhanced scan after *every* match is what made matching get slower and slower the longer
        // a matching session ran.
        refetch()
    }, [selectedTorrent, queueMode, matchQueue, torrentsList, dequeueTorrent, setSelectedTorrent, refetch])

    // Where the open download sits in the queue, for the badge in the modal header.
    const selectedQueueIndex = selectedTorrent ? matchQueue.indexOf(selectedTorrent.name) : -1
    const queueInfo = selectedQueueIndex >= 0
        ? { position: selectedQueueIndex + 1, total: matchQueue.length, autoAdvance: queueMode }
        : null

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
                        {matchQueue.length > 0 && (
                            <Badge className="ml-2 font-bold" intent="alert" size="sm">
                                {matchQueue.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="downloads" className="space-y-4">
                    <p className="text-[--muted]">
                        Downloaded torrents that haven't been matched to an anime yet. Select a torrent to choose episodes and match them to an anime.
                    </p>

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
                                        queued={queuedNames.has(torrent.name)}
                                        onToggleQueue={() => toggleQueued(torrent.name)}
                                        onSelect={() => openForMatch(torrent)}
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
                    {matchQueue.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <LuListTodo className="text-6xl text-[--muted] mb-4" />
                            <p className="text-lg text-[--muted]">Nothing queued to match</p>
                            <p className="text-sm text-[--muted] max-w-md">
                                Opening a download to match it adds it here, and the queue button on a card lines
                                one up without opening it. Matching from this tab opens the next queued download
                                automatically.
                            </p>
                            <Button intent="gray-outline" size="sm" className="mt-4" onClick={() => setTab("downloads")}>
                                Browse downloads
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-3 flex-wrap">
                                <Button
                                    intent="primary"
                                    leftIcon={<LuPlay />}
                                    onClick={handleMatchNext}
                                    disabled={queuedTorrents.length === 0}
                                >
                                    Match next
                                </Button>
                                <span className="text-sm text-[--muted]">
                                    {matchQueue.length} queued
                                    {queuedTorrents[0] && (
                                        <> · next: <span className="text-gray-300">{queuedTorrents[0].animeTitleRomaji || queuedTorrents[0].animeTitleNative || queuedTorrents[0].name}</span></>
                                    )}
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

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {queuedTorrents.map((torrent, i) => (
                                    <UnmatchedTorrentCard
                                        key={torrent.path}
                                        torrent={torrent}
                                        queued
                                        queuePosition={i + 1}
                                        onToggleQueue={() => toggleQueued(torrent.name)}
                                        onSelect={() => openForMatch(torrent, true)}
                                    />
                                ))}
                            </div>

                            {!isLoading && !isError && queuedTorrents.length < matchQueue.length && (
                                <p className="text-xs text-[--muted]">
                                    {matchQueue.length - queuedTorrents.length} queued download{matchQueue.length - queuedTorrents.length === 1 ? " is" : "s are"} no longer in the list and will drop out of the queue.
                                </p>
                            )}

                            {isError && (
                                <p className="text-xs text-amber-200/90">
                                    The downloads list couldn't be loaded, so the queue can't be worked through right now.
                                </p>
                            )}
                        </>
                    )}
                </TabsContent>
            </Tabs>

            <UnmatchedMatchModal
                torrent={selectedTorrent}
                queueInfo={queueInfo}
                onClose={() => {
                    setSelectedTorrent(null)
                    // Closing stops a queue run; whatever wasn't reached stays queued.
                    setQueueMode(false)
                }}
                onSuccess={handleMatchSuccess}
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

            <ConfirmationDialog {...clearQueueConfirmation} />
        </PageWrapper>
    )
}
