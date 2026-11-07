"use client"

import React from "react"

/**
 * Puts you back where you were on a page when you return to it with Back or Forward.
 *
 * The router already restores the scroll position, but only once, the moment the page mounts —
 * and on Discover, Search, News and the other browse pages that moment comes before the cards
 * have rendered, so the page is still too short and the position is clamped to somewhere near the
 * top. This remembers the position per address and, on a Back/Forward, keeps re-applying it while
 * the content grows into it, for a few seconds at most. Any scroll, key press or tap of your own
 * ends it at once, so it never fights you.
 *
 * New navigations are left alone: following a link still starts at the top of the page.
 */

const STORAGE_KEY = "sea-scroll-memory"
/** How long a restore keeps waiting for the page to be tall enough. */
const RESTORE_WINDOW_MS = 5000
/** Positions kept; the oldest are dropped past this. */
const MAX_ENTRIES = 200

function addressKey() {
    return `${window.location.pathname}${window.location.search}`
}

function loadPositions(): Map<string, number> {
    try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY)
        if (raw) return new Map(JSON.parse(raw) as [string, number][])
    } catch {
        // Unreadable or blocked: start empty.
    }
    return new Map()
}

function savePositions(positions: Map<string, number>) {
    try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...positions.entries()]))
    } catch {
        // Storage blocked or full: positions are still kept in memory for this session.
    }
}

export function ScrollMemory() {
    React.useEffect(() => {
        const positions = loadPositions()
        // True while a restore is running, so the scroll events it causes (and the page's own
        // jumps while it loads) are not recorded as where you were.
        let restoring = false
        let cancelRestore: (() => void) | null = null
        let frame = 0
        let persistTimer = 0

        const record = () => {
            if (frame) return
            frame = window.requestAnimationFrame(() => {
                frame = 0
                if (restoring) return
                const key = addressKey()
                positions.delete(key) // re-insert, so the map stays in most-recently-used order
                if (window.scrollY > 0) positions.set(key, Math.round(window.scrollY))
                while (positions.size > MAX_ENTRIES) positions.delete(positions.keys().next().value!)
                window.clearTimeout(persistTimer)
                persistTimer = window.setTimeout(() => savePositions(positions), 250)
            })
        }

        const restore = () => {
            cancelRestore?.()
            const target = positions.get(addressKey())
            if (!target) return

            restoring = true
            const startedAt = performance.now()
            let raf = 0

            const stop = () => {
                restoring = false
                window.cancelAnimationFrame(raf)
                window.removeEventListener("wheel", stop)
                window.removeEventListener("touchstart", stop)
                window.removeEventListener("keydown", stop)
                window.removeEventListener("pointerdown", stop)
                cancelRestore = null
            }
            cancelRestore = stop

            const step = () => {
                const maxScroll = document.documentElement.scrollHeight - window.innerHeight
                window.scrollTo({ top: Math.min(target, Math.max(0, maxScroll)), behavior: "instant" as ScrollBehavior })
                const reached = Math.abs(window.scrollY - target) <= 2
                if (reached || performance.now() - startedAt > RESTORE_WINDOW_MS) {
                    stop()
                    return
                }
                raf = window.requestAnimationFrame(step)
            }

            window.addEventListener("wheel", stop, { passive: true })
            window.addEventListener("touchstart", stop, { passive: true })
            window.addEventListener("keydown", stop)
            window.addEventListener("pointerdown", stop)
            // After the router has rendered the page for the new address.
            raf = window.requestAnimationFrame(step)
        }

        window.addEventListener("scroll", record, { passive: true })
        window.addEventListener("popstate", restore)
        return () => {
            cancelRestore?.()
            window.cancelAnimationFrame(frame)
            window.clearTimeout(persistTimer)
            savePositions(positions)
            window.removeEventListener("scroll", record)
            window.removeEventListener("popstate", restore)
        }
    }, [])

    return null
}
