"use client"

import { StudioPerson, StudioProfile, StudioWork, useGetStudioProfile } from "@/api/hooks/anilist.hooks"
import { useGetStudioFavorites, useToggleStudioFavorite } from "@/api/hooks/favorites.hooks"
import { serverErrorMessage } from "@/api/hooks/update-notice.hooks"
import { Button } from "@/components/ui/button"
import { GlassCard } from "@/app/(main)/_features/media/_components/media-info-panel"
import { compact, MEDIA_FORMAT_LABELS } from "@/app/(main)/_features/media/_components/media-meta-chips"
import { MediaSectionHeading } from "@/app/(main)/_features/media/_components/media-section-heading"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { SeaLink } from "@/components/shared/sea-link"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Tooltip } from "@/components/ui/tooltip"
import { useSearchParams } from "@/lib/navigation"
import { getImageUrl } from "@/lib/server/assets"
import { capitalize } from "lodash"
import { motion, useScroll, useTransform } from "motion/react"
import React from "react"
import { AiFillHeart, AiOutlineHeart } from "react-icons/ai"
import {
    LuArrowLeft,
    LuCalendarRange,
    LuChartColumn,
    LuChevronDown,
    LuClapperboard,
    LuClock,
    LuCrown,
    LuExternalLink,
    LuFilm,
    LuHeart,
    LuLayers,
    LuMegaphone,
    LuRadio,
    LuSearch,
    LuSparkles,
    LuStar,
    LuTags,
    LuUsers,
} from "react-icons/lu"

// A studio's page: a hero built from its own best-known work, the numbers that describe it, the
// directors who worked there, and its whole filmography. It used to be the studio's name over a
// grid of covers.

type Sort = "newest" | "oldest" | "score" | "popular"
type Credit = "all" | "main" | "supporting"

export default function Page() {
    const searchParams = useSearchParams()
    const id = Number(searchParams.get("id")) || 0
    const { data, isLoading, isError, error, refetch, isFetching } = useGetStudioProfile(id)

    if (isLoading) {
        return <PageWrapper className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-[--muted]">
            <LoadingSpinner />
            <p className="text-sm">Gathering the studio's filmography…</p>
        </PageWrapper>
    }
    if (!data || isError) {
        // A refused or slow AniList is not a missing studio, and says so: the same id usually works
        // moments later.
        const reason = error ? serverErrorMessage(error) : ""
        const missing = !error || /not found/i.test(reason)
        return <PageWrapper className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center text-[--muted]">
            <p className="text-base font-medium text-white">{missing ? "Studio not found" : "Couldn't load this studio"}</p>
            {!missing && <p className="max-w-md text-sm">{reason}</p>}
            {!missing && <Button intent="gray-outline" loading={isFetching} onClick={() => void refetch()}>Try again</Button>}
        </PageWrapper>
    }
    return <StudioView studio={data} />
}

function StudioView({ studio }: { studio: StudioProfile }) {
    const { data: favIds } = useGetStudioFavorites()
    const { mutate: toggleFav, isPending: isTogglingFav } = useToggleStudioFavorite()
    const isFav = !!favIds?.includes(studio.id)

    const byId = React.useMemo(() => new Map(studio.works.map(w => [w.id, w])), [studio.works])
    const mainWorks = React.useMemo(() => studio.works.filter(w => w.isMainStudio), [studio.works])
    const signature = React.useMemo(() => [...(mainWorks.length ? mainWorks : studio.works)]
        .filter(w => w.status !== "NOT_YET_RELEASED")
        .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
        .slice(0, 5), [mainWorks, studio.works])
    const current = React.useMemo(() => studio.works
        .filter(w => w.status === "RELEASING" || w.status === "NOT_YET_RELEASED")
        .sort((a, b) => (a.status === b.status ? 0 : a.status === "RELEASING" ? -1 : 1)), [studio.works])

    const st = studio.stats
    const hours = Math.round(st.totalMinutes / 60)

    return (
        <div className="relative" data-studio-page>
            <StudioHero studio={studio} signature={signature} isFav={isFav} onFav={() => toggleFav({ studioId: studio.id })} favPending={isTogglingFav} />

            <PageWrapper className="relative z-[5] space-y-14 px-4 pb-16 md:px-8">
                {/* Stats */}
                <div className="-mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-studio-stats>
                    <StatTile icon={<LuFilm />} label="Titles" value={String(st.mainCount)} sub={st.supportingCount ? `+${st.supportingCount} as support` : "as main studio"} />
                    <StatTile icon={<LuCalendarRange />} label="Years active" value={st.firstYear ? `${st.lastYear! - st.firstYear + 1}` : "—"} sub={st.firstYear ? `${st.firstYear} – ${st.lastYear}` : undefined} />
                    <ScoreTile score={st.meanScore} />
                    <StatTile icon={<LuUsers />} label="Members" value={compact(st.totalPopularity)} sub="across its titles" />
                    <StatTile icon={<LuClock />} label="Episodes" value={compact(st.totalEpisodes)} sub={hours ? `${compact(hours)} hours of anime` : undefined} />
                    <StatTile icon={<LuHeart />} label="Favourites" value={compact(studio.favourites)} sub="of the studio" />
                </div>

                {signature.length > 0 && <SignatureWorks works={signature} />}

                {studio.directors.length > 0 && <Directors directors={studio.directors} byId={byId} />}

                <AtAGlance studio={studio} />

                {current.length > 0 && (
                    <section className="space-y-4">
                        <MediaSectionHeading icon={<LuRadio />} title="Airing & upcoming" count={current.length} />
                        <div className="sea-card-grid sea-card-anime">
                            {current.map(w => <WorkCard key={w.id} work={w} byDirector={studio.directors} />)}
                        </div>
                    </section>
                )}

                <Filmography studio={studio} />
            </PageWrapper>
        </div>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////

function StudioHero({ studio, signature, isFav, onFav, favPending }: {
    studio: StudioProfile
    signature: StudioWork[]
    isFav: boolean
    onFav: () => void
    favPending: boolean
}) {
    const { scrollY } = useScroll()
    const fade = useTransform(scrollY, [0, 420], [1, 0.15])
    const lift = useTransform(scrollY, [0, 420], [0, -60])
    const backdrop = signature.find(w => w.bannerImage)?.bannerImage || signature[0]?.coverImage?.extraLarge
    const wall = React.useMemo(() => {
        const covers = [...studio.works]
            .filter(w => w.coverImage?.large && w.status !== "NOT_YET_RELEASED")
            .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
            .slice(0, 18)
        return covers
    }, [studio.works])
    const st = studio.stats

    return (
        <header className="relative isolate overflow-hidden" data-studio-hero>
            <motion.div className="absolute inset-0 -z-10" style={{ opacity: fade }}>
                {backdrop && <img src={getImageUrl(backdrop)} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-50 blur-2xl" />}
                {/* Poster wall: the studio's best-known covers, tilted and drifting. */}
                <div className="absolute -right-24 -top-16 hidden w-[62%] rotate-[-8deg] md:block">
                    <motion.div
                        className="grid grid-cols-6 gap-3"
                        animate={{ y: [0, -40, 0] }}
                        transition={{ duration: 40, repeat: Infinity, ease: "easeInOut" }}
                    >
                        {wall.map((w, i) => (
                            <div key={w.id} className={cn("aspect-[6/8] overflow-hidden rounded-xl ring-1 ring-white/10 shadow-2xl", i % 2 === 1 && "translate-y-8")}>
                                <img src={getImageUrl(w.coverImage!.large!)} alt="" loading="lazy" className="size-full object-cover" />
                            </div>
                        ))}
                    </motion.div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-[--background] via-[--background]/85 to-[--background]/20" />
                <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[--background] via-[--background]/70 to-transparent" />
                <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[--background]/80 to-transparent" />
            </motion.div>

            <motion.div className="relative px-4 pb-16 pt-10 md:px-8 md:pb-24 md:pt-16" style={{ y: lift }}>
                <SeaLink href="/" className="mb-8 inline-flex items-center gap-2 rounded-full bg-black/30 px-3 py-1.5 text-sm text-white/70 ring-1 ring-white/10 backdrop-blur-md transition hover:text-white">
                    <LuArrowLeft /> Back
                </SeaLink>

                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-200/80">
                    <LuClapperboard className="size-4" />
                    {studio.isAnimationStudio ? "Animation studio" : "Studio · producer"}
                </p>
                <h1 className="mt-3 max-w-4xl text-5xl font-black leading-[0.95] tracking-tight text-white drop-shadow-[0_4px_30px_rgba(0,0,0,0.6)] sm:text-6xl lg:text-7xl">
                    {studio.name}
                </h1>
                <p className="mt-4 max-w-2xl text-base text-white/70 sm:text-lg">
                    {[
                        st.firstYear ? (st.lastYear && st.lastYear !== st.firstYear ? `Active ${st.firstYear}–${st.lastYear}` : `Since ${st.firstYear}`) : null,
                        `${st.mainCount} title${st.mainCount === 1 ? "" : "s"} as main studio`,
                        studio.directors.length ? `${studio.directors.length} director${studio.directors.length === 1 ? "" : "s"}` : null,
                        st.airing ? `${st.airing} airing now` : null,
                    ].filter(Boolean).join(" · ")}
                </p>
                {!!st.genres.length && <div className="mt-5 flex flex-wrap gap-2">
                    {st.genres.slice(0, 5).map(g => (
                        <span key={g.key} className="rounded-full bg-white/[0.07] px-3 py-1 text-sm text-white/80 ring-1 ring-white/10 backdrop-blur-md">{g.key}</span>
                    ))}
                </div>}

                <div className="mt-7 flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={onFav}
                        disabled={favPending}
                        className={cn(
                            "flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold ring-1 backdrop-blur-md transition-all hover:-translate-y-0.5",
                            isFav ? "bg-rose-500/20 text-rose-100 ring-rose-400/40" : "bg-white/[0.08] text-white ring-white/15 hover:bg-white/[0.14]",
                        )}
                    >
                        {isFav ? <AiFillHeart className="text-rose-400" /> : <AiOutlineHeart />}
                        {isFav ? "Favourite" : "Add to favourites"}
                    </button>
                    {studio.siteUrl && <a
                        href={studio.siteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-full bg-black/30 px-5 py-2.5 text-sm font-medium text-white/80 ring-1 ring-white/10 backdrop-blur-md transition hover:text-white"
                    >
                        AniList <LuExternalLink className="size-3.5" />
                    </a>}
                </div>
            </motion.div>
        </header>
    )
}

function StatTile({ icon, label, value, sub }: { icon: React.ReactNode, label: string, value: string, sub?: string }) {
    return (
        <div className="group rounded-2xl border border-white/10 bg-black/30 p-4 shadow-xl shadow-black/30 backdrop-blur-md transition-transform hover:-translate-y-0.5">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-white/45 [&>svg]:size-3.5">{icon}{label}</p>
            <p className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight text-white">{value}</p>
            {sub && <p className="mt-0.5 truncate text-xs text-white/50">{sub}</p>}
        </div>
    )
}

function ScoreTile({ score }: { score?: number }) {
    const pct = Math.max(0, Math.min(100, score ?? 0))
    const r = 22
    const c = 2 * Math.PI * r
    return (
        <div className="flex items-center gap-4 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4 shadow-xl shadow-black/30 backdrop-blur-md">
            <svg width={56} height={56} className="-rotate-90 shrink-0">
                <circle cx={28} cy={28} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6} />
                <circle cx={28} cy={28} r={r} fill="none" stroke="#fbbf24" strokeWidth={6} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} />
            </svg>
            <div>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-200/70"><LuStar className="size-3.5" />Avg score</p>
                <p className="text-3xl font-bold tabular-nums text-amber-50">{score ? (score / 10).toFixed(1) : "—"}</p>
            </div>
        </div>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////

function SignatureWorks({ works }: { works: StudioWork[] }) {
    const [lead, ...rest] = works
    return (
        <section className="space-y-4" data-studio-signature>
            <MediaSectionHeading icon={<LuCrown />} title="Signature works" />
            <div className="grid gap-4 lg:grid-cols-[1.4fr,1fr]">
                <SeaLink href={`/entry?id=${lead.id}`} className="group relative block min-h-[18rem] overflow-hidden rounded-3xl ring-1 ring-white/10">
                    <img
                        src={getImageUrl(lead.bannerImage || lead.coverImage?.extraLarge || lead.coverImage?.large || "")}
                        alt=""
                        className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 p-5 sm:p-7">
                        {lead.coverImage?.large && <img src={getImageUrl(lead.coverImage.large)} alt="" className="hidden aspect-[6/8] w-28 shrink-0 rounded-xl object-cover shadow-2xl ring-1 ring-white/20 sm:block" />}
                        <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/90">Most popular</p>
                            <p className="mt-1 line-clamp-2 text-2xl font-bold text-white sm:text-3xl">{lead.title?.userPreferred}</p>
                            <p className="mt-1.5 text-sm text-white/70">{workMeta(lead)}</p>
                        </div>
                    </div>
                </SeaLink>
                <div className="grid grid-cols-2 gap-4">
                    {rest.map(w => (
                        <SeaLink key={w.id} href={`/entry?id=${w.id}`} className="group relative block aspect-[16/11] overflow-hidden rounded-2xl ring-1 ring-white/10">
                            <img src={getImageUrl(w.bannerImage || w.coverImage?.extraLarge || w.coverImage?.large || "")} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-[1.05]" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                            <div className="absolute inset-x-0 bottom-0 p-3">
                                <p className="line-clamp-1 text-sm font-semibold text-white">{w.title?.userPreferred}</p>
                                <p className="text-[11px] text-white/60">{workMeta(w)}</p>
                            </div>
                        </SeaLink>
                    ))}
                </div>
            </div>
        </section>
    )
}

function Directors({ directors, byId }: { directors: StudioPerson[], byId: Map<number, StudioWork> }) {
    const [all, setAll] = React.useState(false)
    const shown = all ? directors : directors.slice(0, 8)
    return (
        <section className="space-y-4" data-studio-directors>
            <MediaSectionHeading icon={<LuMegaphone />} title="Directors" count={directors.length} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {shown.map(p => {
                    const works = p.works.map(id => byId.get(id)).filter(Boolean) as StudioWork[]
                    return (
                        <SeaLink
                            key={p.id}
                            href={`/staff?id=${p.id}`}
                            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-black/35"
                        >
                            <div className="flex items-center gap-3">
                                <span className="size-16 shrink-0 overflow-hidden rounded-2xl bg-white/[0.05] ring-1 ring-white/10">
                                    {p.image && <img src={getImageUrl(p.image)} alt="" loading="lazy" className="size-full object-cover" />}
                                </span>
                                <span className="min-w-0">
                                    <span className="block truncate font-semibold text-white group-hover:text-brand-100">{p.name}</span>
                                    {p.native && <span className="block truncate text-xs text-white/40">{p.native}</span>}
                                    <span className="mt-1 inline-flex items-center gap-1.5">
                                        <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] font-medium text-brand-100 ring-1 ring-brand-400/20">{p.role.trim()}</span>
                                        <span className="text-[11px] text-white/50">{works.length} title{works.length === 1 ? "" : "s"}</span>
                                    </span>
                                </span>
                            </div>
                            {works.length > 0 && <div className="mt-3 flex gap-1.5">
                                {works.slice(0, 4).map(w => (
                                    <Tooltip key={w.id} trigger={<span className="aspect-[6/8] w-1/4 overflow-hidden rounded-lg ring-1 ring-white/10">
                                        {w.coverImage?.medium || w.coverImage?.large
                                            ? <img src={getImageUrl(w.coverImage.medium || w.coverImage.large!)} alt="" loading="lazy" className="size-full object-cover" />
                                            : null}
                                    </span>}>{w.title?.userPreferred}</Tooltip>
                                ))}
                            </div>}
                        </SeaLink>
                    )
                })}
            </div>
            {directors.length > 8 && <div className="flex justify-center">
                <PillButton onClick={() => setAll(a => !a)}>{all ? "Show fewer" : `Show all ${directors.length}`} <LuChevronDown className={cn("transition-transform", all && "rotate-180")} /></PillButton>
            </div>}
        </section>
    )
}

function AtAGlance({ studio }: { studio: StudioProfile }) {
    const st = studio.stats
    const maxYear = Math.max(1, ...st.years.map(y => y.count))
    const maxGenre = Math.max(1, ...st.genres.map(g => g.count))
    const totalFormats = st.formats.reduce((n, f) => n + f.count, 0) || 1
    const formatColors = ["bg-brand-400", "bg-sky-400", "bg-violet-400", "bg-emerald-400", "bg-amber-400", "bg-rose-400", "bg-teal-300", "bg-white/40"]
    if (!st.years.length && !st.genres.length && !st.formats.length) return null
    return (
        <section className="space-y-4" data-studio-glance>
            <MediaSectionHeading icon={<LuChartColumn />} title="At a glance" />
            <div className="grid gap-4 lg:grid-cols-3">
                {!!st.years.length && <GlassCard title="Output per year" icon={<LuCalendarRange />} className="lg:col-span-3">
                    <div className="flex h-36 items-end gap-[3px]">
                        {st.years.map(y => (
                            <Tooltip key={y.key} trigger={<div className="group flex h-full flex-1 items-end">
                                <div
                                    className={cn("w-full rounded-t-md transition-colors", y.count ? "bg-gradient-to-t from-brand-500/60 to-brand-300 group-hover:to-white" : "bg-white/[0.04]")}
                                    style={{ height: `${y.count ? Math.max(6, (y.count / maxYear) * 100) : 3}%` }}
                                />
                            </div>}>{y.key}: {y.count} title{y.count === 1 ? "" : "s"}</Tooltip>
                        ))}
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] tabular-nums text-white/40">
                        <span>{st.years[0]?.key}</span>
                        {st.years.length > 8 && <span>{st.years[Math.floor(st.years.length / 2)]?.key}</span>}
                        <span>{st.years[st.years.length - 1]?.key}</span>
                    </div>
                </GlassCard>}

                {!!st.genres.length && <GlassCard title="What it makes" icon={<LuTags />} className="lg:col-span-2">
                    <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                        {st.genres.map(g => (
                            <SeaLink key={g.key} href={`/search?genre=${encodeURIComponent(g.key)}&sorting=TRENDING_DESC`} className="group block">
                                <div className="flex justify-between text-xs"><span className="text-white/80 group-hover:text-white">{g.key}</span><span className="tabular-nums text-white/40">{g.count}</span></div>
                                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                                    <div className="h-full rounded-full bg-gradient-to-r from-brand-400/80 to-cyan-300/80" style={{ width: `${(g.count / maxGenre) * 100}%` }} />
                                </div>
                            </SeaLink>
                        ))}
                    </div>
                </GlassCard>}

                {!!st.formats.length && <GlassCard title="Formats" icon={<LuLayers />}>
                    <div className="flex h-3 overflow-hidden rounded-full">
                        {st.formats.map((f, i) => <div key={f.key} className={formatColors[i % formatColors.length]} style={{ width: `${(f.count / totalFormats) * 100}%` }} />)}
                    </div>
                    <div className="mt-4 space-y-2">
                        {st.formats.map((f, i) => (
                            <div key={f.key} className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2 text-white/80"><span className={cn("size-2.5 rounded-full", formatColors[i % formatColors.length])} />{MEDIA_FORMAT_LABELS[f.key] ?? capitalize(f.key)}</span>
                                <span className="tabular-nums text-white/50">{f.count}</span>
                            </div>
                        ))}
                    </div>
                </GlassCard>}
            </div>
        </section>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////

function Filmography({ studio }: { studio: StudioProfile }) {
    const [credit, setCredit] = React.useState<Credit>("all")
    const [format, setFormat] = React.useState<string | null>(null)
    const [sort, setSort] = React.useState<Sort>("newest")
    const [query, setQuery] = React.useState("")
    const [limit, setLimit] = React.useState(48)

    const formats = React.useMemo(() => Array.from(new Set(studio.works.map(w => w.format).filter(Boolean))) as string[], [studio.works])

    const filtered = React.useMemo(() => {
        const q = query.trim().toLowerCase()
        const list = studio.works.filter(w =>
            (credit === "all" || (credit === "main") === w.isMainStudio) &&
            (!format || w.format === format) &&
            (!q || [w.title?.userPreferred, w.title?.english, w.title?.romaji, w.title?.native].some(t => t?.toLowerCase().includes(q))),
        )
        const date = (w: StudioWork) => (w.startDate?.year ?? w.seasonYear ?? 9999) * 10000 + (w.startDate?.month ?? 12) * 100 + (w.startDate?.day ?? 28)
        switch (sort) {
            case "oldest": return list.sort((a, b) => date(a) - date(b))
            case "score": return list.sort((a, b) => (b.meanScore ?? 0) - (a.meanScore ?? 0))
            case "popular": return list.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
            default: return list.sort((a, b) => date(b) - date(a))
        }
    }, [studio.works, credit, format, sort, query])

    React.useEffect(() => setLimit(48), [credit, format, sort, query])

    const shown = filtered.slice(0, limit)
    const byYear = sort === "newest" || sort === "oldest"
    const groups = React.useMemo(() => {
        if (!byYear) return [{ year: "", works: shown }]
        const out: { year: string, works: StudioWork[] }[] = []
        for (const w of shown) {
            const y = String(w.startDate?.year ?? w.seasonYear ?? "TBA")
            if (out[out.length - 1]?.year !== y) out.push({ year: y, works: [] })
            out[out.length - 1].works.push(w)
        }
        return out
    }, [shown, byYear])

    return (
        <section className="space-y-5" data-studio-filmography>
            <MediaSectionHeading
                icon={<LuSparkles />}
                title="Filmography"
                count={filtered.length}
                aside={studio.totalWorks > studio.works.length
                    ? <span className="text-xs text-[--muted]">Showing the latest {studio.works.length} of {studio.totalWorks}</span>
                    : null}
            />

            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/25 p-3 backdrop-blur-md lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <Segmented
                        value={credit}
                        onChange={setCredit}
                        options={[["all", `All ${studio.works.length}`], ["main", `Main ${studio.stats.mainCount}`], ["supporting", `Support ${studio.stats.supportingCount}`]]}
                    />
                    <div className="flex flex-wrap gap-1.5">
                        {formats.map(f => (
                            <button
                                key={f}
                                type="button"
                                onClick={() => setFormat(format === f ? null : f)}
                                className={cn(
                                    "rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors",
                                    format === f ? "bg-white/[0.12] text-white ring-white/20" : "bg-white/[0.03] text-white/55 ring-white/10 hover:text-white",
                                )}
                            >{MEDIA_FORMAT_LABELS[f] ?? capitalize(f)}</button>
                        ))}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <label className="relative">
                        <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/40" />
                        <input
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search titles"
                            className="w-48 rounded-full bg-white/[0.05] py-1.5 pl-8 pr-3 text-sm text-white ring-1 ring-white/10 placeholder:text-white/35 focus:outline-none focus:ring-white/25"
                        />
                    </label>
                    <Segmented value={sort} onChange={setSort} options={[["newest", "Newest"], ["oldest", "Oldest"], ["score", "Top rated"], ["popular", "Popular"]]} />
                </div>
            </div>

            {filtered.length === 0 && <p className="py-10 text-center text-sm text-[--muted]">Nothing matches.</p>}

            <div className="space-y-8">
                {groups.map(g => (
                    <div key={g.year || "all"} className="space-y-3">
                        {g.year && <div className="flex items-center gap-3">
                            <span className="text-2xl font-black tabular-nums text-white/90">{g.year}</span>
                            <span className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
                            <span className="text-xs text-white/40">{g.works.length}</span>
                        </div>}
                        <div className="sea-card-grid sea-card-anime">
                            {g.works.map(w => <WorkCard key={w.id} work={w} byDirector={studio.directors} />)}
                        </div>
                    </div>
                ))}
            </div>

            {filtered.length > limit && <div className="flex justify-center">
                <PillButton onClick={() => setLimit(l => l + 48)}>Show more ({filtered.length - limit}) <LuChevronDown /></PillButton>
            </div>}
        </section>
    )
}

function WorkCard({ work: w, byDirector }: { work: StudioWork, byDirector: StudioPerson[] }) {
    const directors = React.useMemo(() => (w.directors ?? [])
        .map(id => byDirector.find(p => p.id === id)?.name)
        .filter(Boolean) as string[], [w.directors, byDirector])
    const cover = w.coverImage?.extraLarge || w.coverImage?.large || w.coverImage?.medium
    return (
        <SeaLink href={`/entry?id=${w.id}`} className="group block" data-studio-work-card>
            <div
                className="relative aspect-[6/8] overflow-hidden rounded-[--radius-md] bg-white/[0.04] ring-1 ring-white/10 transition-all duration-300 group-hover:-translate-y-1 group-hover:ring-white/25 group-hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]"
                style={w.coverImage?.color ? { backgroundColor: `${w.coverImage.color}33` } : undefined}
            >
                {cover && <img src={getImageUrl(cover)} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />}
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                <div className="absolute left-2 top-2 flex gap-1">
                    {!w.isMainStudio && <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white/80 ring-1 ring-white/10 backdrop-blur-md">Support</span>}
                    {w.status === "RELEASING" && <span className="rounded-full bg-sky-500/80 px-2 py-0.5 text-[10px] font-semibold text-white">Airing</span>}
                    {w.status === "NOT_YET_RELEASED" && <span className="rounded-full bg-amber-500/80 px-2 py-0.5 text-[10px] font-semibold text-white">Upcoming</span>}
                </div>
                <div className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-2 text-[11px] font-medium text-white/85">
                    <span className="rounded-md bg-black/40 px-1.5 py-0.5 backdrop-blur-sm">{MEDIA_FORMAT_LABELS[w.format ?? ""] ?? (w.format ? capitalize(w.format) : "Anime")}</span>
                    {!!w.meanScore && <span className="flex items-center gap-0.5 rounded-md bg-black/40 px-1.5 py-0.5 backdrop-blur-sm"><LuStar className="size-3 text-amber-300" />{(w.meanScore / 10).toFixed(1)}</span>}
                </div>
            </div>
            <p className="mt-2 line-clamp-2 px-0.5 text-sm font-semibold leading-snug text-white group-hover:text-brand-100">{w.title?.userPreferred || w.title?.romaji}</p>
            <p className="mt-0.5 truncate px-0.5 text-xs text-[--muted]">{workMeta(w)}</p>
            {!!directors.length && <p className="mt-0.5 truncate px-0.5 text-[11px] text-white/45">Dir. {directors.slice(0, 2).join(", ")}</p>}
        </SeaLink>
    )
}

function workMeta(w: StudioWork) {
    const when = w.season && w.seasonYear ? `${capitalize(w.season)} ${w.seasonYear}` : (w.startDate?.year ?? w.seasonYear ?? "TBA")
    const len = w.episodes ? `${w.episodes} ep` : null
    const pop = w.popularity ? `${compact(w.popularity)} members` : null
    return [when, len, pop].filter(Boolean).join(" · ")
}

function Segmented<T extends string>({ value, onChange, options }: { value: T, onChange: (v: T) => void, options: [T, string][] }) {
    return (
        <div className="inline-flex rounded-full bg-white/[0.04] p-0.5 ring-1 ring-white/10">
            {options.map(([v, label]) => (
                <button
                    key={v}
                    type="button"
                    onClick={() => onChange(v)}
                    className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium transition-all",
                        value === v ? "bg-white/[0.14] text-white shadow-sm" : "text-white/55 hover:text-white",
                    )}
                >{label}</button>
            ))}
        </div>
    )
}

function PillButton({ onClick, children }: { onClick: () => void, children: React.ReactNode }) {
    return <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 text-sm font-medium text-white/80 backdrop-blur-md transition-colors hover:bg-white/[0.08] hover:text-white"
    >{children}</button>
}
