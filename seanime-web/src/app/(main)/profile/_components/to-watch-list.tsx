"use client"

import {
    useClearToWatch,
    useGetToWatch,
    useGetToWatchForProfile,
    useRemoveFromToWatch,
    useReorderToWatch,
    ToWatchEntry,
} from "@/api/hooks/towatch.hooks"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { ConfirmationDialog, useConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { useRouter } from "@/lib/navigation"
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import capitalize from "lodash/capitalize"
import React from "react"
import { LuGripVertical, LuListVideo, LuPlay, LuTrash2, LuX } from "react-icons/lu"

/**
 * The to-watch list: what somebody means to watch, in the order they arranged.
 *
 * A strip of cards rather than a grid, because the whole point of the list is the running order —
 * the next thing is at the top and the rest follow in a line. The cover sits at the far left so
 * each entry is recognisable without reading; the description is the middle, because that is what
 * "should I watch this?" is answered from; the metadata sits to the right of it; and the button
 * that starts it is on the far right.
 *
 * The order is changed with a grab handle, and one drag is one request: the whole order is sent
 * whole, so a move lands as the arrangement that was made rather than a sequence of swaps.
 *
 * It starts blank and every entry on it was put there deliberately from an anime's own page. It is
 * allowed to be as long as its owner wants — thousands is a list.
 */
export function ToWatchList({ profileId, readOnly }: { profileId?: number, readOnly?: boolean }) {
    const isSelf = !readOnly
    const { data: ownList, isLoading: ownLoading } = useGetToWatch()
    const { data: otherList, isLoading: otherLoading } = useGetToWatchForProfile(isSelf ? null : (profileId ?? null))

    const items = (isSelf ? ownList : otherList) ?? []
    const loading = isSelf ? ownLoading : otherLoading

    const { mutate: reorder } = useReorderToWatch()
    const { mutate: removeItem } = useRemoveFromToWatch()
    const { mutate: clearList } = useClearToWatch()
    const clearConfirmation = useConfirmationDialog({
        title: "Clear the to-watch list",
        description: "Removes every entry. The anime themselves are not touched.",
        onConfirm: () => clearList({}),
    })

    const router = useRouter()

    // The drag is a pointer grab on the handle only — scrolling the strip must never start a drag,
    // which is what a listener on the whole card would do on a phone.
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    )
    const [draggingId, setDraggingId] = React.useState<string | null>(null)
    const dragging = items.find(e => toWatchKey(e) === draggingId) ?? null

    const handleDragStart = React.useCallback((event: DragStartEvent) => {
        setDraggingId(String(event.active.id))
    }, [])

    const handleDragEnd = React.useCallback((event: DragEndEvent) => {
        setDraggingId(null)
        const { active, over } = event
        if (!over || active.id === over.id) return

        const oldIndex = items.findIndex(e => toWatchKey(e) === active.id)
        const newIndex = items.findIndex(e => toWatchKey(e) === over.id)
        if (oldIndex < 0 || newIndex < 0) return

        const next = arrayMove(items, oldIndex, newIndex)
        reorder({ animeIds: next.map(e => e.animeId) })
    }, [items, reorder])

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <p className="text-sm text-[--muted]">Loading…</p>
            </div>
        )
    }

    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gray-900/70 border border-gray-800 flex items-center justify-center mb-5">
                    <LuListVideo className="text-3xl text-brand-300" />
                </div>
                <p className="text-lg font-medium">Nothing on the list yet</p>
                <p className="text-sm text-[--muted] max-w-md mt-1">
                    {isSelf
                        ? "Every anime page has a button for it — add what you mean to watch, and it lines up here in the order you choose."
                        : "This person hasn't added anything to their to-watch list yet."}
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {isSelf && (
                <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-sm text-[--muted]">
                        <span className="text-gray-200 font-medium tabular-nums">{items.length}</span> on the list — next up:{" "}
                        <span className="text-gray-200">{items[0]!.title}</span>
                    </p>
                    <div className="flex-1" />
                    <Button intent="gray-outline" size="sm" leftIcon={<LuTrash2 />} onClick={clearConfirmation.open}>
                        Clear
                    </Button>
                </div>
            )}

            <DndContext
                sensors={sensors}
                modifiers={[restrictToVerticalAxis]}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setDraggingId(null)}
            >
                <SortableContext items={items.map(toWatchKey)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2.5">
                        {items.map((entry, index) => (
                            <ToWatchCard
                                key={toWatchKey(entry)}
                                entry={entry}
                                position={index + 1}
                                readOnly={!isSelf}
                                onRemove={isSelf ? () => removeItem({ animeId: entry.animeId }) : undefined}
                                isDragging={draggingId === toWatchKey(entry)}
                            />
                        ))}
                    </div>
                </SortableContext>

                {/* The card being carried, above everything while it moves. */}
                <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
                    {dragging && (
                        <ToWatchCard entry={dragging} position={items.findIndex(e => toWatchKey(e) === draggingId) + 1} readOnly isOverlay />
                    )}
                </DragOverlay>
            </DndContext>

            <ConfirmationDialog {...clearConfirmation} />
        </div>
    )
}

function toWatchKey(entry: ToWatchEntry): string {
    return `tw-${entry.animeId}`
}

/** "2023" / "Spring 2023" — the year, said the way a person would. */
function toWatchSeasonYear(entry: ToWatchEntry): string | null {
    if (!entry.seasonYear) return null
    const season = entry.season ? capitalize(entry.season.toLowerCase()) : null
    return season ? `${season} ${entry.seasonYear}` : `${entry.seasonYear}`
}

/**
 * One card of the strip: the grab handle, where it sits in the order, the poster that makes it
 * recognisable, the title, the description that answers "should I watch this?", the metadata it
 * carries, and the button that starts it.
 */
function ToWatchCard({
    entry,
    position,
    readOnly,
    onRemove,
    isDragging,
    isOverlay,
}: {
    entry: ToWatchEntry
    position: number
    readOnly?: boolean
    onRemove?: () => void
    isDragging?: boolean
    isOverlay?: boolean
}) {
    const router = useRouter()
    const href = `/entry?id=${entry.animeId}`

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging: isSortDragging,
    } = useSortable({ id: toWatchKey(entry), disabled: !!readOnly })

    const seasonYear = toWatchSeasonYear(entry)

    return (
        <div
            ref={setNodeRef}
            {...attributes}
            style={{
                transform: CSS.Transform.toString(transform ? { ...transform, scaleY: 1 } : null),
                transition,
            }}
            className={cn(
                "flex items-stretch gap-3 rounded-xl border bg-gray-950/60 overflow-hidden",
                "transition-colors",
                isSortDragging
                    ? "border-brand-500/70 opacity-40"
                    : "border-gray-800 hover:border-gray-700",
                isOverlay && "border-brand-500/70 shadow-2xl shadow-black/60 bg-gray-900",
            )}
        >
            {/* The grab handle. The order is changed from here and nowhere else — the rest of the
                card is for reading and starting. */}
            {!readOnly && (
                <button
                    {...listeners}
                    aria-label="Drag to reorder"
                    className="flex items-center justify-center w-7 flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-300 touch-none"
                >
                    <LuGripVertical className="w-4 h-4" />
                </button>
            )}

            {/* Where it sits in the order. A list is a sequence, so the number is information. */}
            <div className="flex items-center justify-center w-8 flex-shrink-0 text-[--muted]">
                <span className="text-sm font-semibold tabular-nums">{position}</span>
            </div>

            {entry.coverImage ? (
                <a href={href} className="py-3 flex-shrink-0" title={entry.title}>
                    <div className="w-[56px] h-[78px] rounded-md overflow-hidden bg-gray-800/70 border border-gray-700/60 relative group/poster">
                        <img
                            src={entry.coverImage}
                            alt={entry.title}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover/poster:bg-black/30 transition-colors flex items-center justify-center">
                            <LuPlay className="w-5 h-5 text-white opacity-0 group-hover/poster:opacity-100 transition-opacity" />
                        </div>
                    </div>
                </a>
            ) : (
                <div className="py-3 flex-shrink-0">
                    <div className="w-[56px] h-[78px] rounded-md bg-gray-800/70 border border-gray-700/60 flex items-center justify-center">
                        <LuListVideo className="text-lg text-gray-500" />
                    </div>
                </div>
            )}

            {/* The description — what "should I watch this?" is answered from — and the metadata. */}
            <div className="flex-1 min-w-0 py-3 pr-3">
                <a href={href} title={entry.title}>
                    <p className="font-semibold text-[15px] leading-tight line-clamp-1 hover:text-brand-200 transition-colors">
                        {entry.title}
                    </p>
                </a>

                {entry.description && (
                    <p className="text-xs text-[--muted] leading-relaxed line-clamp-2 mt-1" title={entry.description}>
                        {entry.description}
                    </p>
                )}

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-xs text-[--muted]">
                    {entry.format && (
                        <span className="px-1.5 py-px rounded-full bg-white/[0.06] text-gray-300 font-medium">{entry.format}</span>
                    )}
                    {!!entry.episodes && <span className="tabular-nums">{entry.episodes} ep{entry.episodes === 1 ? "" : "s"}</span>}
                    {seasonYear && <span className="tabular-nums">{seasonYear}</span>}
                    {entry.status && (
                        <span className={cn(
                            entry.status === "FINISHED" && "text-emerald-400/90",
                            entry.status === "RELEASING" && "text-sky-400/90",
                            entry.status === "NOT_YET_RELEASED" && "text-amber-400/90",
                        )}>
                            {entry.status.replace(/_/g, " ").toLowerCase()}
                        </span>
                    )}
                    {!!entry.meanScore && <span className="text-amber-300/80">★ {entry.meanScore}%</span>}
                    {!!entry.duration && <span className="tabular-nums">{entry.duration} min/ep</span>}
                </div>

                {(!!entry.genres?.length || !!entry.studio) && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] text-[--muted]">
                        {!!entry.studio && <span>{entry.studio}</span>}
                        {!!entry.genres?.length && (
                            <span className="truncate">
                                {entry.studio ? "· " : ""}{entry.genres.slice(0, 4).join(" · ")}
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0 pr-3">
                <Button
                    size="sm"
                    intent="primary"
                    leftIcon={<LuPlay />}
                    onClick={() => { router.push(href) }}
                >
                    Watch
                </Button>
                {!readOnly && onRemove && (
                    <Button
                        size="sm"
                        intent="gray-outline"
                        className="px-2"
                        onClick={onRemove}
                        title="Take this off the list"
                    >
                        <LuX />
                    </Button>
                )}
            </div>
        </div>
    )
}
