"use client"

import { formatNumber, formatCount } from "@/lib/helpers/number"

import {
    UnmatchedTorrent,
    UnmatchedFile,
    useEnqueueUnmatchedMatch,
    useGetUnmatchedTorrentContents,
} from "@/api/hooks/unmatched.hooks"
import { UnmatchedFamilyResult } from "./unmatched-family-result"
import { extractEpisodeNumber } from "../_lib/unmatched-episode-number"
import { useAnilistListAnime, useGetAnilistAnimeDetails } from "@/api/hooks/anilist.hooks"
import { useGetLibraryCollection } from "@/api/hooks/anime_collection.hooks"
import { useGetLocalFiles } from "@/api/hooks/localfiles.hooks"
import { AL_BaseAnime, AL_AnimeDetailsById_Media } from "@/api/generated/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Modal } from "@/components/ui/modal"
import { NumberInput } from "@/components/ui/number-input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { TextInput } from "@/components/ui/text-input"
import { Alert } from "@/components/ui/alert/alert"
import React, { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { useAtom } from "jotai/react"
import { atomWithStorage } from "jotai/utils"
import { toast } from "sonner"
import { BiCheck, BiFolder, BiFile, BiSearch, BiFolderOpen, BiSolidStar } from "react-icons/bi"
import { LuChevronDown, LuChevronLeft, LuChevronRight } from "react-icons/lu"
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
    /** Called once the match has been queued — the screen is free from that moment on. */
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

const FILENAME_TITLE_STOP_WORDS = new Set(["a", "an", "and", "at", "by", "for", "from", "in", "is", "of", "on", "or", "the", "to", "with"])

function filenameRelevancePercent(anime: AL_BaseAnime & { synonyms?: string[] }, fileName: string): number {
    if (!fileName.trim()) return 0

    const fileText = fileName.normalize("NFKC").toLowerCase()
    const titleWordPattern = /[\p{L}\p{N}]+/gu
    let bestScore = 0

    for (const variant of animeTitleVariants(anime)) {
        const words = variant.normalize("NFKC").match(titleWordPattern) ?? []
        const meaningfulWords = words.filter(word => !FILENAME_TITLE_STOP_WORDS.has(word))
        const scoreWords = meaningfulWords.some(word => !/^\d+$/u.test(word))
            ? meaningfulWords.filter(word => !/^\d+$/u.test(word))
            : meaningfulWords
        if (scoreWords.length === 0) continue

        const matchedWords = scoreWords.filter(word => {
            const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            const wordPattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "iu")
            return wordPattern.test(fileText)
        }).length

        bestScore = Math.max(bestScore, Math.round((matchedWords / scoreWords.length) * 100))
    }

    return bestScore
}

// Safely extract a title string from AniList details, handling generated type shapes
function getAniListTitle(details: AL_AnimeDetailsById_Media | null | undefined): string | null {
    const media: any = details as any
    const title = media?.title || media?.Media?.title || null
    if (!title) return null
    return title.romaji || title.english || title.native || title.userPreferred || null
}

// +-------------------------------------+
// |  Episode numbers from torrent names  |
// +-------------------------------------+
//
// Lives in ../_lib/unmatched-episode-number.ts — the TypeScript twin of extractEpisodeNumber in
// internal/unmatched/repository.go. The server renames the files, this previews the numbering, and
// both copies are pinned to the same behaviour by the fixture in
// internal/unmatched/testdata/episode_number_cases.json (`npm run test` here, `go test
// ./internal/unmatched/` there). A change there is a change here.
//
// The strategy, in order: strip everything that carries numbers but is never an episode (resolutions,
// codecs, audio channels, sources, hashes, years, season markers), then look for the episode in
// decreasing order of confidence — S01E05 and 1x05 first, then labelled forms (Episode 5, EP24, E05,
// OVA 2, #05), then the number after the last dash (the "Title - 05" shape), then a trailing number,
// and finally any standalone number left. Within a tier the last candidate wins, because a release's
// episode number sits after its title, and titles are where stray numbers live.

// Check if anime already has local files matched to it
function isAnimeInLibrary(animeId: number, localFiles: any[] | undefined): boolean {
    if (!localFiles?.length) return false
    return localFiles.some(f => f.mediaId === animeId)
}

export function UnmatchedMatchModal({ torrent, onClose, onSuccess }: UnmatchedMatchModalProps) {
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
            // Back to the start for this download. The modal can move to a different torrent
            // without closing — matching from the queue opens the next one in place — and the
            // files have to be picked again for whatever it lands on.
            setStep("select-files")
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

    // The match is queued, not performed here. The request comes back as soon as the decision has
    // been written down, which is what lets the next download be opened immediately — the server
    // works through the queued matches in the order they were made, on its own time.
    const { mutate: enqueueMatch, isPending: isMatching } = useEnqueueUnmatchedMatch(() => {
        onSuccess()
        // Reset selection to avoid carrying the previous anime into the next download's modal
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
    })


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

    // The questions a match can stop on — a destination already occupied, an episode count that
    // does not agree — are no longer asked here. The match runs in the queue, and the queue is
    // where it stops and waits for an answer; see the To Match tab. What is decided here is only
    // what to match and how to number it.

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

    // The decision is written down and the modal closes; the server carries the match out in its
    // own time, in the order the decisions were made. Nothing is moved from here, which is what
    // makes the next download immediate.
    const doMatch = useCallback(() => {
        if (!torrent || !selectedAnime || selectedFiles.size === 0) return

        const { titleJp, titleClean } = matchTitles

        // Remember what we matched to so the next torrent's picker opens on this series.
        if (titleClean) setLastMatchedTitle(titleClean)

        enqueueMatch({
            torrentName: torrent.name,
            selectedFiles: Array.from(selectedFiles),
            animeId: selectedAnime.id,
            animeTitleJp: titleJp,
            animeTitleClean: titleClean,
            useIndexBasedEpisodes: dependOnIndex,
            episodeOffset: dependOnIndex ? (episodeOffset > 0 ? episodeOffset : 1) : undefined,
            // So the queue shows the series rather than a folder icon while it waits.
            coverImage: selectedAnime.coverImage?.medium || selectedAnime.coverImage?.large || undefined,
        })
    }, [torrent, selectedAnime, selectedFiles, enqueueMatch, matchTitles, dependOnIndex, episodeOffset, setLastMatchedTitle])

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
        return [...media]
            .map((anime, index) => ({
                anime,
                index,
                filenameScore: filenameRelevancePercent(anime, torrent?.name ?? ""),
            }))
            .sort((a, b) =>
                b.filenameScore - a.filenameScore
                || priorityRank(a.anime, priorityTitle) - priorityRank(b.anime, priorityTitle)
                || a.index - b.index
            )
            .map(({ anime }) => anime)
    }, [searchResults, searchResultsPage2, priorityTitle, torrent?.name])

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

    const videoCount = (torrentContents?.files ?? []).filter(f => f.isVideo).length
    const otherCount = (torrentContents?.files?.length ?? 0) - videoCount
    const totalBytes = (torrentContents?.files ?? []).reduce((n, f) => n + (f.size || 0), 0) || torrent.size || 0
    const stepIndex = confirmPlan ? 2 : step === "select-files" ? 0 : 1

    return (
        <>
        {confirmPlan && selectedAnime && (
            <Modal
                open={confirmPlan}
                onOpenChange={(open) => !open && setConfirmPlan(false)}
                contentClass="max-w-2xl"
                title="Queue this match"
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
            {/* What is being matched, and how far along the match is */}
            <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-gradient-to-br from-white/[0.05] via-black/20 to-black/30 p-3 ring-1 ring-white/[0.07] sm:flex-row sm:items-center sm:justify-between" data-unmatched-match-header>
                <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-brand-500/15 text-brand-200 ring-1 ring-white/10">
                        <BiFolder className="size-5" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white" title={torrent.name}>{torrent.name}</p>
                        <p className="mt-0.5 text-xs text-[--muted]">
                            {torrentContents
                                ? `${formatNumber(videoCount)} video${videoCount === 1 ? "" : "s"}${otherCount ? ` · ${formatNumber(otherCount)} other` : ""}${totalBytes ? ` · ${formatBytes(totalBytes)}` : ""}`
                                : torrent.fileCount ? `${formatNumber(torrent.fileCount)} files` : "Reading the download…"}
                        </p>
                    </div>
                </div>
                <ol className="flex flex-none items-center gap-1.5" aria-label="Match steps">
                    {(["Episodes", "Anime", "Confirm"] as const).map((label, i) => (
                        <React.Fragment key={label}>
                            {i > 0 && <span className={cn("h-px w-4 sm:w-6", i <= stepIndex ? "bg-brand-400/70" : "bg-white/15")} />}
                            <li>
                                <button
                                    type="button"
                                    disabled={i === 2 || (i === 1 && selectedFiles.size === 0) || i === stepIndex}
                                    onClick={() => setStep(i === 0 ? "select-files" : "select-anime")}
                                    className={cn(
                                        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition",
                                        i === stepIndex ? "bg-white text-black ring-white"
                                            : i < stepIndex ? "bg-brand-500/15 text-brand-100 ring-brand-400/30 hover:bg-brand-500/25"
                                                : "text-white/45 ring-white/10 enabled:hover:text-white",
                                    )}
                                >
                                    <span className={cn("flex size-4 items-center justify-center rounded-full text-[10px]", i === stepIndex ? "bg-black text-white" : "bg-white/10")}>
                                        {i < stepIndex ? <BiCheck /> : i + 1}
                                    </span>
                                    {label}
                                </button>
                            </li>
                        </React.Fragment>
                    ))}
                </ol>
            </div>

            {(isLoadingContents || isLoadingAnimeInfo) ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
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
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                    {/* The download's files */}
                    <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl bg-black/25 ring-1 ring-white/[0.07]">
                        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-white">Episodes</p>
                                <p className="text-xs text-[--muted]">
                                    Select the episodes you want to match. You can select entire seasons or individual files.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                <PillButton onClick={selectAll}>Select All</PillButton>
                                <PillButton onClick={deselectAll}>Deselect All</PillButton>
                                <PillButton onClick={expandAll}>Expand all</PillButton>
                                <PillButton onClick={collapseAll}>Collapse all</PillButton>
                            </div>
                        </div>
                        <div className="h-1 bg-white/[0.04]">
                            <div className="sea-progress-fill h-full bg-gradient-to-r from-brand-500 to-brand-300 transition-[width]" style={{ width: `${videoCount ? (selectedFiles.size / videoCount) * 100 : 0}%` }} />
                        </div>
                        <ScrollArea className="h-[min(56vh,520px)] w-full">
                            <div className="w-full min-w-0 space-y-0.5 p-2">
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
                        <div className="border-t border-white/[0.06] px-3 py-2 text-xs text-[--muted]">
                            <span className="font-semibold text-white">{selectedFiles.size}</span> files selected
                            {videoCount > 0 && <> of {formatNumber(videoCount)} episodes</>}
                        </div>
                    </section>

                    {/* Where they go, and how they are numbered */}
                    <aside className="flex flex-col gap-3">
                        <div className="rounded-2xl bg-black/25 p-3 ring-1 ring-white/[0.07]">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/50">Matching to</p>
                            {(displayAnimeTitle || selectedAnime) ? (
                                <div className="flex gap-3">
                                    {selectedAnime?.coverImage?.medium ? (
                                        <Image
                                            src={selectedAnime.coverImage.medium}
                                            alt={displayAnimeTitle || ""}
                                            width={56}
                                            height={80}
                                            className="h-20 w-14 flex-none rounded-lg object-cover ring-1 ring-white/10"
                                        />
                                    ) : (
                                        <span className="flex h-20 w-14 flex-none items-center justify-center rounded-lg bg-white/5 text-white/30 ring-1 ring-white/10"><BiSolidStar /></span>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <p className="line-clamp-2 text-sm font-semibold text-brand-100">{displayAnimeTitle || torrent.name}</p>
                                        {selectedAnime?.title?.romaji && selectedAnime.title.romaji !== displayAnimeTitle && (
                                            <p className="text-xs text-[--muted] line-clamp-1">{selectedAnime.title.romaji}</p>
                                        )}
                                        {selectedAnime?.title?.english && selectedAnime.title.english !== displayAnimeTitle && (
                                            <p className="text-xs text-[--muted] line-clamp-1">{selectedAnime.title.english}</p>
                                        )}
                                        {selectedAnime?.title?.native && selectedAnime.title.native !== displayAnimeTitle && (
                                            <p className="text-xs text-[--muted] line-clamp-1">{selectedAnime.title.native}</p>
                                        )}
                                        <div className="mt-1.5 flex flex-wrap gap-1">
                                            {selectedAnime?.format && <MetaChip>{selectedAnime.format}</MetaChip>}
                                            {typeof displayEpisodeCount === "number" && <MetaChip>{displayEpisodeCount} eps</MetaChip>}
                                            {displayStartYear && <MetaChip>{displayStartYear}</MetaChip>}
                                            {selectedFiles.size > 0 && <MetaChip className="bg-brand-500/15 text-brand-100 ring-brand-400/30">{selectedFiles.size} selected</MetaChip>}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="rounded-xl border border-dashed border-white/15 px-3 py-5 text-center text-xs text-[--muted]">
                                    No anime chosen yet. Pick episodes, then choose the anime.
                                </p>
                            )}
                            <Button
                                size="sm"
                                intent="gray-outline"
                                className="mt-3 w-full"
                                onClick={() => {
                                    selectTarget(null)
                                    setStep("select-anime")
                                }}
                            >
                                {(displayAnimeTitle || selectedAnime) ? "Change" : "Choose anime"}
                            </Button>
                        </div>

                        {/* Index-based episode matching controls */}
                        <div className="rounded-2xl bg-black/25 p-3 ring-1 ring-white/[0.07]">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <p className="text-sm font-semibold text-white">Depend on index</p>
                                    <p className="text-[11px] text-[--muted]">{dependOnIndex ? "Number by file order" : "Read numbers from filenames"}</p>
                                </div>
                                <Switch
                                    value={dependOnIndex}
                                    onValueChange={setDependOnIndex}
                                />
                            </div>
                            {dependOnIndex && (
                                <div className="mt-3 flex items-center justify-between gap-2">
                                    <span className="text-sm text-[--muted]">Start at ep</span>
                                    <div className="w-24">
                                        <NumberInput
                                            value={episodeOffset}
                                            onValueChange={v => setEpisodeOffset(v > 0 ? v : 1)}
                                            formatOptions={{ useGrouping: false }}
                                        />
                                    </div>
                                </div>
                            )}
                            {matchPlan.entries.length > 0 && (
                                <div className="mt-3 space-y-1 rounded-xl bg-black/30 p-2">
                                    <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-white/40">Preview</p>
                                    {matchPlan.entries.slice(0, 5).map(entry => {
                                        const differs = entry.parsed !== null && entry.parsed !== entry.episode
                                        return (
                                            <div key={entry.file.relativePath} className="flex items-center gap-2 px-1 text-[11px]">
                                                <span className="min-w-0 flex-1 truncate text-white/55" title={entry.file.name}>{entry.file.name}</span>
                                                <LuChevronRight className="size-3 flex-none text-white/25" />
                                                <span className={cn("flex-none font-semibold tabular-nums", differs ? "text-amber-300" : "text-brand-200")}>Ep {entry.episode}</span>
                                            </div>
                                        )
                                    })}
                                    {matchPlan.entries.length > 5 && (
                                        <p className="px-1 text-[10px] text-white/35">…and {formatNumber(matchPlan.entries.length - 5)} more, up to ep {matchPlan.lastEpisode}</p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="mt-auto flex gap-2">
                            <Button intent="gray-outline" onClick={handleClose} className="flex-1">
                                Cancel
                            </Button>
                            {selectedAnime ? (
                                <Button
                                    intent="primary"
                                    onClick={handleMatch}
                                    disabled={selectedFiles.size === 0 || isMatching}
                                    loading={isMatching}
                                    leftIcon={<BiCheck />}
                                    className="flex-[2]"
                                >
                                    Match {selectedFiles.size} Files
                                </Button>
                            ) : (
                                <Button
                                    intent="primary"
                                    onClick={() => setStep("select-anime")}
                                    disabled={selectedFiles.size === 0}
                                    className="flex-[2]"
                                >
                                    Match {selectedFiles.size} Files
                                </Button>
                            )}
                        </div>
                    </aside>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* The family tree lives in the results below now.
                     *
                     * There used to be a second tree here, above the search, walked automatically
                     * for whatever the download was already believed to be. Two lists meant two
                     * ways to select, and the one up here kept winning silently — which is how a
                     * confirmation dialog ended up naming a series nobody had clicked. Every
                     * result below is now its own franchise, expandable in place. */}

                    <div className="flex gap-2 rounded-2xl bg-black/25 p-2 ring-1 ring-white/[0.07]">
                        <TextInput
                            leftIcon={<BiSearch />}
                            placeholder="Search for anime..."
                            value={searchInputValue}
                            onChange={(e) => setSearchInputValue(e.target.value)}
                            onKeyDown={handleSearchInputKeyDown}
                            className="flex-1"
                        />
                        <Button
                            intent="primary"
                            onClick={handleSearch}
                            disabled={!searchInputValue || searchInputValue.length < 2}
                            leftIcon={<BiSearch />}
                            className="px-4"
                        >
                            Search
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
                        <section className="min-w-0 overflow-hidden rounded-2xl bg-black/25 ring-1 ring-white/[0.07]">
                            <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2.5">
                                <p className="text-sm font-semibold text-white">Results</p>
                                {!isSearching && rankedSearchResults.length > 0 && (
                                    <p className="text-xs text-[--muted]">{formatNumber(rankedSearchResults.length)} for “{searchQuery}” · expand one to see its seasons and movies</p>
                                )}
                            </div>
                            <ScrollArea className="h-[min(56vh,520px)]">
                                {isSearching ? (
                                    <div className="flex justify-center py-16">
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
                                    <div className="flex flex-col items-center gap-2 py-16 text-[--muted]">
                                        <BiSearch className="size-6 opacity-50" />
                                        No results found
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2 py-16 text-[--muted]">
                                        <BiSearch className="size-6 opacity-50" />
                                        Type at least 2 characters to search
                                    </div>
                                )}
                            </ScrollArea>
                        </section>

                        <aside className="flex flex-col gap-3 rounded-2xl bg-gradient-to-b from-brand-950/30 to-black/30 p-3 ring-1 ring-white/[0.07]">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Selected target</p>
                            {selectedAnime ? (
                                <SelectedAnimeDetails
                                    anime={selectedAnime}
                                    fallbackEpisodes={storedAnimeExpectedEpisodes || undefined}
                                />
                            ) : (
                                <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-4 py-10 text-center text-sm text-[--muted]">
                                    <BiSolidStar className="size-5 opacity-40" />
                                    Choose an anime on the left to target (Season / OVA / Movie)
                                </div>
                            )}
                            <div className="rounded-xl bg-black/30 px-3 py-2 text-xs text-[--muted]">
                                <span className="font-semibold text-white">{selectedFiles.size}</span> files ready ·{" "}
                                {dependOnIndex ? `numbered from ep ${episodeOffset > 0 ? episodeOffset : 1}` : "numbered from filenames"}
                            </div>
                            {selectedAnime && (
                                <div className="mt-auto flex gap-2">
                                    <Button intent="primary" onClick={handleMatch} disabled={isMatching || selectedFiles.size === 0} loading={isMatching} leftIcon={<BiCheck />} className="flex-[2]">
                                        Match {selectedFiles.size} Files
                                    </Button>
                                    <Button intent="gray-outline" onClick={() => selectTarget(null)} className="flex-1">
                                        Clear
                                    </Button>
                                </div>
                            )}
                        </aside>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/[0.06] pt-4">
                        <Button intent="gray-outline" onClick={() => setStep("select-files")} leftIcon={<LuChevronLeft />}>
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
                </div>
            )}
        </Modal>
        </>
    )
}

function PillButton({ children, onClick }: { children: React.ReactNode, onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-white/70 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white"
        >
            {children}
        </button>
    )
}

function MetaChip({ children, className }: { children: React.ReactNode, className?: string }) {
    return <span className={cn("rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/75 ring-1 ring-white/10", className)}>{children}</span>
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    const units = ["KB", "MB", "GB", "TB"]
    let value = bytes / 1024
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit++
    }
    return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`
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
            {/* What happens, at a glance */}
            <div className="flex gap-3 rounded-2xl bg-gradient-to-br from-brand-500/15 via-black/20 to-black/30 p-3 ring-1 ring-white/[0.08]">
                {anime.coverImage?.medium && (
                    <Image
                        src={anime.coverImage.medium}
                        alt=""
                        width={56}
                        height={80}
                        className="h-20 w-14 flex-none rounded-lg object-cover ring-1 ring-white/10"
                    />
                )}
                <div className="min-w-0 flex-1">
                    <p className="text-sm">
                        <span className="font-semibold">{formatNumber(count)}</span> file{count === 1 ? "" : "s"} will be{" "}
                        <span className="font-semibold">moved</span> out of the Unmatched folder into your library under{" "}
                        <span className="font-semibold text-brand-200">{destinationFolder}</span>, renamed, and matched to{" "}
                        <span className="font-semibold text-brand-200">{animeTitle}</span>
                        {anime.format ? ` (${anime.format}${expectedEpisodes ? `, ${expectedEpisodes} eps` : ""})` : ""}.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                        <MetaChip>{formatNumber(count)} file{count === 1 ? "" : "s"}</MetaChip>
                        {count > 0 && <MetaChip>{isMovie ? "Movie naming" : `Ep ${plan.entries[0].episode}–${plan.lastEpisode}`}</MetaChip>}
                        <MetaChip className={warnings.length ? "bg-amber-400/10 text-amber-200 ring-amber-300/25" : "bg-emerald-400/10 text-emerald-200 ring-emerald-300/25"}>
                            {warnings.length ? `${formatCount(warnings.length)} thing${warnings.length === 1 ? "" : "s"} to check` : "Looks good"}
                        </MetaChip>
                    </div>
                </div>
            </div>

            {/* The one thing that changed about matching: it is queued, not waited out. */}
            <p className="text-sm text-[--muted]">
                The match is <span className="text-gray-300">queued</span> and carried out by the server in the order
                you decide on things — so you can go straight on to the next download. Its progress is on the
                <span className="text-gray-300"> To Match</span> tab.
            </p>

            {/* How the episode numbers are decided */}
            <div className="space-y-1 rounded-2xl bg-black/25 p-3 ring-1 ring-white/[0.07]">
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
                <div className="overflow-hidden rounded-2xl ring-1 ring-white/[0.07]">
                    <div className="flex items-center justify-between border-b border-white/[0.06] bg-black/30 px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[--muted]">File → episode</p>
                        <p className="text-xs text-[--muted]">
                            {isMovie ? "Movie naming" : `Episodes ${plan.entries[0].episode}–${plan.lastEpisode}`}
                        </p>
                    </div>
                    <div className="max-h-[220px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                        <div className="divide-y divide-white/[0.05]">
                            {plan.entries.map(entry => {
                                const differs = entry.parsed !== null && entry.parsed !== entry.episode
                                return (
                                    <div key={entry.file.relativePath} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                                        <BiFile className="flex-none text-white/30" />
                                        <span className="min-w-0 flex-1 truncate text-gray-300" title={entry.file.relativePath}>
                                            {entry.file.name}
                                        </span>
                                        {differs && (
                                            <span className="flex-shrink-0 text-[10px] text-amber-400" title={`Filename says episode ${entry.parsed}`}>
                                                was ep {entry.parsed}
                                            </span>
                                        )}
                                        <LuChevronRight className="size-3 flex-none text-white/25" />
                                        <span className={cn(
                                            "flex-shrink-0 rounded-md px-1.5 py-0.5 font-semibold tabular-nums",
                                            differs ? "bg-amber-400/10 text-amber-300" : "bg-brand-500/15 text-brand-200",
                                        )}>
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
            <ul className="space-y-1.5 rounded-2xl bg-black/20 p-3 text-xs text-[--muted] ring-1 ring-white/[0.05]">
                <li className="flex gap-2"><span className="mt-1 size-1.5 flex-none rounded-full bg-sky-400" />
                    <span>
                        Files are renamed to{" "}
                        <span className="text-gray-300">
                            {isMovie ? `${destinationFolder} (year).ext` : `${destinationFolder} - Episode 001 - <episode title>.ext`}
                        </span>.
                    </span>
                </li>
                <li className="flex gap-2"><span className="mt-1 size-1.5 flex-none rounded-full bg-red-400" />
                    <span>Creditless openings/endings and anything inside an "Extra" folder are <span className="text-gray-300">deleted</span>, not moved.</span>
                </li>
                <li className="flex gap-2"><span className="mt-1 size-1.5 flex-none rounded-full bg-amber-400" />
                    <span>Moving and renaming can't be undone from here — files would have to be moved back by hand.</span>
                </li>
                <li className="flex gap-2"><span className="mt-1 size-1.5 flex-none rounded-full bg-violet-400" />
                    <span>Anything that needs a decision while it runs — episodes already in the library, a count that does not agree — waits in the To Match tab for your answer.</span>
                </li>
            </ul>

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
                    Queue match — {formatNumber(count)} file{count === 1 ? "" : "s"}
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
                    width={84}
                    height={120}
                    className="h-[120px] w-[84px] flex-shrink-0 rounded-xl object-cover shadow-lg ring-1 ring-white/10"
                />
            )}
            <div className="min-w-0 flex-1 space-y-1.5">
                <p className="line-clamp-2 text-base font-semibold text-white">{anime.title?.native || anime.title?.romaji}</p>
                <p className="line-clamp-1 text-xs text-[--muted]">{anime.title?.romaji}</p>
                <div className="flex flex-wrap items-center gap-1">
                    {anime.format && <MetaChip className="bg-brand-500/15 text-brand-100 ring-brand-400/30">{anime.format}</MetaChip>}
                    {seasonYear && <MetaChip>{seasonYear}</MetaChip>}
                    <MetaChip>{episodeText}</MetaChip>
                    {anime.status && <MetaChip className="uppercase tracking-wide">{anime.status.replace(/_/g, " ")}</MetaChip>}
                </div>
                {anime.genres && anime.genres.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                        {anime.genres.slice(0, 4).map((genre, idx) => (
                            <span key={idx} className="rounded px-1.5 py-0.5 text-[10px] text-gray-300 bg-white/[0.05]">
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

/** A square tick that shows all, some or none — the folder rows need the middle state. */
function TickBox({ state }: { state: "all" | "some" | "none" }) {
    return (
        <span className={cn(
            "flex size-4 flex-none items-center justify-center rounded-[5px] ring-1 transition",
            state === "all" ? "bg-brand-500 text-white ring-brand-400"
                : state === "some" ? "bg-brand-500/40 text-white ring-brand-400/60"
                    : "bg-black/30 ring-white/25",
        )}>
            {state === "all" && <BiCheck className="size-3.5" />}
            {state === "some" && <span className="h-0.5 w-2 rounded bg-white" />}
        </span>
    )
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
        const selectedCount = getVideoFilesUnderPath(node.path).filter(f => selectedFiles.has(f)).length

        return (
            <div>
                <div
                    className={cn(
                        "group flex items-center gap-2 rounded-lg py-1.5 pr-2 transition-colors hover:bg-white/[0.05]",
                        selectionState === "all" && "bg-brand-500/10",
                    )}
                    style={{ paddingLeft: `${6 + depth * 16}px` }}
                >
                    <button
                        type="button"
                        onClick={() => toggleFolderExpand(node.path)}
                        className="flex size-6 flex-shrink-0 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
                        aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
                    >
                        {isExpanded ? <LuChevronDown className="w-4 h-4" /> : <LuChevronRight className="w-4 h-4" />}
                    </button>
                    <button type="button" className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left" onClick={() => toggleFolder(node.path)}>
                        <TickBox state={selectionState} />
                        {isExpanded ? (
                            <BiFolderOpen className="text-brand-200 flex-shrink-0" />
                        ) : (
                            <BiFolder className="text-brand-200 flex-shrink-0" />
                        )}
                        <span className="truncate text-sm font-medium text-gray-100">{node.name}</span>
                    </button>
                    <span className={cn(
                        "flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] tabular-nums ring-1",
                        selectedCount ? "bg-brand-500/15 text-brand-100 ring-brand-400/30" : "text-[--muted] ring-white/10",
                    )}>
                        {selectedCount ? `${formatNumber(selectedCount)}/` : ""}{formatNumber(fileCount)} {fileCount === 1 ? "episode" : "episodes"}
                    </span>
                </div>
                {isExpanded && (
                    <div className="relative">
                        <span className="pointer-events-none absolute bottom-1 top-0 w-px bg-white/[0.07]" style={{ left: `${17 + depth * 16}px` }} />
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
    const isVideo = !!node.file?.isVideo

    return (
        <div
            className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg py-1.5 pr-2 transition-colors hover:bg-white/[0.05]",
                isSelected && "bg-brand-500/10",
                !isVideo && "opacity-60",
            )}
            style={{ paddingLeft: `${36 + depth * 16}px` }}
            onClick={() => node.file && toggleFile(node.file.relativePath)}
        >
            <TickBox state={isSelected ? "all" : "none"} />
            <BiFile className={cn("flex-shrink-0", isVideo ? "text-gray-300" : "text-gray-500")} />
            <span className={cn("min-w-0 flex-1 truncate text-sm", isSelected ? "text-white" : "text-gray-300")} title={node.name}>{node.name}</span>
            {!!node.file?.size && <span className="flex-shrink-0 text-[11px] tabular-nums text-white/35">{formatBytes(node.file.size)}</span>}
            {episodeNum !== null && (
                <span className={cn(
                    "flex-shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                    isSelected ? "bg-brand-500/20 text-brand-100" : "bg-white/[0.05] text-brand-300",
                )}>
                    Ep {episodeNum}
                </span>
            )}
        </div>
    )
}

// The old flat search row and the first-generation family tree used to live below this line.
//
// They are gone rather than left for reference: between them they were the second way to select a
// target, and a second way to select is what let a stale answer win over somebody's actual choice.
// Their replacement is UnmatchedFamilyResult — one row type, one selection path, families nested
// under the result they belong to.
