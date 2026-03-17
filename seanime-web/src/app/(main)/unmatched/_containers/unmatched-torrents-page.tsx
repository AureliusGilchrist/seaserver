"use client"

import { useScanLocalFiles } from "@/api/hooks/scan.hooks"
import { useGetUnmatchedTorrents, UnmatchedTorrent } from "@/api/hooks/unmatched.hooks"
import { UnmatchedTorrentCard } from "@/app/(main)/unmatched/_components/unmatched-torrent-card"
import { UnmatchedMatchModal } from "@/app/(main)/unmatched/_components/unmatched-match-modal"
import { AppLayoutStack } from "@/components/ui/app-layout"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { atom, useAtom } from "jotai"
import React from "react"
import { LuFolderSearch } from "react-icons/lu"

export const selectedUnmatchedTorrentAtom = atom<UnmatchedTorrent | null>(null)

export function UnmatchedTorrentsPage() {
    const { data: torrents, isLoading, refetch, error, isError, isFetching } = useGetUnmatchedTorrents({
        // Poll often so new unmatched downloads appear quickly
        refetchInterval: 5_000,
        staleTime: 2_000,
        refetchOnWindowFocus: "always",
    })
    const [selectedTorrent, setSelectedTorrent] = useAtom(selectedUnmatchedTorrentAtom)
    const { mutate: scanLibrary } = useScanLocalFiles()

    const torrentsList = torrents ?? []
    const initialLoading = isLoading && torrentsList.length === 0
    const isRefreshing = isFetching && !isLoading

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
                {isRefreshing && <LoadingSpinner className="h-4 w-4" />}
            </div>

            <p className="text-[--muted]">
                Downloaded torrents that haven't been matched to an anime yet. Select a torrent to choose episodes and match them to an anime.
            </p>

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
                        {torrentsList.map((torrent) => (
                            <UnmatchedTorrentCard
                                key={torrent.path}
                                torrent={torrent}
                                onSelect={() => setSelectedTorrent(torrent)}
                            />
                        ))}
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
