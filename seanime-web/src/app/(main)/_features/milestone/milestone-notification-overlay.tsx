"use client"

import { useMilestoneUnlockListener } from "@/api/hooks/milestone.hooks"
import { cn } from "@/components/ui/core/styling"
import { AnimatePresence, motion } from "motion/react"
import React from "react"
import { LuFlag, LuCrown } from "react-icons/lu"

export function MilestoneNotificationOverlay() {
    const { currentUnlock, dismiss, hasPending } = useMilestoneUnlockListener()

    React.useEffect(() => {
        if (!currentUnlock) return
        const timer = setTimeout(dismiss, 5000)
        return () => clearTimeout(timer)
    }, [currentUnlock, dismiss])

    return (
        <AnimatePresence>
            {currentUnlock && (
                <motion.div
                    key={currentUnlock.key}
                    initial={{ x: 400, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 400, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className={cn(
                        "fixed top-6 right-6 z-[200] w-[360px] rounded-xl border shadow-2xl backdrop-blur-md cursor-pointer",
                        currentUnlock.isFirstToAchieve
                            ? "border-yellow-500/50 bg-gradient-to-br from-yellow-950/90 to-amber-950/90"
                            : "border-brand-500/50 bg-gradient-to-br from-gray-950/90 to-gray-900/90",
                    )}
                    onClick={dismiss}
                >
                    <div className="p-4 flex items-start gap-3">
                        {/* Icon */}
                        <div className={cn(
                            "flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center",
                            currentUnlock.isFirstToAchieve
                                ? "bg-yellow-500/20 text-yellow-400"
                                : "bg-brand-500/20 text-brand-400",
                        )}>
                            {currentUnlock.isFirstToAchieve ? (
                                <LuCrown className="text-2xl" />
                            ) : currentUnlock.iconSVG ? (
                                <span
                                    className="w-6 h-6 [&>svg]:w-full [&>svg]:h-full"
                                    dangerouslySetInnerHTML={{ __html: currentUnlock.iconSVG }}
                                />
                            ) : (
                                <LuFlag className="text-2xl" />
                            )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <p className={cn(
                                "text-xs font-bold uppercase tracking-wider",
                                currentUnlock.isFirstToAchieve ? "text-yellow-400" : "text-brand-400",
                            )}>
                                {currentUnlock.isFirstToAchieve ? "First to Achieve!" : "Milestone Reached!"}
                            </p>
                            <p className="text-sm font-semibold text-[--foreground] mt-0.5 truncate">
                                {currentUnlock.name}
                            </p>
                            <p className="text-xs text-[--muted] mt-0.5">
                                {currentUnlock.threshold.toLocaleString()} {currentUnlock.category.replace(/_/g, " ")}
                            </p>
                        </div>
                    </div>

                    {/* Progress bar */}
                    <motion.div
                        className={cn(
                            "h-0.5 rounded-b-xl",
                            currentUnlock.isFirstToAchieve ? "bg-yellow-500" : "bg-brand-500",
                        )}
                        initial={{ width: "100%" }}
                        animate={{ width: "0%" }}
                        transition={{ duration: 5, ease: "linear" }}
                    />
                </motion.div>
            )}
        </AnimatePresence>
    )
}
