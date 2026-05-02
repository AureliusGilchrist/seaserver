import type { MotionProps } from "motion/react"

type TransitionVariant = Pick<MotionProps, "initial" | "animate" | "exit">

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

// Legacy export kept for any direct references
export const PAGE_TRANSITION = PAGE_TRANSITION_VARIANTS["pt-fade"]
