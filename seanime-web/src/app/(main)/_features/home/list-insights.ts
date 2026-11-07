export type ListCollection = {
    MediaListCollection?: {
        lists?: Array<{
            status?: string
            entries?: Array<{ status?: string, progress?: number, media?: { id: number } }>
        }>
    }
}

export function countLists(collection: ListCollection | undefined) {
    if (!collection?.MediaListCollection) return null
    const entries = new Map<number, { status?: string, progress: number }>()
    for (const list of collection.MediaListCollection.lists ?? []) {
        for (const entry of list.entries ?? []) {
            const id = entry.media?.id
            if (!id) continue
            const status = entry.status ?? list.status
            const previous = entries.get(id)
            if (!previous || (!previous.status && status)) {
                entries.set(id, { status, progress: entry.progress ?? 0 })
            }
        }
    }
    let onLists = 0, planning = 0, current = 0, completed = 0, progress = 0
    for (const entry of entries.values()) {
        onLists++
        progress += entry.progress
        if (entry.status === "PLANNING") {
            planning++
            continue
        }
        if (entry.status === "CURRENT" || entry.status === "REPEATING") current++
        if (entry.status === "COMPLETED") completed++
    }
    return { onLists, planning, current, completed, progress }
}

/**
 * The details-page metadata — genres, themes, formats, release status, origin, era, length — read
 * across a whole list instead of one title: what the person's collection is made of.
 */
type DescribedMedia = {
    id: number
    title?: { userPreferred?: string, romaji?: string, english?: string }
    coverImage?: { large?: string, medium?: string, color?: string }
    bannerImage?: string
    format?: string
    status?: string
    genres?: string[]
    tags?: Array<{ name: string, rank?: number }>
    countryOfOrigin?: string
    meanScore?: number
    seasonYear?: number
    startDate?: { year?: number }
    episodes?: number
    duration?: number
    chapters?: number
    volumes?: number
    nextAiringEpisode?: { airingAt: number, episode: number }
}

export type DescribableCollection = {
    MediaListCollection?: {
        lists?: Array<{
            status?: string
            entries?: Array<{
                status?: string
                progress?: number
                score?: number
                repeat?: number
                completedAt?: { year?: number }
                media?: DescribedMedia
            }>
        }>
    }
}

export type Tally = { key: string, count: number }

export type ListDescription = {
    /** Entries that are not only planned. */
    started: number
    paused: number
    dropped: number
    repeats: number
    completedThisYear: number
    /** Minutes, anime only: episodes watched (and rewatched) times their length. */
    minutesWatched: number
    /** Episodes or chapters still to go on what is being watched or read. */
    remaining: number
    /** AniList community mean (0–100) of the titles on the list, planning excluded. */
    communityMean: number | null
    scoredCount: number
    genres: Tally[]
    tags: Tally[]
    formats: Tally[]
    releaseStatus: Tally[]
    countries: Tally[]
    decades: Tally[]
    topRated: Array<{ id: number, title: string, image?: string, score: number }>
    nextAiring: { id: number, title: string, episode: number, airingAt: number } | null
}

function titleOf(media: DescribedMedia) {
    return media.title?.userPreferred || media.title?.english || media.title?.romaji || "Untitled"
}

function tally(map: Map<string, number>, limit?: number): Tally[] {
    const list = [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    return limit ? list.slice(0, limit) : list
}

function bump(map: Map<string, number>, key: string | undefined | null) {
    if (key) map.set(key, (map.get(key) ?? 0) + 1)
}

export function describeLists(collection: DescribableCollection | undefined, medium: "anime" | "manga", now = new Date()): ListDescription | null {
    if (!collection?.MediaListCollection) return null
    type Entry = NonNullable<NonNullable<NonNullable<DescribableCollection["MediaListCollection"]>["lists"]>[number]["entries"]>[number]
    const entries = new Map<number, Entry & { status?: string }>()
    for (const list of collection.MediaListCollection.lists ?? []) {
        for (const entry of list.entries ?? []) {
            const id = entry.media?.id
            if (!id) continue
            const status = entry.status ?? list.status
            const previous = entries.get(id)
            if (!previous || (!previous.status && status)) entries.set(id, { ...entry, status })
        }
    }

    const genres = new Map<string, number>(), tags = new Map<string, number>(), formats = new Map<string, number>()
    const releaseStatus = new Map<string, number>(), countries = new Map<string, number>(), decades = new Map<string, number>()
    let started = 0, paused = 0, dropped = 0, repeats = 0, completedThisYear = 0, minutesWatched = 0, remaining = 0
    let meanSum = 0, meanCount = 0
    const scored: ListDescription["topRated"] = []
    let nextAiring: ListDescription["nextAiring"] = null
    const nowSeconds = Math.floor(now.getTime() / 1000)

    for (const entry of entries.values()) {
        const media = entry.media!
        const progress = entry.progress ?? 0
        const status = entry.status
        const planned = status === "PLANNING"
        const active = status === "CURRENT" || status === "REPEATING"

        // What is coming next matters for planned shows as much as watched ones.
        const airing = media.nextAiringEpisode
        if ((active || planned) && airing && airing.airingAt > nowSeconds && (!nextAiring || airing.airingAt < nextAiring.airingAt)) {
            nextAiring = { id: media.id, title: titleOf(media), episode: airing.episode, airingAt: airing.airingAt }
        }
        if (planned) continue

        started++
        if (status === "PAUSED") paused++
        if (status === "DROPPED") dropped++
        if (status === "COMPLETED" && entry.completedAt?.year === now.getFullYear()) completedThisYear++
        repeats += entry.repeat ?? 0

        const length = media.episodes ?? 0
        const minutes = media.duration || (media.format === "MOVIE" ? 0 : 24)
        if (medium === "anime") {
            minutesWatched += progress * minutes + (entry.repeat ?? 0) * length * minutes
        }
        const total = media.episodes ?? media.chapters
        if (active && total && total > progress) remaining += total - progress

        if (media.meanScore) {
            meanSum += media.meanScore
            meanCount++
        }
        if (entry.score && entry.score > 0) {
            scored.push({ id: media.id, title: titleOf(media), image: media.coverImage?.large || media.coverImage?.medium, score: entry.score })
        }

        for (const genre of media.genres ?? []) bump(genres, genre)
        for (const tag of media.tags ?? []) if ((tag.rank ?? 0) >= 60) bump(tags, tag.name)
        bump(formats, media.format)
        bump(releaseStatus, media.status)
        bump(countries, media.countryOfOrigin)
        const year = media.seasonYear ?? media.startDate?.year
        if (year) bump(decades, `${Math.floor(year / 10) * 10}s`)
    }

    scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))

    return {
        started, paused, dropped, repeats, completedThisYear, minutesWatched, remaining,
        communityMean: meanCount ? Math.round(meanSum / meanCount) : null,
        scoredCount: scored.length,
        genres: tally(genres, 8),
        tags: tally(tags, 12),
        formats: tally(formats),
        releaseStatus: tally(releaseStatus),
        countries: tally(countries),
        decades: tally(decades).sort((a, b) => a.key.localeCompare(b.key)),
        topRated: scored.slice(0, 5),
        nextAiring,
    }
}

export function formatWatchMinutes(minutes: number) {
    if (minutes < 60) return `${minutes}m`
    const days = Math.floor(minutes / 1440)
    const hours = Math.floor((minutes % 1440) / 60)
    return days ? `${days}d ${hours}h` : `${hours}h`
}
