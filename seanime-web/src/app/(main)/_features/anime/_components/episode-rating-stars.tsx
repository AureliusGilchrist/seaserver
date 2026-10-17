import { cn } from "@/components/ui/core/styling"
import React from "react"
import { AiFillStar, AiOutlineStar } from "react-icons/ai"

type EpisodeRatingStarsProps = {
    /** Rating out of 10. */
    rating: number
    className?: string
    iconClassName?: string
}

/**
 * Renders a 5-star visualization of a 0-10 rating.
 * The filled layer is clipped to the rating's proportion, so a 7.5/10 shows 3.75 stars.
 */
export function EpisodeRatingStars({ rating, className, iconClassName }: EpisodeRatingStarsProps) {

    const clamped = Math.max(0, Math.min(10, rating))
    const fillPercent = (clamped / 10) * 100

    const baseRow = (
        <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
                <AiOutlineStar key={i} className={cn("text-base text-[--muted]", iconClassName)} aria-hidden />
            ))}
        </div>
    )

    const filledRow = (
        <div
            data-episode-rating-stars-filled
            className="absolute inset-0 overflow-hidden"
            style={{ width: `${fillPercent}%` }}
        >
            <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                    <AiFillStar key={i} className={cn("text-base text-amber-300 shrink-0", iconClassName)} aria-hidden />
                ))}
            </div>
        </div>
    )

    return (
        <span
            data-episode-rating-stars
            className={cn("relative inline-flex align-middle", className)}
            title={`${clamped.toFixed(1)}/10`}
        >
            {baseRow}
            {filledRow}
        </span>
    )

}
