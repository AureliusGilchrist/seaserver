"use client"

import { AchievementUnlockPayload } from "@/api/hooks/achievement.hooks"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/components/ui/core/styling"
import { useAnimeThemeOrNull } from "@/lib/theme/anime-themes/anime-theme-provider"
import { WSEvents } from "@/lib/server/ws-events"
import { useQueryClient } from "@tanstack/react-query"
import { atomWithStorage } from "jotai/utils"
import { useAtom } from "jotai"
import { AnimatePresence, motion } from "motion/react"
import React from "react"
import { LuTrophy, LuFlag, LuCrown } from "react-icons/lu"

// ──────────────────────── Types ────────────────────────

type MilestoneUnlockPayload = {
    key: string
    name: string
    category: string
    threshold: number
    iconSVG?: string
    isFirstToAchieve?: boolean
    profileName?: string
}

type UnlockAccent = "achievement" | "milestone" | "first"

export type UnlockItem = {
    id: string
    kind: "achievement" | "milestone"
    accent: UnlockAccent
    key: string
    name: string
    description: string
    tierName?: string
    iconSVG?: string
}

// User preference: when enabled, a burst of unlocks is shown together (icon grid) in a single
// panel instead of one-at-a-time. Persisted so the choice sticks across sessions.
export const vc_combineAchievementsAtom = atomWithStorage("seanime-combine-achievements", false, undefined, { getOnInit: true })

const ACHIEVEMENT_CACHE_KEY = "seanime-unlocked-achievements-v1"
const MILESTONE_CACHE_KEY = "seanime-unlocked-milestones-v1"

function addToCache(storageKey: string, keys: string[]) {
    try {
        const raw = localStorage.getItem(storageKey)
        const set = new Set<string>(raw ? (JSON.parse(raw) as string[]) : [])
        for (const k of keys) set.add(k)
        localStorage.setItem(storageKey, JSON.stringify([...set]))
    } catch { /* ignore storage errors */ }
}

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

function ConfettiCanvas({ burstKey, duration = 2500 }: { burstKey: string | number; duration?: number }) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null)

    React.useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        canvas.width = window.innerWidth
        canvas.height = window.innerHeight

        const particles: Particle[] = []
        const count = 140
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
                p.vy += 0.05
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
            if (elapsed < duration) frame = requestAnimationFrame(animate)
        }
        frame = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(frame)
    }, [burstKey, duration])

    return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }} />
}

// ──────────────────────── Combined unlock feed ────────────────────────

/**
 * Listens to both achievement and milestone unlock events and exposes a single queue. Because
 * the panel stays open (and live-appends new arrivals) until the user accepts, a burst of many
 * unlocks in quick succession is naturally grouped without an artificial wait — addressing the
 * old single-slot overlays that could drop or flicker through rapid-fire unlocks.
 */
function useUnlockFeed() {
    const [queue, setQueue] = React.useState<UnlockItem[]>([])
    const qc = useQueryClient()

    const onAchievement = React.useCallback((data: AchievementUnlockPayload) => {
        // Persist immediately so it's never lost, then enqueue + refresh caches.
        const tierKeys = [`${data.key}:0`]
        for (let t = 1; t <= 5; t++) tierKeys.push(`${data.key}:${t}`)
        addToCache(ACHIEVEMENT_CACHE_KEY, tierKeys)
        qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ACHIEVEMENT.GetAchievements.key] })
        qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ACHIEVEMENT.GetAchievementSummary.key] })
        setQueue(prev => [...prev, {
            id: `a:${data.key}:${data.tier}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`,
            kind: "achievement",
            accent: "achievement",
            key: data.key,
            name: data.name,
            description: data.description,
            tierName: data.tierName || undefined,
            iconSVG: data.iconSVG || undefined,
        }])
    }, [qc])

    const onMilestone = React.useCallback((data: MilestoneUnlockPayload) => {
        addToCache(MILESTONE_CACHE_KEY, [`${data.key}:0`])
        qc.invalidateQueries({ queryKey: [API_ENDPOINTS.MILESTONES.GetMilestones.key] })
        const desc = `${(data.threshold ?? 0).toLocaleString()} ${(data.category || "").replace(/_/g, " ")}`.trim()
        setQueue(prev => [...prev, {
            id: `m:${data.key}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`,
            kind: "milestone",
            accent: data.isFirstToAchieve ? "first" : "milestone",
            key: data.key,
            name: data.name,
            description: data.isFirstToAchieve ? `First to achieve · ${desc}` : desc,
            iconSVG: data.iconSVG || undefined,
        }])
    }, [qc])

    useWebsocketMessageListener<AchievementUnlockPayload>({ type: WSEvents.ACHIEVEMENT_UNLOCKED, onMessage: onAchievement })
    useWebsocketMessageListener<MilestoneUnlockPayload>({ type: WSEvents.MILESTONE_ACHIEVED, onMessage: onMilestone })

    const acceptOne = React.useCallback(() => setQueue(prev => prev.slice(1)), [])
    const acceptAll = React.useCallback(() => setQueue([]), [])

    return { queue, acceptOne, acceptAll }
}

// ──────────────────────── Accent styling ────────────────────────

function accentClasses(accent: UnlockAccent) {
    switch (accent) {
        case "first":
            return {
                eyebrow: "text-yellow-300",
                iconWrap: "bg-gradient-to-br from-yellow-300 to-amber-600 shadow-yellow-500/50",
                glow: "bg-yellow-500/30",
            }
        case "milestone":
            return {
                eyebrow: "text-brand-300",
                iconWrap: "bg-gradient-to-br from-brand-400 to-brand-700 shadow-brand-500/50",
                glow: "bg-brand-500/30",
            }
        default:
            return {
                eyebrow: "text-yellow-400",
                iconWrap: "bg-gradient-to-br from-yellow-400 to-amber-600 shadow-yellow-500/50",
                glow: "bg-yellow-500/30",
            }
    }
}

function eyebrowLabel(item: UnlockItem) {
    if (item.accent === "first") return "First to Achieve!"
    if (item.kind === "milestone") return "Milestone Reached"
    return "Achievement Unlocked"
}

function IconBubble({ item, size = "lg" }: { item: UnlockItem; size?: "lg" | "sm" }) {
    const a = accentClasses(item.accent)
    const dims = size === "lg" ? "size-20 [&>svg]:size-10" : "size-11 [&>svg]:size-6"
    const Fallback = item.kind === "milestone" ? (item.accent === "first" ? LuCrown : LuFlag) : LuTrophy
    return (
        <div className="relative shrink-0">
            <div className={cn("absolute inset-0 rounded-full blur-xl", a.glow)} />
            <div className={cn("relative flex items-center justify-center rounded-full text-white shadow-lg", dims, a.iconWrap)}>
                {item.iconSVG
                    ? <span dangerouslySetInnerHTML={{ __html: item.iconSVG }} />
                    : <Fallback />}
            </div>
        </div>
    )
}

// ──────────────────────── Panel ────────────────────────

export function AchievementUnlockPanel() {
    const { queue, acceptOne, acceptAll } = useUnlockFeed()
    const [combine, setCombine] = useAtom(vc_combineAchievementsAtom)
    const themeCtx = useAnimeThemeOrNull()

    const visible = queue.length > 0
    // When combining, the whole queue is shown; otherwise just the first item.
    const shown = combine ? queue : queue.slice(0, 1)
    const head = shown[0]

    // Themed display name for achievements (milestones keep their name).
    const displayName = head
        ? (head.kind === "achievement" ? (themeCtx?.config.achievementNames[head.key] ?? head.name) : head.name)
        : ""

    // Confetti re-bursts whenever the count grows.
    const burstKey = `${visible ? "on" : "off"}:${queue.length}`

    const onAccept = React.useCallback(() => {
        if (combine) acceptAll()
        else acceptOne()
    }, [combine, acceptAll, acceptOne])

    return (
        <AnimatePresence>
            {visible && head && (
                <motion.div
                    key="achievement-unlock-panel"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
                    onClick={onAccept}
                >
                    <ConfettiCanvas burstKey={burstKey} />

                    <motion.div
                        initial={{ scale: 0.6, opacity: 0, y: 30 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.85, opacity: 0, y: -20 }}
                        transition={{ type: "spring", damping: 16, stiffness: 220 }}
                        className={cn(
                            "relative z-[2] w-[min(92vw,30rem)] rounded-2xl p-6 text-center",
                            "border border-white/10 bg-gradient-to-br from-gray-950/95 to-gray-900/95 shadow-2xl",
                        )}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Soft top glow that blends with the icon accent */}
                        <div className={cn(
                            "pointer-events-none absolute inset-x-0 -top-px h-24 rounded-t-2xl opacity-60 blur-2xl",
                            accentClasses(head.accent).glow,
                        )} />

                        {(combine && queue.length > 1) ? (
                            // ── Combined view: icon grid for the whole burst ──
                            <div className="relative">
                                <p className={cn("text-xs uppercase tracking-widest font-semibold mb-3", accentClasses(head.accent).eyebrow)}>
                                    {queue.length} Unlocked
                                </p>
                                <div className="flex flex-wrap justify-center gap-2 max-h-56 overflow-y-auto py-1">
                                    {queue.map(item => (
                                        <div key={item.id} title={item.name}>
                                            <IconBubble item={item} size="sm" />
                                        </div>
                                    ))}
                                </div>
                                <p className="text-sm text-gray-300 mt-3 line-clamp-2">
                                    {queue.slice(0, 3).map(i => i.name).join(", ")}
                                    {queue.length > 3 ? ` +${queue.length - 3} more` : ""}
                                </p>
                            </div>
                        ) : (
                            // ── Single view ──
                            <div className="relative flex flex-col items-center gap-4">
                                <IconBubble item={head} />
                                <div>
                                    <p className={cn("text-xs uppercase tracking-widest font-semibold mb-1", accentClasses(head.accent).eyebrow)}>
                                        {eyebrowLabel(head)}
                                    </p>
                                    <h2 className="text-2xl font-bold text-white">
                                        {displayName}
                                        {head.tierName && <span className={cn("ml-2", accentClasses(head.accent).eyebrow)}>{head.tierName}</span>}
                                    </h2>
                                    {head.description && <p className="text-sm text-gray-300 mt-2">{head.description}</p>}
                                </div>
                            </div>
                        )}

                        {/* Footer: Combine toggle + Accept */}
                        <div className="mt-6 flex items-center justify-between gap-3">
                            <Checkbox
                                label="Combine achievements"
                                value={combine}
                                onValueChange={v => setCombine(v === true)}
                                fieldClass="w-fit"
                                size="sm"
                            />
                            <Button intent="white" size="sm" onClick={onAccept}>
                                {combine && queue.length > 1 ? `Accept (${queue.length})` : "Accept"}
                            </Button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
