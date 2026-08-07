"use client"

import {
    useGetUnmatchedSweepStatus,
    useGetUnmatchedTorrents,
    useStopUnmatchedSweep,
    useSweepUnmatchedTorrents,
    UnmatchedTorrent,
} from "@/api/hooks/unmatched.hooks"
import { useGetLibraryCollection } from "@/api/hooks/anime_collection.hooks"
import { UnmatchedTorrentCard } from "@/app/(main)/unmatched/_components/unmatched-torrent-card"
import { UnmatchedMatchModal } from "@/app/(main)/unmatched/_components/unmatched-match-modal"
import { UnmatchedUndoModal } from "@/app/(main)/unmatched/_components/unmatched-undo-modal"
import { UnmatchedDiagnosticsModal } from "@/app/(main)/unmatched/_components/unmatched-diagnostics-modal"
import { AppLayoutStack } from "@/components/ui/app-layout"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { atom, useAtom } from "jotai"
import React from "react"
import { LuFolderSearch, LuEye, LuEyeOff, LuUndo2, LuStethoscope, LuWandSparkles, LuCircleStop } from "react-icons/lu"

export const selectedUnmatchedTorrentAtom = atom<UnmatchedTorrent | null>(null)

export function UnmatchedTorrentsPage() {
    const { data: torrents, isLoading, refetch, error, isError, isFetching } = useGetUnmatchedTorrents({
        // Poll often so new unmatched downloads appear quickly
        refetchInterval: 5_000,
        staleTime: 2_000,
        refetchOnWindowFocus: "always",
    })
    const { data: libraryCollection } = useGetLibraryCollection({ staleTime: 30_000 })
    const [selectedTorrent, setSelectedTorrent] = useAtom(selectedUnmatchedTorrentAtom)
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

            <p className="text-[--muted]">
                Downloaded torrents that haven't been matched to an anime yet. Select a torrent to choose episodes and match them to an anime.
            </p>

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
                                onSelect={() => setSelectedTorrent(torrent)}
                            />
                        ))}
                        {filteredTorrents.length === 0 && (
                            <p className="text-[--muted] text-sm col-span-full py-4">No torrents match your search.</p>
                        )}
                    </div>
                </AppLayoutStack>
            ) : null)}

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
        </PageWrapper>
    )
}
