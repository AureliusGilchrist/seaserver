"use client"

import { useDownloadingAnime } from "@/app/(main)/_atoms/downloading.atoms"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { LuDownload } from "react-icons/lu"

/**
 * Whether this anime has a download in flight — either one this session queued, or one the
 * server still reports as unfinished. See `downloading.atoms`.
 */
export function useIsAnimeDownloading(mediaId: number | null | undefined): boolean {
    const { isDownloading } = useDownloadingAnime()
    if (!mediaId) return false
    return isDownloading(mediaId)
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
 * Deliberately the same language everywhere it appears — pulsing download arrow, "Downloading" —
 * so the meaning carries across the card grid, the entry page and the episode carousels.
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
                <Badge
                    size="xl"
                    intent="primary-solid"
                    className="rounded-[--radius] rounded-bl-none rounded-tr-none text-white animate-pulse"
                >
                    <LuDownload className="mr-1" /> Downloading
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
                    "bg-black/40 text-brand-300 backdrop-blur-sm border border-brand-300/20 animate-pulse",
                    className,
                )}
            >
                <LuDownload className="text-[11px]" /> Downloading
            </span>
        )
    }

    return (
        <Badge
            data-anime-downloading-badge
            size={size === "lg" ? "lg" : "md"}
            intent="primary"
            leftIcon={<LuDownload />}
            className={cn("animate-pulse", className)}
        >
            Downloading
        </Badge>
    )
}
