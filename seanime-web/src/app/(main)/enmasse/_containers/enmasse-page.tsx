"use client"

import { useEnMasseStart, useEnMasseStatus, useEnMasseStop } from "@/api/hooks/enmasse.hooks"
import { useDownloadingAnime } from "@/app/(main)/_atoms/downloading.atoms"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { AppLayoutStack } from "@/components/ui/app-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { useRouter } from "next/navigation"
import React, { useEffect, useRef, useState } from "react"
import { BiPlay, BiStop, BiPause } from "react-icons/bi"
import { LuCircleCheck, LuCircleX, LuDownload, LuRefreshCw } from "react-icons/lu"
import { Switch } from "@/components/ui/switch"

export function EnMassePage() {
    const router = useRouter()
    const { data: status, isLoading } = useEnMasseStatus()
    const { mutate: start, isPending: isStarting } = useEnMasseStart()
    const { mutate: stop, isPending: isStopping } = useEnMasseStop()
    const { addDownloadingAnime } = useDownloadingAnime()
    const [resumeToggle, setResumeToggle] = useState<boolean>(false)
    
    const downloadedScrollRef = useRef<HTMLDivElement>(null)
    const failedScrollRef = useRef<HTMLDivElement>(null)

    // Auto-scroll to bottom when new entries are added
    useEffect(() => {
        if (downloadedScrollRef.current) {
            downloadedScrollRef.current.scrollTop = downloadedScrollRef.current.scrollHeight
        }
    }, [status?.downloadedAnime?.length])

    useEffect(() => {
        if (failedScrollRef.current) {
            failedScrollRef.current.scrollTop = failedScrollRef.current.scrollHeight
        }
    }, [status?.failedAnime?.length])

    // Add downloading badge when current anime changes
    useEffect(() => {
        if (status?.currentAnimeId) {
            addDownloadingAnime(status.currentAnimeId)
        }
    }, [status?.currentAnimeId, addDownloadingAnime])

    // Redirect to unmatched when completed
    useEffect(() => {
        if (status?.status === "Completed! Redirecting to unmatched...") {
            const timer = setTimeout(() => {
                router.push("/unmatched")
            }, 2000)
            return () => clearTimeout(timer)
        }
    }, [status?.status, router])

    if (isLoading) {
        return (
            <PageWrapper className="p-4 sm:p-8 space-y-4">
                <div className="flex justify-center items-center h-64">
                    <LoadingSpinner />
                </div>
            </PageWrapper>
        )
    }

    return (
        <PageWrapper className="p-4 sm:p-8 space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Anime En Masse Downloader</h2>
                    <p className="text-[--muted]">
                        Automatically download anime from your AniList collection
                    </p>
                </div>
                <div className="flex gap-2 items-start">
                    {!status?.isRunning ? (
                        <div className="flex flex-col gap-2 items-end">
                            <Button
                                intent="primary"
                                leftIcon={resumeToggle ? <LuRefreshCw className="text-xl" /> : <BiPlay className="text-xl" />}
                                onClick={() => start({ resume: resumeToggle && !!status?.hasSavedProgress })}
                                loading={isStarting}
                                disabled={isStarting}
                            >
                                {resumeToggle ? "Resume" : status?.hasSavedProgress ? "Start Fresh" : "Start Download"}
                            </Button>
                            <div className="flex items-center gap-2 text-sm text-[--muted]">
                                <Switch
                                    value={resumeToggle}
                                    onValueChange={setResumeToggle}
                                    label="Resume from saved progress"
                                    size="sm"
                                />
                                {!status?.hasSavedProgress && (
                                    <span className="text-[--muted] text-xs">No saved progress yet</span>
                                )}
                            </div>
                        </div>
                    ) : (
                        <>
                            <Button
                                intent="warning"
                                leftIcon={<BiPause className="text-xl" />}
                                onClick={() => stop({ saveProgress: true })}
                                loading={isStopping}
                                disabled={isStopping}
                            >
                                Pause
                            </Button>
                            <Button
                                intent="alert"
                                leftIcon={<BiStop className="text-xl" />}
                                onClick={() => stop({ saveProgress: false })}
                                loading={isStopping}
                                disabled={isStopping}
                            >
                                Stop
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <AppLayoutStack>
                {/* Status Card */}
                <Card className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-semibold">Status:</span>
                            {status?.isRunning ? (
                                <Badge intent="primary" className="animate-pulse">
                                    <LuDownload className="mr-1" /> Running
                                </Badge>
                            ) : status?.isPaused || status?.hasSavedProgress ? (
                                <Badge intent="warning">Paused</Badge>
                            ) : (
                                <Badge intent="gray">Idle</Badge>
                            )}
                        </div>
                    </div>

                    <p className="text-[--muted] mb-4">{status?.status || "Ready to start"}</p>

                    {status?.isRunning && status?.currentAnime && (
                        <div className="bg-[--subtle] rounded-lg p-4 mb-4">
                            <p className="text-sm text-[--muted]">Currently processing:</p>
                            <p className="text-lg font-semibold text-blue-400">
                                {status.currentAnime}
                            </p>
                        </div>
                    )}

                    {(status?.totalCount ?? 0) > 0 && (
                        <div className="mb-4">
                            <div className="flex justify-between text-sm mb-1">
                                <span>Progress</span>
                                <span>
                                    {status?.processedCount || 0} / {status?.totalCount || 0}
                                </span>
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-2.5">
                                <div
                                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                                    style={{
                                        width: `${((status?.processedCount || 0) / (status?.totalCount || 1)) * 100}%`,
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </Card>

                {/* Results */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Downloaded */}
                    <Card className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <LuCircleCheck className="text-green-500 text-xl" />
                            <h3 className="font-semibold">
                                Downloaded ({status?.downloadedAnime?.length || 0})
                            </h3>
                        </div>
                        <div ref={downloadedScrollRef} className="max-h-64 overflow-y-auto space-y-1">
                            {status?.downloadedAnime?.slice(-100).map((anime, i) => (
                                <div
                                    key={i}
                                    className="text-sm text-green-400 bg-green-950/30 px-2 py-1 rounded"
                                >
                                    {anime}
                                </div>
                            ))}
                            {(!status?.downloadedAnime || status.downloadedAnime.length === 0) && (
                                <p className="text-sm text-[--muted]">No downloads yet</p>
                            )}
                        </div>
                    </Card>

                    {/* Failed */}
                    <Card className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <LuCircleX className="text-red-500 text-xl" />
                            <h3 className="font-semibold">
                                Failed ({status?.failedAnime?.length || 0})
                            </h3>
                        </div>
                        <div ref={failedScrollRef} className="max-h-64 overflow-y-auto space-y-1">
                            {status?.failedAnime?.slice(-100).map((anime, i) => (
                                <div
                                    key={i}
                                    className="text-sm text-red-400 bg-red-950/30 px-2 py-1 rounded"
                                >
                                    {anime}
                                </div>
                            ))}
                            {(!status?.failedAnime || status.failedAnime.length === 0) && (
                                <p className="text-sm text-[--muted]">No failures</p>
                            )}
                        </div>
                    </Card>
                </div>

                {/* Instructions */}
                <Card className="p-4">
                    <h3 className="font-semibold mb-2">How it works</h3>
                    <ul className="text-sm text-[--muted] space-y-1 list-disc list-inside">
                        <li>
                            Reads anime list from{" "}
                            <code className="bg-[--subtle] px-1 rounded">
                                /aeternae/Soul/Otaku Media/Database/anilist-minified.json
                            </code>
                        </li>
                        <li>Searches for each anime using the default torrent provider</li>
                        <li>
                            Prefers: <strong>Dual-audio</strong> &gt; Multi-audio &gt; 1080p
                            resolution
                        </li>
                        <li>
                            Downloads to{" "}
                            <code className="bg-[--subtle] px-1 rounded">
                                /aeternae/Otaku/Unmatched
                            </code>
                        </li>
                        <li>
                            When complete, go to <strong>Unmatched Downloads</strong> to match files
                            to anime
                        </li>
                    </ul>
                </Card>
            </AppLayoutStack>
        </PageWrapper>
    )
}
