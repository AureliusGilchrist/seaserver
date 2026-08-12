import { LuffyError } from "@/components/shared/luffy-error"
import { cn } from "@/components/ui/core/styling"
import { Skeleton } from "@/components/ui/skeleton"
import { animeCardSizeAtom, getGridSizeClasses } from "@/app/(main)/_atoms/card-size.atoms"
import { useAtomValue } from "jotai/react"
import React from "react"

// Fallback grid classes when card size atom is not available (server-side)
const gridClass = cn(
    "grid grid-cols-2 min-[768px]:grid-cols-3 min-[1080px]:grid-cols-4 min-[1320px]:grid-cols-5 min-[1750px]:grid-cols-6 min-[1850px]:grid-cols-7 min-[2000px]:grid-cols-8 gap-4",
)
const gridClassMax7 = cn(
    "grid grid-cols-2 min-[768px]:grid-cols-3 min-[1080px]:grid-cols-4 min-[1320px]:grid-cols-5 min-[1750px]:grid-cols-6 min-[1850px]:grid-cols-7 min-[2000px]:grid-cols-7 gap-4",
)
const gridClassMax6 = cn(
    "grid grid-cols-2 min-[768px]:grid-cols-3 min-[1080px]:grid-cols-4 min-[1320px]:grid-cols-5 min-[1750px]:grid-cols-6 min-[1850px]:grid-cols-6 min-[2000px]:grid-cols-6 gap-4",
)
const gridClassMax5 = cn(
    "grid grid-cols-2 min-[768px]:grid-cols-3 min-[1080px]:grid-cols-4 min-[1320px]:grid-cols-5 min-[1750px]:grid-cols-5 min-[1850px]:grid-cols-5 min-[2000px]:grid-cols-5 gap-4",
)
const gridClassMax4 = cn(
    "grid grid-cols-2 min-[768px]:grid-cols-3 min-[1080px]:grid-cols-4 min-[1320px]:grid-cols-4 min-[1750px]:grid-cols-4 min-[1850px]:grid-cols-4 min-[2000px]:grid-cols-4 gap-4",
)

type MediaCardGridProps = {
    children?: React.ReactNode
    maxCol?: number
} & React.HTMLAttributes<HTMLDivElement>

export function MediaCardGrid(props: MediaCardGridProps) {

    const {
        children,
        maxCol = 8,
        ...rest
    } = props

    const cardSize = useAtomValue(animeCardSizeAtom)
    const sizeGridClasses = getGridSizeClasses(cardSize)

    if (React.Children.toArray(children).length === 0) {
        return <LuffyError title={null}>
            <p>Nothing to see</p>
        </LuffyError>
    }

    // Apply maxCol limit to size-based grid classes
    const limitedGridClasses = cn(
        "grid gap-4",
        sizeGridClasses,
        maxCol === 4 && "min-[1320px]:grid-cols-4 min-[1750px]:grid-cols-4 min-[1850px]:grid-cols-4 min-[2000px]:grid-cols-4",
        maxCol === 5 && "min-[1750px]:grid-cols-5 min-[1850px]:grid-cols-5 min-[2000px]:grid-cols-5",
        maxCol === 6 && "min-[1750px]:grid-cols-6 min-[1850px]:grid-cols-6 min-[2000px]:grid-cols-6",
        maxCol === 7 && "min-[1850px]:grid-cols-7 min-[2000px]:grid-cols-7",
    )

    return (
        <>
            <div
                data-media-card-grid
                className={limitedGridClasses}
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
    maxCol = 8,
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

    const cardSize = useAtomValue(animeCardSizeAtom)
    const sizeGridClasses = getGridSizeClasses(cardSize)

    // Determine initial columns based on window width and card size
    const getInitialColumns = () => {
        const width = window.innerWidth
        // Map card size to approximate column count at 1750px breakpoint
        let baseCols: number
        if (cardSize <= 0.7) baseCols = 8
        else if (cardSize <= 0.85) baseCols = 7
        else if (cardSize <= 1.0) baseCols = 6
        else if (cardSize <= 1.15) baseCols = 5
        else baseCols = 4

        // Adjust for screen width
        if (width < 768) baseCols = 2
        else if (width < 1080) baseCols = Math.min(baseCols, 3)
        else if (width < 1320) baseCols = Math.min(baseCols, 4)
        else if (width < 1750) baseCols = Math.min(baseCols, 5)
        else if (width < 1850) baseCols = Math.min(baseCols, 6)
        else if (width < 2000) baseCols = Math.min(baseCols, 7)

        return Math.min(baseCols, maxCol)
    }

    const [initialColumns, setInitialColumns] = React.useState(getInitialColumns)

    // Update columns when card size changes
    React.useEffect(() => {
        setInitialColumns(getInitialColumns())
    }, [cardSize, maxCol])

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

    // Apply maxCol limit to size-based grid classes
    const limitedLazyGridClasses = cn(
        "grid gap-4",
        sizeGridClasses,
        maxCol === 4 && "min-[1320px]:grid-cols-4 min-[1750px]:grid-cols-4 min-[1850px]:grid-cols-4 min-[2000px]:grid-cols-4",
        maxCol === 5 && "min-[1750px]:grid-cols-5 min-[1850px]:grid-cols-5 min-[2000px]:grid-cols-5",
        maxCol === 6 && "min-[1750px]:grid-cols-6 min-[1850px]:grid-cols-6 min-[2000px]:grid-cols-6",
        maxCol === 7 && "min-[1850px]:grid-cols-7 min-[2000px]:grid-cols-7",
    )

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
