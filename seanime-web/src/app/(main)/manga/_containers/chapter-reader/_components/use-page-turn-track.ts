import React from "react"

/** Gap between neighbouring spreads on the track, in px. */
export const PAGE_TURN_GAP = 16
/** Full slide duration (a tap/key turn); a released swipe finishes the remaining distance proportionally faster. */
const DURATION_MS = 300
const MIN_DURATION_MS = 140
const EASING = "cubic-bezier(0.22, 0.61, 0.36, 1)"
/** Finger travel before the gesture picks an axis. */
const AXIS_LOCK_PX = 8

type PaginateDir = "left" | "right"

type Options = {
    /** Off on desktop: the hook then does nothing and returns inert handlers. */
    enabled: boolean
    /** The element that carries the spreads; it is the one translated. */
    wrapperRef: React.RefObject<HTMLDivElement | null>
    currentMapIndex: number
    paginationMap: Record<number, number[]>
    /** When this changes (new chapter), the next index change snaps instead of sliding. */
    resetKey: unknown
    rtl: boolean
    /** Called on a completed swipe with the screen side whose spread was pulled in. */
    onSwipe: (dir: PaginateDir) => void
}

function prefersReducedMotion() {
    try {
        return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
    }
    catch {
        return false
    }
}

/** The wrapper's live horizontal translation, including mid-transition values. */
function readTranslateX(el: HTMLElement) {
    const t = getComputedStyle(el).transform
    if (!t || t === "none") return 0
    try {
        return new DOMMatrixReadOnly(t).m41
    }
    catch {
        return 0
    }
}

/**
 * Page track for the paged manga reader on phones.
 *
 * The neighbouring spreads sit one screen to either side of the current one (see [slotTransform]),
 * and the wrapper holding them is translated: it follows the finger during a horizontal swipe, and
 * whenever the current spread changes by one (swipe, tap zone, key, bar button) the wrapper starts
 * where the old spread was visually and slides to rest. Only the wrapper's transform is animated,
 * written straight to the DOM, so a turn costs no React renders beyond the index change itself.
 */
export function usePageTurnTrack({ enabled, wrapperRef, currentMapIndex, paginationMap, resetKey, rtl, onSwipe }: Options) {
    // +1: the next spread is on the right (LTR); -1: on the left (RTL)
    const dir = rtl ? -1 : 1

    const settleTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    const prevIndex = React.useRef(currentMapIndex)
    const prevResetKey = React.useRef(resetKey)
    // Until when the click that ends a swipe is ignored (a swipe on touch usually fires none)
    const suppressClickUntil = React.useRef(0)
    const drag = React.useRef<{
        id: number
        startX: number
        startY: number
        base: number
        axis: "x" | "y" | null
        x: number
        lastX: number
        lastT: number
        v: number
    } | null>(null)

    const latest = React.useRef({ currentMapIndex, paginationMap, dir, onSwipe })
    latest.current = { currentMapIndex, paginationMap, dir, onSwipe }

    const slotPx = React.useCallback((el: HTMLElement, offset: number) => offset * dir * (el.offsetWidth + PAGE_TURN_GAP), [dir])

    const setX = React.useCallback((el: HTMLElement, x: number, durationMs: number) => {
        if (settleTimer.current) {
            clearTimeout(settleTimer.current)
            settleTimer.current = null
        }
        el.style.transition = durationMs > 0 ? `transform ${durationMs}ms ${EASING}` : "none"
        el.style.willChange = "transform"
        el.style.transform = `translate3d(${x}px,0,0)`
        if (x === 0) {
            // At rest: drop the layer so the page is not kept as a composited bitmap
            settleTimer.current = setTimeout(() => {
                settleTimer.current = null
                el.style.transition = ""
                el.style.transform = ""
                el.style.willChange = ""
            }, durationMs + 40)
        }
    }, [])

    const slideToRest = React.useCallback((el: HTMLElement, from: number) => {
        if (prefersReducedMotion()) {
            setX(el, 0, 0)
            return
        }
        const width = el.offsetWidth + PAGE_TURN_GAP
        const duration = Math.max(MIN_DURATION_MS, Math.min(DURATION_MS, Math.abs(from) / width * DURATION_MS))
        setX(el, from, 0)
        void el.offsetWidth // commit the start position before transitioning
        setX(el, 0, duration)
    }, [setX])

    /**
     * The spreads have already been re-slotted around the new index when this runs (before paint):
     * move the wrapper so the old spread is where it was, then slide to rest.
     */
    React.useLayoutEffect(() => {
        const prev = prevIndex.current
        prevIndex.current = currentMapIndex
        const el = wrapperRef.current
        if (!enabled || !el) return

        if (prevResetKey.current !== resetKey) {
            prevResetKey.current = resetKey
            setX(el, 0, 0)
            return
        }

        const delta = currentMapIndex - prev
        if (Math.abs(delta) !== 1) {
            // A jump (slider, drawer): there is no neighbour to slide from
            setX(el, 0, 0)
            return
        }
        slideToRest(el, readTranslateX(el) + slotPx(el, delta))
    }, [currentMapIndex, resetKey, enabled])

    React.useEffect(() => () => {
        if (settleTimer.current) clearTimeout(settleTimer.current)
    }, [])

    const onPointerDown = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!enabled || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return
        suppressClickUntil.current = 0
        drag.current = {
            id: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            base: 0,
            axis: null,
            x: 0,
            lastX: e.clientX,
            lastT: e.timeStamp,
            v: 0,
        }
    }, [enabled])

    const onPointerMove = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const d = drag.current
        const el = wrapperRef.current
        if (!d || !el || e.pointerId !== d.id) return
        const dx = e.clientX - d.startX
        const dy = e.clientY - d.startY

        if (d.axis === null) {
            if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
            d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y"
            if (d.axis === "y") return
            // Catch the track where it is, even mid-slide
            d.base = readTranslateX(el)
            try {
                el.setPointerCapture(e.pointerId)
            }
            catch {
            }
        }
        if (d.axis !== "x") return

        const { currentMapIndex, paginationMap, dir } = latest.current
        // Dragging left pulls in the spread on the right
        const target = currentMapIndex + (dx < 0 ? dir : -dir)
        const hasNeighbour = paginationMap.hasOwnProperty(target)
        let x = d.base + dx
        if (!hasNeighbour) x = d.base + dx * 0.25 // rubber band at the chapter edges

        const dt = e.timeStamp - d.lastT
        if (dt > 0) d.v = 0.7 * ((e.clientX - d.lastX) / dt) + 0.3 * d.v
        d.lastX = e.clientX
        d.lastT = e.timeStamp
        d.x = x
        setX(el, x, 0)
    }, [setX])

    const endDrag = React.useCallback((e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
        const d = drag.current
        const el = wrapperRef.current
        if (!d || e.pointerId !== d.id) return
        drag.current = null
        if (!el || d.axis !== "x") return
        suppressClickUntil.current = performance.now() + 400

        const { currentMapIndex, paginationMap, dir, onSwipe } = latest.current
        const moved = d.x - d.base
        const width = el.offsetWidth
        const flung = Math.abs(d.v) > 0.4 && Math.abs(moved) > 24 && Math.sign(d.v) === Math.sign(moved)
        const target = currentMapIndex + (moved < 0 ? dir : -dir)
        if (!cancelled && (Math.abs(moved) > width * 0.2 || flung) && paginationMap.hasOwnProperty(target)) {
            // The index change slides the rest of the way from the current drag position
            onSwipe(moved < 0 ? "right" : "left")
            return
        }
        slideToRest(el, d.x)
    }, [slideToRest])

    const onPointerUp = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => endDrag(e, false), [endDrag])
    const onPointerCancel = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => endDrag(e, true), [endDrag])

    /** True (once) when the click that follows a swipe should be ignored by the tap zones. */
    const consumeClick = React.useCallback(() => {
        if (performance.now() > suppressClickUntil.current) return false
        suppressClickUntil.current = 0
        return true
    }, [])

    /** Static position of a spread [offset] slots away from the current one. */
    const slotTransform = React.useCallback((offset: number) => {
        const s = offset * dir
        return `translate3d(calc(${s * 100}% + ${s * PAGE_TURN_GAP}px),0,0)`
    }, [dir])

    const handlers = enabled ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } : {}

    return { handlers, consumeClick, slotTransform }
}
