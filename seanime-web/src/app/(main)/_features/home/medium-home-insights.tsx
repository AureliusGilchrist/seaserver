"use client"

import { useGetProfileMissingEpisodes } from "@/api/hooks/anime_entries.hooks"
import { useGetHomeCounts, useGetMangaDownloadSize } from "@/api/hooks/home-counts.hooks"
import { ProfileBody } from "@/app/(main)/_features/home/collection-profile-widget"
import { Ring, SegmentBar, STATUS_COLORS, useListDescription } from "@/app/(main)/_features/home/landing-glance"
import { useLandingAnimeStats, useLandingMangaStats } from "@/app/(main)/_features/home/landing-widget-views"
import type { ListDescription } from "@/app/(main)/_features/home/list-insights"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { SeaLink } from "@/components/shared/sea-link"
import { formatNumber, formatCount } from "@/lib/helpers/number"
import { getImageUrl } from "@/lib/server/assets"
import React from "react"
import { LuDownload, LuFlag, LuPlay } from "react-icons/lu"

type Metric = { label: string, value: number | string | null, detail: string }
type Medium = "Anime" | "Manga"
type Counts = { onLists: number, planning: number, current: number, completed: number, progress: number } | null

/**
 * The anime and manga home screens' insights: the same numbers as before, now drawn — a completion
 * ring and the list split by status, what is closest to finished, and the collection profile
 * (genres, formats, release status, origin, eras, themes, top scored) for just this medium.
 */
function Insights({ medium, metrics, stats, d, afterWelcome, children }: {
    medium: Medium
    metrics: Metric[]
    stats: Counts
    d: ListDescription | null
    /** Drawn between the welcome card and the insights, e.g. the manga home's continue reading. */
    afterWelcome?: React.ReactNode
    children?: React.ReactNode
}) {
    const profile = useServerStatus()?.currentProfile
    const lower = medium.toLowerCase() as "anime" | "manga"
    const started = stats ? stats.onLists - stats.planning : 0
    const completion = stats && started ? stats.completed / started : 0

    return (
        <div className="space-y-4" data-medium-home-insights={lower}>
            <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/25 p-5 shadow-2xl shadow-black/25 backdrop-blur-md sm:p-7">
                <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-[--brand]/20 blur-3xl" />
                <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-[--brand]">{medium} home</p>
                <h1 className="relative mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                    {profile?.name ? `Welcome back, ${profile.name}` : "Welcome back"}
                </h1>
                <p className="relative mt-2 text-sm text-white/70">Your {lower} collection and activity, at a glance.</p>
            </section>

            {afterWelcome}

            <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-black/40 via-black/25 to-brand-950/25 p-5 shadow-2xl shadow-black/25 backdrop-blur-md sm:p-7">
                <div className="pointer-events-none absolute -left-24 -bottom-24 size-72 rounded-full bg-[--brand]/10 blur-3xl" />
                <p className="relative text-[11px] font-bold uppercase tracking-[0.2em] text-[--brand]">Your numbers</p>
                <h2 className="relative mt-1 text-2xl font-bold tracking-tight text-white">{medium} library insights</h2>
                <p className="relative mt-1 text-sm text-white/60">Personal AniList progress alongside server-wide storage.</p>

                <div className="relative mt-5 grid gap-4 xl:grid-cols-[minmax(18rem,22rem)_1fr]">
                    <Panel title="Where your list stands">
                        <div className="flex items-center gap-5">
                            <Ring value={completion} size={120} label={stats ? `${Math.round(completion * 100)}%` : "—"} sub="completed" />
                            <div className="space-y-2 text-sm text-white/70">
                                <p><span className="text-2xl font-extrabold tabular-nums text-white">{stats ? formatNumber(started) : "—"}</span> started</p>
                                <p><span className="font-bold tabular-nums text-white">{stats ? formatNumber(stats.completed) : "—"}</span> finished</p>
                                <p><span className="font-bold tabular-nums text-white">{stats ? formatNumber(stats.planning) : "—"}</span> planned</p>
                            </div>
                        </div>
                        {!!stats?.onLists && <SegmentBar className="mt-5" segments={statusSegments(medium, stats, d)} />}
                    </Panel>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 2xl:grid-cols-4">
                        {metrics.map(metric => (
                            <div key={metric.label} className="min-w-0 rounded-2xl border border-white/[0.08] bg-black/25 p-3.5 shadow-lg shadow-black/10 backdrop-blur-md">
                                <p className="break-words text-2xl font-extrabold tabular-nums text-white">{metric.value === null ? "—" : typeof metric.value === "number" ? metric.value.toLocaleString() : metric.value}</p>
                                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/75">{metric.label}</p>
                                <p className="mt-1 text-[11px] text-white/50">{metric.detail}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {children}

                {!!d?.closest.length && (
                    <div className="relative mt-4">
                        <Panel title="Closest to finishing" icon={<LuFlag />}>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                {d.closest.map(item => (
                                    <SeaLink key={item.id} href={lower === "anime" ? `/entry?id=${item.id}` : `/manga/entry?id=${item.id}`} className="group flex min-w-0 items-center gap-3 rounded-xl bg-white/[0.03] p-2 ring-1 ring-white/[0.06] transition hover:bg-white/[0.07]">
                                        <div className="h-16 w-11 flex-none overflow-hidden rounded-lg bg-white/5">
                                            {item.image && <img src={getImageUrl(item.image)} alt="" loading="lazy" className="size-full object-cover" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold text-white group-hover:text-brand-100">{item.title}</p>
                                            <p className="mt-0.5 text-[11px] text-white/50">
                                                {item.total - item.progress} {lower === "anime" ? "episode" : "chapter"}{item.total - item.progress === 1 ? "" : "s"} left · {item.progress}/{formatCount(item.total)}
                                            </p>
                                            <div className="sea-progress-track mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                                                <div className="sea-progress-fill h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-300" style={{ width: `${(item.progress / item.total) * 100}%` }} />
                                            </div>
                                        </div>
                                    </SeaLink>
                                ))}
                            </div>
                        </Panel>
                    </div>
                )}
            </section>

            {d && d.started > 0 && (
                <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-black/40 via-black/25 to-brand-950/25 p-5 shadow-2xl shadow-black/25 backdrop-blur-md sm:p-7" data-medium-collection-profile>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[--brand]">Your taste</p>
                    <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">What your {lower} list is made of</h2>
                    <p className="mt-1 text-sm text-white/60">Genres, themes, formats, origin and eras across {formatNumber(d.started)} {lower} you have started.</p>
                    <ProfileBody d={d} medium={lower} />
                </section>
            )}
        </div>
    )
}

/** The list split by status, in the landing page's colours. */
function statusSegments(medium: Medium, stats: NonNullable<Counts>, d: ListDescription | null) {
    const rows: [string, number, string][] = [
        [medium === "Anime" ? "Watching" : "Reading", stats.current, STATUS_COLORS.current],
        ["Completed", stats.completed, STATUS_COLORS.completed],
        ["Paused", d?.paused ?? 0, STATUS_COLORS.paused],
        ["Dropped", d?.dropped ?? 0, STATUS_COLORS.dropped],
        ["Planning", stats.planning, STATUS_COLORS.planning],
    ]
    return rows.map(([label, value, color]) => ({ label, value, color }))
}

function Panel({ title, icon, children }: { title: string, icon?: React.ReactNode, children: React.ReactNode }) {
    return (
        <div className="min-w-0 rounded-2xl border border-white/[0.08] bg-black/25 p-4 shadow-lg shadow-black/10 backdrop-blur-md">
            <p className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60 [&>svg]:size-3">{icon}{title}</p>
            {children}
        </div>
    )
}

export function AnimeHomeInsights({ afterWelcome }: { afterWelcome?: React.ReactNode } = {}) {
    const profile = useServerStatus()?.currentProfile
    const { stats, isLoading, isError } = useLandingAnimeStats()
    const d = useListDescription("anime")
    const { data: counts, isError: countsError } = useGetHomeCounts()
    const missing = useGetProfileMissingEpisodes(profile?.id)
    const personalDetail = !profile?.id ? "Sign in to a profile" : isLoading ? "Loading personal AniList..." : isError ? "Could not load profile's AniList" : stats ? "Your AniList" : "Personal AniList unavailable"
    const diskDetail = countsError ? "Could not load server totals" : counts ? "Server-wide" : "Loading server totals..."
    const ready = (missing.data?.episodes ?? []).slice(0, 6)
    return <Insights medium="Anime" stats={stats} d={d} afterWelcome={afterWelcome} metrics={[
        { label: "Titles in library", value: stats?.onLists ?? null, detail: `${personalDetail} · including planning` },
        { label: "Watching", value: stats?.current ?? null, detail: stats ? "Includes rewatching" : personalDetail },
        { label: "Planning", value: stats?.planning ?? null, detail: personalDetail },
        { label: "Completed", value: stats?.completed ?? null, detail: personalDetail },
        { label: "Episodes watched", value: stats?.progress ?? null, detail: personalDetail },
        { label: "Local anime files", value: counts?.animeFiles ?? null, detail: diskDetail },
        { label: "Library size", value: counts?.animeSize || null, detail: counts?.animeSize ? "Server library folders at startup" : "Server library size unavailable" },
        { label: "Missing episodes", value: missing.data ? (missing.data.episodes?.length ?? 0) : null, detail: !profile?.id ? "Sign in to a profile" : missing.isError ? "Could not load missing episodes" : missing.data ? "Local shows on your list · excludes silenced" : "Loading..." },
    ]}>
        {!!ready.length && (
            <div className="relative mt-4">
                <Panel title="Aired, not on disk yet" icon={<LuPlay />}>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                        {ready.map(episode => (
                            <SeaLink key={`${episode.baseAnime?.id}-${episode.episodeNumber}`} href={`/entry?id=${episode.baseAnime?.id}`} className="group block min-w-0">
                                <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10">
                                    {episode.baseAnime?.coverImage?.large && <img src={getImageUrl(episode.baseAnime.coverImage.large)} alt="" loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-105" />}
                                    <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur">Ep {episode.episodeNumber}</span>
                                </div>
                                <p className="mt-1.5 line-clamp-1 text-xs text-white/75 group-hover:text-white">{episode.baseAnime?.title?.userPreferred}</p>
                            </SeaLink>
                        ))}
                    </div>
                </Panel>
            </div>
        )}
    </Insights>
}

export function MangaHomeInsights({ afterWelcome }: { afterWelcome?: React.ReactNode } = {}) {
    const profile = useServerStatus()?.currentProfile
    const { stats, isLoading, isError } = useLandingMangaStats()
    const d = useListDescription("manga")
    const { data: counts, isError: countsError } = useGetHomeCounts()
    const size = useGetMangaDownloadSize()
    const personalDetail = !profile?.id ? "Sign in to a profile" : isLoading ? "Loading personal AniList..." : isError ? "Could not load profile's AniList" : stats ? "Your AniList" : "Personal AniList unavailable"
    const downloaded = counts?.mangaAvailable ? counts.mangaChapters : null
    return <Insights medium="Manga" stats={stats} d={d} afterWelcome={afterWelcome} metrics={[
        { label: "Titles in collection", value: stats?.onLists ?? null, detail: `${personalDetail} · including planning` },
        { label: "Reading", value: stats?.current ?? null, detail: stats ? "Includes rereading" : personalDetail },
        { label: "Planning", value: stats?.planning ?? null, detail: personalDetail },
        { label: "Completed", value: stats?.completed ?? null, detail: personalDetail },
        { label: "Chapters read", value: stats?.progress ?? null, detail: personalDetail },
        { label: "Downloaded chapters", value: downloaded, detail: countsError ? "Could not load server totals" : counts?.mangaAvailable ? "Server-wide" : counts ? "Downloader unavailable" : "Loading server totals..." },
        { label: "Download size", value: !size.isError && size.data?.ready ? size.data.size : null, detail: size.isError ? "Could not read download directory" : size.data?.ready ? "Server download folder · cached 5 min" : "Calculating server storage..." },
    ]}>
        {(!!stats || downloaded !== null) && <MangaReadingShape stats={stats} d={d} downloaded={downloaded} size={!size.isError && size.data?.ready ? size.data.size : null} />}
    </Insights>
}

/** Manga only: how reading, what is left and what is on the server's disk compare, as bars. */
function MangaReadingShape({ stats, d, downloaded, size }: { stats: Counts, d: ListDescription | null, downloaded: number | null, size: string | null }) {
    const read = stats?.progress ?? 0
    const left = d?.remaining ?? 0
    const max = Math.max(1, read, left, downloaded ?? 0)
    const rows = [
        { label: "Chapters read", value: read, color: "from-emerald-500/70 to-emerald-300", note: d?.repeats ? `${formatNumber(d.repeats)} rereads` : "Your AniList" },
        { label: "Still to read", value: left, color: "from-violet-500/70 to-violet-300", note: "On what you are reading" },
        ...(downloaded !== null ? [{ label: "On the server", value: downloaded, color: "from-sky-500/70 to-sky-300", note: size ? `${size} downloaded, server-wide` : "Server-wide" }] : []),
    ]
    const formats = d?.formats ?? []
    const novels = formats.find(f => f.key === "NOVEL")?.count ?? 0
    const oneShots = formats.find(f => f.key === "ONE_SHOT")?.count ?? 0
    return (
        <div className="relative mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <Panel title="Reading, at scale" icon={<LuDownload />}>
                <ul className="space-y-3">
                    {rows.map(row => (
                        <li key={row.label}>
                            <div className="flex items-baseline justify-between gap-3 text-sm">
                                <span className="text-white/80">{row.label}</span>
                                <span className="font-bold tabular-nums text-white">{formatNumber(row.value)}</span>
                            </div>
                            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                                <div className={`h-full rounded-full bg-gradient-to-r ${row.color}`} style={{ width: `${Math.max(1, (row.value / max) * 100)}%` }} />
                            </div>
                            <p className="mt-0.5 text-[10px] text-white/40">{row.note}</p>
                        </li>
                    ))}
                </ul>
            </Panel>
            <Panel title="Shelf">
                <div className="grid grid-cols-2 gap-3">
                    <Stat value={d ? formatNumber(d.started) : "—"} label="Series started" />
                    <Stat value={d ? formatNumber(d.completedThisYear) : "—"} label={`Finished in ${new Date().getFullYear()}`} />
                    <Stat value={d ? formatNumber(novels) : "—"} label="Light novels" />
                    <Stat value={d ? formatNumber(oneShots) : "—"} label="One-shots" />
                </div>
                {!!d?.started && read > 0 && (
                    <p className="mt-3 text-[11px] text-white/45">About {formatNumber(Math.round(read / d.started))} chapters per series you have started.</p>
                )}
            </Panel>
        </div>
    )
}

function Stat({ value, label }: { value: string, label: string }) {
    return (
        <div className="min-w-0 leading-none">
            <p className="text-xl font-extrabold tabular-nums text-white">{value}</p>
            <p className="mt-1.5 truncate text-[10px] font-semibold uppercase tracking-wider text-white/55">{label}</p>
        </div>
    )
}
