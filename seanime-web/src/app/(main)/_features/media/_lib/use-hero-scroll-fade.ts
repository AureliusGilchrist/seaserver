import { useIsMobile, useThemeSettings } from "@/lib/theme/hooks"
import { easeInOut, easeOut, useMotionTemplate, useScroll, useSpring, useTransform } from "motion/react"

// Every scroll-driven value in a hero is a motion value: it follows the scroll position without
// re-rendering the page, and the spring smooths the steps a mouse wheel makes into one glide.
export const SCROLL_SPRING = { stiffness: 140, damping: 30, mass: 0.5, restDelta: 0.001 }

/** How far down the page the banner takes to fade out. */
export const BANNER_FADE_END = 560

/**
 * The anime/manga page hero's scroll behaviour, as one rule every hero banner shares.
 *
 * The banner fades and blurs as you scroll while the image zooms in slightly and lifts (the lift is
 * desktop only). That is the same with or without a custom wallpaper; what differs is where it sits:
 *
 *  - No custom wallpaper: the banner stays fixed behind the page.
 *  - Custom wallpaper: the banner scrolls away with the page, so the wallpaper (the true background)
 *    is what remains.
 *
 * `containerStyle` goes on the banner's motion container, `imageStyle` on the motion element that
 * holds the image. `restOpacity` is the banner's opacity at the top of the page, for banners that
 * are never shown at full strength.
 */
export function useHeroScrollFade(opts?: { dim?: boolean, restOpacity?: number }) {
    const ts = useThemeSettings()
    const { isMobile } = useIsMobile()
    const hasWallpaper = !!ts.libraryScreenCustomBackgroundImage

    const restOpacity = opts?.restOpacity ?? 1

    const { scrollY } = useScroll()
    const opacity = useSpring(
        useTransform(scrollY, [0, 90, BANNER_FADE_END], [restOpacity, restOpacity, opts?.dim ? 0.15 : 0.06], { ease: easeInOut }),
        SCROLL_SPRING,
    )
    const blurPx = useSpring(useTransform(scrollY, [60, BANNER_FADE_END], [0, 10], { ease: easeOut }), SCROLL_SPRING)
    const filter = useMotionTemplate`blur(${blurPx}px)`
    const scale = useSpring(useTransform(scrollY, [0, BANNER_FADE_END], [1, 1.06]), SCROLL_SPRING)
    const y = useSpring(useTransform(scrollY, [0, BANNER_FADE_END], [0, isMobile ? 0 : -70]), SCROLL_SPRING)

    return {
        hasWallpaper,
        /** Positioning classes for the banner container. */
        containerClass: hasWallpaper ? "absolute" : "fixed will-change-[opacity]",
        /** Fade for the banner container. */
        containerStyle: { opacity },
        /** Zoom, lift and blur for the banner image (container). */
        imageStyle: { scale, y, filter },
    }
}
