import { MediaCardLazyGrid } from "@/app/(main)/_features/media/_components/media-card-grid"
import { Pagination, PaginationEllipsis, PaginationItem, PaginationTrigger } from "@/components/ui/pagination"
import { formatNumber } from "@/lib/helpers/number"
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
export function usePaginatedItems<T>(items: T[] | undefined, pageSize: number = LIBRARY_PAGE_SIZE, persistKey?: string) {
    const all = React.useMemo(() => items ?? [], [items])

    // The page is remembered for the browser session, per screen and per grid on it, so opening an
    // entry from page 4 and pressing Back lands on page 4 again rather than page 1. The grid is
    // unmounted while the entry page is shown, so plain state alone always came back as 1.
    const autoKey = React.useId()
    const storageKey = React.useMemo(() => {
        if (typeof window === "undefined") return null
        return `sea-library-page:${window.location.pathname}${window.location.search}|${persistKey ?? autoKey}`
    }, [persistKey, autoKey])
    const [page, setPageState] = React.useState(() => readStoredPage(storageKey))
    const setPage = React.useCallback((next: number) => {
        setPageState(next)
        writeStoredPage(storageKey, next)
    }, [storageKey])

    const pageCount = Math.max(1, Math.ceil(all.length / pageSize))

    React.useEffect(() => {
        // Not while the list is still empty: coming back to a library, the collection is reloading
        // for a moment, and clamping then threw the remembered page away before the items arrived.
        if (all.length > 0 && page > pageCount) setPage(1)
    }, [pageCount, page, all.length, setPage])

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

function readStoredPage(key: string | null): number {
    if (!key) return 1
    try {
        const value = Number(window.sessionStorage.getItem(key))
        return Number.isInteger(value) && value > 1 ? value : 1
    } catch {
        return 1
    }
}

function writeStoredPage(key: string | null, page: number) {
    if (!key) return
    try {
        if (page > 1) window.sessionStorage.setItem(key, String(page))
        else window.sessionStorage.removeItem(key)
    } catch {
        // Storage blocked (private mode, full): the page simply isn't remembered.
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
    /** Which card width the grid uses (see MediaCardGrid). */
    type?: "anime" | "manga"
    /**
     * Names this grid for remembering its page. Optional: without it the grid's place in the
     * screen is used, which is stable as long as the screen's layout is.
     */
    persistKey?: string
}

/**
 * A media grid split into real pages rather than an endlessly growing lazy-loaded list.
 * Used by the local anime and manga libraries, which can hold thousands of series.
 */
export function PaginatedMediaGrid<T>({ items, renderItem, pageSize = LIBRARY_PAGE_SIZE, gridProps, scrollTargetSelector, type, persistKey }: PaginatedMediaGridProps<T>) {

    const { pageItems, page, pageCount, setPage, total, isPaginated } = usePaginatedItems(items, pageSize, persistKey)

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
            <MediaCardLazyGrid itemCount={pageItems.length} type={type} {...gridProps}>
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
                        Page {formatNumber(page)} of {formatNumber(pageCount)} — {formatNumber(total)} series
                    </p>
                </div>
            )}
        </>
    )
}
