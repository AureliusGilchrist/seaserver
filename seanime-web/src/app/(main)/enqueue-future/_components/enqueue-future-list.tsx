import { EnqueueFuture_Item } from "@/api/generated/types"
import { ENQUEUE_FUTURE_STATUS } from "@/api/hooks/enqueue_future.hooks"
import { EnqueueFutureItemActions } from "@/app/(main)/enqueue-future/_components/enqueue-future-item-actions"
import { AnimeDownloadingIcon, useIsAnimeDownloading } from "@/app/(main)/_features/media/_components/anime-downloading-badge"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { LuBan, LuCheck, LuCircleAlert, LuLink2, LuLoader, LuSkipForward, LuUsers } from "react-icons/lu"

/**
 * Seeder counts run from single figures into the tens of thousands and sit in a 320px column next to
 * everything else a row has to say, so past a thousand they are shortened rather than allowed to
 * push the title out of the way. The exact figure is never the point — the ranking is.
 */
function formatSeeders(count: number): string {
    if (count < 1000) return String(count)
    const thousands = count / 1000
    return `${thousands < 10 ? thousands.toFixed(1).replace(/\.0$/, "") : Math.round(thousands)}k`
}

export type EnqueueFutureFamily = EnqueueFuture_Item[]

/**
 * How widely shared a franchise is: every seeder on every torrent found for every one of its members,
 * added together.
 *
 * A franchise is one thing to decide about, so it is ranked as one thing. Ranking a group by its best
 * member instead would put a franchise on the strength of its one famous season and say nothing about
 * the rest; the sum is the size of the whole story's audience, which is what the bundle represents.
 *
 * An item still being prepared has no figure yet and contributes nothing, so an unprepared queue
 * ranks as it always did until the numbers arrive — see the ordering note below.
 */
export function familySeeders(family: EnqueueFutureFamily): number {
    return family.reduce((total, item) => total + (item.totalSeeders || 0), 0)
}

/**
 * Gathers a franchise into one bundle wherever its members turn up, draws a spine around it, and puts
 * the most widely shared franchises first.
 *
 * **The slot belongs to the family, not to a member of it.** A franchise is placed by its own total,
 * never by whichever member happens to be its earliest survivor. That distinction is what keeps the
 * list still while you work down it: anchoring a group on a member throws the whole bundle across the
 * screen the moment you deal with its top entry, because the anchor becomes the next member and the
 * group lands wherever that one came from.
 *
 * The order is popularity, highest total first, and it holds still because the number it sorts on
 * does not move: a seeder total is recorded once when the item is prepared and never recomputed, so
 * re-sorting on every poll returns the same list rather than reshuffling under you. The two things
 * that do change it are the two that should:
 *
 *  - an entry is dealt with and leaves; its group's total drops by that entry's share, and the group
 *    settles wherever its remaining members put it.
 *  - an anime finishes preparing, or a new franchise appears, and takes the rank its seeders earn.
 *
 * Items with no total yet — anything still pending or preparing — sort last, which is where something
 * you cannot act on belongs.
 *
 * `order` is the tie-break, carried from one poll to the next by the caller. Two franchises of equal
 * popularity (and a queue full of unprepared zeroes is nothing but ties) keep the order they were
 * first shown in rather than swapping places on every poll, because the sort below is stable and this
 * is the sequence it stabilises against.
 *
 * Each entry appears exactly once in the result, so flattening it is a reordering of the input and
 * never a duplication — which is what lets the list and Next/Previous agree on the same order.
 */
export function groupIntoFamilies(
    items: EnqueueFuture_Item[],
    order: number[] = [],
): { families: EnqueueFutureFamily[], order: number[] } {
    // Bucket first. Map keeps insertion order, so families not yet placed come out below in the order
    // their first member arrived.
    const byKey = new Map<number, EnqueueFutureFamily>()
    const seen = new Set<number>()
    for (const item of items) {
        // The same anime reaching here twice would otherwise be drawn twice and counted twice by the
        // header — the queue can carry a repeat while a run is writing to it.
        if (seen.has(item.mediaId)) continue
        seen.add(item.mediaId)

        const key = item.familyId || item.mediaId
        const family = byKey.get(key)
        if (family) family.push(item)
        else byKey.set(key, [item])
    }

    // Within a bundle, the best-shared season first, for the same reason the bundles themselves are
    // ordered that way. Stable, so seasons of equal standing stay in the order they came in.
    for (const family of byKey.values()) {
        family.sort((a, b) => (b.totalSeeders || 0) - (a.totalSeeders || 0))
    }

    // The sequence ties fall back on: whatever was already on screen, in the order it was in, then
    // franchises seen for the first time behind it.
    const placed = new Set<number>()
    const held = order.filter(key => {
        if (!byKey.has(key) || placed.has(key)) return false
        placed.add(key)
        return true
    })
    const appended = [...byKey.keys()].filter(key => !placed.has(key))

    // Then popularity decides, over a stable sort, so the line above only settles ties.
    const nextOrder = held.concat(appended)
        .sort((a, b) => familySeeders(byKey.get(b)!) - familySeeders(byKey.get(a)!))

    return { families: nextOrder.map(key => byKey.get(key)!), order: nextOrder }
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
                    // Keyed on the family, not on its first entry: dealing with the entry a bundle
                    // happens to start with must not look to React like a different bundle appearing
                    // where the old one was. One bundle per key, so this is unique.
                    key={family[0].familyId || family[0].mediaId}
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
    const seeders = familySeeders(family)

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
                    {/* The number the group is ranked on. A bundle sits above one of its own members
                        further down the page, which only reads as sensible once you can see that it
                        is the franchise being counted and not the season. */}
                    {seeders > 0 && (
                        <span className="flex-none ml-auto flex items-center gap-1 normal-case tracking-normal">
                            <LuUsers className="flex-none" />
                            {formatSeeders(seeders)}
                        </span>
                    )}
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
                                {/* Its own share of the total, so a row's place in the list is
                                    something you can read rather than infer. */}
                                {item.totalSeeders > 0 && <> · {formatSeeders(item.totalSeeders)} seeders</>}
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
