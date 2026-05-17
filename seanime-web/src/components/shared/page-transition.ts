import type { MotionProps } from "motion/react"
import type {
    PageTransitionEasing,
    PageTransitionVariant,
    UICustomizeState,
} from "@/lib/ui-customize/ui-customize-definitions"

export type TransitionVariant = Pick<MotionProps, "initial" | "animate" | "exit">

// ─── Easing functions ───────────────────────────────────────────────────────
// Map t in [0,1] to an eased value in [0,1]. Used both for framer-motion
// `ease` and for the easing-driven per-layer delay distribution.

const c1 = 1.70158
const c3 = c1 + 1

export const EASING_FNS: Record<PageTransitionEasing, (t: number) => number> = {
    linear:     t => t,
    easeIn:     t => t * t * t,
    easeOut:    t => 1 - Math.pow(1 - t, 3),
    easeInOut:  t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    circIn:     t => 1 - Math.sqrt(1 - Math.pow(t, 2)),
    circOut:    t => Math.sqrt(1 - Math.pow(t - 1, 2)),
    anticipate: t => c3 * t * t * t - c1 * t * t,
}

// Framer-motion accepts these string easing names directly.
export function easingToMotion(e: PageTransitionEasing): any {
    return e
}

// ─── Per-layer variant builders ─────────────────────────────────────────────

/**
 * Build motion variants for a single layer based on the chosen visual style.
 * Each layer animates hidden → visible → exit. The page wrapper orchestrates
 * staggering between layers; this function only knows the animation shape.
 */
export function getLayerVariants(
    variant: PageTransitionVariant,
    scaleAmount: number,
    swipeDistancePx: number,
): TransitionVariant {
    switch (variant) {
        case "none":
            return {
                initial: { opacity: 1 },
                animate: { opacity: 1 },
                exit:    { opacity: 1 },
            }
        case "fade":
            return {
                initial: { opacity: 0 },
                animate: { opacity: 1 },
                exit:    { opacity: 0 },
            }
        case "scaleUp":
            return {
                initial: { opacity: 0, scale: Math.max(0.2, scaleAmount) },
                animate: { opacity: 1, scale: 1 },
                exit:    { opacity: 0, scale: 1 + (1 - scaleAmount) * 0.6 },
            }
        case "scaleDown":
            return {
                initial: { opacity: 0, scale: 1 + (1 - scaleAmount) * 0.6 },
                animate: { opacity: 1, scale: 1 },
                exit:    { opacity: 0, scale: Math.max(0.2, scaleAmount) },
            }
        case "swipeLeft":
            return {
                initial: { opacity: 0, x: swipeDistancePx },
                animate: { opacity: 1, x: 0 },
                exit:    { opacity: 0, x: -swipeDistancePx },
            }
        case "swipeRight":
            return {
                initial: { opacity: 0, x: -swipeDistancePx },
                animate: { opacity: 1, x: 0 },
                exit:    { opacity: 0, x: swipeDistancePx },
            }
        case "swipeUp":
            return {
                initial: { opacity: 0, y: swipeDistancePx },
                animate: { opacity: 1, y: 0 },
                exit:    { opacity: 0, y: -swipeDistancePx },
            }
        case "blur":
            return {
                initial: { opacity: 0, filter: "blur(64px)" },
                animate: { opacity: 1, filter: "blur(0px)" },
                exit:    { opacity: 0, filter: "blur(64px)" },
            }
        case "rotate":
            return {
                initial: { opacity: 0, rotate: -8, scale: 0.96 },
                animate: { opacity: 1, rotate: 0, scale: 1 },
                exit:    { opacity: 0, rotate: 8, scale: 0.96 },
            }
    }
}

// ─── Per-layer timing distribution ──────────────────────────────────────────

/**
 * Compute (delay, duration) in seconds for a layer.
 * When `transitionEasingDriven` is true the easing curve distributes delays;
 * otherwise delays are linearly spread.
 */
export function computeLayerTiming(
    index: number,
    totalLayers: number,
    state: Pick<
        UICustomizeState,
        "transitionMaxDurationMs"
        | "transitionMaxDelayMs"
        | "transitionEasing"
        | "transitionEasingDriven"
    >,
): { delay: number; duration: number } {
    const safeTotal = Math.max(totalLayers - 1, 1)
    const t = Math.min(Math.max(index, 0), safeTotal) / safeTotal
    const eased = state.transitionEasingDriven ? EASING_FNS[state.transitionEasing](t) : t
    return {
        delay:    (eased * state.transitionMaxDelayMs) / 1000,
        duration: state.transitionMaxDurationMs / 1000,
    }
}

// ─── Legacy back-compat exports ─────────────────────────────────────────────

export const PAGE_TRANSITION_VARIANTS: Record<string, TransitionVariant> = {
    "pt-fade": {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit:    { opacity: 0 },
    },
    "pt-slide-up": {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        exit:    { opacity: 0, y: -8 },
    },
    "pt-scale": {
        initial: { opacity: 0, scale: 0.97 },
        animate: { opacity: 1, scale: 1 },
        exit:    { opacity: 0, scale: 1.02 },
    },
    "pt-slide-right": {
        initial: { opacity: 0, x: -12 },
        animate: { opacity: 1, x: 0 },
        exit:    { opacity: 0, x: 12 },
    },
    "pt-none": {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit:    { opacity: 1 },
    },
}

export const PAGE_TRANSITION = PAGE_TRANSITION_VARIANTS["pt-fade"]

