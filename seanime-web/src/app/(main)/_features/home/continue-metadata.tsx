"use client"

import type { AL_BaseAnime, AL_BaseManga, Continuity_WatchHistory } from "@/api/generated/types"
import { MEDIA_FORMAT_LABELS } from "@/app/(main)/_features/media/_components/media-meta-chips"
import { cn } from "@/components/ui/core/styling"
import { capitalize } from "lodash"
import React from "react"
import { LuCalendarClock, LuClock, LuHistory, LuStar } from "react-icons/lu"

/**
 * The few things worth knowing about a show or a series before you go back to it, said plainly:
 * how far in you are, how much is left, where you stopped and when, and whether more is coming.
 * The details-page chips sit underneath (score, format and season, genres) in the same glass.
 */

const RELEASE: Record<string, { label: string, dot: string }> = {
    FINISHED: { label: "Finished", dot: "bg-emerald-400" },
    RELEASING: { label: "Releasing", dot: "bg-sky-400 animate-pulse" },
    NOT_YET_RELEASED: { label: "Upcoming", dot: "bg-amber-400" },
    HIATUS: { label: "On hiatus", dot: "bg-orange-400" },
    CANCELLED: { label: "Cancelled", dot: "bg-red-400" },
}

const MANGA_ORIGIN: Record<string, string> = { KR: "Manhwa", CN: "Manhua", TW: "Manhua" }

export function AnimeContinueMeta({ anime, episodeNumber, progressNumber, watchHistory }: {
    anime: AL_BaseAnime | undefined
    episodeNumber: number
    progressNumber: number
    watchHistory: Continuity_WatchHistory | undefined
}) {
    if (!anime) return null
    const total = anime.episodes
    const watched = Math.max(0, progressNumber - 1)
    const remaining = total ? Math.max(0, total - watched) : null
    const isMovie = anime.format === "MOVIE" || total === 1
    const minutesLeft = remaining && anime.duration ? remaining * anime.duration : null

    const history = watchHistory?.[anime.id]
    const stoppedAt = history && history.episodeNumber === episodeNumber && history.currentTime > 30 && history.duration > 0 && history.currentTime < history.duration - 60
        ? history.currentTime
        : null
    const lastSeen = history?.timeUpdated ? timeAgo(history.timeUpdated) : null

    const airing = anime.nextAiringEpisode
    const caughtUp = !!airing && airing.episode - 1 <= episodeNumber
    const now = Math.floor(Date.now() / 1000)

    const headline = isMovie
        ? stoppedAt ? "Partway through the movie" : "A movie, ready when you are"
        : watched === 0
            ? total ? `A fresh start, ${total} episodes ahead` : "A fresh start"
            : remaining !== null
                ? remaining <= 1 ? `${watched} down, this is the last one` : `${watched} down, ${remaining} to go`
                : `${watched} down, still airing`

    const notes: { icon: React.ReactNode, text: string }[] = []
    if (stoppedAt !== null) notes.push({ icon: <LuHistory />, text: `Left off at ${clock(stoppedAt)}${lastSeen ? `, ${lastSeen}` : ""}` })
    else if (lastSeen) notes.push({ icon: <LuHistory />, text: `Last watched ${lastSeen}` })
    if (minutesLeft && !isMovie) notes.push({ icon: <LuClock />, text: `About ${duration(minutesLeft)} left in the season` })
    if (airing && airing.airingAt > now) {
        notes.push({
            icon: <LuCalendarClock />,
            text: caughtUp ? `You're caught up. Ep ${airing.episode} lands in ${until(airing.airingAt - now)}` : `Ep ${airing.episode} airs in ${until(airing.airingAt - now)}`,
        })
    }

    return (
        <MetaShell
            headline={headline}
            progress={total ? watched / total : null}
            notes={notes}
            score={anime.meanScore}
            status={anime.status}
            kind={[MEDIA_FORMAT_LABELS[anime.format ?? ""] ?? anime.format, anime.season && anime.seasonYear ? `${capitalize(anime.season)} ${anime.seasonYear}` : anime.seasonYear].filter(Boolean).join(" · ")}
            genres={anime.genres}
        />
    )
}

export function MangaContinueMeta({ manga, chapterNumber, chaptersTotal, lastReadAt }: {
    manga: AL_BaseManga | null | undefined
    chapterNumber: number | undefined
    chaptersTotal: number | undefined
    lastReadAt: string | undefined
}) {
    if (!manga) return null
    const read = Math.max(0, (chapterNumber ?? 1) - 1)
    const remaining = chaptersTotal ? Math.max(0, chaptersTotal - read) : null
    const releasing = manga.status === "RELEASING"

    const headline = read === 0
        ? chaptersTotal ? `Page one, ${chaptersTotal} chapters ahead` : "Page one"
        : remaining !== null
            ? remaining <= 1 ? `${read} read, one chapter left` : `${read} read, ${remaining} to go`
            : releasing ? `${read} read, still being written` : `${read} chapters in`

    const notes: { icon: React.ReactNode, text: string }[] = []
    const lastOpened = lastReadAt ? timeAgo(lastReadAt) : null
    if (lastOpened) notes.push({ icon: <LuHistory />, text: `Last opened ${lastOpened}` })
    if (manga.volumes) notes.push({ icon: <LuClock />, text: `${manga.volumes} volumes in print` })

    const year = manga.startDate?.year
    const origin = MANGA_ORIGIN[manga.countryOfOrigin ?? ""]
    return (
        <MetaShell
            headline={headline}
            progress={chaptersTotal ? read / chaptersTotal : null}
            notes={notes}
            score={manga.meanScore}
            status={manga.status}
            kind={[origin ?? MEDIA_FORMAT_LABELS[manga.format ?? ""] ?? manga.format, year ? `Since ${year}` : null].filter(Boolean).join(" · ")}
            genres={manga.genres}
        />
    )
}

function MetaShell({ headline, progress, notes, score, status, kind, genres }: {
    headline: string
    progress: number | null
    notes: { icon: React.ReactNode, text: string }[]
    score?: number
    status?: string
    kind: string
    genres?: string[]
}) {
    const release = status ? RELEASE[status] : undefined
    return (
        <div className="mt-2 space-y-2 rounded-xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/[0.08] backdrop-blur-md" data-continue-meta>
            <div>
                <p className="line-clamp-1 text-[13px] font-semibold text-white/90">{headline}</p>
                {progress !== null && (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-300" style={{ width: `${Math.min(100, Math.max(2, progress * 100))}%` }} />
                    </div>
                )}
            </div>
            {!!notes.length && (
                <ul className="space-y-1">
                    {notes.map(note => (
                        <li key={note.text} className="flex items-center gap-1.5 text-[11px] text-white/55 [&>svg]:size-3 [&>svg]:shrink-0 [&>svg]:text-white/35">
                            {note.icon}<span className="line-clamp-1">{note.text}</span>
                        </li>
                    ))}
                </ul>
            )}
            <div className="flex flex-wrap items-center gap-1">
                {!!score && (
                    <Chip className="bg-amber-300/10 text-amber-100 ring-amber-300/20">
                        <LuStar className="size-2.5 fill-amber-300 text-amber-300" />{(score / 10).toFixed(1)}
                    </Chip>
                )}
                {release && <Chip><span className={cn("size-1.5 rounded-full", release.dot)} />{release.label}</Chip>}
                {!!kind && <Chip>{kind}</Chip>}
                {(genres ?? []).slice(0, 2).map(genre => <Chip key={genre} className="text-white/55">{genre}</Chip>)}
            </div>
        </div>
    )
}

function Chip({ children, className }: { children: React.ReactNode, className?: string }) {
    return <span className={cn("flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-white/75 ring-1 ring-white/10", className)}>{children}</span>
}

function clock(seconds: number) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`
}

function duration(minutes: number) {
    if (minutes < 60) return `${minutes}m`
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m ? `${h}h ${m}m` : `${h}h`
}

function until(seconds: number) {
    if (seconds < 3600) return `${Math.max(1, Math.ceil(seconds / 60))}m`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
    const d = Math.floor(seconds / 86400)
    return d === 1 ? "a day" : `${d} days`
}

export function timeAgo(date: string): string | null {
    const then = new Date(date).getTime()
    if (!Number.isFinite(then) || then <= 0) return null
    const seconds = Math.max(0, (Date.now() - then) / 1000)
    if (seconds < 3600) return "just now"
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    const days = Math.floor(seconds / 86400)
    if (days === 1) return "yesterday"
    if (days < 14) return `${days} days ago`
    if (days < 60) return `${Math.floor(days / 7)} weeks ago`
    if (days < 365) return `${Math.floor(days / 30)} months ago`
    return "over a year ago"
}
