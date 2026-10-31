import { EnqueueFuture_Item, EnqueueFuture_Status } from "@/api/generated/types"
import { useGetEnqueueFutureCatalogWaiting } from "@/api/hooks/enqueue_future.hooks"
import { EnqueueFutureItemActions } from "@/app/(main)/enqueue-future/_components/enqueue-future-item-actions"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { TextInput } from "@/components/ui/text-input"
import { useDebounce } from "@/hooks/use-debounce"
import React from "react"
import { LuChevronDown, LuHourglass, LuSearch } from "react-icons/lu"
import { Virtuoso } from "react-virtuoso"

/**
 * The catalog rows nothing has got to yet. There can be twenty thousand of them, so they are kept out
 * of the queue below and read here a page at a time, only once the panel is opened.
 *
 * Any of them can be opened and torrented now: it searches live, the way the anime page does.
 */
export function EnqueueFutureWaiting({ status, activeMediaId, onSelect, onDone }: {
    status: EnqueueFuture_Status | undefined
    activeMediaId: number | undefined
    onSelect: (item: EnqueueFuture_Item) => void
    onDone: (mediaId: number) => void
}) {
    const [open, setOpen] = React.useState(false)
    const [search, setSearch] = React.useState("")
    const debouncedSearch = useDebounce(search.trim(), 300)

    const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useGetEnqueueFutureCatalogWaiting({
        search: debouncedSearch,
        enabled: open,
        isActive: !!status?.catalog?.active,
    })

    const items = React.useMemo(() => {
        // A row can land on two pages when a refetch lands while the worker is taking rows.
        const byId = new Map((data?.pages ?? []).flatMap(page => page?.items ?? []).map(item => [item.mediaId, item]))
        return [...byId.values()]
    }, [data])

    const waiting = status?.catalog?.waiting ?? 0
    if (!waiting && !open) return null

    const total = data?.pages[0]?.total

    return (
        <div className="rounded-[--radius-md] border bg-gray-950" data-enqueue-future-waiting>
            <button
                type="button"
                className="w-full flex items-center justify-between gap-2 p-4 text-left"
                aria-expanded={open}
                onClick={() => setOpen(v => !v)}
                data-enqueue-future-waiting-toggle
            >
                <span className="font-semibold flex items-center gap-2">
                    <LuHourglass className="flex-none" /> Waiting ({waiting.toLocaleString()})
                </span>
                <LuChevronDown className={cn("flex-none transition-transform", open && "rotate-180")} />
            </button>

            {open && (
                <div className="px-4 pb-4 space-y-3">
                    <TextInput
                        value={search}
                        onValueChange={setSearch}
                        leftIcon={<LuSearch />}
                        placeholder="Search by title"
                        data-enqueue-future-waiting-search
                    />

                    {isLoading && <LoadingSpinner />}

                    {!isLoading && !items.length && (
                        <p className="text-sm text-[--muted] py-4 text-center">
                            {debouncedSearch ? "Nothing waiting matches that." : "Nothing is waiting."}
                        </p>
                    )}

                    {!!items.length && (
                        <>
                            {debouncedSearch && total !== undefined && (
                                <p className="text-xs text-[--muted]">{total.toLocaleString()} found</p>
                            )}
                            <Virtuoso
                                style={{ height: "20rem" }}
                                data={items}
                                computeItemKey={(_, item) => item.mediaId}
                                endReached={() => {
                                    if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
                                }}
                                itemContent={(_, item) => (
                                    <WaitingRow
                                        item={item}
                                        isActive={item.mediaId === activeMediaId}
                                        onSelect={onSelect}
                                        onDone={onDone}
                                    />
                                )}
                            />
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

function WaitingRow({ item, isActive, onSelect, onDone }: {
    item: EnqueueFuture_Item
    isActive: boolean
    onSelect: (item: EnqueueFuture_Item) => void
    onDone: (mediaId: number) => void
}) {
    // Downloading, downloaded or in the library: nothing to decide, the same as a greyed queue row.
    const settled = !!item.downloadState

    return (
        <div
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
            className={cn(
                "group/enqueue-future-row flex items-center gap-3 p-2 text-left transition",
                settled
                    ? "opacity-40 cursor-default"
                    : "cursor-pointer hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[--brand]",
                isActive && "bg-gray-800",
            )}
            data-enqueue-future-waiting-item
        >
            {item.coverImage
                ? <img
                    src={item.coverImage}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-12 w-9 rounded-[--radius] object-cover block flex-none"
                />
                : <div className="h-12 w-9 rounded-[--radius] bg-gray-800 flex-none" />}

            <span className="flex-1 min-w-0">
                <span className={cn("block truncate text-sm", isActive && "font-semibold")}>
                    {item.title || `#${item.mediaId}`}
                </span>
                <span className="block text-xs text-[--muted]">
                    {settled ? "Already downloaded or downloading" : "Waiting to be prepared — opens with a live search"}
                </span>
            </span>

            <span className={cn(
                "flex-none opacity-0 transition-opacity",
                "group-hover/enqueue-future-row:opacity-100 focus-within:opacity-100",
                isActive && "opacity-100",
            )}>
                <EnqueueFutureItemActions item={item} compact onDone={() => onDone(item.mediaId)} />
            </span>
        </div>
    )
}
