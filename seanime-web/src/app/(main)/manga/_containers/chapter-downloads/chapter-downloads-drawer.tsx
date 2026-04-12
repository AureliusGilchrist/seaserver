"use client"
import { Manga_Collection, Models_ChapterDownloadQueueItem } from "@/api/generated/types"
import { useGetMangaCollection } from "@/api/hooks/manga.hooks"
import { useGetMangaDownloadsList } from "@/api/hooks/manga_download.hooks"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"

import { useHandleMangaChapterDownloadQueue } from "@/app/(main)/manga/_lib/handle-manga-downloads"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { LuffyError } from "@/components/shared/luffy-error"
import { SeaLink } from "@/components/shared/sea-link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Modal } from "@/components/ui/modal"
import { ProgressBar } from "@/components/ui/progress-bar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { atom } from "jotai"
import { useAtom } from "jotai/react"
import React from "react"
import { MdClear } from "react-icons/md"
import { PiWarningOctagonDuotone } from "react-icons/pi"
import { TbWorldDownload } from "react-icons/tb"
import { displayTitle } from "@/lib/helpers/media"

export const __manga_chapterDownloadsDrawerIsOpenAtom = atom(false)

type ChapterDownloadQueueDrawerProps = {}

export function ChapterDownloadsDrawer(props: ChapterDownloadQueueDrawerProps) {

    const {} = props

    const [isOpen, setIsOpen] = useAtom(__manga_chapterDownloadsDrawerIsOpenAtom)

    const { data: mangaCollection } = useGetMangaCollection()

    return (
        <>
            <Modal
                open={isOpen}
                onOpenChange={setIsOpen}
                contentClass="max-w-5xl"
                title="Downloaded chapters"
                data-chapter-downloads-modal
            >

                <div className="py-4 space-y-8" data-chapter-downloads-modal-content>
                    <ChapterDownloadQueue mangaCollection={mangaCollection} />

                    <ChapterDownloadList />
                </div>

            </Modal>
        </>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

type ChapterDownloadQueueProps = {
    mangaCollection: Manga_Collection | undefined
}

export function ChapterDownloadQueue(props: ChapterDownloadQueueProps) {

    const {
        mangaCollection,
        ...rest
    } = props

    const serverStatus = useServerStatus()
    const currentProfileId = serverStatus?.currentProfile?.id ?? 0

    const {
        downloadQueue,
        downloadQueueLoading,
        downloadQueueError,
        startDownloadQueue,
        stopDownloadQueue,
        isStartingDownloadQueue,
        isStoppingDownloadQueue,
        resetErroredChapters,
        isResettingErroredChapters,
        clearDownloadQueue,
        isClearingDownloadQueue,
    } = useHandleMangaChapterDownloadQueue()

    const isMutating = isStartingDownloadQueue || isStoppingDownloadQueue || isResettingErroredChapters || isClearingDownloadQueue
    const backgroundQueue = React.useMemo(() => (downloadQueue || []).filter(item => (item.profileId ?? 0) === 0), [downloadQueue])
    const myQueue = React.useMemo(() => (downloadQueue || []).filter(item => (item.profileId ?? 0) === currentProfileId && currentProfileId > 0), [downloadQueue, currentProfileId])

    return (
        <>
            <div className="space-y-4" data-chapter-download-queue-container>

                <div className="flex w-full items-center" data-chapter-download-queue-header>
                    <h3>Queue</h3>
                    <div className="flex flex-1" data-chapter-download-queue-header-spacer></div>
                    {(!downloadQueueLoading && !downloadQueueError) &&
                        <div className="flex gap-2 items-center" data-chapter-download-queue-header-actions>

                        {!!backgroundQueue.find(n => n.status === "errored") && <Button
                            intent="warning-outline"
                            size="sm"
                            disabled={isMutating}
                            onClick={() => resetErroredChapters()}
                            loading={isResettingErroredChapters}
                        >
                            Reset errored chapters
                        </Button>}

                        {!!backgroundQueue.find(n => n.status === "downloading") ? (
                            <>
                                <Button
                                    intent="alert-subtle"
                                    size="sm"
                                    onClick={() => stopDownloadQueue()}
                                    loading={isStoppingDownloadQueue}
                                >
                                    Stop
                                </Button>
                            </>
                        ) : (
                            <>
                                {!!backgroundQueue.length && <Button
                                    intent="alert-subtle"
                                    size="sm"
                                    disabled={isMutating}
                                    onClick={() => clearDownloadQueue()}
                                    leftIcon={<MdClear className="text-xl" />}
                                    loading={isClearingDownloadQueue}
                                >
                                    Clear all
                                </Button>}

                                {(!!backgroundQueue.length && !!backgroundQueue.find(n => n.status === "not_started")) && <Button
                                    intent="success"
                                    size="sm"
                                    disabled={isMutating}
                                    onClick={() => startDownloadQueue()}
                                    leftIcon={<TbWorldDownload className="text-xl" />}
                                    loading={isStartingDownloadQueue}
                                >
                                    Start
                                </Button>}
                            </>
                        )}
                    </div>}
                </div>

                <Card className="p-4 space-y-2" data-chapter-download-queue-card>

                    {downloadQueueLoading
                        ? <LoadingSpinner />
                        : (downloadQueueError ? <LuffyError title="Oops!">
                            <p>Could not fetch the download queue</p>
                        </LuffyError> : null)}

                    {!!downloadQueue?.length ? (
                        <div className="space-y-5">
                            <QueueSection
                                title="Background"
                                items={backgroundQueue}
                                mangaCollection={mangaCollection}
                            />
                            {currentProfileId > 0 && <QueueSection
                                title="My Downloads"
                                items={myQueue}
                                mangaCollection={mangaCollection}
                                emptyText="No profile-specific chapters queued"
                            />}
                        </div>
                    ) : ((!downloadQueueLoading && !downloadQueueError) && (
                        <p className="text-center text-[--muted] text-sm" data-chapter-download-queue-empty-state>
                            Nothing in the queue
                        </p>
                    ))}

                </Card>

            </div>
        </>
    )
}

function QueueSection(props: {
    title: string
    items: Models_ChapterDownloadQueueItem[]
    mangaCollection: Manga_Collection | undefined
    emptyText?: string
}) {
    const { title, items, mangaCollection, emptyText = "Nothing queued" } = props

    // Memoize media map to avoid re-finding on every render
    const mediaMap = React.useMemo(() => {
        const map = new Map<number, any>()
        mangaCollection?.lists?.flatMap(n => n.entries).forEach(entry => {
            if (entry?.media?.id) {
                map.set(entry.media.id, entry.media)
            }
        })
        return map
    }, [mangaCollection])

    return <div className="space-y-2">
        <div className="flex items-center justify-between">
            <h4>{title}</h4>
            <span className="text-xs text-[--muted]">{items.length}</span>
        </div>

        {!!items.length ? (
            <ScrollArea className="h-[14rem]" data-chapter-download-queue-scroll-area>
                <div className="space-y-2" data-chapter-download-queue-scroll-area-content>
                    {items.map(item => {
                        const media = mediaMap.get(item.mediaId)
                        const displayName = item.mediaTitle || displayTitle(media?.title)
                        const chapterDisplay = item.chapterTitle || `Chapter ${item.chapterNumber}`

                        return (
                            <Card
                                key={item.mediaId + item.provider + item.chapterId + title}
                                className={cn(
                                    "px-3 py-2 space-y-1.5 transition-all duration-200",
                                    item.status === "downloading" && "backdrop-blur-sm bg-white/5 hover:bg-white/10 shadow-lg",
                                    item.status === "not_started" && "bg-gray-800",
                                    item.status === "errored" && "bg-gray-800 border-[--orange]",
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <p className="font-semibold">
                                        <SeaLink 
                                            href={`/manga/entry?id=${item.mediaId}`} 
                                            className="hover:underline hover:text-brand-200 transition-colors"
                                            title={displayName}
                                        >
                                            {displayName}
                                        </SeaLink>
                                        {" - "}
                                        <span title={chapterDisplay}>{chapterDisplay}</span>
                                    </p>
                                    <span className="text-[--muted] italic text-sm">(id: {item.chapterId})</span>
                                    {item.status === "errored" && (
                                        <div className="flex gap-1 items-center text-[--orange]">
                                            <PiWarningOctagonDuotone className="text-2xl text-[--orange]" aria-label="Error" />
                                            <p>Errored</p>
                                        </div>
                                    )}
                                </div>
                                {item.status === "downloading" && (
                                    <>
                                        <p className="text-xs text-[--muted]">
                                            {Math.max(0, item.downloadedPages || 0)} / {Math.max(0, item.totalPages || 0)} pages downloaded
                                        </p>
                                        <ProgressBar size="sm" isIndeterminate />
                                    </>
                                )}
                            </Card>
                        )
                    })}
                </div>
            </ScrollArea>
        ) : (
            <p className="text-center text-[--muted] text-sm">{emptyText}</p>
        )}
    </div>
}

/////////////////////////////////////

type ChapterDownloadListProps = {}

export function ChapterDownloadList(props: ChapterDownloadListProps) {

    const {} = props

    const { data, isLoading, isError } = useGetMangaDownloadsList()

    return (
        <>
            <div className="space-y-4" data-chapter-download-list-container>

                <div className="flex w-full items-center" data-chapter-download-list-header>
                    <h3>Downloaded</h3>
                    <div className="flex flex-1" data-chapter-download-list-header-spacer></div>
                </div>

                <div className="py-4 space-y-2" data-chapter-download-list-content>

                    {isLoading
                        ? <LoadingSpinner />
                        : (isError ? <LuffyError title="Oops!">
                            <p>Could not fetch the download queue</p>
                        </LuffyError> : null)}

                    {!!data?.length ? (
                        <>
                            {data?.filter(n => !n.media)
                                .sort((a, b) => a.mediaId - b.mediaId)
                                .sort((a, b) => Object.values(b.downloadData).flatMap(n => n).length - Object.values(a.downloadData)
                                    .flatMap(n => n).length)
                                .map(item => {
                                    const chapterCount = Object.values(item.downloadData).flatMap(n => n).length
                                    return (
                                        <Card
                                            key={item.mediaId} className={cn(
                                            "px-3 py-2 bg-gray-800 space-y-1",
                                        )}
                                        >
                                            <SeaLink
                                                className="font-semibold underline"
                                                href={`/manga/entry?id=${item.mediaId}`}
                                            >Manga ID: {item.mediaId}</SeaLink>

                                            <div className="flex items-center gap-2">
                                                <p>{chapterCount} chapter{chapterCount === 1 ? "" : "s"}</p>
                                                <span className="text-[--muted]">•</span>
                                                <em className="text-[--muted]">Metadata unavailable</em>
                                            </div>
                                        </Card>
                                    )
                                })}

                            <div
                                data-chapter-download-list-media-grid
                                className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4 gap-4"
                            >
                                {data?.filter(n => !!n.media)
                                    .sort((a, b) => a.mediaId - b.mediaId)
                                    .sort((a, b) => Object.values(b.downloadData).flatMap(n => n).length - Object.values(a.downloadData)
                                        .flatMap(n => n).length)
                                    .map(item => {
                                        const nb = Object.values(item.downloadData).flatMap(n => n).length
                                        return <div key={item.media?.id!} className="col-span-1">
                                            <MediaEntryCard
                                                media={item.media!}
                                                type="manga"
                                                hideUnseenCountBadge
                                                hideAnilistEntryEditButton
                                                overlay={<p
                                                    className="font-semibold text-white bg-gray-950 z-[-1] absolute right-0 w-fit px-4 py-1.5 text-center !bg-opacity-90 text-sm lg:text-base rounded-none rounded-bl-lg"
                                                >{nb} chapter{nb === 1 ? "" : "s"}</p>}
                                            />
                                        </div>
                                    })}
                            </div>
                        </>
                    ) : ((!isLoading && !isError) && (
                        <p className="text-center text-[--muted] italic" data-chapter-download-list-empty-state>
                            No chapters downloaded
                        </p>
                    ))}

                </div>

            </div>
        </>
    )
}
