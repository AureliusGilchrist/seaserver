"use client"

import { formatNumber } from "@/lib/helpers/number"

import { buildSeaQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { profileSessionTokenAtom, serverAuthTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { cn } from "@/components/ui/core/styling"
import { QueuedProgressItem, setServerProgressQueue } from "@/lib/progress-queue/progress-queue"
import { WSEvents } from "@/lib/server/ws-events"
import { useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { useAtomValue } from "jotai"
import React from "react"
import { LuRefreshCw } from "react-icons/lu"
import { toast } from "sonner"

type PendingSyncResponse = { count: number, items?: QueuedProgressItem[] }
type ProgressQueueEvent = { items?: QueuedProgressItem[], synced?: QueuedProgressItem[] }

// The websocket event is the primary signal; the poll only covers a missed event or a reconnect.
const POLL_INTERVAL_MS = 30_000

/**
 * Indicator for episodes watched but not yet on AniList (rate limit, outage). The server queues the
 * update and sends it as soon as AniList takes it; this mirrors that queue into the progress-queue
 * store (so episode lists can gray queued episodes out), shows what is waiting, and refetches the
 * entry once an item lands.
 *
 * Mount once near the app root.
 */
export function PendingSyncIndicator() {
    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)
    const queryClient = useQueryClient()
    const [items, setItems] = React.useState<QueuedProgressItem[]>([])
    const prevCountRef = React.useRef(0)
    const [open, setOpen] = React.useState(false)

    const apply = React.useCallback((next: QueuedProgressItem[]) => {
        const prev = prevCountRef.current
        if (prev > 0 && next.length === 0) {
            toast.success(`Synced ${prev} queued episode${prev > 1 ? "s" : ""} to AniList`)
        }
        prevCountRef.current = next.length
        setItems(next)
        setServerProgressQueue(next)
    }, [])

    const refetchSynced = React.useCallback((synced: QueuedProgressItem[]) => {
        if (!synced.length) return
        queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANILIST.GetAnimeCollection.key] })
        queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_COLLECTION.GetLibraryCollection.key] })
        for (const s of synced) {
            queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key, String(s.mediaId)] })
        }
    }, [queryClient])

    const poll = React.useCallback(async () => {
        try {
            const res = await buildSeaQuery<PendingSyncResponse>({
                endpoint: "/api/v1/library/anime-entry/pending-sync",
                method: "GET",
                password,
                profileToken,
            })
            apply(res?.items ?? [])
        }
        catch {
            // best-effort; never disrupt UX over a status poll
        }
    }, [password, profileToken, apply])

    useWebsocketMessageListener<ProgressQueueEvent>({
        type: WSEvents.PROGRESS_QUEUE_UPDATED,
        onMessage: data => {
            apply(data?.items ?? [])
            refetchSynced(data?.synced ?? [])
        },
        deps: [apply, refetchSynced],
    })

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

    const count = items.length

    return (
        <AnimatePresence>
            {count > 0 && (
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 20, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className={cn(
                        "fixed bottom-4 left-4 z-[180] rounded-lg px-3 py-2 cursor-pointer",
                        "border border-[--border] bg-gray-950/90 backdrop-blur-md shadow-lg",
                        "text-xs text-[--muted] select-none",
                    )}
                    onClick={() => setOpen(o => !o)}
                    title="Your watched episodes are saved and will sync to AniList as soon as it accepts them."
                >
                    <div className="flex items-center gap-2">
                        <LuRefreshCw className="size-3.5 animate-spin text-brand-400" style={{ animationDuration: "2.5s" }} />
                        <span>
                            <span className="font-semibold text-[--foreground]">{formatNumber(count)}</span>{" "}
                            progress update{count > 1 ? "s" : ""} queued — syncing to AniList
                        </span>
                    </div>
                    {open && (
                        <ul className="mt-2 space-y-1 border-t border-[--border] pt-2">
                            {items.map(it => (
                                <QueuedItemRow key={it.mediaId} item={it} />
                            ))}
                        </ul>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    )
}

function QueuedItemRow({ item }: { item: QueuedProgressItem }) {
    const queryClient = useQueryClient()
    // Use whatever title is already cached for the entry; fall back to the id.
    const cached = queryClient.getQueryData<any>([API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key, String(item.mediaId)])
    const title = cached?.media?.title?.userPreferred ?? cached?.media?.title?.romaji ?? `Anime #${item.mediaId}`
    return (
        <li className="flex justify-between gap-4">
            <span className="truncate max-w-[14rem] text-[--foreground]">{title}</span>
            <span>Episode {item.progress}</span>
        </li>
    )
}
