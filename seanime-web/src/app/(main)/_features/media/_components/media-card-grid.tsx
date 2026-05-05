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
    const [visibleIndices, setVisibleIndices] = React.useState<Set<number>>(new Set())
    const [itemHeights, setItemHeights] = React.useState<Map<number, number>>(new Map())
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

    // Initialize visible indices with first row
    React.useEffect(() => {
        const initialVisibleIndices = new Set(
            Array.from(Array(Math.min(initialColumns, itemCount)).keys()),
        )
        setVisibleIndices(initialVisibleIndices)

        // Clear heights when component unmounts
        return () => {
            setItemHeights(new Map())
        }
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
            entries.forEach(entry => {
                const index = parseInt(entry.target.getAttribute("data-index") ?? "-1")

                if (entry.isIntersecting) {
                    // Add to visible indices
                    setVisibleIndices(prev => {
                        const updated = new Set(prev)
                        updated.add(index)
                        return updated
                    })
                } else {
                    // Remove from visible indices when scrolled out
                    setVisibleIndices(prev => {
                        const updated = new Set(prev)
                        // Keep initial row always visible
                        if (index >= initialColumns) {
                            updated.delete(index)
                        }
                        return updated
                    })
                }
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

    // Function to update item heights
    const updateItemHeight = React.useCallback((index: number, height: number) => {
        setItemHeights(prev => {
            const updated = new Map(prev)
            updated.set(index, height)
            return updated
        })
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
                    const storedHeight = itemHeights.get(index)

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
                                        // Measure and store height when first rendered
                                        if (el && !storedHeight) {
                                            updateItemHeight(index, el.offsetHeight)
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
