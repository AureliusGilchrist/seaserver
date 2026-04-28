"use client"

import React from "react"
import { atom, useAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { WSEvents } from "@/lib/server/ws-events"
import { cn } from "@/components/ui/core/styling"
import { LuWifiOff, LuX, LuBellOff } from "react-icons/lu"

// ─── State ─────────────────────────────────────────────────────────────────

interface AnilistBannerState {
    visible: boolean
    retryAfter: number   // seconds until the rate limit resets
    dismissed: boolean
}

const anilistBannerAtom = atom<AnilistBannerState>({
    visible: false,
    retryAfter: 0,
    dismissed: false,
})

// Stores the timestamp (ms) until which the banner is muted
const anilistBannerMutedUntilAtom = atomWithStorage<number>("sea-anilist-banner-muted-until", 0)

// ─── Component ─────────────────────────────────────────────────────────────

export function AnilistStatusBanner() {
    const [state, setState] = useAtom(anilistBannerAtom)
    const [mutedUntil, setMutedUntil] = useAtom(anilistBannerMutedUntilAtom)
    const [countdown, setCountdown] = React.useState(0)
    const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

    const isMuted = Date.now() < mutedUntil

    const handleMute = () => {
        setMutedUntil(Date.now() + 3 * 60 * 60 * 1000) // 3 hours
        setState(s => ({ ...s, dismissed: true }))
    }

    // Listen for rate-limited event
    useWebsocketMessageListener<{ retryAfter: number }>({
        type: WSEvents.ANILIST_RATE_LIMITED,
        onMessage: data => {
            const secs = data?.retryAfter ?? 65
            setState({ visible: true, retryAfter: secs, dismissed: false })
            setCountdown(secs)
        },
    })

    // Listen for recovery event
    useWebsocketMessageListener<null>({
        type: WSEvents.ANILIST_API_ONLINE,
        onMessage: () => {
            setState(prev => ({ ...prev, visible: false, retryAfter: 0 }))
            setCountdown(0)
            if (intervalRef.current) clearInterval(intervalRef.current)
        },
    })

    // Countdown ticker
    React.useEffect(() => {
        if (intervalRef.current) clearInterval(intervalRef.current)
        if (!state.visible || countdown <= 0) return

        intervalRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(intervalRef.current!)
                    // Auto-hide after countdown ends (server should send AnilistAPIOnline but this is a fallback)
                    setState(s => ({ ...s, visible: false }))
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
    }, [state.visible, countdown > 0 && state.retryAfter])

    if (!state.visible || state.dismissed || isMuted) return null

    // Compute the absolute "resumes at" clock time from when the event was received
    const resumesAt = React.useMemo(() => {
        if (!state.retryAfter) return null
        const t = new Date(Date.now() + countdown * 1000)
        return t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    }, [countdown, state.retryAfter])

    const mins = Math.floor(countdown / 60)
    const secs = countdown % 60
    const countdownStr = mins > 0 ? `${mins}m ${secs.toString().padStart(2, "0")}s` : `${secs}s`

    return (
        <div className={cn(
            "fixed top-0 left-0 right-0 z-[99999] flex items-center justify-between gap-3 px-4 py-2",
            "bg-amber-950/95 border-b border-amber-700/60 backdrop-blur-sm",
            "shadow-[0_2px_16px_rgba(0,0,0,0.5)]",
        )}>
            <div className="flex items-center gap-3 min-w-0 flex-wrap">
                <div className="flex items-center gap-2">
                    <LuWifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
                    <p className="text-sm font-medium text-amber-200">
                        AniList rate-limited
                    </p>
                </div>
                {countdown > 0 && (
                    <div className="flex items-center gap-1.5 text-xs shrink-0">
                        <span className="text-amber-400/70">Next request in</span>
                        <span className="font-mono font-bold text-amber-300 bg-amber-900/70 px-1.5 py-0.5 rounded">
                            {countdownStr}
                        </span>
                        {resumesAt && (
                            <span className="text-amber-400/60 hidden sm:inline">
                                at {resumesAt}
                            </span>
                        )}
                    </div>
                )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <p className="text-xs text-amber-500/60 hidden md:block">
                    Collection syncing paused
                </p>
                <button
                    onClick={handleMute}
                    className="flex items-center gap-1 px-2 py-1 rounded text-amber-400/70 hover:text-amber-300 hover:bg-amber-800/50 transition-colors text-xs"
                    title="Mute for 3 hours"
                >
                    <LuBellOff className="w-3 h-3" />
                    <span className="hidden sm:inline">3h</span>
                </button>
                <button
                    onClick={() => setState(s => ({ ...s, dismissed: true }))}
                    className="p-1 rounded text-amber-400/60 hover:text-amber-300 hover:bg-amber-800/50 transition-colors"
                    title="Dismiss"
                >
                    <LuX className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    )
}
