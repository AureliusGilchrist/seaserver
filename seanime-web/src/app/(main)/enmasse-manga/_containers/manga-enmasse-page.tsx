"use client"

import { useMangaEnMasseStart, useMangaEnMasseStatus, useMangaEnMasseStop } from "@/api/hooks/enmasse.hooks"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { AppLayoutStack } from "@/components/ui/app-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import React, { useEffect, useRef, useState } from "react"
import { BiPlay, BiStop, BiPause } from "react-icons/bi"
import { LuCircleCheck, LuCircleX, LuCircleMinus, LuDownload, LuRefreshCw } from "react-icons/lu"
import { Switch } from "@/components/ui/switch"

export function MangaEnMassePage() {
    const { data: status, isLoading } = useMangaEnMasseStatus()
    const { mutate: start, isPending: isStarting } = useMangaEnMasseStart()
    const { mutate: stop, isPending: isStopping } = useMangaEnMasseStop()
    const [resumeToggle, setResumeToggle] = useState<boolean>(false)

    const downloadedScrollRef = useRef<HTMLDivElement>(null)
    const failedScrollRef = useRef<HTMLDivElement>(null)
    const skippedScrollRef = useRef<HTMLDivElement>(null)

    // Auto-scroll to bottom when new entries are added
    useEffect(() => {
        if (downloadedScrollRef.current) {
            downloadedScrollRef.current.scrollTop = downloadedScrollRef.current.scrollHeight
        }
    }, [status?.downloadedManga?.length])

    useEffect(() => {
        if (failedScrollRef.current) {
            failedScrollRef.current.scrollTop = failedScrollRef.current.scrollHeight
        }
    }, [status?.failedManga?.length])

    useEffect(() => {
        if (skippedScrollRef.current) {
            skippedScrollRef.current.scrollTop = skippedScrollRef.current.scrollHeight
        }
    }, [status?.skippedManga?.length])

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
                    <h2 className="text-2xl font-bold">Manga En Masse Downloader</h2>
                    <p className="text-[--muted]">
                        Automatically download manga from hakuneko-mangas.json
                    </p>
                </div>
                <div className="flex gap-2 items-start">
                    {!status?.isRunning ? (
                        <div className="flex flex-col gap-2 items-end">
                            <Button
                                intent="primary"
                                leftIcon={resumeToggle ? <LuRefreshCw className="text-xl" /> : <BiPlay className="text-xl" />}
                                onClick={() => start({ resume: resumeToggle })}
                                loading={isStarting}
                                disabled={isStarting}
                            >
                                {resumeToggle ? "Resume" : status?.hasSavedProgress ? "Start Fresh" : "Start Download"}
                            </Button>
                            {status?.hasSavedProgress && (
                                <div className="flex items-center gap-2 text-sm text-[--muted]">
                                    <Switch
                                        value={resumeToggle}
                                        onValueChange={setResumeToggle}
                                        label="Resume from saved progress"
                                        size="sm"
                                    />
                                </div>
                            )}
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

                    {status?.isRunning && status?.currentManga && (
                        <div className="bg-[--subtle] rounded-lg p-4 mb-4">
                            <p className="text-sm text-[--muted]">Currently processing:</p>
                            <div className="flex items-center gap-3 flex-wrap">
                                <p className="text-lg font-semibold text-blue-400">{status.currentManga}</p>
                                {status.currentChapter && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full border border-blue-500/40 bg-gradient-to-r from-blue-600/25 to-indigo-600/20 text-blue-100 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]">
                                        <span className="inline-block h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                                        Chapter {status.currentChapter}
                                    </span>
                                )}
                            </div>
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Downloaded */}
                    <Card className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <LuCircleCheck className="text-green-500 text-xl" />
                            <h3 className="font-semibold">
                                Downloaded ({status?.downloadedManga?.length || 0})
                            </h3>
                        </div>
                        <div ref={downloadedScrollRef} className="max-h-64 overflow-y-auto space-y-1">
                            {status?.downloadedManga?.slice(-100).map((manga, i) => (
                                <div
                                    key={i}
                                    className="text-sm text-green-400 bg-green-950/30 px-2 py-1 rounded"
                                >
                                    {manga}
                                </div>
                            ))}
                            {(!status?.downloadedManga || status.downloadedManga.length === 0) && (
                                <p className="text-sm text-[--muted]">No downloads yet</p>
                            )}
                        </div>
                    </Card>

                    {/* Skipped */}
                    <Card className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <LuCircleMinus className="text-yellow-500 text-xl" />
                            <h3 className="font-semibold">
                                Skipped ({status?.skippedManga?.length || 0})
                            </h3>
                        </div>
                        <div ref={skippedScrollRef} className="max-h-64 overflow-y-auto space-y-1">
                            {status?.skippedManga?.slice(-100).map((manga, i) => (
                                <div
                                    key={i}
                                    className="text-sm text-yellow-400 bg-yellow-950/30 px-2 py-1 rounded"
                                >
                                    {manga}
                                </div>
                            ))}
                            {(!status?.skippedManga || status.skippedManga.length === 0) && (
                                <p className="text-sm text-[--muted]">No skipped manga</p>
                            )}
                        </div>
                    </Card>

                    {/* Failed */}
                    <Card className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <LuCircleX className="text-red-500 text-xl" />
                            <h3 className="font-semibold">
                                Failed ({status?.failedManga?.length || 0})
                            </h3>
                        </div>
                        <div ref={failedScrollRef} className="max-h-64 overflow-y-auto space-y-1">
                            {status?.failedManga?.slice(-100).map((manga, i) => (
                                <div
                                    key={i}
                                    className="text-sm text-red-400 bg-red-950/30 px-2 py-1 rounded"
                                >
                                    {manga}
                                </div>
                            ))}
                            {(!status?.failedManga || status.failedManga.length === 0) && (
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
                            Reads manga list from{" "}
                            <code className="bg-[--subtle] px-1 rounded">
                                /aeternae/Soul/Otaku Media/Databases/weebcentral.json
                            </code>
                        </li>
                        <li>Searches for each manga on AniList to find a match</li>
                        <li>
                            If found, adds the manga to your <strong>Planning</strong> list on AniList/MAL
                        </li>
                        <li>
                            Fetches chapters from <strong>Weeb Central</strong> provider
                        </li>
                        <li>
                            Downloads all chapters to{" "}
                            <code className="bg-[--subtle] px-1 rounded">
                                Manga Download Directory/{"{"}Romaji Title{"}"}
                            </code>
                        </li>
                        <li>
                            Manga not found on AniList will be <strong>skipped</strong>
                        </li>
                    </ul>
                </Card>
            </AppLayoutStack>
        </PageWrapper>
    )
}
