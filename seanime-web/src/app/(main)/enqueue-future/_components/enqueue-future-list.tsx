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
 * The ordering memory the caller holds between polls: the sequence families are in, and what each
 * one is worth. Both have to survive from one poll to the next, or the list is rebuilt from whatever
 * happens to be left and moves under the person reading it.
 */
export type FamilyOrdering = {
    order: number[]
    /** Family key → the highest total that family has ever been worth. */
    values: Record<number, number>
    /**
     * Family key → the array handed out last time.
     *
     * Kept so a poll that changed nothing about a family can hand back the *same* array rather than
     * an equal one. `FamilyBundle` is memoised on its props, and rebuilding every family array on
     * every poll gave every bundle a new `family` prop — which defeated the memo entirely and
     * re-rendered several hundred rows ten seconds apart. Reused only when the members are the same
     * objects in the same order, so a family that genuinely changed still gets a fresh array.
     */
    families?: Record<number, EnqueueFutureFamily>
}

/** Whether two families hold the same item objects, in the same order. */
function sameMembers(a: EnqueueFutureFamily | undefined, b: EnqueueFutureFamily): boolean {
    if (!a || a.length !== b.length) return false
    return a.every((item, i) => item === b[i])
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
 * The order is popularity, highest total first, and — this is the part that keeps the list usable —
 * **a franchise's rank never falls because you dealt with one of its entries.**
 *
 * The rank is the highest total the family has ever been worth, remembered across polls, not the sum
 * of whoever is left in it. Recomputing from the survivors meant every download re-ranked the family
 * that entry belonged to and threw it down the page, taking its remaining seasons with it — so
 * working through a franchise moved the very rows you were working through, and the last entry of a
 * group, which stops being drawn as a group at all, moved twice.
 *
 * Held at its high-water mark, a family stays exactly where it is as you empty it, and the entry left
 * at the end sits where the bundle always sat. So the movements this list makes are these:
 *
 *  - an entry is dealt with and leaves; its family keeps its place and its value, and the rows below
 *    close up by one. Nothing is re-ranked.
 *  - a new season joins a franchise already listed, or an anime finishes preparing: the family's
 *    total can only rise, so it moves up and the ones it passes move down. This is the one movement
 *    that is worth having — a franchise that just became more popular should say so.
 *  - a franchise nobody has seen appears and takes the rank its seeders earn.
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
    previous: FamilyOrdering = { order: [], values: {} },
): { families: EnqueueFutureFamily[], ordering: FamilyOrdering } {
    const { order, values: previousValues, families: previousFamilies = {} } = previous
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
    // Within a bundle, the franchise's own order — the order it ran in.
    //
    // Seeders decide which *franchise* comes first, and that is right: it is a stand-in for how
    // widely watched the whole story is. Inside one, it is the wrong question entirely. A bundle
    // listing season 3, then the OVA, then season 1 because that is how popular they are is a list
    // you have to reassemble in your head before you can decide anything — and deciding is the only
    // thing this screen is for. Sorted by when each entry aired, a franchise reads top to bottom the
    // way you would watch it.
    //
    // Anything with no date yet (still preparing, or an entry AniList gives no start date) sorts to
    // the end rather than the front: an unknown belongs after the part of the story that is known.
    for (const family of byKey.values()) {
        family.sort((a, b) => {
            const aAired = a.airedAt || 0
            const bAired = b.airedAt || 0
            if ((aAired === 0) !== (bAired === 0)) return aAired === 0 ? 1 : -1
            if (aAired !== bAired) return aAired - bAired
            // Same season, or both unknown: the more widely shared one first, as before.
            return (b.totalSeeders || 0) - (a.totalSeeders || 0)
        })
    }

    // Hand back the previous array for any family that came out identical, so a poll only changes
    // the identity of the families it actually changed. Everything below reads through byKey, so
    // swapping the arrays here is enough for the result and the memory to agree.
    const nextFamilies: Record<number, EnqueueFutureFamily> = {}
    for (const [key, family] of byKey) {
        const reused = sameMembers(previousFamilies[key], family) ? previousFamilies[key]! : family
        byKey.set(key, reused)
        nextFamilies[key] = reused
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

    // What each family is worth: the most it has ever been worth, never less.
    //
    // Taking the higher of "what it is worth now" and "what it was worth last time" is the whole
    // mechanism. Members leaving cannot lower it — which is what stops a download re-ranking the
    // franchise it came from — while a new season joining, or an entry finishing preparation, raises
    // it, because those genuinely make the franchise a bigger thing than it was.
    //
    // Only families still present are carried forward, so the memory cannot grow without limit as
    // franchises are finished and leave the queue.
    const values: Record<number, number> = {}
    for (const key of byKey.keys()) {
        const current = familySeeders(byKey.get(key)!)
        const remembered = previousValues[key] ?? 0
        values[key] = Math.max(current, remembered)
    }

    // Then popularity decides, over a stable sort, so the line above only settles ties.
    const nextOrder = held.concat(appended)
        .sort((a, b) => (values[b] ?? 0) - (values[a] ?? 0))

    return {
        families: nextOrder.map(key => byKey.get(key)!),
        ordering: { order: nextOrder, values, families: nextFamilies },
    }
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

    // Drawn a chunk at a time.
    //
    // A queue of several thousand entries is several thousand rows, each with a cover, badges and
    // status — and React builds all of it before the browser paints anything. That is the lag: not
    // the data, which arrives in one small response, but the DOM built from it. Everything below the
    // fold is work nobody has looked at yet.
    //
    // So a window of families is rendered and extended as you approach the end of it. The window only
    // ever grows, and it is never reset by a poll — shrinking it under somebody mid-scroll would
    // throw them back up the list, which is worse than the lag.
    const [visibleFamilies, setVisibleFamilies] = React.useState(FAMILY_PAGE_SIZE)
    const sentinelRef = React.useRef<HTMLDivElement | null>(null)

    // The selection has to be drawn wherever it is, or Next walks past the end of the window and the
    // screen goes blank while the list insists everything is fine.
    const activeFamilyIndex = React.useMemo(
        () => families.findIndex(family => family.some(item => item.mediaId === activeMediaId)),
        [families, activeMediaId])

    React.useEffect(() => {
        if (activeFamilyIndex < 0) return
        setVisibleFamilies(current => Math.max(current, activeFamilyIndex + FAMILY_PAGE_SIZE))
    }, [activeFamilyIndex])

    React.useEffect(() => {
        const sentinel = sentinelRef.current
        if (!sentinel) return

        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                setVisibleFamilies(current => Math.min(current + FAMILY_PAGE_SIZE, families.length))
            }
        }, { rootMargin: "400px" })

        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [families.length])

    const shown = React.useMemo(
        () => families.slice(0, Math.min(visibleFamilies, families.length)),
        [families, visibleFamilies])

    return (
        // Tall as the screen allows, not a fixed 70% of it.
        //
        // The list is the thing you work down, so on a tall monitor it should show more rows rather
        // than leaving a third of the column empty. Sticky so it stays with you as the right-hand
        // pane scrolls, and it scrolls inside itself instead of pushing the page taller.
        <div
            className="rounded-[--radius-md] border bg-gray-950 overflow-y-auto xl:sticky xl:top-4 max-h-[calc(100vh-8rem)]"
            data-enqueue-future-list
        >
            {shown.map(family => (
                <FamilyBundle
                    // Keyed on the family, not on its first entry: dealing with the entry a bundle
                    // happens to start with must not look to React like a different bundle appearing
                    // where the old one was. One bundle per key, so this is unique.
                    key={family[0].familyId || family[0].mediaId}
                    family={family}
                    // Narrowed here rather than passed straight down. Handing the selected id to
                    // every bundle made selection a prop change on all of them, so a single click
                    // re-rendered the whole queue past the memo. Only the bundle that holds the
                    // selection is told about it, which is the only one whose drawing depends on
                    // it — so a click changes two bundles instead of several hundred.
                    activeMediaId={family.some(n => n.mediaId === activeMediaId) ? activeMediaId : undefined}
                    onSelect={onSelect}
                    activeRef={activeRef}
                />
            ))}

            {/* Crossing this asks for the next chunk. Sized generously by rootMargin above, so the
                next rows exist before they are scrolled to rather than after. */}
            {shown.length < families.length && (
                <div ref={sentinelRef} className="px-3 py-4 text-center text-xs text-[--muted]">
                    {families.length - shown.length} more franchise{families.length - shown.length === 1 ? "" : "s"}…
                </div>
            )}
        </div>
    )
}

/** How many franchises are drawn at a time. Enough to fill a tall screen and scroll a little. */
const FAMILY_PAGE_SIZE = 25

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
                {family.map((item, position) => {
                    const isActive = item.mediaId === activeMediaId
                    // Already downloading, downloaded or matched. The row stays — it is part of its
                    // franchise and removing it would make the group look incomplete — but there is
                    // nothing left to decide about it, so it cannot be opened or have a torrent
                    // picked for it. Skip and Ignore stay live: those are how you say you are done
                    // with a row, which is exactly what this is.
                    // Skipped counts as settled too: you already decided about it. The row stays,
                    // greyed, in its franchise — passing on one season should still show the series,
                    // and should show that you passed rather than quietly erasing the row.
                    const settled = !!item.downloadState || item.status === ENQUEUE_FUTURE_STATUS.SKIPPED
                    return (
                    // A div rather than a button: the row carries its own Skip and Ignore buttons,
                    // and a button inside a button is invalid markup that browsers resolve however
                    // they like. Role and key handling put the keyboard behaviour back.
                    <div
                        key={item.mediaId}
                        ref={isActive ? activeRef : undefined}
                        role="button"
                        tabIndex={settled ? -1 : 0}
                        aria-disabled={settled}
                        onClick={() => !settled && onSelect(item)}
                        onKeyDown={e => {
                            if (settled) return
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                onSelect(item)
                            }
                        }}
                        // Each member sits one step further in than the one before it.
                        //
                        // The order inside a bundle is chronological, so the indent is a picture of
                        // how far along the story a row is: the first season at the left edge, its
                        // sequel a step in, the sequel's sequel another. You can see where you are in
                        // a franchise without reading a single title.
                        //
                        // Capped, because a fifteen-entry saga indented fifteen times is a staircase
                        // running off the side of a 320px column. Past the cap the rows stack at the
                        // same depth, which still says "deep into it".
                        style={isGroup ? { paddingLeft: `${14 + Math.min(position, 6) * 12}px` } : undefined}
                        className={cn(
                            "group/enqueue-future-row w-full flex items-center gap-3 p-2 text-left transition",
                            settled
                                ? "opacity-40 cursor-default"
                                : "cursor-pointer hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[--brand]",
                            isActive && !settled && "bg-gray-800",
                        )}
                        data-enqueue-future-list-item
                        data-enqueue-future-list-item-settled={settled || undefined}
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
                            <RowStateMark item={item} />
                        </span>

                        <span className="flex-1 min-w-0">
                            <span className={cn("block truncate text-sm", isActive && "font-semibold")}>
                                {item.title || `#${item.mediaId}`}
                            </span>
                            <span className="block text-xs text-[--muted]">
                                {settled
                                    ? <RowStateLabel item={item} />
                                    : <ItemStatusLabel item={item} />}
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
/**
 * What has already happened to this anime, pinned to the corner of its cover art.
 *
 * A greyed row says "you have dealt with this" but not *how* — and the three answers lead to
 * different next steps: still coming down, sitting in staging waiting to be matched, or already in
 * the library. The mark says which at a glance, in the same colours the rest of the app uses for the
 * same three states, so it reads as the same fact here as it does on a card.
 *
 * The row's own state is preferred over the live downloading atom. The state on the item is derived
 * from the files themselves — library files, staged records — and covers everything imported by hand
 * or downloaded before any of it was recorded; the atom only knows about downloads this server
 * watched happen. Falling back to it keeps a download queued seconds ago marked before the next poll
 * has told the queue about it.
 */
function RowStateMark({ item }: { item: EnqueueFuture_Item }) {
    const isDownloadingNow = useIsAnimeDownloading(item.mediaId)
    const state = item.downloadState || (isDownloadingNow ? "downloading" : "")
    if (!state) return null

    const mark = {
        downloading: {
            label: "Downloading",
            className: "bg-purple-500",
            icon: <AnimeDownloadingIcon className="h-2.5 w-2.5" />,
        },
        downloaded: {
            label: "Downloaded — waiting to be matched",
            className: "bg-amber-500",
            icon: <LuCheck className="h-2.5 w-2.5" />,
        },
        matched: {
            label: "In your library",
            className: "bg-emerald-500",
            icon: <LuCheck className="h-2.5 w-2.5" />,
        },
    }[state]

    if (!mark) return null

    return (
        <span
            data-enqueue-future-state-mark={state}
            title={mark.label}
            aria-label={mark.label}
            className={cn(
                "absolute -bottom-1 -right-1 flex items-center justify-center h-4 w-4 rounded-full",
                // The ring keeps it legible over artwork.
                "text-white ring-2 ring-gray-950",
                mark.className,
            )}
        >
            {mark.icon}
        </span>
    )
}

/**
 * The state in words, coloured to match the mark on the cover.
 *
 * "Downloaded" and "matched" are easy to read as the same thing, and they are not: one is a folder
 * full of episodes waiting for you to file it, the other is a series that is already in your library
 * and needs nothing. Saying which, in the words the rest of the app uses, is the difference between a
 * greyed row you understand and one you have to go and investigate.
 */
function RowStateLabel({ item }: { item: EnqueueFuture_Item }) {
    switch (item.downloadState) {
        case "downloading":
            return <span className="text-purple-400">Downloading</span>
        case "downloaded":
            return <span className="text-amber-400">Downloaded — waiting to be matched</span>
        case "matched":
            return <span className="text-emerald-400">In your library</span>
    }
    // No download state and still settled: you passed on it.
    return <span className="text-[--muted]">Skipped</span>
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
