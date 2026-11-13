import { useEpisodeFavorite } from "@/api/hooks/favorites.hooks"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { LuHeart } from "react-icons/lu"

/**
 * A heart that favourites one episode. Used on the episode cards of the details page and in the
 * player's top bar; the right-click "Favourite episode" item does the same thing.
 */
export function EpisodeFavoriteButton(props: {
    mediaId: number | undefined
    episodeNumber: number | undefined
    title?: string
    image?: string
    className?: string
    /** Icon size in px. */
    size?: number
}) {
    const { mediaId, episodeNumber, title, image, className, size = 18 } = props
    const { isFavorite, toggle, isPending } = useEpisodeFavorite(mediaId, episodeNumber)
    if (!mediaId || episodeNumber === undefined) return null

    const label = isFavorite ? "Remove from favourite episodes" : "Favourite this episode"
    return (
        <button
            type="button"
            data-episode-favorite-button
            data-favorite={isFavorite || undefined}
            aria-label={label}
            aria-pressed={isFavorite}
            title={label}
            disabled={isPending}
            onClick={e => {
                // The cards and the player both react to clicks underneath; this one is only the heart.
                e.preventDefault()
                e.stopPropagation()
                toggle({ title, image })
            }}
            onPointerDown={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
            className={cn(
                "inline-flex items-center justify-center rounded-full p-1.5 transition",
                "text-white/80 hover:text-white hover:bg-white/10 active:scale-90 disabled:opacity-60",
                isFavorite && "text-[--red] hover:text-[--red]",
                className,
            )}
        >
            <LuHeart style={{ width: size, height: size }} className={cn(isFavorite && "fill-current")} />
        </button>
    )
}
