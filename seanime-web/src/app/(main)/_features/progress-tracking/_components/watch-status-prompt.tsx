"use client"

import { useServerMutation } from "@/api/client/requests"
import { useEditAnilistListEntry } from "@/api/hooks/anilist.hooks"
import { useGetAnimeEntry } from "@/api/hooks/anime_entries.hooks"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { atom, useAtom } from "jotai"
import React from "react"

// A series you start watching while it is Planning, Paused or Completed is not moved on your behalf:
// the server leaves its status alone (anilist.ProgressStatus) and this asks. Each series is asked
// once per run of the app, and the in-app player draws it too, since a page-level card is hidden
// behind a fullscreen player.

const answeredAtom = atom<Set<number>>(new Set<number>())

const STATUS_LABEL: Record<string, string> = {
    PLANNING: "on your Planning list",
    PAUSED: "paused",
    COMPLETED: "completed",
}

export function WatchStatusPrompt({ mediaId, className }: { mediaId: number | null | undefined, className?: string }) {
    const { data: entry } = useGetAnimeEntry(mediaId || null)
    const [answered, setAnswered] = useAtom(answeredAtom)
    const { mutate: editEntry, isPending } = useEditAnilistListEntry(mediaId, "anime")
    const { mutate: setRewatches } = useServerMutation<boolean, { mediaId: number, repeat: number }>({
        endpoint: "/api/v1/anilist/list-entry/rewatch",
        method: "POST",
        mutationKey: ["ANILIST-set-rewatches"],
    })

    const status = entry?.listData?.status
    if (!mediaId || !status || !STATUS_LABEL[status] || answered.has(mediaId)) return null

    const isRewatch = status === "COMPLETED"
    const title = entry?.media?.title?.userPreferred || "This series"

    function answer() {
        setAnswered(prev => new Set(prev).add(mediaId!))
    }

    function accept() {
        answer()
        editEntry({ mediaId: mediaId!, status: "CURRENT", type: "anime", ...(isRewatch ? { progress: 0 } : {}) })
        if (isRewatch) setRewatches({ mediaId: mediaId!, repeat: (entry?.listData?.repeat ?? 0) + 1 })
    }

    return (
        <div
            data-watch-status-prompt
            className={cn("pointer-events-auto w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-black/70 p-4 shadow-xl shadow-black/30 backdrop-blur-md", className)}
            onClick={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
        >
            <p className="line-clamp-2 text-sm font-semibold text-white">{title} is {STATUS_LABEL[status]}</p>
            <p className="mt-1 text-xs text-white/65">
                {isRewatch ? "Set it to Watching and add 1 to your rewatches?" : "Set it to Watching?"}
            </p>
            <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" intent="gray-subtle" onClick={answer}>No</Button>
                <Button size="sm" intent="primary" disabled={isPending} onClick={accept}>Yes</Button>
            </div>
        </div>
    )
}
