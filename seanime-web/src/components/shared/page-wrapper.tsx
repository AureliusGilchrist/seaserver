"use client"
import { PAGE_TRANSITION_VARIANTS } from "@/components/shared/page-transition"
import { ANIMATION_PRESETS } from "@/lib/ui-customize/ui-customize-definitions"
import { useUICustomize } from "@/lib/ui-customize/ui-customize-provider"
import { cn } from "@/components/ui/core/styling"
import { motion } from "motion/react"
import React from "react"

type PageWrapperProps = {
    children?: React.ReactNode
} & React.ComponentPropsWithoutRef<"div">

export const PageWrapper = React.forwardRef<HTMLDivElement, PageWrapperProps>((props, ref) => {

    const {
        children,
        className,
        ...rest
    } = props

    const { state } = useUICustomize()

    const variant = PAGE_TRANSITION_VARIANTS[state.transitions] ?? PAGE_TRANSITION_VARIANTS["pt-fade"]

    const animPreset = ANIMATION_PRESETS.find(p => p.id === state.animations)
    const durMs = state.transitions === "pt-none"
        ? 0
        : parseFloat(animPreset?.cssVars?.["--sea-dur"] ?? "200")
    const ease = animPreset?.cssVars?.["--sea-ease"] ?? "ease-out"
    // Framer Motion doesn't support CSS steps() — fall back gracefully
    const motionEase = ease.startsWith("steps") ? "easeOut" : ease

    return (
        <div data-page-wrapper-container ref={ref}>
            <motion.div
                data-page-wrapper
                {...variant}
                transition={{ duration: durMs / 1000, ease: motionEase }}
                {...rest as any}
                className={cn("z-[5] relative", className)}
            >
                {children}
            </motion.div>
        </div>
    )
})

PageWrapper.displayName = "PageWrapper"
