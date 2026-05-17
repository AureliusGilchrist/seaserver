"use client"

import { useScanLocalFiles } from "@/api/hooks/scan.hooks"
import { useGetUnmatchedTorrents, UnmatchedTorrent } from "@/api/hooks/unmatched.hooks"
import { useGetLibraryCollection } from "@/api/hooks/anime_collection.hooks"
import { UnmatchedTorrentCard } from "@/app/(main)/unmatched/_components/unmatched-torrent-card"
import { UnmatchedMatchModal } from "@/app/(main)/unmatched/_components/unmatched-match-modal"
import { AppLayoutStack } from "@/components/ui/app-layout"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { atom, useAtom } from "jotai"
import React from "react"
import { LuFolderSearch, LuEye, LuEyeOff } from "react-icons/lu"

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
    const { mutate: scanLibrary } = useScanLocalFiles()
    const [search, setSearch] = React.useState("")
    const [hideMatched, setHideMatched] = React.useState(true)

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
            </div>

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
                    // Trigger a library scan so matched files appear on the home page
                    scanLibrary({
                        enhanced: true,
                        skipLockedFiles: true,
                        skipIgnoredFiles: true,
                    })
                }}
            />
        </PageWrapper>
    )
}
