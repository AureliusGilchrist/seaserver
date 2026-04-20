"use client"

import { useAchievementUnlockListener } from "@/api/hooks/achievement.hooks"
import { cn } from "@/components/ui/core/styling"
import { useAnimeThemeOrNull } from "@/lib/theme/anime-themes/anime-theme-provider"
import { AnimatePresence, motion } from "motion/react"
import React from "react"
import { LuTrophy } from "react-icons/lu"

// ──────────────────────── Canvas confetti ────────────────────────

interface Particle {
    x: number; y: number; vx: number; vy: number
    w: number; h: number; rot: number; rv: number
    color: string; life: number
}

const CONFETTI_COLORS = [
    "#FFD700", "#FF6B6B", "#6BCB77", "#4D96FF",
    "#FF8C32", "#C084FC", "#22D3EE", "#FB7185",
    "#FBBF24", "#34D399", "#F472B6", "#818CF8",
]

function ConfettiCanvas({ duration = 3000 }: { duration?: number }) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null)

    React.useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        canvas.width = window.innerWidth
        canvas.height = window.innerHeight

        const particles: Particle[] = []
        const count = 150

        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: -10 - Math.random() * canvas.height * 0.5,
                vx: (Math.random() - 0.5) * 6,
                vy: Math.random() * 4 + 2,
                w: Math.random() * 8 + 4,
                h: Math.random() * 6 + 2,
                rot: Math.random() * Math.PI * 2,
                rv: (Math.random() - 0.5) * 0.2,
                color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
                life: 1,
            })
        }

        let frame: number
        const start = performance.now()

        function animate(now: number) {
            const elapsed = now - start
            const fade = Math.max(0, 1 - elapsed / duration)
            ctx!.clearRect(0, 0, canvas!.width, canvas!.height)

            for (const p of particles) {
                p.x += p.vx
                p.vy += 0.05 // gravity
                p.y += p.vy
                p.rot += p.rv
                p.life = fade

                ctx!.save()
                ctx!.translate(p.x, p.y)
                ctx!.rotate(p.rot)
                ctx!.globalAlpha = p.life
                ctx!.fillStyle = p.color
                ctx!.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
                ctx!.restore()
            }

            if (elapsed < duration) {
                frame = requestAnimationFrame(animate)
            }
        }

        frame = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(frame)
    }, [duration])

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 1 }}
        />
    )
}

// ──────────────────────── Achievement overlay ────────────────────────

export function AchievementCelebrationOverlay() {
    const { currentUnlock, dismiss, hasPending } = useAchievementUnlockListener()
    const themeCtx = useAnimeThemeOrNull()

    React.useEffect(() => {
        if (!currentUnlock) return
        const timer = setTimeout(dismiss, 3000)
        return () => clearTimeout(timer)
    }, [currentUnlock, dismiss])

    // Map achievement name to themed name
    const displayName = currentUnlock
        ? (themeCtx?.config.achievementNames[currentUnlock.key] ?? currentUnlock.name)
        : ""

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
                    {/* Confetti layer */}
                    <ConfettiCanvas duration={3000} />

                    <motion.div
                        initial={{ scale: 0.5, opacity: 0, y: 30 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.8, opacity: 0, y: -20 }}
                        transition={{ type: "spring", damping: 15, stiffness: 200, delay: 0.1 }}
                        className="relative z-[2] flex flex-col items-center gap-4 max-w-sm text-center"
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
                            {currentUnlock.xpAwarded > 0 && (
                                <motion.p
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.5 }}
                                    className="text-sm font-bold text-yellow-300 mt-2"
                                >
                                    +{currentUnlock.xpAwarded} XP
                                </motion.p>
                            )}
                        </motion.div>

                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.5 }}
                            transition={{ delay: 1 }}
                            className="text-xs text-gray-400 mt-2"
                        >
                            Click anywhere to dismiss
                        </motion.p>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
