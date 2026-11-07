"use client"

import { useServerQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { TorrentClient_Torrent } from "@/api/generated/types"
import { useGetAchievementSummary } from "@/api/hooks/achievement.hooks"
import { useGetRawAnimeCollection } from "@/api/hooks/anilist.hooks"
import { useGetHomeCounts } from "@/api/hooks/home-counts.hooks"
import { useGetRawAnilistMangaCollection } from "@/api/hooks/manga.hooks"
import { useGetTorrentAddQueue } from "@/api/hooks/torrent_client.hooks"
import { useGetToWatch } from "@/api/hooks/towatch.hooks"
import { useGetUnmatchedTorrents } from "@/api/hooks/unmatched.hooks"
import { describeLists, formatWatchMinutes } from "@/app/(main)/_features/home/list-insights"
import type { LandingWidgetId } from "@/app/(main)/_features/home/landing-widgets"
import { formatTimeUntil, useAiringWindow, useLandingAnimeStats, useLandingMangaStats } from "@/app/(main)/_features/home/landing-widget-views"
import { MEDIA_COUNTRY } from "@/app/(main)/_features/media/_components/media-meta-chips"
import { useMissingEpisodeCount } from "@/app/(main)/_hooks/missing-episodes-loader"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { SeaLink } from "@/components/shared/sea-link"
import { cn } from "@/components/ui/core/styling"
import { formatNumber, formatCount } from "@/lib/helpers/number"
import { getImageUrl } from "@/lib/server/assets"
import React from "react"
import { BiBook } from "react-icons/bi"
import { GiTrophyCup } from "react-icons/gi"
import { LuArrowDown, LuArrowRight, LuArrowUp, LuCalendar, LuFolderSearch, LuListVideo, LuMonitorPlay, LuRadio, LuWand } from "react-icons/lu"

/**
 * "At a glance": the library's numbers drawn as pictures — the anime and manga lists as a ring and a
 * split bar, the week's airing as a bar chart, today's releases as a short list of covers, the
 * queues and downloads with their own shapes. Every card reads the hooks the rest of the app reads.
 */

export const GLANCE_WIDGET_IDS: LandingWidgetId[] = [
    "anime-stats", "manga-stats", "airing-today", "schedule", "to-watch", "unmatched", "torrents", "achievements",
]

const WIDE: LandingWidgetId[] = ["anime-stats", "manga-stats", "airing-today", "schedule"]

export const STATUS_COLORS = {
    current: "bg-sky-400",
    completed: "bg-emerald-400",
    paused: "bg-amber-400",
    dropped: "bg-rose-400",
    planning: "bg-violet-400",
}

export function LandingGlance({ ids }: { ids: LandingWidgetId[] }) {
    if (!ids.length) return null
    return (
        <section className="relative z-[1] space-y-4" data-landing-glance data-landing-stats-strip>
            <div className="px-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[--brand]">At a glance</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">Your anime and manga, right now</h2>
            </div>
            <div className="grid grid-flow-dense grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 sm:gap-4">
                {ids.map(id => (
                    <div key={id} className={cn("min-w-0", WIDE.includes(id) && "md:col-span-2")}>
                        <GlanceCard id={id} />
                    </div>
                ))}
            </div>
        </section>
    )
}

function GlanceCard({ id }: { id: LandingWidgetId }) {
    switch (id) {
        case "anime-stats": return <AnimeCard />
        case "manga-stats": return <MangaCard />
        case "airing-today": return <AiringTodayCard />
        case "schedule": return <ScheduleCard />
        case "to-watch": return <TodoCard />
        case "unmatched": return <UnmatchedCard />
        case "torrents": return <TorrentsCard />
        case "achievements": return <AchievementsCard />
        default: return null
    }
}

// ─── Anime and manga ──────────────────────────────────────────────────────────

export function useListDescription(medium: "anime" | "manga") {
    const profile = useServerStatus()?.currentProfile
    const anime = useGetRawAnimeCollection(medium === "anime" && !!profile?.id, profile?.id)
    const manga = useGetRawAnilistMangaCollection(medium === "manga" && !!profile?.id, profile?.id)
    const data = medium === "anime" ? anime.data : manga.data
    return React.useMemo(() => profile?.id ? describeLists(data, medium) : null, [data, medium, profile?.id])
}

function AnimeCard() {
    const { stats, isLoading, isError } = useLandingAnimeStats()
    const d = useListDescription("anime")
    const { data: counts } = useGetHomeCounts()
    return (
        <ListCard
            title="Anime"
            icon={<LuMonitorPlay />}
            href="/anime"
            unavailable={!isLoading && (isError || !stats)}
            stats={stats}
            paused={d?.paused ?? 0}
            dropped={d?.dropped ?? 0}
            currentLabel="Watching"
            figures={[
                { label: "Episodes watched", value: stats ? formatNumber(stats.progress) : null },
                { label: "Time watched", value: d ? formatWatchMinutes(d.minutesWatched) : null },
                { label: "Episodes to go", value: d ? formatNumber(d.remaining) : null },
                { label: "Server files", value: counts ? formatNumber(counts.animeFiles) : null, sub: counts?.animeSize || undefined },
            ]}
            chips={[
                d?.genres[0] && `Mostly ${d.genres[0].key}`,
                d?.communityMean && `★ ${(d.communityMean / 10).toFixed(1)} average`,
                d?.repeats ? `${formatNumber(d.repeats)} rewatches` : null,
            ]}
        />
    )
}

function MangaCard() {
    const { stats, isLoading, isError } = useLandingMangaStats()
    const d = useListDescription("manga")
    const { data: counts } = useGetHomeCounts()
    const topOrigin = d?.countries[0]
    const originLabel = topOrigin && ({ JP: "Manga", KR: "Manhwa", CN: "Manhua", TW: "Manhua" } as Record<string, string>)[topOrigin.key]
    return (
        <ListCard
            title="Manga"
            icon={<BiBook />}
            href="/manga"
            unavailable={!isLoading && (isError || !stats)}
            stats={stats}
            paused={d?.paused ?? 0}
            dropped={d?.dropped ?? 0}
            currentLabel="Reading"
            figures={[
                { label: "Chapters read", value: stats ? formatNumber(stats.progress) : null },
                { label: "Chapters to go", value: d ? formatNumber(d.remaining) : null },
                { label: "Rereads", value: d ? formatNumber(d.repeats) : null },
                { label: "Downloaded", value: counts?.mangaAvailable ? formatNumber(counts.mangaChapters) : null, sub: "chapters on server" },
            ]}
            chips={[
                d?.genres[0] && `Mostly ${d.genres[0].key}`,
                originLabel && topOrigin && `${MEDIA_COUNTRY[topOrigin.key]?.flag ?? ""} ${Math.round((topOrigin.count / Math.max(1, d!.started)) * 100)}% ${originLabel}`,
                d?.communityMean && `★ ${(d.communityMean / 10).toFixed(1)} average`,
            ]}
        />
    )
}

function ListCard({ title, icon, href, unavailable, stats, paused, dropped, currentLabel, figures, chips }: {
    title: string
    icon: React.ReactNode
    href: string
    unavailable: boolean
    stats: { onLists: number, planning: number, current: number, completed: number } | null
    paused: number
    dropped: number
    currentLabel: string
    figures: { label: string, value: string | null, sub?: string }[]
    chips: (string | null | undefined | false | 0)[]
}) {
    const started = stats ? stats.onLists - stats.planning : 0
    const completion = stats && started ? stats.completed / started : 0
    const segments = stats ? [
        { label: currentLabel, value: stats.current, color: STATUS_COLORS.current },
        { label: "Completed", value: stats.completed, color: STATUS_COLORS.completed },
        { label: "Paused", value: paused, color: STATUS_COLORS.paused },
        { label: "Dropped", value: dropped, color: STATUS_COLORS.dropped },
        { label: "Planning", value: stats.planning, color: STATUS_COLORS.planning },
    ] : []
    return (
        <CardShell title={unavailable ? `${title} · unavailable` : title} icon={icon} href={href}>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <Ring value={completion} size={112} label={stats ? `${Math.round(completion * 100)}%` : "—"} sub="completed" />
                <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3">
                    <Figure value={stats ? formatNumber(stats.onLists) : null} label="On your lists" big />
                    {figures.map(f => <Figure key={f.label} value={f.value} label={f.label} sub={f.sub} />)}
                </div>
            </div>
            {!!stats?.onLists && <SegmentBar className="mt-5" segments={segments} />}
            <ChipRow chips={chips} />
        </CardShell>
    )
}

// ─── Airing ───────────────────────────────────────────────────────────────────

function useListedAnimeIds() {
    const profile = useServerStatus()?.currentProfile
    const { data } = useGetRawAnimeCollection(!!profile?.id, profile?.id)
    return React.useMemo(() => {
        const ids = new Set<number>()
        for (const list of data?.MediaListCollection?.lists ?? []) {
            for (const entry of list.entries ?? []) if (entry.media?.id) ids.add(entry.media.id)
        }
        return ids
    }, [data])
}

function AiringTodayCard() {
    const { schedules, total, isLoading } = useAiringWindow("day")
    const listed = useListedAnimeIds()
    const now = Math.floor(Date.now() / 1000)
    const upcoming = React.useMemo(() => [...schedules]
        .sort((a, b) => Number(listed.has(b.media?.id ?? 0)) - Number(listed.has(a.media?.id ?? 0)) || a.airingAt - b.airingAt)
        .slice(0, 4), [schedules, listed])
    const yours = schedules.filter(s => listed.has(s.media?.id ?? 0)).length

    return (
        <CardShell title="Airing today" icon={<LuRadio />} href="/schedule" aside={isLoading ? null : `${formatNumber(total)} left · ${yours} on your list`}>
            {isLoading
                ? <SkeletonRows />
                : !upcoming.length
                    ? <Empty>Nothing else airs today.</Empty>
                    : <ul className="space-y-2">
                        {upcoming.map(s => {
                            const mine = listed.has(s.media?.id ?? 0)
                            return (
                                <li key={s.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-2 ring-1 ring-white/[0.06]">
                                    <div className="relative h-14 w-10 flex-none overflow-hidden rounded-lg bg-white/5">
                                        {s.media?.coverImage?.medium && <img src={getImageUrl(s.media.coverImage.medium)} alt="" loading="lazy" className="size-full object-cover" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-white">{s.media?.title?.userPreferred}</p>
                                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/50">
                                            Episode {s.episode}{s.media?.episodes ? ` of ${s.media.episodes}` : ""}
                                            {mine && <span className="rounded-full bg-[--brand]/20 px-1.5 py-px text-[10px] font-semibold text-brand-100">On your list</span>}
                                        </p>
                                    </div>
                                    <span className="flex-none rounded-full bg-white/[0.07] px-2.5 py-1 text-xs font-bold tabular-nums text-white">{formatTimeUntil(s.airingAt - now)}</span>
                                </li>
                            )
                        })}
                    </ul>}
        </CardShell>
    )
}

function ScheduleCard() {
    const missing = useMissingEpisodeCount()
    const { schedules, total, isLoading } = useAiringWindow("week")
    const listed = useListedAnimeIds()

    const days = React.useMemo(() => {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        return Array.from({ length: 7 }, (_, i) => {
            const from = new Date(start)
            from.setDate(start.getDate() + i)
            const to = new Date(from)
            to.setDate(from.getDate() + 1)
            const inDay = schedules.filter(s => s.airingAt * 1000 >= from.getTime() && s.airingAt * 1000 < to.getTime())
            return {
                label: i === 0 ? "Today" : from.toLocaleDateString(undefined, { weekday: "short" }),
                all: inDay.length,
                yours: inDay.filter(s => listed.has(s.media?.id ?? 0)).length,
            }
        })
    }, [schedules, listed])
    const max = Math.max(1, ...days.map(d => d.all))

    return (
        <CardShell title="This week" icon={<LuCalendar />} href="/schedule" aside={isLoading ? null : `${formatNumber(total)} episodes airing`}>
            <div className="flex items-end gap-5">
                <div className="flex-none">
                    <Figure value={missing === undefined || missing === null ? null : formatNumber(missing)} label="Missing episodes" big />
                    <p className="mt-2 flex items-center gap-3 text-[10px] text-white/50">
                        <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-brand-300" />Yours</span>
                        <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-white/20" />All</span>
                    </p>
                </div>
                <div className="flex h-28 flex-1 items-end gap-1.5">
                    {days.map((day, i) => (
                        <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${day.label}: ${day.all} airing, ${day.yours} on your list`}>
                            <span className="text-[10px] tabular-nums text-white/45">{day.all || ""}</span>
                            <div className="relative w-full overflow-hidden rounded-t-md bg-white/15" style={{ height: `${Math.max(4, (day.all / max) * 72)}px` }}>
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-500 to-brand-300" style={{ height: `${day.all ? (day.yours / day.all) * 100 : 0}%` }} />
                            </div>
                            <span className={cn("truncate text-[10px]", i === 0 ? "font-bold text-white" : "text-white/55")}>{day.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </CardShell>
    )
}

// ─── Queues and downloads ─────────────────────────────────────────────────────

function TodoCard() {
    const { data: todo, isLoading } = useGetToWatch()
    const anime = todo?.filter(e => (e.mediaType ?? "ANIME") === "ANIME").length ?? 0
    const manga = todo?.filter(e => e.mediaType === "MANGA").length ?? 0
    const covers = (todo ?? []).filter(e => e.coverImage).slice(0, 4)
    return (
        <CardShell title="Todo List" icon={<LuListVideo />} href="/to-watch">
            <div className="flex items-center justify-between gap-3">
                <Figure value={isLoading ? null : formatNumber(todo?.length ?? 0)} label="Queued" big />
                {!!covers.length && (
                    <div className="flex -space-x-3">
                        {covers.map((e, i) => (
                            <img key={`${e.mediaId}-${i}`} src={getImageUrl(e.coverImage!)} alt="" loading="lazy" className="h-14 w-10 rounded-lg object-cover shadow-lg ring-2 ring-black/60" style={{ transform: `rotate(${(i - 1.5) * 4}deg)` }} />
                        ))}
                    </div>
                )}
            </div>
            {!!todo?.length && <SegmentBar className="mt-4" segments={[
                { label: "Anime", value: anime, color: "bg-sky-400" },
                { label: "Manga", value: manga, color: "bg-fuchsia-400" },
            ]} />}
        </CardShell>
    )
}

function UnmatchedCard() {
    const { data: unmatched } = useGetUnmatchedTorrents({ staleTime: 60_000 })
    const bytes = (unmatched ?? []).reduce((n, t) => n + (t.size ?? 0), 0)
    const files = (unmatched ?? []).reduce((n, t) => n + (t.fileCount ?? 0), 0)
    return (
        <CardShell title="Unmatched" icon={<LuFolderSearch />} href="/unmatched">
            <div className="grid grid-cols-2 gap-3">
                <Figure value={unmatched ? formatNumber(unmatched.length) : null} label="Waiting" big />
                <Figure value={unmatched ? formatBytes(bytes) : null} label={`${formatNumber(files)} files`} />
            </div>
            {!!unmatched?.length && (
                <ul className="mt-3 space-y-1">
                    {unmatched.slice(0, 2).map(t => (
                        <li key={t.path} className="truncate text-[11px] text-white/50">{t.animeTitleRomaji || t.name}</li>
                    ))}
                </ul>
            )}
        </CardShell>
    )
}

function TorrentsCard() {
    const { data: queue } = useGetTorrentAddQueue()
    const { data: torrents } = useServerQuery<TorrentClient_Torrent[]>({
        endpoint: API_ENDPOINTS.TORRENT_CLIENT.GetActiveTorrentList.endpoint,
        method: API_ENDPOINTS.TORRENT_CLIENT.GetActiveTorrentList.methods[0],
        queryKey: ["LANDING-torrent-list"],
        refetchInterval: 15_000,
        staleTime: 0,
        // The client being off is the card's business to show, not a toast on the landing page.
        muteError: true,
    })
    const count = (status: string) => torrents?.filter(t => t?.status === status).length ?? 0
    const down = (torrents ?? []).reduce((n, t) => n + (t.downSpeedBytes ?? 0), 0)
    const up = (torrents ?? []).reduce((n, t) => n + (t.upSpeedBytes ?? 0), 0)
    const active = (torrents ?? []).filter(t => t.status === "downloading").sort((a, b) => b.progress - a.progress).slice(0, 2)
    return (
        <CardShell title="Torrents" icon={<LuWand />} href="/torrent-list" aside={queue?.waiting ? `${formatCount(queue.waiting)} waiting to add` : null}>
            {!torrents
                ? <Empty>Torrent client not reachable.</Empty>
                : <>
                    <div className="flex items-center gap-4 text-sm font-semibold tabular-nums text-white">
                        <span className="flex items-center gap-1"><LuArrowDown className="size-3.5 text-sky-300" />{formatBytes(down)}/s</span>
                        <span className="flex items-center gap-1"><LuArrowUp className="size-3.5 text-emerald-300" />{formatBytes(up)}/s</span>
                    </div>
                    <SegmentBar className="mt-3" segments={[
                        { label: "Downloading", value: count("downloading"), color: "bg-sky-400" },
                        { label: "Seeding", value: count("seeding"), color: "bg-emerald-400" },
                        { label: "Paused", value: count("paused"), color: "bg-amber-400" },
                    ]} />
                    {active.map(t => (
                        <div key={t.hash} className="mt-2.5">
                            <p className="truncate text-[11px] text-white/60">{t.name}</p>
                            <div className="sea-progress-track mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                                <div className="sea-progress-fill h-full rounded-full bg-sky-400" style={{ width: `${Math.round(t.progress * 100)}%` }} />
                            </div>
                        </div>
                    ))}
                </>}
        </CardShell>
    )
}

function AchievementsCard() {
    const { data, isLoading } = useGetAchievementSummary()
    const ratio = data?.totalCount ? data.unlockedCount / data.totalCount : 0
    return (
        <CardShell title="Achievements" icon={<GiTrophyCup />} href="/achievements">
            <div className="flex items-center gap-4">
                <Ring value={ratio} size={76} label={isLoading ? "—" : `${Math.round(ratio * 100)}%`} color="stroke-amber-300" />
                <div className="space-y-2">
                    <Figure value={isLoading ? null : formatNumber(data?.unlockedCount ?? 0)} label="Unlocked" />
                    <Figure value={isLoading ? null : formatNumber((data?.totalCount ?? 0) - (data?.unlockedCount ?? 0))} label="Still to earn" />
                </div>
            </div>
        </CardShell>
    )
}

// ─── Materials ────────────────────────────────────────────────────────────────

function CardShell({ title, icon, href, aside, children }: {
    title: string
    icon: React.ReactNode
    href: string
    aside?: string | null
    children: React.ReactNode
}) {
    return (
        <SeaLink href={href} className="group block h-full">
            <div className="relative h-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-black/45 via-black/30 to-brand-950/20 p-4 shadow-xl shadow-black/20 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-[--brand]/60 hover:shadow-[--brand]/10 lg:p-5">
                <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-[--brand]/15 blur-2xl opacity-60 transition-opacity group-hover:opacity-100" />
                <div className="relative mb-4 flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400/40 to-brand-600/25 text-white ring-1 ring-white/10 [&>svg]:size-[18px]">{icon}</span>
                    <p className="font-semibold text-white">{title}</p>
                    {aside && <span className="ml-auto truncate text-xs text-white/50">{aside}</span>}
                    <LuArrowRight className={cn("size-4 flex-none text-white/30 transition group-hover:translate-x-0.5 group-hover:text-[--brand]", !aside && "ml-auto")} />
                </div>
                <div className="relative">{children}</div>
            </div>
        </SeaLink>
    )
}

function Figure({ value, label, sub, big }: { value: string | null, label: string, sub?: string, big?: boolean }) {
    return (
        <div className="min-w-0 leading-none">
            <p className={cn("font-extrabold tabular-nums text-white", big ? "text-3xl lg:text-4xl" : "text-xl lg:text-2xl")}>{value ?? "—"}</p>
            <p className="mt-1.5 truncate text-[10px] font-semibold uppercase tracking-wider text-white/60">{label}</p>
            {sub && <p className="mt-1 truncate text-[10px] text-white/40">{sub}</p>}
        </div>
    )
}

export function Ring({ value, size, label, sub, color = "stroke-[--brand]" }: { value: number, size: number, label: string, sub?: string, color?: string }) {
    const stroke = Math.max(6, size / 12)
    const r = (size - stroke) / 2
    const c = 2 * Math.PI * r
    return (
        <div className="relative flex-none self-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-white/10" />
                <circle
                    cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
                    className={cn(color, "transition-[stroke-dashoffset] duration-700")}
                    strokeDasharray={c}
                    strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-extrabold tabular-nums text-white">{label}</span>
                {sub && <span className="text-[9px] uppercase tracking-wider text-white/50">{sub}</span>}
            </div>
        </div>
    )
}

export function SegmentBar({ segments, className }: { segments: { label: string, value: number, color: string }[], className?: string }) {
    const total = segments.reduce((n, s) => n + s.value, 0)
    if (!total) return null
    return (
        <div className={className}>
            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
                {segments.filter(s => s.value > 0).map(s => (
                    <span key={s.label} className={cn("h-full first:rounded-l-full last:rounded-r-full", s.color)} style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${s.value}`} />
                ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {segments.map(s => (
                    <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-white/65">
                        <span className={cn("size-2 rounded-full", s.color)} />{s.label}<span className="tabular-nums text-white/40">{formatNumber(s.value)}</span>
                    </span>
                ))}
            </div>
        </div>
    )
}

function ChipRow({ chips }: { chips: (string | null | undefined | false | 0)[] }) {
    const shown = chips.filter((c): c is string => !!c)
    if (!shown.length) return null
    return (
        <div className="mt-4 flex flex-wrap gap-1.5">
            {shown.map(chip => <span key={chip} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/75 ring-1 ring-white/10">{chip}</span>)}
        </div>
    )
}

function SkeletonRows() {
    return <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-[4.5rem] animate-pulse rounded-xl bg-white/5" />)}</div>
}

function Empty({ children }: { children: React.ReactNode }) {
    return <p className="rounded-xl border border-dashed border-white/15 px-3 py-6 text-center text-xs text-white/50">{children}</p>
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    const units = ["KB", "MB", "GB", "TB"]
    let value = bytes / 1024
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit++
    }
    return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`
}
