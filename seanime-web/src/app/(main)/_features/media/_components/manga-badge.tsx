"use client"

import { MangaBadgeState, useMangaBadgeState } from "@/app/(main)/_atoms/manga-badges.atoms"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { IoLibrarySharp } from "react-icons/io5"

/**
 * The manga counterpart of AnimeDownloadingBadge, drawn to match it: same corner, same shapes, same
 * three colours, so a manga card and an anime card side by side read the same way.
 *
 * Purple is moving, orange is yours and known, grey is on disk. The synthetic tag rides alongside
 * whichever of them applies rather than replacing it — a local series can perfectly well be
 * downloading, and saying only one of those things would be losing the other.
 */

/** The downloading mark: chevrons dropping onto the shelf they land on. Matches the anime icon. */
function MangaDownloadingIcon(props: { className?: string }) {
    return (
        <svg
            data-manga-downloading-icon
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

/** On disk: the box, landed on the shelf. The same object as the icon above, one state later. */
function MangaDownloadedIcon(props: { className?: string }) {
    return (
        <svg
            data-manga-downloaded-icon
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={cn("h-[1.05em] w-[1.05em]", props.className)}
        >
            <rect x="6.5" y="8" width="11" height="8" rx="1.4" />
            <path d="M5 19.5h14" strokeWidth={2.6} />
        </svg>
    )
}

/** The end of the progression: the library knows what this is. */
function MangaMatchedIcon(props: { className?: string }) {
    return <IoLibrarySharp data-manga-matched-icon className={props.className} aria-hidden="true" />
}

const STATE_PRESENTATION: Record<MangaBadgeState, {
    label: string
    overlayClass: string
    pillClass: string
    compactClass: string
    icon: (props: { className?: string }) => React.ReactElement
}> = {
    downloading: {
        label: "Downloading",
        overlayClass: "bg-purple-500 text-white",
        pillClass: "text-purple-300 bg-purple-500 bg-opacity-10 border-purple-500 border-opacity-40",
        compactClass: "text-purple-300 border-purple-400/30",
        icon: MangaDownloadingIcon,
    },
    downloaded: {
        label: "Downloaded",
        overlayClass: "bg-gray-400 text-gray-950",
        pillClass: "text-gray-300 bg-gray-500 bg-opacity-10 border-gray-400 border-opacity-40",
        compactClass: "text-gray-200 border-gray-300/30",
        icon: MangaDownloadedIcon,
    },
    matched: {
        label: "Matched",
        overlayClass: "bg-orange-300 text-orange-900",
        pillClass: "text-orange-300 bg-orange-500 bg-opacity-10 border-orange-500 border-opacity-40",
        compactClass: "text-orange-300 border-orange-400/30",
        icon: MangaMatchedIcon,
    },
}

/** The synthetic tag's own colour, kept away from the three state colours so it reads as a note. */
const SYNTHETIC_CLASS = "bg-amber-600/90 text-white"

export type MangaBadgeProps = {
    mediaId: number | null | undefined
    /**
     * "badge" is the pill used in prose-like rows (entry page).
     * "compact" is the smaller marker used over artwork.
     * "overlay" is the corner flag pinned to the top-left of cover art.
     */
    variant?: "badge" | "compact" | "overlay"
    size?: "sm" | "lg"
    /** Drops the synthetic tag, for places where the distinction is already made some other way. */
    hideSyntheticTag?: boolean
    className?: string
}

/**
 * Marks a manga with the state of its files. Renders nothing when there is nothing to say, so it can
 * be dropped anywhere a manga is shown without the caller checking first.
 */
export function MangaBadge(props: MangaBadgeProps) {
    const { mediaId, variant = "badge", size = "sm", hideSyntheticTag = false, className } = props

    const { state, isSynthetic } = useMangaBadgeState(mediaId)
    const showSynthetic = isSynthetic && !hideSyntheticTag

    if (!state && !showSynthetic) return null

    const presentation = state ? STATE_PRESENTATION[state] : null
    const Icon = presentation?.icon

    if (variant === "overlay") {
        return (
            <div
                data-manga-badge-overlay
                data-badge-state={state ?? "none"}
                data-synthetic={showSynthetic || undefined}
                // Above the card's own layers — the bottom gradient sits at z-5 and the
                // adult-content blur at z-3, so anything lower gets painted over.
                className={cn("absolute z-[15] left-0 top-0 flex items-start pointer-events-none", className)}
            >
                {presentation && Icon && (
                    <Badge
                        size="xl"
                        intent="primary-solid"
                        title={presentation.label}
                        aria-label={presentation.label}
                        className={cn("rounded-[--radius] rounded-bl-none rounded-tr-none", presentation.overlayClass)}
                    >
                        <Icon className="h-5 w-5" />
                    </Badge>
                )}
                {showSynthetic && (
                    <span
                        data-manga-synthetic-tag
                        title="Synthetic — described locally rather than from AniList"
                        className={cn(
                            "px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
                            // Square where it meets the state badge, so the two read as one mark.
                            presentation ? "rounded-br" : "rounded-br rounded-tl-[--radius]",
                            SYNTHETIC_CLASS,
                        )}
                    >
                        Synthetic
                    </span>
                )}
            </div>
        )
    }

    if (variant === "compact") {
        return (
            <span data-manga-badge-compact className={cn("inline-flex items-center gap-1", className)}>
                {presentation && Icon && (
                    <span
                        data-badge-state={state}
                        title={presentation.label}
                        aria-label={presentation.label}
                        className={cn(
                            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] uppercase tracking-wider font-medium",
                            "bg-black/40 backdrop-blur-sm border",
                            presentation.compactClass,
                        )}
                    >
                        <Icon className="h-3 w-3" /> {presentation.label}
                    </span>
                )}
                {showSynthetic && (
                    <span
                        data-manga-synthetic-tag
                        className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] uppercase tracking-wider font-medium bg-amber-600/90 text-white"
                    >
                        Synthetic
                    </span>
                )}
            </span>
        )
    }

    return (
        <span data-manga-badge className={cn("inline-flex items-center gap-2", className)}>
            {presentation && Icon && (
                <Badge
                    data-badge-state={state}
                    size={size === "lg" ? "lg" : "md"}
                    intent="unstyled"
                    leftIcon={<Icon />}
                    iconSpacing="0.35rem"
                    className={presentation.pillClass}
                >
                    {presentation.label}
                </Badge>
            )}
            {showSynthetic && (
                <Badge
                    data-manga-synthetic-tag
                    size={size === "lg" ? "lg" : "md"}
                    intent="unstyled"
                    className="text-amber-300 bg-amber-500 bg-opacity-10 border-amber-500 border-opacity-40"
                >
                    Synthetic
                </Badge>
            )}
        </span>
    )
}
