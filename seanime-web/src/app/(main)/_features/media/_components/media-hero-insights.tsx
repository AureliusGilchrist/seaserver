"use client"

import { MediaInfo } from "@/api/hooks/anilist.hooks"
import { useGetKitsuInfo } from "@/api/hooks/kitsu.hooks"
import { compact } from "@/app/(main)/_features/media/_components/media-meta-chips"
import { cn } from "@/components/ui/core/styling"
import { Tooltip } from "@/components/ui/tooltip"
import { getImageUrl } from "@/lib/server/assets"
import { capitalize } from "lodash"
import { motion } from "motion/react"
import React from "react"
import { LuAward, LuChartNoAxesColumn, LuCircleCheck, LuFlame, LuHeart, LuMedal, LuPlay, LuShieldAlert, LuStar, LuUsers } from "react-icons/lu"

// The numbers worth seeing without scrolling, in the hero: how it is scored and ranked, how many people
// follow it and finish it, what it is about and where to watch it. The rest of what is known lives in
// the Details tab.

type MediaType = "anime" | "manga"

export function MediaHeroInsights({ info, meanScore, hideScore, type, className, part = "all" }: {
    info: MediaInfo | undefined
    meanScore?: number | null
    hideScore?: boolean
    type: MediaType
    className?: string
    /** "stats": the ribbon of numbers and the ranking pills. "extras": the top tags and where to watch. */
    part?: "all" | "stats" | "extras"
}) {
    const { data: kitsu } = useGetKitsuInfo(info?.idMal, type)

    const mean = info?.meanScore ?? meanScore
    const rankings = info?.rankings ?? []
    const topRated = rankings.find(r => r.type === "RATED" && r.allTime)
    const topPopular = rankings.find(r => r.type === "POPULAR" && r.allTime)
    const statuses = info?.stats?.statusDistribution ?? []
    const amountOf = (status: string) => statuses.find(s => s.status === status)?.amount ?? 0
    const started = statuses.filter(s => s.status !== "PLANNING").reduce((n, s) => n + s.amount, 0)
    const finishRate = started ? Math.round((amountOf("COMPLETED") / started) * 100) : 0
    const dropRate = started ? Math.round((amountOf("DROPPED") / started) * 100) : 0
    const active = amountOf("CURRENT")

    const seasonal = rankings
        .filter(r => !r.allTime && r !== topRated && r !== topPopular)
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 3)
    const tags = (info?.tags ?? []).filter(t => !t.isMediaSpoiler && !t.isGeneralSpoiler).slice(0, 7)
    const streams = (info?.externalLinks ?? []).filter(l => l.type === "STREAMING" && !!l.url).slice(0, 6)
    const ageRating = [kitsu?.ageRating, kitsu?.ageRatingGuide].filter(Boolean).join(" · ")

    const showStats = part !== "extras"
    const showExtras = part !== "stats"

    const tiles: React.ReactNode[] = []
    if (!hideScore && !!mean) tiles.push(<ScoreTile key="score" mean={mean} average={info?.averageScore} info={info} />)
    if (!hideScore && !!topRated) tiles.push(<Tile key="rated" icon={<LuAward className="text-amber-300" />} value={`#${topRated.rank.toLocaleString()}`} label="Highest rated" />)
    if (!!topPopular) tiles.push(<Tile key="popular" icon={<LuMedal className="text-sky-300" />} value={`#${topPopular.rank.toLocaleString()}`} label="Most popular" />)
    if (!!info?.popularity) tiles.push(<Tile key="members" icon={<LuUsers className="text-violet-300" />} value={compact(info.popularity)} label="Members" sub={active ? `${compact(active)} ${type === "anime" ? "watching" : "reading"}` : undefined} />)
    if (!!info?.favourites) tiles.push(<Tile key="fav" icon={<LuHeart className="text-rose-300" />} value={compact(info.favourites)} label="Favourites" />)
    if (started > 0) tiles.push(<Tile key="finish" icon={<LuCircleCheck className="text-emerald-300" />} value={`${finishRate}%`} label="Finish it" sub={`${dropRate}% drop it`} />)

    const hasPills = !!seasonal.length || !!ageRating || !!info?.trending
    const hasStats = !!tiles.length || hasPills
    const hasExtras = !!tags.length || !!streams.length

    if ((!showStats || !hasStats) && (!showExtras || !hasExtras)) return null

    return (
        <div className={cn("w-full space-y-3", className)} data-media-hero-insights>
            {showStats && !!tiles.length && (
                // One glass bar of numbers. The hairlines between the cells are the bar's own colour
                // showing through a 1px gap, so they line up however the cells wrap.
                <div
                    className="flex flex-wrap gap-px overflow-hidden rounded-2xl bg-white/[0.07] shadow-xl shadow-black/25 ring-1 ring-white/10 backdrop-blur-xl"
                    data-media-hero-ribbon
                >
                    {tiles}
                </div>
            )}

            {showStats && hasPills && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 lg:justify-start" data-media-hero-rankings>
                    {!!info?.trending && <Pill className="bg-orange-400/10 text-orange-100 ring-orange-300/20"><LuFlame className="size-3" />+{compact(info.trending)} this week</Pill>}
                    {!!ageRating && <Pill className="bg-white/[0.07] text-white/85 ring-white/15"><LuShieldAlert className="size-3" />{ageRating}</Pill>}
                    {seasonal.map(r => (
                        <Pill key={r.id} className={r.type === "RATED" ? "bg-amber-300/10 text-amber-100 ring-amber-300/20" : "bg-rose-300/10 text-rose-100 ring-rose-300/20"}>
                            <span className="font-bold tabular-nums">#{r.rank}</span>
                            <span className="capitalize">{r.context}{r.season || r.year ? ` ${[r.season ? capitalize(r.season) : null, r.year].filter(Boolean).join(" ")}` : ""}</span>
                        </Pill>
                    ))}
                </div>
            )}

            {showExtras && !!tags.length && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 lg:justify-start" data-media-hero-tags>
                    <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Themes</span>
                    {tags.map(t => (
                        <a
                            key={t.id}
                            href={`https://anilist.co/search/${type}?genres=${encodeURIComponent(t.name)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-white/70 ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-white"
                        >
                            {t.name}<span className="tabular-nums text-white/35">{t.rank ?? 0}%</span>
                        </a>
                    ))}
                </div>
            )}

            {showExtras && type !== "anime" && !!streams.length && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 lg:justify-start" data-media-hero-streams>
                    <span className="mr-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40"><LuPlay className="size-3" />{"Read on"}</span>
                    {streams.map(l => (
                        <a
                            key={l.id}
                            href={l.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-xs font-medium text-white/85 ring-1 ring-white/10 backdrop-blur-md transition-colors hover:bg-white/10 hover:text-white"
                        >
                            {l.icon
                                ? <span className="flex size-4 items-center justify-center rounded" style={{ backgroundColor: l.color || undefined }}>
                                    <img src={getImageUrl(l.icon)} alt="" className="size-3" loading="lazy" />
                                </span>
                                : <span className="size-2 rounded-full" style={{ backgroundColor: l.color || "rgba(255,255,255,0.4)" }} />}
                            {l.site}
                        </a>
                    ))}
                </div>
            )}
        </div>
    )
}

function Tile({ icon, value, label, sub }: { icon: React.ReactNode, value: string, label: string, sub?: string }) {
    return (
        <div className="min-w-0 flex-1 basis-[7.5rem] bg-black/50 px-4 py-3 text-left" data-media-hero-tile>
            <p className="flex items-center gap-1.5 text-xl font-bold leading-none tabular-nums tracking-tight text-white [&>svg]:size-4 [&>svg]:shrink-0">{icon}{value}</p>
            <p className="mt-1.5 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">{label}</p>
            {sub && <p className="mt-0.5 truncate text-[11px] text-white/40">{sub}</p>}
        </div>
    )
}

/** The score with the shape of the votes behind it: a 7.5 of mostly 8s is not a 7.5 of 10s and 5s. */
function ScoreTile({ mean, average, info }: { mean: number, average?: number, info: MediaInfo | undefined }) {
    const scores = info?.stats?.scoreDistribution ?? []
    const max = Math.max(1, ...scores.map(s => s.amount))
    return (
        <Tooltip
            trigger={<div className="flex min-w-0 flex-[1.6] basis-[14rem] items-center justify-between gap-4 bg-gradient-to-br from-amber-400/[0.16] to-black/50 px-4 py-3" data-media-hero-score>
                <div className="min-w-0 text-left">
                    <p className="flex items-center gap-1.5 text-[1.7rem] font-black leading-none tabular-nums tracking-tight text-amber-50"><LuStar className="size-4 shrink-0 fill-amber-300 text-amber-300" />{(mean / 10).toFixed(1)}</p>
                    <p className="mt-1.5 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100/60">{average ? `${average}% weighted` : "Mean score"}</p>
                </div>
                {!!scores.length
                    ? <div className="flex h-10 w-24 flex-none items-end gap-[2px]" aria-hidden>
                        {scores.map((s, i) => <motion.div
                            key={s.score}
                            className="flex-1 origin-bottom rounded-t-[2px] bg-gradient-to-t from-amber-500/60 to-amber-200/90"
                            style={{ height: `${Math.max(6, (s.amount / max) * 100)}%` }}
                            initial={{ scaleY: 0 }}
                            animate={{ scaleY: 1 }}
                            transition={{ duration: 0.6, delay: 0.35 + i * 0.04, ease: [0.2, 0.8, 0.2, 1] }}
                        />)}
                    </div>
                    : <LuChartNoAxesColumn className="size-5 text-amber-200/40" />}
            </div>}
        >
            Mean score, with how people voted
        </Tooltip>
    )
}

function Pill({ children, className }: { children: React.ReactNode, className?: string }) {
    return <span className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1", className)}>{children}</span>
}
