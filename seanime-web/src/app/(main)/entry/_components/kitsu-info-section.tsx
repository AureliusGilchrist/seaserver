"use client"

import { useGetKitsuAnimeInfo } from "@/api/hooks/kitsu.hooks"
import React from "react"
import { LuChevronDown, LuChevronUp, LuInfo } from "react-icons/lu"

type Props = {
    malId: number | null | undefined
}

export function KitsuInfoSection({ malId }: Props) {
    const { data, isLoading } = useGetKitsuAnimeInfo(malId)
    const [expanded, setExpanded] = React.useState(false)

    if (isLoading || !data?.found) return null

    const rows: [string, string | number | undefined][] = [
        ["Type", data.subtype?.toUpperCase()],
        ["Status", data.status],
        ["Rating", data.averageRating ? `${data.averageRating} / 100` : undefined],
        ["Rating rank", data.ratingRank ? `#${data.ratingRank}` : undefined],
        ["Popularity rank", data.popularityRank ? `#${data.popularityRank}` : undefined],
        ["Users", data.userCount || undefined],
        ["Favorites", data.favoritesCount || undefined],
        ["Age rating", [data.ageRating, data.ageRatingGuide].filter(Boolean).join(" - ") || undefined],
        ["Aired", [data.startDate, data.endDate].filter(Boolean).join(" to ") || undefined],
        ["Episodes", data.episodeCount || undefined],
        ["Episode length", data.episodeLength ? `${data.episodeLength} min` : undefined],
    ]

    return (
        <div className="space-y-4" data-kitsu-info-section>
            <button
                onClick={() => setExpanded(p => !p)}
                className="flex items-center gap-2 text-lg font-semibold hover:text-white transition text-[--muted]"
            >
                <LuInfo className="text-xl" />
                <span>Kitsu</span>
                {expanded ? <LuChevronUp /> : <LuChevronDown />}
            </button>

            {expanded && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    {data.synopsis && <p className="text-sm text-[--muted] whitespace-pre-line max-w-4xl">{data.synopsis}</p>}
                    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2 text-sm">
                        {rows.filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => (
                            <div key={k} className="flex gap-2">
                                <dt className="text-[--muted]">{k}:</dt>
                                <dd>{v}</dd>
                            </div>
                        ))}
                    </dl>
                    {data.url && <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-300 hover:underline">
                        View on Kitsu
                    </a>}
                </div>
            )}
        </div>
    )
}
