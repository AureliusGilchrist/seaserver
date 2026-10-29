// What played since the last "Still watching?" check, and how it is shown back. Pure functions so
// the rules (what counts, what looks dozed-off, which cards show first) are testable on their own.

export type StillWatchingEpisodeSnapshot = {
    aniDBEpisode?: string
    episodeNumber?: number
    progressNumber?: number
    displayTitle?: string
    episodeTitle?: string
    image?: string
    description?: string
    isFiller?: boolean
    length?: number
}

export type StillWatchingHistoryEntry = {
    key: string // mediaId:progressNumber
    mediaId: number
    episode: StillWatchingEpisodeSnapshot
    startedAt: number
    endedAt?: number
    /** Pointer and key input while it played. */
    inputs: number
    /** Longest stretch without input while it played (ms). */
    longestIdleMs: number
    lastInputAt: number
}

/** Episodes shorter than this never count as dozed-off: there is too little to go on. */
export const DOZE_MIN_PLAYED_MS = 5 * 60_000

export function startEntry(mediaId: number, episode: StillWatchingEpisodeSnapshot, now: number): StillWatchingHistoryEntry {
    return {
        key: `${mediaId}:${episode.progressNumber ?? episode.episodeNumber ?? 0}`,
        mediaId,
        episode,
        startedAt: now,
        inputs: 0,
        longestIdleMs: 0,
        lastInputAt: now,
    }
}

export function noteInput(entry: StillWatchingHistoryEntry, now: number) {
    entry.longestIdleMs = Math.max(entry.longestIdleMs, now - entry.lastInputAt)
    entry.lastInputAt = now
    entry.inputs += 1
}

export function finishEntry(entry: StillWatchingHistoryEntry, now: number): StillWatchingHistoryEntry {
    return {
        ...entry,
        endedAt: now,
        longestIdleMs: Math.max(entry.longestIdleMs, now - entry.lastInputAt),
    }
}

/**
 * Whether the episode probably played to nobody: no input at all while it ran, or a quiet stretch
 * covering nearly all of it. Short plays (a resumed tail end) are never flagged.
 */
export function looksDozed(entry: StillWatchingHistoryEntry): boolean {
    const played = (entry.endedAt ?? entry.lastInputAt) - entry.startedAt
    if (played < DOZE_MIN_PLAYED_MS) return false
    if (entry.inputs === 0) return true
    return entry.longestIdleMs >= played * 0.9
}

/** Adds a finished entry; a replayed episode replaces its earlier entry rather than counting twice. */
export function pushHistory(history: StillWatchingHistoryEntry[], entry: StillWatchingHistoryEntry): StillWatchingHistoryEntry[] {
    return [...history.filter(e => e.key !== entry.key), entry]
}

/** The recap order: newest first, dozed-off ones ahead of the rest when asked. */
export function recapOrder(history: StillWatchingHistoryEntry[], dozedFirst: boolean): StillWatchingHistoryEntry[] {
    const newest = [...history].sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
    if (!dozedFirst) return newest
    return [...newest.filter(looksDozed), ...newest.filter(e => !looksDozed(e))]
}

/** Splits the recap into what shows now and what "Show more" reveals. */
export function splitShowMore<T>(items: T[], initial: number): { shown: T[], hidden: T[] } {
    const n = Math.max(1, initial)
    return { shown: items.slice(0, n), hidden: items.slice(n) }
}

/** A description cut to a couple of sentences for the "short" setting. */
export function shortDescription(text: string | undefined, max = 180): string {
    if (!text) return ""
    const clean = text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
    if (clean.length <= max) return clean
    const cut = clean.slice(0, max)
    const sentence = cut.lastIndexOf(". ")
    // A whole sentence needs no ellipsis; a cut word does.
    return sentence > max * 0.5 ? cut.slice(0, sentence + 1) : cut.replace(/\s+\S*$/, "") + "…"
}
