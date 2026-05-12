"use client"
import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

/**
 * Theme OST player atoms.
 *
 * The player is a single persistent audio engine that lives inside
 * AnimeThemeMusicPlayer (anime-theme-provider.tsx). External components
 * (mini-player, per-theme controls) read & write these atoms to drive it.
 */

export type ThemeOstLoopMode = "off" | "one" | "all"

// Which theme's music is currently playing. `null` = follow the currently
// active anime theme (default behaviour). When set, the equipped theme's
// tracks play regardless of which page/anime the user is viewing.
export const equippedThemeOstIdAtom = atomWithStorage<string | null>(
    "sea-theme-ost-equipped",
    null,
)

// Loop mode for the playlist.
export const themeOstLoopModeAtom = atomWithStorage<ThemeOstLoopMode>(
    "sea-theme-ost-loop",
    "all",
)

// User-controlled play/pause for the OST playlist. We deliberately default
// to false (auto-load-paused) so the user must opt in to playback.
export const themeOstPlayingAtom = atom<boolean>(false)

// Current track index inside the active playlist.
export const themeOstCurrentTrackIndexAtom = atom<number>(0)

// Write a number (seconds) to request a seek. The player consumes the value
// and resets it to null. Reads always return null between operations.
export const themeOstSeekRequestAtom = atom<number | null>(null)

// Read-only playback position state, written by the player on time-update.
export const themeOstPositionAtom = atom<{ current: number; duration: number }>({
    current: 0,
    duration: 0,
})

// Write "next" or "prev" to request a skip. The player consumes the value
// and resets it to null.
export const themeOstSkipDirectionAtom = atom<"next" | "prev" | null>(null)

// True while any <video> element is actively playing — the player fades out
// while this is true and fades back in when it returns to false.
export const videoFadeActiveAtom = atom<boolean>(false)

// Map of themeId -> epoch ms when the optimistic "downloading" state should
// expire. While a themeId has an entry whose value is in the future, any
// theme-music listing query for that theme (or the "all" summary) will poll
// every few seconds so new tracks appear automatically once the torrent
// completes.
export const pendingThemeMusicDownloadsAtom = atom<Record<string, number>>({})

// Default expiry for a newly-added download (10 minutes). After this, polling
// stops automatically even if no new tracks have appeared. The user can
// always trigger a refresh manually.
export const PENDING_THEME_MUSIC_DOWNLOAD_TTL_MS = 10 * 60 * 1000

// Interval used while at least one theme is in the pending map.
export const PENDING_THEME_MUSIC_POLL_INTERVAL_MS = 8000
