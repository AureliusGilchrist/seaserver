import { Models_HomeItem, Nullish } from "@/api/generated/types"
import { ADVANCED_SEARCH_COUNTRIES_MANGA, ADVANCED_SEARCH_MEDIA_GENRES } from "@/app/(main)/search/_lib/advanced-search-constants"

export const DEFAULT_HOME_ITEMS: Models_HomeItem[] = [
    {
        id: "anime-continue-watching",
        type: "anime-continue-watching",
        schemaVersion: 1,
    },
    {
        id: "anime-library",
        type: "anime-library",
        schemaVersion: 1,
        options: {
            statuses: ["CURRENT", "PAUSED", "PLANNING", "COMPLETED", "DROPPED"],
            layout: "grid",
        },
    },
]

export const ANIME_HOME_ITEM_IDS = [
    "centered-title",
    "anime-continue-watching",
    "anime-continue-watching-header",
    "anime-library",
    "my-lists",
    "local-anime-library",
    "library-upcoming-episodes",
    "aired-recently",
    "missed-sequels",
    "anime-schedule-calendar",
    "local-anime-library-stats",
    "discover-header",
    "anime-carousel",
] as const

export const MANGA_HOME_ITEM_IDS = [
    "manga-continue-reading",
    "manga-continue-reading-header",
    "manga-library",
    "manga-favorites",
    "my-lists",
    "local-manga-library",
    "local-manga-library-stats",
    "manga-upcoming-chapters",
    "manga-aired-recently",
    "manga-missed-sequels",
    "manga-schedule-calendar",
    "manga-discover-header",
    "manga-carousel",
] as const

export function isAnimeHomeItem(type: string): type is typeof ANIME_HOME_ITEM_IDS[number] {
    return (ANIME_HOME_ITEM_IDS as readonly string[]).includes(type)
}

export function isMangaHomeItem(type: string): type is typeof MANGA_HOME_ITEM_IDS[number] {
    return (MANGA_HOME_ITEM_IDS as readonly string[]).includes(type)
}

export function isAnimeLibraryItemsOnly(items: Nullish<Models_HomeItem[]>) {
    if (!items) return true

    for (const item of items) {
        if (![
            "anime-continue-watching",
            "anime-library",
            "anime-continue-watching-header",
            "local-anime-library",
            "local-anime-library-stats",
            "library-upcoming-episodes",
        ].includes(item.type)) {
            return false
        }
    }
    return true
}

type HomeItemSchema = {
    name: string
    kind: ("row" | "header")[]
    options?: { label: string, name: string, type: string, options?: any[] }[]
    schemaVersion: number
    description?: string
}

const _carouselOptions = [
    {
        label: "Name",
        type: "text",
        name: "name",
    },
    {
        label: "Sorting",
        type: "select",
        name: "sorting",
        options: [
            {
                label: "Popular",
                value: "POPULARITY_DESC",
            },
            {
                label: "Trending",
                value: "TRENDING_DESC",
            },
            {
                label: "Romaji Title (A-Z)",
                value: "TITLE_ROMAJI_ASC",
            },
            {
                label: "Romaji Title (Z-A)",
                value: "TITLE_ROMAJI_DESC",
            },
            {
                label: "English title (A-Z)",
                value: "TITLE_ENGLISH_ASC",
            },
            {
                label: "English title (Z-A)",
                value: "TITLE_ENGLISH_DESC",
            },
            {
                label: "Score (0-10)",
                value: "SCORE",
            },
            {
                label: "Score (10-0)",
                value: "SCORE_DESC",
            },
        ],
    },
    {
        label: "Status",
        type: "multi-select",
        name: "status",
        options: [
            {
                label: "Releasing",
                value: "RELEASING",
            },
            {
                label: "Finished",
                value: "FINISHED",
            },
            {
                label: "Not yet released",
                value: "NOT_YET_RELEASED",
            },
        ],
    },
    {
        label: "Format",
        type: "select",
        name: "format",
        options: [
            {
                label: "TV",
                value: "TV",
            },
            {
                label: "Movie",
                value: "MOVIE",
            },
            {
                label: "OVA",
                value: "OVA",
            },
            {
                label: "ONA",
                value: "ONA",
            },
            {
                label: "Special",
                value: "SPECIAL",
            },
        ],
    },
    {
        label: "Genres",
        type: "multi-select",
        options: ADVANCED_SEARCH_MEDIA_GENRES.map(n => ({ value: n, label: n })),
        name: "genres",
    },
    {
        label: "Season",
        type: "select",
        name: "season",
        options: [
            { value: "WINTER", label: "Winter" },
            { value: "SPRING", label: "Spring" },
            { value: "SUMMER", label: "Summer" },
            { value: "FALL", label: "Fall" },
        ],
    },
    {
        label: "Year",
        type: "number",
        name: "year",
        min: 0,
        max: 2100,
    },
    {
        label: "Country of Origin",
        type: "select",
        name: "countryOfOrigin",
        options: ADVANCED_SEARCH_COUNTRIES_MANGA,
    },
]

export const HOME_ITEMS = {
    "centered-title": {
        name: "Centered title",
        kind: ["row"],
        schemaVersion: 1,
        description: "Display a centered title text.",
        options: [{
            label: "Text",
            type: "text",
            name: "text",
        }],
    },
    "anime-continue-watching": {
        name: "Continue Watching",
        kind: ["row", "header"],
        schemaVersion: 1,
        description: "Display a list of episodes you are currently watching.",
    },
    "anime-continue-watching-header": {
        name: "Continue Watching Header",
        kind: ["header"],
        schemaVersion: 1,
        description: "Display a header with a carousel of anime you are currently watching.",
    },
    "anime-library": {
        name: "Anime Library",
        kind: ["row"],
        schemaVersion: 2,
        description: "Display anime you have downloaded / you are currently watching by status.",
        options: [
            {
                label: "Statuses",
                name: "statuses",
                type: "multi-select",
                options: [
                    {
                        value: "CURRENT",
                        label: "Currently Watching",
                    },
                    {
                        value: "PAUSED",
                        label: "Paused",
                    },
                    {
                        value: "PLANNING",
                        label: "Planning",
                    },
                    {
                        value: "COMPLETED",
                        label: "Completed",
                    },
                    {
                        value: "DROPPED",
                        label: "Dropped",
                    },
                ],
            },
            {
                label: "Layout",
                name: "layout",
                type: "select",
                options: [
                    {
                        label: "Grid",
                        value: "grid",
                    },
                    {
                        label: "Carousel",
                        value: "carousel",
                    },
                ],
            },
        ],
    },
    "my-lists": {
        name: "My Lists",
        kind: ["row"],
        schemaVersion: 1,
        description: "Display media from your lists by status.",
        options: [
            {
                label: "Statuses",
                name: "statuses",
                type: "multi-select",
                options: [
                    {
                        value: "CURRENT",
                        label: "Current",
                    },
                    {
                        value: "PAUSED",
                        label: "Paused",
                    },
                    {
                        value: "PLANNING",
                        label: "Planning",
                    },
                    {
                        value: "COMPLETED",
                        label: "Completed",
                    },
                    {
                        value: "DROPPED",
                        label: "Dropped",
                    },
                ],
            },
            {
                label: "Layout",
                name: "layout",
                type: "select",
                options: [
                    {
                        label: "Grid",
                        value: "grid",
                    },
                    {
                        label: "Carousel",
                        value: "carousel",
                    },
                ],
            },
            {
                label: "Type",
                name: "type",
                type: "select",
                options: [
                    {
                        label: "Anime",
                        value: "anime",
                    },
                    {
                        label: "Manga",
                        value: "manga",
                    },
                ],
            },
            {
                label: "Custom list name (Optional)",
                type: "text",
                name: "customListName",
            },
        ],
    },
    "local-anime-library": {
        name: "Local Anime Library",
        kind: ["row"],
        schemaVersion: 2,
        description: "Display a complete grid of anime you have in your local library.",
        options: [
            {
                label: "Layout",
                name: "layout",
                type: "select",
                options: [
                    {
                        label: "Grid",
                        value: "grid",
                    },
                    {
                        label: "Carousel",
                        value: "carousel",
                    },
                ],
            },
        ],
    },
    "library-upcoming-episodes": {
        name: "Upcoming Library Episodes",
        kind: ["row"],
        schemaVersion: 1,
        description: "Display a carousel of upcoming episodes from anime you have in your library.",
    },
    "aired-recently": {
        name: "Aired Recently (Global)",
        kind: ["row"],
        schemaVersion: 1,
        description: "Display a carousel of anime episodes that aired recently.",
    },
    "missed-sequels": {
        name: "Missed Sequels",
        kind: ["row"],
        schemaVersion: 1,
        description: "Display a carousel of sequels that aren't in your collection.",
    },
    "anime-schedule-calendar": {
        name: "Anime Schedule Calendar",
        kind: ["row"],
        schemaVersion: 2,
        description: "Display a calendar of anime episodes based on their airing schedule.",
        options: [
            {
                label: "Type",
                name: "type",
                type: "select",
                options: [
                    {
                        label: "My lists",
                        value: "my-lists",
                    },
                    {
                        label: "Global",
                        value: "global",
                    },
                ],
            },
        ],
    },
    "local-anime-library-stats": {
        name: "Local Anime Library Stats",
        kind: ["row"],
        schemaVersion: 1,
        description: "Display the stats for your local anime library.",
    },
    "discover-header": {
        name: "Discover Header",
        kind: ["header"],
        schemaVersion: 1,
        description: "Display a header with a carousel of anime that are trending.",
    },
    "anime-carousel": {
        name: "Anime Carousel",
        kind: ["row"],
        schemaVersion: 3,
        options: _carouselOptions,
        description: "Display a carousel of anime based on the selected options.",
    },
    "manga-carousel": {
        name: "Manga Carousel",
        kind: ["row"],
        schemaVersion: 1,
        description: "Display a carousel of manga based on the selected options.",
        options: _carouselOptions.map(n => {
            if (n.name === "format") {
                return {
                    ...n,
                    options: [
                        {
                            label: "Manga",
                            value: "MANGA",
                        },
                        {
                            label: "One Shot",
                            value: "ONE_SHOT",
                        },
                    ],
                }
            }
            return n
        }),
    },
    "manga-continue-reading": {
        name: "Manga Continue Reading",
        kind: ["row"],
        schemaVersion: 1,
        description: "Display a list of manga you are currently reading.",
    },
    "manga-continue-reading-header": {
        name: "Manga Continue Reading Header",
        kind: ["header"],
        schemaVersion: 1,
        description: "Coming soon: header for manga continue reading.",
    },
    "manga-library": {
        name: "Library",
        kind: ["row"],
        schemaVersion: 1,
        description: "Browse your manga library",
        options: [
            {
                label: "Statuses",
                name: "statuses",
                type: "multi-select",
                options: [
                    {
                        value: "CURRENT",
                        label: "Currently Reading",
                    },
                    {
                        value: "PAUSED",
                        label: "Paused",
                    },
                ],
            },
            {
                label: "Layout",
                name: "layout",
                type: "select",
                options: [
                    {
                        label: "Grid",
                        value: "grid",
                    },
                    {
                        label: "Carousel",
                        value: "carousel",
                    },
                ],
            },
        ],
    },
    "local-manga-library": {
        name: "Local Manga Library",
        kind: ["row"],
        schemaVersion: 2,
        description: "Coming soon: complete grid of manga in your local library.",
        options: [
            {
                label: "Layout",
                name: "layout",
                type: "select",
                options: [
                    { label: "Grid", value: "grid" },
                    { label: "Carousel", value: "carousel" },
                ],
            },
            {
                label: "Source",
                name: "source",
                type: "select",
                options: [
                    { label: "Synthetic", value: "synthetic" },
                    { label: "AniList", value: "anilist" },
                    { label: "Both", value: "both" },
                ],
            },
        ],
    },
    "local-manga-library-stats": {
        name: "Local Manga Library Stats",
        kind: ["row"],
        schemaVersion: 1,
        description: "Coming soon: stats for your local manga library.",
    },
    "manga-upcoming-chapters": {
        name: "Upcoming Manga Chapters",
        kind: ["row"],
        schemaVersion: 1,
        description: "Coming soon: carousel of upcoming chapters from your library.",
    },
    "manga-aired-recently": {
        name: "Recently Released (Manga)",
        kind: ["row"],
        schemaVersion: 1,
        description: "Coming soon: recently released manga chapters.",
    },
    "manga-missed-sequels": {
        name: "Missed Manga Sequels",
        kind: ["row"],
        schemaVersion: 1,
        description: "Coming soon: sequels not in your manga collection.",
    },
    "manga-schedule-calendar": {
        name: "Manga Release Calendar",
        kind: ["row"],
        schemaVersion: 1,
        description: "Coming soon: calendar of manga releases.",
    },
    "manga-discover-header": {
        name: "Manga Discover Header",
        kind: ["header"],
        schemaVersion: 1,
        description: "Coming soon: trending manga header.",
    },
} as Record<string, HomeItemSchema>

export const HOME_ITEM_IDS = [
    ...ANIME_HOME_ITEM_IDS,
    ...MANGA_HOME_ITEM_IDS,
] as const

// export type HomeItemID = (keyof typeof HOME_ITEMS)
