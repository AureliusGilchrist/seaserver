import { MediaCardLazyGrid } from "@/app/(main)/_features/media/_components/media-card-grid"
import { Pagination, PaginationEllipsis, PaginationItem, PaginationTrigger } from "@/components/ui/pagination"
import React from "react"

/** Series shown per page in the local anime and manga libraries. */
export const LIBRARY_PAGE_SIZE = 48

/**
 * Splits a list into fixed-size pages and keeps the current page in range.
 *
 * The page resets to 1 whenever the total shrinks past it, which happens constantly in the
 * libraries as the user types in the search box or switches genre/status filters — without
 * that, filtering down to a handful of entries while on page 7 would show an empty grid.
 */
export function usePaginatedItems<T>(items: T[] | undefined, pageSize: number = LIBRARY_PAGE_SIZE) {
    const all = React.useMemo(() => items ?? [], [items])
    const [page, setPage] = React.useState(1)

    const pageCount = Math.max(1, Math.ceil(all.length / pageSize))

    React.useEffect(() => {
        if (page > pageCount) setPage(1)
    }, [pageCount, page])

    const currentPage = Math.min(page, pageCount)

    const pageItems = React.useMemo(() => {
        const start = (currentPage - 1) * pageSize
        return all.slice(start, start + pageSize)
    }, [all, currentPage, pageSize])

    return {
        pageItems,
        page: currentPage,
        pageCount,
        setPage,
        total: all.length,
        isPaginated: all.length > pageSize,
    }
}

type PaginatedMediaGridProps<T> = {
    items: T[] | undefined
    renderItem: (item: T) => React.ReactNode
    pageSize?: number
    /** Forwarded to the grid so existing `data-*` hooks and styling keep working. */
    gridProps?: Record<string, any>
    /**
     * CSS selector for what to scroll to when the page changes, instead of the top of the document.
     *
     * A library grid usually sits below something that belongs with it — its stats row, its search
     * box — and the top of *that* is where a new page starts reading. Scrolling to the very top
     * instead throws away the whole header on the way past. Falls back to the top of the page when
     * the element is not there, which is what happens when the user has removed that widget from
     * their home layout.
     */
    scrollTargetSelector?: string
}

/**
 * A media grid split into real pages rather than an endlessly growing lazy-loaded list.
 * Used by the local anime and manga libraries, which can hold thousands of series.
 */
export function PaginatedMediaGrid<T>({ items, renderItem, pageSize = LIBRARY_PAGE_SIZE, gridProps, scrollTargetSelector }: PaginatedMediaGridProps<T>) {

    const { pageItems, page, pageCount, setPage, total, isPaginated } = usePaginatedItems(items, pageSize)

    const handlePageChange = React.useCallback((next: number) => {
        if (next < 1 || next > pageCount) return
        setPage(next)

        // Move to the start of the new page: the user is looking at a fresh set of series, and
        // staying scrolled halfway down a new page is disorienting.
        const target = scrollTargetSelector ? document.querySelector(scrollTargetSelector) : null
        if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "start" })
            return
        }
        window.scrollTo({ top: 0, behavior: "smooth" })
    }, [pageCount, setPage, scrollTargetSelector])

    // Windowed page numbers with ellipses, so a 40-page library doesn't render 40 buttons.
    const visiblePages = React.useMemo<(number | "ellipsis")[]>(() => {
        if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)

        const pages: (number | "ellipsis")[] = [1]
        const start = Math.max(2, page - 1)
        const end = Math.min(pageCount - 1, page + 1)

        if (start > 2) pages.push("ellipsis")
        for (let i = start; i <= end; i++) pages.push(i)
        if (end < pageCount - 1) pages.push("ellipsis")
        pages.push(pageCount)

        return pages
    }, [page, pageCount])

    return (
        <>
            <MediaCardLazyGrid itemCount={pageItems.length} {...gridProps}>
                {pageItems.map(renderItem)}
            </MediaCardLazyGrid>

            {isPaginated && (
                <div className="flex flex-col items-center gap-2 pt-6" data-paginated-media-grid-controls>
                    <Pagination>
                        <PaginationTrigger
                            direction="previous"
                            data-disabled={page === 1}
                            onClick={() => handlePageChange(page - 1)}
                        />
                        {visiblePages.map((p, idx) => (
                            p === "ellipsis"
                                ? <PaginationEllipsis key={`ellipsis-${idx}`} />
                                : <PaginationItem
                                    key={p}
                                    value={p}
                                    data-selected={page === p}
                                    onClick={() => handlePageChange(p)}
                                />
                        ))}
                        <PaginationTrigger
                            direction="next"
                            data-disabled={page === pageCount}
                            onClick={() => handlePageChange(page + 1)}
                        />
                    </Pagination>
                    <p className="text-[--muted] text-sm">
                        Page {page} of {pageCount} — {total} series
                    </p>
                </div>
            )}
        </>
    )
}
