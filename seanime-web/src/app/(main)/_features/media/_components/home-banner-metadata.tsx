"use client"

import { AL_BaseAnime, AL_BaseManga } from "@/api/generated/types"
import { MediaInfo, useGetMediaInfo } from "@/api/hooks/anilist.hooks"
import { compact, MediaMetaChips } from "@/app/(main)/_features/media/_components/media-meta-chips"
import { isCustomSource } from "@/lib/server/utils"
import React from "react"

type Media = AL_BaseAnime | AL_BaseManga
type MediaType = "anime" | "manga"

export const homeBannerTextBackdrop = "relative isolate before:pointer-events-none before:absolute before:-inset-x-8 before:-inset-y-6 before:-z-10 before:bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.88)_0%,rgba(0,0,0,0.72)_55%,transparent_100%)] before:blur-xl before:content-['']"

export function HomeBannerMetadata({ media, type }: { media: Media, type: MediaType }) {
    const { data: info } = useGetMediaInfo(isCustomSource(media.id) ? undefined : media.id)
    return <HomeBannerMetadataContent media={media} type={type} info={info} />
}

export function HomeBannerMetadataContent({ media, type, info }: { media: Media, type: MediaType, info?: MediaInfo }) {
    const credits = type === "anime"
        ? info?.studios?.edges?.filter(edge => edge.isMain).map(edge => edge.node?.name)
        : info?.staff?.edges?.filter(edge => /story|art|original creator/i.test(edge.role ?? "")).map(edge => edge.node?.name?.full)
    const names = Array.from(new Set((credits ?? []).filter((name): name is string => !!name))).slice(0, 2)
    const tags = info?.tags?.filter(tag => !tag.isMediaSpoiler && !tag.isGeneralSpoiler).slice(0, 4)
    const next = type === "anime" ? info?.nextAiringEpisode ?? ("nextAiringEpisode" in media ? media.nextAiringEpisode : undefined) : undefined
    const date = next?.airingAt ? new Date(next.airingAt * 1000) : undefined
    const airing = date && Number.isFinite(date.getTime()) && date.getTime() > Date.now()
        ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date)
        : undefined

    return (
        <div className="space-y-1.5" data-home-banner-metadata>
            <MediaMetaChips media={media} info={info} type={type} className="justify-start gap-x-4 gap-y-1" />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-medium text-white/80 [text-shadow:_0_1px_10px_rgb(0_0_0_/_80%)]">
                {!!info?.popularity && <span>{compact(info.popularity)} members</span>}
                {!!info?.favourites && <span>{compact(info.favourites)} favourites</span>}
                {!!info?.trending && <span>{compact(info.trending)} trending</span>}
                {!!names.length && <span>{type === "anime" ? "Studio" : "Creator"}: {names.join(", ")}</span>}
                {!!tags?.length && <span>Themes: {tags.map(tag => tag.name).join(" · ")}</span>}
                {airing && <span>Episode {next?.episode} airs {airing}</span>}
            </div>
        </div>
    )
}
