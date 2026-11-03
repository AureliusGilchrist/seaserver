/**
 * Interface size — one scale for the whole UI, chosen per device (50%–200%, 100% by default).
 *
 * The UI itself is laid out in fixed CSS px and rem, so it is the same size on every monitor; this
 * setting is the one knob that makes all of it bigger or smaller together. It lives in plain
 * localStorage (not seaStorage), so it stays with the device: a TV and a phone on the same profile
 * each keep their own size.
 *
 * How it is applied:
 * - Denshi shells expose native page zoom (`window.electron.zoom`). That is the same as the
 *   browser's own Ctrl +/−: window size, element rects and pointer coordinates all stay in one
 *   coordinate space, so nothing else has to know about it.
 * - Everywhere else it is CSS `zoom` on <html>. Under CSS zoom, element rects and pointer events
 *   are in screen px while styles are in the zoomed px, so anything that positions an element from
 *   a measured rect has to divide by the zoom. Floating UI (every Radix popover, menu, tooltip and
 *   select) is corrected once, globally, in `patchFloatingUi`; hand-written positioning reads
 *   `getCssZoom()`.
 *
 * `installInterfaceScale()` runs at boot, before the first render, so the first paint is already
 * at the right size.
 */

import { platform as floatingPlatform } from "@floating-ui/dom"
import React from "react"

export const INTERFACE_SCALE_KEY = "sea-interface-scale"
export const INTERFACE_SCALE_MIN = 50
export const INTERFACE_SCALE_MAX = 200
export const INTERFACE_SCALE_DEFAULT = 100
/** The snap points of the slider and the steps of Ctrl +/−. */
export const INTERFACE_SCALE_STOPS = [50, 75, 90, 100, 110, 125, 150, 175, 200] as const

const CHANGED_EVENT = "sea-interface-scale-changed"
const SHORTCUT_EVENT = "sea-interface-scale-shortcut"

export function clampInterfaceScale(n: number): number {
    if (!Number.isFinite(n)) return INTERFACE_SCALE_DEFAULT
    return Math.round(Math.min(INTERFACE_SCALE_MAX, Math.max(INTERFACE_SCALE_MIN, n)))
}

export function readInterfaceScale(): number {
    if (typeof window === "undefined") return INTERFACE_SCALE_DEFAULT
    try {
        const raw = localStorage.getItem(INTERFACE_SCALE_KEY)
        return raw === null ? INTERFACE_SCALE_DEFAULT : clampInterfaceScale(Number(raw))
    }
    catch {
        return INTERFACE_SCALE_DEFAULT
    }
}

// The CSS zoom currently on <html>: 1 when the scale is 100% or applied natively.
let cssZoom = 1

/** The CSS zoom on <html>, for code that turns measured (screen) px into style px. */
export function getCssZoom(): number {
    return cssZoom
}

/** The viewport size in the px that styles use (equal to innerWidth/innerHeight at 100%). */
export function getViewportCssSize(): { width: number, height: number } {
    return { width: window.innerWidth / cssZoom, height: window.innerHeight / cssZoom }
}

/** A measured (screen px) rect in the px that styles use. */
export function toCssRect(r: { top: number, left: number, width: number, height: number }) {
    const z = cssZoom
    return { top: r.top / z, left: r.left / z, width: r.width / z, height: r.height / z, right: (r.left + r.width) / z, bottom: (r.top + r.height) / z }
}

function hasNativeZoom() {
    return typeof window !== "undefined" && typeof window.electron?.zoom?.setFactor === "function"
}

function applyInterfaceScale(scale: number) {
    const factor = clampInterfaceScale(scale) / 100
    const root = document.documentElement
    if (hasNativeZoom()) {
        try {
            window.electron!.zoom!.setFactor(factor)
            cssZoom = 1
            root.style.removeProperty("zoom")
        }
        catch {
            applyCssZoom(root, factor)
        }
    } else {
        applyCssZoom(root, factor)
    }
    root.dataset.seaInterfaceScale = String(Math.round(factor * 100))
}

function applyCssZoom(root: HTMLElement, factor: number) {
    cssZoom = factor
    if (factor === 1) root.style.removeProperty("zoom")
    else root.style.setProperty("zoom", String(factor))
}

/** Saves and applies a new size (clamped to 50–200). */
export function setInterfaceScale(next: number | ((prev: number) => number)) {
    const prev = readInterfaceScale()
    const value = clampInterfaceScale(typeof next === "function" ? next(prev) : next)
    try {
        if (value === INTERFACE_SCALE_DEFAULT) localStorage.removeItem(INTERFACE_SCALE_KEY)
        else localStorage.setItem(INTERFACE_SCALE_KEY, String(value))
    }
    catch {
        // Storage unavailable: still apply it for this session.
    }
    applyInterfaceScale(value)
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: value }))
    return value
}

/** The next snap point above (+1) or below (−1) a size. */
export function stepInterfaceScale(from: number, direction: 1 | -1): number {
    const stops = INTERFACE_SCALE_STOPS as readonly number[]
    if (direction > 0) return stops.find(s => s > from) ?? INTERFACE_SCALE_MAX
    return [...stops].reverse().find(s => s < from) ?? INTERFACE_SCALE_MIN
}

/** The current size, kept up to date with changes from anywhere (other tabs, shortcuts). */
export function useInterfaceScale(): number {
    const [scale, setScale] = React.useState(readInterfaceScale)
    React.useEffect(() => {
        const update = () => setScale(readInterfaceScale())
        window.addEventListener(CHANGED_EVENT, update)
        window.addEventListener("storage", update)
        return () => {
            window.removeEventListener(CHANGED_EVENT, update)
            window.removeEventListener("storage", update)
        }
    }, [])
    return scale
}

/** Called with the size after every Ctrl +/−/0, including presses at the limits. */
export function onInterfaceScaleShortcut(fn: (scale: number) => void): () => void {
    const handler = (e: Event) => fn((e as CustomEvent<number>).detail)
    window.addEventListener(SHORTCUT_EVENT, handler)
    return () => window.removeEventListener(SHORTCUT_EVENT, handler)
}

type Rect = { x: number, y: number, width: number, height: number }
const unzoom = (r: Rect): Rect => cssZoom === 1 ? r : { x: r.x / cssZoom, y: r.y / cssZoom, width: r.width / cssZoom, height: r.height / cssZoom }

/**
 * Floating UI measures the anchor and the clipping area with getBoundingClientRect (screen px)
 * and writes the result as a transform on the floating element (style px). Under CSS zoom those
 * differ by the zoom, so popovers would land `zoom` times too far from their anchor. Dividing the
 * measured rects puts the whole computation in style px. The floating element's own size comes
 * from computed styles, which are style px already.
 *
 * `platform` is the default every computePosition call merges in, so patching it once covers
 * Radix and anything else built on Floating UI.
 */
function patchFloatingUi() {
    const p = floatingPlatform as any
    if (!p || p.__seaZoomPatched) return
    p.__seaZoomPatched = true
    const getElementRects = p.getElementRects
    const getClippingRect = p.getClippingRect
    p.getElementRects = async function (this: unknown, data: any) {
        const rects = await getElementRects.call(this, data)
        if (cssZoom === 1 || data?.strategy !== "fixed") return rects
        return { ...rects, reference: unzoom(rects.reference) }
    }
    p.getClippingRect = async function (this: unknown, data: any) {
        const rect = await getClippingRect.call(this, data)
        if (cssZoom === 1 || data?.strategy !== "fixed") return rect
        return unzoom(rect)
    }
}

/** Ctrl/Cmd + = / + / − / 0: bigger, smaller, back to 100%. Replaces the browser's own page zoom. */
function onKeyDown(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return
    let next: number | null = null
    const current = readInterfaceScale()
    switch (e.code) {
        case "Equal":
        case "NumpadAdd":
            next = stepInterfaceScale(current, 1)
            break
        case "Minus":
        case "NumpadSubtract":
            next = stepInterfaceScale(current, -1)
            break
        case "Digit0":
        case "Numpad0":
            next = INTERFACE_SCALE_DEFAULT
            break
        default:
            return
    }
    e.preventDefault()
    if (next !== current) setInterfaceScale(next)
    window.dispatchEvent(new CustomEvent(SHORTCUT_EVENT, { detail: next }))
}

let installed = false

/** Applies the saved size and wires up the shortcuts. Call once at boot, before the first render. */
export function installInterfaceScale() {
    if (installed || typeof window === "undefined") return
    installed = true
    patchFloatingUi()
    applyInterfaceScale(readInterfaceScale())
    window.addEventListener("keydown", onKeyDown, { capture: true })
    // Another tab of the app changed it.
    window.addEventListener("storage", e => {
        if (e.key === INTERFACE_SCALE_KEY) applyInterfaceScale(readInterfaceScale())
    })
}
