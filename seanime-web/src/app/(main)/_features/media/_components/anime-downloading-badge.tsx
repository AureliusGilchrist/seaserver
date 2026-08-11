"use client"

import { useDownloadingAnime } from "@/app/(main)/_atoms/downloading.atoms"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/components/ui/core/styling"
import React from "react"

/**
 * Whether this anime has a download in flight — either one this session queued, or one the
 * server still reports as unfinished. See `downloading.atoms`.
 */
export function useIsAnimeDownloading(mediaId: number | null | undefined): boolean {
    const { isDownloading } = useDownloadingAnime()
    if (!mediaId) return false
    return isDownloading(mediaId)
}

/**
 * The downloading mark: two chevrons dropping one after the other onto the shelf they land on.
 *
 * Drawn here rather than taken from an icon set so it reads as the counterpart to the library
 * badge's shelf — the same object, one state earlier — and so the fall can be animated. The
 * chevrons pulse out of phase, which is what makes the badge look like something in progress
 * without the whole badge blinking.
 */
export function AnimeDownloadingIcon(props: { className?: string }) {
    return (
        <svg
            data-anime-downloading-icon
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={cn("h-[1.05em] w-[1.05em]", props.className)}
        >
            <path d="M7.5 4.5 12 9l4.5-4.5" className="animate-pulse" />
            <path d="M7.5 10.5 12 15l4.5-4.5" className="animate-pulse" style={{ animationDelay: "400ms" }} />
            <path d="M5 19.5h14" strokeWidth={2.6} />
        </svg>
    )
}

export type AnimeDownloadingBadgeProps = {
    mediaId: number | null | undefined
    /**
     * "badge" is the pill used in prose-like rows (entry page, preview modal).
     * "compact" is the smaller corner marker used over artwork, like an episode card.
     * "overlay" is the corner flag pinned to the top-left of cover art.
     */
    variant?: "badge" | "compact" | "overlay"
    size?: "sm" | "lg"
    className?: string
}

/**
 * Marks an anime as still downloading. Renders nothing when it isn't, so it can be dropped
 * anywhere an anime is shown without the caller checking first.
 *
 * Purple everywhere it appears, against the orange of the library badge it replaces: on a card the
 * two occupy the same corner and are mutually exclusive, so the colour alone says whether a series
 * is still coming or already yours.
 */
export function AnimeDownloadingBadge(props: AnimeDownloadingBadgeProps) {
    const { mediaId, variant = "badge", size = "sm", className } = props

    const isDownloading = useIsAnimeDownloading(mediaId)
    if (!isDownloading) return null

    if (variant === "overlay") {
        return (
            <div
                data-anime-downloading-overlay-badge
                // Above the card's own layers — the bottom gradient sits at z-5, the adult-content
                // blur at z-3 and a playing trailer at z-14, so anything lower gets painted over.
                className={cn("absolute z-[15] left-0 top-0 pointer-events-none", className)}
            >
                {/* Deliberately the same shape, size and corner as the library badge it stands in
                 for, so a card only ever reads as one or the other. */}
                <Badge
                    size="xl"
                    intent="primary-solid"
                    title="Downloading"
                    aria-label="Downloading"
                    className="rounded-[--radius] rounded-bl-none rounded-tr-none bg-purple-500 text-white"
                >
                    <AnimeDownloadingIcon className="h-5 w-5" />
                </Badge>
            </div>
        )
    }

    if (variant === "compact") {
        return (
            <span
                data-anime-downloading-indicator
                title="Downloading"
                aria-label="Downloading"
                className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] uppercase tracking-wider font-medium",
                    "bg-black/40 text-purple-300 backdrop-blur-sm border border-purple-400/30",
                    className,
                )}
            >
                <AnimeDownloadingIcon className="h-3 w-3" /> Downloading
            </span>
        )
    }

    return (
        <Badge
            data-anime-downloading-badge
            size={size === "lg" ? "lg" : "md"}
            intent="unstyled"
            leftIcon={<AnimeDownloadingIcon />}
            iconSpacing="0.35rem"
            className={cn("text-purple-300 bg-purple-500 bg-opacity-10 border-purple-500 border-opacity-40", className)}
        >
            Downloading
        </Badge>
    )
}
