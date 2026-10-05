"use client"

import { useAddToWatch, useGetToWatch, useRemoveFromToWatch } from "@/api/hooks/towatch.hooks"
import { AL_BaseAnime } from "@/api/generated/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { LuCheck, LuListVideo } from "react-icons/lu"

/**
 * The button the to-watch list is built from.
 *
 * The list starts blank, and this is the only way something gets on it — a deliberate act on the
 * anime's own page, which is why there is nothing to turn off: the list is exactly as long as the
 * person made it. The snapshot the list shows is taken here, at the moment of adding, so the row
 * never has to ask AniList for itself.
 *
 * A labeled button rather than another icon in the row: this is the only place the list is added
 * to, so it has to be findable. Once the anime is on the list it says so and takes it off again,
 * which is also how somebody checks whether it is already there.
 */
export function ToWatchButton({ media, studios, className }: { media: AL_BaseAnime, studios?: string, className?: string }) {
    const { data: list } = useGetToWatch()
    const { mutate: addToWatch, isPending: isAdding } = useAddToWatch()
    const { mutate: removeFromToWatch, isPending: isRemoving } = useRemoveFromToWatch()

    const onList = React.useMemo(
        () => (list ?? []).some(entry => entry.animeId === media?.id),
        [list, media?.id],
    )

    const handleClick = React.useCallback(() => {
        if (!media?.id) return
        if (onList) {
            removeFromToWatch({ animeId: media.id })
            return
        }
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
            duration: m?.duration || undefined,
            season: m?.season || undefined,
            seasonYear: m?.seasonYear || undefined,
            status: m?.status || undefined,
            meanScore: m?.meanScore ? Math.round(m.meanScore) : undefined,
            genres: (m?.genres ?? []).slice(0, 5),
            studio: studios || undefined,
        })
    }, [media, studios, onList, addToWatch, removeFromToWatch])

    return (
        <Button
            size="sm"
            intent={onList ? "primary-subtle" : "gray-outline"}
            leftIcon={onList ? <LuCheck /> : <LuListVideo />}
            loading={isAdding || isRemoving}
            className={cn("flex-none", className)}
            onClick={handleClick}
            title={onList ? "On your to-watch list — click to take it off" : "Add to your to-watch list"}
        >
            {onList ? "On your list" : "To watch"}
        </Button>
    )
}
