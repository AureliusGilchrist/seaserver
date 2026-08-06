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
     */
    variant?: "badge" | "compact"
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
