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
import { formatNumber } from "@/lib/helpers/number"
import { closestCenter, DndContext, DragEndEvent, DragOverlay, DragStartEvent, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import capitalize from "lodash/capitalize"
import React from "react"
import { LuBookOpen, LuGripVertical, LuListVideo, LuPlay, LuTrash2, LuX } from "react-icons/lu"

/**
 * The todo list: anime and manga somebody means to watch or read, in the order they arranged.
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
 * It starts blank and every entry on it was put there deliberately from a media entry page. It is
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
        title: "Clear the todo list",
        description: "Removes every entry. The anime and manga themselves are not touched.",
        onConfirm: () => clearList({}),
    })

    const router = useRouter()

    // The drag is a pointer grab on the handle only — scrolling the strip must never start a drag,
    // which is what a listener on the whole card would do on a phone.
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
        useSensor(TouchSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
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
        reorder({ items: next.map(e => ({ mediaId: toWatchMediaId(e), mediaType: toWatchMediaType(e) })) })
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
            <div className="relative isolate flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-black/25 px-6 py-16 text-center shadow-xl shadow-black/20 backdrop-blur-2xl">
                <div className="pointer-events-none absolute -top-24 size-56 rounded-full bg-brand-500/15 blur-3xl" />
                <div className="relative mb-5 flex size-16 items-center justify-center rounded-2xl border border-brand-300/20 bg-brand-400/10 shadow-lg shadow-brand-950/30">
                    <LuListVideo className="size-8 text-brand-200" />
                </div>
                <p className="relative text-lg font-semibold tracking-tight">Your next favorite starts here</p>
                <p className="relative mt-2 max-w-md text-sm leading-relaxed text-[--muted]">
                    {isSelf
                        ? "Add anime or manga from its page and build a personal queue. Drag items into the order you want to watch or read them."
                        : "This person hasn't added anything to their todo list yet."}
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {isSelf && (
                <div className="relative isolate overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-brand-500/[0.12] via-black/30 to-black/40 p-4 shadow-lg shadow-black/20 backdrop-blur-xl sm:p-5">
                    <div className="pointer-events-none absolute -right-16 -top-20 size-48 rounded-full bg-brand-400/10 blur-3xl" />
                    <div className="relative flex flex-wrap items-center gap-3">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-brand-300/20 bg-brand-400/10 text-brand-200">
                            <LuListVideo className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-xs font-bold uppercase tracking-[0.16em] text-brand-200">Your queue</span>
                                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-xs font-semibold tabular-nums text-white/80">
                                    {formatNumber(items.length)} {items.length === 1 ? "item" : "items"}
                                </span>
                            </div>
                            <p className="mt-1 truncate text-sm text-white/75">
                                Up next: <span className="font-semibold text-white">{items[0]!.title}</span>
                            </p>
                            <p className="mt-0.5 text-xs text-[--muted]">Drag a handle to reorder. Your changes save automatically.</p>
                        </div>
                    <div className="flex-1" />
                    <Button intent="gray-outline" size="sm" leftIcon={<LuTrash2 />} onClick={clearConfirmation.open}>
                        Clear
                    </Button>
                    </div>
                </div>
            )}

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
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
                                onRemove={isSelf ? () => removeItem({ mediaId: toWatchMediaId(entry), mediaType: toWatchMediaType(entry) }) : undefined}
                            />
                        ))}
                    </div>
                </SortableContext>

                {/* The card being carried, above everything while it moves. */}
                <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
                    {dragging && (
                        <ToWatchCardPreview entry={dragging} position={items.findIndex(e => toWatchKey(e) === draggingId) + 1} />
                    )}
                </DragOverlay>
            </DndContext>

            <ConfirmationDialog {...clearConfirmation} />
        </div>
    )
}

function toWatchKey(entry: ToWatchEntry): string {
    return `tw-${toWatchMediaType(entry)}-${toWatchMediaId(entry)}`
}

function toWatchMediaId(entry: ToWatchEntry): number {
    return entry.mediaId ?? entry.animeId ?? 0
}

function toWatchMediaType(entry: ToWatchEntry): "ANIME" | "MANGA" {
    return entry.mediaType ?? "ANIME"
}

/** "2023" / "Spring 2023" — the year, said the way a person would. */
function toWatchSeasonYear(entry: ToWatchEntry): string | null {
    if (!entry.seasonYear) return null
    const season = entry.season ? capitalize(entry.season.toLowerCase()) : null
    return season ? `${season} ${entry.seasonYear}` : `${entry.seasonYear}`
}

/**
 * The poster. Only a "large" AniList cover can be upgraded to "extraLarge" (same file name);
 * "medium" files are named differently, so upgrading them breaks the URL. If the upgraded URL
 * still fails, the stored one is used, then the placeholder.
 */
function ToWatchCover({ src, alt }: { src: string, alt: string }) {
    const upgraded = src.replace("/cover/large/", "/cover/extraLarge/")
    const [current, setCurrent] = React.useState(upgraded)

    React.useEffect(() => {
        setCurrent(upgraded)
    }, [upgraded])

    return (
        <img
            src={current}
            alt={alt}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
            onError={() => {
                if (current !== src) setCurrent(src)
                else if (current !== "/no-cover.png") setCurrent("/no-cover.png")
            }}
        />
    )
}

/**
 * One card of the strip: the grab handle, where it sits in the order, the poster that makes it
 * recognisable, the title, the description that answers "should I watch this?", the metadata it
 * carries, and the button that starts it.
 */
type ToWatchCardData = {
    entry: ToWatchEntry
    position: number
    readOnly?: boolean
    onRemove?: () => void
    isOverlay?: boolean
}

function ToWatchCard({ entry, position, readOnly, onRemove }: ToWatchCardData) {
    const sortable = useSortable({ id: toWatchKey(entry), disabled: !!readOnly })
    return <ToWatchCardVisual entry={entry} position={position} readOnly={readOnly} onRemove={onRemove} sortable={sortable} />
}

function ToWatchCardPreview({ entry, position }: { entry: ToWatchEntry, position: number }) {
    return <ToWatchCardVisual entry={entry} position={position} readOnly isOverlay />
}

function ToWatchCardVisual({
    entry,
    position,
    readOnly,
    onRemove,
    isOverlay,
    sortable,
}: ToWatchCardData & { sortable?: ReturnType<typeof useSortable> }) {
    const router = useRouter()
    const mediaType = toWatchMediaType(entry)
    const mediaId = toWatchMediaId(entry)
    const href = mediaType === "MANGA" ? `/manga/entry?id=${mediaId}` : `/entry?id=${mediaId}`

    const seasonYear = toWatchSeasonYear(entry)

    return (
        <div
            ref={sortable?.setNodeRef}
            style={{
                transform: CSS.Transform.toString(sortable?.transform ? { ...sortable.transform, scaleY: 1 } : null),
                transition: sortable?.transition,
            }}
            className={cn(
                "group relative z-[1] flex min-h-[104px] items-stretch gap-2 overflow-hidden rounded-2xl border bg-gradient-to-r from-white/[0.04] via-black/30 to-black/40 shadow-lg shadow-black/20 backdrop-blur-xl transition-[border-color,background-color,box-shadow,opacity] duration-200 sm:gap-3",
                sortable?.isDragging
                    ? "border-brand-300/50 opacity-35"
                    : "border-white/10 hover:border-brand-300/35 hover:bg-white/[0.04]",
                isOverlay && "border-brand-300/60 bg-gray-950/90 shadow-2xl shadow-brand-950/60 ring-1 ring-brand-300/25",
            )}
        >
            {!readOnly && (
                <button
                    ref={sortable?.setActivatorNodeRef}
                    {...sortable?.attributes}
                    {...sortable?.listeners}
                    type="button"
                    aria-label={`Drag to reorder ${entry.title}`}
                    title="Drag to reorder"
                    className="group/handle my-2 ml-2 flex w-10 shrink-0 touch-none cursor-grab items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.025] text-white/45 transition hover:border-brand-300/25 hover:bg-brand-400/10 hover:text-brand-100 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300 sm:my-3 sm:ml-3 sm:w-11"
                >
                    <LuGripVertical className="size-5 transition-transform group-hover/handle:scale-110" />
                </button>
            )}

            <div className="flex shrink-0 items-center justify-center">
                <span className="grid size-7 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-xs font-bold tabular-nums text-white/70">
                    {position}
                </span>
            </div>

            {entry.coverImage ? (
                <a href={href} className="py-3 flex-shrink-0" title={entry.title}>
                    <div className="w-[56px] h-[78px] rounded-md overflow-hidden bg-gray-800/70 border border-gray-700/60 relative group/poster">
                        <ToWatchCover src={entry.coverImage} alt={entry.title} />
                        <div className="absolute inset-0 bg-black/0 group-hover/poster:bg-black/30 transition-colors flex items-center justify-center">
                            <LuPlay className="w-5 h-5 text-white opacity-0 group-hover/poster:opacity-100 transition-opacity" />
                        </div>
                    </div>
                </a>
            ) : (
                <div className="py-3 flex-shrink-0">
                    <div className="w-[56px] h-[78px] rounded-md bg-gray-800/70 border border-gray-700/60 flex items-center justify-center">
                        {mediaType === "MANGA" ? <LuBookOpen className="text-lg text-gray-500" /> : <LuListVideo className="text-lg text-gray-500" />}
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
                    {!!entry.episodes && <span className="tabular-nums">{formatNumber(entry.episodes)} ep{entry.episodes === 1 ? "" : "s"}</span>}
                    {!!entry.chapters && <span className="tabular-nums">{formatNumber(entry.chapters)} ch{entry.chapters === 1 ? "" : "s"}</span>}
                    {!!entry.volumes && <span className="tabular-nums">{formatNumber(entry.volumes)} vol{entry.volumes === 1 ? "" : "s"}</span>}
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
                    {!!entry.meanScore && <span className="text-amber-300/80">★ {formatNumber(entry.meanScore)}%</span>}
                    {!!entry.duration && <span className="tabular-nums">{formatNumber(entry.duration)} min/ep</span>}
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
                    type="button"
                    size="sm"
                    intent="primary"
                    leftIcon={mediaType === "MANGA" ? <LuBookOpen /> : <LuPlay />}
                    onClick={() => { router.push(href) }}
                >
                    {mediaType === "MANGA" ? "Read" : "Watch"}
                </Button>
                {!readOnly && onRemove && (
                    <Button
                        type="button"
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
