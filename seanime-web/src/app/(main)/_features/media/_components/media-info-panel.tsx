"use client"

import { MediaInfo } from "@/api/hooks/anilist.hooks"
import { useGetKitsuInfo } from "@/api/hooks/kitsu.hooks"
import { MediaSectionHeading } from "@/app/(main)/_features/media/_components/media-section-heading"
import { compact } from "@/app/(main)/_features/media/_components/media-meta-chips"
import { SeaLink } from "@/components/shared/sea-link"
import { cn } from "@/components/ui/core/styling"
import { getImageUrl } from "@/lib/server/assets"
import { capitalize } from "lodash"
import React from "react"
import { LuAward, LuChartBar, LuExternalLink, LuEye, LuEyeOff, LuInfo, LuLink, LuTags, LuUsers } from "react-icons/lu"

// The Details tab: what the hero has no room for. The story of the numbers on the left, in the room
// charts need, and a slim rail of facts on the right, where AniList and Kitsu read as one list.

const STATUS_DIST_STYLE: Record<string, { label: string, color: string }> = {
    CURRENT: { label: "Current", color: "bg-sky-400" },
    PLANNING: { label: "Planning", color: "bg-violet-400" },
    COMPLETED: { label: "Completed", color: "bg-emerald-400" },
    PAUSED: { label: "Paused", color: "bg-amber-400" },
    DROPPED: { label: "Dropped", color: "bg-red-400" },
    REPEATING: { label: "Repeating", color: "bg-teal-300" },
}

export function MediaInfoPanel({ info, type, nativeTitle, className, children }: {
    info: MediaInfo | undefined
    type: "anime" | "manga"
    nativeTitle?: string | null
    className?: string
    /** More for the main column, such as the theme songs. */
    children?: React.ReactNode
}) {
    const { data: kitsu } = useGetKitsuInfo(info?.idMal, type)

    if (!info) return <>{children}</>

    const studios = (info.studios?.edges ?? []).filter(e => e.node)
    const mainStudios = studios.filter(e => e.isMain).map(e => e.node!)
    const producers = studios.filter(e => !e.isMain).map(e => e.node!)
    const runtime = type === "anime" && info.episodes && info.duration ? info.episodes * info.duration : (kitsu?.totalLength ?? 0)

    // What the chips and stat tiles above already say is left out, so this list only ever adds.
    const facts: [string, React.ReactNode][] = []
    if (mainStudios.length) facts.push([mainStudios.length > 1 ? "Studios" : "Studio", <LinkList key="studios" items={mainStudios.map(s => ({ label: s.name, href: `/studio?id=${s.id}` }))} />])
    if (producers.length) facts.push(["Producers", <LinkList key="producers" items={producers.map(s => ({ label: s.name, href: s.siteUrl }))} external />])
    if (runtime >= 60) facts.push(["Total runtime", `${Math.round(runtime / 60).toLocaleString()} hours`])
    if (kitsu?.serialization) facts.push(["Serialized in", kitsu.serialization])
    if (!info.chapters && kitsu?.chapterCount) facts.push(["Chapters", kitsu.chapterCount])
    if (!info.volumes && kitsu?.volumeCount) facts.push(["Volumes", kitsu.volumeCount])
    if (kitsu?.averageRating) facts.push(["Kitsu score", `${(Number(kitsu.averageRating) / 10).toFixed(1)} / 10`])
    if (kitsu?.ratingRank) facts.push(["Kitsu rating rank", `#${kitsu.ratingRank.toLocaleString()}`])
    if (kitsu?.popularityRank) facts.push(["Kitsu popularity", `#${kitsu.popularityRank.toLocaleString()}`])
    if (kitsu?.userCount) facts.push(["Kitsu members", compact(kitsu.userCount)])
    if (info.hashtag) facts.push(["Hashtag", info.hashtag])
    if (info.isLicensed !== undefined) facts.push(["Licensed", info.isLicensed ? "Yes" : "No"])

    const titles = Array.from(new Set([
        nativeTitle,
        ...(info.synonyms ?? []),
        ...Object.values(kitsu?.titles ?? {}),
    ].filter(Boolean) as string[]))

    return (
        <section className={cn("grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr),minmax(17rem,21rem)]", className)} data-media-info-panel>
            <div className="min-w-0 space-y-5">
                <ScoresCard info={info} type={type} />
                <RankingsCard info={info} />
                <TagsCard info={info} type={type} />
                {children}
            </div>

            <aside className="min-w-0 space-y-5 lg:sticky lg:top-16" data-media-info-rail>
                <GlassCard title="Details" icon={<LuInfo />}>
                    <dl className="divide-y divide-white/[0.06]">
                        {facts.map(([k, v]) => (
                            <div key={k} className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
                                <dt className="shrink-0 text-[--muted]">{k}</dt>
                                <dd className="min-w-0 break-words text-right font-medium text-white/90">{v}</dd>
                            </div>
                        ))}
                    </dl>
                    {!!titles.length && <div className="mt-3 border-t border-white/[0.06] pt-3">
                        <p className="mb-1 text-[11px] text-white/40">Also known as</p>
                        <p className="text-sm leading-relaxed text-white/80">{titles.slice(0, 10).join(" · ")}</p>
                    </div>}
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-white/[0.06] pt-3 text-xs text-white/60">
                        <ExternalId href={info.siteUrl || `https://anilist.co/${type}/${info.id}`} label="AniList" />
                        {!!info.idMal && <ExternalId href={`https://myanimelist.net/${type}/${info.idMal}`} label="MyAnimeList" />}
                        {!!kitsu?.url && <ExternalId href={kitsu.url} label="Kitsu" />}
                    </div>
                </GlassCard>
                <LinksCard info={info} />
            </aside>
        </section>
    )
}

function ExternalId({ href, label }: { href: string, label: string }) {
    return <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-white">{label}<LuExternalLink className="size-3" /></a>
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
            <div className="grid gap-x-6 sm:grid-cols-2">
                {rankings.map(r => (
                    <div key={r.id} className="flex items-baseline gap-2.5 border-b border-white/[0.05] py-1.5 text-sm last:border-b-0">
                        <span className={cn("w-12 shrink-0 text-right font-bold tabular-nums", r.type === "RATED" ? "text-amber-200" : "text-rose-200")}>#{r.rank.toLocaleString()}</span>
                        <span className="min-w-0 capitalize text-white/75">
                            {r.context}{!r.allTime && (r.season || r.year) ? ` · ${[r.season ? capitalize(r.season) : null, r.year].filter(Boolean).join(" ")}` : ""}
                        </span>
                    </div>
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
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
                {tags.map(t => (
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

function ScoresCard({ info, type }: { info: MediaInfo, type: "anime" | "manga" }) {
    const scores = info.stats?.scoreDistribution ?? []
    const statuses = info.stats?.statusDistribution ?? []
    if (!scores.length && !statuses.length) return null
    const maxScore = Math.max(1, ...scores.map(s => s.amount))
    const totalVotes = scores.reduce((n, s) => n + s.amount, 0)
    const totalStatus = statuses.reduce((n, s) => n + s.amount, 0)
    return (
        <GlassCard title="How people rate and follow it" icon={<LuChartBar />}>
            <div className="grid gap-6 md:grid-cols-[minmax(0,1.3fr),minmax(0,1fr)]">
                {!!scores.length && <div>
                    <div className="flex h-36 items-end gap-1.5" aria-label="Score distribution">
                        {scores.map(s => (
                            <div key={s.score} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${s.score}: ${s.amount.toLocaleString()} votes`}>
                                <span className="text-[10px] tabular-nums text-white/0 transition-colors group-hover:text-white/70">{compact(s.amount)}</span>
                                <div className="flex min-h-0 w-full flex-1 items-end">
                                    <div
                                        className="w-full rounded-t-lg bg-gradient-to-t from-brand-500/50 to-brand-300/90 transition-opacity group-hover:opacity-100"
                                        style={{ height: `${Math.max(3, (s.amount / maxScore) * 100)}%`, opacity: 0.5 + (s.score / 100) * 0.5 }}
                                    />
                                </div>
                                <span className="text-[11px] tabular-nums text-white/50">{s.score}</span>
                            </div>
                        ))}
                    </div>
                    <p className="mt-2 text-xs text-white/45">{totalVotes.toLocaleString()} votes</p>
                </div>}
                {totalStatus > 0 && <div className="space-y-2.5">
                    {[...statuses].sort((a, b) => b.amount - a.amount).map(s => {
                        const share = (s.amount / totalStatus) * 100
                        const label = (type === "manga" && s.status === "CURRENT") ? "Reading" : (STATUS_DIST_STYLE[s.status]?.label ?? s.status)
                        return <div key={s.status}>
                            <div className="flex items-baseline justify-between gap-2 text-xs">
                                <span className="text-white/75">{label}</span>
                                <span className="tabular-nums text-white/45">{compact(s.amount)} · {Math.round(share)}%</span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                                <div className={cn("h-full rounded-full", STATUS_DIST_STYLE[s.status]?.color ?? "bg-white/30")} style={{ width: `${share}%` }} />
                            </div>
                        </div>
                    })}
                </div>}
            </div>
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
