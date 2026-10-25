import React from "react"

/**
 * Progress queue: what the user has watched that AniList does not show yet.
 *
 * Two sources, merged:
 *  - the server's retry queue (progress updates AniList could not take yet — rate limit, outage),
 *    pushed over the `progress-queue-updated` websocket event and the pending-sync poll;
 *  - this run's memory: episodes completed and sent (or queued) since the app was opened, kept in
 *    sessionStorage. It covers the moment between finishing an episode and AniList / the cache
 *    agreeing, which is exactly when the old code saw a "two episode gap" and asked to confirm.
 *
 * "Run" = this app session (sessionStorage), so a fresh launch starts clean.
 */

export type QueuedProgressItem = { mediaId: number, progress: number, queuedAt?: string }

const RUN_KEY = "sea-progress-run"
const DISMISSED_KEY = "sea-progress-run-dismissed"

let serverItems: QueuedProgressItem[] = []
let run: Record<number, number> = readSession(RUN_KEY, {})
let dismissed: Record<string, true> = readSession(DISMISSED_KEY, {})
let version = 0
const listeners = new Set<() => void>()

function readSession<T>(key: string, fallback: T): T {
    try {
        const raw = sessionStorage.getItem(key)
        return raw ? JSON.parse(raw) as T : fallback
    }
    catch {
        return fallback
    }
}

function writeSession(key: string, value: unknown) {
    try {
        sessionStorage.setItem(key, JSON.stringify(value))
    }
    catch {
        // storage unavailable (private mode, quota) — memory copy still works for this tab
    }
}

function emit() {
    version++
    listeners.forEach(l => l())
}

/** Replace the server's queued items (from the websocket event or the pending-sync poll). */
export function setServerProgressQueue(items: QueuedProgressItem[] | null | undefined) {
    serverItems = Array.isArray(items) ? items : []
    emit()
}

/** Record that an episode was completed and sent to AniList (or queued) during this run. */
export function markRunProgress(mediaId: number, episodeNumber: number) {
    if (!mediaId || !episodeNumber) return
    if ((run[mediaId] ?? 0) >= episodeNumber) return
    run = { ...run, [mediaId]: episodeNumber }
    writeSession(RUN_KEY, run)
    emit()
}

/** Undo markRunProgress for a write the server rejected outright. */
export function unmarkRunProgress(mediaId: number, episodeNumber: number) {
    if (run[mediaId] !== episodeNumber) return
    const next = { ...run }
    delete next[mediaId]
    run = next
    writeSession(RUN_KEY, run)
    emit()
}

/** Forget this run's memory for a media, e.g. after the user sets progress by hand. */
export function resetRunProgress(mediaId: number) {
    if (run[mediaId] === undefined) return
    const next = { ...run }
    delete next[mediaId]
    run = next
    writeSession(RUN_KEY, run)
    emit()
}

/** Remember that the user dismissed the progress prompt for an episode, so it is not asked again this run. */
export function markPromptDismissed(mediaId: number, episodeNumber: number) {
    dismissed = { ...dismissed, [`${mediaId}:${episodeNumber}`]: true }
    writeSession(DISMISSED_KEY, dismissed)
}

export function wasPromptDismissed(mediaId: number, episodeNumber: number) {
    return !!dismissed[`${mediaId}:${episodeNumber}`]
}

/** Highest episode watched-but-maybe-not-on-AniList for a media (0 if none). */
export function getQueuedUpTo(mediaId: number | null | undefined): number {
    if (!mediaId) return 0
    let max = run[mediaId] ?? 0
    for (const it of serverItems) {
        if (it.mediaId === mediaId && it.progress > max) max = it.progress
    }
    return max
}

/** Progress as far as this app knows: AniList's value, or further if more is queued/sent this run. */
export function getEffectiveProgress(mediaId: number | null | undefined, listProgress: number | null | undefined): number {
    return Math.max(listProgress ?? 0, getQueuedUpTo(mediaId))
}

function subscribe(cb: () => void) {
    listeners.add(cb)
    return () => listeners.delete(cb)
}

/**
 * Queue state for one media's episode lists.
 *
 * isQueued(ep): watched and sent, but AniList (as cached) doesn't show it yet. Such an episode is
 * shown grayed out — still playable — so the episode the user is actually on stays obvious.
 */
export function useProgressQueue(mediaId: number | null | undefined, listProgress: number | null | undefined) {
    React.useSyncExternalStore(subscribe, () => version, () => version)
    const real = listProgress ?? 0
    const queuedUpTo = getQueuedUpTo(mediaId)
    const effectiveProgress = Math.max(real, queuedUpTo)
    const isQueued = React.useCallback((episodeNumber: number | null | undefined) => {
        if (!episodeNumber) return false
        return episodeNumber > real && episodeNumber <= queuedUpTo
    }, [real, queuedUpTo])
    return { realProgress: real, queuedUpTo, effectiveProgress, isQueued, hasQueued: queuedUpTo > real }
}

/** All server-queued items (for the sync indicator). */
export function useServerProgressQueue() {
    React.useSyncExternalStore(subscribe, () => version, () => version)
    return serverItems
}
