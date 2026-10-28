"use client"

import { MediaFuzzyDate, MediaInfo } from "@/api/hooks/anilist.hooks"
import { cn } from "@/components/ui/core/styling"
import { Tooltip } from "@/components/ui/tooltip"
import { formatNumber } from "@/lib/helpers/number"
import { capitalize } from "lodash"
import React from "react"
import {
    LuBookOpen,
    LuCalendarRange,
    LuClock,
    LuFilm,
    LuFlame,
    LuGlobe,
    LuHeart,
    LuLayers,
    LuSparkles,
    LuStar,
    LuTrendingUp,
    LuUsers,
} from "react-icons/lu"

// The glass chips under a details page's title: what it is, how long, when, where from, and how it
// is received. Base fields render at once; the extended ones (source, favourites, trending…) fill in
// when the media info arrives.

type BaseMediaLike = {
    format?: string | null
    status?: string | null
    episodes?: number | null
    duration?: number | null
    chapters?: number | null
    volumes?: number | null
    season?: string | null
    seasonYear?: number | null
    startDate?: MediaFuzzyDate | { year?: number | null, month?: number | null, day?: number | null } | null
    endDate?: MediaFuzzyDate | { year?: number | null, month?: number | null, day?: number | null } | null
    countryOfOrigin?: string | null
    isAdult?: boolean | null
    meanScore?: number | null
}

export const MEDIA_FORMAT_LABELS: Record<string, string> = {
    TV: "TV Series", TV_SHORT: "TV Short", MOVIE: "Movie", SPECIAL: "Special", OVA: "OVA", ONA: "ONA", MUSIC: "Music",
    MANGA: "Manga", NOVEL: "Light Novel", ONE_SHOT: "One-shot",
}

export const MEDIA_SOURCE_LABELS: Record<string, string> = {
    ORIGINAL: "Original", MANGA: "Manga", LIGHT_NOVEL: "Light Novel", VISUAL_NOVEL: "Visual Novel", VIDEO_GAME: "Video Game",
    OTHER: "Other", NOVEL: "Novel", DOUJINSHI: "Doujinshi", ANIME: "Anime", WEB_NOVEL: "Web Novel", LIVE_ACTION: "Live Action",
    GAME: "Game", COMIC: "Comic", MULTIMEDIA_PROJECT: "Multimedia Project", PICTURE_BOOK: "Picture Book",
}

export const MEDIA_COUNTRY: Record<string, { flag: string, name: string }> = {
    JP: { flag: "🇯🇵", name: "Japan" }, KR: { flag: "🇰🇷", name: "South Korea" }, CN: { flag: "🇨🇳", name: "China" }, TW: { flag: "🇹🇼", name: "Taiwan" },
}

const STATUS_STYLE: Record<string, { label: string, dot: string }> = {
    FINISHED: { label: "Finished", dot: "bg-emerald-400" },
    RELEASING: { label: "Releasing", dot: "bg-sky-400 animate-pulse" },
    NOT_YET_RELEASED: { label: "Not yet released", dot: "bg-amber-400" },
    CANCELLED: { label: "Cancelled", dot: "bg-red-400" },
    HIATUS: { label: "On hiatus", dot: "bg-orange-400" },
}

export function formatFuzzyDate(d: BaseMediaLike["startDate"], withDay = true): string | null {
    if (!d?.year) return null
    if (!d.month) return String(d.year)
    const date = new Date(d.year, d.month - 1, d.day || 1)
    return new Intl.DateTimeFormat("en-US", withDay && d.day ? { year: "numeric", month: "short", day: "numeric" } : { year: "numeric", month: "short" }).format(date)
}

export function MediaMetaChips({ media, info, type, className }: {
    media: BaseMediaLike | null | undefined
    info?: MediaInfo
    type: "anime" | "manga"
    className?: string
}) {
    if (!media) return null
    const format = info?.format ?? media.format
    const status = info?.status ?? media.status
    const episodes = info?.episodes ?? media.episodes
    const duration = info?.duration ?? media.duration
    const chapters = info?.chapters ?? media.chapters
    const volumes = info?.volumes ?? media.volumes
    const country = info?.countryOfOrigin ?? media.countryOfOrigin
    const start = formatFuzzyDate(info?.startDate ?? media.startDate)
    const end = formatFuzzyDate(info?.endDate ?? media.endDate)
    const season = info?.season ?? media.season
    const seasonYear = info?.seasonYear ?? media.seasonYear
    const st = status ? STATUS_STYLE[status] : undefined

    const length = type === "anime"
        ? [episodes ? `${episodes} ${episodes === 1 ? "episode" : "episodes"}` : null, duration ? `${duration} min` : null].filter(Boolean).join(" × ")
        : [chapters ? `${formatNumber(chapters)} ch` : null, volumes ? `${volumes} vol` : null].filter(Boolean).join(" · ")
    const totalMinutes = type === "anime" && episodes && duration ? episodes * duration : 0

    return (
        <div className={cn("flex flex-wrap items-center justify-center gap-2 lg:justify-start", className)} data-media-meta-chips>
            {format && <Chip icon={type === "anime" ? <LuFilm /> : <LuBookOpen />}>{MEDIA_FORMAT_LABELS[format] ?? capitalize(format)}</Chip>}
            {st && <Chip icon={<span className={cn("size-2 rounded-full", st.dot)} />}>{st.label}</Chip>}
            {!!length && (
                totalMinutes >= 60
                    ? <Tooltip trigger={<span><Chip icon={<LuClock />}>{length}</Chip></span>}>
                        {formatWatchTime(totalMinutes)} in total
                    </Tooltip>
                    : <Chip icon={<LuClock />}>{length}</Chip>
            )}
            {(start || season) && <Chip icon={<LuCalendarRange />}>
                {season && seasonYear ? `${capitalize(season)} ${seasonYear}` : null}
                {season && seasonYear && start ? <span className="text-white/40"> · </span> : null}
                {start}{end && end !== start ? <> <span className="text-white/40">→</span> {end}</> : status === "RELEASING" && start ? <> <span className="text-white/40">→</span> now</> : null}
            </Chip>}
            {info?.source && <Chip icon={<LuLayers />}>From {MEDIA_SOURCE_LABELS[info.source] ?? capitalize(info.source.replace(/_/g, " "))}</Chip>}
            {country && <Chip icon={<LuGlobe />}>{MEDIA_COUNTRY[country] ? `${MEDIA_COUNTRY[country].flag} ${MEDIA_COUNTRY[country].name}` : country}</Chip>}
            {(info?.isAdult ?? media.isAdult) && <Chip tone="red">18+</Chip>}
        </div>
    )
}

/** Mean/average score, popularity, favourites and trending, as one compact row. */
export function MediaStatsRow({ info, meanScore, hideScore, className }: {
    info?: MediaInfo
    meanScore?: number | null
    hideScore?: boolean
    className?: string
}) {
    const mean = info?.meanScore ?? meanScore
    const items: React.ReactNode[] = []
    if (!hideScore && mean) {
        items.push(<Stat key="mean" icon={<LuStar className="text-amber-300" />} value={(mean / 10).toFixed(1)} label="Mean score" accent />)
    }
    if (!hideScore && info?.averageScore) {
        items.push(<Stat key="avg" icon={<LuSparkles className="text-sky-300" />} value={`${info.averageScore}%`} label="Weighted average" />)
    }
    if (info?.popularity) items.push(<Stat key="pop" icon={<LuUsers className="text-violet-300" />} value={compact(info.popularity)} label="Members" />)
    if (info?.favourites) items.push(<Stat key="fav" icon={<LuHeart className="text-rose-300" />} value={compact(info.favourites)} label="Favourites" />)
    if (info?.trending) items.push(<Stat key="trend" icon={info.trending > 50 ? <LuFlame className="text-orange-300" /> : <LuTrendingUp className="text-emerald-300" />} value={`+${compact(info.trending)}`} label="Trending (activity this week)" />)
    if (!items.length) return null
    return <div className={cn("flex flex-wrap items-center justify-center gap-2 lg:justify-start", className)} data-media-stats-row>{items}</div>
}

function Stat({ icon, value, label, accent }: { icon: React.ReactNode, value: string, label: string, accent?: boolean }) {
    return <Tooltip trigger={<span
        className={cn(
            "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold tabular-nums ring-1 backdrop-blur-md transition-transform hover:-translate-y-0.5",
            accent ? "bg-amber-300/10 text-amber-100 ring-amber-300/20" : "bg-black/25 text-white/90 ring-white/10",
        )}
    >
        <span className="[&>svg]:size-4">{icon}</span>{value}
    </span>}>{label}</Tooltip>
}

function Chip({ icon, children, tone }: { icon?: React.ReactNode, children: React.ReactNode, tone?: "red" }) {
    return <span
        className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium ring-1 backdrop-blur-md",
            tone === "red" ? "bg-red-500/15 text-red-200 ring-red-400/25" : "bg-black/25 text-white/85 ring-white/10",
        )}
        data-media-meta-chip
    >
        {icon && <span className="flex items-center text-white/55 [&>svg]:size-3.5">{icon}</span>}
        {children}
    </span>
}

export function compact(n: number) {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n)
}

function formatWatchTime(minutes: number) {
    const days = Math.floor(minutes / 1440)
    const hours = Math.floor((minutes % 1440) / 60)
    const mins = minutes % 60
    return [days ? `${days}d` : null, hours ? `${hours}h` : null, mins && !days ? `${mins}m` : null].filter(Boolean).join(" ")
}
