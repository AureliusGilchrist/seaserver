"use client"

import { MediaFamilyMember, useGetMediaFamily } from "@/api/hooks/anilist.hooks"
import { MediaSectionHeading } from "@/app/(main)/_features/media/_components/media-section-heading"
import {
    FRANCHISE_RELATION_KINDS,
    franchiseMediaKind,
    franchiseRelationKind,
    franchiseRelationLabel,
    useFranchiseSettings,
} from "@/app/(main)/_features/media/_lib/franchise-settings"
import { SeaLink } from "@/components/shared/sea-link"
import { cn } from "@/components/ui/core/styling"
import { getImageUrl } from "@/lib/server/assets"
import { capitalize } from "lodash"
import React from "react"
import { LuChevronDown, LuChevronUp, LuLoader, LuMapPin, LuNetwork, LuStar } from "react-icons/lu"

// The whole franchise of the media being viewed — every season, film, OVA, spin-off and the source
// — oldest first, with the viewed one marked. It used to be the source manga plus the first four
// direct relations, which for a long-running series left out most of it.

type FallbackRelation = {
    relationType?: string | null
    node?: {
        id: number
        type?: string | null
        format?: string | null
        status?: string | null
        title?: { userPreferred?: string | null } | null
        coverImage?: { large?: string | null, extraLarge?: string | null, medium?: string | null, color?: string | null } | null
        startDate?: { year?: number | null, month?: number | null, day?: number | null } | null
        season?: string | null
        seasonYear?: number | null
        episodes?: number | null
        chapters?: number | null
        meanScore?: number | null
        isAdult?: boolean | null
    } | null
}

export function MediaFranchiseSection(props: {
    mediaId: number
    /** The viewed media's direct relations, shown while the full walk is still coming. */
    fallbackRelations?: FallbackRelation[] | null
    className?: string
}) {
    const { mediaId, fallbackRelations, className } = props
    const { data, isLoading, isError } = useGetMediaFamily(mediaId)
    const settings = useFranchiseSettings()
    const [expanded, setExpanded] = React.useState(false)
    const [kindFilter, setKindFilter] = React.useState<string | null>(null)

    React.useEffect(() => {
        setExpanded(false)
        setKindFilter(null)
    }, [mediaId])

    const members: MediaFamilyMember[] = React.useMemo(() => {
        if (data?.members?.length) return data.members
        return (fallbackRelations ?? [])
            .filter(r => !!r?.node?.id)
            .map(r => ({
                id: r.node!.id,
                type: (r.node!.type as "ANIME" | "MANGA") ?? "ANIME",
                format: r.node!.format ?? undefined,
                status: r.node!.status ?? undefined,
                title: { userPreferred: r.node!.title?.userPreferred ?? undefined },
                coverImage: {
                    large: r.node!.coverImage?.large ?? undefined,
                    extraLarge: r.node!.coverImage?.extraLarge ?? undefined,
                    color: r.node!.coverImage?.color ?? undefined,
                },
                startDate: {
                    year: r.node!.startDate?.year ?? undefined,
                    month: r.node!.startDate?.month ?? undefined,
                    day: r.node!.startDate?.day ?? undefined,
                },
                season: r.node!.season ?? undefined,
                seasonYear: r.node!.seasonYear ?? undefined,
                episodes: r.node!.episodes ?? undefined,
                chapters: r.node!.chapters ?? undefined,
                meanScore: r.node!.meanScore ?? undefined,
                relation: r.relationType ?? "OTHER",
                direct: true,
                depth: 1,
            }))
    }, [data, fallbackRelations])

    const included = React.useMemo(() => members.filter(m => {
        if (m.id === mediaId || m.relation === "CURRENT") return true
        return settings.relations.includes(franchiseRelationKind(m.relation)) && settings.mediaKinds.includes(franchiseMediaKind(m))
    }), [members, mediaId, settings.relations, settings.mediaKinds])

    const kindsPresent = React.useMemo(() => {
        const present = new Set(included.filter(m => m.id !== mediaId).map(m => franchiseRelationKind(m.relation)))
        return FRANCHISE_RELATION_KINDS.filter(k => present.has(k.id))
    }, [included, mediaId])

    const filtered = kindFilter
        ? included.filter(m => m.id === mediaId || franchiseRelationKind(m.relation) === kindFilter)
        : included

    // Nothing beyond the media itself: no section.
    if (!isLoading && filtered.filter(m => m.id !== mediaId).length === 0 && !kindFilter) return null

    const shown = expanded ? filtered : filtered.slice(0, settings.initialCount)
    const hidden = filtered.length - shown.length
    const walking = isLoading && !data

    return (
        <section className={cn("space-y-4", className)} data-media-franchise-section>
            <MediaSectionHeading
                icon={<LuNetwork />}
                title="Franchise"
                count={included.filter(m => m.id !== mediaId).length || undefined}
                aside={walking ? <span className="flex items-center gap-1.5 text-xs text-[--muted]">
                    <LuLoader className="size-3.5 animate-spin" /> Finding the whole series…
                </span> : (isError && !data ? <span className="text-xs text-[--muted]">Showing direct relations</span> : null)}
            />

            {kindsPresent.length > 1 && (
                <div className="flex flex-wrap gap-1.5" data-media-franchise-filters>
                    <FilterChip active={kindFilter === null} onClick={() => setKindFilter(null)}>All</FilterChip>
                    {kindsPresent.map(k => (
                        <FilterChip key={k.id} active={kindFilter === k.id} onClick={() => setKindFilter(kindFilter === k.id ? null : k.id)}>
                            {k.label}
                        </FilterChip>
                    ))}
                </div>
            )}

            <div className="sea-card-grid sea-card-anime" data-media-franchise-grid>
                {shown.map(m => <FranchiseCard key={m.id} member={m} current={m.id === mediaId} />)}
            </div>

            {(hidden > 0 || expanded) && filtered.length > settings.initialCount && (
                <div className="flex justify-center">
                    <button
                        type="button"
                        onClick={() => setExpanded(e => !e)}
                        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 text-sm font-medium text-white/80 backdrop-blur-md transition-colors hover:bg-white/[0.08] hover:text-white"
                    >
                        {expanded ? <>Show less <LuChevronUp /></> : <>Show more ({hidden}) <LuChevronDown /></>}
                    </button>
                </div>
            )}
        </section>
    )
}

function FilterChip({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) {
    return <button
        type="button"
        onClick={onClick}
        className={cn(
            "rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors",
            active ? "bg-white/[0.12] text-white ring-white/20" : "bg-white/[0.03] text-white/60 ring-white/10 hover:text-white",
        )}
    >{children}</button>
}

const FORMAT_LABELS: Record<string, string> = {
    TV: "TV", TV_SHORT: "TV Short", MOVIE: "Movie", SPECIAL: "Special", OVA: "OVA", ONA: "ONA", MUSIC: "Music",
    MANGA: "Manga", NOVEL: "Light Novel", ONE_SHOT: "One-shot",
}

function FranchiseCard({ member: m, current }: { member: MediaFamilyMember, current: boolean }) {
    const href = m.type === "MANGA" ? `/manga/entry?id=${m.id}` : `/entry?id=${m.id}`
    const cover = m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium
    const year = m.seasonYear || m.startDate?.year
    const when = m.season && m.seasonYear ? `${capitalize(m.season)} ${m.seasonYear}` : year ? String(year) : "TBA"
    const count = m.type === "MANGA"
        ? (m.chapters ? `${m.chapters} ch` : null)
        : (m.episodes ? `${m.episodes} ep` : null)

    const body = (
        <div className={cn("group relative flex flex-col gap-2", current && "pointer-events-none")}>
            <div
                className={cn(
                    "relative aspect-[6/8] w-full overflow-hidden rounded-[--radius-md] bg-white/[0.04] ring-1 ring-white/10 transition-all duration-300",
                    !current && "group-hover:-translate-y-1 group-hover:ring-white/25 group-hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]",
                    current && "ring-2 ring-brand-400/70",
                )}
                style={m.coverImage?.color ? { backgroundColor: `${m.coverImage.color}33` } : undefined}
            >
                {cover && <img
                    src={getImageUrl(cover)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />}
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

                <span className={cn(
                    "absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold backdrop-blur-md ring-1",
                    current ? "bg-brand-500/80 text-white ring-brand-300/40"
                        : m.direct ? "bg-black/60 text-white ring-white/15" : "bg-black/45 text-white/75 ring-white/10",
                )}>
                    {current && <LuMapPin className="size-3" />}
                    {franchiseRelationLabel(m)}
                </span>

                <div className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-2 text-[11px] font-medium text-white/85">
                    <span className="rounded-md bg-black/40 px-1.5 py-0.5 backdrop-blur-sm">{FORMAT_LABELS[m.format ?? ""] ?? (m.format ? capitalize(m.format) : m.type === "MANGA" ? "Manga" : "Anime")}</span>
                    {!!m.meanScore && <span className="flex items-center gap-0.5 rounded-md bg-black/40 px-1.5 py-0.5 backdrop-blur-sm">
                        <LuStar className="size-3 text-amber-300" />{(m.meanScore / 10).toFixed(1)}
                    </span>}
                </div>
            </div>
            <div className="min-w-0 px-0.5">
                <p className={cn("line-clamp-2 text-sm font-semibold leading-snug", current ? "text-brand-200" : "text-white group-hover:text-brand-100")}>
                    {m.title?.userPreferred || m.title?.romaji || m.title?.english || m.title?.native}
                </p>
                <p className="mt-0.5 text-xs text-[--muted]">
                    {when}{count ? ` · ${count}` : ""}{m.status === "RELEASING" ? " · Airing" : m.status === "NOT_YET_RELEASED" ? " · Upcoming" : ""}
                </p>
            </div>
        </div>
    )

    if (current) return <div data-media-franchise-card data-current>{body}</div>
    return <SeaLink href={href} data-media-franchise-card>{body}</SeaLink>
}
