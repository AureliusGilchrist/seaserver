import { LuffyError } from "@/components/shared/luffy-error"
import { cn } from "@/components/ui/core/styling"
import { Skeleton } from "@/components/ui/skeleton"
import React from "react"

// Cards in a grid are the width set in Personal -> Display (see card-size.tsx and the
// `.sea-card-grid` utility): fixed-width columns, as many as fit, so a card is the same size here as
// in every carousel. `type` picks the anime or manga width; left out, the grid inherits whichever
// type an ancestor set (the manga pages set manga), defaulting to anime.

type MediaCardGridProps = {
    children?: React.ReactNode
    /** Kept for callers; columns now follow the card width. */
    maxCol?: number
    type?: "anime" | "manga"
} & React.HTMLAttributes<HTMLDivElement>

function typeClass(type: "anime" | "manga" | undefined) {
    return type === "manga" ? "sea-card-manga" : type === "anime" ? "sea-card-anime" : undefined
}

export function MediaCardGrid(props: MediaCardGridProps) {

    const {
        children,
        maxCol: _maxCol,
        type,
        className,
        ...rest
    } = props

    if (React.Children.toArray(children).length === 0) {
        return <LuffyError title={null}>
            <p>Nothing to see</p>
        </LuffyError>
    }

    return (
        <>
            <div
                data-media-card-grid
                className={cn("sea-card-grid", typeClass(type), className)}
                {...rest}
            >
                {children}
            </div>
        </>
    )
}

type MediaCardLazyGridProps = {
    children: React.ReactNode
    itemCount: number
    containerRef?: React.RefObject<HTMLElement>
    maxCol?: number
    type?: "anime" | "manga"
} & React.HTMLAttributes<HTMLDivElement>;

export function MediaCardLazyGrid({
    children,
    itemCount,
    ...rest
}: MediaCardLazyGridProps) {
    if (itemCount === 0) {
        return <LuffyError title={null}>
            <p>Nothing to see</p>
        </LuffyError>
    }

    if (itemCount <= 48) {
        return (
            <MediaCardGrid {...rest}>
                {children}
            </MediaCardGrid>
        )
    }

    return (
        <MediaCardLazyGridRenderer itemCount={itemCount} {...rest}>
            {children}
        </MediaCardLazyGridRenderer>
    )
}

export function MediaCardLazyGridRenderer({
    children,
    itemCount,
    maxCol: _maxCol,
    type,
    ...rest
}: MediaCardLazyGridProps) {
    // Once an item has been rendered it stays rendered.
    //
    // This used to drop items back to a skeleton as they scrolled out, and the skeleton is not the
    // height of the card it replaced — so removing one moved everything below it, which pulled other
    // items across the observer's edge, which swapped those, which moved everything again. A grid
    // large enough to fill the screen never settled: cards flickering in and out every second or so,
    // permanently, without anybody scrolling.
    //
    // Keeping them costs the memory of the cards you have actually scrolled past, which is what the
    // non-lazy grid above costs for every list under 48 items anyway. The laziness that matters —
    // not building three hundred cards on first paint — is untouched.
    const [visibleIndices, setVisibleIndices] = React.useState<Set<number>>(new Set())
    // Measured heights live in a ref rather than in state: they are read while rendering a skeleton
    // and never need to cause a render of their own. As state, they were written from a ref callback
    // during commit — a set-state-on-every-render loop that the height check only sometimes stopped.
    const itemHeightsRef = React.useRef<Map<number, number>>(new Map())
    const gridRef = React.useRef<HTMLDivElement>(null)
    const itemRefs = React.useRef<(HTMLDivElement | null)[]>([])
    const observerRef = React.useRef<IntersectionObserver | null>(null)

    // How many columns the grid has right now: the browser lays the columns out from the card
    // width, so ask it, and ask again when the grid or the card size changes.
    const [initialColumns, setInitialColumns] = React.useState(() => Math.max(2, Math.floor(window.innerWidth / 236)))
    React.useEffect(() => {
        const el = gridRef.current
        if (!el) return
        const measure = () => {
            const cols = getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length
            if (cols > 0) setInitialColumns(prev => prev === cols ? prev : cols)
        }
        measure()
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    // Seed the first row. Merged into whatever is already visible rather than replacing it, so a
    // change in column count cannot un-render everything the user has already scrolled past.
    React.useEffect(() => {
        setVisibleIndices(prev => {
            const updated = new Set(prev)
            for (let i = 0; i < Math.min(initialColumns, itemCount); i++) {
                updated.add(i)
            }
            return updated.size === prev.size ? prev : updated
        })
    }, [initialColumns, itemCount])

    // Intersection Observer to track which items become visible
    React.useEffect(() => {
        if (!gridRef.current) return

        const observerOptions = {
            root: null,
            rootMargin: "200px 0px",
            threshold: 0,
        }

        observerRef.current = new IntersectionObserver((entries) => {
            const arrived: number[] = []
            for (const entry of entries) {
                if (!entry.isIntersecting) continue
                const index = parseInt(entry.target.getAttribute("data-index") ?? "-1")
                if (index >= 0) arrived.push(index)
            }
            if (arrived.length === 0) return

            // Additive only — see the note on visibleIndices. Returning the previous set unchanged
            // when nothing is new keeps a scroll from re-rendering the whole grid for no reason.
            setVisibleIndices(prev => {
                if (arrived.every(index => prev.has(index))) return prev
                const updated = new Set(prev)
                for (const index of arrived) updated.add(index)
                return updated
            })
        }, observerOptions)

        // Observe all items
        itemRefs.current.forEach(ref => {
            if (ref) observerRef.current?.observe(ref)
        })

        return () => {
            observerRef.current?.disconnect()
        }
    }, [itemCount, initialColumns])

    // Records a rendered item's height so the skeletons below it can be sized like real cards rather
    // than like a 300px guess. A ref write, so measuring never causes a render.
    const recordItemHeight = React.useCallback((index: number, height: number) => {
        if (height > 0) {
            itemHeightsRef.current.set(index, height)
        }
    }, [])

    const limitedLazyGridClasses = cn("sea-card-grid", typeClass(type))

    return (
        <div data-media-card-lazy-grid-renderer {...rest}>
            <div
                data-media-card-lazy-grid className={limitedLazyGridClasses} ref={gridRef}
            >
                {React.Children.map(children, (child, index) => {
                    const isVisible = visibleIndices.has(index)
                    // The tallest card measured so far, so an unrendered slot reserves a realistic
                    // amount of space. Any measurement is a better guess than the fixed fallback.
                    const storedHeight = itemHeightsRef.current.get(index)
                        ?? itemHeightsRef.current.values().next().value

                    return (
                        <div
                            data-media-card-lazy-grid-item
                            ref={el => { itemRefs.current[index] = el }}
                            data-index={index}
                            key={!!(child as React.ReactElement)?.key ? (child as React.ReactElement)?.key : index}
                            className="transition-all duration-300 ease-in-out"
                        >
                            {isVisible ? (
                                <div
                                    data-media-card-lazy-grid-item-content
                                    ref={(el) => {
                                        // Measure once, into a ref. Nothing re-renders because of it.
                                        if (el && !itemHeightsRef.current.has(index)) {
                                            recordItemHeight(index, el.offsetHeight)
                                        }
                                    }}
                                >
                                    {child}
                                </div>
                            ) : (
                                <Skeleton
                                    data-media-card-lazy-grid-item-skeleton
                                    className="w-full"
                                    style={{
                                        height: storedHeight || "300px",
                                    }}
                                ></Skeleton>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
