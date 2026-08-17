"use client"

import {
    UnmatchedTorrent,
    UnmatchedFile,
    CountMismatch,
    MatchConflict,
    useMatchUnmatchedTorrent,
    useGetUnmatchedTorrentContents,
} from "@/api/hooks/unmatched.hooks"
import { UnmatchedFamilyResult } from "./unmatched-family-result"
import { UnmatchedConflictModal } from "./unmatched-conflict-modal"
import { UnmatchedCountMismatchModal } from "./unmatched-count-mismatch-modal"
import { useAnilistListAnime, useGetAnilistAnimeDetails } from "@/api/hooks/anilist.hooks"
import { useGetLibraryCollection } from "@/api/hooks/anime_collection.hooks"
import { useGetLocalFiles } from "@/api/hooks/localfiles.hooks"
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
import React, { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAtom } from "jotai/react"
import { atomWithStorage } from "jotai/utils"
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

/**
 * The series that was matched to most recently. Used to pre-fill the anime search box the next
 * time the picker opens with nothing already matched, so working through a run of downloads from
 * the same show doesn't mean retyping its title every single time.
 * Persisted so it survives a reload.
 */
export const __unmatched_lastMatchedTitleAtom = atomWithStorage<string>(
    "sea-unmatched-last-matched-title",
    "",
    undefined,
    { getOnInit: true }, // read synchronously, so the first picker opened after a reload is seeded too
)

// Every title an AniList entry is known by, lowercased — used to decide whether a search result
// is the series we're prioritising.
function animeTitleVariants(anime: AL_BaseAnime & { synonyms?: string[] } | null | undefined): string[] {
    if (!anime) return []
    return [
        anime.title?.romaji,
        anime.title?.english,
        anime.title?.native,
        anime.title?.userPreferred,
        ...(anime.synonyms ?? []),
    ].filter(Boolean).map(t => String(t).toLowerCase())
}

// Ranks a search result against the prioritised title: 0 = exact title, 1 = title contains it,
// 2 = everything else. Used to float the series we pre-filled the search with to the top.
function priorityRank(anime: AL_BaseAnime & { synonyms?: string[] } | null | undefined, priorityTitle: string): number {
    const q = priorityTitle.trim().toLowerCase()
    if (!q) return 2
    const variants = animeTitleVariants(anime)
    if (variants.some(t => t === q)) return 0
    if (variants.some(t => t.includes(q))) return 1
    return 2
}

// Safely extract a title string from AniList details, handling generated type shapes
function getAniListTitle(details: AL_AnimeDetailsById_Media | null | undefined): string | null {
    const media: any = details as any
    const title = media?.title || media?.Media?.title || null
    if (!title) return null
    return title.romaji || title.english || title.native || title.userPreferred || null
}

// Extract episode number from filename using common patterns
function extractEpisodeNumber(filename: string): number | null {
    // Common patterns: E01, EP01, Episode 01, - 01, [01], S01E01, etc.
    const patterns = [
        /[Ee][Pp]?(\d{1,3})/,           // E01, EP01, e01, ep01
        /[Ee]pisode\s*(\d{1,3})/i,      // Episode 01, episode 1
        /-\s*(\d{1,3})\s*\./,           // - 01., - 1.
        /\[(\d{1,3})\]/,                // [01], [1]
        /\s(\d{1,3})\s*\./,             //  01.,  1.
        /S\d{1,2}[Ee](\d{1,3})/,        // S01E01, s1e1
        /\s(\d{2,3})\s*-\s*\d{1,2}/,    //  01 - 02 (multi-episode)
    ]
    
    for (const pattern of patterns) {
        const match = filename.match(pattern)
        if (match) {
            const num = parseInt(match[1], 10)
            if (num > 0 && num < 1000) return num
        }
    }
    return null
}

// Check if anime already has local files matched to it
function isAnimeInLibrary(animeId: number, localFiles: any[] | undefined): boolean {
    if (!localFiles?.length) return false
    return localFiles.some(f => f.mediaId === animeId)
}

export function UnmatchedMatchModal({ torrent, onClose, onSuccess }: UnmatchedMatchModalProps) {
    const queryClient = useQueryClient()
    const { data: libraryCollection } = useGetLibraryCollection()
    const { data: localFiles } = useGetLocalFiles()
    const [step, setStep] = useState<"select-files" | "select-anime">("select-files")
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
    // The one thing this modal is deciding: which anime the selected files are being matched to.
    //
    // Held as a target with the reason it was set, and written through exactly one function. It used
    // to be a bare piece of state with five setters and two async fetches racing to fill it, and the
    // bug that produced was not cosmetic: a details response arriving late for an entry you had
    // already moved on from replaced your pick wholesale, so the confirmation named a series nobody
    // chose and the match would have moved files into it.
    //
    // "picked" means a person clicked it. "stored" means it was inferred from what the download was
    // queued as. A guess never overwrites a choice — that rule is the whole model, and it lives in
    // selectTarget rather than being re-derived at each call site.
    const [target, setTarget] = useState<{ anime: AL_BaseAnime, source: "picked" | "stored" } | null>(null)
    const selectedAnime = target?.anime ?? null

    const selectTarget = useCallback((anime: AL_BaseAnime | null, source: "picked" | "stored" = "picked") => {
        setTarget(prev => {
            if (!anime) return null
            if (source === "stored" && prev?.source === "picked") return prev
            return { anime, source }
        })
    }, [])
    const [searchQuery, setSearchQuery] = useState("")
    const [searchInputValue, setSearchInputValue] = useState("")
    const [hasSearched, setHasSearched] = useState(false)
    const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(new Set())
    const [torrentContents, setTorrentContents] = useState<UnmatchedTorrent | null>(null)
    const [isLoadingContents, setIsLoadingContents] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [fetchedName, setFetchedName] = useState<string | null>(null)
    // Index-based numbering is the default: release filenames lie about episode numbers far more
    // often than the sorted order does. The confirmation prompt spells out what it will do before
    // anything is moved, so defaulting it on doesn't renumber a library behind the user's back.
    const [dependOnIndex, setDependOnIndex] = useState(true)
    const [episodeOffset, setEpisodeOffset] = useState(1)

    // Title carried over from the previous match, used to pre-fill (and pre-run) the search.
    const [lastMatchedTitle, setLastMatchedTitle] = useAtom(__unmatched_lastMatchedTitleAtom)
    // The title the search box was seeded with — its results are floated to the top.
    const [priorityTitle, setPriorityTitle] = useState("")
    // Torrent the search box has already been seeded for, so we never overwrite typing.
    const [seededForTorrent, setSeededForTorrent] = useState<string | null>(null)

    const { mutate: fetchTorrentContents } = useGetUnmatchedTorrentContents(torrent?.name || null)

    // Fetch anime details if we have stored animeId
    const storedAnimeId = torrentContents?.animeId || torrent?.animeId

    // No family walk runs from the modal any more.
    //
    // It used to start one the moment this step opened — every entry of the franchise, one AniList
    // request each, before anybody had asked for a franchise. Each search result now owns its own
    // walk and starts it only when that result is expanded, so opening the picker costs nothing.
    // See UnmatchedFamilyResult and useFamilyWalk.
    const storedAnimeTitleRomaji = torrentContents?.animeTitleRomaji || torrent?.animeTitleRomaji
    const storedAnimeTitleNative = torrentContents?.animeTitleNative || torrent?.animeTitleNative
    const storedAnimeExpectedEpisodes = torrentContents?.animeExpectedEpisodes || torrent?.animeExpectedEpisodes
    const storedAnimeStartYear = torrentContents?.animeStartYear || torrent?.animeStartYear
    
    const { data: storedAnimeDetails, isLoading: isLoadingStoredAnime } = useGetAnilistAnimeDetails(
        storedAnimeId && target?.source !== "picked" ? storedAnimeId : null
    )

    // What the download was already believed to be, offered as a starting point.
    //
    // Only ever "stored": if you have picked something, this cannot displace it, however late it
    // arrives. That is the guarantee the old version could not make.
    useEffect(() => {
        if (target?.source === "picked") return

        if (storedAnimeDetails) {
            selectTarget(storedAnimeDetails as AL_BaseAnime, "stored")
            return
        }
        // The details fetch has not landed (or failed) but the record names the anime — enough to
        // show a target rather than an empty panel.
        if (storedAnimeId && storedAnimeTitleRomaji && !isLoadingStoredAnime) {
            selectTarget({
                id: storedAnimeId,
                title: {
                    romaji: storedAnimeTitleRomaji,
                    native: storedAnimeTitleNative || undefined,
                    english: undefined,
                    userPreferred: storedAnimeTitleRomaji,
                },
            } as AL_BaseAnime, "stored")
        }
    }, [storedAnimeDetails, storedAnimeId, storedAnimeTitleRomaji, storedAnimeTitleNative, isLoadingStoredAnime, target?.source, selectTarget])

    // Fetch torrent contents when modal opens
    useEffect(() => {
        if (torrent?.name && torrent.name !== fetchedName) {
            setIsLoadingContents(true)
            setLoadError(null)
            setFetchedName(torrent.name)
            // Reset selection when switching to a different torrent
            selectTarget(null)
            setSearchQuery("")
            setSearchInputValue("")
            setHasSearched(false)
            // Let the search box be seeded again for this torrent.
            setSeededForTorrent(null)
            setPriorityTitle("")
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
        selectTarget(null)
    }, [torrent?.name])

    const { mutate: matchTorrent, isPending: isMatching } = useMatchUnmatchedTorrent(() => {
        setConflict(null)
        onSuccess()
        // Reset selection to avoid carrying the previous anime into subsequent matches in the same modal session
        selectTarget(null)
        setSearchQuery("")
        setSearchInputValue("")
        setHasSearched(false)
        setSeededForTorrent(null)
        setPriorityTitle("")
        setDependOnIndex(true)
        setEpisodeOffset(1)
        // Keep the files list but drop selections after a match
        setSelectedFiles(new Set())
    }, (c) => setConflict(c), (m) => setCountMismatch(m))


    // Search only triggers when user hits Enter or clicks Search button
    // A hundred results, fetched as two pages.
    //
    // Fifty is AniList's own ceiling for a single page, so a hundred is two requests rather than a
    // bigger one. It used to ask for twenty with no paging and no "load more", which for a franchise
    // search is the case where the twenty-first result is the one being looked for and there was no
    // way to reach it at all.
    const searchEnabled = hasSearched && !!searchQuery && searchQuery.length >= 2
    const { data: searchResults, isLoading: isSearching, refetch: refetchSearch } = useAnilistListAnime({
        search: searchQuery,
        page: 1,
        perPage: 50,
    }, searchEnabled)
    // The second page is its own request and its own loading state on purpose: the first fifty are
    // shown the moment they land rather than waiting for both.
    const { data: searchResultsPage2 } = useAnilistListAnime({
        search: searchQuery,
        page: 2,
        perPage: 50,
    }, searchEnabled)

    const resetState = useCallback(() => {
        setStep("select-files")
        setConflict(null)
        setSelectedFiles(new Set())
        selectTarget(null)
        setSearchQuery("")
        setSearchInputValue("")
        setHasSearched(false)
        setExpandedSeasons(new Set())
        setTorrentContents(null)
        setFetchedName(null)
        setPriorityTitle("")
        setSeededForTorrent(null)
        setDependOnIndex(true)
        setEpisodeOffset(1)
    }, [])

    const runSearch = useCallback((term: string) => {
        const q = term.trim()
        if (q.length < 2) return
        setSearchInputValue(term)
        setSearchQuery(q)
        setHasSearched(true)
        // Reset family search when doing new search
        // Trigger refetch
        setTimeout(() => refetchSearch(), 0)
    }, [refetchSearch])

    const handleSearch = useCallback(() => {
        // A hand-typed search replaces the seeded one, so stop floating the seeded title.
        setPriorityTitle("")
        runSearch(searchInputValue)
    }, [searchInputValue, runSearch])

    // Seed the anime search as soon as the picker opens: with the title this torrent is already
    // matched to if it has one, otherwise with the series matched most recently. The request goes
    // out immediately so the seeded series is on screen (and ranked first) without another click.
    useEffect(() => {
        if (step !== "select-anime") return
        if (!torrent?.name || seededForTorrent === torrent.name) return
        if (searchInputValue) return

        const seed = (storedAnimeTitleRomaji || "").trim() || lastMatchedTitle.trim()
        setSeededForTorrent(torrent.name)
        if (seed.length < 2) return
        setPriorityTitle(seed)
        runSearch(seed)
    }, [step, torrent?.name, seededForTorrent, searchInputValue, storedAnimeTitleRomaji, lastMatchedTitle, runSearch])

    const handleSearchInputKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleSearch()
        }
    }, [handleSearch])

    const handleClose = useCallback(() => {
        resetState()
        onClose()
    }, [onClose, resetState])

    // Selecting from search is the same act as selecting from a family row, so it is the same call.
    // There is nothing else to keep in step: each result walks its own family on demand.
    const handleSelectSearchAnime = useCallback((anime: AL_BaseAnime) => {
        selectTarget(anime, "picked")
    }, [selectTarget])

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
            setSelectedFiles(new Set(torrentContents.files.filter(f => f.isVideo).map(f => f.relativePath)))
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

    const [confirmPlan, setConfirmPlan] = useState(false)

    // Set when the server refused to overwrite library files already sitting at the destinations.
    // Nothing moved, so the modal stays open behind the conflict dialog and the match can still be
    // completed (replacing) or abandoned (deleting this torrent).
    const [conflict, setConflict] = useState<MatchConflict | null>(null)

    // Set when the episode count did not match exactly. Nothing moved; the plan the server was
    // about to carry out comes back with it, and is shown so the numbering can be checked before
    // any of it happens.
    const [countMismatch, setCountMismatch] = useState<CountMismatch | null>(null)

    // The titles the match is sent with — also what the destination folder is named.
    const matchTitles = useMemo(() => {
        const titleJp = selectedAnime?.title?.native || selectedAnime?.title?.romaji || selectedAnime?.title?.english || ""
        // Fallback to torrent metadata titles if anime title is empty
        const titleClean = selectedAnime?.title?.romaji
            || selectedAnime?.title?.english
            || selectedAnime?.title?.native
            || torrentContents?.animeTitleRomaji
            || torrent?.animeTitleRomaji
            || torrent?.name
            || ""
        return { titleJp, titleClean }
    }, [selectedAnime, torrentContents, torrent])

    // Exactly what the server will do with the current selection, worked out client-side so the
    // confirmation prompt can show it. Mirrors internal/unmatched/repository.go: only video files
    // are moved, sorted by season then filename, and numbered from there.
    const matchPlan = useMemo(() => {
        const all = (torrentContents?.files ?? []).filter(f => selectedFiles.has(f.relativePath))
        const videos = all.filter(f => f.isVideo)
        const sorted = [...videos].sort((a, b) => {
            const sa = a.seasonNumber || 0
            const sb = b.seasonNumber || 0
            if (sa !== sb) return sa - sb
            return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
        })

        // Season stacking offsets, the way the server computes them for name-based numbering.
        const counts = new Map<number, number>()
        for (const f of sorted) {
            const s = f.seasonNumber || 0
            if (s > 0) counts.set(s, (counts.get(s) ?? 0) + 1)
        }
        const seasonOffsets = new Map<number, number>()
        let cumulative = 0
        for (const s of [...counts.keys()].sort((a, b) => a - b)) {
            seasonOffsets.set(s, cumulative)
            cumulative += counts.get(s)!
        }

        const offset = episodeOffset > 0 ? episodeOffset : 1
        const entries = sorted.map((file, i) => {
            const parsed = extractEpisodeNumber(file.name)
            let episode: number
            if (dependOnIndex) {
                episode = i + offset
            } else {
                const season = file.seasonNumber || 0
                if (season > 0 && parsed) {
                    episode = (seasonOffsets.get(season) ?? 0) + parsed
                } else {
                    episode = parsed ?? i + 1
                }
            }
            return { file, episode, parsed }
        })

        return {
            entries,
            // Selected files that aren't video — the server skips these, they stay where they are.
            skippedNonVideo: all.length - videos.length,
            // Files whose filename says one episode number and the plan says another.
            renumbered: entries.filter(e => e.parsed !== null && e.parsed !== e.episode).length,
            lastEpisode: entries.length ? entries[entries.length - 1].episode : 0,
        }
    }, [torrentContents, selectedFiles, dependOnIndex, episodeOffset])

    // overwriteExisting is the answer coming back from the conflict dialog: the first attempt always
    // goes without it, so the server gets the chance to stop and ask before replacing anything.
    const doMatch = useCallback((overwriteExisting: boolean = false, confirmCountMismatch: boolean = false) => {
        if (!torrent || !selectedAnime || selectedFiles.size === 0) return

        const { titleJp, titleClean } = matchTitles

        // Remember what we matched to so the next torrent's picker opens on this series.
        if (titleClean) setLastMatchedTitle(titleClean)

        matchTorrent({
            torrentName: torrent.name,
            selectedFiles: Array.from(selectedFiles),
            animeId: selectedAnime.id,
            animeTitleJp: titleJp,
            animeTitleClean: titleClean,
            useIndexBasedEpisodes: dependOnIndex,
            episodeOffset: dependOnIndex ? (episodeOffset > 0 ? episodeOffset : 1) : undefined,
            overwriteExisting: overwriteExisting || undefined,
            confirmCountMismatch: confirmCountMismatch || undefined,
        })
    }, [torrent, selectedAnime, selectedFiles, matchTorrent, matchTitles, dependOnIndex, episodeOffset, setLastMatchedTitle])

    // Never match straight from the button — moving and renaming files can't be undone from here,
    // so the plan gets laid out for confirmation first.
    const handleMatch = useCallback(() => {
        if (!torrent || !selectedAnime || selectedFiles.size === 0) return
        setConfirmPlan(true)
    }, [torrent, selectedAnime, selectedFiles])

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

    // Get only video file paths under a folder path (for episode counting and selection)
    const getVideoFilesUnderPath = useCallback((path: string): string[] => {
        if (!torrentContents?.files) return []
        const prefix = path ? path + "/" : ""
        return torrentContents.files
            .filter(f => f.isVideo && (f.relativePath.startsWith(prefix) || f.relativePath === path))
            .map(f => f.relativePath)
    }, [torrentContents])

    // Toggle folder selection (XOR operation — video files only)
    const toggleFolder = useCallback((folderPath: string) => {
        const videoFiles = getVideoFilesUnderPath(folderPath)
        setSelectedFiles(prev => {
            const next = new Set(prev)
            const allSelected = videoFiles.every(f => next.has(f))
            if (allSelected) {
                videoFiles.forEach(f => next.delete(f))
            } else {
                videoFiles.forEach(f => next.add(f))
            }
            return next
        })
    }, [getVideoFilesUnderPath])

    // Check folder selection state (based on video files only)
    const getFolderSelectionState = useCallback((folderPath: string): "all" | "some" | "none" => {
        const videoFiles = getVideoFilesUnderPath(folderPath)
        if (videoFiles.length === 0) return "none"
        const selectedCount = videoFiles.filter(f => selectedFiles.has(f)).length
        if (selectedCount === 0) return "none"
        if (selectedCount === videoFiles.length) return "all"
        return "some"
    }, [getVideoFilesUnderPath, selectedFiles])

    // Float the seeded series to the top of the results — that's the one the search was run for.
    const rankedSearchResults = useMemo(() => {
        // Both pages, in AniList's order, with anything that appears in both dropped — the second
        // page can overlap the first when results shift between the two requests.
        const seen = new Set<number>()
        const media = [
            ...(searchResults?.Page?.media ?? []),
            ...(searchResultsPage2?.Page?.media ?? []),
        ].filter(Boolean).filter(m => {
            const id = (m as AL_BaseAnime).id
            if (seen.has(id)) return false
            seen.add(id)
            return true
        }) as AL_BaseAnime[]

        if (!priorityTitle) return media
        return [...media].sort((a, b) => priorityRank(a, priorityTitle) - priorityRank(b, priorityTitle))
    }, [searchResults, searchResultsPage2, priorityTitle])

    if (!torrent) return null

    // Get the anime title to display
    const displayAnimeTitle = selectedAnime?.title?.romaji
        || selectedAnime?.title?.english
        || selectedAnime?.title?.native
        || torrentContents?.animeTitleRomaji
        || torrent?.animeTitleRomaji
        || null

    // Treat 0 as missing — fall back to stored metadata so we don't show "Unknown eps".
    const displayEpisodeCount = (selectedAnime?.episodes || 0) > 0
        ? selectedAnime!.episodes
        : (storedAnimeExpectedEpisodes || 0) > 0
            ? storedAnimeExpectedEpisodes
            : null

    const displayStartYear = selectedAnime?.startDate?.year
        ?? storedAnimeStartYear

    // True while the selected family member's full details are still loading —
    // used to suppress "Unknown eps" / partial metadata flicker.

    const isLoadingAnimeInfo = isLoadingStoredAnime && storedAnimeId && !selectedAnime

    return (
        <>
        {confirmPlan && selectedAnime && (
            <Modal
                open={confirmPlan}
                onOpenChange={(open) => !open && setConfirmPlan(false)}
                contentClass="max-w-2xl"
                title="Confirm this match"
            >
                <MatchPlanConfirmation
                    anime={selectedAnime}
                    animeTitle={displayAnimeTitle || torrent.name}
                    destinationFolder={matchTitles.titleClean}
                    plan={matchPlan}
                    dependOnIndex={dependOnIndex}
                    episodeOffset={episodeOffset > 0 ? episodeOffset : 1}
                    expectedEpisodes={typeof displayEpisodeCount === "number" ? displayEpisodeCount : null}
                    alreadyInLibrary={isAnimeInLibrary(selectedAnime.id, localFiles)}
                    isMatching={isMatching}
                    onCancel={() => setConfirmPlan(false)}
                    onConfirm={() => { setConfirmPlan(false); doMatch() }}
                />
            </Modal>
        )}
        {countMismatch && torrent && (
            <UnmatchedCountMismatchModal
                mismatch={countMismatch}
                torrentName={torrent.name}
                animeTitle={displayAnimeTitle || torrent.name}
                isMatching={isMatching}
                onConfirm={() => { setCountMismatch(null); doMatch(false, true) }}
                onCancel={() => setCountMismatch(null)}
            />
        )}
        {conflict && torrent && (
            <UnmatchedConflictModal
                conflict={conflict}
                torrentName={torrent.name}
                animeTitle={displayAnimeTitle || torrent.name}
                isReplacing={isMatching}
                onAccept={() => doMatch(true)}
                // Declining a conflict closes the conflict, and nothing else.
                //
                // It used to delete the whole staged torrent — every episode of it — so "I do not
                // want to overwrite what is already in my library" and "destroy this download" were
                // the same button. Those are not the same decision, and only one of them is
                // recoverable. The download stays exactly where it is, unmatched, and deleting it
                // remains its own deliberate action on the torrent card.
                onDecline={() => setConflict(null)}
                onCancel={() => setConflict(null)}
            />
        )}
        <Modal
            open={!!torrent}
            onOpenChange={(open) => !open && handleClose()}
            // As big as the screen allows and no bigger.
            //
            // The tree, the search results and the selected target are three columns of real
            // content, and 4xl gave them about a third of a modern screen — which is what forced
            // every title to be cut short. The viewport units are the guard: it grows to fill the
            // space that exists and stops there, so nothing ends up off the edge on a laptop.
            contentClass="max-w-[min(96rem,95vw)] w-[95vw] max-h-[92vh] overflow-y-auto"
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
                                    {(displayEpisodeCount || displayStartYear || selectedAnime?.format || selectedFiles.size > 0) && (
                                        <span className="text-xs text-[--muted] flex items-center gap-2">
                                            {selectedAnime?.format && (
                                                <span>{selectedAnime.format}</span>
                                            )}
                                            {typeof displayEpisodeCount === "number" && (
                                                <span>· {displayEpisodeCount} eps</span>
                                            )}
                                            {selectedFiles.size > 0 && (
                                                <span className="text-brand-300">· {selectedFiles.size} selected</span>
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
                                    selectTarget(null)
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
                                    getVideoFilesUnderPath={getVideoFilesUnderPath}
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
                    {/* The family tree lives in the results below now.
                     *
                     * There used to be a second tree here, above the search, walked automatically
                     * for whatever the download was already believed to be. Two lists meant two
                     * ways to select, and the one up here kept winning silently — which is how a
                     * confirmation dialog ended up naming a series nobody had clicked. Every
                     * result below is now its own franchise, expandable in place. */}

                    <div className="flex gap-2">
                        <TextInput
                            leftIcon={<BiSearch />}
                            placeholder="Search for anime..."
                            value={searchInputValue}
                            onChange={(e) => setSearchInputValue(e.target.value)}
                            onKeyDown={handleSearchInputKeyDown}
                            className="flex-1"
                        />
                        <Button
                            size="sm"
                            intent="primary"
                            onClick={handleSearch}
                            disabled={!searchInputValue || searchInputValue.length < 2}
                            leftIcon={<BiSearch />}
                            className="px-3"
                        >
                            Search
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <ScrollArea className="h-[400px] border rounded-md">
                            {isSearching ? (
                                <div className="flex justify-center py-10">
                                    <LoadingSpinner />
                                </div>
                            ) : rankedSearchResults.length > 0 ? (
                                <div className="p-2 space-y-2">
                                    {/* Every result is the root of its own franchise: expand one and
                                        its relations nest underneath, indented by how many relations
                                        deep they are. Root and relative select through the same
                                        callback, which is the whole point of the rewrite — the old
                                        picker had two selection paths and the wrong one kept
                                        winning. */}
                                    {rankedSearchResults.map((anime) => (
                                        <UnmatchedFamilyResult
                                            key={anime?.id}
                                            anime={anime as AL_BaseAnime}
                                            selectedId={selectedAnime?.id ?? null}
                                            isInLibrary={isAnimeInLibrary((anime as AL_BaseAnime).id, localFiles)}
                                            onSelect={(selection) => {
                                                // One path in, and it carries everything the row was
                                                // already showing. No second fetch races it, so the
                                                // target cannot be replaced by a late answer for
                                                // something else.
                                                selectTarget({
                                                    id: selection.id,
                                                    title: {
                                                        romaji: selection.title,
                                                        english: selection.englishTitle,
                                                        native: undefined,
                                                        userPreferred: selection.title,
                                                    },
                                                    episodes: selection.episodes || undefined,
                                                    format: selection.format as AL_BaseAnime["format"] || undefined,
                                                    coverImage: selection.coverImage
                                                        ? { large: selection.coverImage, extraLarge: selection.coverImage, medium: selection.coverImage }
                                                        : undefined,
                                                } as AL_BaseAnime, "picked")
                                            }}
                                        />
                                    ))}
                                </div>
                            ) : hasSearched ? (
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
                                <SelectedAnimeDetails
                                    anime={selectedAnime}
                                    fallbackEpisodes={storedAnimeExpectedEpisodes || undefined}
                                />
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
                                    <Button intent="gray-outline" onClick={() => selectTarget(null)}>
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
        </>
    )
}

// ─── Match confirmation ──────────────────────────────────────────────

interface MatchPlanEntry {
    file: UnmatchedFile
    episode: number
    parsed: number | null
}

interface MatchPlan {
    entries: MatchPlanEntry[]
    skippedNonVideo: number
    renumbered: number
    lastEpisode: number
}

/**
 * Lays out everything the match is about to do — where the files go, what they get renamed to,
 * which episode number each one lands on, and anything that looks off — before a single file is
 * touched. Matching moves and renames files on disk (and deletes creditless extras), none of which
 * this screen can undo, so it's spelled out rather than summarised.
 */
function MatchPlanConfirmation({
    anime,
    animeTitle,
    destinationFolder,
    plan,
    dependOnIndex,
    episodeOffset,
    expectedEpisodes,
    alreadyInLibrary,
    isMatching,
    onCancel,
    onConfirm,
}: {
    anime: AL_BaseAnime
    animeTitle: string
    destinationFolder: string
    plan: MatchPlan
    dependOnIndex: boolean
    episodeOffset: number
    expectedEpisodes: number | null
    alreadyInLibrary: boolean
    isMatching: boolean
    onCancel: () => void
    onConfirm: () => void
}) {
    const count = plan.entries.length
    const isMovie = (anime.format || "").toUpperCase() === "MOVIE"

    const warnings: string[] = []
    if (alreadyInLibrary) {
        warnings.push(`${animeTitle} already has files in your library. These files are added alongside them, and any that land on an episode number you already have will sit next to it as a duplicate.`)
    }
    if (isMovie && count > 1) {
        warnings.push(`This entry is a movie, so every file is renamed to "${destinationFolder}" — matching ${count} files at once means they overwrite each other. Match one file, or pick the TV entry instead.`)
    }
    if (dependOnIndex && plan.renumbered > 0) {
        warnings.push(`${plan.renumbered} of ${count} file${count === 1 ? "" : "s"} will be given an episode number that differs from the one in its filename. Check the list above — if the filenames are right, turn "Depend on index" off.`)
    }
    if (!dependOnIndex && plan.renumbered > 0) {
        warnings.push(`${plan.renumbered} file${plan.renumbered === 1 ? "" : "s"} had no usable episode number in the filename and fall back to their position in the list.`)
    }
    if (expectedEpisodes && plan.lastEpisode > expectedEpisodes) {
        warnings.push(`Numbering runs up to episode ${plan.lastEpisode}, but AniList lists ${expectedEpisodes} episode${expectedEpisodes === 1 ? "" : "s"} for this entry. Anything past ${expectedEpisodes} won't have metadata.`)
    }
    if (expectedEpisodes && count > 0 && count < expectedEpisodes) {
        warnings.push(`You're matching ${count} of ${expectedEpisodes} episodes. The rest stay in the Unmatched folder.`)
    }
    if (plan.skippedNonVideo > 0) {
        warnings.push(`${plan.skippedNonVideo} selected file${plan.skippedNonVideo === 1 ? " isn't a video and is" : "s aren't videos and are"} left in the Unmatched folder.`)
    }

    return (
        <div className="space-y-4 py-2">
            {/* What happens, in one line */}
            <p className="text-sm">
                <span className="font-semibold">{count}</span> file{count === 1 ? "" : "s"} will be{" "}
                <span className="font-semibold">moved</span> out of the Unmatched folder into your library under{" "}
                <span className="font-semibold text-brand-200">{destinationFolder}</span>, renamed, and matched to{" "}
                <span className="font-semibold text-brand-200">{animeTitle}</span>
                {anime.format ? ` (${anime.format}${expectedEpisodes ? `, ${expectedEpisodes} eps` : ""})` : ""}.
            </p>

            {/* How the episode numbers are decided */}
            <div className="p-3 border rounded-md bg-[--subtle] space-y-1">
                <p className="text-sm font-medium">
                    {dependOnIndex ? "Episode numbers come from the file order" : "Episode numbers come from the filenames"}
                </p>
                <p className="text-xs text-[--muted]">
                    {dependOnIndex
                        ? `"Depend on index" is ON. The files are sorted by season and filename, then numbered in that order starting at episode ${episodeOffset} — whatever numbers the filenames contain are ignored. Use this when the release numbers episodes oddly (per-season resets, absolute numbering, batch offsets).`
                        : `"Depend on index" is OFF. Each episode number is read out of its filename, with season folders stacked on top of one another. Files with no readable number fall back to their position in the list. Use this when the filenames are trustworthy.`}
                </p>
            </div>

            {/* Exact per-file result */}
            {count > 0 ? (
                <div className="border rounded-md overflow-hidden">
                    <div className="px-3 py-2 border-b bg-gray-950/40 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[--muted]">File → episode</p>
                        <p className="text-xs text-[--muted]">
                            {isMovie ? "Movie naming" : `Episodes ${plan.entries[0].episode}–${plan.lastEpisode}`}
                        </p>
                    </div>
                    <div className="max-h-[220px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                        <div className="divide-y divide-gray-800/60">
                            {plan.entries.map(entry => {
                                const differs = entry.parsed !== null && entry.parsed !== entry.episode
                                return (
                                    <div key={entry.file.relativePath} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                                        <span className="flex-1 min-w-0 truncate text-gray-300" title={entry.file.relativePath}>
                                            {entry.file.name}
                                        </span>
                                        {differs && (
                                            <span className="flex-shrink-0 text-[10px] text-amber-400" title={`Filename says episode ${entry.parsed}`}>
                                                was ep {entry.parsed}
                                            </span>
                                        )}
                                        <span className={cn("flex-shrink-0 font-medium", differs ? "text-amber-300" : "text-brand-300")}>
                                            {isMovie ? "Movie" : `Ep ${entry.episode}`}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            ) : (
                <Alert
                    intent="alert"
                    title="Nothing to match"
                    description="None of the selected files are video files, so there's nothing to move."
                    className="border border-red-500/30 bg-red-900/20"
                />
            )}

            {/* Renaming and deletion — the parts that aren't reversible from here */}
            <div className="text-xs text-[--muted] space-y-1">
                <p>
                    Files are renamed to{" "}
                    <span className="text-gray-300">
                        {isMovie ? `${destinationFolder} (year).ext` : `${destinationFolder} - Episode 001 - <episode title>.ext`}
                    </span>.
                </p>
                <p>Creditless openings/endings and anything inside an "Extra" folder are <span className="text-gray-300">deleted</span>, not moved.</p>
                <p>Moving and renaming can't be undone from here — files would have to be moved back by hand.</p>
            </div>

            {warnings.length > 0 && (
                <div className="space-y-2">
                    {warnings.map((w, i) => (
                        <Alert
                            key={i}
                            intent="warning"
                            description={w}
                            className="border border-amber-500/30 bg-amber-900/10 text-xs"
                        />
                    ))}
                </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
                <Button intent="gray-outline" onClick={onCancel} disabled={isMatching}>
                    Cancel
                </Button>
                <Button
                    intent={warnings.length > 0 ? "warning" : "primary"}
                    onClick={onConfirm}
                    disabled={count === 0 || isMatching}
                    loading={isMatching}
                    leftIcon={<BiCheck />}
                >
                    Move &amp; match {count} file{count === 1 ? "" : "s"}
                </Button>
            </div>
        </div>
    )
}

function SelectedAnimeDetails({
    anime,
    fallbackEpisodes,
    isEnriching,
}: {
    anime: AL_BaseAnime
    fallbackEpisodes?: number
    isEnriching?: boolean
}) {
    const season = anime.season ? capitalize(anime.season.toLowerCase()) : null
    const year = anime.seasonYear
    const seasonYear = season && year ? `${season} ${year}` : year ? `${year}` : null
    // Episode count priority: live anime.episodes → fallback (stored metadata) → "Loading…" while
    // family details are still loading → "Unknown eps" only as last resort.
    const effectiveEpisodes = (anime.episodes && anime.episodes > 0)
        ? anime.episodes
        : (fallbackEpisodes && fallbackEpisodes > 0 ? fallbackEpisodes : null)
    const episodeText = effectiveEpisodes
        ? `${effectiveEpisodes} eps`
        : (isEnriching ? "Loading…" : "Unknown eps")

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
    getVideoFilesUnderPath: (path: string) => string[]
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
    getVideoFilesUnderPath,
}: TreeNodeItemProps) {
    const isExpanded = expandedFolders.has(node.path)

    if (node.isFolder) {
        const selectionState = getFolderSelectionState(node.path)
        // Count only the episodes — i.e. what the folder checkbox actually selects. Counting
        // every file made a folder look like it held far more episodes than it does.
        const fileCount = getVideoFilesUnderPath(node.path).length

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
                            {fileCount} {fileCount === 1 ? "episode" : "episodes"}
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
                                getVideoFilesUnderPath={getVideoFilesUnderPath}
                            />
                        ))}
                    </div>
                )}
            </div>
        )
    }

    // File node
    const isSelected = node.file ? selectedFiles.has(node.file.relativePath) : false
    const episodeNum = extractEpisodeNumber(node.name)

    return (
        <div
            className={cn(
                "p-2 rounded cursor-pointer hover:bg-gray-800/50",
                isSelected && "bg-brand-900/20"
            )}
            style={{ paddingLeft: `${8 + depth * 16}px` }}
            onClick={() => node.file && toggleFile(node.file.relativePath)}
        >
            <div className="flex items-center gap-2">
                <div className="flex-shrink-0">
                    <Checkbox
                        value={isSelected}
                        onValueChange={() => {}}
                        containerClass="pointer-events-none"
                        fieldClass="w-auto"
                    />
                </div>
                <BiFile className="text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-200 flex-1 min-w-0 truncate">{node.name}</span>
                {episodeNum !== null && (
                    <span className="text-xs text-brand-300 flex-shrink-0 ml-2">
                        Ep {episodeNum}
                    </span>
                )}
            </div>
        </div>
    )
}

// The old flat search row and the first-generation family tree used to live below this line.
//
// They are gone rather than left for reference: between them they were the second way to select a
// target, and a second way to select is what let a stale answer win over somebody's actual choice.
// Their replacement is UnmatchedFamilyResult — one row type, one selection path, families nested
// under the result they belong to.
