"use client"
import {
    computeLayerTiming,
    EASING_FNS,
    easingToMotion,
    getLayerVariants,
} from "@/components/shared/page-transition"
import { cn } from "@/components/ui/core/styling"
import { useUICustomize } from "@/lib/ui-customize/ui-customize-provider"
import { motion, type Variants } from "motion/react"
import React from "react"

type PageWrapperProps = {
    children?: React.ReactNode
} & React.ComponentPropsWithoutRef<"div">

/**
 * PageWrapper — orchestrates a layered, staggered page transition.
 *
 * Children may be wrapped in <PageLayer index={N}> to participate in the
 * staggered entry/exit. The PageLayer index controls how early/late in the
 * stagger it animates (0 = first). Children that are not wrapped in PageLayer
 * are rendered as a single default layer (index 0) so the whole page still
 * animates cleanly.
 *
 * Timings come from the UICustomize settings (transitionMaxDurationMs,
 * transitionMaxDelayMs, transitionEasing, transitionEasingDriven).
 */
export const PageWrapper = React.forwardRef<HTMLDivElement, PageWrapperProps>((props, ref) => {

    const {
        children,
        className,
        ...rest
    } = props

    const { state } = useUICustomize()

    const variant         = state.transitionVariant
    const easing          = state.transitionEasing
    const maxDelayS       = state.transitionMaxDelayMs / 1000
    const easingDriven    = state.transitionEasingDriven

    const motionEase = easingToMotion(easing)

    // Outer container variants drive the per-child stagger. We pick a small
    // staggerChildren value so that direct children (PageLayers) start their
    // animations one after another. The PageLayer itself can also supply its
    // own per-index delay via `computeLayerTiming` for finer control.
    //
    // When `easingDriven` is on we let the staggerChildren value be small and
    // rely on the PageLayer's own delay (which is non-linear). Otherwise we
    // distribute linearly across up to ~6 layers using staggerChildren.
    const stagger = easingDriven ? 0 : Math.max(0, maxDelayS / 6)

    const parentVariants: Variants = {
        initial:  { transition: { staggerChildren: stagger, staggerDirection: 1 } },
        animate:  { transition: { staggerChildren: stagger, staggerDirection: 1 } },
        exit:     { transition: { staggerChildren: stagger, staggerDirection: -1 } },
    }

    // If `variant === "none"` we skip wrapping in motion entirely.
    if (variant === "none") {
        return (
            <div data-page-wrapper-container ref={ref}>
                <div
                    data-page-wrapper
                    {...rest}
                    className={cn("z-[5] relative", className)}
                >
                    {children}
                </div>
            </div>
        )
    }

    // Default behaviour: wrap whole content in a single default layer so the
    // page still gets a transition even if it doesn't use PageLayer.
    return (
        <div data-page-wrapper-container ref={ref}>
            <motion.div
                data-page-wrapper
                variants={parentVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                {...(rest as any)}
                className={cn("z-[5] relative", className)}
            >
                <PageLayer index={0}>{children}</PageLayer>
            </motion.div>
        </div>
    )

    // Note: unused variable kept for linter satisfaction
    void motionEase
    void EASING_FNS
})

PageWrapper.displayName = "PageWrapper"

// ─── PageLayer ──────────────────────────────────────────────────────────────

export type PageLayerProps = {
    /** 0-based layer index from top of page (higher = animates later) */
    index?: number
    /** Override the total number of layers used to normalize timing. */
    totalLayers?: number
    children?: React.ReactNode
    className?: string
} & Omit<React.ComponentPropsWithoutRef<"div">, "children" | "className">

/**
 * One animated layer inside a PageWrapper. Wrap distinct visual sections of
 * a page (header → main → cards → footer) in <PageLayer index={0..N}> to get
 * a cascading entry/exit.
 */
export const PageLayer = React.forwardRef<HTMLDivElement, PageLayerProps>((props, ref) => {
    const { index = 0, totalLayers = 6, children, className, ...rest } = props
    const { state } = useUICustomize()

    const variants = React.useMemo(
        () => {
            const v = getLayerVariants(
                state.transitionVariant,
                state.transitionScaleAmount,
                state.transitionSwipeDistance,
            )
            // Convert to framer-motion Variants shape (initial/animate/exit keys
            // already match the parent's `initial|animate|exit` labels).
            return {
                initial: v.initial as any,
                animate: v.animate as any,
                exit:    v.exit as any,
            } as Variants
        },
        [
            state.transitionVariant,
            state.transitionScaleAmount,
            state.transitionSwipeDistance,
        ],
    )

    const timing = computeLayerTiming(index, totalLayers, state)

    if (state.transitionVariant === "none") {
        return (
            <div ref={ref} className={className} {...rest}>
                {children}
            </div>
        )
    }

    return (
        <motion.div
            ref={ref}
            variants={variants}
            transition={{
                duration: timing.duration,
                delay:    timing.delay,
                ease:     easingToMotion(state.transitionEasing),
            }}
            className={className}
            {...(rest as any)}
        >
            {children}
        </motion.div>
    )
})

PageLayer.displayName = "PageLayer"

