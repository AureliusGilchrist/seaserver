export type MangaChapterReleasePoint = {
    chapter: string
    updatedAt?: string
}

export type MangaChapterReleaseEstimate = {
    intervalDays: number
    nextReleaseAt: Date
}

const DAY_IN_MS = 24 * 60 * 60 * 1000

export function estimateMangaChapterRelease(
    releaseHistory: readonly MangaChapterReleasePoint[],
): MangaChapterReleaseEstimate | undefined {
    const byChapter = new Map<number, { chapter: number; date: Date }>()

    for (const point of releaseHistory) {
        const chapter = Number.parseFloat(point.chapter)
        if (!Number.isFinite(chapter) || !point.updatedAt || !/^\d{4}-\d{2}-\d{2}$/.test(point.updatedAt)) continue

        const date = new Date(`${point.updatedAt}T00:00:00.000Z`)
        if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== point.updatedAt) continue

        const previous = byChapter.get(chapter)
        if (!previous || date > previous.date) {
            byChapter.set(chapter, { chapter, date })
        }
    }

    const points = [...byChapter.values()].sort((a, b) => a.chapter - b.chapter)
    const intervals = points.slice(1).flatMap((point, index) => {
        const days = Math.round((point.date.getTime() - points[index].date.getTime()) / DAY_IN_MS)
        return days > 0 ? [days] : []
    })

    if (intervals.length < 3) return undefined

    const sortedIntervals = [...intervals].sort((a, b) => a - b)
    const middle = Math.floor(sortedIntervals.length / 2)
    const median = sortedIntervals.length % 2
        ? sortedIntervals[middle]
        : (sortedIntervals[middle - 1] + sortedIntervals[middle]) / 2
    if (median > 90) return undefined
    const tolerance = Math.max(2, median * 0.3)
    if (intervals.some(days => Math.abs(days - median) > tolerance)) return undefined

    const intervalDays = Math.max(1, Math.round(median))
    const mostRecentRelease = points[points.length - 1].date
    return {
        intervalDays,
        nextReleaseAt: new Date(mostRecentRelease.getTime() + intervalDays * DAY_IN_MS),
    }
}
