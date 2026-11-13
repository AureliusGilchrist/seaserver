"use client"
import { useAnimeThemeOrNull } from "@/lib/theme/anime-themes/anime-theme-provider"
import { cn } from "@/components/ui/core/styling"
import React from "react"

/**
 * Theme "flavour": quiet nods to the active theme's series, placed in a few fixed spots around the
 * app, plus the theme's splash messages. Both come from the theme's theme.json:
 *
 *   "splashMessages": ["…", "…"],
 *   "easterEggs": { "notFound": "…", "emptySearch": "…", "idle": "…", "logo": "…" }
 *
 * Spots, and why each is there:
 *  - notFound    — the page-not-found screen: a lost-place line from the series.
 *  - emptySearch — a search that found nothing: a "nothing here" line from the series.
 *  - idle        — after a few quiet minutes, a single faint line fades in at the bottom corner, once
 *                  per session.
 *  - logo        — the sidebar emblem's hover tooltip.
 *
 * Every spot is optional; a theme without the field shows the plain app.
 */
export type ThemeEggSpot = "notFound" | "emptySearch" | "idle" | "logo"

export function useThemeFlavor() {
    const theme = useAnimeThemeOrNull()
    const config = theme?.config
    return React.useMemo(() => ({
        themeId: config?.id,
        splashMessages: config?.splashMessages ?? [],
        egg: (spot: ThemeEggSpot): string | undefined => config?.easterEggs?.[spot] || undefined,
    }), [config])
}

/** One of the theme's splash messages, picked once per mount (undefined when it has none). */
export function useThemeSplash(): string | undefined {
    const { splashMessages, themeId } = useThemeFlavor()
    return React.useMemo(
        () => splashMessages.length ? splashMessages[Math.floor(Math.random() * splashMessages.length)] : undefined,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [themeId, splashMessages.length],
    )
}

/** The theme's line for a spot, as small muted text; nothing when the theme has none. */
export function ThemeEgg({ spot, className }: { spot: ThemeEggSpot, className?: string }) {
    const { egg } = useThemeFlavor()
    const text = egg(spot)
    if (!text) return null
    return (
        <p className={cn("text-xs italic text-[--muted] opacity-70 select-none", className)} data-theme-egg={spot}>
            {text}
        </p>
    )
}

const IDLE_MS = 4 * 60 * 1000
const IDLE_SHOW_MS = 9000
const IDLE_SESSION_KEY = "sea-theme-idle-egg-shown"

/**
 * After four quiet minutes (no pointer, key or scroll), the theme's idle line fades in at the
 * bottom-left for a few seconds. Once per session, never while a video is playing full screen.
 */
export function ThemeIdleWhisper() {
    const { egg, themeId } = useThemeFlavor()
    const text = egg("idle")
    const [visible, setVisible] = React.useState(false)

    React.useEffect(() => {
        if (!text) return
        let shown = false
        try {
            shown = sessionStorage.getItem(`${IDLE_SESSION_KEY}-${themeId}`) === "1"
        }
        catch {
        }
        if (shown) return

        let idleTimer: ReturnType<typeof setTimeout> | undefined
        let hideTimer: ReturnType<typeof setTimeout> | undefined
        const arm = () => {
            if (idleTimer) clearTimeout(idleTimer)
            idleTimer = setTimeout(() => {
                if (document.fullscreenElement || document.hidden) return arm()
                setVisible(true)
                try {
                    sessionStorage.setItem(`${IDLE_SESSION_KEY}-${themeId}`, "1")
                }
                catch {
                }
                cleanup()
                hideTimer = setTimeout(() => setVisible(false), IDLE_SHOW_MS)
            }, IDLE_MS)
        }
        const events = ["pointermove", "keydown", "wheel", "touchstart"] as const
        const cleanup = () => events.forEach(e => window.removeEventListener(e, arm))
        events.forEach(e => window.addEventListener(e, arm, { passive: true }))
        arm()
        return () => {
            cleanup()
            if (idleTimer) clearTimeout(idleTimer)
            if (hideTimer) clearTimeout(hideTimer)
        }
    }, [text, themeId])

    if (!text) return null
    return (
        <div
            aria-hidden
            data-theme-egg="idle"
            className={cn(
                "pointer-events-none fixed bottom-4 left-4 z-[60] max-w-xs text-xs italic text-white/60",
                "transition-opacity duration-[2000ms]",
                visible ? "opacity-100" : "opacity-0",
            )}
        >
            {text}
        </div>
    )
}
