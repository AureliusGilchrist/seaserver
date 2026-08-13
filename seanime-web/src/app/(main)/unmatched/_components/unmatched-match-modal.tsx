"use client"

import {
    UnmatchedTorrent,
    UnmatchedFile,
    FamilyEntry,
    FamilyResult,
    CountMismatch,
    MatchConflict,
    useMatchUnmatchedTorrent,
    useDeleteUnmatchedTorrent,
    useGetUnmatchedTorrentContents,
    useUnmatchedFamilySearch,
} from "@/api/hooks/unmatched.hooks"
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
    const [selectedAnime, setSelectedAnime] = useState<AL_BaseAnime | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [searchInputValue, setSearchInputValue] = useState("")
    const [hasSearched, setHasSearched] = useState(false)
    const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(new Set())
    const [torrentContents, setTorrentContents] = useState<UnmatchedTorrent | null>(null)
    const [isLoadingContents, setIsLoadingContents] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [fetchedName, setFetchedName] = useState<string | null>(null)
    const [hasAutoSelectedAnime, setHasAutoSelectedAnime] = useState(false)
    // Index-based numbering is the default: release filenames lie about episode numbers far more
    // often than the sorted order does. The confirmation prompt spells out what it will do before
    // anything is moved, so defaulting it on doesn't renumber a library behind the user's back.
    const [dependOnIndex, setDependOnIndex] = useState(true)
    const [episodeOffset, setEpisodeOffset] = useState(1)
    // Family search (Feature 2) - now works for any selected anime
    const [familySearchDone, setFamilySearchDone] = useState(false)
    const [familyResults, setFamilyResults] = useState<FamilyResult | null>(null)
    const [familySearchTargetId, setFamilySearchTargetId] = useState<number | null>(null)
    const { mutate: runFamilySearch, isPending: isFamilySearchLoading } = useUnmatchedFamilySearch()

    // Family detail fetch — when a family entry is clicked, fetch full details progressively
    const [familyDetailId, setFamilyDetailId] = useState<number | null>(null)
    const { data: familyAnimeDetails } = useGetAnilistAnimeDetails(familyDetailId)
    // Title carried over from the previous match, used to pre-fill (and pre-run) the search.
    const [lastMatchedTitle, setLastMatchedTitle] = useAtom(__unmatched_lastMatchedTitleAtom)
    // The title the search box was seeded with — its results are floated to the top.
    const [priorityTitle, setPriorityTitle] = useState("")
    // Torrent the search box has already been seeded for, so we never overwrite typing.
    const [seededForTorrent, setSeededForTorrent] = useState<string | null>(null)

    const { mutate: fetchTorrentContents } = useGetUnmatchedTorrentContents(torrent?.name || null)

    // Fetch anime details if we have stored animeId
    const storedAnimeId = torrentContents?.animeId || torrent?.animeId

    // The family is walked here, one node at a time, and drawn as it arrives.
    //
    // Asking the server for a whole franchise is one AniList request per entry made back to back,
    // which for a large family is minutes of a modal showing a spinner and nothing else — and the
    // answer somebody wants is nearly always in the first handful. So the client does the walking:
    // the root and its direct relations land immediately, every discovered entry joins a queue, and
    // each one fills in its own branch as its turn comes. Nothing waits for the whole thing.
    const familySearchTarget = familySearchTargetId || storedAnimeId
    const walkQueueRef = useRef<{ id: number, parentId: number }[]>([])
    const walkedRef = useRef<Set<number>>(new Set())
    // The entries whose own relations have not been fetched yet, so the tree can say which branches
    // are still coming rather than looking finished when it is not.
    const [pendingFamilyIds, setPendingFamilyIds] = useState<Set<number>>(new Set())

    // Kick the walk off, and restart it whenever the target changes.
    useEffect(() => {
        if (step !== "select-anime" || !familySearchTarget || familySearchDone) return

        setFamilySearchDone(true)
        walkQueueRef.current = [{ id: familySearchTarget, parentId: 0 }]
        walkedRef.current = new Set()
        setPendingFamilyIds(new Set([familySearchTarget]))
    }, [step, familySearchTarget, familySearchDone])

    // One node per pass. Runs again after each result lands, until the queue empties.
    useEffect(() => {
        if (step !== "select-anime" || isFamilySearchLoading) return

        const next = walkQueueRef.current.shift()
        if (!next) return
        if (walkedRef.current.has(next.id)) {
            // Nudge the effect to look at the next one rather than stopping on a duplicate.
            setPendingFamilyIds(prev => {
                const updated = new Set(prev)
                updated.delete(next.id)
                return updated
            })
            return
        }
        walkedRef.current.add(next.id)

        runFamilySearch({ animeId: next.id, shallow: true }, {
            onSuccess: (data) => {
                if (!data) return
                setFamilyResults(prev => {
                    // The first answer establishes the root; everything after it merges in under
                    // the parent it was discovered from.
                    const root = prev?.root && prev.root.id ? prev.root : data.root
                    const merged = new Map<number, FamilyEntry>()
                    for (const entry of prev?.entries || []) merged.set(entry.id, entry)
                    for (const entry of data.entries || []) {
                        const existing = merged.get(entry.id)
                        // Keep the first parent an entry was found under, so the tree does not
                        // reshuffle itself as deeper answers arrive.
                        merged.set(entry.id, existing ? { ...entry, parentId: existing.parentId } : {
                            ...entry,
                            parentId: entry.id === next.id ? next.parentId : (entry.parentId || next.id),
                        })
                    }
                    return { root, entries: Array.from(merged.values()) }
                })

                const discovered = (data.entries || [])
                    .filter(entry => entry.id !== next.id && !walkedRef.current.has(entry.id))
                for (const entry of discovered) {
                    walkQueueRef.current.push({ id: entry.id, parentId: next.id })
                }

                setPendingFamilyIds(prev => {
                    const updated = new Set(prev)
                    updated.delete(next.id)
                    for (const entry of discovered) updated.add(entry.id)
                    return updated
                })
            },
            onError: () => {
                // One node failing costs its branch, not the tree.
                setPendingFamilyIds(prev => {
                    const updated = new Set(prev)
                    updated.delete(next.id)
                    return updated
                })
            },
        })
    }, [step, isFamilySearchLoading, pendingFamilyIds, runFamilySearch])
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

    // Enrich selected anime with full details when family detail fetch completes.
    //
    // The identity of the details is checked, not just the identity of the request. While the query
    // for a newly clicked entry is still in flight it can hand back the *previous* entry's details,
    // and every guard here was about which entry was asked for rather than which one arrived — so
    // clicking a second entry in the tree replaced the selection with the first one's anime, ID and
    // all. What that produced was a confirmation dialog naming a series nobody picked, and a match
    // that would have moved the files into it.
    useEffect(() => {
        if (!familyAnimeDetails || !familyDetailId) return
        if (selectedAnime?.id !== familyDetailId) return
        // The details are for a different anime than the one being enriched: stale, wait for the
        // real answer rather than overwriting a correct selection with it.
        if ((familyAnimeDetails as AL_BaseAnime).id !== familyDetailId) return

        setSelectedAnime(familyAnimeDetails as AL_BaseAnime)
        setFamilyDetailId(null)
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
        setSelectedAnime(null)
        setHasAutoSelectedAnime(false)
    }, [torrent?.name])

    const { mutate: matchTorrent, isPending: isMatching } = useMatchUnmatchedTorrent(() => {
        setConflict(null)
        onSuccess()
        // Reset selection to avoid carrying the previous anime into subsequent matches in the same modal session
        setSelectedAnime(null)
        setHasAutoSelectedAnime(false)
        setSearchQuery("")
        setSearchInputValue("")
        setHasSearched(false)
        setSeededForTorrent(null)
        setPriorityTitle("")
        setDependOnIndex(true)
        setEpisodeOffset(1)
        setFamilyDetailId(null)
        // Keep the files list but drop selections after a match
        setSelectedFiles(new Set())
    }, (c) => setConflict(c), (m) => setCountMismatch(m))

    // Declining a conflict throws the incoming copy away: this staged torrent and its episodes are
    // deleted, and the library keeps what it already had. Only this one torrent is touched.
    const { mutate: deleteTorrent, isPending: isDeletingTorrent } = useDeleteUnmatchedTorrent(() => {
        setConflict(null)
        onSuccess()
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
        setConflict(null)
        setSelectedFiles(new Set())
        setSelectedAnime(null)
        setSearchQuery("")
        setSearchInputValue("")
        setHasSearched(false)
        setExpandedSeasons(new Set())
        setTorrentContents(null)
        setFetchedName(null)
        setHasAutoSelectedAnime(false)
        setFamilySearchDone(false)
        setFamilyResults(null)
        setFamilySearchTargetId(null)
        setFamilyDetailId(null)
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
        setFamilySearchDone(false)
        setFamilyResults(null)
        setFamilySearchTargetId(null)
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

    // Handle selecting anime from search - also sets up family search target
    const handleSelectSearchAnime = useCallback((anime: AL_BaseAnime) => {
        setSelectedAnime(anime)
        // Reset family search for new selection
        setFamilySearchDone(false)
        setFamilyResults(null)
        setFamilySearchTargetId(anime.id)
    }, [])

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
    const isEnrichingFamily = familyDetailId !== null && familyDetailId === selectedAnime?.id

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
                isDeleting={isDeletingTorrent}
                onAccept={() => doMatch(true)}
                onDecline={() => deleteTorrent({ name: torrent.name })}
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
                    {/* The family is loaded, not offered.
                     *
                     * It used to be a question — "Load full anime family?", Yes / No — sitting above
                     * a separate results box, so picking the right season of a franchise meant
                     * answering a prompt about a thing you could not see yet, then reading two lists
                     * that did not know about each other. There is no case where the answer is No:
                     * the family is the whole point of the screen, and it is one request. So it runs
                     * as soon as there is something to run it on, and the tree it produces IS the
                     * list. */}
                    {(isFamilySearchLoading || pendingFamilyIds.size > 0) && !familyResults && (
                        <div className="p-3 border rounded-md bg-[--subtle] space-y-2" data-family-loading>
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">Loading the anime family…</p>
                                <p className="text-xs text-[--muted]">walking every relation</p>
                            </div>
                            {/* The walk is one request and the server reports no milestones, so this
                                is an activity bar rather than a percentage. A made-up percentage
                                that jumps to 90% and waits is worse than an honest one. */}
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                                <div className="h-full w-1/3 animate-[indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-[--brand]" />
                            </div>
                            <style>{`@keyframes indeterminate{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
                        </div>
                    )}

                    {/* Family search results — indented tree */}
                    {familyResults && familyResults.entries.length > 0 && (
                        <div className="p-3 border rounded-md bg-[--subtle] space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-semibold text-[--muted] uppercase tracking-wider">
                                    Related entries — pick one to match ({familyResults.entries.length})
                                </p>
                                {pendingFamilyIds.size > 0 && (
                                    <p className="text-[10px] text-[--muted] shrink-0">
                                        still branching out — {pendingFamilyIds.size} to go
                                    </p>
                                )}
                            </div>
                            {/* Progress against everything discovered so far. It grows as the walk
                                finds more, which is honest about what it is: a walk that does not
                                know its own size until it is done. */}
                            {pendingFamilyIds.size > 0 && (
                                <div className="h-1 w-full overflow-hidden rounded-full bg-gray-800">
                                    <div
                                        className="h-full rounded-full bg-[--brand] transition-all duration-300"
                                        style={{
                                            width: `${Math.round(100 * (familyResults.entries.length - pendingFamilyIds.size)
                                                / Math.max(familyResults.entries.length, 1))}%`,
                                        }}
                                    />
                                </div>
                            )}
                            {/* Grows with the modal rather than staying at a fixed height, so the
                                extra room actually shows more of the franchise. */}
                            <div className="max-h-[38vh] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                                <FamilyTreeView
                                    result={familyResults}
                                    selectedAnimeId={selectedAnime?.id ?? null}
                                    onSelect={(entry) => {
                                        // Build a synthetic anime carrying every field the family entry
                                        // already gives us — this is HIGHER-PRIORITY metadata than the
                                        // initial torrent guess and persists until the full AniList
                                        // details fetch lands.
                                        const syntheticAnime: AL_BaseAnime = {
                                            id: entry.id,
                                            title: {
                                                romaji: entry.title,
                                                english: undefined,
                                                native: undefined,
                                                userPreferred: entry.title,
                                            },
                                            episodes: entry.episodes && entry.episodes > 0 ? entry.episodes : undefined,
                                            format: entry.format as AL_BaseAnime["format"] || undefined,
                                        }
                                        setSelectedAnime(syntheticAnime)
                                        setFamilyDetailId(entry.id)
                                        // The tree is not re-rooted on the pick.
                                        //
                                        // Re-pointing the walk at whatever was just clicked threw
                                        // away the tree the user was reading and started another
                                        // one, mid-decision. The family already holds this entry —
                                        // that is where it was clicked — so there is nothing to
                                        // fetch and nothing to move.
                                    }}
                                />
                            </div>
                        </div>
                    )}

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
                                    {rankedSearchResults.map((anime) => (
                                        <AnimeSearchItem
                                            key={anime?.id}
                                            anime={anime as AL_BaseAnime}
                                            selected={selectedAnime?.id === anime?.id}
                                            onSelect={() => handleSelectSearchAnime(anime as AL_BaseAnime)}
                                            localFiles={localFiles}
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
                                    isEnriching={isEnrichingFamily}
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

function AnimeSearchItem({ anime, selected, onSelect, localFiles }: {
    anime: AL_BaseAnime & { studios?: { nodes?: { name: string }[] }, synonyms?: string[] };
    selected: boolean;
    onSelect: () => void;
    localFiles?: any[]
}) {
    const season = anime.season ? capitalize(anime.season.toLowerCase()) : null
    const year = anime.seasonYear
    const seasonYear = season && year ? `${season} ${year}` : year ? `${year}` : null
    const format = anime.format

    const isInLibrary = anime?.id ? isAnimeInLibrary(anime.id, localFiles) : false
    
    // Get studios
    const studios = anime.studios?.nodes?.map(s => s.name).slice(0, 2) || []
    
    // Get synonyms (alternative titles)
    const synonyms = (anime.synonyms || []).slice(0, 2)
    
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
                
                {/* Alternative titles / Synonyms */}
                {synonyms.length > 0 && (
                    <p className="text-[10px] text-[--muted] line-clamp-1 italic">
                        aka: {synonyms.join(", ")}
                    </p>
                )}

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
                
                {/* Format, Episodes, Score, Studios */}
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
                    {studios.length > 0 && (
                        <>
                            <span>•</span>
                            <span className="text-[--muted]">{studios.join(", ")}</span>
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

// ─── Family Tree View ────────────────────────────────────────────────

interface FamilyTreeNode {
    entry: FamilyEntry
    children: FamilyTreeNode[]
}

function buildFamilyTree(result: FamilyResult): FamilyTreeNode {
    const rootEntry = result.root
    // Deduplicate: an entry can appear via multiple relation paths
    const seenIds = new Set<number>([rootEntry.id])
    const uniqueEntries = result.entries.filter(e => {
        if (seenIds.has(e.id)) return false
        seenIds.add(e.id)
        return true
    })
    const byParent = new Map<number, FamilyEntry[]>()
    for (const e of uniqueEntries) {
        const pid = e.parentId || rootEntry.id
        if (!byParent.has(pid)) byParent.set(pid, [])
        byParent.get(pid)!.push(e)
    }

    const relationOrder: Record<string, number> = {
        PREQUEL: 0, SEQUEL: 1, SIDE_STORY: 2, ALTERNATIVE: 3,
        SPIN_OFF: 4, PARENT: 5, SUMMARY: 6, CHARACTER: 7, OTHER: 8,
    }

    const builtIds = new Set<number>()
    function build(entry: FamilyEntry): FamilyTreeNode {
        if (builtIds.has(entry.id)) return { entry, children: [] }
        builtIds.add(entry.id)
        // Siblings run in the order the series does.
        //
        // Relation type alone put every prequel above every sequel regardless of when either came
        // out, so a franchise read backwards from whichever entry you happened to search for. Airing
        // order first — an entry further along the series sits further down the list, which is how
        // anybody thinks about a franchise — and the relation ordering only decides between entries
        // AniList gives the same year, or none at all.
        const seasonOrder: Record<string, number> = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 }
        const airedAt = (e: FamilyEntry) => (e.seasonYear || 0) * 10 + (seasonOrder[e.season || ""] ?? 0)
        const kids = (byParent.get(entry.id) || [])
            .sort((a, b) => {
                // Entries with no year at all go last rather than to the front of the franchise.
                const aYear = a.seasonYear || 0
                const bYear = b.seasonYear || 0
                if ((aYear === 0) !== (bYear === 0)) return aYear === 0 ? 1 : -1
                if (aYear !== 0 && airedAt(a) !== airedAt(b)) return airedAt(a) - airedAt(b)
                return (relationOrder[a.relationType] ?? 9) - (relationOrder[b.relationType] ?? 9)
            })
        return { entry, children: kids.map(build) }
    }

    return build(rootEntry)
}

const RELATION_COLORS: Record<string, string> = {
    SEQUEL: "text-blue-400",
    PREQUEL: "text-cyan-400",
    SIDE_STORY: "text-amber-400",
    ALTERNATIVE: "text-purple-400",
    SPIN_OFF: "text-pink-400",
    PARENT: "text-green-400",
    SUMMARY: "text-gray-400",
    CHARACTER: "text-gray-400",
    OTHER: "text-gray-400",
}

function FamilyTreeView({ result, selectedAnimeId, onSelect }: {
    result: FamilyResult
    selectedAnimeId: number | null
    onSelect: (entry: FamilyEntry) => void
}) {
    const tree = useMemo(() => buildFamilyTree(result), [result])
    const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

    const toggle = useCallback((id: number) => {
        setCollapsed(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])

    return (
        <div className="space-y-0.5">
            <FamilyTreeNodeItem
                node={tree}
                depth={0}
                selectedAnimeId={selectedAnimeId}
                collapsed={collapsed}
                toggleCollapse={toggle}
                onSelect={onSelect}
            />
        </div>
    )
}

function FamilyTreeNodeItem({ node, depth, selectedAnimeId, collapsed, toggleCollapse, onSelect }: {
    node: FamilyTreeNode
    depth: number
    selectedAnimeId: number | null
    collapsed: Set<number>
    toggleCollapse: (id: number) => void
    onSelect: (entry: FamilyEntry) => void
}) {
    const e = node.entry
    const hasChildren = node.children.length > 0
    const isCollapsed = collapsed.has(e.id)
    const isSelected = selectedAnimeId === e.id

    return (
        <>
            <div
                role="button"
                tabIndex={0}
                className={cn(
                    "flex items-center gap-2 py-1.5 px-1.5 rounded cursor-pointer text-xs transition-colors",
                    isSelected ? "bg-brand-900/30 border border-brand-500" : "hover:bg-gray-800/50",
                )}
                // Indented by depth, so a franchise reads as the tree it is: the entry you searched
                // for at the root, and every relative stepped in under the entry it hangs off.
                style={{ paddingLeft: `${4 + depth * 18}px` }}
                onClick={() => onSelect(e)}
                onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault()
                        onSelect(e)
                    }
                }}
            >
                {hasChildren ? (
                    <button
                        onClick={(ev) => {
                            ev.stopPropagation()
                            toggleCollapse(e.id)
                        }}
                        className="p-0.5 flex-shrink-0"
                    >
                        {isCollapsed ? <LuChevronRight className="w-3.5 h-3.5" /> : <LuChevronDown className="w-3.5 h-3.5" />}
                    </button>
                ) : (
                    <span className="w-4 flex-shrink-0" />
                )}

                {/* The cover is what makes six near-identical subtitles tell themselves apart —
                    you recognise the artwork of the thing you downloaded without reading a word. */}
                {e.coverImage
                    ? <img
                        src={e.coverImage}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-11 w-8 flex-shrink-0 rounded-[--radius] object-cover"
                    />
                    : <span className="h-11 w-8 flex-shrink-0 rounded-[--radius] bg-gray-800" />}

                <span className="flex-1 min-w-0">
                    {/* Room for a real title. These names run long — "Fate/Grand Order: Shinsei
                        Entaku Ryouiki Camelot - Wandering; Agateram" is the entry, not a
                        description of it — and cutting them at the width of a narrow column left
                        several rows reading identically. Wraps to two lines, which fits about
                        fifty characters before anything is lost. */}
                    <span className="block leading-tight line-clamp-2 break-words">{e.title}</span>
                    {e.englishTitle && (
                        <span className="block truncate text-[10px] text-[--muted]">{e.englishTitle}</span>
                    )}
                    <span className="flex items-center gap-1.5 text-[10px] text-[--muted]">
                        {e.format && <span className="px-1 py-0.5 rounded bg-gray-800/70 text-gray-300">{e.format}</span>}
                        {e.seasonYear ? <span>{e.season ? `${e.season[0]}${e.season.slice(1).toLowerCase()} ` : ""}{e.seasonYear}</span> : null}
                        {e.status && <span className={cn(e.status === "FINISHED" && "text-green-500")}>{e.status.replace(/_/g, " ")}</span>}
                        {e.episodes > 0 && <span>{e.episodes} eps</span>}
                        {e.meanScore ? <span>★ {e.meanScore}%</span> : null}
                    </span>
                </span>

                {e.relationType && (
                    <span className={cn("text-[10px] font-medium flex-shrink-0", RELATION_COLORS[e.relationType] || "text-gray-400")}>
                        {e.relationType.replace(/_/g, " ")}
                    </span>
                )}
            </div>

            {hasChildren && !isCollapsed && node.children.map(child => (
                <FamilyTreeNodeItem
                    key={child.entry.id}
                    node={child}
                    depth={depth + 1}
                    selectedAnimeId={selectedAnimeId}
                    collapsed={collapsed}
                    toggleCollapse={toggleCollapse}
                    onSelect={onSelect}
                />
            ))}
        </>
    )
}
