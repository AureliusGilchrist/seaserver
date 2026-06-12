"use client"

import { buildSeaQuery } from "@/api/client/requests"
import { profileSessionTokenAtom, serverAuthTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { cn } from "@/components/ui/core/styling"
import { AnimatePresence, motion } from "motion/react"
import { useAtomValue } from "jotai"
import React from "react"
import { LuRefreshCw } from "react-icons/lu"
import { toast } from "sonner"

type PendingSyncResponse = { count: number }

const POLL_INTERVAL_MS = 30_000

/**
 * Subtle indicator for episodes watched while AniList was unreachable. The server records the
 * true progress locally and queues it; this polls the queued count and reassures the user that
 * nothing was lost, then toasts when the queue drains (auto-synced on AniList recovery).
 *
 * Mount once near the app root.
 */
export function PendingSyncIndicator() {
    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)
    const [count, setCount] = React.useState(0)
    const prevCountRef = React.useRef(0)

    const poll = React.useCallback(async () => {
        try {
            const res = await buildSeaQuery<PendingSyncResponse>({
                endpoint: "/api/v1/library/anime-entry/pending-sync",
                method: "GET",
                password,
                profileToken,
            })
            const next = res?.count ?? 0
            const prev = prevCountRef.current
            // Queue drained → everything synced.
            if (prev > 0 && next === 0) {
                toast.success(`Synced ${prev} queued episode${prev > 1 ? "s" : ""} to AniList`)
            }
            prevCountRef.current = next
            setCount(next)
        }
        catch {
            // best-effort; never disrupt UX over a status poll
        }
    }, [password, profileToken])

    React.useEffect(() => {
        poll()
        const onOnline = () => poll()
        window.addEventListener("online", onOnline)
        const interval = window.setInterval(poll, POLL_INTERVAL_MS)
        return () => {
            window.removeEventListener("online", onOnline)
            window.clearInterval(interval)
        }
    }, [poll])

    return (
        <AnimatePresence>
            {count > 0 && (
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 20, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className={cn(
                        "fixed bottom-4 left-4 z-[180] flex items-center gap-2 rounded-lg px-3 py-2",
                        "border border-[--border] bg-gray-950/90 backdrop-blur-md shadow-lg",
                        "text-xs text-[--muted] select-none",
                    )}
                    title="AniList was unreachable — your watched episodes are saved and will sync automatically."
                >
                    <LuRefreshCw className="size-3.5 animate-spin text-brand-400" style={{ animationDuration: "2.5s" }} />
                    <span>
                        <span className="font-semibold text-[--foreground]">{count}</span>{" "}
                        episode{count > 1 ? "s" : ""} queued — will sync when AniList is back
                    </span>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
