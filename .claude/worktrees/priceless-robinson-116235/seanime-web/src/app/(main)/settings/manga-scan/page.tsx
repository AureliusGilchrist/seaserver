"use client"

import { useGetMangaScanResult, useMangaScanManualLink, useScanMangaDirectories } from "@/api/hooks/manga-scan.hooks"
import { useAnilistListManga } from "@/api/hooks/manga.hooks"
import { AL_BaseManga } from "@/api/generated/types"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Modal } from "@/components/ui/modal"
import { TextInput } from "@/components/ui/text-input"
import { WSEvents } from "@/lib/server/ws-events"
import { useQueryClient } from "@tanstack/react-query"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import React from "react"
import { LuCheck, LuFolderSearch, LuLink, LuSearch, LuX } from "react-icons/lu"
import { toast } from "sonner"

type ScanProgress = {
    current: number
    total: number
    folderName: string
}

export default function Page() {
    const { data: scanResult, isLoading, refetch } = useGetMangaScanResult()
    const { mutate: triggerScan, isPending: isScanning } = useScanMangaDirectories()
    const queryClient = useQueryClient()

    const [progress, setProgress] = React.useState<ScanProgress | null>(null)
    const [isRunning, setIsRunning] = React.useState(false)
    const [forceRematch, setForceRematch] = React.useState(false)

    useWebsocketMessageListener<ScanProgress>({
        type: WSEvents.MANGA_SCAN_PROGRESS,
        onMessage: (data) => {
            setProgress(data)
            setIsRunning(true)
        },
    })

    useWebsocketMessageListener({
        type: WSEvents.MANGA_SCAN_COMPLETED,
        onMessage: () => {
            setProgress(null)
            setIsRunning(false)
            queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.MANGA_SCAN.GetMangaScanResult.key] })
            toast.success("Manga scan completed")
        },
    })

    const handleScan = () => {
        setIsRunning(true)
        triggerScan({ forceRematch })
    }

    const matched = scanResult?.scannedFolders?.filter(f => f.status === "matched") ?? []
    const unmatched = scanResult?.scannedFolders?.filter(f => f.status === "unmatched") ?? []
    const skipped = scanResult?.scannedFolders?.filter(f => f.status === "skipped") ?? []

    return (
        <>
            <CustomLibraryBanner discrete />
            <PageWrapper className="p-4 sm:p-8 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-4">
                        <LuFolderSearch className="size-8 text-brand-300" />
                        <div>
                            <h1 className="text-2xl font-bold">Manga Library Scan</h1>
                            <p className="text-[--muted]">Scan your manga directories and match folders to AniList</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm text-[--muted] cursor-pointer">
                            <input
                                type="checkbox"
                                checked={forceRematch}
                                onChange={(e) => setForceRematch(e.target.checked)}
                                className="rounded"
                            />
                            Force rematch all
                        </label>
                        <Button
                            onClick={handleScan}
                            loading={isScanning || isRunning}
                            intent="primary"
                        >
                            Scan Now
                        </Button>
                    </div>
                </div>

                {/* Progress */}
                {isRunning && progress && (
                    <div className="rounded-lg border bg-gray-900 p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-[--muted]">Scanning: {progress.folderName}</span>
                            <span className="font-medium">{progress.current} / {progress.total}</span>
                        </div>
                        <div className="w-full bg-gray-800 rounded-full h-2">
                            <div
                                className="bg-brand-500 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${(progress.current / progress.total) * 100}%` }}
                            />
                        </div>
                    </div>
                )}

                {isLoading && <LoadingSpinner />}

                {/* Summary badges */}
                {scanResult?.scannedFolders && scanResult.scannedFolders.length > 0 && (
                    <div className="flex gap-3 flex-wrap">
                        <Badge intent="success" size="lg">
                            <LuCheck className="mr-1" /> {scanResult.matchedCount ?? 0} Matched
                        </Badge>
                        <Badge intent="warning" size="lg">
                            <LuX className="mr-1" /> {scanResult.unmatchedCount ?? 0} Unmatched
                        </Badge>
                        <Badge intent="gray" size="lg">
                            {scanResult.skippedCount ?? 0} Skipped
                        </Badge>
                    </div>
                )}

                {/* Matched */}
                {matched.length > 0 && (
                    <div className="space-y-3">
                        <h2 className="text-lg font-semibold text-green-400">Matched</h2>
                        <div className="grid gap-2">
                            {matched.map((folder) => (
                                <div
                                    key={folder.folderName}
                                    className="flex items-center gap-4 rounded-lg border border-green-900/40 bg-gray-900 p-3"
                                >
                                    {folder.matchedImage && (
                                        <img
                                            src={folder.matchedImage}
                                            alt=""
                                            className="size-12 rounded object-cover flex-shrink-0"
                                        />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">{folder.folderName}</p>
                                        <p className="text-sm text-[--muted] truncate">
                                            → {folder.matchedTitle}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <Badge intent="success" size="sm">
                                            {Math.round((folder.confidence ?? 0) * 100)}%
                                        </Badge>
                                        {folder.chapterCount > 0 && (
                                            <span className="text-xs text-[--muted]">{folder.chapterCount} ch</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Unmatched */}
                {unmatched.length > 0 && (
                    <div className="space-y-3">
                        <h2 className="text-lg font-semibold text-yellow-400">Unmatched</h2>
                        <div className="grid gap-2">
                            {unmatched.map((folder) => (
                                <UnmatchedRow
                                    key={folder.folderName}
                                    folder={folder}
                                    onLinked={() => refetch()}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Skipped */}
                {skipped.length > 0 && (
                    <div className="space-y-3">
                        <h2 className="text-lg font-semibold text-gray-400">Skipped (already mapped)</h2>
                        <div className="grid gap-2">
                            {skipped.map((folder) => (
                                <div
                                    key={folder.folderName}
                                    className="flex items-center gap-4 rounded-lg border border-gray-800 bg-gray-900 p-3 opacity-60"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">{folder.folderName}</p>
                                    </div>
                                    {folder.chapterCount > 0 && (
                                        <span className="text-xs text-[--muted]">{folder.chapterCount} ch</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty state */}
                {!isLoading && (!scanResult?.scannedFolders || scanResult.scannedFolders.length === 0) && !isRunning && (
                    <div className="text-center py-12 text-[--muted]">
                        <LuFolderSearch className="size-12 mx-auto mb-3 opacity-50" />
                        <p>No scan results yet. Click "Scan Now" to scan your manga directories.</p>
                    </div>
                )}
            </PageWrapper>
        </>
    )
}

// -------------------------------------------------------------------------------------

type UnmatchedRowProps = {
    folder: { folderName: string; chapterCount: number; matchedMediaId: number; isSynthetic: boolean }
    onLinked: () => void
}

function UnmatchedRow({ folder, onLinked }: UnmatchedRowProps) {
    const [isSearchOpen, setIsSearchOpen] = React.useState(false)

    return (
        <>
            <div className="flex items-center gap-4 rounded-lg border border-yellow-900/40 bg-gray-900 p-3">
                <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{folder.folderName}</p>
                    <p className="text-xs text-[--muted]">
                        {folder.chapterCount > 0 ? `${folder.chapterCount} chapters` : "No chapters detected"}
                        {folder.isSynthetic && " · Created as synthetic"}
                    </p>
                </div>
                <Button
                    size="sm"
                    intent="primary-subtle"
                    leftIcon={<LuSearch />}
                    onClick={() => setIsSearchOpen(true)}
                >
                    Search AniList
                </Button>
            </div>

            <AniListSearchModal
                isOpen={isSearchOpen}
                onClose={() => setIsSearchOpen(false)}
                folderName={folder.folderName}
                onLinked={onLinked}
            />
        </>
    )
}

// -------------------------------------------------------------------------------------

type AniListSearchModalProps = {
    isOpen: boolean
    onClose: () => void
    folderName: string
    onLinked: () => void
}

function AniListSearchModal({ isOpen, onClose, folderName, onLinked }: AniListSearchModalProps) {
    const [query, setQuery] = React.useState(folderName)
    const [searchQuery, setSearchQuery] = React.useState(folderName)
    const queryClient = useQueryClient()

    const { data: results, isLoading } = useAnilistListManga({
        search: searchQuery,
        page: 1,
        perPage: 10,
    }, isOpen && searchQuery.length > 0)

    const { mutate: manualLink, isPending } = useMangaScanManualLink()

    const handleSearch = () => {
        setSearchQuery(query)
    }

    const handleLink = (manga: AL_BaseManga) => {
        manualLink({ folderName, mediaId: manga.id! }, {
            onSuccess: () => {
                toast.success(`Linked "${folderName}" to "${manga.title?.userPreferred ?? manga.title?.romaji}"`)
                queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.MANGA_SCAN.GetMangaScanResult.key] })
                onLinked()
                onClose()
            },
        })
    }

    return (
        <Modal open={isOpen} onOpenChange={(open) => !open && onClose()} title={`Link: ${folderName}`} contentClass="max-w-2xl">
            <div className="space-y-4">
                <div className="flex gap-2">
                    <TextInput
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        placeholder="Search AniList..."
                        className="flex-1"
                    />
                    <Button onClick={handleSearch} intent="primary" loading={isLoading}>
                        Search
                    </Button>
                </div>

                {isLoading && <LoadingSpinner containerClass="py-4" />}

                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {results?.Page?.media?.map((manga) => (
                        <div
                            key={manga.id}
                            className="flex items-center gap-3 rounded-lg border bg-gray-900 p-2 hover:bg-gray-800 transition-colors"
                        >
                            {manga.coverImage?.medium && (
                                <img
                                    src={manga.coverImage.medium}
                                    alt=""
                                    className="size-12 rounded object-cover flex-shrink-0"
                                />
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate text-sm">
                                    {manga.title?.userPreferred ?? manga.title?.romaji}
                                </p>
                                <p className="text-xs text-[--muted]">
                                    {manga.format} · {manga.status}
                                    {manga.chapters ? ` · ${manga.chapters} ch` : ""}
                                </p>
                            </div>
                            <Button
                                size="sm"
                                intent="success"
                                leftIcon={<LuLink />}
                                onClick={() => handleLink(manga)}
                                loading={isPending}
                            >
                                Link
                            </Button>
                        </div>
                    ))}
                    {!isLoading && results?.Page?.media?.length === 0 && (
                        <p className="text-center text-[--muted] py-4">No results found</p>
                    )}
                </div>
            </div>
        </Modal>
    )
}
