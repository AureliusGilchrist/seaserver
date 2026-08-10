import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

// Types for unmatched torrents
export interface UnmatchedFile {
    name: string
    path: string
    relativePath: string
    size: number
    isVideo: boolean
    season?: string
    seasonNumber?: number
}

export interface UnmatchedSeason {
    name: string
    path: string
    files: UnmatchedFile[]
    number: number
}

export interface UnmatchedTorrent {
    name: string
    path: string
    size: number
    fileCount: number
    files: UnmatchedFile[]
    seasons?: UnmatchedSeason[]
    // Anime metadata (from AniList, stored when torrent is added)
    animeId?: number
    animeTitleRomaji?: string
    animeTitleNative?: string
    animeFormat?: string
    animeStartYear?: number
    animeExpectedEpisodes?: number
    /**
     * Set when an automatic match for this download stopped because episodes were already in the
     * library. An automatic match has nobody to ask, so the question is kept and shipped here —
     * without it the download sits in the list looking exactly like one nobody has got to yet.
     */
    pendingConflict?: MatchConflict
}

export interface MatchRequest {
    torrentName: string
    selectedFiles: string[]
    animeId: number
    animeTitleJp: string
    animeTitleClean: string
    useIndexBasedEpisodes?: boolean
    episodeOffset?: number
    /**
     * Replace library files this match would land on top of. Without it, a match that finds any
     * destination already occupied moves nothing and returns `conflict` instead.
     */
    overwriteExisting?: boolean
}

/** One destination file a match would overwrite. See internal/unmatched/conflict.go. */
export interface ConflictingFile {
    newName: string
    newPath: string
    relPath: string
    existingSize: number
    incomingSize: number
    /** The torrent that put the existing file there, when a match record still says so. */
    sourceTorrent?: string
    matchRecordId?: number
}

/** What a match found already in place, reported instead of overwriting it. */
export interface MatchConflict {
    destination: string
    files: ConflictingFile[]
    /** Distinct torrents that put the existing files there, most recently matched first. */
    sourceTorrents?: string[]
    /** Every existing file came from this same torrent — a match being re-run, not a rival release. */
    sameTorrent: boolean
    /**
     * No match record accounts for any of the existing files, so nothing is known about where they
     * came from — most often a library that was scanned in rather than matched in. Not the same as
     * their coming from a different torrent, which is what this used to be reported as.
     */
    unattributed?: boolean
    totalPlanned: number
}

export interface MatchResult {
    success: boolean
    movedFiles: string[]
    failedFiles: string[]
    destination: string
    errorMessage?: string
    /**
     * Set, with nothing moved or deleted, when the library already holds files at the destinations
     * this match wanted. Re-send with `overwriteExisting` to replace them, or delete the torrent to
     * throw the incoming copy away.
     */
    conflict?: MatchConflict
}

const UNMATCHED_ENDPOINTS = {
    GetUnmatchedTorrents: {
        key: "UNMATCHED-get-unmatched-torrents",
        methods: ["GET"] as const,
        endpoint: "/api/v1/unmatched/torrents",
    },
    GetUnmatchedTorrentContents: {
        key: "UNMATCHED-get-unmatched-torrent-contents",
        methods: ["POST"] as const,
        endpoint: "/api/v1/unmatched/torrent/contents",
    },
    MatchUnmatchedTorrent: {
        key: "UNMATCHED-match-unmatched-torrent",
        methods: ["POST"] as const,
        endpoint: "/api/v1/unmatched/match",
    },
    FamilySearch: {
        key: "UNMATCHED-family-search",
        methods: ["POST"] as const,
        endpoint: "/api/v1/unmatched/family-search",
    },
    DeleteUnmatchedTorrent: {
        key: "UNMATCHED-delete-unmatched-torrent",
        methods: ["POST"] as const,
        endpoint: "/api/v1/unmatched/torrent/delete",
    },
    GetMatchHistory: {
        key: "UNMATCHED-get-match-history",
        methods: ["GET"] as const,
        endpoint: "/api/v1/unmatched/history",
    },
    RevertMatch: {
        key: "UNMATCHED-revert-match",
        methods: ["POST"] as const,
        endpoint: "/api/v1/unmatched/history/revert",
    },
    DismissMatchRecord: {
        key: "UNMATCHED-dismiss-match-record",
        methods: ["POST"] as const,
        endpoint: "/api/v1/unmatched/history/dismiss",
    },
    GetDiagnostics: {
        key: "UNMATCHED-get-diagnostics",
        methods: ["GET"] as const,
        endpoint: "/api/v1/unmatched/diagnostics",
    },
    SweepMatchAll: {
        key: "UNMATCHED-sweep-match-all",
        methods: ["POST"] as const,
        endpoint: "/api/v1/unmatched/match-all",
    },
    GetSweepStatus: {
        key: "UNMATCHED-get-sweep-status",
        methods: ["GET"] as const,
        endpoint: "/api/v1/unmatched/match-all/status",
    },
    StopSweep: {
        key: "UNMATCHED-stop-sweep",
        methods: ["POST"] as const,
        endpoint: "/api/v1/unmatched/match-all/stop",
    },
}

export function useGetUnmatchedTorrents({
    refetchInterval,
    staleTime,
    refetchOnWindowFocus,
}: {
    refetchInterval?: number
    staleTime?: number
    refetchOnWindowFocus?: boolean | "always"
} = {}) {
    return useServerQuery<UnmatchedTorrent[]>({
        endpoint: UNMATCHED_ENDPOINTS.GetUnmatchedTorrents.endpoint,
        method: UNMATCHED_ENDPOINTS.GetUnmatchedTorrents.methods[0],
        queryKey: [UNMATCHED_ENDPOINTS.GetUnmatchedTorrents.key],
        gcTime: 0,
        refetchInterval,
        staleTime,
        refetchOnWindowFocus,
    })
}

export function useGetUnmatchedTorrentContents(torrentName: string | null) {
    return useServerMutation<UnmatchedTorrent, { name: string }>({
        endpoint: UNMATCHED_ENDPOINTS.GetUnmatchedTorrentContents.endpoint,
        method: UNMATCHED_ENDPOINTS.GetUnmatchedTorrentContents.methods[0],
        mutationKey: [UNMATCHED_ENDPOINTS.GetUnmatchedTorrentContents.key, torrentName],
    })
}

/**
 * `onConflict` is called when the server refused to overwrite library files already sitting at the
 * destinations — nothing was moved or deleted. The match is not finished in that case, so the modal
 * must stay open to ask, which is why this path deliberately skips `onSuccess` and the toast.
 */
export function useMatchUnmatchedTorrent(onSuccess?: () => void, onConflict?: (conflict: MatchConflict) => void) {
    const queryClient = useQueryClient()

    return useServerMutation<MatchResult, MatchRequest>({
        endpoint: UNMATCHED_ENDPOINTS.MatchUnmatchedTorrent.endpoint,
        method: UNMATCHED_ENDPOINTS.MatchUnmatchedTorrent.methods[0],
        mutationKey: [UNMATCHED_ENDPOINTS.MatchUnmatchedTorrent.key],
        onSuccess: async (data) => {
            if (data?.conflict) {
                onConflict?.(data.conflict)
                return
            }
            if (data?.success) {
                toast.success(`Matched ${data.movedFiles?.length || 0} files successfully`)
            } else {
                toast.error(data?.errorMessage || "Some files failed to move")
            }
            // Close modal immediately — don't wait for query invalidations
            onSuccess?.()
            // Invalidate queries in the background so lists refresh after close
            Promise.all([
                queryClient.invalidateQueries({ queryKey: [UNMATCHED_ENDPOINTS.GetUnmatchedTorrents.key] }),
                queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.key] }),
                queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key] }),
                queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.LIBRARY_EXPLORER.GetLibraryExplorerFileTree.key] }),
            ])
        },
    })
}

export function useDeleteUnmatchedTorrent(onSuccess?: () => void) {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, { name: string }>({
        endpoint: UNMATCHED_ENDPOINTS.DeleteUnmatchedTorrent.endpoint,
        method: UNMATCHED_ENDPOINTS.DeleteUnmatchedTorrent.methods[0],
        mutationKey: [UNMATCHED_ENDPOINTS.DeleteUnmatchedTorrent.key],
        onSuccess: async () => {
            toast.success("Torrent deleted")
            await queryClient.invalidateQueries({ queryKey: [UNMATCHED_ENDPOINTS.GetUnmatchedTorrents.key] })
            onSuccess?.()
        },
    })
}

// ─── Match all (sweep) ───────────────────────────────────────────────
//
// Auto-match is chosen before a download starts and defaults to off, but the anime a download was
// queued for is recorded either way. This runs the ordinary match over every finished download that
// has one, so a backlog doesn't have to be worked through one modal at a time.
// See internal/handlers/unmatched_sweep.go.

export interface UnmatchedSweepStatus {
    running: boolean
    total: number
    processed: number
    matched: number
    /** Passed over: no anime recorded, or still downloading. */
    skipped: number
    failed: number
    /**
     * Left alone because the library already holds files at the destinations they wanted. A sweep
     * never overwrites; these need matching by hand to answer the conflict dialog.
     */
    conflicts: number
    current: string
    errors: string[]
    stopping: boolean
    startedAt?: string
    finishedAt?: string
}

/** Polls only while a sweep is running, so an idle screen isn't asking every second. */
export function useGetUnmatchedSweepStatus({ enabled }: { enabled?: boolean } = {}) {
    return useServerQuery<UnmatchedSweepStatus>({
        endpoint: UNMATCHED_ENDPOINTS.GetSweepStatus.endpoint,
        method: UNMATCHED_ENDPOINTS.GetSweepStatus.methods[0],
        queryKey: [UNMATCHED_ENDPOINTS.GetSweepStatus.key],
        gcTime: 0,
        staleTime: 0,
        refetchInterval: query => (query.state.data?.running ? 1_000 : false),
        enabled,
    })
}

export function useSweepUnmatchedTorrents() {
    const queryClient = useQueryClient()

    return useServerMutation<UnmatchedSweepStatus, {}>({
        endpoint: UNMATCHED_ENDPOINTS.SweepMatchAll.endpoint,
        method: UNMATCHED_ENDPOINTS.SweepMatchAll.methods[0],
        mutationKey: [UNMATCHED_ENDPOINTS.SweepMatchAll.key],
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: [UNMATCHED_ENDPOINTS.GetSweepStatus.key] })
        },
    })
}

export function useStopUnmatchedSweep() {
    const queryClient = useQueryClient()

    return useServerMutation<UnmatchedSweepStatus, {}>({
        endpoint: UNMATCHED_ENDPOINTS.StopSweep.endpoint,
        method: UNMATCHED_ENDPOINTS.StopSweep.methods[0],
        mutationKey: [UNMATCHED_ENDPOINTS.StopSweep.key],
        onSuccess: async () => {
            toast.info("Stopping after the current download")
            await queryClient.invalidateQueries({ queryKey: [UNMATCHED_ENDPOINTS.GetSweepStatus.key] })
        },
    })
}

// ─── Diagnostics ─────────────────────────────────────────────────────
//
// A download only reaches this screen once its files are on disk where the server expects them.
// When that doesn't happen the screen has nothing to show and no way to say why, so the server
// reports the whole chain instead. See internal/handlers/unmatched_diagnostics.go.

export interface DiagnosticsTorrent {
    name: string
    status: string
    progress: number
    savePath: string
    stagingDir: string
    /** Whether the client is writing inside the folder the server watches. */
    insideUnmatched: boolean
    stagingExists: boolean
    sidecarFound: boolean
    animeId?: number
    autoMatch: boolean
}

export interface DiagnosticsStagingDir {
    name: string
    fileCount: number
    videoCount: number
    hasTempFile: boolean
    sidecarFound: boolean
    animeId?: number
    autoMatch: boolean
    /** What the torrent client says: "finished", "downloading" or "unknown". */
    completion: string
    markedCompleted: boolean
    /** Whether it shows up in the Unmatched screen. */
    listed: boolean
}

export interface UnmatchedDiagnostics {
    unmatchedBasePath: string
    basePathExists: boolean
    basePathWritable: boolean
    libraryPath: string
    torrentClient: string
    torrentClientOk: boolean
    torrentClientError?: string
    torrents: DiagnosticsTorrent[]
    stagingDirs: DiagnosticsStagingDir[]
}

export function useGetUnmatchedDiagnostics({ enabled }: { enabled?: boolean } = {}) {
    return useServerQuery<UnmatchedDiagnostics>({
        endpoint: UNMATCHED_ENDPOINTS.GetDiagnostics.endpoint,
        method: UNMATCHED_ENDPOINTS.GetDiagnostics.methods[0],
        queryKey: [UNMATCHED_ENDPOINTS.GetDiagnostics.key],
        // Everything here is measured against the disk and the torrent client when asked. A cached
        // answer would describe a state that has already moved on.
        gcTime: 0,
        staleTime: 0,
        enabled,
    })
}

// ─── Match history (undo) ────────────────────────────────────────────
//
// Every match is written down so it can be reviewed and undone: which file came from where, and
// what it was renamed to. See internal/unmatched/history.go.

/** What a revert would do — or did — with one file. */
export type RevertFileStatus =
    | "ready"     // still where the match left it, and its original path is free
    | "missing"   // no longer at the path the match moved it to
    | "blocked"   // something already occupies the path it would go back to
    | "restored"  // the match was reverted and this file was put back

export interface MatchHistoryFile {
    originalName: string
    originalRelPath: string
    originalPath: string
    newName: string
    newPath: string
    size: number
    status: RevertFileStatus
}

export interface RevertFailure {
    name: string
    reason: string
}

export interface RevertOutcome {
    revertedAt: string
    restored: string[]
    missing?: string[]
    failed?: RevertFailure[]
    destinationRemoved: boolean
}

export interface MatchHistoryEntry {
    id: number
    torrentName: string
    animeId: number
    animeTitle: string
    destination: string
    stagingPath: string
    matchedAt: string
    revertedAt?: string | null
    files: MatchHistoryFile[]
    /** Creditless/bonus files the match deleted rather than moved. A revert cannot bring these back. */
    deletedFiles?: string[]
    readyCount: number
    missingCount: number
    blockedCount: number
    restoredCount: number
    revert?: RevertOutcome
}

export interface RestoredFile {
    newPath: string
    newName: string
    originalPath: string
    originalRelPath: string
}

export interface RevertResult {
    success: boolean
    id: number
    torrentName: string
    animeId: number
    animeTitle: string
    stagingPath: string
    restored: RestoredFile[]
    missing?: string[]
    failed?: RevertFailure[]
    deletedFiles?: string[]
    destinationRemoved: boolean
    errorMessage?: string
}

export function useGetUnmatchedMatchHistory({ enabled }: { enabled?: boolean } = {}) {
    return useServerQuery<MatchHistoryEntry[]>({
        endpoint: UNMATCHED_ENDPOINTS.GetMatchHistory.endpoint,
        method: UNMATCHED_ENDPOINTS.GetMatchHistory.methods[0],
        queryKey: [UNMATCHED_ENDPOINTS.GetMatchHistory.key],
        // File statuses are recomputed against the disk on every read, so a cached list would
        // happily offer to restore files that are no longer there.
        gcTime: 0,
        staleTime: 0,
        enabled,
    })
}

/**
 * Undoes a match. `confirmed` is required by the server — a revert moves files across the disk, so
 * it is never performed on the strength of an ID alone.
 */
export function useRevertUnmatchedMatch(onSuccess?: (result: RevertResult | undefined) => void) {
    const queryClient = useQueryClient()

    return useServerMutation<RevertResult, { id: number, confirmed: boolean }>({
        endpoint: UNMATCHED_ENDPOINTS.RevertMatch.endpoint,
        method: UNMATCHED_ENDPOINTS.RevertMatch.methods[0],
        mutationKey: [UNMATCHED_ENDPOINTS.RevertMatch.key],
        onSuccess: async (data) => {
            if (data?.success) {
                const restored = data.restored?.length || 0
                const failed = data.failed?.length || 0
                const missing = data.missing?.length || 0
                let message = `Moved ${restored} file${restored === 1 ? "" : "s"} back to Unmatched`
                if (missing > 0) message += ` — ${missing} were no longer there`
                if (failed > 0) message += ` — ${failed} couldn't be restored`
                failed > 0 || missing > 0 ? toast.warning(message) : toast.success(message)
            } else {
                toast.error(data?.errorMessage || "Could not undo this match")
            }
            onSuccess?.(data)
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: [UNMATCHED_ENDPOINTS.GetMatchHistory.key] }),
                queryClient.invalidateQueries({ queryKey: [UNMATCHED_ENDPOINTS.GetUnmatchedTorrents.key] }),
                queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.key] }),
                queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key] }),
                queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.LOCALFILES.GetLocalFiles.key] }),
                queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.LIBRARY_EXPLORER.GetLibraryExplorerFileTree.key] }),
            ])
        },
    })
}

/** Takes a match off the undo list without touching a single file. */
export function useDismissUnmatchedMatchRecord(onSuccess?: () => void) {
    const queryClient = useQueryClient()

    return useServerMutation<boolean, { id: number }>({
        endpoint: UNMATCHED_ENDPOINTS.DismissMatchRecord.endpoint,
        method: UNMATCHED_ENDPOINTS.DismissMatchRecord.methods[0],
        mutationKey: [UNMATCHED_ENDPOINTS.DismissMatchRecord.key],
        onSuccess: async () => {
            toast.success("Match kept")
            await queryClient.invalidateQueries({ queryKey: [UNMATCHED_ENDPOINTS.GetMatchHistory.key] })
            onSuccess?.()
        },
    })
}

export interface FamilyEntry {
    id: number
    title: string
    relationType: string // "SEQUEL", "PREQUEL", "SIDE_STORY", "PARENT", "ALTERNATIVE", "SPIN_OFF", "SUMMARY", "CHARACTER", "OTHER", ""
    format: string       // "TV", "MOVIE", "OVA", "ONA", "SPECIAL", "MUSIC"
    parentId: number     // ID of the parent entry in the tree (0 for root)
    episodes: number     // 0 if unknown
}

export interface FamilyResult {
    root: FamilyEntry
    entries: FamilyEntry[]
}

export function useUnmatchedFamilySearch() {
    return useServerMutation<FamilyResult, { animeId: number }>({
        endpoint: UNMATCHED_ENDPOINTS.FamilySearch.endpoint,
        method: UNMATCHED_ENDPOINTS.FamilySearch.methods[0],
        mutationKey: [UNMATCHED_ENDPOINTS.FamilySearch.key],
    })
}
