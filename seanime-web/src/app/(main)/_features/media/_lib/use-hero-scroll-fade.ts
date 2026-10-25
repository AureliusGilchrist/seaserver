import React from "react"
import { useWindowScroll } from "react-use"

/**
 * Hero banner image fade: the image fades out as the page scrolls (fully faded by ~400px) and
 * comes back on scrolling up. Applied to a wrapper around the banner image only — nothing about
 * the banner's position, size or the content around it changes.
 */
export function useHeroImageFadeStyle(): React.CSSProperties {
    const { y } = useWindowScroll()
    const opacity = Math.max(0, 1 - y / 400)
    return { opacity, transition: "opacity 150ms linear" }
}
