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
import { SeaImage } from "@/components/shared/sea-image"
import { useRouter } from "@/lib/navigation"
import { Virtuoso } from "react-virtuoso"
import React from "react"
import { LuChevronDown, LuChevronUp, LuListVideo, LuPlay, LuTrash2, LuX } from "react-icons/lu"

/**
 * The to-watch list: what somebody means to watch, in the order they arranged.
 *
 * A strip of cards rather than a grid, because the whole point of the list is the running order —
 * the next thing is at the top and the rest follow in a line, the way a person keeps a list in
 * their head. The cover sits at the far left so each entry is recognisable without reading; the
 * description is the middle, because it is what "should I watch this?" is answered from; the
 * metadata sits to the right of it; and the button that starts it is on the far right.
 *
 * It starts blank and every entry on it was put there deliberately from an anime's own page. It is
 * allowed to be as long as its owner wants — thousands is a list — so it is rendered a window at a
 * time, and reordering is a pair of buttons rather than a drag: a drag over three thousand rows is
 * a scroll problem, and a move is one request either way.
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
    const router = useRouter()
    const clearConfirmation = useConfirmationDialog({
        title: "Clear the to-watch list",
        description: "Removes every entry. The anime themselves are not touched.",
        onConfirm: () => clearList({}),
    })

    const move = React.useCallback((index: number, direction: -1 | 1) => {
        const next = [...items]
        const target = index + direction
        if (target < 0 || target >= next.length) return
        const [moved] = next.splice(index, 1)
        next.splice(target, 0, moved!)
        // The whole order, in one request — so a move is a move, not a sequence of swaps that can
        // land half-done.
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
        <div className="space-y-3">
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

            {/* Rendered a window at a time: the list is allowed to be thousands, and mounting every
                row up front would make it the slowest page on the server. */}
            <Virtuoso
                useWindowScroll
                totalCount={items.length}
                increaseViewportBy={{ top: 600, bottom: 900 }}
                itemContent={(index, entry) => (
                    <div className="pb-3">
                        <ToWatchCard
                            entry={entry}
                            position={index + 1}
                            readOnly={!isSelf}
                            onMoveUp={index > 0 ? () => move(index, -1) : undefined}
                            onMoveDown={index < items.length - 1 ? () => move(index, 1) : undefined}
                            onRemove={isSelf ? () => removeItem({ animeId: entry.animeId }) : undefined}
                        />
                    </div>
                )}
            />

            <ConfirmationDialog {...clearConfirmation} />
        </div>
    )
}

/**
 * One row of the strip: the cover on the far left, the description in the middle, the metadata to
 * its right, and the button that starts it on the far right.
 */
function ToWatchCard({
    entry,
    position,
    readOnly,
    onMoveUp,
    onMoveDown,
    onRemove,
}: {
    entry: ToWatchEntry
    position: number
    readOnly?: boolean
    onMoveUp?: () => void
    onMoveDown?: () => void
    onRemove?: () => void
}) {
    const href = `/entry?id=${entry.animeId}`

    return (
        <div className="flex items-stretch gap-4 rounded-xl border border-gray-800 bg-gray-950/50 overflow-hidden hover:border-gray-700 transition-colors">
            {/* Where it sits in the order, and the cover that makes it recognisable. */}
            <div className="flex items-center justify-center w-9 flex-shrink-0 border-r border-gray-800/70 text-[--muted]">
                <span className="text-sm font-semibold tabular-nums">{position}</span>
            </div>

            {entry.coverImage ? (
                <a href={href} className="py-3 flex-shrink-0" title={entry.title}>
                    <div className="w-[54px] h-[76px] rounded-md overflow-hidden bg-gray-800/70 border border-gray-700/60">
                        <SeaImage
                            src={entry.coverImage}
                            alt={entry.title}
                            width={54}
                            height={76}
                            className="w-full h-full object-cover"
                        />
                    </div>
                </a>
            ) : null}

            {/* The description — what "should I watch this?" is answered from. */}
            <div className="flex-1 min-w-0 py-3">
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
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-2 text-xs text-[--muted]">
                    {entry.format && <span className="px-1.5 py-px rounded-full bg-white/[0.06] text-gray-300">{entry.format}</span>}
                    {!!entry.episodes && <span className="tabular-nums">{entry.episodes} ep{entry.episodes === 1 ? "" : "s"}</span>}
                    {!!entry.seasonYear && <span className="tabular-nums">{entry.seasonYear}</span>}
                </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0 pr-3">
                {/* The order is a pair of buttons: a drag over thousands of rows is a scroll
                    problem, and a move is one request either way. */}
                {!readOnly && (
                    <div className="flex flex-col gap-0.5">
                        <button
                            onClick={onMoveUp}
                            disabled={!onMoveUp}
                            className="w-6 h-6 rounded-md flex items-center justify-center text-[--muted] hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            title="Move up"
                        >
                            <LuChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={onMoveDown}
                            disabled={!onMoveDown}
                            className="w-6 h-6 rounded-md flex items-center justify-center text-[--muted] hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            title="Move down"
                        >
                            <LuChevronDown className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
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
