"use client"

import {
    useGetMangaScanResult,
    useMangaScanManualLink,
    useResolveMangaScanReview,
    useScanMangaDirectories,
    useSuggestMangaScanMatches,
} from "@/api/hooks/manga-scan.hooks"
import { useAnilistListManga } from "@/api/hooks/manga.hooks"
import { AL_BaseManga, Manga_MangaScanCandidate, Manga_MangaScanFolder } from "@/api/generated/types"
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
import { LuCheck, LuEye, LuFolderSearch, LuLink, LuSearch, LuX } from "react-icons/lu"
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
    // On by default: a wrong link is close to invisible once made, and looking down a list of
    // proposals costs a minute where finding one by accident costs months.
    const [reviewMatches, setReviewMatches] = React.useState(true)

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
        triggerScan({ forceRematch, reviewMatches })
    }

    const matched = scanResult?.scannedFolders?.filter(f => f.status === "matched") ?? []
    const pendingReview = scanResult?.scannedFolders?.filter(f => f.status === "pending-review") ?? []
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
                        <label className="flex items-center gap-2 text-sm text-[--muted] cursor-pointer">
                            <input
                                type="checkbox"
                                checked={reviewMatches}
                                onChange={(e) => setReviewMatches(e.target.checked)}
                                className="rounded"
                            />
                            Review matches before applying
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
                        {!!scanResult.pendingReviewCount && (
                            <Badge intent="primary" size="lg">
                                <LuEye className="mr-1" /> {scanResult.pendingReviewCount} Awaiting review
                            </Badge>
                        )}
                        <Badge intent="warning" size="lg">
                            <LuX className="mr-1" /> {scanResult.unmatchedCount ?? 0} Unmatched
                        </Badge>
                        <Badge intent="gray" size="lg">
                            {scanResult.skippedCount ?? 0} Skipped
                        </Badge>
                    </div>
                )}

                {/* Awaiting review — proposed matches that have not been applied to anything yet */}
                {pendingReview.length > 0 && (
                    <ReviewSection folders={pendingReview} onResolved={() => refetch()} />
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

/**
 * The proposals a scan made and did not act on.
 *
 * Nothing here has been written: each folder still has the local series it always had, and accepting
 * a row is what turns it into a link. Rejecting one writes nothing either — it just leaves the
 * folder as its own series, which the server describes from the manga provider in the background.
 */
function ReviewSection({ folders, onResolved }: { folders: Manga_MangaScanFolder[], onResolved: () => void }) {
    const queryClient = useQueryClient()
    const { mutate: resolve, isPending } = useResolveMangaScanReview()

    // The candidate chosen for each folder — the proposal unless the user picked another.
    const [chosen, setChosen] = React.useState<Record<string, number>>({})

    const chosenFor = (folder: Manga_MangaScanFolder) => chosen[folder.folderName!] ?? folder.matchedMediaId!

    const submit = (decisions: { folderName: string, mediaId: number, accept: boolean }[]) => {
        if (!decisions.length) return
        resolve({ decisions }, {
            onSuccess: (res) => {
                const applied = res?.applied ?? 0
                const dismissed = res?.dismissed ?? 0
                toast.success(
                    [applied ? `Linked ${applied}` : null, dismissed ? `dismissed ${dismissed}` : null]
                        .filter(Boolean).join(", "),
                )
                queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.MANGA_SCAN.GetMangaScanResult.key] })
                onResolved()
            },
        })
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-brand-300">Awaiting review</h2>
                    <p className="text-sm text-[--muted]">
                        Nothing below has been linked yet. Accept a match to file the folder under it, or dismiss it to
                        leave the folder as its own series.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        intent="success"
                        leftIcon={<LuCheck />}
                        loading={isPending}
                        onClick={() => submit(folders.map(f => ({
                            folderName: f.folderName!,
                            mediaId: chosenFor(f),
                            accept: true,
                        })))}
                    >
                        Accept all
                    </Button>
                    <Button
                        size="sm"
                        intent="alert-subtle"
                        leftIcon={<LuX />}
                        loading={isPending}
                        onClick={() => submit(folders.map(f => ({ folderName: f.folderName!, mediaId: 0, accept: false })))}
                    >
                        Dismiss all
                    </Button>
                </div>
            </div>

            <div className="grid gap-2">
                {folders.map((folder) => (
                    <ReviewRow
                        key={folder.folderName}
                        folder={folder}
                        chosenMediaId={chosenFor(folder)}
                        onChoose={(mediaId) => setChosen(prev => ({ ...prev, [folder.folderName!]: mediaId }))}
                        isPending={isPending}
                        onAccept={() => submit([{ folderName: folder.folderName!, mediaId: chosenFor(folder), accept: true }])}
                        onDismiss={() => submit([{ folderName: folder.folderName!, mediaId: 0, accept: false }])}
                    />
                ))}
            </div>
        </div>
    )
}

type ReviewRowProps = {
    folder: Manga_MangaScanFolder
    chosenMediaId: number
    onChoose: (mediaId: number) => void
    isPending: boolean
    onAccept: () => void
    onDismiss: () => void
}

function ReviewRow({ folder, chosenMediaId, onChoose, isPending, onAccept, onDismiss }: ReviewRowProps) {
    // The runners-up are already in hand from the scan, so correcting a wrong proposal costs nothing
    // and needs no second search.
    const [showOthers, setShowOthers] = React.useState(false)

    const candidates = folder.candidates ?? []
    const chosen: Manga_MangaScanCandidate | undefined =
        candidates.find(c => c.mediaId === chosenMediaId) ?? candidates[0]
    const others = candidates.filter(c => c.mediaId !== chosen?.mediaId)
    const confidence = Math.round((chosen?.confidence ?? folder.confidence ?? 0) * 100)

    return (
        <div className="rounded-lg border border-brand-900/40 bg-gray-900 p-3 space-y-3">
            <div className="flex items-center gap-4">
                {!!chosen?.coverImage && (
                    <img src={chosen.coverImage} alt="" className="size-12 rounded object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{folder.folderName}</p>
                    <p className="text-sm text-[--muted] truncate">
                        → {chosen?.title ?? folder.matchedTitle}
                        {!!chosen?.format && <span className="opacity-70"> · {chosen.format}</span>}
                        {!!chosen?.chapters && <span className="opacity-70"> · {chosen.chapters} ch</span>}
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge intent={confidence >= 85 ? "success" : confidence >= 65 ? "warning" : "gray"} size="sm">
                        {confidence}%
                    </Badge>
                    {folder.chapterCount > 0 && <span className="text-xs text-[--muted]">{folder.chapterCount} ch</span>}
                    <Button size="sm" intent="success" leftIcon={<LuCheck />} loading={isPending} onClick={onAccept}>
                        Accept
                    </Button>
                    <Button size="sm" intent="alert-subtle" leftIcon={<LuX />} loading={isPending} onClick={onDismiss}>
                        Dismiss
                    </Button>
                </div>
            </div>

            {others.length > 0 && (
                <div className="space-y-2">
                    <button
                        type="button"
                        className="text-xs text-[--muted] hover:text-white transition-colors"
                        onClick={() => setShowOthers(v => !v)}
                    >
                        {showOthers ? "Hide" : `Not right? ${others.length} other ${others.length === 1 ? "match" : "matches"}`}
                    </button>

                    {showOthers && (
                        <div className="grid gap-1 pl-2 border-l border-gray-800">
                            {others.map((candidate) => (
                                <button
                                    key={candidate.mediaId}
                                    type="button"
                                    className="flex items-center gap-3 rounded p-1.5 text-left hover:bg-gray-800 transition-colors"
                                    onClick={() => onChoose(candidate.mediaId!)}
                                >
                                    {!!candidate.coverImage && (
                                        <img src={candidate.coverImage} alt="" className="size-8 rounded object-cover flex-shrink-0" />
                                    )}
                                    <span className="flex-1 min-w-0 truncate text-sm">{candidate.title}</span>
                                    <span className="text-xs text-[--muted]">{Math.round((candidate.confidence ?? 0) * 100)}%</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
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

    // The same search the scan makes: the whole folder name, then the name without the release
    // furniture, then each side of its separators, then the alternative titles the manga provider
    // lists for it. A folder named after anything but the AniList title used to open this dialog to
    // an empty list and leave the user guessing at shorter names by hand.
    const { mutate: suggest, data, isPending: isSuggesting, reset: resetSuggestions } = useSuggestMangaScanMatches()
    const suggestions: Manga_MangaScanCandidate[] = data ?? []

    React.useEffect(() => {
        if (!isOpen) {
            resetSuggestions()
            return
        }
        suggest({ title: folderName })
    }, [isOpen, folderName])

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

    const handleLinkCandidate = (candidate: Manga_MangaScanCandidate) => {
        manualLink({ folderName, mediaId: candidate.mediaId! }, {
            onSuccess: () => {
                toast.success(`Linked "${folderName}" to "${candidate.title}"`)
                queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.MANGA_SCAN.GetMangaScanResult.key] })
                onLinked()
                onClose()
            },
        })
    }

    return (
        <Modal open={isOpen} onOpenChange={(open) => !open && onClose()} title={`Link: ${folderName}`} contentClass="max-w-2xl">
            <div className="space-y-4">
                {/* Suggestions, found before anybody typed anything */}
                {(isSuggesting || suggestions.length > 0) && (
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-[--muted]">
                            Suggestions {isSuggesting && <span className="opacity-70">· searching…</span>}
                        </p>
                        {isSuggesting && suggestions.length === 0 && <LoadingSpinner containerClass="py-2" />}
                        {suggestions.map((candidate) => (
                            <div
                                key={candidate.mediaId}
                                className="flex items-center gap-3 rounded-lg border border-brand-900/40 bg-gray-900 p-2"
                            >
                                {!!candidate.coverImage && (
                                    <img src={candidate.coverImage} alt="" className="size-12 rounded object-cover flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate text-sm">{candidate.title}</p>
                                    <p className="text-xs text-[--muted]">
                                        {candidate.format} · {candidate.status}
                                        {candidate.chapters ? ` · ${candidate.chapters} ch` : ""}
                                    </p>
                                </div>
                                <Badge intent={(candidate.confidence ?? 0) >= 0.85 ? "success" : "gray"} size="sm">
                                    {Math.round((candidate.confidence ?? 0) * 100)}%
                                </Badge>
                                <Button
                                    size="sm"
                                    intent="success"
                                    leftIcon={<LuLink />}
                                    onClick={() => handleLinkCandidate(candidate)}
                                    loading={isPending}
                                >
                                    Link
                                </Button>
                            </div>
                        ))}
                    </div>
                )}

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
