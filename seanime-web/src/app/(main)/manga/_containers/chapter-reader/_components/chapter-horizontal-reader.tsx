import { Manga_PageContainer } from "@/api/generated/types"
import { ChapterPage } from "@/app/(main)/manga/_containers/chapter-reader/_components/chapter-page"
import { usePageTurnTrack } from "@/app/(main)/manga/_containers/chapter-reader/_components/use-page-turn-track"
import { useHandleChapterPageStatus, useHydrateMangaPaginationMap } from "@/app/(main)/manga/_lib/handle-chapter-reader"
import {
    __manga_currentPageIndexAtom,
    __manga_currentPaginationMapIndexAtom,
    __manga_hiddenBarAtom,
    __manga_isLastPageAtom,
    __manga_kbsPageLeft,
    __manga_kbsPageRight,
    __manga_pageGapAtom,
    __manga_pageGapShadowAtom,
    __manga_paginationMapAtom,
    __manga_readingDirectionAtom,
    __manga_readingModeAtom,
    MangaReadingDirection,
    MangaReadingMode,
} from "@/app/(main)/manga/_lib/manga-chapter-reader.atoms"
import { cn } from "@/components/ui/core/styling"
import { isMobile } from "@/lib/utils/browser-detection"
import { useAtom, useAtomValue, useSetAtom } from "jotai/react"
import mousetrap from "mousetrap"
import React from "react"
import { useUpdateEffect } from "react-use"

export type MangaHorizontalReaderProps = {
    pageContainer: Manga_PageContainer | undefined
}

export function MangaHorizontalReader({ pageContainer }: MangaHorizontalReaderProps) {
    const containerRef = React.useRef<HTMLDivElement>(null)
    const pageWrapperRef = React.useRef<HTMLDivElement>(null)

    const readingMode = useAtomValue(__manga_readingModeAtom)
    const setIsLastPage = useSetAtom(__manga_isLastPageAtom)
    const readingDirection = useAtomValue(__manga_readingDirectionAtom)
    // Paged modes always fit the page to the height left by the reader bar: no vertical scroll.
    // The Page Fit setting is shared with the long-strip reader (whose desktop default overflows),
    // so it is not read here.
    const pageGap = useAtomValue(__manga_pageGapAtom)
    const pageGapShadow = useAtomValue(__manga_pageGapShadowAtom)

    const [hiddenBar, setHideBar] = useAtom(__manga_hiddenBarAtom)

    const kbsPageLeft = useAtomValue(__manga_kbsPageLeft)
    const kbsPageRight = useAtomValue(__manga_kbsPageRight)

    // Global page index
    const setCurrentPageIndex = useSetAtom(__manga_currentPageIndexAtom)

    const paginationMap = useAtomValue(__manga_paginationMapAtom)

    /**
     * For this horizontal reader [currentMapIndex] is the actual variable that controls what pages are displayed
     * [currentPageIndex] is updated AFTER [currentMapIndex] changes
     */
    const [currentMapIndex, setCurrentMapIndex] = useAtom(__manga_currentPaginationMapIndexAtom)

    useHydrateMangaPaginationMap(pageContainer)

    const { handlePageLoad } = useHandleChapterPageStatus(pageContainer)

    // Phones get an animated page track: the neighbouring spreads sit beside the current one and
    // page turns slide in the reading direction, following the finger during a swipe.
    const animated = React.useMemo(() => isMobile(), [])

    /**
     * When the current map index changes, scroll to the top of the container
     */
    useUpdateEffect(() => {
        containerRef.current?.scrollTo({ top: 0 })
    }, [currentMapIndex])

    /**
     * Set [isLastPage] state when the current map index changes
     */
    React.useEffect(() => {
        setIsLastPage(Object.keys(paginationMap).length > 0 && currentMapIndex === Object.keys(paginationMap).length - 1)
    }, [currentMapIndex, paginationMap])

    /**
     * Function to handle page navigation when the user clicks on the left or right side of the page
     */
    const onPaginate = React.useCallback((dir: "left" | "right") => {
        const shouldDecrement = dir === "left" && readingDirection === MangaReadingDirection.LTR || dir === "right" && readingDirection === MangaReadingDirection.RTL

        setCurrentMapIndex((draft) => {
            const newIdx = shouldDecrement ? draft - 1 : draft + 1
            if (paginationMap.hasOwnProperty(newIdx)) {
                return newIdx
            }
            return draft
        })
    }, [paginationMap, readingDirection])

    const pageTurn = usePageTurnTrack({
        enabled: animated,
        wrapperRef: pageWrapperRef,
        currentMapIndex,
        paginationMap,
        resetKey: pageContainer,
        rtl: readingDirection === MangaReadingDirection.RTL,
        onSwipe: onPaginate,
    })

    /**
     * Key bindings for page navigation
     */
    React.useEffect(() => {
        mousetrap.bind(kbsPageLeft, () => onPaginate("left"))
        mousetrap.bind(kbsPageRight, () => onPaginate("right"))
        mousetrap.bind("up", () => {
            containerRef.current?.scrollBy(0, -100)
        })
        mousetrap.bind("down", () => {
            containerRef.current?.scrollBy(0, 100)
        })

        return () => {
            mousetrap.unbind(kbsPageLeft)
            mousetrap.unbind(kbsPageRight)
            mousetrap.unbind("up")
            mousetrap.unbind("down")
        }
    }, [kbsPageLeft, kbsPageRight, paginationMap, readingDirection])

    /**
     * Function to handle page navigation when the user clicks on the left or right side of the page
     */
    const onPageWrapperClick = React.useCallback((e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        if (!pageWrapperRef.current) return
        if (pageTurn.consumeClick()) return

        if ((e.target as HTMLElement).id === "retry-button") return
        if ((e.target as HTMLElement).id === "retry-icon") return

        const { clientX } = e.nativeEvent
        const divWidth = pageWrapperRef.current.offsetWidth
        const clickPosition = clientX - pageWrapperRef.current.getBoundingClientRect().left
        const clickPercentage = (clickPosition / divWidth) * 100

        if (clickPercentage <= 40) {
            onPaginate("left")
        } else if (clickPercentage >= 60) {
            onPaginate("right")
        } else {
            if (!isMobile()) {
                setHideBar(prev => !prev)
            }
        }
    }, [onPaginate, pageWrapperRef.current, pageTurn.consumeClick])

    /**
     * Update the current page index when the current map index changes
     */
    React.useEffect(() => {
        if (!pageContainer?.pages?.length) return

        const currentPages = paginationMap[currentMapIndex]
        if (!currentPages) return

        setCurrentPageIndex(currentPages[0])
    }, [currentMapIndex])

    // Current page indexes displayed
    const currentPages = React.useMemo(() => paginationMap[currentMapIndex], [currentMapIndex, paginationMap])
    // Two pages are currently displayed
    const twoPages = readingMode === MangaReadingMode.DOUBLE_PAGE && currentPages?.length === 2

    // Pages in reading order
    const sortedPages = React.useMemo(() => pageContainer?.pages?.toSorted((a, b) => a.index - b.index) ?? [], [pageContainer?.pages])
    // Spreads in order (animated track)
    const spreadIndexes = React.useMemo(() => Object.keys(paginationMap).map(Number).sort((a, b) => a - b), [paginationMap])

    /** One page, laid out as part of [spread] (the page indexes displayed together with it). */
    const renderPage = (page: (typeof sortedPages)[number], index: number, spread: number[] | undefined, visible: boolean) => {
        const spreadTwo = readingMode === MangaReadingMode.DOUBLE_PAGE && spread?.length === 2
        const spreadShadows = spreadTwo && pageGap && pageGapShadow
        return (
            <ChapterPage
                key={page.url}
                page={page}
                index={index}
                readingMode={readingMode}
                pageContainer={pageContainer}
                onFinishedLoading={() => {
                    handlePageLoad(index)
                }}
                containerClass={cn(
                    "w-full h-[calc(100dvh-3rem)] scroll-div min-h-[200px] relative page",
                    hiddenBar && "h-dvh max-h-full",
                    "focus-visible:outline-none",
                    !visible ? "hidden" : "displayed",
                    // Double Page, gap
                    (spreadShadows && readingMode === MangaReadingMode.DOUBLE_PAGE && spread?.[0] === index)
                    && "before:content-[''] before:absolute before:w-[3%] before:z-[5] before:h-full before:[background:_linear-gradient(-90deg,_rgba(17,_17,_17,_0)_0,_rgba(17,_17,_17,_.3)_100%)]",
                    (spreadShadows && readingMode === MangaReadingMode.DOUBLE_PAGE && spread?.[1] === index)
                    && "before:content-[''] before:absolute before:right-0 before:w-[3%] before:z-[5] before:h-full before:[background:_linear-gradient(90deg,_rgba(17,_17,_17,_0)_0,_rgba(17,_17,_17,_.3)_100%)]",
                )}
                imageClass={cn(
                    "focus-visible:outline-none",
                    "inset-0 object-center select-none z-[4] relative",
                    // Fit to height: the whole page inside the area left by the reader bar
                    "object-contain w-full h-full",
                    // Double page: the two halves meet at the spine
                    (spreadTwo && spread?.[0] === index) && "[object-position:0%_50%]",
                    (spreadTwo && spread?.[1] === index) && "[object-position:100%_50%]",
                )}
            />
        )
    }

    return (
        <div
            data-chapter-horizontal-reader-container
            className={cn(
                "h-[calc(100dvh-3rem)] overflow-hidden w-full px-4 select-none relative",
                hiddenBar && "h-dvh max-h-full",
                "focus-visible:outline-none",
            )}
            ref={containerRef}
            tabIndex={-1}
        >
            {/*<div className="absolute w-full h-full right-8 flex z-[5] cursor-pointer" tabIndex={-1}>*/}
            {/*    <div className="h-full w-full flex flex-1 focus-visible:outline-none" onClick={() => onPaginate("left")} tabIndex={-1} />*/}
            {/*    <div className="h-full w-full flex flex-1 focus-visible:outline-none" onClick={() => onPaginate("right")} tabIndex={-1} />*/}
            {/*</div>*/}
            <div
                data-chapter-horizontal-reader-page-wrapper
                className={cn(
                    "focus-visible:outline-none",
                    !animated && twoPages && readingMode === MangaReadingMode.DOUBLE_PAGE && "flex transition-transform duration-300",
                    !animated && twoPages && readingMode === MangaReadingMode.DOUBLE_PAGE && pageGap && "gap-2",
                    !animated && twoPages && readingMode === MangaReadingMode.DOUBLE_PAGE && "flex-row-reverse",
                    animated && "relative",
                )}
                // Vertical panning and pinch stay with the browser; horizontal moves drive the track
                style={animated ? { touchAction: "pan-y pinch-zoom" } : undefined}
                ref={pageWrapperRef}
                onClick={onPageWrapperClick}
                {...pageTurn.handlers}
            >
                {!animated && sortedPages.map((page, index) => renderPage(page, index, currentPages, !!currentPages?.includes(index)))}
                {animated && spreadIndexes.map(mapIndex => {
                    const spread = paginationMap[mapIndex]
                    const offset = mapIndex - currentMapIndex
                    const near = Math.abs(offset) <= 1
                    const spreadTwo = readingMode === MangaReadingMode.DOUBLE_PAGE && spread?.length === 2
                    return (
                        <div
                            key={mapIndex}
                            data-chapter-horizontal-reader-spread={mapIndex}
                            className={cn(
                                "w-full",
                                // Neighbours sit one screen to either side, off-screen until a turn pulls them in
                                offset !== 0 && "absolute inset-x-0 top-0 pointer-events-none",
                                spreadTwo && "flex flex-row-reverse",
                                spreadTwo && pageGap && "gap-2",
                                // Last, so it wins over "flex" in the class merge
                                !near && "hidden",
                            )}
                            style={offset !== 0 && near ? { transform: pageTurn.slotTransform(offset) } : undefined}
                            aria-hidden={offset !== 0}
                        >
                            {spread?.map(index => sortedPages[index] ? renderPage(sortedPages[index], index, spread, true) : null)}
                        </div>
                    )
                })}
            </div>

        </div>
    )
}
