"use client"

import { useGetKitsuInfo } from "@/api/hooks/kitsu.hooks"
import { GlassCard } from "@/app/(main)/_features/media/_components/media-info-panel"
import { compact } from "@/app/(main)/_features/media/_components/media-meta-chips"
import React from "react"
import { LuExternalLink, LuListPlus } from "react-icons/lu"

/** What Kitsu knows that AniList does not, as one more card of the series' Information panel. */
export function KitsuDetailsCard({ malId, type }: { malId: number | null | undefined, type: "anime" | "manga" }) {
    const { data } = useGetKitsuInfo(malId, type)
    if (!data?.found) return null

    const hours = data.totalLength ? Math.round(data.totalLength / 60) : 0
    const rows: [string, string | number | undefined][] = [
        ["Age rating", [data.ageRating, data.ageRatingGuide].filter(Boolean).join(" · ") || undefined],
        ["Kitsu score", data.averageRating ? `${(Number(data.averageRating) / 10).toFixed(1)} / 10` : undefined],
        ["Rating rank", data.ratingRank ? `#${data.ratingRank.toLocaleString()}` : undefined],
        ["Popularity rank", data.popularityRank ? `#${data.popularityRank.toLocaleString()}` : undefined],
        ["Kitsu members", data.userCount ? compact(data.userCount) : undefined],
        ["Favourites", data.favoritesCount ? compact(data.favoritesCount) : undefined],
        ["Total runtime", hours ? `${hours.toLocaleString()} hours` : undefined],
        ["Chapters", data.chapterCount || undefined],
        ["Volumes", data.volumeCount || undefined],
        ["Serialized in", data.serialization || undefined],
        ["Titles", Object.values(data.titles ?? {}).filter(t => t && t !== data.canonicalTitle).slice(0, 3).join(" · ") || undefined],
    ]
    const shown = rows.filter(([, v]) => v !== undefined)
    if (!shown.length) return null

    return (
        <GlassCard
            title="More details"
            icon={<LuListPlus />}
            aside={data.url
                ? <a href={data.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-white/50 hover:text-white">Kitsu <LuExternalLink className="size-3" /></a>
                : undefined}
        >
            <dl className="divide-y divide-white/[0.06]">
                {shown.map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[8.5rem,1fr] gap-3 py-2 text-sm">
                        <dt className="text-[--muted]">{k}</dt>
                        <dd className="min-w-0 break-words font-medium text-white/90">{v}</dd>
                    </div>
                ))}
            </dl>
        </GlassCard>
    )
}
