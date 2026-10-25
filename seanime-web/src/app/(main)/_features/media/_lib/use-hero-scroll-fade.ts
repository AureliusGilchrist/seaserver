import { useIsMobile, useThemeSettings } from "@/lib/theme/hooks"
import { useWindowScroll } from "react-use"

/**
 * The anime/manga page hero's scroll behaviour, as one rule every hero banner shares
 * (MediaPageHeader is the reference; the anime and manga home heroes use the same thing).
 *
 *  - No custom wallpaper: the banner stays fixed behind the page and fades as you scroll —
 *    to 15% past 100px, to 5% past 300px — over a slow one-second transition.
 *  - Custom wallpaper: the banner scrolls away with the page instead, so the wallpaper (the true
 *    background) is what remains.
 *  - The image itself zooms in very slightly and lifts a few pixels as you scroll (not on mobile).
 */
export function useHeroScrollFade(opts?: { dim?: boolean }) {
    const ts = useThemeSettings()
    const { y } = useWindowScroll()
    const { isMobile } = useIsMobile()
    const hasWallpaper = !!ts.libraryScreenCustomBackgroundImage

    const opacityClass = !hasWallpaper && y > 100
        ? (opts?.dim ? "opacity-15" : (y > 300 ? "opacity-5" : "opacity-15"))
        : undefined

    return {
        y,
        hasWallpaper,
        /** Positioning + fade classes for the banner container. */
        containerClass: [
            hasWallpaper ? "absolute" : "fixed transition-opacity duration-1000",
            opacityClass,
        ].filter(Boolean).join(" "),
        /** framer-motion `animate` target for the banner image (container). */
        imageAnimate: {
            scale: !hasWallpaper ? Math.min(1 + y * 0.0002, 1.03) : 1,
            y: isMobile ? 0 : Math.max(y * -0.9, -10),
        },
    }
}
