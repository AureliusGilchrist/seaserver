"use client"

import { useAddToWatch } from "@/api/hooks/towatch.hooks"
import { AL_BaseAnime } from "@/api/generated/types"
import { Button, IconButton } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { Tooltip } from "@/components/ui/tooltip"
import React from "react"
import { LuListVideo } from "react-icons/lu"

/**
 * The button the to-watch list is built from.
 *
 * The list starts blank, and this is the only way something gets on it — a deliberate act on the
 * anime's own page, which is why there is nothing to turn off: the list is exactly as long as the
 * person made it. The snapshot the list shows is taken here, at the moment of adding, so the row
 * never has to ask AniList for itself.
 */
export function ToWatchButton({ media, size = "md" }: { media: AL_BaseAnime, size?: "sm" | "md" }) {
    const { mutate: addToWatch, isPending } = useAddToWatch()

    const handleAdd = React.useCallback(() => {
        const m = media as any
        addToWatch({
            animeId: media.id,
            title: m?.title?.userPreferred || m?.title?.romaji || m?.title?.english || m?.title?.native || `#${media.id}`,
            description: m?.description
                ? String(m.description).replace(/<[^>]*>/g, "").slice(0, 400)
                : undefined,
            coverImage: m?.coverImage?.large || m?.coverImage?.extraLarge || m?.coverImage?.medium || undefined,
            bannerImage: m?.bannerImage || undefined,
            format: m?.format || undefined,
            episodes: m?.episodes || undefined,
            seasonYear: m?.seasonYear || undefined,
        })
    }, [media, addToWatch])

    return (
        <Tooltip trigger={
            <IconButton
                size="sm"
                intent="gray-link"
                className="px-0"
                icon={<LuListVideo className="text-lg" />}
                loading={isPending}
                onClick={handleAdd}
            />
        }>
            Add to your to-watch list
        </Tooltip>
    )
}

/** A compact variant for places a row of buttons does not fit. */
export function ToWatchButtonCompact({ media, className }: { media: AL_BaseAnime, className?: string }) {
    const { mutate: addToWatch, isPending } = useAddToWatch()

    return (
        <Button
            size="sm"
            intent="gray-outline"
            leftIcon={<LuListVideo />}
            loading={isPending}
            className={cn("flex-none", className)}
            onClick={() => {
                const m = media as any
                addToWatch({
                    animeId: media.id,
                    title: m?.title?.userPreferred || m?.title?.romaji || m?.title?.english || m?.title?.native || `#${media.id}`,
                    description: m?.description ? String(m.description).replace(/<[^>]*>/g, "").slice(0, 400) : undefined,
                    coverImage: m?.coverImage?.large || m?.coverImage?.extraLarge || m?.coverImage?.medium || undefined,
                    bannerImage: m?.bannerImage || undefined,
                    format: m?.format || undefined,
                    episodes: m?.episodes || undefined,
                    seasonYear: m?.seasonYear || undefined,
                })
            }}
        >
            To watch
        </Button>
    )
}
