"use client"

import { useAchievementUnlockListener } from "@/api/hooks/achievement.hooks"
import { cn } from "@/components/ui/core/styling"
import { useAnimeThemeOrNull } from "@/lib/theme/anime-themes/anime-theme-provider"
import { AnimatePresence, motion } from "motion/react"
import React from "react"
import { LuTrophy } from "react-icons/lu"

export function AchievementCelebrationOverlay() {
    const { currentUnlock, dismiss, hasPending } = useAchievementUnlockListener()
    const themeCtx = useAnimeThemeOrNull()

    React.useEffect(() => {
        if (!currentUnlock) return
        const timer = setTimeout(dismiss, 5000)
        return () => clearTimeout(timer)
    }, [currentUnlock, dismiss])

    // Map achievement name to themed name
    const displayName = currentUnlock
        ? (themeCtx?.config.achievementNames[currentUnlock.key] ?? currentUnlock.name)
        : ""

    React.useEffect(() => {
        if (!currentUnlock) return
        const timer = setTimeout(dismiss, 5000)
        return () => clearTimeout(timer)
    }, [currentUnlock, dismiss])

    return (
        <AnimatePresence>
            {currentUnlock && (
                <motion.div
                    key={currentUnlock.key + currentUnlock.tier}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-pointer"
                    onClick={dismiss}
                >
                    <motion.div
                        initial={{ scale: 0.5, opacity: 0, y: 30 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.8, opacity: 0, y: -20 }}
                        transition={{ type: "spring", damping: 15, stiffness: 200, delay: 0.1 }}
                        className="flex flex-col items-center gap-4 max-w-sm text-center"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Glowing icon container */}
                        <div className="relative">
                            <div className="absolute inset-0 rounded-full bg-yellow-500/30 blur-xl animate-pulse" />
                            <div className={cn(
                                "relative size-24 flex items-center justify-center rounded-full",
                                "bg-gradient-to-br from-yellow-400 to-amber-600 shadow-lg shadow-yellow-500/50",
                                "[&>svg]:size-12 text-white",
                            )}>
                                {currentUnlock.iconSVG ? (
                                    <span dangerouslySetInnerHTML={{ __html: currentUnlock.iconSVG }} />
                                ) : (
                                    <LuTrophy className="size-12" />
                                )}
                            </div>
                        </div>

                        {/* Text */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                        >
                            <p className="text-xs uppercase tracking-widest text-yellow-400 font-semibold mb-1">
                                Achievement Unlocked
                            </p>
                            <h2 className="text-2xl font-bold text-white">
                                {displayName}
                                {currentUnlock.tierName && (
                                    <span className="text-yellow-400 ml-2">{currentUnlock.tierName}</span>
                                )}
                            </h2>
                            <p className="text-sm text-gray-300 mt-2">{currentUnlock.description}</p>
                        </motion.div>

                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.5 }}
                            transition={{ delay: 1 }}
                            className="text-xs text-gray-400 mt-4"
                        >
                            Click anywhere to dismiss
                        </motion.p>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
