"use client"
import { cn } from "@/components/ui/core/styling"
import { motion } from "motion/react"
import { usePathname } from "@/lib/navigation"
import React from "react"

type DepthOfFieldBackgroundProps = {
    children?: React.ReactNode
}

/**
 * Depth-of-Field Background System
 * Applies layered blur effects based on z-index hierarchy
 * Excludes: manga reader, manga entry, and anime entry pages
 */
export function DepthOfFieldBackground({ children }: DepthOfFieldBackgroundProps) {
    const pathname = usePathname()
    
    // Exclude specific pages from DOF effects
    const isExcludedPage = React.useMemo(() => {
        return pathname.includes('/manga/entry') || 
               pathname.startsWith('/entry') ||
               pathname.includes('chapter-reader')
    }, [pathname])
    
    if (isExcludedPage) {
        return <>{children}</>
    }

    return (
        <>
            {/* Background layer with maximum blur (z-0 to z-10) */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="fixed inset-0 z-[-1] pointer-events-none"
                data-dof-background-layer
            >
                <div className="absolute inset-0 backdrop-blur-2xl bg-gradient-to-b from-transparent via-black/20 to-black/40" />
            </motion.div>
            
            {children}
        </>
    )
}
