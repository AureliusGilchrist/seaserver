/**
 * What the chapter list should show, from what is known about the request.
 *
 * "No chapters" is only ever an answer: a source that has not been chosen yet, or a request that
 * has not come back, has no data either, and treating that as empty is what made a slow source
 * read as a series with nothing in it. Downloaded chapters stand in when the source fails or finds
 * nothing, so chapters on disk never vanish behind a source that is down.
 */
export type ChapterListStatus = "loading" | "ready" | "fallback" | "error" | "empty" | "no-sources"

export function getChapterListStatus(s: {
    /** The extension list, the cache reset or the chapter request is in flight. */
    busy: boolean
    /** The source has answered: chapters (possibly none) or an error. */
    hasData: boolean
    hasError: boolean
    /** Chapters the source returned, after filters. */
    chapterCount: number
    /** Chapters already downloaded for this series. */
    downloadedCount: number
    hasSources: boolean
    hasProvider: boolean
}): ChapterListStatus {
    if (s.busy) return "loading"
    const answered = s.hasData || s.hasError
    if (!answered && (s.hasSources || s.hasProvider)) return "loading"
    if (s.chapterCount > 0) return "ready"
    if (answered && s.downloadedCount > 0) return "fallback"
    if (s.hasError) return "error"
    if (!s.hasSources) return "no-sources"
    return "empty"
}
