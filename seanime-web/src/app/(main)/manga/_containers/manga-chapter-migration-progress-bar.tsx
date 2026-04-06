"use client"

import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { ProgressBar } from "@/components/ui/progress-bar"
import { WSEvents } from "@/lib/server/ws-events"
import React from "react"

type MangaChapterMigrationProgressPayload = {
    running: boolean
    currentSeries: number
    totalSeries: number
    migrated: number
    failed: number
    percentage: number
    seriesDir?: string
    status: string
}

export function MangaChapterMigrationProgressBar() {
    const [state, setState] = React.useState<MangaChapterMigrationProgressPayload | null>(null)

    useWebsocketMessageListener<MangaChapterMigrationProgressPayload>({
        type: WSEvents.MANGA_CHAPTER_MIGRATION_PROGRESS,
        onMessage: data => {
            setState(data)
        },
    })

    if (!state || (!state.running && state.status !== "completed" && state.status !== "error")) return null

    const show = state.running || state.status === "completed" || state.status === "error"
    if (!show) return null

    return (
        <div className="w-full bg-gray-950 fixed top-0 left-0 z-[101]" data-manga-migration-progress-bar-container>
            <ProgressBar size="xs" value={Math.max(0, Math.min(100, state.percentage || 0))} />
            <div className="px-3 py-1 text-[10px] text-gray-300 border-b border-gray-800 bg-gray-950/95" data-manga-migration-progress-text>
                {state.status === "completed"
                    ? `Manga chapter migration complete (${state.migrated} renamed${state.failed > 0 ? `, ${state.failed} failed` : ""})`
                    : state.status === "error"
                        ? "Manga chapter migration failed"
                        : `Migrating chapter folders ${state.currentSeries}/${state.totalSeries} (${state.percentage}%)`}
            </div>
        </div>
    )
}
