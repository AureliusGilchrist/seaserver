import { EnqueueFuture_Item } from "@/api/generated/types"
import { ENQUEUE_FUTURE_STATUS } from "@/api/hooks/enqueue_future.hooks"
import { EnqueueFutureItemActions } from "@/app/(main)/enqueue-future/_components/enqueue-future-item-actions"
import { AnimeDownloadingIcon, useIsAnimeDownloading } from "@/app/(main)/_features/media/_components/anime-downloading-badge"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { LuBan, LuCheck, LuCircleAlert, LuLink2, LuLoader, LuSkipForward } from "react-icons/lu"

export type EnqueueFutureFamily = EnqueueFuture_Item[]

/**
 * Gathers a franchise into one bundle wherever its members turn up, and draws a spine around it.
 *
 * A family is placed at its *earliest* member — the slot that franchise already held — and every
 * later member is spliced up into it rather than left stranded further down. A season discovered
 * mid-run therefore joins its siblings instead of landing at the bottom of a list of hundreds, and a
 * row that was alone becomes a group the moment a relative shows up behind it.
 *
 * The cost is that splicing a member up pushes the rows between it and its family down by one. That
 * only happens on the poll that discovers a relative of something already queued, and only for rows
 * below the family's slot — everything above it, including the whole stretch you have already worked
 * through, is untouched.
 *
 * Degrouping is free: when the rest of a bundle is matched, skipped or ignored, the survivor is a
 * bundle of one, so it loses the spine and header and keeps the slot it already had.
 *
 * Each entry appears exactly once in the result, so flattening it is a reordering of the input and
 * never a duplication — which is what lets the list and Next/Previous agree on the same order.
 */
export function groupIntoFamilies(items: EnqueueFuture_Item[]): EnqueueFutureFamily[] {
    const families: EnqueueFutureFamily[] = []
    const byKey = new Map<number, EnqueueFutureFamily>()
    const seen = new Set<number>()
    for (const item of items) {
        // The same anime reaching here twice would otherwise be drawn twice and counted twice by the
        // header — the queue can carry a repeat while a run is writing to it.
        if (seen.has(item.mediaId)) continue
        seen.add(item.mediaId)

        const key = item.familyId || item.mediaId
        const family = byKey.get(key)
        if (family) {
            family.push(item)
        } else {
            const created = [item]
            byKey.set(key, created)
            families.push(created)
        }
    }
    return families
}

/**
 * The queue at a glance, so Next is not the only way to get somewhere. Jumping straight to an anime
 * you recognise is usually what you want after the first dozen.
 */
export function EnqueueFutureList({ families, activeMediaId, onSelect }: {
    families: EnqueueFutureFamily[]
    activeMediaId: number | undefined
    onSelect: (item: EnqueueFuture_Item) => void
}) {

    const activeRef = React.useRef<HTMLDivElement | null>(null)

    // Next can walk far past what is on screen, so keep the current one visible.
    React.useEffect(() => {
        activeRef.current?.scrollIntoView({ block: "nearest" })
    }, [activeMediaId])

    if (!families.length) return null

    return (
        <div className="rounded-[--radius-md] border bg-gray-950 max-h-[70vh] overflow-y-auto" data-enqueue-future-list>
            {families.map(family => (
                <FamilyBundle
                    // Keyed on the first entry rather than the family id, which is 0 for an anime
                    // with no relatives. Every entry appears exactly once, so this is unique.
                    key={family[0].mediaId}
                    family={family}
                    activeMediaId={activeMediaId}
                    onSelect={onSelect}
                    activeRef={activeRef}
                />
            ))}
        </div>
    )
}

/**
 * One franchise: a single anime drawn plainly, or a group drawn with a spine tying its seasons
 * together so it is obvious at a glance that they are the same story.
 *
 * The group header is a label and nothing more — deliberately not clickable and carrying no
 * actions. Every decision in this queue is made about one entry: a franchise is a thing to
 * recognise, not a thing to skip, ignore or download in one go.
 *
 * Memoised because the queue runs to hundreds of entries and the list re-renders on every step and
 * on every poll of a running job. Without this, moving to the next anime re-rendered every row in
 * the queue rather than the two that actually changed.
 */
const FamilyBundle = React.memo(function FamilyBundle({ family, activeMediaId, onSelect, activeRef }: {
    family: EnqueueFuture_Item[]
    activeMediaId: number | undefined
    onSelect: (item: EnqueueFuture_Item) => void
    activeRef: React.RefObject<HTMLDivElement | null>
}) {

    const isGroup = family.length > 1
    const containsActive = family.some(n => n.mediaId === activeMediaId)

    return (
        <div
            className={cn(
                "border-b last:border-b-0",
                isGroup && "bg-gray-900/40",
                isGroup && containsActive && "bg-gray-900/70",
            )}
            data-enqueue-future-family={isGroup ? "group" : "single"}
        >
            {isGroup && (
                <div className="flex items-center gap-1.5 px-2 pt-2 pb-1 text-xs uppercase tracking-wide text-[--muted]">
                    <LuLink2 className="flex-none" />
                    <span className="truncate">
                        {family.length} related — sequels &amp; side stories
                    </span>
                </div>
            )}

            <div className={cn(isGroup && "pl-2 border-l-2 border-[--brand] ml-2 mb-1")}>
                {family.map(item => {
                    const isActive = item.mediaId === activeMediaId
                    return (
                    // A div rather than a button: the row carries its own Skip and Ignore buttons,
                    // and a button inside a button is invalid markup that browsers resolve however
                    // they like. Role and key handling put the keyboard behaviour back.
                    <div
                        key={item.mediaId}
                        ref={isActive ? activeRef : undefined}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelect(item)}
                        onKeyDown={e => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                onSelect(item)
                            }
                        }}
                        className={cn(
                            "group/enqueue-future-row w-full flex items-center gap-3 p-2 text-left transition cursor-pointer",
                            "hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[--brand]",
                            isActive && "bg-gray-800",
                        )}
                        data-enqueue-future-list-item
                    >
                        <span className="relative flex-none">
                            {item.coverImage
                                ? <img
                                    src={item.coverImage}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    className="h-12 w-9 rounded-[--radius] object-cover block"
                                />
                                : <div className="h-12 w-9 rounded-[--radius] bg-gray-800" />}
                            <RowDownloadingMark mediaId={item.mediaId} />
                        </span>

                        <span className="flex-1 min-w-0">
                            <span className={cn("block truncate text-sm", isActive && "font-semibold")}>
                                {item.title || `#${item.mediaId}`}
                            </span>
                            <span className="block text-xs text-[--muted]">
                                <ItemStatusLabel item={item} />
                            </span>
                        </span>

                        <span className="flex items-center gap-1 flex-none">
                            <ItemStatusIcon item={item} />
                            {/* On the row itself, so passing on a show never means navigating to
                                it first. Hidden until the row is touched to keep a hundred covers
                                from turning into a wall of buttons. */}
                            <span className={cn(
                                "opacity-0 transition-opacity",
                                "group-hover/enqueue-future-row:opacity-100 focus-within:opacity-100",
                                isActive && "opacity-100",
                            )}>
                                <EnqueueFutureItemActions item={item} compact />
                            </span>
                        </span>
                    </div>
                    )
                })}
            </div>
        </div>
    )
})

/**
 * The downloading mark, pinned to the corner of the cover art.
 *
 * On the artwork rather than in the status line because it is true of the anime, not of the queue
 * row: an entry is normally taken off this list the moment you download it, so what this catches is
 * everything else — a download started from the anime page, from another device, or by the
 * auto-downloader, and the gap between pressing download here and the row leaving. Seeing it means
 * "you are already getting this", which is the one thing worth interrupting a cover for.
 *
 * A leaf of its own so that subscribing to the download state costs one row rather than the whole
 * bundle: FamilyBundle is memoised, and reading the atom in it would re-render every row it holds
 * on every poll.
 */
function RowDownloadingMark({ mediaId }: { mediaId: number }) {
    const isDownloading = useIsAnimeDownloading(mediaId)
    if (!isDownloading) return null

    return (
        <span
            data-enqueue-future-downloading-mark
            title="Downloading"
            aria-label="Downloading"
            className={cn(
                "absolute -bottom-1 -right-1 flex items-center justify-center h-4 w-4 rounded-full",
                // Purple and the same glyph as everywhere else downloads are marked, so it reads as
                // the same state here as it does on a card. The ring keeps it legible over artwork.
                "bg-purple-500 text-white ring-2 ring-gray-950",
            )}
        >
            <AnimeDownloadingIcon className="h-2.5 w-2.5" />
        </span>
    )
}

function ItemStatusLabel({ item }: { item: EnqueueFuture_Item }) {
    switch (item.status) {
        case ENQUEUE_FUTURE_STATUS.PENDING:
            return <>Waiting to be prepared</>
        case ENQUEUE_FUTURE_STATUS.PREPARING:
            return <>Preparing…</>
        case ENQUEUE_FUTURE_STATUS.NO_RESULTS:
            return <>No torrents found — try another provider</>
        case ENQUEUE_FUTURE_STATUS.FAILED:
            return <>{item.lastError || "Could not be prepared"}</>
        case ENQUEUE_FUTURE_STATUS.DOWNLOADED:
            return <>Downloading</>
        case ENQUEUE_FUTURE_STATUS.SKIPPED:
            return <>Skipped</>
        case ENQUEUE_FUTURE_STATUS.IGNORED:
            return <>Ignored — won't be suggested again</>
        default:
            return <>Ready</>
    }
}

function ItemStatusIcon({ item }: { item: EnqueueFuture_Item }) {
    switch (item.status) {
        case ENQUEUE_FUTURE_STATUS.PREPARING:
            return <LuLoader className="animate-spin text-[--muted] flex-none" />
        case ENQUEUE_FUTURE_STATUS.DOWNLOADED:
            return <LuCheck className="text-[--green] flex-none" />
        case ENQUEUE_FUTURE_STATUS.SKIPPED:
            return <LuSkipForward className="text-[--muted] flex-none" />
        case ENQUEUE_FUTURE_STATUS.IGNORED:
            return <LuBan className="text-[--muted] flex-none" />
        case ENQUEUE_FUTURE_STATUS.FAILED:
            return <LuCircleAlert className="text-[--red] flex-none" />
        case ENQUEUE_FUTURE_STATUS.NO_RESULTS:
            return <Badge intent="warning" size="sm">0</Badge>
        default:
            return null
    }
}
