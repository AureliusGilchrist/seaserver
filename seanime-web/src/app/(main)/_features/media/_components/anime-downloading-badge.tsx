"use client"

import { serverFinishedAnimeIdsAtom, useDownloadingAnime } from "@/app/(main)/_atoms/downloading.atoms"
import { useAtomValue } from "jotai"
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
 * Whether this anime has a download that has finished on the torrent client and is sitting in
 * Unmatched, waiting to be filed into the library.
 *
 * A distinct state from downloading, and the one that used to be invisible: the download is done,
 * nothing is in flight, and yet the series is not in the library either — it is waiting on you.
 * Shown neutral white rather than purple, because nothing is in progress any more.
 *
 * Read from the same poll that drives the downloading badge, so a page full of cards costs no extra
 * requests at all — and, like that one, it is the server's live answer rather than anything kept on
 * this side that could go stale.
 */
export function useIsAnimeAwaitingMatch(mediaId: number | null | undefined): boolean {
    const finished = useAtomValue(serverFinishedAnimeIdsAtom)
    if (!mediaId) return false
    return finished.has(mediaId)
}

/**
 * The waiting-to-be-matched mark: the same shelf the downloading chevrons fall onto, with the thing
 * that fell now resting on it.
 *
 * Deliberately the sibling of the icon below rather than a different object — it is the next state
 * of the same one — and deliberately still: nothing is happening, which is the whole point of it.
 */
export function AnimeAwaitingMatchIcon(props: { className?: string }) {
    return (
        <svg
            data-anime-awaiting-match-icon
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={cn("h-[1.05em] w-[1.05em]", props.className)}
        >
            {/* The box, landed. */}
            <rect x="6.5" y="8" width="11" height="8" rx="1.4" />
            {/* The shelf it landed on, same line as the downloading icon's. */}
            <path d="M5 19.5h14" strokeWidth={2.6} />
        </svg>
    )
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
    const isAwaitingMatch = useIsAnimeAwaitingMatch(mediaId)

    // Downloading wins: while anything is still coming, that is the more useful thing to say.
    const awaiting = !isDownloading && isAwaitingMatch
    if (!isDownloading && !awaiting) return null

    const icon = awaiting ? <AnimeAwaitingMatchIcon /> : <AnimeDownloadingIcon />
    const label = awaiting ? "Ready to match" : "Downloading"

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
                    title={label}
                    aria-label={label}
                    className={cn(
                        "rounded-[--radius] rounded-bl-none rounded-tr-none text-white",
                        // Neutral white for "done, waiting on you"; purple only while it is moving.
                        awaiting ? "bg-white text-gray-900" : "bg-purple-500",
                    )}
                >
                    {awaiting ? <AnimeAwaitingMatchIcon className="h-5 w-5" /> : <AnimeDownloadingIcon className="h-5 w-5" />}
                </Badge>
            </div>
        )
    }

    if (variant === "compact") {
        return (
            <span
                data-anime-downloading-indicator
                title={label}
                aria-label={label}
                className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] uppercase tracking-wider font-medium",
                    "bg-black/40 backdrop-blur-sm border",
                    awaiting
                        ? "text-white border-white/40"
                        : "text-purple-300 border-purple-400/30",
                    className,
                )}
            >
                {awaiting ? <AnimeAwaitingMatchIcon className="h-3 w-3" /> : <AnimeDownloadingIcon className="h-3 w-3" />} {label}
            </span>
        )
    }

    return (
        <Badge
            data-anime-downloading-badge
            size={size === "lg" ? "lg" : "md"}
            intent="unstyled"
            leftIcon={icon}
            iconSpacing="0.35rem"
            className={cn(
                awaiting
                    ? "text-white bg-white bg-opacity-10 border-white border-opacity-40"
                    : "text-purple-300 bg-purple-500 bg-opacity-10 border-purple-500 border-opacity-40",
                className,
            )}
        >
            {label}
        </Badge>
    )
}
