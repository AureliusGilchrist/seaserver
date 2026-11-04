import {
    AL_AnimeCollection_MediaListCollection_Lists_Entries,
    AL_BaseAnime,
    AL_BaseManga,
    AL_MangaCollection_MediaListCollection_Lists_Entries,
    AL_MediaFormat,
    AL_MediaSeason,
    AL_MediaStatus,
    Anime_Episode,
    Anime_LibraryCollectionEntry,
    Anime_LibraryCollectionList,
    Continuity_WatchHistory,
    Manga_MangaLatestChapterNumberItem,
} from "@/api/generated/types"
import { getMangaEntryLatestChapterNumber, MangaEntryFilters } from "@/app/(main)/manga/_lib/handle-manga-selected-provider"
import sortBy from "lodash/sortBy"
import { gojuuonSortKey } from "./gojuuon"
import { anilist_getUnwatchedCount, displayTitle } from "./media"

type BaseCollectionSorting =
    "START_DATE"
    | "START_DATE_DESC"
    | "END_DATE"
    | "END_DATE_DESC"
    | "SCORE"
    | "SCORE_DESC"
    | "RELEASE_DATE"
    | "RELEASE_DATE_DESC"
    | "PROGRESS"
    | "PROGRESS_DESC"
    | "TITLE"
    | "TITLE_DESC"
    | "GOJUUON"
    | "GOJUUON_DESC"
    | "AVERAGE_SCORE"
    | "AVERAGE_SCORE_DESC"
    | "EPISODE_COUNT"
    | "EPISODE_COUNT_DESC"
    | "AIRING_STATUS"
    | "AIRING_STATUS_DESC"


type CollectionSorting<T extends CollectionType> = BaseCollectionSorting | (T extends "anime" ?
    "PROGRESS_DESC"
    | "PROGRESS"
    | "AIRDATE"
    | "AIRDATE_DESC"
    | "UNWATCHED_EPISODES"
    | "UNWATCHED_EPISODES_DESC"
    | "LAST_WATCHED"
    | "LAST_WATCHED_DESC"
    : T extends "manga" ?
        "PROGRESS"
        | "PROGRESS_DESC"
        | "UNREAD_CHAPTERS"
        | "UNREAD_CHAPTERS_DESC"
        | "LAST_READ"
        | "LAST_READ_DESC"
        : never)


type ContinueWatchingSorting =
    "AIRDATE"
    | "AIRDATE_DESC"
    | "EPISODE_NUMBER"
    | "EPISODE_NUMBER_DESC"
    | "UNWATCHED_EPISODES"
    | "UNWATCHED_EPISODES_DESC"
    | "SCORE"
    | "SCORE_DESC"
    | "START_DATE"
    | "START_DATE_DESC"
    | "LAST_WATCHED"
    | "LAST_WATCHED_DESC"

export const CONTINUE_WATCHING_SORTING_OPTIONS = [
    { label: "Aired recently", value: "AIRDATE_DESC" },
    { label: "Aired oldest", value: "AIRDATE" },
    { label: "Highest episode number", value: "EPISODE_NUMBER_DESC" },
    { label: "Lowest episode number", value: "EPISODE_NUMBER" },
    { label: "Most unwatched episodes", value: "UNWATCHED_EPISODES_DESC" },
    { label: "Least unwatched episodes", value: "UNWATCHED_EPISODES" },
    { label: "Highest score", value: "SCORE_DESC" },
    { label: "Lowest score", value: "SCORE" },
    { label: "Started recently", value: "START_DATE_DESC" },
    { label: "Oldest start date", value: "START_DATE" },
    { label: "Most recent watch", value: "LAST_WATCHED_DESC" },
    { label: "Least recent watch", value: "LAST_WATCHED" },
]


export const COLLECTION_SORTING_OPTIONS = [
    { label: "Highest score", value: "SCORE_DESC" },
    { label: "Lowest score", value: "SCORE" },
    { label: "Title", value: "TITLE" },
    { label: "Title (Z-A)", value: "TITLE_DESC" },
    { label: "Highest progress", value: "PROGRESS_DESC" },
    { label: "Lowest progress", value: "PROGRESS" },
    { label: "Started recently", value: "START_DATE_DESC" },
    { label: "Oldest start date", value: "START_DATE" },
    { label: "Completed recently", value: "END_DATE_DESC" },
    { label: "Oldest completion date", value: "END_DATE" },
    { label: "Released recently", value: "RELEASE_DATE_DESC" },
    { label: "Oldest release", value: "RELEASE_DATE" },
]

export const ANIME_COLLECTION_SORTING_OPTIONS = [
    { label: "Gojuuon (series + chronology)", value: "GOJUUON" },
    { label: "Aired recently and not up-to-date", value: "AIRDATE_DESC" },
    { label: "Aired oldest and not up-to-date", value: "AIRDATE" },
    { label: "Most unwatched episodes", value: "UNWATCHED_EPISODES_DESC" },
    { label: "Least unwatched episodes", value: "UNWATCHED_EPISODES" },
    { label: "Most recent watch", value: "LAST_WATCHED_DESC" },
    { label: "Least recent watch", value: "LAST_WATCHED" },
    ...COLLECTION_SORTING_OPTIONS,
]

export const MANGA_COLLECTION_SORTING_OPTIONS = [
    { label: "Gojuuon (series + chronology)", value: "GOJUUON" },
    { label: "Most unread chapters", value: "UNREAD_CHAPTERS_DESC" },
    { label: "Least unread chapters", value: "UNREAD_CHAPTERS" },
    ...COLLECTION_SORTING_OPTIONS,
]

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * One way to order a library list, in both directions. The sort menu shows the field and flips
 * between `asc` and `desc`; both are ordinary sorting values, the same kind of string the theme's
 * default sorting settings already hold.
 */
export type LibrarySortField = {
    label: string
    asc: string
    desc: string
    ascLabel: string
    descLabel: string
    /** Direction picked when switching to this field. */
    defaultDesc?: boolean
}

const NEWEST = { ascLabel: "Oldest first", descLabel: "Newest first", defaultDesc: true }
const RECENT = { ascLabel: "Least recent first", descLabel: "Most recent first", defaultDesc: true }
const HIGHEST = { ascLabel: "Lowest first", descLabel: "Highest first", defaultDesc: true }
const MOST = { ascLabel: "Fewest first", descLabel: "Most first", defaultDesc: true }

export const SORT_FIELD_RELEASE_DATE: LibrarySortField = { label: "Release date", asc: "RELEASE_DATE", desc: "RELEASE_DATE_DESC", ...NEWEST }
export const SORT_FIELD_TITLE: LibrarySortField = { label: "Title", asc: "TITLE", desc: "TITLE_DESC", ascLabel: "A to Z", descLabel: "Z to A" }
export const SORT_FIELD_GOJUUON: LibrarySortField = {
    label: "Gojuuon", asc: "GOJUUON", desc: "GOJUUON_DESC", ascLabel: "あ to ん", descLabel: "ん to あ",
}
export const SORT_FIELD_SCORE: LibrarySortField = { label: "Your score", asc: "SCORE", desc: "SCORE_DESC", ...HIGHEST }
export const SORT_FIELD_AVERAGE_SCORE: LibrarySortField = { label: "Average score", asc: "AVERAGE_SCORE", desc: "AVERAGE_SCORE_DESC", ...HIGHEST }
export const SORT_FIELD_PROGRESS: LibrarySortField = { label: "Progress", asc: "PROGRESS", desc: "PROGRESS_DESC", ...MOST }
export const SORT_FIELD_STARTED: LibrarySortField = { label: "Date started", asc: "START_DATE", desc: "START_DATE_DESC", ...NEWEST }
export const SORT_FIELD_COMPLETED: LibrarySortField = { label: "Date completed", asc: "END_DATE", desc: "END_DATE_DESC", ...NEWEST }
export const SORT_FIELD_AIRING_STATUS: LibrarySortField = {
    label: "Airing status", asc: "AIRING_STATUS", desc: "AIRING_STATUS_DESC", ascLabel: "Airing first", descLabel: "Finished first",
}

const SORT_FIELD_EPISODES: LibrarySortField = { label: "Episode count", asc: "EPISODE_COUNT", desc: "EPISODE_COUNT_DESC", ...MOST }
const SORT_FIELD_CHAPTERS: LibrarySortField = { label: "Chapter count", asc: "EPISODE_COUNT", desc: "EPISODE_COUNT_DESC", ...MOST }
const SORT_FIELD_UNWATCHED: LibrarySortField = { label: "Unwatched episodes", asc: "UNWATCHED_EPISODES", desc: "UNWATCHED_EPISODES_DESC", ...MOST }
const SORT_FIELD_LATEST_AIRED: LibrarySortField = { label: "Latest episode aired", asc: "AIRDATE", desc: "AIRDATE_DESC", ...NEWEST }
const SORT_FIELD_LAST_WATCHED: LibrarySortField = { label: "Last watched", asc: "LAST_WATCHED", desc: "LAST_WATCHED_DESC", ...RECENT }
const SORT_FIELD_UNREAD: LibrarySortField = { label: "Unread chapters", asc: "UNREAD_CHAPTERS", desc: "UNREAD_CHAPTERS_DESC", ...MOST }
const SORT_FIELD_LAST_READ: LibrarySortField = { label: "Last read", asc: "LAST_READ", desc: "LAST_READ_DESC", ...RECENT }

/** The anime library's lists (home and detailed views). */
export const ANIME_LIBRARY_SORT_FIELDS: LibrarySortField[] = [
    SORT_FIELD_RELEASE_DATE,
    SORT_FIELD_LAST_WATCHED,
    SORT_FIELD_LATEST_AIRED,
    SORT_FIELD_TITLE,
    SORT_FIELD_GOJUUON,
    SORT_FIELD_SCORE,
    SORT_FIELD_AVERAGE_SCORE,
    SORT_FIELD_PROGRESS,
    SORT_FIELD_UNWATCHED,
    SORT_FIELD_EPISODES,
    SORT_FIELD_AIRING_STATUS,
    SORT_FIELD_STARTED,
    SORT_FIELD_COMPLETED,
]

/** The local library grid: what is on disk, so nothing that depends on a list entry. */
export const LOCAL_ANIME_LIBRARY_SORT_FIELDS: LibrarySortField[] = [
    SORT_FIELD_GOJUUON,
    SORT_FIELD_RELEASE_DATE,
    SORT_FIELD_LAST_WATCHED,
    SORT_FIELD_TITLE,
    SORT_FIELD_AVERAGE_SCORE,
    SORT_FIELD_UNWATCHED,
    SORT_FIELD_EPISODES,
    SORT_FIELD_AIRING_STATUS,
]

export const MANGA_LIBRARY_SORT_FIELDS: LibrarySortField[] = [
    SORT_FIELD_LAST_READ,
    SORT_FIELD_RELEASE_DATE,
    SORT_FIELD_TITLE,
    SORT_FIELD_GOJUUON,
    SORT_FIELD_SCORE,
    SORT_FIELD_AVERAGE_SCORE,
    SORT_FIELD_PROGRESS,
    SORT_FIELD_UNREAD,
    SORT_FIELD_CHAPTERS,
    SORT_FIELD_AIRING_STATUS,
    SORT_FIELD_STARTED,
    SORT_FIELD_COMPLETED,
]

/** The AniList list pages (/lists), which hold list entries rather than library entries. */
export function anilistListSortFields(type: CollectionType): LibrarySortField[] {
    return [
        SORT_FIELD_RELEASE_DATE,
        SORT_FIELD_TITLE,
        SORT_FIELD_SCORE,
        SORT_FIELD_AVERAGE_SCORE,
        SORT_FIELD_PROGRESS,
        type === "manga" ? SORT_FIELD_CHAPTERS : SORT_FIELD_EPISODES,
        SORT_FIELD_AIRING_STATUS,
        SORT_FIELD_STARTED,
        SORT_FIELD_COMPLETED,
    ]
}

// Entries missing the value being sorted on go last in either direction instead of being dropped from
// the list — which is what the date sorts used to do, so "Date completed" on the Watching tab emptied it.

type FuzzyDateLike = { year?: number | null, month?: number | null, day?: number | null } | null | undefined

export function fuzzyDateValue(d: FuzzyDateLike): number | undefined {
    if (!d?.year) return undefined
    return d.year * 10000 + (d.month || 0) * 100 + (d.day || 0)
}

function isoDateValue(s: string | null | undefined): number | undefined {
    if (!s) return undefined
    const t = new Date(s).getTime()
    return Number.isFinite(t) ? t : undefined
}

export function sortMissingLast<T>(arr: T[], key: (n: T) => number | null | undefined, desc: boolean): T[] {
    const has: T[] = []
    const missing: T[] = []
    for (const n of arr) {
        const v = key(n)
        if (v === null || v === undefined || !Number.isFinite(v)) missing.push(n)
        else has.push(n)
    }
    // Negating rather than reversing keeps ties in their previous (title) order in both directions.
    return [...sortBy(has, n => desc ? -(key(n) as number) : (key(n) as number)), ...missing]
}

const AIRING_STATUS_ORDER: Record<string, number> = { RELEASING: 0, NOT_YET_RELEASED: 1, HIATUS: 2, FINISHED: 3, CANCELLED: 4 }

/** Media-level sorts shared by every list type. Undefined when `sorting` is not one of them. */
export function sortByMediaField<T>(arr: T[], sorting: string, media: (n: T) => AL_BaseAnime | AL_BaseManga | undefined): T[] | undefined {
    switch (sorting) {
        case "RELEASE_DATE":
        case "RELEASE_DATE_DESC":
            return sortMissingLast(arr, n => fuzzyDateValue(media(n)?.startDate), sorting === "RELEASE_DATE_DESC")
        case "AVERAGE_SCORE":
        case "AVERAGE_SCORE_DESC":
            return sortMissingLast(arr, n => media(n)?.meanScore || undefined, sorting === "AVERAGE_SCORE_DESC")
        case "EPISODE_COUNT":
        case "EPISODE_COUNT_DESC":
            return sortMissingLast(arr, n => {
                const m = media(n) as (AL_BaseAnime & AL_BaseManga) | undefined
                return (m?.episodes ?? m?.chapters) || undefined
            }, sorting === "EPISODE_COUNT_DESC")
        case "AIRING_STATUS":
        case "AIRING_STATUS_DESC":
            return sortMissingLast(arr, n => AIRING_STATUS_ORDER[media(n)?.status ?? ""], sorting === "AIRING_STATUS_DESC")
    }
    return undefined
}

type GojuuonSortEntry = {
    mediaId: number
    groupKey: string
    groupRomajiTitle: string
    chronologicalOrder: number
}

export type CollectionType = "anime" | "manga"

export type CollectionParams<T extends CollectionType> = {
    sorting: CollectionSorting<T>
    genre: string[] | null
    status: AL_MediaStatus | null
    format: AL_MediaFormat | null
    season: AL_MediaSeason | null
    year: string | null
    isAdult: boolean
} & (T extends "manga" ? {
    unreadOnly: boolean
} : T extends "anime" ? {
    continueWatchingOnly: boolean
} : never)


export const DEFAULT_COLLECTION_PARAMS: CollectionParams<"anime"> = {
    sorting: "SCORE_DESC",
    genre: null,
    status: null,
    format: null,
    season: null,
    year: null,
    isAdult: false,
    continueWatchingOnly: false,
}

export const DEFAULT_ANIME_COLLECTION_PARAMS: CollectionParams<"anime"> = {
    sorting: "SCORE_DESC",
    genre: null,
    status: null,
    format: null,
    season: null,
    year: null,
    isAdult: false,
    continueWatchingOnly: false,
}

export const DEFAULT_MANGA_COLLECTION_PARAMS: CollectionParams<"manga"> = {
    sorting: "SCORE_DESC",
    genre: null,
    status: null,
    format: null,
    season: null,
    year: null,
    isAdult: false,
    unreadOnly: false,
}


function getParamValue<T extends any>(value: T | ""): any {
    if (value === "") return undefined
    if (Array.isArray(value) && value.filter(Boolean).length === 0) return undefined
    if (typeof value === "string" && !isNaN(parseInt(value))) return Number(value)
    if (value === null) return undefined
    return value
}

export function sortByGojuuon<T extends { media?: { id?: number; title?: any } }>(arr: T[], gojuuonMap: Record<number, GojuuonSortEntry> | null | undefined) {
    // Character-by-character gojuuon ordering using `gojuuonSortKey`. Works
    // without any server scan — the moment the user switches to "Gojuuon",
    // entries are sorted by their romaji/userPreferred title using the row
    // index (k-group, s-group, etc.) of each character in turn.
    //
    // If the server has supplied a `gojuuonMap` we still honor it for
    // series-grouping (so sequels stay together under their root entry),
    // but the per-title fallback ensures sorting always works.
    return [...arr].sort((a, b) => {
        const aId = a.media?.id ?? 0
        const bId = b.media?.id ?? 0
        const aEntry = gojuuonMap?.[aId]
        const bEntry = gojuuonMap?.[bId]

        if (aEntry && bEntry) {
            const aGroup = aEntry.groupKey || ""
            const bGroup = bEntry.groupKey || ""
            if (aGroup && bGroup && aGroup !== bGroup) {
                return aGroup.localeCompare(bGroup, "ja")
            }
            const aChronology = aEntry.chronologicalOrder ?? Number.MAX_SAFE_INTEGER
            const bChronology = bEntry.chronologicalOrder ?? Number.MAX_SAFE_INTEGER
            if (aGroup && bGroup && aChronology !== bChronology) {
                return aChronology - bChronology
            }
        }

        const aTitle = displayTitle(a.media?.title) || a.media?.title?.romaji || ""
        const bTitle = displayTitle(b.media?.title) || b.media?.title?.romaji || ""
        const aKey = gojuuonSortKey(aTitle)
        const bKey = gojuuonSortKey(bTitle)
        if (aKey < bKey) return -1
        if (aKey > bKey) return 1
        return aTitle.localeCompare(bTitle, "ja")
    })
}


export function filterEntriesByTitle<T extends { media?: AL_BaseAnime | AL_BaseManga }[] | null | undefined>(arr: T, input: string): T {
    // @ts-expect-error
    if (!arr) return []
    if (arr.length > 0 && input.length > 0) {
        const _input = input.toLowerCase().trim().replace(/\s+/g, " ")
        // @ts-expect-error
        return arr.filter(entry => (
            entry.media?.title?.english?.toLowerCase().includes(_input)
            || displayTitle(entry.media?.title).toLowerCase().includes(_input)
            || entry.media?.title?.romaji?.toLowerCase().includes(_input)
            || entry.media?.synonyms?.some(syn => syn?.toLowerCase().includes(_input))
        ))
    }
    return arr
}

export function filterListEntries<T extends AL_MangaCollection_MediaListCollection_Lists_Entries[] | AL_AnimeCollection_MediaListCollection_Lists_Entries[], V extends CollectionType>(
    type: V,
    entries: T | null | undefined,
    params: CollectionParams<V>,
    showAdultContent: boolean | undefined,
) {
    if (!entries) return []
    let arr = [...entries]

    // Filter by isAdult
    if (!!arr && params.isAdult) arr = arr.filter(n => n.media?.isAdult)

    // Filter by showAdultContent
    if (!showAdultContent) arr = arr.filter(n => !n.media?.isAdult)

    // Filter by format
    if (!!arr && !!params.format) arr = arr.filter(n => n.media?.format === params.format)

    // Filter by season
    if (!!arr && !!params.season) arr = arr.filter(n => n.media?.season === params.season)

    // Filter by status
    if (!!arr && !!params.status) arr = arr.filter(n => n.media?.status === params.status)

    // Filter by year
    if (!!arr && !!params.year) arr = arr.filter(n => (n.media as AL_BaseAnime)?.seasonYear ?
        ((n.media as AL_BaseAnime)?.seasonYear === Number(params.year) || n.media?.startDate?.year === Number(params.year))
        : n.media?.startDate?.year === Number(params.year))

    // Filter by genre
    if (!!arr && !!params.genre?.length) {
        arr = arr.filter(n => {
            return params.genre?.every(genre => n.media?.genres?.includes(genre))
        })
    }

    // Initial sort by name
    arr = sortBy(arr, n => displayTitle(n?.media?.title)).reverse()

    // Sort by title
    if (getParamValue(params.sorting) === "TITLE")
        // arr = sortBy(arr, n => n?.media?.title?.userPreferred)
        arr.sort((a, b) => displayTitle(a?.media?.title).localeCompare(displayTitle(b?.media?.title)) || 0)
    if (getParamValue(params.sorting) === "TITLE_DESC")
        // arr = sortBy(arr, n => n?.media?.title?.userPreferred).reverse()
        arr.sort((a, b) => displayTitle(b?.media?.title).localeCompare(displayTitle(a?.media?.title)) || 0)

    // Release date, average score, episode count, airing status
    arr = (sortByMediaField(arr, getParamValue(params.sorting), n => n.media) as typeof arr | undefined) ?? arr

    // Sort by score
    if (getParamValue(params.sorting) === "SCORE")
        arr = sortBy(arr, n => n?.score || 999999)
    if (getParamValue(params.sorting) === "SCORE_DESC")
        arr = sortBy(arr, n => n?.score || 0).reverse()

    // Sort by start date
    // if (getParamValue(params.sorting) === "START_DATE" || getParamValue(params.sorting) === "START_DATE_DESC") {
    //     arr = arr?.filter(n => n.startedAt && !!n.startedAt.year && !!n.startedAt.month && !!n.startedAt.day)
    // }
    if (getParamValue(params.sorting) === "START_DATE")
        arr = sortBy(arr, n => new Date(n?.startedAt?.year || 9999, (n?.startedAt?.month || 1) - 1, n?.startedAt?.day || 1))
    if (getParamValue(params.sorting) === "START_DATE_DESC")
        arr = sortBy(arr, n => new Date(n?.startedAt?.year || 1000, (n?.startedAt?.month || 1) - 1, n?.startedAt?.day || 1)).reverse()

    // Sort by end date
    if (getParamValue(params.sorting) === "END_DATE" || getParamValue(params.sorting) === "END_DATE_DESC")
        arr = sortMissingLast(arr, n => fuzzyDateValue(n?.completedAt), getParamValue(params.sorting) === "END_DATE_DESC")

    // Sort by progress
    if (getParamValue(params.sorting) === "PROGRESS")
        arr = sortBy(arr, n => n?.progress || 0)
    if (getParamValue(params.sorting) === "PROGRESS_DESC")
        arr = sortBy(arr, n => n?.progress || 0).reverse()

    return arr
}

export function filterCollectionEntries<T extends Anime_LibraryCollectionEntry[], V extends CollectionType>(
    type: V,
    entries: T | null | undefined,
    params: CollectionParams<V>,
    showAdultContent: boolean | undefined,
) {
    if (!entries) return []
    let arr = [...entries]

    // Filter by isAdult
    if (!!arr && params.isAdult) arr = arr.filter(n => n.media?.isAdult)

    // Filter by showAdultContent
    if (!showAdultContent) arr = arr.filter(n => !n.media?.isAdult)

    // Filter by format
    if (!!arr && !!params.format) arr = arr.filter(n => n.media?.format === params.format)

    // Filter by season
    if (!!arr && !!params.season) arr = arr.filter(n => n.media?.season === params.season)

    // Filter by status
    if (!!arr && !!params.status) arr = arr.filter(n => n.media?.status === params.status)

    // Filter by year
    if (!!arr && !!params.year) arr = arr.filter(n => n.media?.seasonYear === Number(params.year) || n.media?.startDate?.year === Number(params.year))

    // Filter by genre
    if (!!arr && !!params.genre?.length) {
        arr = arr.filter(n => {
            return params.genre?.every(genre => n.media?.genres?.includes(genre))
        })
    }

    // Initial sort by name
    arr = sortBy(arr, n => displayTitle(n?.media?.title)).reverse()

    // Sort by title
    if (getParamValue(params.sorting) === "TITLE")
        // arr = sortBy(arr, n => n?.media?.title?.userPreferred)
        arr.sort((a, b) => displayTitle(a?.media?.title).localeCompare(displayTitle(b?.media?.title)) || 0)
    if (getParamValue(params.sorting) === "TITLE_DESC")
        // arr = sortBy(arr, n => n?.media?.title?.userPreferred).reverse()
        arr.sort((a, b) => displayTitle(b?.media?.title).localeCompare(displayTitle(a?.media?.title)) || 0)

    // Release date, average score, episode count, airing status
    arr = sortByMediaField(arr, getParamValue(params.sorting), n => n.media) ?? arr

    // Sort by score
    if (getParamValue(params.sorting) === "SCORE")
        arr = sortBy(arr, n => {
            return n?.listData?.score || 999999
        })
    if (getParamValue(params.sorting) === "SCORE_DESC")
        arr = sortBy(arr, n => n?.listData?.score || 0).reverse()

    // Sort by start date
    // if (getParamValue(params.sorting) === "START_DATE" || getParamValue(params.sorting) === "START_DATE_DESC") {
    //     arr = arr?.filter(n => !!n.listData?.startedAt)
    // }
    if (getParamValue(params.sorting) === "START_DATE")
        arr = sortBy(arr, n => new Date(n?.listData?.startedAt ?? new Date(9999, 1, 1).toISOString()))
    if (getParamValue(params.sorting) === "START_DATE_DESC")
        arr = sortBy(arr, n => new Date(n?.listData?.startedAt ?? new Date(1000, 1, 1).toISOString())).reverse()

    // Sort by end date
    if (getParamValue(params.sorting) === "END_DATE" || getParamValue(params.sorting) === "END_DATE_DESC")
        arr = sortMissingLast(arr, n => isoDateValue(n?.listData?.completedAt), getParamValue(params.sorting) === "END_DATE_DESC")

    // Sort by progress
    if (getParamValue(params.sorting) === "PROGRESS")
        arr = sortBy(arr, n => n?.listData?.progress || 0)
    if (getParamValue(params.sorting) === "PROGRESS_DESC")
        arr = sortBy(arr, n => n?.listData?.progress || 0).reverse()

    return arr
}

/**
 * Under a "Last watched" order, Currently watching also takes the shows started here that never made it
 * onto one of the user's AniList lists — a few minutes of an episode, stopped well before the progress
 * update that would have added it. Those are in the library's LOCAL list (files on disk, no list entry)
 * and the local watch history knows them, so they can be ordered with everything else; without this
 * they could not appear in any list, whatever the order.
 *
 * Every other order leaves the lists alone: the Currently watching tab is the AniList list again.
 */
export function withLocallyStartedInCurrent(
    lists: Anime_LibraryCollectionList[],
    sorting: string,
    watchHistory: Continuity_WatchHistory | null | undefined,
): Anime_LibraryCollectionList[] {
    if ((sorting !== "LAST_WATCHED" && sorting !== "LAST_WATCHED_DESC") || !watchHistory) return lists
    const local = lists.find(l => (l.type as string) === "LOCAL")
    if (!local?.entries?.length) return lists

    const onAList = new Set(lists
        .filter(l => (l.type as string) !== "LOCAL")
        .flatMap(l => l.entries ?? [])
        .map(e => e.mediaId))
    const started = local.entries.filter(e => !!e.mediaId && !onAList.has(e.mediaId) && !!watchHistory[e.mediaId])
    if (!started.length) return lists

    if (!lists.some(l => l.type === "CURRENT")) {
        return [...lists, { type: "CURRENT", status: "CURRENT", entries: started } as Anime_LibraryCollectionList]
    }
    return lists.map(l => l.type === "CURRENT" ? { ...l, entries: [...(l.entries ?? []), ...started] } : l)
}

/** */
export function filterAnimeCollectionEntries<T extends Anime_LibraryCollectionEntry[]>(
    entries: T | null | undefined,
    params: CollectionParams<"anime">,
    showAdultContent: boolean | undefined,
    continueWatchingList: Anime_Episode[] | null | undefined,
    watchHistory: Continuity_WatchHistory | null | undefined,
    gojuuonMap?: Record<number, GojuuonSortEntry> | null,
) {
    let arr = filterCollectionEntries("anime", entries, params, showAdultContent)

    if (getParamValue(params.sorting) === "GOJUUON") {
        arr = sortByGojuuon(arr, gojuuonMap)
    }
    if (getParamValue(params.sorting) === "GOJUUON_DESC") {
        arr = sortByGojuuon(arr, gojuuonMap).reverse()
    }

    if (params.continueWatchingOnly) {
        arr = arr.filter(n => continueWatchingList?.findIndex(e => e.baseAnime?.id === n.media?.id) !== -1)
    }

    // Sort by airdate
    if (getParamValue(params.sorting) === "AIRDATE") {
        arr = sortBy(arr,
            n => continueWatchingList?.find(c => c.baseAnime?.id === n.media?.id)?.episodeMetadata?.airDate || new Date(9999, 1, 1).toISOString())
    }
    if (getParamValue(params.sorting) === "AIRDATE_DESC") {
        arr = sortBy(arr,
            n => continueWatchingList?.find(c => c.baseAnime?.id === n.media?.id)?.episodeMetadata?.airDate || new Date(1000, 1, 1).toISOString())
            .reverse()
    }

    // Sort by unwatched episodes
    if (getParamValue(params.sorting) === "UNWATCHED_EPISODES") {
        // arr = sortBy(arr,
        //     n => !!n.libraryData?.mainFileCount ? n.libraryData?.unwatchedCount : (anilist_getUnwatchedCount(n.media, n.listData?.progress) ||
        // 99999))
        arr = sortBy(arr,
            n => !!n.libraryData?.mainFileCount ? n.libraryData?.unwatchedCount : (
                !!n.nakamaLibraryData?.mainFileCount ? n.nakamaLibraryData?.unwatchedCount : (anilist_getUnwatchedCount(n.media,
                    n.listData?.progress) || 99999)
            ))
    }
    if (getParamValue(params.sorting) === "UNWATCHED_EPISODES_DESC") {
        // arr = sortBy(arr,
        //     n => !!n.libraryData?.mainFileCount ? n.libraryData?.unwatchedCount : anilist_getUnwatchedCount(n.media,
        // n.listData?.progress)).reverse()
        arr = sortBy(arr,
            n => !!n.libraryData?.mainFileCount ? n.libraryData?.unwatchedCount : (
                !!n.nakamaLibraryData?.mainFileCount ? n.nakamaLibraryData?.unwatchedCount : (anilist_getUnwatchedCount(n.media,
                    n.listData?.progress) || 99999)
            ))
            .reverse()
    }

    // Sort by last watched
    if (getParamValue(params.sorting) === "LAST_WATCHED") {
        arr = sortBy(arr, n => watchHistory?.[n.media?.id!]?.timeUpdated || new Date(9999, 1, 1).toISOString())
    }
    if (getParamValue(params.sorting) === "LAST_WATCHED_DESC") {
        arr = sortBy(arr, n => watchHistory?.[n.media?.id!]?.timeUpdated || new Date(1000, 1, 1).toISOString()).reverse()
    }

    return arr
}


/** */
export function filterMangaCollectionEntries<T extends Anime_LibraryCollectionEntry[]>(
    entries: T | null | undefined,
    params: CollectionParams<"manga">,
    showAdultContent: boolean | undefined,
    storedProviders: Record<string, string> | null | undefined,
    storedProviderFilters: Record<number, MangaEntryFilters> | null | undefined,
    latestChapterNumbers: Record<number, Manga_MangaLatestChapterNumberItem[]> | null | undefined,
    gojuuonMap?: Record<number, GojuuonSortEntry> | null,
) {
    if (!latestChapterNumbers || !storedProviders || !storedProviderFilters) return []
    let arr = filterCollectionEntries("manga", entries, params, showAdultContent)


    if (params.unreadOnly) {
        arr = arr.filter(n => {
            const latestChapterNumber = getMangaEntryLatestChapterNumber(n.media?.id!, latestChapterNumbers, storedProviders, storedProviderFilters)
            const mangaChapterCount = latestChapterNumber || 999999
            return mangaChapterCount - (n.listData?.progress || 0) > 0
        })
    }

    // Sort by unwatched chapters
    if (getParamValue(params.sorting) === "UNREAD_CHAPTERS") {
        arr = sortBy(arr, n => {
            const latestChapterNumber = getMangaEntryLatestChapterNumber(n.media?.id!, latestChapterNumbers, storedProviders, storedProviderFilters)
            // console.log(n.media?.id, latestChapterNumber)
            const mangaChapterCount = latestChapterNumber || 999999
            return mangaChapterCount - (n.listData?.progress || 0)
        })
    }
    if (getParamValue(params.sorting) === "UNREAD_CHAPTERS_DESC") {
        arr = sortBy(arr, n => {
            const latestChapterNumber = getMangaEntryLatestChapterNumber(n.media?.id!, latestChapterNumbers, storedProviders, storedProviderFilters)
            // console.log(n.media?.id, latestChapterNumber)
            const mangaChapterCount = latestChapterNumber || 0
            return mangaChapterCount - (n.listData?.progress || 0)
        }).reverse()
    }

    if (getParamValue(params.sorting) === "GOJUUON") {
        arr = sortByGojuuon(arr, gojuuonMap)
    }
    if (getParamValue(params.sorting) === "GOJUUON_DESC") {
        arr = sortByGojuuon(arr, gojuuonMap).reverse()
    }

    return arr
}

export function sortContinueWatchingEntries(
    entries: Anime_Episode[] | null | undefined,
    sorting: ContinueWatchingSorting,
    libraryEntries: Anime_LibraryCollectionEntry[] | null | undefined,
    watchHistory: Continuity_WatchHistory | null | undefined,
) {
    if (!entries) return []
    let arr = [...entries]

    // Initial sort by name
    arr = sortBy(arr, n => n?.displayTitle)

    // Sort by episode number
    if (sorting === "EPISODE_NUMBER")
        arr = sortBy(arr, n => n?.episodeNumber)
    if (sorting === "EPISODE_NUMBER_DESC")
        arr = sortBy(arr, n => n?.episodeNumber).reverse()

    // Sort by airdate
    if (sorting === "AIRDATE")
        arr = sortBy(arr, n => n?.episodeMetadata?.airDate)
    if (sorting === "AIRDATE_DESC")
        arr = sortBy(arr, n => n?.episodeMetadata?.airDate).reverse()

    // Sort by unwatched episodes
    if (sorting === "UNWATCHED_EPISODES")
        arr = sortBy(arr,
            n => libraryEntries?.find(e => e.media?.id === n.baseAnime?.id)?.libraryData?.unwatchedCount ?? (anilist_getUnwatchedCount(n.baseAnime,
                libraryEntries?.find(e => e.media?.id === n.baseAnime?.id)?.listData?.progress) || 99999))
    if (sorting === "UNWATCHED_EPISODES_DESC")
        arr = sortBy(arr,
            n => libraryEntries?.find(e => e.media?.id === n.baseAnime?.id)?.libraryData?.unwatchedCount ?? anilist_getUnwatchedCount(n.baseAnime,
                libraryEntries?.find(e => e.media?.id === n.baseAnime?.id)?.listData?.progress))
            .reverse()

    // Sort by score
    if (sorting === "SCORE")
        arr = sortBy(arr, n => libraryEntries?.find(e => e.media?.id === n.baseAnime?.id)?.listData?.score || 999999)
    if (sorting === "SCORE_DESC")
        arr = sortBy(arr, n => libraryEntries?.find(e => e.media?.id === n.baseAnime?.id)?.listData?.score || 0).reverse()

    // Sort by start date
    if (sorting === "START_DATE")
        arr = sortBy(arr, n => libraryEntries?.find(e => e.media?.id === n.baseAnime?.id)?.listData?.startedAt || new Date(9999, 1, 1).toISOString())
    if (sorting === "START_DATE_DESC")
        arr = sortBy(arr, n => libraryEntries?.find(e => e.media?.id === n.baseAnime?.id)?.listData?.startedAt || new Date(1000, 1, 1).toISOString())
            .reverse()


    // Sort by last watched
    if (sorting === "LAST_WATCHED")
        arr = sortBy(arr, n => watchHistory?.[n.baseAnime?.id!]?.timeUpdated || new Date(9999, 1, 1).toISOString())
    if (sorting === "LAST_WATCHED_DESC")
        arr = sortBy(arr, n => watchHistory?.[n.baseAnime?.id!]?.timeUpdated || new Date(1000, 1, 1).toISOString())
            .reverse()

    return arr
}
