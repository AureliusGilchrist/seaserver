"use client"

import {
    UnmatchedTorrent,
    UnmatchedFile,
    FamilyEntry,
    useMatchUnmatchedTorrent,
    useGetUnmatchedTorrentContents,
    useUnmatchedFamilySearch,
} from "@/api/hooks/unmatched.hooks"
import { useAnilistListAnime, useGetAnilistAnimeDetails } from "@/api/hooks/anilist.hooks"
import { useGetLibraryCollection } from "@/api/hooks/anime_collection.hooks"
import { AL_BaseAnime, AL_AnimeDetailsById_Media } from "@/api/generated/types"
import { AppLayoutStack } from "@/components/ui/app-layout"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Modal } from "@/components/ui/modal"
import { NumberInput } from "@/components/ui/number-input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { TextInput } from "@/components/ui/text-input"
import { Alert } from "@/components/ui/alert/alert"
import React, { useState, useMemo, useCallback, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { BiCheck, BiFolder, BiFile, BiSearch, BiFolderOpen, BiSolidStar } from "react-icons/bi"
import { LuChevronDown, LuChevronRight } from "react-icons/lu"
import { SeaImage as Image } from "@/components/shared/sea-image"
import capitalize from "lodash/capitalize"

// Tree node structure for folder hierarchy
interface TreeNode {
    name: string
    path: string
    isFolder: boolean
    children: TreeNode[]
    file?: UnmatchedFile
}

interface UnmatchedMatchModalProps {
    torrent: UnmatchedTorrent | null
    onClose: () => void
    onSuccess: () => void
}

// Safely extract a title string from AniList details, handling generated type shapes
function getAniListTitle(details: AL_AnimeDetailsById_Media | null | undefined): string | null {
    const media: any = details as any
    const title = media?.title || media?.Media?.title || null
    if (!title) return null
    return title.romaji || title.english || title.native || title.userPreferred || null
}

// Check if anime is already in the local library
function isAnimeInLibrary(animeId: number, libraryCollection: any): boolean {
    if (!libraryCollection?.lists) return false
    
    for (const list of libraryCollection.lists) {
        if (list?.entries) {
            for (const entry of list.entries) {
                if (entry?.mediaId === animeId) {
                    return true
                }
            }
        }
    }
    return false
}

export function UnmatchedMatchModal({ torrent, onClose, onSuccess }: UnmatchedMatchModalProps) {
    const queryClient = useQueryClient()
    const { data: libraryCollection } = useGetLibraryCollection()
    const [step, setStep] = useState<"select-files" | "select-anime">("select-files")
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
    const [selectedAnime, setSelectedAnime] = useState<AL_BaseAnime | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(new Set())
    const [torrentContents, setTorrentContents] = useState<UnmatchedTorrent | null>(null)
    const [isLoadingContents, setIsLoadingContents] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [fetchedName, setFetchedName] = useState<string | null>(null)
    const [hasAutoSelectedAnime, setHasAutoSelectedAnime] = useState(false)
    const [dependOnIndex, setDependOnIndex] = useState(false)
    const [episodeOffset, setEpisodeOffset] = useState(1)
    // Family search (Feature 2)
    const [familySearchDone, setFamilySearchDone] = useState(false)
    const [familyResults, setFamilyResults] = useState<FamilyEntry[] | null>(null)
    const { mutate: runFamilySearch, isPending: isFamilySearchLoading } = useUnmatchedFamilySearch()
    // Family detail fetch — when a family entry is clicked, fetch full details progressively
    const [familyDetailId, setFamilyDetailId] = useState<number | null>(null)
    const { data: familyAnimeDetails } = useGetAnilistAnimeDetails(familyDetailId)

    const { mutate: fetchTorrentContents } = useGetUnmatchedTorrentContents(torrent?.name || null)

    // Fetch anime details if we have stored animeId
    const storedAnimeId = torrentContents?.animeId || torrent?.animeId
    const storedAnimeTitleRomaji = torrentContents?.animeTitleRomaji || torrent?.animeTitleRomaji
    const storedAnimeTitleNative = torrentContents?.animeTitleNative || torrent?.animeTitleNative
    const storedAnimeExpectedEpisodes = torrentContents?.animeExpectedEpisodes || torrent?.animeExpectedEpisodes
    const storedAnimeStartYear = torrentContents?.animeStartYear || torrent?.animeStartYear
    
    const { data: storedAnimeDetails, isLoading: isLoadingStoredAnime } = useGetAnilistAnimeDetails(
        storedAnimeId && !hasAutoSelectedAnime ? storedAnimeId : null
    )

    // Auto-select anime from stored metadata - prioritize fetched details, fall back to synthetic object
    useEffect(() => {
        if (hasAutoSelectedAnime || selectedAnime) return
        
        // If we have fetched anime details, use them
        if (storedAnimeDetails) {
            setSelectedAnime(storedAnimeDetails as AL_BaseAnime)
            setHasAutoSelectedAnime(true)
            return
        }
        
        // If we have stored animeId and title but fetch hasn't completed yet (or failed),
        // create a synthetic anime object so the user doesn't have to re-select
        if (storedAnimeId && storedAnimeTitleRomaji && !isLoadingStoredAnime) {
            const syntheticAnime: AL_BaseAnime = {
                id: storedAnimeId,
                title: {
                    romaji: storedAnimeTitleRomaji,
                    native: storedAnimeTitleNative || undefined,
                    english: undefined,
                    userPreferred: storedAnimeTitleRomaji,
                },
            }
            setSelectedAnime(syntheticAnime)
            setHasAutoSelectedAnime(true)
        }
    }, [storedAnimeDetails, storedAnimeId, storedAnimeTitleRomaji, storedAnimeTitleNative, isLoadingStoredAnime, hasAutoSelectedAnime, selectedAnime])

    // Enrich selected anime with full details when family detail fetch completes
    useEffect(() => {
        if (familyAnimeDetails && familyDetailId && selectedAnime?.id === familyDetailId) {
            setSelectedAnime(familyAnimeDetails as AL_BaseAnime)
            setFamilyDetailId(null)
        }
    }, [familyAnimeDetails, familyDetailId, selectedAnime?.id])

    // Fetch torrent contents when modal opens
    useEffect(() => {
        if (torrent?.name && torrent.name !== fetchedName) {
            setIsLoadingContents(true)
            setLoadError(null)
            setFetchedName(torrent.name)
            // Reset selection when switching to a different torrent
            setSelectedAnime(null)
            setHasAutoSelectedAnime(false)
            setSearchQuery("")
            fetchTorrentContents({ name: torrent.name }, {
                onSuccess: (data) => {
                    setTorrentContents(data || null)
                    setIsLoadingContents(false)
                },
                onError: (error) => {
                    const message = (error as Error)?.message || "Failed to load torrent contents"
                    console.error("Failed to fetch torrent contents:", error)
                    setLoadError(message)
                    setTorrentContents(null)
                    setIsLoadingContents(false)
                    toast.error(message)
                },
            })
        } else if (!torrent?.name) {
            setTorrentContents(null)
            setFetchedName(null)
            setLoadError(null)
        }
    }, [torrent?.name, fetchTorrentContents, fetchedName])

    // Failsafe timeout to avoid infinite spinner
    useEffect(() => {
        if (!isLoadingContents) return
        const timer = setTimeout(() => {
            setIsLoadingContents(false)
            if (!torrentContents) {
                const message = "Timed out loading torrent contents. Please retry."
                setLoadError(message)
                toast.error(message)
            }
        }, 15000)
        return () => clearTimeout(timer)
    }, [isLoadingContents, torrentContents])

    const handleRetryLoad = useCallback(() => {
        if (!torrent?.name) return
        setFetchedName(null)
        setTorrentContents(null)
        setLoadError(null)
        // Also reset selection to avoid stale auto-selected anime
        setSelectedAnime(null)
        setHasAutoSelectedAnime(false)
    }, [torrent?.name])

    const { mutate: matchTorrent, isPending: isMatching } = useMatchUnmatchedTorrent(() => {
        onSuccess()
        // Reset selection to avoid carrying the previous anime into subsequent matches in the same modal session
        setSelectedAnime(null)
        setHasAutoSelectedAnime(false)
        setSearchQuery("")
        setDependOnIndex(false)
        setEpisodeOffset(1)
        setFamilyDetailId(null)
        // Keep the files list but drop selections after a match
        setSelectedFiles(new Set())
    })

    // Auto-search query: use the displayed anime title if no anime is selected yet
    const autoSearchQuery = useMemo(() => {
        if (selectedAnime || hasAutoSelectedAnime) return null

        // Prefer AniList-fetched title if available
        const aniListTitle = getAniListTitle(storedAnimeDetails)
        if (aniListTitle) return aniListTitle

        // Fall back to stored/torrent metadata
        return torrentContents?.animeTitleRomaji || torrent?.animeTitleRomaji || null
    }, [selectedAnime, hasAutoSelectedAnime, storedAnimeDetails, torrentContents?.animeTitleRomaji, torrent?.animeTitleRomaji])

    // Use either manual search query or auto-search query
    const effectiveSearchQuery = searchQuery || autoSearchQuery || ""

    const { data: searchResults, isLoading: isSearching } = useAnilistListAnime({
        search: effectiveSearchQuery,
        page: 1,
        perPage: 20,
    }, !!effectiveSearchQuery && effectiveSearchQuery.length >= 2)

    // Pre-fill search input with torrent metadata to avoid manual typing
    useEffect(() => {
        if (!searchQuery && autoSearchQuery) {
            setSearchQuery(autoSearchQuery)
        }
    }, [searchQuery, autoSearchQuery])

    const resetState = useCallback(() => {
        setStep("select-files")
        setSelectedFiles(new Set())
        setSelectedAnime(null)
        setSearchQuery("")
        setExpandedSeasons(new Set())
        setTorrentContents(null)
        setFetchedName(null)
        setHasAutoSelectedAnime(false)
        setFamilySearchDone(false)
        setFamilyResults(null)
        setFamilyDetailId(null)
    }, [])

    const handleManualSearch = useCallback(() => {
        if (!searchQuery || searchQuery.length < 2) return
        
        // Invalidate the search query to trigger a refetch
        queryClient.invalidateQueries({ 
            queryKey: ["ANILIST-anilist-list-anime", { search: searchQuery, page: 1, perPage: 20 }] 
        })
    }, [searchQuery, queryClient])

    const handleClose = useCallback(() => {
        resetState()
        onClose()
    }, [onClose, resetState])

    const toggleFile = useCallback((relativePath: string) => {
        setSelectedFiles(prev => {
            const next = new Set(prev)
            if (next.has(relativePath)) {
                next.delete(relativePath)
            } else {
                next.add(relativePath)
            }
            return next
        })
    }, [])

    const selectAll = useCallback(() => {
        if (torrentContents?.files) {
            setSelectedFiles(new Set(torrentContents.files.map(f => f.relativePath)))
        }
    }, [torrentContents])

    const deselectAll = useCallback(() => {
        setSelectedFiles(new Set())
    }, [])

    const toggleSeasonExpand = useCallback((seasonName: string) => {
        setExpandedSeasons(prev => {
            const next = new Set(prev)
            if (next.has(seasonName)) {
                next.delete(seasonName)
            } else {
                next.add(seasonName)
            }
            return next
        })
    }, [])

    const handleMatch = useCallback(() => {
        if (!torrent || !selectedAnime || selectedFiles.size === 0) return

        // Feature 4: warn if this media ID is already in the library
        if (isAnimeInLibrary(selectedAnime.id, libraryCollection)) {
            toast.error("You already matched these files", {
                description: `Media ID ${selectedAnime.id} is already in your library. Choose a different entry or remove the existing one first.`,
                duration: 8000,
            })
            return
        }

        const titleJp = selectedAnime.title?.native || selectedAnime.title?.romaji || selectedAnime.title?.english || ""
        // Fallback to torrent metadata titles if anime title is empty
        const titleClean = selectedAnime.title?.romaji 
            || selectedAnime.title?.english 
            || selectedAnime.title?.native 
            || torrentContents?.animeTitleRomaji
            || torrent?.animeTitleRomaji
            || torrent.name
            || ""

        matchTorrent({
            torrentName: torrent.name,
            selectedFiles: Array.from(selectedFiles),
            animeId: selectedAnime.id,
            animeTitleJp: titleJp,
            animeTitleClean: titleClean,
            useIndexBasedEpisodes: dependOnIndex,
            episodeOffset: dependOnIndex ? (episodeOffset > 0 ? episodeOffset : 1) : undefined,
        })
    }, [torrent, selectedAnime, selectedFiles, matchTorrent, torrentContents])

    // Build a folder tree from all files
    const fileTree = useMemo(() => {
        if (!torrentContents?.files) return null

        const root: TreeNode = {
            name: "",
            path: "",
            isFolder: true,
            children: [],
        }

        // Sort files first
        const sortedFiles = [...torrentContents.files].sort((a, b) =>
            a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true })
        )

        for (const file of sortedFiles) {
            const parts = file.relativePath.split("/").filter(Boolean)
            let current = root

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i]
                const isLastPart = i === parts.length - 1
                const currentPath = parts.slice(0, i + 1).join("/")

                let child = current.children.find(c => c.name === part)

                if (!child) {
                    child = {
                        name: part,
                        path: currentPath,
                        isFolder: !isLastPart,
                        children: [],
                        file: isLastPart ? file : undefined,
                    }
                    current.children.push(child)
                }

                current = child
            }
        }

        // Sort children of every folder alphabetically, folders first
        const sortTree = (node: TreeNode) => {
            if (!node.children.length) return
            node.children.sort((a, b) => {
                if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
                return a.name.localeCompare(b.name, undefined, { numeric: true })
            })
            node.children.forEach(sortTree)
        }
        sortTree(root)

        return root
    }, [torrentContents])

    // Expand/collapse helpers for navigation
    const expandAll = useCallback(() => {
        if (!fileTree) return
        const collectFolders = (node: TreeNode, acc: Set<string>) => {
            if (node.path) acc.add(node.path)
            node.children.forEach(child => child.isFolder && collectFolders(child, acc))
        }
        const acc = new Set<string>()
        collectFolders(fileTree, acc)
        setExpandedSeasons(acc)
    }, [fileTree])

    const collapseAll = useCallback(() => {
        setExpandedSeasons(new Set())
    }, [])

    // Get all file paths under a folder path
    const getFilesUnderPath = useCallback((path: string): string[] => {
        if (!torrentContents?.files) return []
        const prefix = path ? path + "/" : ""
        return torrentContents.files
            .filter(f => f.relativePath.startsWith(prefix) || f.relativePath === path)
            .map(f => f.relativePath)
    }, [torrentContents])

    // Toggle folder selection (XOR operation)
    const toggleFolder = useCallback((folderPath: string) => {
        const filesUnder = getFilesUnderPath(folderPath)
        setSelectedFiles(prev => {
            const next = new Set(prev)
            const allSelected = filesUnder.every(f => next.has(f))

            if (allSelected) {
                // Deselect all files under this folder
                filesUnder.forEach(f => next.delete(f))
            } else {
                // Select all files under this folder
                filesUnder.forEach(f => next.add(f))
            }
            return next
        })
    }, [getFilesUnderPath])

    // Check folder selection state
    const getFolderSelectionState = useCallback((folderPath: string): "all" | "some" | "none" => {
        const filesUnder = getFilesUnderPath(folderPath)
        if (filesUnder.length === 0) return "none"
        const selectedCount = filesUnder.filter(f => selectedFiles.has(f)).length
        if (selectedCount === 0) return "none"
        if (selectedCount === filesUnder.length) return "all"
        return "some"
    }, [getFilesUnderPath, selectedFiles])

    if (!torrent) return null

    // Get the anime title to display
    const displayAnimeTitle = selectedAnime?.title?.romaji
        || selectedAnime?.title?.english
        || selectedAnime?.title?.native
        || torrentContents?.animeTitleRomaji
        || torrent?.animeTitleRomaji
        || null

    const displayEpisodeCount = selectedAnime?.episodes
        ?? storedAnimeExpectedEpisodes

    const displayStartYear = selectedAnime?.startDate?.year
        ?? storedAnimeStartYear

    const isLoadingAnimeInfo = isLoadingStoredAnime && storedAnimeId && !selectedAnime

    return (
        <Modal
            open={!!torrent}
            onOpenChange={(open) => !open && handleClose()}
            contentClass="max-w-4xl"
            title={step === "select-files" ? "Select Episodes" : "Select Anime"}
        >
            {(isLoadingContents || isLoadingAnimeInfo) ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10">
                    <LoadingSpinner />
                    <p className="text-sm text-[--muted]">Loading torrent files…</p>
                </div>
            ) : loadError ? (
                <div className="flex flex-col gap-3 py-6">
                    <Alert intent="alert" title="Could not load torrent files" description={loadError} className="border border-red-500/30 bg-red-900/20" />
                    <div className="flex gap-2">
                        <Button intent="primary" size="sm" onClick={handleRetryLoad}>Retry</Button>
                        <Button intent="gray-outline" size="sm" onClick={handleClose}>Close</Button>
                    </div>
                </div>
            ) : step === "select-files" ? (
                <AppLayoutStack className="space-y-4">
                    {/* Show anime info banner if we have it */}
                    {(displayAnimeTitle || selectedAnime) && (
                        <div className="p-3 border rounded-md bg-brand-900/20 flex items-center gap-3">
                            {selectedAnime?.coverImage?.medium && (
                                <Image
                                    src={selectedAnime.coverImage.medium}
                                    alt={displayAnimeTitle || ""}
                                    width={40}
                                    height={56}
                                    className="rounded object-cover"
                                />
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-[--muted]">Matching to:</p>
                                <p className="font-semibold text-brand-200 line-clamp-1 flex items-center gap-2">
                                    <span>{displayAnimeTitle || torrent.name}</span>
                                    {(displayEpisodeCount || displayStartYear || selectedAnime?.format) && (
                                        <span className="text-xs text-[--muted] flex items-center gap-2">
                                            {selectedAnime?.format && (
                                                <span>{selectedAnime.format}</span>
                                            )}
                                            {typeof displayEpisodeCount === "number" && (
                                                <span>· {displayEpisodeCount} eps</span>
                                            )}
                                            {displayStartYear && (
                                                <span>· {displayStartYear}</span>
                                            )}
                                        </span>
                                    )}
                                </p>
                                {selectedAnime?.title?.romaji && selectedAnime.title.romaji !== displayAnimeTitle && (
                                    <p className="text-xs text-[--muted] line-clamp-1">{selectedAnime.title.romaji}</p>
                                )}
                                {selectedAnime?.title?.english && selectedAnime.title.english !== displayAnimeTitle && (
                                    <p className="text-xs text-[--muted] line-clamp-1">{selectedAnime.title.english}</p>
                                )}
                                {selectedAnime?.title?.native && selectedAnime.title.native !== displayAnimeTitle && (
                                    <p className="text-xs text-[--muted] line-clamp-1">{selectedAnime.title.native}</p>
                                )}
                            </div>
                            <Button
                                size="sm"
                                intent="gray-outline"
                                onClick={() => {
                                    setSelectedAnime(null)
                                    setHasAutoSelectedAnime(true)
                                    setStep("select-anime")
                                }}
                            >
                                Change
                            </Button>
                        </div>
                    )}

                    <div className="flex items-center justify-between">
                        <p className="text-sm text-[--muted]">
                            Select the episodes you want to match. You can select entire seasons or individual files.
                        </p>
                        <div className="flex gap-2">
                            <Button size="sm" intent="gray-outline" onClick={selectAll}>
                                Select All
                            </Button>
                            <Button size="sm" intent="gray-outline" onClick={deselectAll}>
                                Deselect All
                            </Button>
                        </div>
                    </div>

                    <ScrollArea className="h-[400px] border rounded-md overflow-hidden w-full">
                        <div className="p-2 space-y-1 w-full min-w-0">
                            {fileTree && fileTree.children.map((node) => (
                                <TreeNodeItem
                                    key={node.path}
                                    node={node}
                                    depth={0}
                                    expandedFolders={expandedSeasons}
                                    toggleFolderExpand={toggleSeasonExpand}
                                    selectedFiles={selectedFiles}
                                    toggleFile={toggleFile}
                                    toggleFolder={toggleFolder}
                                    getFolderSelectionState={getFolderSelectionState}
                                    getFilesUnderPath={getFilesUnderPath}
                                />
                            ))}
                        </div>
                    </ScrollArea>

                    <div className="flex justify-between items-center pt-4">
                        <span className="text-sm text-[--muted]">
                            {selectedFiles.size} files selected
                        </span>
                        {/* Index-based episode matching controls */}
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-[--muted]">Depend on index</span>
                                <Switch
                                    value={dependOnIndex}
                                    onValueChange={setDependOnIndex}
                                />
                            </div>
                            {dependOnIndex && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-[--muted]">Start at ep</span>
                                    <div className="w-20">
                                        <NumberInput
                                            value={episodeOffset}
                                            onValueChange={v => setEpisodeOffset(v > 0 ? v : 1)}
                                            formatOptions={{ useGrouping: false }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button intent="gray-outline" onClick={handleClose}>
                                Cancel
                            </Button>
                            {selectedAnime ? (
                                <Button
                                    intent="primary"
                                    onClick={handleMatch}
                                    disabled={selectedFiles.size === 0 || isMatching}
                                    loading={isMatching}
                                    leftIcon={<BiCheck />}
                                >
                                    Match {selectedFiles.size} Files
                                </Button>
                            ) : (
                                <Button
                                    intent="primary"
                                    onClick={() => setStep("select-anime")}
                                    disabled={selectedFiles.size === 0}
                                >
                                    Match {selectedFiles.size} Files
                                </Button>
                            )}
                        </div>
                    </div>
                </AppLayoutStack>
            ) : (
                <AppLayoutStack className="space-y-4">
                    {/* Feature 2: Family / relation search prompt */}
                    {!familySearchDone && storedAnimeId && (
                        <div className="flex items-center justify-between p-3 border rounded-md bg-[--subtle] gap-3">
                            <div>
                                <p className="text-sm font-medium">Load full anime family?</p>
                                <p className="text-xs text-[--muted]">
                                    Fetch all sequels &amp; prequels from AniList so you can pick the right season or part.
                                </p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <Button
                                    size="sm"
                                    intent="primary"
                                    loading={isFamilySearchLoading}
                                    onClick={() => {
                                        runFamilySearch({ animeId: storedAnimeId }, {
                                            onSuccess: (data) => {
                                                setFamilyResults(data || null)
                                                setFamilySearchDone(true)
                                            },
                                            onError: () => setFamilySearchDone(true),
                                        })
                                    }}
                                >
                                    Yes, load family
                                </Button>
                                <Button size="sm" intent="gray-outline" onClick={() => setFamilySearchDone(true)}>
                                    No
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Family search results */}
                    {familyResults && familyResults.length > 0 && (
                        <div className="p-3 border rounded-md bg-[--subtle] space-y-2">
                            <p className="text-xs font-semibold text-[--muted] uppercase tracking-wider">Related entries — pick one to match</p>
                            <div className="flex flex-wrap gap-2">
                                {familyResults.map((entry) => (
                                    <button
                                        key={entry.id}
                                        onClick={() => {
                                            const syntheticAnime: AL_BaseAnime = {
                                                id: entry.id,
                                                title: {
                                                    romaji: entry.title,
                                                    english: undefined,
                                                    native: undefined,
                                                    userPreferred: entry.title,
                                                },
                                            }
                                            setSelectedAnime(syntheticAnime)
                                            setFamilyDetailId(entry.id)
                                        }}
                                        className={cn(
                                            "text-xs px-2 py-1 rounded border transition-colors",
                                            searchQuery === entry.title
                                                ? "border-brand-500 bg-brand-900/30 text-brand-200"
                                                : "border-[--border] bg-[--highlight] hover:border-brand-500/60 text-[--muted] hover:text-white",
                                        )}
                                    >
                                        {entry.title}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2">
                    <TextInput
                        leftIcon={<BiSearch />}
                        placeholder="Search for anime..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1"
                    />
                    <Button
                        size="sm"
                        intent="primary"
                        onClick={handleManualSearch}
                        disabled={!searchQuery || searchQuery.length < 2}
                        leftIcon={<BiSearch />}
                        className="px-3"
                    >
                    </Button>
                </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <ScrollArea className="h-[400px] border rounded-md">
                            {isSearching ? (
                                <div className="flex justify-center py-10">
                                    <LoadingSpinner />
                                </div>
                            ) : searchResults?.Page?.media && searchResults.Page.media.length > 0 ? (
                                <div className="p-2 space-y-2">
                                    {searchResults.Page.media.map((anime) => (
                                        <AnimeSearchItem
                                            key={anime?.id}
                                            anime={anime as AL_BaseAnime}
                                            selected={selectedAnime?.id === anime?.id}
                                            onSelect={() => setSelectedAnime(anime as AL_BaseAnime)}
                                            libraryCollection={libraryCollection}
                                        />
                                    ))}
                                </div>
                            ) : searchQuery.length >= 2 ? (
                                <div className="flex justify-center py-10 text-[--muted]">
                                    No results found
                                </div>
                            ) : (
                                <div className="flex justify-center py-10 text-[--muted]">
                                    Type at least 2 characters to search
                                </div>
                            )}
                        </ScrollArea>

                        <div className="h-[400px] border rounded-md bg-gray-950/40 p-3 flex flex-col gap-3">
                            <p className="text-sm font-medium">Selected target</p>
                            {selectedAnime ? (
                                <SelectedAnimeDetails anime={selectedAnime} />
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-[--muted] text-sm">
                                    Choose an anime on the left to target (Season / OVA / Movie)
                                </div>
                            )}
                            {selectedAnime && (
                                <div className="mt-auto flex gap-2">
                                    <Button intent="primary" onClick={handleMatch} disabled={isMatching || selectedFiles.size === 0} loading={isMatching} leftIcon={<BiCheck />}>
                                        Match {selectedFiles.size} Files
                                    </Button>
                                    <Button intent="gray-outline" onClick={() => setSelectedAnime(null)}>
                                        Clear
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-between items-center pt-4">
                        <Button intent="gray-outline" onClick={() => setStep("select-files")}>
                            Back
                        </Button>
                        <div className="flex gap-2">
                            <Button intent="gray-outline" onClick={handleClose}>
                                Cancel
                            </Button>
                            <Button
                                intent="primary"
                                onClick={handleMatch}
                                disabled={!selectedAnime || isMatching}
                                loading={isMatching}
                                leftIcon={<BiCheck />}
                            >
                                Match {selectedFiles.size} Files
                            </Button>
                        </div>
                    </div>
                </AppLayoutStack>
            )}
        </Modal>
    )
}

function SelectedAnimeDetails({ anime }: { anime: AL_BaseAnime }) {
    const season = anime.season ? capitalize(anime.season.toLowerCase()) : null
    const year = anime.seasonYear
    const seasonYear = season && year ? `${season} ${year}` : year ? `${year}` : null
    const episodeText = anime.episodes ? `${anime.episodes} eps` : "Unknown eps"

    return (
        <div className="flex gap-3">
            {anime.coverImage?.medium && (
                <Image
                    src={anime.coverImage.medium}
                    alt={anime.title?.romaji || ""}
                    width={70}
                    height={98}
                    className="rounded object-cover flex-shrink-0"
                />
            )}
            <div className="flex-1 min-w-0 space-y-1">
                <p className="font-semibold text-sm line-clamp-1">{anime.title?.native || anime.title?.romaji}</p>
                <p className="text-xs text-[--muted] line-clamp-1">{anime.title?.romaji}</p>
                <div className="flex items-center gap-2 text-xs text-[--muted] flex-wrap">
                    {anime.format && <span className="px-2 py-0.5 rounded bg-gray-800/70 text-gray-200">{anime.format}</span>}
                    {seasonYear && <span>{seasonYear}</span>}
                    <span>•</span>
                    <span>{episodeText}</span>
                    {anime.status && <span className="uppercase tracking-wide text-[10px] text-gray-400">{anime.status.replace(/_/g, " ")}</span>}
                </div>
                {anime.genres && anime.genres.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                        {anime.genres.slice(0, 4).map((genre, idx) => (
                            <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800/50 text-gray-300">
                                {genre}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

// Recursive tree node component for folder hierarchy with XOR selection
interface TreeNodeItemProps {
    node: TreeNode
    depth: number
    expandedFolders: Set<string>
    toggleFolderExpand: (path: string) => void
    selectedFiles: Set<string>
    toggleFile: (path: string) => void
    toggleFolder: (path: string) => void
    getFolderSelectionState: (path: string) => "all" | "some" | "none"
    getFilesUnderPath: (path: string) => string[]
}

function TreeNodeItem({
    node,
    depth,
    expandedFolders,
    toggleFolderExpand,
    selectedFiles,
    toggleFile,
    toggleFolder,
    getFolderSelectionState,
    getFilesUnderPath,
}: TreeNodeItemProps) {
    const isExpanded = expandedFolders.has(node.path)

    if (node.isFolder) {
        const selectionState = getFolderSelectionState(node.path)
        const fileCount = getFilesUnderPath(node.path).length

        return (
            <div>
                <div
                    className={cn(
                        "p-2 rounded cursor-pointer hover:bg-gray-800/50",
                        selectionState === "all" && "bg-brand-900/20"
                    )}
                    style={{ paddingLeft: `${8 + depth * 16}px` }}
                >
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => toggleFolderExpand(node.path)}
                            className="p-0.5 flex-shrink-0"
                        >
                            {isExpanded ? <LuChevronDown className="w-4 h-4" /> : <LuChevronRight className="w-4 h-4" />}
                        </button>
                        <div className="flex-shrink-0" onClick={() => toggleFolder(node.path)}>
                            <Checkbox
                                value={selectionState === "all"}
                                onValueChange={() => {}}
                                containerClass="pointer-events-none"
                                fieldClass="w-auto"
                                className={cn(selectionState === "some" && "opacity-50")}
                            />
                        </div>
                        {isExpanded ? (
                            <BiFolderOpen className="text-brand-200 flex-shrink-0" onClick={() => toggleFolder(node.path)} />
                        ) : (
                            <BiFolder className="text-brand-200 flex-shrink-0" onClick={() => toggleFolder(node.path)} />
                        )}
                        <span className="text-sm text-gray-200" onClick={() => toggleFolder(node.path)}>{node.name}</span>
                        <span className="text-xs text-[--muted] ml-auto flex-shrink-0">
                            {fileCount} files
                        </span>
                    </div>
                </div>
                {isExpanded && (
                    <div>
                        {node.children.map((child) => (
                            <TreeNodeItem
                                key={child.path}
                                node={child}
                                depth={depth + 1}
                                expandedFolders={expandedFolders}
                                toggleFolderExpand={toggleFolderExpand}
                                selectedFiles={selectedFiles}
                                toggleFile={toggleFile}
                                toggleFolder={toggleFolder}
                                getFolderSelectionState={getFolderSelectionState}
                                getFilesUnderPath={getFilesUnderPath}
                            />
                        ))}
                    </div>
                )}
            </div>
        )
    }

    // File node
    const isSelected = node.file ? selectedFiles.has(node.file.relativePath) : false

    return (
        <div
            className={cn(
                "p-2 rounded cursor-pointer hover:bg-gray-800/50",
                isSelected && "bg-brand-900/20"
            )}
            style={{ paddingLeft: `${8 + depth * 16}px` }}
            onClick={() => node.file && toggleFile(node.file.relativePath)}
        >
            <div className="flex items-start gap-2">
                <div className="flex-shrink-0">
                    <Checkbox
                        value={isSelected}
                        onValueChange={() => {}}
                        containerClass="pointer-events-none"
                        fieldClass="w-auto"
                    />
                </div>
                <BiFile className="text-gray-400 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-200">{node.name}</span>
            </div>
        </div>
    )
}

function AnimeSearchItem({ anime, selected, onSelect, libraryCollection }: { 
    anime: AL_BaseAnime; 
    selected: boolean; 
    onSelect: () => void; 
    libraryCollection?: any 
}) {
    const season = anime.season ? capitalize(anime.season.toLowerCase()) : null
    const year = anime.seasonYear
    const seasonYear = season && year ? `${season} ${year}` : year ? `${year}` : null
    const format = anime.format
    
    const isInLibrary = anime?.id ? isAnimeInLibrary(anime.id, libraryCollection) : false
    
    const getStatusColor = (status?: string) => {
        switch (status) {
            case "FINISHED":
                return "text-green-400"
            case "RELEASING":
                return "text-blue-400"
            case "NOT_YET_RELEASED":
                return "text-yellow-400"
            case "CANCELLED":
                return "text-red-400"
            default:
                return "text-gray-400"
        }
    }
    
    return (
        <div
            className={cn(
                "flex items-center gap-3 p-2 rounded hover:bg-gray-800/50 transition-colors",
                selected && "bg-brand-900/30 border border-brand-500"
            )}
        >
            {anime.coverImage?.medium && (
                <Image
                    src={anime.coverImage.medium}
                    alt={anime.title?.romaji || ""}
                    width={50}
                    height={70}
                    className="rounded object-cover flex-shrink-0"
                />
            )}
            <div className="flex-1 min-w-0 space-y-1">
                <p className="font-medium text-sm line-clamp-1">
                    {anime.title?.native || anime.title?.romaji}
                </p>
                <p className="text-xs text-[--muted] line-clamp-1">
                    {anime.title?.romaji}
                </p>

                {/* Season/Year and Status */}
                <div className="flex items-center gap-2 flex-wrap">
                    {format && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-gray-800/70 text-gray-200 font-semibold uppercase tracking-wide">
                            {format}
                        </span>
                    )}
                    {seasonYear && (
                        <span className="text-xs text-[--muted]">{seasonYear}</span>
                    )}
                    {anime.status && (
                        <span className={cn("text-xs font-medium", getStatusColor(anime.status))}>
                            {anime.status.replace(/_/g, " ")}
                        </span>
                    )}
                </div>
                
                {/* Format, Episodes, Score */}
                <div className="flex items-center gap-2 flex-wrap text-xs text-[--muted]">
                    <span>{anime.episodes ? `${anime.episodes} eps` : "Unknown eps"}</span>
                    {anime.meanScore && (
                        <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                                <BiSolidStar className="text-yellow-500" />
                                {anime.meanScore}%
                            </span>
                        </>
                    )}
                </div>
                
                {/* Genres */}
                {anime.genres && anime.genres.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                        {anime.genres.slice(0, 3).map((genre, idx) => (
                            <span
                                key={idx}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800/50 text-gray-300"
                            >
                                {genre}
                            </span>
                        ))}
                    </div>
                )}
            </div>
            <div className="flex flex-col items-end gap-2">
                <Button 
                    size="xs" 
                    intent={isInLibrary ? "gray-outline" : (selected ? "primary" : "gray")} 
                    onClick={onSelect} 
                    leftIcon={selected ? <BiCheck /> : undefined}
                    disabled={isInLibrary}
                    className={isInLibrary ? "opacity-50 cursor-not-allowed" : ""}
                >
                    {isInLibrary ? "In Library" : (selected ? "Using" : "Use")}
                </Button>
            </div>
        </div>
    )
}
