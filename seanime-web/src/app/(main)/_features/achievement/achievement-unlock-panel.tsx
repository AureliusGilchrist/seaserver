"use client"

import { AchievementBatchUnlockPayload, AchievementUnlockPayload } from "@/api/hooks/achievement.hooks"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { cn } from "@/components/ui/core/styling"
import { useAnimeThemeOrNull } from "@/lib/theme/anime-themes/anime-theme-provider"
import { WSEvents } from "@/lib/server/ws-events"
import { useQueryClient } from "@tanstack/react-query"
import React from "react"
import { LuTrophy, LuFlag, LuCrown } from "react-icons/lu"
import { toast } from "sonner"

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

const ACHIEVEMENT_CACHE_KEY = "seanime-unlocked-achievements-v1"
const MILESTONE_CACHE_KEY = "seanime-unlocked-milestones-v1"

// The server now announces a whole evaluation pass in one message, so the usual case needs no
// batching here at all — see ACHIEVEMENTS_UNLOCKED below.
//
// This window remains for the messages that still arrive one at a time: a lone unlock announced by
// something outside a pass, and milestones, which are awarded by their own path. Anything landing
// inside it is shown in a single toast rather than a stream of them.
const BURST_WINDOW_MS = 400
// Hard cap so a long unlock chain still flushes promptly.
const BURST_MAX_WAIT_MS = 2000
// Rows rendered up-front; the rest stay collapsed behind a "+N more" button.
const VISIBLE_COUNT = 6

function addToCache(storageKey: string, keys: string[]) {
    try {
        const raw = localStorage.getItem(storageKey)
        const set = new Set<string>(raw ? (JSON.parse(raw) as string[]) : [])
        for (const k of keys) set.add(k)
        localStorage.setItem(storageKey, JSON.stringify([...set]))
    } catch { /* ignore storage errors */ }
}

// ──────────────────────── Accent styling ────────────────────────

function accentClasses(accent: UnlockAccent) {
    switch (accent) {
        case "first":
            return {
                border: "border-yellow-500/30",
                eyebrow: "text-yellow-300",
                iconWrap: "bg-gradient-to-br from-yellow-300 to-amber-600",
            }
        case "milestone":
            return {
                border: "border-brand-500/30",
                eyebrow: "text-brand-300",
                iconWrap: "bg-gradient-to-br from-brand-400 to-brand-700",
            }
        default:
            return {
                border: "border-yellow-500/30",
                eyebrow: "text-yellow-400",
                iconWrap: "bg-gradient-to-br from-yellow-400 to-amber-600",
            }
    }
}

function eyebrowLabel(items: UnlockItem[]) {
    if (items.length > 1) return `${items.length} Unlocked`
    const item = items[0]
    if (item.accent === "first") return "First to Achieve!"
    if (item.kind === "milestone") return "Milestone Reached"
    return "Achievement Unlocked"
}

function IconBubble({ item, size = "md" }: { item: UnlockItem; size?: "md" | "sm" }) {
    const a = accentClasses(item.accent)
    const dims = size === "md" ? "size-10 [&>svg]:size-5" : "size-8 [&>svg]:size-4"
    const Fallback = item.kind === "milestone" ? (item.accent === "first" ? LuCrown : LuFlag) : LuTrophy
    return (
        <div
            className={cn("flex shrink-0 items-center justify-center rounded-full text-white shadow-md", dims, a.iconWrap)}
            title={item.name}
        >
            {item.iconSVG
                ? <span dangerouslySetInnerHTML={{ __html: item.iconSVG }} />
                : <Fallback />}
        </div>
    )
}

// ──────────────────────── Toast body ────────────────────────

/**
 * Corner toast in the same shape as the easter-egg popup. A whole burst is one toast: only the
 * first {@link VISIBLE_COUNT} unlocks are rendered, the remainder are revealed on demand.
 */
function UnlockToast({ items, nameOf }: { items: UnlockItem[]; nameOf: (item: UnlockItem) => string }) {
    const [limit, setLimit] = React.useState(VISIBLE_COUNT)
    const shown = items.slice(0, limit)
    const rest = items.length - shown.length
    const accent = accentClasses(items[0].accent)

    return (
        <div className={cn(
            "flex w-[min(90vw,22rem)] flex-col gap-2 rounded-xl border bg-gray-950/95 p-4 shadow-2xl backdrop-blur",
            accent.border,
        )}>
            <p className={cn("text-xs font-semibold uppercase tracking-widest", accent.eyebrow)}>
                🏆 {eyebrowLabel(items)}
            </p>

            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {shown.map(item => (
                    <div key={item.id} className="flex items-center gap-3">
                        <IconBubble item={item} size={items.length > 1 ? "sm" : "md"} />
                        <div className="min-w-0">
                            <p className="truncate font-bold text-white">
                                {nameOf(item)}
                                {item.tierName &&
                                    <span className={cn("ml-2 font-semibold", accent.eyebrow)}>{item.tierName}</span>}
                            </p>
                            {item.description && <p className="truncate text-sm text-gray-400">{item.description}</p>}
                        </div>
                    </div>
                ))}
            </div>

            {rest > 0 && (
                <button
                    type="button"
                    onClick={() => setLimit(l => l + VISIBLE_COUNT)}
                    className="self-start text-xs font-semibold text-gray-400 transition hover:text-white"
                >
                    +{rest} more
                </button>
            )}
        </div>
    )
}

// ──────────────────────── Listener ────────────────────────

/**
 * Headless: listens to achievement + milestone unlocks, persists them, and flushes each burst as
 * a single corner toast. Renders nothing itself.
 */
export function AchievementUnlockPanel() {
    const qc = useQueryClient()
    const themeCtx = useAnimeThemeOrNull()

    const bufferRef = React.useRef<UnlockItem[]>([])
    const flushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    const burstStartRef = React.useRef<number>(0)

    // Themed display name for achievements (milestones keep their name).
    const themeConfig = themeCtx?.config
    const nameOf = React.useCallback((item: UnlockItem) => (
        item.kind === "achievement" ? (themeConfig?.achievementNames[item.key] ?? item.name) : item.name
    ), [themeConfig])
    const nameOfRef = React.useRef(nameOf)
    nameOfRef.current = nameOf

    const flush = React.useCallback(() => {
        if (flushTimerRef.current) {
            clearTimeout(flushTimerRef.current)
            flushTimerRef.current = null
        }
        const items = bufferRef.current
        bufferRef.current = []
        burstStartRef.current = 0
        if (!items.length) return
        toast.custom(() => <UnlockToast items={items} nameOf={nameOfRef.current} />, {
            duration: Math.min(10_000, 5000 + items.length * 500),
        })
    }, [])

    const enqueue = React.useCallback((item: UnlockItem) => {
        bufferRef.current = [...bufferRef.current, item]
        const now = Date.now()
        if (!burstStartRef.current) burstStartRef.current = now
        if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
        // Wait for the burst to go quiet, but never hold longer than the hard cap.
        const remaining = Math.max(0, BURST_MAX_WAIT_MS - (now - burstStartRef.current))
        flushTimerRef.current = setTimeout(flush, Math.min(BURST_WINDOW_MS, remaining))
    }, [flush])

    /**
     * Shows a set of unlocks as one toast, straight away.
     *
     * Anything already buffered goes with them: a milestone that landed a moment earlier belongs in
     * the same award, not in a toast of its own a fraction of a second later.
     */
    const enqueueMany = React.useCallback((items: UnlockItem[]) => {
        if (!items.length) return
        bufferRef.current = [...bufferRef.current, ...items]
        flush()
    }, [flush])

    React.useEffect(() => () => {
        if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    }, [])

    const onAchievement = React.useCallback((data: AchievementUnlockPayload) => {
        // Persist immediately so it's never lost, then enqueue + refresh caches.
        const tierKeys = [`${data.key}:0`]
        for (let t = 1; t <= 5; t++) tierKeys.push(`${data.key}:${t}`)
        addToCache(ACHIEVEMENT_CACHE_KEY, tierKeys)
        qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ACHIEVEMENT.GetAchievements.key] })
        qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ACHIEVEMENT.GetAchievementSummary.key] })
        enqueue({
            id: `a:${data.key}:${data.tier}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`,
            kind: "achievement",
            accent: "achievement",
            key: data.key,
            name: data.name,
            description: data.description,
            tierName: data.tierName || undefined,
            iconSVG: data.iconSVG || undefined,
        })
    }, [qc, enqueue])

    const onMilestone = React.useCallback((data: MilestoneUnlockPayload) => {
        addToCache(MILESTONE_CACHE_KEY, [`${data.key}:0`])
        qc.invalidateQueries({ queryKey: [API_ENDPOINTS.MILESTONES.GetMilestones.key] })
        const desc = `${(data.threshold ?? 0).toLocaleString()} ${(data.category || "").replace(/_/g, " ")}`.trim()
        enqueue({
            id: `m:${data.key}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`,
            kind: "milestone",
            accent: data.isFirstToAchieve ? "first" : "milestone",
            key: data.key,
            name: data.name,
            description: data.isFirstToAchieve ? `First to achieve · ${desc}` : desc,
            iconSVG: data.iconSVG || undefined,
        })
    }, [qc, enqueue])

    // A whole pass at once: everything it unlocked is already here, so it is shown immediately
    // rather than waiting on a window that exists to guess where a burst ends.
    const onAchievements = React.useCallback((data: AchievementBatchUnlockPayload) => {
        const unlocked = data?.achievements ?? []
        if (!unlocked.length) return

        for (const achievement of unlocked) {
            const tierKeys = [`${achievement.key}:0`]
            for (let t = 1; t <= 5; t++) tierKeys.push(`${achievement.key}:${t}`)
            addToCache(ACHIEVEMENT_CACHE_KEY, tierKeys)
        }
        qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ACHIEVEMENT.GetAchievements.key] })
        qc.invalidateQueries({ queryKey: [API_ENDPOINTS.ACHIEVEMENT.GetAchievementSummary.key] })

        const stamp = Date.now()
        enqueueMany(unlocked.map((achievement, index) => ({
            id: `a:${achievement.key}:${achievement.tier}:${stamp}:${index}`,
            kind: "achievement" as const,
            accent: "achievement" as const,
            key: achievement.key,
            name: achievement.name,
            description: achievement.description,
            tierName: achievement.tierName || undefined,
            iconSVG: achievement.iconSVG || undefined,
        })))
    }, [qc, enqueueMany])

    useWebsocketMessageListener<AchievementBatchUnlockPayload>({ type: WSEvents.ACHIEVEMENTS_UNLOCKED, onMessage: onAchievements })
    // Still handled, for anything that announces a single unlock on its own.
    useWebsocketMessageListener<AchievementUnlockPayload>({ type: WSEvents.ACHIEVEMENT_UNLOCKED, onMessage: onAchievement })
    useWebsocketMessageListener<MilestoneUnlockPayload>({ type: WSEvents.MILESTONE_ACHIEVED, onMessage: onMilestone })

    return null
}
