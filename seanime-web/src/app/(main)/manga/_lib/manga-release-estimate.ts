import { HibikeManga_ChapterDetails } from "@/api/generated/types"

const DAY_MS = 24 * 60 * 60 * 1000
const LOOKBACK_GAPS = 5
const MINIMUM_GAPS = 3

export type MangaReleaseEstimate = {
    latestChapter: string
    intervalDays: number
    nextReleaseAt: Date
    daysUntilNext: number
}

function releaseDay(value: string | undefined): number | null {
    if (!value) return null
    const timestamp = Date.parse(value)
    if (!Number.isFinite(timestamp)) return null
    const date = new Date(timestamp)
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function getMangaReleaseEstimate(
    chapters: HibikeManga_ChapterDetails[],
    now: number = Date.now(),
): MangaReleaseEstimate | null {
    const datedReleases = [...new Set(chapters
        .map(chapter => releaseDay(chapter.updatedAt))
        .filter((date): date is number => date !== null))]
        .sort((a, b) => a - b)

    const gaps = datedReleases.slice(1).map((date, index) => (date - datedReleases[index]!) / DAY_MS)
        .filter(gap => gap > 0)
        .slice(-LOOKBACK_GAPS)
        .sort((a, b) => a - b)

    if (gaps.length < MINIMUM_GAPS) return null

    const middle = Math.floor(gaps.length / 2)
    const median = gaps.length % 2
        ? gaps[middle]!
        : (gaps[middle - 1]! + gaps[middle]!) / 2
    const latestRelease = datedReleases[datedReleases.length - 1]!
    const nextReleaseAt = new Date(latestRelease + median * DAY_MS)
    const chapterNumbers = chapters
        .map(chapter => Number.parseFloat(chapter.chapter))
        .filter(Number.isFinite)
    const latestChapter = chapterNumbers.length
        ? String(Math.max(...chapterNumbers))
        : ""

    return {
        latestChapter,
        intervalDays: median,
        nextReleaseAt,
        daysUntilNext: Math.max(0, Math.ceil((nextReleaseAt.getTime() - now) / DAY_MS)),
    }
}
