"use client"

import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { AnilistQueuedListEdit, useGetAnilistEditQueue } from "@/api/hooks/anilist.hooks"
import { anilistSaveStateAtom } from "@/app/(main)/_atoms/anilist-sync.atoms"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { cn } from "@/components/ui/core/styling"
import { Tooltip } from "@/components/ui/tooltip"
import { useQueryClient } from "@tanstack/react-query"
import { useAtom } from "jotai/react"
import React from "react"
import { LuCheck, LuCloudUpload, LuLoader } from "react-icons/lu"

const QUEUE_EVENT = "anilist-edit-queue-updated"

/**
 * Shows where a list save stands, beside the list status: saving, synced (briefly), or waiting for
 * AniList — the server queued it and keeps sending it in the background.
 */
export function AnilistSyncIndicator({ mediaId, className }: { mediaId: number | undefined, className?: string }) {
    const queryClient = useQueryClient()
    const [saveState, setSaveState] = useAtom(anilistSaveStateAtom)
    const { data: queue } = useGetAnilistEditQueue()

    useWebsocketMessageListener<AnilistQueuedListEdit[]>({
        type: QUEUE_EVENT,
        onMessage: items => {
            queryClient.setQueryData([API_ENDPOINTS.ANILIST.GetAnilistEditQueue.key], items ?? [])
        },
    })

    const queued = React.useMemo(() => (queue ?? []).find(e => e.mediaId === mediaId), [queue, mediaId])
    const state = mediaId ? saveState[mediaId] : undefined

    // The server's queue let go of it: AniList took it.
    React.useEffect(() => {
        if (!mediaId || state !== "queued" || queued || !queue) return
        setSaveState(prev => ({ ...prev, [mediaId]: "done" }))
        const t = setTimeout(() => setSaveState(prev => {
            if (prev[mediaId] !== "done") return prev
            const next = { ...prev }
            delete next[mediaId]
            return next
        }), 1800)
        return () => clearTimeout(t)
    }, [mediaId, state, queued, queue])

    if (!mediaId) return null

    if (state === "saving") {
        return <Pill className={className} tone="neutral" icon={<LuLoader className="size-3.5 animate-spin" />}>Saving</Pill>
    }
    if (queued || state === "queued") {
        return <Tooltip
            trigger={<span>
                <Pill className={className} tone="amber" icon={<LuCloudUpload className="size-3.5 animate-pulse" />}>Waiting to sync</Pill>
            </span>}
        >
            <span className="block max-w-xs text-xs">
                Saved here. AniList hasn't taken it yet, so it's being sent in the background
                {queued?.attempts ? ` (attempt ${queued.attempts})` : ""}.
                {queued?.lastError ? <span className="mt-1 block text-[--muted]">{queued.lastError}</span> : null}
            </span>
        </Tooltip>
    }
    if (state === "done") {
        return <Pill className={className} tone="green" icon={<LuCheck className="size-3.5" />}>Synced</Pill>
    }
    return null
}

/** "N changes waiting to sync", for places that show every queued edit. */
export function AnilistEditQueueChip({ className }: { className?: string }) {
    const { data: queue } = useGetAnilistEditQueue()
    if (!queue?.length) return null
    return <Tooltip
        trigger={<span>
            <Pill className={className} tone="amber" icon={<LuCloudUpload className="size-3.5 animate-pulse" />}>
                {queue.length} {queue.length === 1 ? "change" : "changes"} waiting to sync
            </Pill>
        </span>}
    >
        <ul className="max-w-xs space-y-0.5 text-xs">
            {queue.map(e => <li key={`${e.type}-${e.mediaId}`}>{e.title || `#${e.mediaId}`}</li>)}
        </ul>
    </Tooltip>
}

function Pill({ children, icon, tone, className }: { children: React.ReactNode, icon: React.ReactNode, tone: "neutral" | "amber" | "green", className?: string }) {
    return <span
        data-anilist-sync-indicator
        className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 backdrop-blur-md transition-colors animate-in fade-in duration-200",
            tone === "neutral" && "bg-white/[0.06] text-white/80 ring-white/10",
            tone === "amber" && "bg-amber-400/10 text-amber-200 ring-amber-300/25",
            tone === "green" && "bg-emerald-400/10 text-emerald-200 ring-emerald-300/25",
            className,
        )}
    >
        {icon}{children}
    </span>
}
