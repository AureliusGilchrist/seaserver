"use client"
import { useCancelMangaHydration, useGetMangaHydrationStatus, type MangaHydrationDetail } from "@/api/hooks/manga.hooks"
import { __scanner_isScanningAtom } from "@/app/(main)/(library)/_containers/scanner-modal"

import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader } from "@/components/ui/card"
import { Spinner } from "@/components/ui/loading-spinner"
import { ProgressBar } from "@/components/ui/progress-bar"
import { WSEvents } from "@/lib/server/ws-events"
import { useAtom } from "jotai/react"
import React, { useState } from "react"

export function ScanProgressBar() {

    const [isScanning] = useAtom(__scanner_isScanningAtom)

    const [progress, setProgress] = useState(0)
    const [status, setStatus] = useState("Scanning...")

    React.useEffect(() => {
        if (!isScanning) {
            setProgress(0)
            setStatus("Scanning...")
        }
    }, [isScanning])

    useWebsocketMessageListener<number>({
        type: WSEvents.SCAN_PROGRESS,
        onMessage: data => {
            console.log("Scan progress", data)
            setProgress(data)
        },
    })

    useWebsocketMessageListener<string>({
        type: WSEvents.SCAN_STATUS,
        onMessage: data => {
            console.log("Scan status", data)
            setStatus(data)
        },
    })

    if (!isScanning) return null

    return (
        <>
            <div className="w-full bg-gray-950 fixed top-0 left-0 z-[100]" data-scan-progress-bar-container>
                <ProgressBar size="xs" value={progress} />
            </div>
            {/*<div className="fixed left-0 top-8 w-full flex justify-center z-[100]">*/}
            {/*    <div className="bg-gray-900 rounded-full border h-14 px-6 flex gap-2 items-center">*/}
            {/*        <Spinner className="w-4 h-4" />*/}
            {/*        <p>{progress}% - {status}</p>*/}
            {/*    </div>*/}
            {/*</div>*/}
            <div className="z-50 fixed bottom-4 right-4" data-scan-progress-bar-card-container>
                <PageWrapper>
                    <Card className="w-fit max-w-[400px] relative" data-scan-progress-bar-card>
                        <CardHeader>
                            <CardDescription className="flex items-center gap-2 text-base text-[--foregorund]">
                                <Spinner className="size-6" /> {progress}% - {status}
                            </CardDescription>
                        </CardHeader>
                    </Card>
                </PageWrapper>
            </div>
        </>
    )

}

export function MangaHydrationProgressBar() {
    const { data: hydrationStatus } = useGetMangaHydrationStatus()
    const { mutate: cancelHydration, isPending: isCancellingHydration } = useCancelMangaHydration()
    const [isMinimized, setIsMinimized] = useState(false)
    const [dismissedRunId, setDismissedRunId] = useState<string | null>(null)

    if (!hydrationStatus) return null

    const hasRun = hydrationStatus.total > 0 || hydrationStatus.processed > 0 || !!hydrationStatus.startedAt
    if (!hydrationStatus.isRunning && !hasRun) return null

    const runId = hydrationStatus.startedAt ?? ""
    const isDismissed = !hydrationStatus.isRunning && dismissedRunId === runId

    if (isDismissed) return null

    const details: MangaHydrationDetail[] = (hydrationStatus.details ?? []).slice(-8).reverse()

    return (
        <>
            <div className="z-50 fixed bottom-4 right-4" data-manga-hydration-status-card-container>
                <PageWrapper>
                    <Card className="w-[440px] max-w-[calc(100vw-2rem)]" data-manga-hydration-status-card>
                        <CardHeader className="space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <CardDescription className="text-base text-[--foreground]">
                                    Manga metadata hydration {hydrationStatus.isRunning ? "in progress" : "complete"}
                                </CardDescription>

                                <div className="flex items-center gap-1">
                                    {!!hydrationStatus.isRunning && (
                                        <Button
                                            intent="white-subtle"
                                            size="sm"
                                            onClick={() => setIsMinimized(prev => !prev)}
                                        >
                                            {isMinimized ? "Restore" : "Minimize"}
                                        </Button>
                                    )}

                                    {!hydrationStatus.isRunning && (
                                        <Button
                                            intent="white-subtle"
                                            size="sm"
                                            onClick={() => setDismissedRunId(runId)}
                                        >
                                            X
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {isMinimized ? (
                                <>
                                    <ProgressBar size="sm" value={hydrationStatus.progress} />
                                    <div className="text-xs text-[--muted] space-y-1">
                                        <p>{hydrationStatus.processed}/{hydrationStatus.total} processed ({Math.round(hydrationStatus.progress)}%)</p>
                                        <p>Hydrated: {hydrationStatus.aniListHydrated + hydrationStatus.syntheticHydrated} | Skipped: {hydrationStatus.skipped} | Failed: {hydrationStatus.failed}</p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <ProgressBar size="sm" value={hydrationStatus.progress} />

                                    <div className="text-xs text-[--muted] space-y-1">
                                        <p>{hydrationStatus.processed}/{hydrationStatus.total} processed ({Math.round(hydrationStatus.progress)}%)</p>
                                        <p>AniList hydrated: {hydrationStatus.aniListHydrated} | Synthetic hydrated: {hydrationStatus.syntheticHydrated}</p>
                                        <p>Skipped: {hydrationStatus.skipped} | Failed: {hydrationStatus.failed}</p>
                                        {!!hydrationStatus.wasCancelled && <p>Status: cancelled</p>}
                                    </div>

                                    {!!hydrationStatus.isRunning && (
                                        <div>
                                            <Button
                                                intent="alert-subtle"
                                                size="sm"
                                                onClick={() => cancelHydration()}
                                                disabled={isCancellingHydration || !!hydrationStatus.cancelRequested}
                                            >
                                                {hydrationStatus.cancelRequested ? "Cancelling..." : "Cancel hydration"}
                                            </Button>
                                        </div>
                                    )}

                                    {details.length > 0 && (
                                        <div className="max-h-36 overflow-y-auto rounded-md border border-gray-800 px-2 py-1 text-xs space-y-1">
                                            {details.map((detail, index) => (
                                                <p key={`${detail.timestamp}-${detail.mediaId}-${index}`} className="text-[--muted] leading-5">
                                                    [{detail.source}] {detail.action.toUpperCase()} {detail.mediaId ? `#${detail.mediaId}` : ""} {detail.title || ""} {detail.message ? `- ${detail.message}` : ""}
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </CardHeader>
                    </Card>
                </PageWrapper>
            </div>
        </>
    )
}
