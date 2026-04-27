"use client"

import React, { createContext, useCallback, useContext, useEffect, useRef } from "react"
import { usePathname } from "@/lib/navigation"
import { toast } from "sonner"
import { useServerMutation } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { EASTER_EGG_DEFINITIONS, EASTER_EGG_MAP, EasterEggDefinition } from "./easter-egg-definitions"

// ─── Storage ──────────────────────────────────────────────────────────────────

const getStorageKey = () => {
    const profileKey = typeof window !== "undefined"
        ? (localStorage.getItem("sea-profile-key") ?? "default")
        : "default"
    return `sea-easter-eggs-${profileKey}`
}

const loadDiscovered = (): Set<string> => {
    if (typeof window === "undefined") return new Set()
    try {
        const raw = localStorage.getItem(getStorageKey())
        return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
    } catch {
        return new Set()
    }
}

const saveDiscovered = (ids: Set<string>) => {
    if (typeof window === "undefined") return
    localStorage.setItem(getStorageKey(), JSON.stringify(Array.from(ids)))
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface EasterEggContextValue {
    discovered: Set<string>
    trigger: (eggId: string) => void
}

const EasterEggContext = createContext<EasterEggContextValue>({
    discovered: new Set(),
    trigger: () => {},
})

export const useEasterEggs = () => useContext(EasterEggContext)

// ─── Provider ─────────────────────────────────────────────────────────────────

export function EasterEggEngine({ children }: { children: React.ReactNode }) {
    const discoveredRef = useRef<Set<string>>(loadDiscovered())
    const [, forceUpdate] = React.useReducer(x => x + 1, 0)

    const { mutate: discoverEgg } = useServerMutation<
        { granted: boolean; newLevel: number; leveledUp: boolean; totalXP: number; xpGranted: number },
        { eggId: string }
    >({
        endpoint: API_ENDPOINTS.PROFILE_PAGE.DiscoverEasterEgg.endpoint,
        method: "POST",
        mutationKey: ["discover-easter-egg"],
        onSuccess: (data, vars) => {
            if (!data?.granted) return
            const egg = EASTER_EGG_MAP.get(vars.eggId)
            if (!egg) return
            showEggToast(egg, data.xpGranted, data.leveledUp, data.newLevel)
        },
    })

    const trigger = useCallback((eggId: string) => {
        if (discoveredRef.current.has(eggId)) return
        if (!EASTER_EGG_MAP.has(eggId)) return
        discoveredRef.current.add(eggId)
        saveDiscovered(discoveredRef.current)
        forceUpdate()
        discoverEgg({ eggId })
    }, [discoverEgg])

    const pathname = usePathname()

    // ── Global listeners ───────────────────────────────────────────────────────

    // Page-visit triggers — fire whenever pathname changes
    useEffect(() => {
        if (!pathname) return
        const PAGE_EGGS = EASTER_EGG_DEFINITIONS.filter(e => e.trigger === "page-visit")
        for (const egg of PAGE_EGGS) {
            if (egg.pagePath && pathname.startsWith(egg.pagePath)) {
                trigger(egg.id)
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname])

    // Sequence buffer for keyboard-based triggers
    const keyBufferRef = useRef<string[]>([])

    useEffect(() => {
        const SEQUENCE_EGGS = EASTER_EGG_DEFINITIONS.filter(e =>
            e.trigger === "konami" || e.trigger === "type-sequence"
        )
        const MAX_SEQ = Math.max(...SEQUENCE_EGGS.map(e => e.sequence?.length ?? 0))

        const onKeyDown = (e: KeyboardEvent) => {
            const key = e.key
            keyBufferRef.current.push(key.toLowerCase())
            if (keyBufferRef.current.length > MAX_SEQ) {
                keyBufferRef.current.shift()
            }
            for (const egg of SEQUENCE_EGGS) {
                if (!egg.sequence) continue
                const seq = egg.sequence.map(k => k.toLowerCase())
                const tail = keyBufferRef.current.slice(-seq.length)
                if (tail.length === seq.length && tail.every((k, i) => k === seq[i])) {
                    trigger(egg.id)
                    keyBufferRef.current = []
                }
            }
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [trigger])

    // Click-count trackers
    useEffect(() => {
        const CLICK_EGGS = EASTER_EGG_DEFINITIONS.filter(e => e.trigger === "click-count")
        const counters = new Map<string, number>()

        const onClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement
            for (const egg of CLICK_EGGS) {
                if (!egg.target) continue
                const selector = egg.target
                if (target.closest(selector)) {
                    const prev = counters.get(egg.id) ?? 0
                    const next = prev + 1
                    counters.set(egg.id, next)
                    if (next === egg.clickCount) {
                        trigger(egg.id)
                    }
                }
            }
        }
        document.addEventListener("click", onClick)
        return () => document.removeEventListener("click", onClick)
    }, [trigger])

    // Time-of-day triggers (checked once on mount)
    useEffect(() => {
        const now = new Date()
        const hour = now.getHours()
        const dayOfWeek = now.getDay()

        for (const egg of EASTER_EGG_DEFINITIONS) {
            if (egg.trigger !== "time-of-day") continue
            let matches = egg.hour === hour
            if (egg.dayOfWeek !== undefined) matches = matches && egg.dayOfWeek === dayOfWeek
            if (matches) trigger(egg.id)
        }
    }, [trigger])

    // Date-based triggers (checked once on mount)
    useEffect(() => {
        const now = new Date()
        const month = now.getMonth() + 1
        const day = now.getDate()
        for (const egg of EASTER_EGG_DEFINITIONS) {
            if (egg.trigger !== "date") continue
            if (egg.month === month && egg.day === day) {
                trigger(egg.id)
            }
        }
    }, [trigger])

    // Scroll-to-bottom trigger
    useEffect(() => {
        const SCROLL_EGG = EASTER_EGG_DEFINITIONS.find(e => e.trigger === "scroll-to-bottom")
        if (!SCROLL_EGG) return
        const onScroll = () => {
            const scrolled = window.scrollY + window.innerHeight
            const total = document.documentElement.scrollHeight
            if (total > window.innerHeight && scrolled >= total - 50) {
                trigger(SCROLL_EGG.id)
            }
        }
        window.addEventListener("scroll", onScroll, { passive: true })
        return () => window.removeEventListener("scroll", onScroll)
    }, [trigger])

    // Idle trigger (first match wins)
    useEffect(() => {
        const IDLE_EGGS = EASTER_EGG_DEFINITIONS
            .filter(e => e.trigger === "idle")
            .sort((a, b) => (a.idleSeconds ?? 0) - (b.idleSeconds ?? 0))
        if (IDLE_EGGS.length === 0) return

        let lastActivity = Date.now()
        const resetActivity = () => { lastActivity = Date.now() }
        window.addEventListener("mousemove", resetActivity)
        window.addEventListener("keydown", resetActivity)

        const interval = setInterval(() => {
            const idleSec = (Date.now() - lastActivity) / 1000
            for (const egg of IDLE_EGGS) {
                if ((egg.idleSeconds ?? 0) <= idleSec) {
                    trigger(egg.id)
                }
            }
        }, 10_000)

        return () => {
            clearInterval(interval)
            window.removeEventListener("mousemove", resetActivity)
            window.removeEventListener("keydown", resetActivity)
        }
    }, [trigger])

    return (
        <EasterEggContext.Provider value={{ discovered: discoveredRef.current, trigger }}>
            {children}
        </EasterEggContext.Provider>
    )
}

// ─── Toast helper ─────────────────────────────────────────────────────────────

function showEggToast(egg: EasterEggDefinition, xp: number, leveledUp: boolean, newLevel: number) {
    toast.custom(() => (
        <div className="flex items-start gap-3 rounded-xl border border-yellow-500/30 bg-gray-950/95 p-4 shadow-2xl backdrop-blur min-w-[320px]">
            <span className="text-3xl">{egg.icon}</span>
            <div className="flex flex-col gap-0.5">
                <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                    🥚 Easter Egg Found!
                </p>
                <p className="font-bold text-white">{egg.name}</p>
                <p className="text-sm text-gray-400">{egg.description}</p>
                <p className="mt-1 text-sm font-semibold text-yellow-300">+{xp} XP</p>
                {leveledUp && (
                    <p className="text-sm font-bold text-indigo-400">⬆ Level up! Now level {newLevel}</p>
                )}
            </div>
        </div>
    ), { duration: 5000 })
}
