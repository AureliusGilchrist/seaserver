import React from "react"

const CLASS = "sea-no-root-scrollbar"

/**
 * Hides the page scrollbar while a profile banner is on screen.
 *
 * The banner already spans the whole content width; the strip left on its right is the document
 * scrollbar. Its track is transparent, so it shows the dark page canvas, and nothing can paint
 * underneath a classic scrollbar — `100vw` only adds a horizontal scroll. Without the scrollbar the
 * content (and the banner) reaches the window edge. The page still scrolls by wheel, touch and keys.
 */
export function useFlushBanner(enabled: boolean) {
    React.useEffect(() => {
        if (!enabled) return
        const root = document.documentElement
        root.classList.add(CLASS)
        return () => root.classList.remove(CLASS)
    }, [enabled])
}
