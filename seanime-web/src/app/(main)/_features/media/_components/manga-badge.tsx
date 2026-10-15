"use client"

import { MangaBadgeState, useMangaBadgeState } from "@/app/(main)/_atoms/manga-badges.atoms"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { IoLibrarySharp } from "react-icons/io5"
import { LuSparkles } from "react-icons/lu"

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
        // The brand color — the wallpaper's own accent — rather than orange: "in your library" is
        // the good outcome, and the good outcome is the one the app paints in its brand. The text
        // over it is near-white for legibility over the solid fill.
        overlayClass: "bg-brand text-white",
        pillClass: "text-brand-300 bg-brand bg-opacity-10 border-brand border-opacity-40",
        compactClass: "text-brand-300 border-brand/30",
        icon: MangaMatchedIcon,
    },
}

/** A warm addon label that stays distinct from the download-state badge. */
const SYNTHETIC_CLASS = "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-black/20"

export type MangaBadgeProps = {
    mediaId: number | null | undefined
    inLibrary?: boolean
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
    const { mediaId, inLibrary = false, variant = "badge", size = "sm", hideSyntheticTag = false, className } = props

    const { state, isSynthetic } = useMangaBadgeState(mediaId)
    const showSynthetic = isSynthetic && !hideSyntheticTag
    const showInLibrary = inLibrary && state !== "downloading"

    if (!state && !showSynthetic && !showInLibrary) return null

    const presentation = state ? STATE_PRESENTATION[state] : null
    const badgePresentation = showInLibrary ? STATE_PRESENTATION.matched : presentation
    const badgeLabel = showInLibrary ? "In library" : presentation?.label
    const Icon = badgePresentation?.icon

    if (variant === "overlay") {
        return (
            <div
                data-manga-badge-overlay
                data-badge-state={showInLibrary ? "in-library" : state ?? "none"}
                data-synthetic={showSynthetic || undefined}
                // Above the card's own layers — the bottom gradient sits at z-5 and the
                // adult-content blur at z-3, so anything lower gets painted over.
                className={cn("absolute z-[15] left-0 top-0 flex items-start pointer-events-none", className)}
            >
                {badgePresentation && Icon && (
                    <Badge
                        size="xl"
                        intent="primary-solid"
                        title={badgeLabel}
                        aria-label={badgeLabel}
                        className={cn("rounded-[--radius] rounded-bl-none rounded-tr-none", badgePresentation.overlayClass)}
                    >
                        <Icon className="h-5 w-5" />
                        {showInLibrary && <span>In library</span>}
                    </Badge>
                )}
                {showSynthetic && (
                    <span
                        data-manga-synthetic-tag
                        title="Synthetic — described locally rather than from AniList"
                        className={cn(
                            "inline-flex h-8 items-center gap-1.5 border-l border-white/25 px-2.5 text-[10px] font-bold uppercase tracking-[0.12em]",
                            badgePresentation ? "rounded-br" : "rounded-bl-none rounded-br rounded-tr-none rounded-tl-[--radius]",
                            SYNTHETIC_CLASS,
                        )}
                    >
                        <LuSparkles className="size-3.5 shrink-0" aria-hidden="true" />
                        Synthetic
                    </span>
                )}
            </div>
        )
    }

    if (variant === "compact") {
        return (
            <span data-manga-badge-compact className={cn("inline-flex items-center gap-1", className)}>
                {badgePresentation && Icon && (
                    <span
                        data-badge-state={showInLibrary ? "in-library" : state}
                        title={badgeLabel}
                        aria-label={badgeLabel}
                        className={cn(
                            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] uppercase tracking-wider font-medium",
                            "bg-black/40 backdrop-blur-sm border",
                            badgePresentation.compactClass,
                        )}
                    >
                        <Icon className="h-3 w-3" /> {badgeLabel}
                    </span>
                )}
                {showSynthetic && (
                    <span
                        data-manga-synthetic-tag
                        className={cn(
                            "inline-flex items-center gap-1 rounded-sm border border-amber-300/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                            SYNTHETIC_CLASS,
                        )}
                    >
                        <LuSparkles className="size-3" aria-hidden="true" />
                        Synthetic
                    </span>
                )}
            </span>
        )
    }

    return (
        <span data-manga-badge className={cn("inline-flex items-center gap-2", className)}>
            {badgePresentation && Icon && (
                <Badge
                    data-badge-state={showInLibrary ? "in-library" : state}
                    size={size === "lg" ? "lg" : "md"}
                    intent="unstyled"
                    leftIcon={<Icon />}
                    iconSpacing="0.35rem"
                    className={badgePresentation.pillClass}
                >
                    {badgeLabel}
                </Badge>
            )}
            {showSynthetic && (
                <Badge
                    data-manga-synthetic-tag
                    size={size === "lg" ? "lg" : "md"}
                    intent="unstyled"
                    leftIcon={<LuSparkles />}
                    iconSpacing="0.35rem"
                    className="border-amber-400/40 bg-gradient-to-r from-amber-500/15 to-orange-500/15 text-amber-200"
                >
                    Synthetic
                </Badge>
            )}
        </span>
    )
}
