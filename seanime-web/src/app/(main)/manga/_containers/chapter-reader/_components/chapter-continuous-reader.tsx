import { Manga_PageContainer } from "@/api/generated/types"
import { ChapterPage } from "@/app/(main)/manga/_containers/chapter-reader/_components/chapter-page"
import { ___manga_scrollSignalAtom } from "@/app/(main)/manga/_containers/chapter-reader/_components/chapter-vertical-reader"
import { useHandleChapterPageStatus, useHydrateMangaPaginationMap } from "@/app/(main)/manga/_lib/handle-chapter-reader"
import {
    __manga_currentPageIndexAtom,
    __manga_hiddenBarAtom,
    __manga_isLastPageAtom,
    __manga_kbsPageLeft,
    __manga_kbsPageRight,
    __manga_pageGapAtom,
    __manga_paginationMapAtom,
    __manga_readingDirectionAtom,
    MangaReadingDirection,
} from "@/app/(main)/manga/_lib/manga-chapter-reader.atoms"
import { cn } from "@/components/ui/core/styling"
import { isMobile } from "@/lib/utils/browser-detection"
import { useAtom, useAtomValue, useSetAtom } from "jotai/react"
import mousetrap from "mousetrap"
import React from "react"
import { useEffectOnce, useUpdateEffect } from "react-use"

export type MangaContinuousReaderProps = {
    pageContainer: Manga_PageContainer | undefined
}

/**
 * MangaContinuousReader component
 *
 * The "infinite scroll" reading mode: every page of the chapter laid side by side in one
 * horizontally scrollable strip, read in one continuous motion rather than page by page. The
 * reading direction setting decides which way the strip flows — LTR pages run left to right,
 * RTL pages run right to left like translated manga.
 *
 * Sizing is fixed here rather than driven by the page-fit setting: pages are fit to the
 * viewport height at their natural aspect, which is the only sizing that makes sense for a
 * horizontal strip on any screen.
 */
export function MangaContinuousReader({ pageContainer }: MangaContinuousReaderProps) {
    const containerRef = React.useRef<HTMLDivElement>(null)

    const setIsLastPage = useSetAtom(__manga_isLastPageAtom)
    const readingDirection = useAtomValue(__manga_readingDirectionAtom)
    const pageGap = useAtomValue(__manga_pageGapAtom)
    const isRtl = readingDirection === MangaReadingDirection.RTL

    const [currentPageIndex, setCurrentPageIndex] = useAtom(__manga_currentPageIndexAtom)
    const paginationMap = useAtom(__manga_paginationMapAtom)
    const [hiddenBar, setHideBar] = useAtom(__manga_hiddenBarAtom)

    const kbsPageLeft = useAtomValue(__manga_kbsPageLeft)
    const kbsPageRight = useAtomValue(__manga_kbsPageRight)

    useHydrateMangaPaginationMap(pageContainer)

    const { handlePageLoad } = useHandleChapterPageStatus(pageContainer)

    const pageCount = pageContainer?.pages?.length ?? 0

    /**
     * When the reader mounts (reading mode changes), scroll to the current page
     */
    useEffectOnce(() => {
        if (currentPageIndex !== 0) {
            const pageDiv = containerRef.current?.querySelector(`#page-${currentPageIndex}`)
            pageDiv?.scrollIntoView()
        }
    })

    /**
     * When there is a signal (page picked from the bar), scroll to the current page
     */
    const scrollSignal = useAtomValue(___manga_scrollSignalAtom)
    useUpdateEffect(() => {
        const pageDiv = containerRef.current?.querySelector(`#page-${currentPageIndex}`)
        pageDiv?.scrollIntoView({ inline: "start" })
    }, [scrollSignal])

    /**
     * Scroll to a page. scrollIntoView resolves "start" against the container's direction, so
     * the same call works for both LTR and RTL strips.
     */
    const goToPage = React.useCallback((index: number) => {
        if (index < 0 || index >= pageCount) return
        const pageDiv = containerRef.current?.querySelector(`#page-${index}`)
        pageDiv?.scrollIntoView({ inline: "start" })
    }, [pageCount])

    const onPaginate = React.useCallback((dir: "left" | "right") => {
        const shouldDecrement = dir === "left" && !isRtl || dir === "right" && isRtl
        goToPage(currentPageIndex + (shouldDecrement ? -1 : 1))
    }, [currentPageIndex, goToPage, isRtl])

    /**
     * Track which page is in view and whether the end of the chapter has been reached, from the
     * page boxes' positions rather than scrollLeft — RTL scroll coordinates differ per engine,
     * and the rects mean the same thing in both directions.
     */
    const handleScroll = React.useCallback(() => {
        if (!containerRef.current || !pageCount) return
        const box = containerRef.current.getBoundingClientRect()
        const centerX = box.left + box.width / 2

        let visibleIndex = 0
        containerRef.current?.querySelectorAll(".scroll-div")?.forEach((div) => {
            const rect = div.getBoundingClientRect()
            if (rect.left <= centerX && rect.right >= centerX) {
                visibleIndex = Number(div.id.split("-")[1])
            }
        })
        setCurrentPageIndex(visibleIndex)

        const lastPageDiv = containerRef.current?.querySelector(`#page-${pageCount - 1}`)
        if (lastPageDiv) {
            // The chapter is finished when the last page has been scrolled fully into view —
            // the same test in both directions
            const rect = (lastPageDiv as HTMLElement).getBoundingClientRect()
            setIsLastPage(rect.left >= box.left - 10 && rect.right <= box.right + 10)
        } else {
            setIsLastPage(false)
        }
    }, [isRtl, pageCount, setIsLastPage, setCurrentPageIndex])

    // Reset isLastPage state when pages change
    React.useEffect(() => {
        setIsLastPage(false)
    }, [pageContainer?.pages])

    React.useEffect(() => {
        containerRef.current?.addEventListener("scroll", handleScroll, { passive: true })
        return () => containerRef.current?.removeEventListener("scroll", handleScroll)
    }, [handleScroll])

    /**
     * Key bindings for page navigation and free scrolling
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
    }, [kbsPageLeft, kbsPageRight, onPaginate, paginationMap])

    /**
     * Click the edges of the strip to move a page in that direction, mirroring the paged reader.
     * A center click toggles the bar on non-mobile, like the other readers.
     */
    const onContainerClick = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).id === "retry-button") return
        if ((e.target as HTMLElement).id === "retry-icon") return

        const box = containerRef.current?.getBoundingClientRect()
        if (!box || box.width === 0) return

        const clickPercentage = ((e.clientX - box.left) / box.width) * 100

        if (clickPercentage <= 40) {
            onPaginate("left")
        } else if (clickPercentage >= 60) {
            onPaginate("right")
        } else {
            if (!isMobile()) {
                setHideBar(prev => !prev)
            }
        }
    }, [onPaginate, setHideBar])

    return (
        <div
            data-chapter-continuous-reader-container
            className={cn(
                "h-[calc(100dvh-3rem)] overflow-hidden relative w-full focus-visible:outline-none",
                hiddenBar && "h-dvh",
            )}
            tabIndex={-1}
        >
            <div
                ref={containerRef}
                data-chapter-continuous-reader-inner-container
                dir={isRtl ? "rtl" : "ltr"}
                className={cn(
                    "w-full h-full overflow-x-auto overflow-y-hidden flex items-center select-none relative focus-visible:outline-none",
                    "px-4",
                    pageGap && "gap-4",
                    isMobile() && "hide-scrollbar",
                )}
                onClick={onContainerClick}
                tabIndex={-1}
            >
                {pageContainer?.pages?.map((page, index) => (
                    <ChapterPage
                        key={page.url}
                        page={page}
                        index={index}
                        readingMode={"continuous"}
                        pageContainer={pageContainer}
                        onFinishedLoading={() => {
                            handlePageLoad(index)
                        }}
                        containerClass="scroll-div relative h-full shrink-0 min-w-[200px] focus-visible:outline-none"
                        imageClass="h-full w-auto object-contain object-center mx-auto select-none z-[4] relative focus-visible:outline-none"
                    />
                ))}
            </div>
        </div>
    )
}
