"use client"

import { TodoMediaType, useAddToWatch, useGetToWatch, useRemoveFromToWatch } from "@/api/hooks/towatch.hooks"
import { AL_BaseAnime, AL_BaseManga } from "@/api/generated/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { LuCheck, LuListVideo } from "react-icons/lu"

/**
 * The button the todo list is built from.
 *
 * The list starts blank, and this is the only way something gets on it — a deliberate act on the
 * media's own page, which is why there is nothing to turn off: the list is exactly as long as the
 * person made it. The snapshot the list shows is taken here, at the moment of adding, so the row
 * never has to ask AniList for itself.
 *
 * A labeled button rather than another icon in the row: this is the only place the list is added
 * to, so it has to be findable. Once the entry is on the list it says so and takes it off again,
 * which is also how somebody checks whether it is already there.
 */
export function ToWatchButton({ media, mediaType = "ANIME", studios, className }: {
    media: AL_BaseAnime | AL_BaseManga
    mediaType?: TodoMediaType
    studios?: string
    className?: string
}) {
    const { data: list } = useGetToWatch()
    const { mutate: addToWatch, isPending: isAdding } = useAddToWatch()
    const { mutate: removeFromToWatch, isPending: isRemoving } = useRemoveFromToWatch()

    const onList = React.useMemo(
        () => (list ?? []).some(entry =>
            (entry.mediaId ?? entry.animeId) === media?.id &&
            (entry.mediaType ?? "ANIME") === mediaType,
        ),
        [list, media?.id, mediaType],
    )

    const handleClick = React.useCallback(() => {
        if (!media?.id) return
        if (onList) {
            removeFromToWatch({ mediaId: media.id, mediaType })
            return
        }
        addToWatch({
            mediaId: media.id,
            mediaType,
            title: media.title?.userPreferred || media.title?.romaji || media.title?.english || media.title?.native || `#${media.id}`,
            description: media.description
                ? String(media.description).replace(/<[^>]*>/g, "").slice(0, 400)
                : undefined,
            coverImage: media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium || undefined,
            bannerImage: media.bannerImage || undefined,
            format: media.format || undefined,
            episodes: "episodes" in media ? media.episodes : undefined,
            chapters: "chapters" in media ? media.chapters : undefined,
            volumes: "volumes" in media ? media.volumes : undefined,
            duration: "duration" in media ? media.duration : undefined,
            season: "season" in media ? media.season : undefined,
            seasonYear: "seasonYear" in media ? media.seasonYear : undefined,
            status: media.status || undefined,
            meanScore: media.meanScore ? Math.round(media.meanScore) : undefined,
            genres: (media.genres ?? []).slice(0, 5),
            studio: mediaType === "ANIME" ? studios || undefined : undefined,
        })
    }, [media, mediaType, studios, onList, addToWatch, removeFromToWatch])

    return (
        <Button
            size="sm"
            intent={onList ? "primary-subtle" : "gray-outline"}
            leftIcon={onList ? <LuCheck /> : <LuListVideo />}
            loading={isAdding || isRemoving}
            className={cn("flex-none", className)}
            onClick={handleClick}
            title={onList ? "On your todo list — click to take it off" : "Add to your todo list"}
        >
            {onList ? "On your list" : "Add to list"}
        </Button>
    )
}
