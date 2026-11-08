"use client"

import { useEnMasseStart, useEnMasseStatus, useEnMasseStop } from "@/api/hooks/enmasse.hooks"
import { useDownloadingAnime } from "@/app/(main)/_atoms/downloading.atoms"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { AppLayoutStack } from "@/components/ui/app-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { __anime_streamDownloadsModalIsOpenAtom } from "@/app/(main)/onlinestream/_containers/anime-downloads/anime-downloads-modal"
import { useSetAtom } from "jotai/react"
import React, { useEffect, useRef, useState } from "react"
import { BiPlay, BiStop, BiPause } from "react-icons/bi"
import { LuCircleCheck, LuCircleX, LuDownload, LuMonitorDown, LuRefreshCw, LuSkipForward } from "react-icons/lu"
import { Switch } from "@/components/ui/switch"
import { formatNumber } from "@/lib/helpers/number"

export function EnMassePage() {
    const openDownloadQueue = useSetAtom(__anime_streamDownloadsModalIsOpenAtom)
    const [shouldPoll, setShouldPoll] = useState<boolean>(false)
    const { data: status, isLoading } = useEnMasseStatus(true, shouldPoll)
    const { mutate: start, isPending: isStarting } = useEnMasseStart()
    const { mutate: stop, isPending: isStopping } = useEnMasseStop()
    const { addDownloadingAnime } = useDownloadingAnime()
    const [resumeToggle, setResumeToggle] = useState<boolean>(false)
    
    const downloadedScrollRef = useRef<HTMLDivElement>(null)
    const failedScrollRef = useRef<HTMLDivElement>(null)

    // Enable polling only when the downloader is running
    useEffect(() => {
        setShouldPoll(!!status?.isRunning)
    }, [status?.isRunning])

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
                        Finds every series your library doesn't have on Kickassanime and downloads it, matched automatically
                    </p>
                </div>
                <div className="flex gap-2 items-start">
                    <Button
                        intent="white-subtle"
                        leftIcon={<LuMonitorDown className="text-xl" />}
                        onClick={() => openDownloadQueue(true)}
                    >
                        Download queue
                    </Button>
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

                    {status?.details && (
                        <div className="mb-4 rounded-lg border border-[--border] bg-[--subtle]/40 p-4">
                            <p className="mb-3 text-sm font-semibold">Live Details</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                                <div>
                                    <span className="text-[--muted]">Phase:</span> {status.details.phase || "-"}
                                </div>
                                <div>
                                    <span className="text-[--muted]">Step:</span> {status.details.step || "-"}
                                </div>
                                <div>
                                    <span className="text-[--muted]">Anime:</span>{" "}
                                    {formatNumber(status.details.currentAnimeIndex || 0)}/{formatNumber(status.details.currentAnimeTotal || status.totalCount || 0)}
                                </div>
                                <div>
                                    <span className="text-[--muted]">Provider:</span> {status.details.currentProvider || "kickassanime"}
                                </div>
                                <div>
                                    <span className="text-[--muted]">Spelling:</span>{" "}
                                    {status.details.variantIndex || 0}/{status.details.variantsTotal || 0}
                                </div>
                                <div className="sm:col-span-2">
                                    <span className="text-[--muted]">Searching for:</span> {status.details.currentQuery || "-"}
                                </div>
                                <div>
                                    <span className="text-[--muted]">Close matches:</span> {status.details.torrentsCollected || 0}
                                </div>
                                <div>
                                    <span className="text-[--muted]">Expected episodes:</span> {status.details.expectedEpisodes || 0}
                                </div>
                                <div className="sm:col-span-2">
                                    <span className="text-[--muted]">Matched to:</span> {status.details.selectedTorrent || "-"}
                                </div>
                                <div>
                                    <span className="text-[--muted]">Episodes queued:</span> {formatNumber(status.details.episodesQueued || 0)}
                                </div>
                                <div>
                                    <span className="text-[--muted]">Skipped series:</span> {formatNumber(status.details.skippedCount || 0)}
                                </div>
                                {status.details.lastError ? (
                                    <div className="sm:col-span-2 text-red-400">
                                        <span className="text-[--muted]">Last error:</span> {status.details.lastError}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    )}

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
                                    {formatNumber(status?.processedCount || 0)} / {formatNumber(status?.totalCount || 0)}
                                </span>
                            </div>
                            <div className="sea-progress-track w-full bg-gray-700 rounded-full h-2.5">
                                <div
                                    className="sea-progress-fill bg-blue-600 h-full rounded-full transition-all duration-300"
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
                                Queued for download ({status?.downloadedAnime?.length || 0})
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
                                <p className="text-sm text-[--muted]">Nothing queued yet</p>
                            )}
                        </div>
                    </Card>

                    {/* Failed */}
                    <Card className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <LuCircleX className="text-red-500 text-xl" />
                            <h3 className="font-semibold">
                                Not found ({status?.failedAnime?.length || 0})
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
                                <p className="text-sm text-[--muted]">Nothing missed yet</p>
                            )}
                        </div>
                    </Card>
                </div>

                {/* Instructions */}
                <Card className="p-4">
                    <h3 className="font-semibold mb-2">How it works</h3>
                    <ul className="text-sm text-[--muted] space-y-1 list-disc list-inside">
                        <li>Goes through the anime database one series at a time.</li>
                        <li className="flex-inline">
                            <LuSkipForward className="inline mr-1" />
                            Skips series already in your library or already downloading, adult entries, and series that haven't aired.
                        </li>
                        <li>
                            Searches <strong>Kickassanime</strong> under the English and romaji titles, every synonym, and other
                            spellings (season wording, punctuation, accents, the franchise name), and only accepts a result whose
                            title closely matches and whose episode count fits.
                        </li>
                        <li>
                            Queues the whole series in the <strong>Anime Downloads</strong> queue: best quality, Japanese audio
                            first with the English dub when available, soft subtitles, filed in your library and matched
                            automatically. No torrents and no Unmatched step.
                        </li>
                        <li>
                            Gentle on the site: at least 8 seconds between searches, at least 30 seconds per series, a 15-second
                            pause between episode downloads, and no new searches while 24 or more episodes are waiting.
                        </li>
                        <li>Pause keeps your place; Resume continues from it.</li>
                    </ul>
                </Card>
            </AppLayoutStack>
        </PageWrapper>
    )
}
