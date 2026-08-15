"use client"
import { AL_BaseAnime } from "@/api/generated/types"
import { FamilyEntry } from "@/api/hooks/unmatched.hooks"
import { useFamilyWalk } from "@/app/(main)/unmatched/_lib/use-family-walk"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { LuChevronDown, LuChevronRight, LuLoader } from "react-icons/lu"

/**
 * One search result, and its whole franchise underneath it.
 *
 * The old picker had two lists that did not know about each other: a search that reached all of
 * AniList but only twenty rows deep, and a family tree with the whole franchise but its own way of
 * being selected from. Two selection paths, two sources of truth, and the bug everybody hit — the
 * confirmation naming a series nobody picked — lived in the gap between them.
 *
 * Here there is one list and one way to pick from it. A result is a row; expanding it walks its
 * relations and nests them underneath, indented by how many relations deep they are; and every row,
 * root or descendant, selects through exactly the same callback. Nothing walks until a result is
 * expanded, so a hundred results cost a hundred rows rather than a hundred franchise walks.
 */

const RELATION_COLORS: Record<string, string> = {
    SEQUEL: "text-blue-400",
    PREQUEL: "text-cyan-400",
    SIDE_STORY: "text-purple-400",
    PARENT: "text-amber-400",
    ALTERNATIVE: "text-pink-400",
    SPIN_OFF: "text-emerald-400",
    SUMMARY: "text-gray-400",
    CHARACTER: "text-gray-500",
    OTHER: "text-gray-500",
}

export type FamilySelection = {
    id: number
    title: string
    englishTitle?: string
    format?: string
    episodes?: number
    coverImage?: string
}

export function UnmatchedFamilyResult({ anime, selectedId, onSelect, isInLibrary }: {
    anime: AL_BaseAnime
    selectedId: number | null
    /** Called with whichever row was clicked — the result itself or any relative under it. */
    onSelect: (selection: FamilySelection) => void
    isInLibrary?: boolean
}) {
    const [expanded, setExpanded] = React.useState(false)
    const { nodes, remaining, isWalking, start } = useFamilyWalk()

    const toggle = React.useCallback(() => {
        setExpanded(prev => {
            // Walked once, the first time it is opened. Closing and reopening shows what was found
            // rather than asking AniList the same questions again.
            if (!prev && nodes.length === 0) start(anime.id)
            return !prev
        })
    }, [anime.id, nodes.length, start])

    const title = anime.title?.userPreferred || anime.title?.romaji || anime.title?.english || `#${anime.id}`
    const cover = anime.coverImage?.large || anime.coverImage?.extraLarge || anime.coverImage?.medium || ""

    return (
        <div
            className={cn(
                "rounded-[--radius-md] overflow-hidden transition-colors",
                "border bg-gray-950/40",
                selectedId === anime.id || expanded
                    ? "border-gray-700"
                    : "border-gray-800/80 hover:border-gray-700",
            )}
            data-unmatched-family-result
        >
            <FamilyRow
                title={title}
                subtitle={anime.title?.english && anime.title.english !== title ? anime.title.english : undefined}
                cover={cover}
                format={anime.format || undefined}
                episodes={anime.episodes || undefined}
                year={anime.startDate?.year || undefined}
                status={anime.status || undefined}
                score={anime.meanScore || undefined}
                depth={0}
                selected={selectedId === anime.id}
                badge={isInLibrary ? "In Library" : undefined}
                expandable
                expanded={expanded}
                onToggle={toggle}
                onSelect={() => onSelect({
                    id: anime.id,
                    title,
                    englishTitle: anime.title?.english || undefined,
                    format: anime.format || undefined,
                    episodes: anime.episodes || undefined,
                    coverImage: cover,
                })}
            />

            {expanded && (
                <div className="border-t border-gray-800/80 bg-black/20">
                    {nodes.length === 0 && isWalking && (
                        <p className="px-4 py-3 text-xs text-[--muted] flex items-center gap-2">
                            <LuLoader className="w-3.5 h-3.5 animate-spin" /> Looking for related entries…
                        </p>
                    )}
                    {nodes.length === 0 && !isWalking && (
                        <p className="px-4 py-3 text-xs text-[--muted]">No related entries.</p>
                    )}

                    {/* The root of the walk is this same anime, so it is skipped — it is the row
                        above. Everything else nests under it. */}
                    {nodes.filter(node => node.entry.id !== anime.id).map(node => (
                        <FamilyRow
                            key={node.entry.id}
                            title={node.entry.title}
                            subtitle={node.entry.englishTitle}
                            cover={node.entry.coverImage}
                            format={node.entry.format}
                            episodes={node.entry.episodes}
                            year={node.entry.seasonYear}
                            season={node.entry.season}
                            status={node.entry.status}
                            score={node.entry.meanScore}
                            relation={node.entry.relationType}
                            depth={node.depth}
                            pending={node.pending}
                            selected={selectedId === node.entry.id}
                            onSelect={() => onSelect({
                                id: node.entry.id,
                                title: node.entry.title,
                                englishTitle: node.entry.englishTitle,
                                format: node.entry.format,
                                episodes: node.entry.episodes,
                                coverImage: node.entry.coverImage,
                            })}
                        />
                    ))}

                    {isWalking && nodes.length > 0 && (
                        <div className="px-4 py-2 space-y-1.5">
                            <p className="text-[10px] text-[--muted] flex items-center gap-1.5">
                                <LuLoader className="w-2.5 h-2.5 animate-spin" />
                                still branching out — {remaining} to go
                            </p>
                            {/* Measured against everything found so far, which is honest about what
                                a relation walk is: it does not know its own size until it ends. */}
                            <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                                <div
                                    className="h-full rounded-full bg-brand-500/80 transition-all duration-300"
                                    style={{ width: `${Math.round(100 * Math.max(nodes.length - remaining, 0) / Math.max(nodes.length, 1))}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function FamilyRow({
    title, subtitle, cover, format, episodes, year, season, status, score, relation,
    depth, pending, selected, badge, expandable, expanded, onToggle, onSelect,
}: {
    title: string
    subtitle?: string
    cover?: string
    format?: string
    episodes?: number
    year?: number
    season?: string
    status?: string
    score?: number
    relation?: string
    depth: number
    pending?: boolean
    selected: boolean
    badge?: string
    expandable?: boolean
    expanded?: boolean
    onToggle?: () => void
    onSelect: () => void
}) {
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onSelect()
                }
            }}
            className={cn(
                "group/row relative flex items-center gap-3 py-2 pr-3 cursor-pointer",
                "transition-all duration-150",
                selected
                    ? "bg-brand-500/10 ring-1 ring-inset ring-brand-500/70"
                    : "hover:bg-white/[0.04]",
                // A relative sits quieter than the result it hangs off, and lifts on hover — so the
                // eye lands on the franchise first and the branch second.
                depth > 0 && !selected && "opacity-80 hover:opacity-100",
            )}
            // Indented by relation depth: a sequel of a sequel sits two steps in, so the shape of
            // the franchise is readable without opening anything.
            style={{ paddingLeft: `${10 + depth * 22}px` }}
            data-unmatched-family-row
            data-depth={depth}
        >
            {/* The guide rail. One hairline per level of depth, so a long branch stays attached to
                the thing it descends from instead of floating in whitespace. */}
            {Array.from({ length: depth }).map((_, level) => (
                <span
                    key={level}
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 w-px bg-white/[0.07]"
                    style={{ left: `${18 + level * 22}px` }}
                />
            ))}

            {expandable ? (
                <button
                    onClick={e => {
                        e.stopPropagation()
                        onToggle?.()
                    }}
                    className="p-0.5 flex-shrink-0 text-[--muted] hover:text-white"
                    aria-label={expanded ? "Hide related entries" : "Show related entries"}
                >
                    {expanded ? <LuChevronDown className="w-4 h-4" /> : <LuChevronRight className="w-4 h-4" />}
                </button>
            ) : (
                <span className="w-5 flex-shrink-0" />
            )}

            {cover
                ? <img
                    src={cover}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={cn(
                        "flex-shrink-0 rounded-[--radius] object-cover ring-1 ring-white/10 shadow-sm",
                        "transition-transform duration-150 group-hover/row:scale-[1.04]",
                        // The franchise itself gets a larger poster than its relatives. Size is the
                        // cheapest way to say which row is the heading and which are under it.
                        depth === 0 ? "h-14 w-10" : "h-11 w-8",
                    )}
                />
                : <span className={cn(
                    "flex-shrink-0 rounded-[--radius] bg-gray-800/80 ring-1 ring-white/5",
                    depth === 0 ? "h-14 w-10" : "h-11 w-8",
                )} />}

            <span className="flex-1 min-w-0 space-y-0.5">
                <span className={cn(
                    "block leading-snug line-clamp-2 break-words",
                    depth === 0 ? "text-sm font-medium text-white" : "text-[13px] text-gray-200",
                )}>
                    {title}
                </span>
                {subtitle && <span className="block truncate text-[11px] text-[--muted]">{subtitle}</span>}
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-[--muted]">
                    {format && (
                        <span className="px-1.5 py-px rounded-full bg-white/[0.06] text-gray-300 font-medium tracking-wide">
                            {format}
                        </span>
                    )}
                    {year ? <span>{season ? `${season[0]}${season.slice(1).toLowerCase()} ` : ""}{year}</span> : null}
                    {status && (
                        <span className={cn(
                            status === "FINISHED" && "text-emerald-400/90",
                            status === "RELEASING" && "text-sky-400/90",
                            status === "NOT_YET_RELEASED" && "text-amber-400/90",
                        )}>
                            {status.replace(/_/g, " ").toLowerCase()}
                        </span>
                    )}
                    {episodes ? <span>· {episodes} ep{episodes === 1 ? "" : "s"}</span> : null}
                    {score ? <span className="text-amber-300/80">· ★ {score}%</span> : null}
                    {pending && (
                        <span className="inline-flex items-center gap-1 italic text-gray-500">
                            <LuLoader className="w-2.5 h-2.5 animate-spin" /> preparing
                        </span>
                    )}
                </span>
            </span>

            {badge && (
                <span className="text-[10px] px-2 py-1 rounded-full bg-white/[0.06] text-gray-300 flex-shrink-0 ring-1 ring-white/10">
                    {badge}
                </span>
            )}
            {relation && (
                <span className={cn(
                    "text-[10px] font-semibold uppercase tracking-wide flex-shrink-0",
                    RELATION_COLORS[relation] || "text-gray-400",
                )}>
                    {relation.replace(/_/g, " ")}
                </span>
            )}

            {/* The selected row says so in words as well as colour — the ring alone reads as a hover
                state at a glance, and this is the decision the whole modal is about. */}
            {selected && (
                <span className="text-[10px] font-semibold text-brand-300 flex-shrink-0">SELECTED</span>
            )}
        </div>
    )
}
