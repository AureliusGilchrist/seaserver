"use client"

import { MediaInfo } from "@/api/hooks/anilist.hooks"
import { MediaSectionHeading } from "@/app/(main)/_features/media/_components/media-section-heading"
import {
    compact,
    formatFuzzyDate,
    MEDIA_COUNTRY,
    MEDIA_FORMAT_LABELS,
    MEDIA_SOURCE_LABELS,
} from "@/app/(main)/_features/media/_components/media-meta-chips"
import { SeaLink } from "@/components/shared/sea-link"
import { cn } from "@/components/ui/core/styling"
import { getImageUrl } from "@/lib/server/assets"
import { capitalize } from "lodash"
import React from "react"
import { LuAward, LuChartBar, LuEye, LuEyeOff, LuInfo, LuLink, LuTags, LuUsers } from "react-icons/lu"

// The "Information" panel of a details page: everything AniList knows about the media, in glass
// cards — the facts, rankings, tags, how people score and track it, and where to find it.

const STATUS_DIST_STYLE: Record<string, { label: string, color: string }> = {
    CURRENT: { label: "Current", color: "bg-sky-400" },
    PLANNING: { label: "Planning", color: "bg-violet-400" },
    COMPLETED: { label: "Completed", color: "bg-emerald-400" },
    PAUSED: { label: "Paused", color: "bg-amber-400" },
    DROPPED: { label: "Dropped", color: "bg-red-400" },
    REPEATING: { label: "Repeating", color: "bg-teal-300" },
}

export function MediaInfoPanel({ info, type, genres, nativeTitle, className, children }: {
    info: MediaInfo | undefined
    type: "anime" | "manga"
    genres?: (string | null | undefined)[] | null
    nativeTitle?: string | null
    className?: string
    /** Extra cards (e.g. the Kitsu facts) appended to the grid. */
    children?: React.ReactNode
}) {
    if (!info) return null

    const studios = (info.studios?.edges ?? []).filter(e => e.node)
    const mainStudios = studios.filter(e => e.isMain).map(e => e.node!)
    const producers = studios.filter(e => !e.isMain).map(e => e.node!)
    const start = formatFuzzyDate(info.startDate)
    const end = formatFuzzyDate(info.endDate)

    const facts: [string, React.ReactNode][] = []
    if (info.format) facts.push(["Format", MEDIA_FORMAT_LABELS[info.format] ?? capitalize(info.format)])
    if (type === "anime") {
        if (info.episodes) facts.push(["Episodes", info.episodes])
        if (info.duration) facts.push(["Episode length", `${info.duration} min`])
    } else {
        if (info.chapters) facts.push(["Chapters", info.chapters])
        if (info.volumes) facts.push(["Volumes", info.volumes])
    }
    if (info.status) facts.push(["Status", capitalize(info.status.replace(/_/g, " ").toLowerCase())])
    if (start) facts.push([type === "anime" ? "Aired" : "Published", <>{start}{end && end !== start ? <> → {end}</> : info.status === "RELEASING" ? " → now" : ""}</>])
    if (info.season && info.seasonYear) facts.push(["Season", `${capitalize(info.season)} ${info.seasonYear}`])
    if (info.source) facts.push(["Source", MEDIA_SOURCE_LABELS[info.source] ?? capitalize(info.source.replace(/_/g, " "))])
    if (mainStudios.length) facts.push([mainStudios.length > 1 ? "Studios" : "Studio", <LinkList key="studios" items={mainStudios.map(s => ({ label: s.name, href: `/studio?id=${s.id}` }))} />])
    if (producers.length) facts.push(["Producers", <LinkList key="producers" items={producers.map(s => ({ label: s.name, href: s.siteUrl }))} external />])
    if (info.countryOfOrigin) facts.push(["Country", MEDIA_COUNTRY[info.countryOfOrigin] ? `${MEDIA_COUNTRY[info.countryOfOrigin].flag} ${MEDIA_COUNTRY[info.countryOfOrigin].name}` : info.countryOfOrigin])
    if (genres?.length) facts.push(["Genres", <LinkList key="genres" items={genres.filter(Boolean).map(g => ({ label: g!, href: `/search?genre=${encodeURIComponent(g!)}&sorting=TRENDING_DESC${type === "manga" ? "&format=MANGA" : ""}` }))} />])
    if (info.hashtag) facts.push(["Hashtag", info.hashtag])
    if (info.isLicensed !== undefined) facts.push(["Licensed", info.isLicensed ? "Yes" : "No"])
    if (nativeTitle) facts.push(["Native title", nativeTitle])
    if (info.synonyms?.length) facts.push(["Also known as", <span key="syn" className="block space-y-0.5">{info.synonyms.slice(0, 8).map(s => <span key={s} className="block">{s}</span>)}</span>])
    facts.push(["IDs", <span key="ids" className="flex flex-wrap gap-x-3 gap-y-1">
        <a className="hover:text-white hover:underline" href={info.siteUrl || `https://anilist.co/${type}/${info.id}`} target="_blank" rel="noreferrer">AniList {info.id}</a>
        {!!info.idMal && <a className="hover:text-white hover:underline" href={`https://myanimelist.net/${type}/${info.idMal}`} target="_blank" rel="noreferrer">MAL {info.idMal}</a>}
    </span>])

    return (
        <section className={cn("space-y-4", className)} data-media-info-panel>
            <MediaSectionHeading icon={<LuInfo />} title="Information" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                <GlassCard title="Details" icon={<LuInfo />} className="lg:row-span-2">
                    <dl className="divide-y divide-white/[0.06]">
                        {facts.map(([k, v]) => (
                            <div key={k} className="grid grid-cols-[8.5rem,1fr] gap-3 py-2 text-sm">
                                <dt className="text-[--muted]">{k}</dt>
                                <dd className="min-w-0 break-words font-medium text-white/90">{v}</dd>
                            </div>
                        ))}
                    </dl>
                </GlassCard>

                <RankingsCard info={info} />
                <TagsCard info={info} type={type} />
                <ScoresCard info={info} />
                <LinksCard info={info} />
                {children}
            </div>
        </section>
    )
}

export function GlassCard({ title, icon, className, children, aside }: {
    title: string
    icon?: React.ReactNode
    className?: string
    children: React.ReactNode
    aside?: React.ReactNode
}) {
    return (
        <div className={cn("rounded-2xl border border-white/10 bg-black/25 p-4 shadow-xl shadow-black/20 backdrop-blur-md sm:p-5", className)} data-media-glass-card>
            <div className="mb-3 flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50 [&>svg]:size-3.5">
                    {icon}{title}
                </p>
                {aside}
            </div>
            {children}
        </div>
    )
}

function LinkList({ items, external }: { items: { label: string, href?: string }[], external?: boolean }) {
    return <span className="flex flex-wrap gap-x-1.5 gap-y-0.5">
        {items.map((it, i) => <span key={it.label + i}>
            {it.href
                ? external
                    ? <a href={it.href} target="_blank" rel="noreferrer" className="hover:text-white hover:underline">{it.label}</a>
                    : <SeaLink href={it.href} className="hover:text-white hover:underline">{it.label}</SeaLink>
                : it.label}
            {i < items.length - 1 && <span className="text-white/30">,</span>}
        </span>)}
    </span>
}

function RankingsCard({ info }: { info: MediaInfo }) {
    const rankings = [...(info.rankings ?? [])].sort((a, b) => Number(!!b.allTime) - Number(!!a.allTime) || a.rank - b.rank)
    if (!rankings.length) return null
    return (
        <GlassCard title="Rankings" icon={<LuAward />}>
            <div className="flex flex-wrap gap-2">
                {rankings.slice(0, 8).map(r => (
                    <span
                        key={r.id}
                        className={cn(
                            "flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium ring-1",
                            r.type === "RATED" ? "bg-amber-300/[0.08] text-amber-100 ring-amber-300/20" : "bg-rose-300/[0.08] text-rose-100 ring-rose-300/20",
                        )}
                    >
                        <span className="text-sm font-bold tabular-nums">#{r.rank}</span>
                        <span className="capitalize text-white/75">
                            {r.context.replace(/^(highest|most) /, m => m)}{!r.allTime && (r.season || r.year) ? ` · ${[r.season ? capitalize(r.season) : null, r.year].filter(Boolean).join(" ")}` : ""}
                        </span>
                    </span>
                ))}
            </div>
        </GlassCard>
    )
}

function TagsCard({ info, type }: { info: MediaInfo, type: "anime" | "manga" }) {
    const [showSpoilers, setShowSpoilers] = React.useState(false)
    const tags = (info.tags ?? []).filter(t => showSpoilers || (!t.isMediaSpoiler && !t.isGeneralSpoiler))
    const spoilerCount = (info.tags ?? []).filter(t => t.isMediaSpoiler || t.isGeneralSpoiler).length
    if (!info.tags?.length) return null
    return (
        <GlassCard
            title="Tags"
            icon={<LuTags />}
            aside={spoilerCount > 0 && <button
                type="button"
                onClick={() => setShowSpoilers(s => !s)}
                className="flex items-center gap-1 text-[11px] text-white/50 hover:text-white"
            >
                {showSpoilers ? <LuEyeOff className="size-3" /> : <LuEye className="size-3" />}
                {showSpoilers ? "Hide" : "Show"} {spoilerCount} spoiler{spoilerCount === 1 ? "" : "s"}
            </button>}
        >
            <div className="space-y-1.5">
                {tags.slice(0, 12).map(t => (
                    <a key={t.id} href={`https://anilist.co/search/${type}?genres=${encodeURIComponent(t.name)}`} target="_blank" rel="noreferrer" className="group block">
                        <div className="flex items-center justify-between gap-2 text-xs">
                            <span className={cn("truncate text-white/80 group-hover:text-white", (t.isMediaSpoiler || t.isGeneralSpoiler) && "text-red-200/80")}>{t.name}</span>
                            <span className="tabular-nums text-white/40">{t.rank ?? 0}%</span>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                            <div className="h-full rounded-full bg-gradient-to-r from-brand-400/80 to-brand-200/80" style={{ width: `${t.rank ?? 0}%` }} />
                        </div>
                    </a>
                ))}
            </div>
        </GlassCard>
    )
}

function ScoresCard({ info }: { info: MediaInfo }) {
    const scores = info.stats?.scoreDistribution ?? []
    const statuses = info.stats?.statusDistribution ?? []
    if (!scores.length && !statuses.length) return null
    const maxScore = Math.max(1, ...scores.map(s => s.amount))
    const totalStatus = statuses.reduce((n, s) => n + s.amount, 0)
    return (
        <GlassCard title="Community" icon={<LuChartBar />}>
            {!!scores.length && <div className="flex h-24 items-end gap-1" aria-label="Score distribution">
                {scores.map(s => (
                    <div key={s.score} className="group flex flex-1 flex-col items-center gap-1" title={`${s.score}: ${s.amount.toLocaleString()} users`}>
                        <div
                            className="w-full rounded-t-md bg-gradient-to-t from-brand-500/50 to-brand-300/80 transition-opacity group-hover:opacity-100"
                            style={{ height: `${Math.max(3, (s.amount / maxScore) * 80)}px`, opacity: 0.55 + (s.score / 100) * 0.45 }}
                        />
                        <span className="text-[10px] tabular-nums text-white/40">{s.score}</span>
                    </div>
                ))}
            </div>}
            {totalStatus > 0 && <div className="mt-4 space-y-2">
                <div className="flex h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    {statuses.map(s => <div key={s.status} className={STATUS_DIST_STYLE[s.status]?.color ?? "bg-white/30"} style={{ width: `${(s.amount / totalStatus) * 100}%` }} />)}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/60">
                    {statuses.map(s => <span key={s.status} className="flex items-center gap-1.5">
                        <span className={cn("size-2 rounded-full", STATUS_DIST_STYLE[s.status]?.color ?? "bg-white/30")} />
                        {STATUS_DIST_STYLE[s.status]?.label ?? s.status} <span className="tabular-nums text-white/40">{compact(s.amount)}</span>
                    </span>)}
                </div>
            </div>}
        </GlassCard>
    )
}

function LinksCard({ info }: { info: MediaInfo }) {
    const links = (info.externalLinks ?? []).filter(l => !!l.url)
    if (!links.length) return null
    const groups: [string, typeof links][] = [
        ["Watch / read", links.filter(l => l.type === "STREAMING")],
        ["Official", links.filter(l => l.type === "INFO")],
        ["Social", links.filter(l => l.type === "SOCIAL")],
    ]
    return (
        <GlassCard title="Links" icon={<LuLink />}>
            <div className="space-y-3">
                {groups.filter(([, ls]) => ls.length).map(([label, ls]) => (
                    <div key={label}>
                        <p className="mb-1.5 text-[11px] text-white/40">{label}</p>
                        <div className="flex flex-wrap gap-1.5">
                            {ls.map(l => (
                                <a
                                    key={l.id}
                                    href={l.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-white/80 ring-1 ring-white/10 transition-colors hover:bg-white/[0.08] hover:text-white"
                                >
                                    {l.icon
                                        ? <span className="flex size-4 items-center justify-center rounded" style={{ backgroundColor: l.color || undefined }}>
                                            <img src={getImageUrl(l.icon)} alt="" className="size-3" loading="lazy" />
                                        </span>
                                        : <span className="size-2 rounded-full" style={{ backgroundColor: l.color || "rgba(255,255,255,0.4)" }} />}
                                    {l.site}{l.language ? <span className="text-white/40">{l.language}</span> : null}
                                </a>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </GlassCard>
    )
}

/** The people behind it, with their roles — like the Characters strip. */
export function MediaStaffSection({ info, className }: { info: MediaInfo | undefined, className?: string }) {
    const staff = (info?.staff?.edges ?? []).filter(e => e.node)
    if (!staff.length) return null
    return (
        <section className={cn("space-y-4", className)} data-media-staff-section>
            <MediaSectionHeading icon={<LuUsers />} title="Staff" count={staff.length} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {staff.map((e, i) => (
                    <SeaLink
                        key={`${e.node!.id}-${i}`}
                        href={`/staff?id=${e.node!.id}`}
                        className="group flex items-center gap-3 rounded-2xl bg-white/[0.04] p-2 ring-1 ring-white/[0.08] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white/[0.07] hover:ring-white/15"
                    >
                        <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-white/[0.05]">
                            {e.node!.image?.medium && <img src={getImageUrl(e.node!.image.medium)} alt="" loading="lazy" className="size-full object-cover" />}
                        </span>
                        <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-white group-hover:text-brand-100">{e.node!.name?.full}</span>
                            {e.role && <span className="mt-1 inline-block max-w-full truncate rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-white/65 ring-1 ring-white/10">{e.role}</span>}
                        </span>
                    </SeaLink>
                ))}
            </div>
        </section>
    )
}

/** Every studio, main ones first, for the hero. */
export function MediaStudiosLine({ info, className }: { info: MediaInfo | undefined, className?: string }) {
    const edges = (info?.studios?.edges ?? []).filter(e => e.node)
    if (!edges.length) return null
    const main = edges.filter(e => e.isMain)
    const rest = edges.filter(e => !e.isMain)
    return <p className={cn("flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm text-white/70 lg:justify-start", className)} data-media-studios-line>
        {main.map((e, i) => <React.Fragment key={e.node!.id}>
            <SeaLink href={`/studio?id=${e.node!.id}`} className="font-semibold text-white hover:underline">{e.node!.name}</SeaLink>
            {i < main.length - 1 && <span className="text-white/30">·</span>}
        </React.Fragment>)}
        {!!rest.length && <span className="text-white/45">with {rest.slice(0, 3).map(e => e.node!.name).join(", ")}{rest.length > 3 ? ` +${rest.length - 3}` : ""}</span>}
    </p>
}

/** "Created by …": the original creator and the director, or story & art for manga. */
export function MediaCreatorsLine({ info, className }: { info: MediaInfo | undefined, className?: string }) {
    const edges = (info?.staff?.edges ?? []).filter(e => e.node && e.role)
    const pick = (re: RegExp) => edges.filter(e => re.test(e.role!)).map(e => e.node!.name?.full).filter(Boolean) as string[]
    const original = Array.from(new Set([...pick(/^original (creator|story)/i), ...pick(/^story( & art)?$/i)]))
    const art = Array.from(new Set(pick(/^art$/i)))
    const director = Array.from(new Set(pick(/^director$/i)))
    const parts: string[] = []
    if (original.length) parts.push(`Created by ${original.slice(0, 2).join(" & ")}`)
    if (art.length) parts.push(`Art by ${art.slice(0, 2).join(" & ")}`)
    if (director.length) parts.push(`Directed by ${director.slice(0, 2).join(" & ")}`)
    if (!parts.length) return null
    return <p className={cn("text-center text-sm text-white/60 lg:text-left", className)} data-media-creators-line>{parts.join(" · ")}</p>
}
