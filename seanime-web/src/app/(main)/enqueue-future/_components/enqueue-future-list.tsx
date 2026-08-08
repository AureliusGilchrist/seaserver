import { EnqueueFuture_Item } from "@/api/generated/types"
import { ENQUEUE_FUTURE_STATUS } from "@/api/hooks/enqueue_future.hooks"
import { EnqueueFutureItemActions } from "@/app/(main)/enqueue-future/_components/enqueue-future-item-actions"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { LuBan, LuCheck, LuCircleAlert, LuLink2, LuLoader, LuSkipForward } from "react-icons/lu"

export type EnqueueFutureFamily = EnqueueFuture_Item[]

/**
 * Orders the queue by age — oldest first — and gathers every member of a franchise into the slot of
 * its oldest member.
 *
 * Age is `position`, which the server assigns on insert and never reassigns, so it is the only thing
 * here that fixes a row in place. Everything else is derived from it: bundles sit at their oldest
 * member, and members within a bundle are in age order too.
 *
 * A franchise is one thing to decide about, so it is drawn as one thing however far apart its members
 * were discovered. A new anime is appended at the end of the queue, so when it turns out to be related
 * to something already queued it joins that bundle rather than sitting on its own at the bottom — it
 * was never anywhere anyone had looked at yet.
 *
 * Degrouping is free: when the rest of a bundle is matched, skipped or ignored, the survivor is a
 * bundle of one, so it loses the "related" spine and header and keeps the slot it already had.
 *
 * Both the list and Next/Previous walk the flattened result, so they agree on this order.
 */
export function groupIntoFamilies(items: EnqueueFuture_Item[]): EnqueueFutureFamily[] {
    // Sorted rather than trusting the response order, so age is unambiguously what decides the layout.
    const ordered = [...items].sort((a, b) => (a.position - b.position) || (a.mediaId - b.mediaId))

    const byFamily = new Map<number, EnqueueFutureFamily>()
    for (const item of ordered) {
        const key = item.familyId || item.mediaId
        const existing = byFamily.get(key)
        if (existing) existing.push(item)
        else byFamily.set(key, [item])
    }

    // Map iteration is insertion-ordered, and insertion followed age — so the bundles come back
    // oldest-member first.
    return Array.from(byFamily.values())
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
                    // Keyed on the family, which every member shares and which is unique now that a
                    // franchise is always one bundle — so the bundle keeps its identity when its
                    // oldest entry is dealt with and drops out from under it.
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
                        {item.coverImage
                            ? <img
                                src={item.coverImage}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                className="h-12 w-9 rounded-[--radius] object-cover flex-none"
                            />
                            : <div className="h-12 w-9 rounded-[--radius] bg-gray-800 flex-none" />}

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
