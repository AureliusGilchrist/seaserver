"use client"
import { buildSeaQuery, useServerMutation, useServerQuery } from "@/api/client/requests"
import { profileSessionTokenAtom, serverAuthTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import {
    pendingThemeMusicDownloadsAtom,
    PENDING_THEME_MUSIC_DOWNLOAD_TTL_MS,
    PENDING_THEME_MUSIC_POLL_INTERVAL_MS,
} from "@/lib/theme/anime-themes/theme-ost-atoms"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import React from "react"

export const THEME_MUSIC_TRACKS_KEY = "theme-music-tracks"
export const THEME_MUSIC_METADATA_KEY = "theme-music-metadata"
export const THEME_MUSIC_ALL_KEY = "theme-music-all"

export type ThemeMusicTrack = {
    filename: string
    url: string
    name: string
    size?: number
}

export type ThemeMusicMetadataTrack = ThemeMusicTrack & {
    title?: string
    artist?: string
    album?: string
    albumArtist?: string
    trackNumber?: number
    year?: number
}

export type ThemeMusicSummary = {
    themeId: string
    trackCount: number
}

// Torrent search result shape — mirrors backend torrent.AnimeTorrent (minimum fields used in UI).
export type ThemeMusicTorrent = {
    name: string
    magnetLink?: string
    infoHash?: string
    link?: string
    downloadUrl?: string
    size?: number
    formattedSize?: string
    seeders?: number
    leechers?: number
    date?: string
    provider?: string
    releaseGroup?: string
    resolution?: string
}

export type ThemeMusicSearchResponse = {
    torrents: ThemeMusicTorrent[]
    previews?: any[]
    [key: string]: any
}

// ─── Pending-download helpers ───────────────────────────────────────────────

/**
 * Returns true when a download was recently queued for the given theme(s) and
 * we should be polling the list endpoint to surface new tracks automatically.
 *
 * Pass `null` to mean "any theme".
 */
function useIsThemePendingDownload(themeId: string | null): boolean {
    const pending = useAtomValue(pendingThemeMusicDownloadsAtom)
    return React.useMemo(() => {
        const now = Date.now()
        if (themeId === null) {
            for (const k of Object.keys(pending)) {
                if (pending[k] > now) return true
            }
            return false
        }
        const expiry = pending[themeId]
        return !!expiry && expiry > now
    }, [pending, themeId])
}

/** Drop a themeId from the pending map (when we've confirmed a track appeared). */
function useClearThemePending() {
    const setPending = useSetAtom(pendingThemeMusicDownloadsAtom)
    return React.useCallback((themeId: string) => {
        setPending(prev => {
            if (!(themeId in prev)) return prev
            const { [themeId]: _drop, ...rest } = prev
            return rest
        })
    }, [setPending])
}

/** Prune entries whose expiry is in the past. Cheap; safe to call anywhere. */
function usePrunePending() {
    const setPending = useSetAtom(pendingThemeMusicDownloadsAtom)
    return React.useCallback(() => {
        setPending(prev => {
            const now = Date.now()
            let changed = false
            const next: Record<string, number> = {}
            for (const k of Object.keys(prev)) {
                if (prev[k] > now) next[k] = prev[k]
                else changed = true
            }
            return changed ? next : prev
        })
    }, [setPending])
}

// ─── Queries ────────────────────────────────────────────────────────────────

export function useListThemeMusicTracks(themeId: string, enabled = true) {
    const pending = useIsThemePendingDownload(themeId || null)
    const clearPending = useClearThemePending()
    const q = useServerQuery<ThemeMusicTrack[]>({
        endpoint: `/api/v1/theme-music/tracks?themeId=${encodeURIComponent(themeId)}`,
        method: "GET",
        queryKey: [THEME_MUSIC_TRACKS_KEY, themeId],
        enabled: enabled && !!themeId,
        refetchInterval: pending ? PENDING_THEME_MUSIC_POLL_INTERVAL_MS : false,
        refetchIntervalInBackground: true,
    } as any)
    // Auto-clear the pending flag once tracks actually appear on disk.
    React.useEffect(() => {
        if (pending && themeId && (q.data?.length ?? 0) > 0) {
            clearPending(themeId)
        }
    }, [pending, themeId, q.data?.length, clearPending])
    return q
}

export function useListThemeMusicMetadata(themeId: string | null | undefined, enabled = true) {
    const id = themeId || ""
    const pending = useIsThemePendingDownload(id || null)
    const clearPending = useClearThemePending()
    const q = useServerQuery<ThemeMusicMetadataTrack[]>({
        endpoint: `/api/v1/theme-music/metadata?themeId=${encodeURIComponent(id)}`,
        method: "GET",
        queryKey: [THEME_MUSIC_METADATA_KEY, id],
        enabled: enabled && !!id,
        refetchInterval: pending ? PENDING_THEME_MUSIC_POLL_INTERVAL_MS : false,
        refetchIntervalInBackground: true,
    } as any)
    React.useEffect(() => {
        if (pending && id && (q.data?.length ?? 0) > 0) {
            clearPending(id)
        }
    }, [pending, id, q.data?.length, clearPending])
    return q
}

export function useListAllThemeMusic(enabled = true) {
    const anyPending = useIsThemePendingDownload(null)
    return useServerQuery<ThemeMusicSummary[]>({
        endpoint: "/api/v1/theme-music/all",
        method: "GET",
        queryKey: [THEME_MUSIC_ALL_KEY],
        enabled,
        refetchInterval: anyPending ? PENDING_THEME_MUSIC_POLL_INTERVAL_MS : false,
        refetchIntervalInBackground: true,
    } as any)
}

/** Read-only hook for components that just want to badge a theme as "downloading". */
export function useIsThemeMusicDownloading(themeId: string | null | undefined): boolean {
    return useIsThemePendingDownload(themeId || null)
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export function useSearchThemeMusic() {
    return useServerMutation<ThemeMusicSearchResponse, { themeId?: string; query: string; queries?: string[]; provider?: string }>({
        endpoint: "/api/v1/theme-music/search",
        method: "POST",
    })
}

export function useDownloadThemeMusic() {
    const queryClient = useQueryClient()
    const [pending, setPending] = useAtom(pendingThemeMusicDownloadsAtom)
    const prune = usePrunePending()
    return useServerMutation<boolean, { themeId: string; magnetUrl?: string; provider?: string; torrent?: any; replaceExisting?: boolean }>({
        endpoint: "/api/v1/theme-music/download",
        method: "POST",
        onSuccess: (_data: any, vars: any) => {
            const themeId = vars?.themeId as string | undefined
            if (themeId) {
                queryClient.invalidateQueries({ queryKey: [THEME_MUSIC_TRACKS_KEY, themeId] })
                queryClient.invalidateQueries({ queryKey: [THEME_MUSIC_METADATA_KEY, themeId] })
                // Optimistically mark this theme as "downloading" so list hooks
                // start polling until the torrent finishes (or the TTL expires).
                const next: Record<string, number> = {}
                const now = Date.now()
                for (const k of Object.keys(pending)) if (pending[k] > now) next[k] = pending[k]
                next[themeId] = now + PENDING_THEME_MUSIC_DOWNLOAD_TTL_MS
                setPending(next)
            } else {
                prune()
            }
            queryClient.invalidateQueries({ queryKey: [THEME_MUSIC_ALL_KEY] })
        },
    } as any)
}

export function useDeleteAllThemeMusic() {
    const queryClient = useQueryClient()
    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)
    const clearPending = useClearThemePending()
    return useMutation<boolean | undefined, Error, string>({
        mutationFn: async (themeId: string) => {
            return buildSeaQuery<boolean>({
                endpoint: `/api/v1/theme-music/${encodeURIComponent(themeId)}`,
                method: "DELETE",
                password,
                profileToken,
            })
        },
        onSuccess: (_data, themeId) => {
            clearPending(themeId)
            queryClient.invalidateQueries({ queryKey: [THEME_MUSIC_TRACKS_KEY, themeId] })
            queryClient.invalidateQueries({ queryKey: [THEME_MUSIC_METADATA_KEY, themeId] })
            queryClient.invalidateQueries({ queryKey: [THEME_MUSIC_ALL_KEY] })
        },
    })
}

export function useDeleteThemeMusicTrack() {
    const queryClient = useQueryClient()
    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)
    return useMutation<boolean | undefined, Error, { themeId: string; filename: string }>({
        mutationFn: async ({ themeId, filename }) => {
            // Backend route accepts a wildcard (subfolder) path — encode each segment.
            const encodedPath = filename
                .split("/")
                .map(s => encodeURIComponent(s))
                .join("/")
            return buildSeaQuery<boolean>({
                endpoint: `/api/v1/theme-music/${encodeURIComponent(themeId)}/file/${encodedPath}`,
                method: "DELETE",
                password,
                profileToken,
            })
        },
        onSuccess: (_data, { themeId }) => {
            queryClient.invalidateQueries({ queryKey: [THEME_MUSIC_TRACKS_KEY, themeId] })
            queryClient.invalidateQueries({ queryKey: [THEME_MUSIC_METADATA_KEY, themeId] })
            queryClient.invalidateQueries({ queryKey: [THEME_MUSIC_ALL_KEY] })
        },
    })
}
