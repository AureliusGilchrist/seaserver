"use client"

import { AnimeDownloadState, useDownloadingAnime } from "@/app/(main)/_atoms/downloading.atoms"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { IoLibrarySharp } from "react-icons/io5"

/**
 * Which of the three badges this anime gets, or none.
 *
 * Downloading, then downloaded, then matched — one progression, one badge at a time, and never two
 * on the same card. The decision is made here and only here: it used to be split between this
 * module and the card, which could and did disagree, so a card showing "you have this" while the
 * series was in fact still coming down was a matter of which component happened to be asked.
 *
 * Every state is the server's durable record (see `downloading.atoms`), so all three survive a
 * reload, a server restart and a torrent client restart, and all three look the same on every
 * account. None of them is on a timer.
 */
export function useAnimeDownloadState(mediaId: number | null | undefined): AnimeDownloadState | null {
    const { getDownloadState } = useDownloadingAnime()
    return getDownloadState(mediaId)
}

/**
 * Whether this anime has a download in flight — either one this session queued, or one the
 * server still reports as unfinished.
 */
export function useIsAnimeDownloading(mediaId: number | null | undefined): boolean {
    return useAnimeDownloadState(mediaId) === "downloading"
}

/**
 * Whether this anime has a download that has finished and is sitting in the staging area, waiting
 * to be filed into the library.
 *
 * A distinct state from downloading, and the one that used to be invisible: the download is done,
 * nothing is in flight, and yet the series is not in the library either — it is waiting on you.
 */
export function useIsAnimeAwaitingMatch(mediaId: number | null | undefined): boolean {
    return useAnimeDownloadState(mediaId) === "downloaded"
}

/**
 * Whether this anime's download has been filed into the library, by the auto-matcher or by hand.
 */
export function useIsAnimeMatched(mediaId: number | null | undefined): boolean {
    return useAnimeDownloadState(mediaId) === "matched"
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
 * Drawn here rather than taken from an icon set so it reads as the counterpart to the matched
 * badge's shelf — the same object, two states earlier — and so the fall can be animated. The
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

/** The end of the progression: on the shelf, in the library. The badge this app has always used. */
export function AnimeMatchedIcon(props: { className?: string }) {
    return <IoLibrarySharp data-anime-matched-icon className={props.className} aria-hidden="true" />
}

/**
 * What each state looks like and what it is called, in one place so the three variants below cannot
 * drift apart from each other.
 *
 * The colours are the whole vocabulary of the card corner: purple is moving, grey is done and
 * waiting on you, orange is yours. Two cards side by side are readable without reading a word.
 */
const STATE_PRESENTATION: Record<AnimeDownloadState, {
    label: string
    /** The corner flag on cover art. */
    overlayClass: string
    /** The pill used in prose-like rows. */
    pillClass: string
    /** The small marker used over artwork. */
    compactClass: string
    icon: (props: { className?: string }) => React.ReactElement
}> = {
    downloading: {
        label: "Downloading",
        overlayClass: "bg-purple-500 text-white",
        pillClass: "text-purple-300 bg-purple-500 bg-opacity-10 border-purple-500 border-opacity-40",
        compactClass: "text-purple-300 border-purple-400/30",
        icon: AnimeDownloadingIcon,
    },
    downloaded: {
        label: "Downloaded",
        overlayClass: "bg-gray-400 text-gray-950",
        pillClass: "text-gray-300 bg-gray-500 bg-opacity-10 border-gray-400 border-opacity-40",
        compactClass: "text-gray-200 border-gray-300/30",
        icon: AnimeAwaitingMatchIcon,
    },
    matched: {
        label: "Matched",
        overlayClass: "bg-orange-300 text-orange-900",
        pillClass: "text-orange-300 bg-orange-500 bg-opacity-10 border-orange-500 border-opacity-40",
        compactClass: "text-orange-300 border-orange-400/30",
        icon: AnimeMatchedIcon,
    },
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
 * Marks an anime with the state of its download. Renders nothing when there is no download to speak
 * of, so it can be dropped anywhere an anime is shown without the caller checking first.
 */
export function AnimeDownloadingBadge(props: AnimeDownloadingBadgeProps) {
    const { mediaId, variant = "badge", size = "sm", className } = props

    const state = useAnimeDownloadState(mediaId)
    if (!state) return null

    const { label, overlayClass, pillClass, compactClass, icon: Icon } = STATE_PRESENTATION[state]

    if (variant === "overlay") {
        return (
            <div
                data-anime-downloading-overlay-badge
                data-download-state={state}
                // Above the card's own layers — the bottom gradient sits at z-5, the adult-content
                // blur at z-3 and a playing trailer at z-14, so anything lower gets painted over.
                className={cn("absolute z-[15] left-0 top-0 pointer-events-none", className)}
            >
                {/* One shape, one corner, three colours: a card reads as exactly one state. */}
                <Badge
                    size="xl"
                    intent="primary-solid"
                    title={label}
                    aria-label={label}
                    className={cn("rounded-[--radius] rounded-bl-none rounded-tr-none", overlayClass)}
                >
                    <Icon className="h-5 w-5" />
                </Badge>
            </div>
        )
    }

    if (variant === "compact") {
        return (
            <span
                data-anime-downloading-indicator
                data-download-state={state}
                title={label}
                aria-label={label}
                className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] uppercase tracking-wider font-medium",
                    "bg-black/40 backdrop-blur-sm border",
                    compactClass,
                    className,
                )}
            >
                <Icon className="h-3 w-3" /> {label}
            </span>
        )
    }

    return (
        <Badge
            data-anime-downloading-badge
            data-download-state={state}
            size={size === "lg" ? "lg" : "md"}
            intent="unstyled"
            leftIcon={<Icon />}
            iconSpacing="0.35rem"
            className={cn(pillClass, className)}
        >
            {label}
        </Badge>
    )
}
