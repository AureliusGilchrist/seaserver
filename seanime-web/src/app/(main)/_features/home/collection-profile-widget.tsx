"use client"

import { useGetRawAnimeCollection } from "@/api/hooks/anilist.hooks"
import { useGetRawAnilistMangaCollection } from "@/api/hooks/manga.hooks"
import { describeLists, formatWatchMinutes, type ListDescription, type Tally } from "@/app/(main)/_features/home/list-insights"
import { MEDIA_COUNTRY, MEDIA_FORMAT_LABELS } from "@/app/(main)/_features/media/_components/media-meta-chips"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { SeaLink } from "@/components/shared/sea-link"
import { cn } from "@/components/ui/core/styling"
import { formatNumber, formatCount } from "@/lib/helpers/number"
import { getImageUrl } from "@/lib/server/assets"
import React from "react"
import {
    LuCalendarClock, LuCircleCheck, LuCirclePause, LuCircleX, LuClock, LuHourglass, LuRepeat, LuSparkles, LuStar,
} from "react-icons/lu"

/**
 * The details pages' metadata — genres, themes, format, release status, origin, era, length and
 * score — read across a whole list: what the person's collection is made of. Same AniList lists the
 * library insights count, so it costs no extra request.
 */

type Medium = "anime" | "manga"

const RELEASE_STATUS: Record<string, { label: string, color: string }> = {
    FINISHED: { label: "Finished", color: "bg-emerald-400" },
    RELEASING: { label: "Releasing", color: "bg-sky-400" },
    NOT_YET_RELEASED: { label: "Not yet released", color: "bg-amber-400" },
    HIATUS: { label: "On hiatus", color: "bg-orange-400" },
    CANCELLED: { label: "Cancelled", color: "bg-red-400" },
}

const FORMAT_COLORS = ["bg-brand-400", "bg-violet-400", "bg-sky-400", "bg-emerald-400", "bg-amber-400", "bg-rose-400", "bg-teal-400", "bg-fuchsia-400", "bg-lime-400"]

const MANGA_COUNTRY_LABEL: Record<string, string> = { JP: "Manga", KR: "Manhwa", CN: "Manhua", TW: "Manhua" }

export function LandingCollectionProfileWidget() {
    const profile = useServerStatus()?.currentProfile
    const anime = useGetRawAnimeCollection(!!profile?.id, profile?.id)
    const manga = useGetRawAnilistMangaCollection(!!profile?.id, profile?.id)
    const [medium, setMedium] = React.useState<Medium>("anime")

    const described = React.useMemo(() => ({
        anime: profile?.id ? describeLists(anime.data, "anime") : null,
        manga: profile?.id ? describeLists(manga.data, "manga") : null,
    }), [anime.data, manga.data, profile?.id])

    const query = medium === "anime" ? anime : manga
    const d = described[medium]

    return (
        <section
            className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-black/40 via-black/25 to-brand-950/25 p-5 shadow-2xl shadow-black/25 backdrop-blur-xl sm:p-7"
            data-collection-profile
        >
            <div className="pointer-events-none absolute -left-24 -bottom-24 size-72 rounded-full bg-[--brand]/10 blur-3xl" />
            <header className="relative flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[--brand]">Your taste</p>
                    <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">Collection profile</h2>
                    <p className="mt-1 text-sm text-white/60">
                        {query.isLoading
                            ? "Reading your lists…"
                            : !d
                                ? "Your personal AniList is unavailable."
                                : `Genres, themes, formats and eras across ${formatNumber(d.started)} ${medium} you have started.`}
                    </p>
                </div>
                <div className="flex rounded-full border border-white/10 bg-black/30 p-1 text-sm" role="tablist">
                    {(["anime", "manga"] as const).map(m => (
                        <button
                            key={m}
                            type="button"
                            role="tab"
                            aria-selected={medium === m}
                            onClick={() => setMedium(m)}
                            className={cn(
                                "rounded-full px-4 py-1.5 font-semibold capitalize transition",
                                medium === m ? "bg-white/15 text-white shadow" : "text-white/55 hover:text-white",
                            )}
                        >
                            {m}
                        </button>
                    ))}
                </div>
            </header>

            {d && d.started > 0 ? <ProfileBody d={d} medium={medium} /> : !query.isLoading && (
                <p className="relative mt-5 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-8 text-center text-sm text-white/55">
                    {d ? `Start some ${medium} and your collection profile fills in here.` : "Link AniList to this profile to see your collection profile."}
                </p>
            )}
        </section>
    )
}

export function ProfileBody({ d, medium }: { d: ListDescription, medium: Medium }) {
    const nowSeconds = Math.floor(Date.now() / 1000)
    const tiles: React.ReactNode[] = []
    if (medium === "anime" && d.minutesWatched > 0) {
        tiles.push(<Tile key="time" icon={<LuClock className="text-sky-300" />} value={formatWatchMinutes(d.minutesWatched)} label="Time watched" sub={`≈ ${formatNumber(Math.round(d.minutesWatched / 60))} hours`} />)
    }
    if (d.communityMean) {
        tiles.push(<Tile key="mean" icon={<LuStar className="fill-amber-300 text-amber-300" />} value={(d.communityMean / 10).toFixed(1)} label="Community mean" sub="Of what you have started" />)
    }
    tiles.push(<Tile key="year" icon={<LuCircleCheck className="text-emerald-300" />} value={formatNumber(d.completedThisYear)} label={`Completed in ${new Date().getFullYear()}`} />)
    if (d.remaining > 0) {
        tiles.push(<Tile key="left" icon={<LuHourglass className="text-violet-300" />} value={formatNumber(d.remaining)} label={medium === "anime" ? "Episodes to go" : "Chapters to go"} sub={medium === "anime" ? "On what you are watching" : "On what you are reading"} />)
    }
    tiles.push(<Tile key="repeat" icon={<LuRepeat className="text-teal-300" />} value={formatNumber(d.repeats)} label={medium === "anime" ? "Rewatches" : "Rereads"} />)
    tiles.push(<Tile key="paused" icon={<LuCirclePause className="text-orange-300" />} value={formatNumber(d.paused)} label="Paused" sub={`${formatNumber(d.dropped)} dropped`} />)
    if (d.nextAiring) {
        tiles.push(
            <SeaLink key="next" href={`/entry?id=${d.nextAiring.id}`} className="contents">
                <Tile icon={<LuCalendarClock className="text-rose-300" />} value={formatUntil(d.nextAiring.airingAt - nowSeconds)} label={`Next: episode ${d.nextAiring.episode}`} sub={d.nextAiring.title} />
            </SeaLink>,
        )
    }

    const maxGenre = Math.max(1, ...d.genres.map(g => g.count))
    const origin = d.countries.map(c => ({
        ...c,
        label: medium === "manga" ? MANGA_COUNTRY_LABEL[c.key] ?? MEDIA_COUNTRY[c.key]?.name ?? c.key : MEDIA_COUNTRY[c.key]?.name ?? c.key,
        flag: MEDIA_COUNTRY[c.key]?.flag,
    }))
    const maxDecade = Math.max(1, ...d.decades.map(x => x.count))
    const entryHref = (id: number) => medium === "anime" ? `/entry?id=${id}` : `/manga/entry?id=${id}`

    return (
        <div className="relative mt-5 space-y-5">
            <div className="flex flex-wrap gap-px overflow-hidden rounded-2xl bg-white/[0.07] shadow-xl shadow-black/25 ring-1 ring-white/10 backdrop-blur-xl">
                {tiles}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Top genres">
                    <ul className="space-y-2">
                        {d.genres.map(g => (
                            <li key={g.key}>
                                <SeaLink
                                    href={`/search?genre=${encodeURIComponent(g.key)}&sorting=TRENDING_DESC${medium === "manga" ? "&format=MANGA" : ""}`}
                                    className="group grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm"
                                >
                                    <span className="truncate text-white/80 transition-colors group-hover:text-white">{g.key}</span>
                                    <span className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                                        <span className="block h-full rounded-full bg-gradient-to-r from-brand-500/70 to-brand-300" style={{ width: `${(g.count / maxGenre) * 100}%` }} />
                                    </span>
                                    <span className="w-16 text-right text-xs tabular-nums text-white/50">
                                        {formatCount(g.count)} · {Math.round((g.count / d.started) * 100)}%
                                    </span>
                                </SeaLink>
                            </li>
                        ))}
                    </ul>
                </Panel>

                <div className="grid gap-4">
                    <Panel title="Formats">
                        <Distribution items={d.formats} total={d.started} label={k => MEDIA_FORMAT_LABELS[k] ?? k} color={(_, i) => FORMAT_COLORS[i % FORMAT_COLORS.length]} />
                    </Panel>
                    <Panel title="Release status">
                        <Distribution items={d.releaseStatus} total={d.started} label={k => RELEASE_STATUS[k]?.label ?? k} color={k => RELEASE_STATUS[k]?.color ?? "bg-white/40"} />
                    </Panel>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
                <Panel title="Origin">
                    <div className="flex flex-wrap gap-2">
                        {origin.map(c => (
                            <span key={c.key} className="flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1.5 text-sm text-white/85 ring-1 ring-white/10">
                                {c.flag && <span aria-hidden>{c.flag}</span>}
                                {c.label}
                                <span className="tabular-nums text-white/45">{Math.round((c.count / d.started) * 100)}%</span>
                            </span>
                        ))}
                    </div>
                </Panel>
                <Panel title="Eras">
                    <div className="flex h-24 items-end gap-1.5">
                        {d.decades.map(x => (
                            <div key={x.key} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${formatCount(x.count)} from the ${x.key}`}>
                                <span className="text-[10px] tabular-nums text-white/45">{formatCount(x.count)}</span>
                                <div className="w-full rounded-t-md bg-gradient-to-t from-brand-600/50 to-brand-300/90" style={{ height: `${Math.max(6, (x.count / maxDecade) * 56)}px` }} />
                                <span className="truncate text-[10px] text-white/60">{x.key.replace(/^(19|20)/, "'")}</span>
                            </div>
                        ))}
                    </div>
                </Panel>
            </div>

            {!!d.tags.length && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
                        <LuSparkles className="size-3" />Themes you return to
                    </span>
                    {d.tags.map(t => (
                        <span key={t.key} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-white/75 ring-1 ring-white/10">
                            {t.key}<span className="tabular-nums text-white/35">{formatCount(t.count)}</span>
                        </span>
                    ))}
                </div>
            )}

            {!!d.topRated.length && (
                <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Your highest scored · {formatNumber(d.scoredCount)} scored</p>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                        {d.topRated.map((m, i) => (
                            <SeaLink key={m.id} href={entryHref(m.id)} className="group block min-w-0">
                                <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10">
                                    {m.image && <img src={getImageUrl(m.image)} alt="" loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-105" />}
                                    <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur">#{i + 1}</span>
                                </div>
                                <p className="mt-1.5 line-clamp-2 text-xs font-medium text-white/80 group-hover:text-white">{m.title}</p>
                            </SeaLink>
                        ))}
                    </div>
                </div>
            )}

            {d.dropped > 0 && d.started > 0 && (
                <p className="flex items-center gap-1.5 text-[11px] text-white/40">
                    <LuCircleX className="size-3" />
                    You have dropped {formatNumber(d.dropped)} of the {formatNumber(d.started)} {medium} you started ({Math.round((d.dropped / d.started) * 100)}%).
                </p>
            )}
        </div>
    )
}

function Panel({ title, children }: { title: string, children: React.ReactNode }) {
    return (
        <div className="min-w-0 rounded-2xl border border-white/[0.08] bg-black/25 p-4 shadow-lg shadow-black/10 backdrop-blur-md">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-white/60">{title}</p>
            {children}
        </div>
    )
}

function Distribution({ items, total, label, color }: {
    items: Tally[]
    total: number
    label: (key: string) => string
    color: (key: string, index: number) => string
}) {
    if (!items.length) return <p className="text-xs text-white/45">Nothing to show yet.</p>
    return (
        <div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                {items.map((item, i) => (
                    <span key={item.key} className={cn("h-full", color(item.key, i))} style={{ width: `${(item.count / total) * 100}%` }} title={`${label(item.key)}: ${item.count}`} />
                ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                {items.map((item, i) => (
                    <span key={item.key} className="flex items-center gap-1.5 text-xs text-white/70">
                        <span className={cn("size-2 rounded-full", color(item.key, i))} />
                        {label(item.key)}
                        <span className="tabular-nums text-white/40">{formatCount(item.count)}</span>
                    </span>
                ))}
            </div>
        </div>
    )
}

function Tile({ icon, value, label, sub }: { icon: React.ReactNode, value: string, label: string, sub?: string }) {
    return (
        <div className="min-w-0 flex-1 basis-[9rem] bg-black/50 px-4 py-3 text-left">
            <p className="flex items-center gap-1.5 text-xl font-bold leading-none tabular-nums tracking-tight text-white [&>svg]:size-4 [&>svg]:shrink-0">{icon}{value}</p>
            <p className="mt-1.5 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">{label}</p>
            {sub && <p className="mt-0.5 truncate text-[11px] text-white/40">{sub}</p>}
        </div>
    )
}

function formatUntil(seconds: number) {
    if (seconds < 3600) return `${Math.max(1, Math.ceil(seconds / 60))}m`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
    return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}
