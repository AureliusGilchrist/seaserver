"use client"

import { EnqueueFuture_Item } from "@/api/generated/types"
import {
    ENQUEUE_FUTURE_STATUS,
    isEnqueueFuturePending,
    useClearEnqueueFuture,
    useGetEnqueueFutureItem,
    useGetEnqueueFutureQueue,
    useGetEnqueueFutureStatus,
    useSetEnqueueFutureItemStatus,
} from "@/api/hooks/enqueue_future.hooks"
import { EnqueueFutureAddTorrents } from "@/app/(main)/enqueue-future/_components/enqueue-future-add-torrents"
import { EnqueueFutureCurrentShow } from "@/app/(main)/enqueue-future/_components/enqueue-future-current-show"
import { EnqueueFutureHeader } from "@/app/(main)/enqueue-future/_components/enqueue-future-header"
import { EnqueueFutureList } from "@/app/(main)/enqueue-future/_components/enqueue-future-list"
import { EnqueueFutureProgress } from "@/app/(main)/enqueue-future/_components/enqueue-future-progress"
import { TorrentSearchSnapshot } from "@/app/(main)/entry/_containers/torrent-search/_lib/handle-torrent-search"
import { __torrentDownload_autoMatchAtom } from "@/app/(main)/entry/_containers/torrent-search/torrent-download-auto-match"
import { __torrentSearch_selectedTorrentsAtom, TorrentSearchContainer } from "@/app/(main)/entry/_containers/torrent-search/torrent-search-container"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { AppLayoutStack } from "@/components/ui/app-layout"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { useAtomValue, useSetAtom } from "jotai/react"
import React from "react"
import { LuLayers } from "react-icons/lu"
import { toast } from "sonner"

/**
 * The queue you work through: one anime on screen at a time, with the real download UI under it.
 *
 * Nothing here reimplements the torrent screen — it renders the same TorrentSearchContainer the
 * anime page opens in a drawer, seeded with the results the server already fetched. Changing the
 * provider or any filter searches live, exactly as it would anywhere else, so an anime whose
 * prepared search came back empty is a provider switch away from being useful rather than a dead end.
 */
export function EnqueueFuturePage() {

    const { data: status } = useGetEnqueueFutureStatus()
    const { data: queue, isLoading } = useGetEnqueueFutureQueue({ isRunning: !!status?.running })
    const { mutate: clearQueue, isPending: isClearing } = useClearEnqueueFuture()

    // Only what you have not dealt with. Downloaded and skipped items stay in the database — that
    // record is what stops them being rediscovered — but walking back through them is not the job.
    const items = React.useMemo(() => (queue ?? []).filter(isEnqueueFuturePending), [queue])

    const [activeMediaId, setActiveMediaId] = React.useState<number | undefined>(undefined)

    // Resolved during render, not in an effect.
    //
    // The anime on screen leaves the list the moment you download, skip or ignore it, and an effect
    // would only reassign the selection on the render *after* that — one frame showing "0 / 0" and
    // an empty body on the way to the next show. Working this out here means the next anime is
    // simply already the one being drawn.
    const lastIndexRef = React.useRef(0)
    const index = React.useMemo(() => {
        if (!items.length) return -1
        const found = items.findIndex(n => n.mediaId === activeMediaId)
        // Hold the position rather than the anime — that is what "next" means when the current one
        // has just been dealt with.
        return found >= 0 ? found : Math.min(lastIndexRef.current, items.length - 1)
    }, [items, activeMediaId])

    const activeItem = index >= 0 ? items[index] : undefined

    React.useEffect(() => {
        if (index >= 0) lastIndexRef.current = index
        // Keep the stored id in step with what is actually being shown, so Prev and Next move from
        // here rather than from an anime that is no longer in the list.
        if (activeItem && activeItem.mediaId !== activeMediaId) {
            setActiveMediaId(activeItem.mediaId)
        } else if (!activeItem && activeMediaId !== undefined) {
            setActiveMediaId(undefined)
        }
    }, [index, activeItem, activeMediaId])

    const { data: detail, isLoading: isLoadingDetail } = useGetEnqueueFutureItem(activeItem?.mediaId)
    const { mutate: setItemStatus } = useSetEnqueueFutureItemStatus(activeItem?.mediaId)

    const setSelectedTorrents = useSetAtom(__torrentSearch_selectedTorrentsAtom)

    // Auto-match is decided per anime here, not once for the queue: a show you know the naming of
    // can go straight into the library while the next one waits in Unmatched for a look. Changing
    // it for one show never moves any other.
    //
    // Untouched anime default to on, which is the answer that makes a queue worth having — the
    // point is to work through a hundred shows without filing each one by hand afterwards.
    const [autoMatchByMedia, setAutoMatchByMedia] = React.useState<Record<number, boolean>>({})

    const activeAutoMatch = activeItem
        ? autoMatchByMedia[activeItem.mediaId] ?? true
        : true

    const setActiveAutoMatch = React.useCallback((value: boolean) => {
        if (!activeItem) return
        setAutoMatchByMedia(prev => ({ ...prev, [activeItem.mediaId]: value }))
    }, [activeItem])

    // The torrent selection is module-global and shared with the anime page's drawer, so it has to
    // be emptied on every step — otherwise the previous anime's picks come along to the next one.
    React.useEffect(() => {
        setSelectedTorrents([])
    }, [activeMediaId, setSelectedTorrents])

    const snapshot: TorrentSearchSnapshot | undefined = React.useMemo(() => {
        const s = detail?.snapshot
        if (!s?.searchData || !s.searchParams) return undefined
        return {
            params: s.searchParams,
            data: s.searchData,
            preparedAt: s.preparedAt ? new Date(s.preparedAt).getTime() : undefined,
        }
    }, [detail?.snapshot])

    function goTo(nextIndex: number) {
        if (nextIndex < 0 || nextIndex >= items.length) return
        setActiveMediaId(items[nextIndex].mediaId)
    }

    function handleDownloadStarted() {
        if (!activeItem) return
        setItemStatus({ status: ENQUEUE_FUTURE_STATUS.DOWNLOADED }, {
            onSuccess: () => {
                toast.success(`${activeItem.title || "Download"} queued — on to the next`)
            },
        })
    }

    if (isLoading) {
        return <PageWrapper className="p-4 sm:p-8 space-y-4">
            <LoadingSpinner />
        </PageWrapper>
    }

    return (
        <PageWrapper className="p-4 sm:p-8 space-y-4" data-enqueue-future-page>

            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <LuLayers className="text-3xl" />
                    <div>
                        <h3>Enqueue Future</h3>
                        <p className="text-sm text-[--muted]">
                            Anime queued up from recommendations, prepared and ready to download one after another.
                        </p>
                    </div>
                </div>

                {!!queue?.length && (
                    <Button
                        intent="alert-subtle"
                        size="sm"
                        onClick={() => clearQueue()}
                        loading={isClearing}
                        data-enqueue-future-clear-button
                    >
                        Clear queue
                    </Button>
                )}
            </div>

            <EnqueueFutureProgress status={status} />

            {!items.length ? (
                <div className="text-center py-16 space-y-2 border rounded-[--radius-md] bg-gray-950">
                    <p className="text-lg font-semibold">Nothing queued</p>
                    <p className="text-sm text-[--muted]">
                        Open an anime and press <span className="text-[--foreground]">Enqueue Future</span> to
                        queue up everything it leads to.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4 items-start">

                    <EnqueueFutureList
                        items={items}
                        activeMediaId={activeMediaId}
                        onSelect={item => setActiveMediaId(item.mediaId)}
                    />

                    <AppLayoutStack>
                        <EnqueueFutureHeader
                            item={activeItem}
                            index={index}
                            total={items.length}
                            onPrevious={() => goTo(index - 1)}
                            onNext={() => goTo(index + 1)}
                            autoMatch={activeAutoMatch}
                            onAutoMatchChange={setActiveAutoMatch}
                        />

                        <ActiveItemBody
                            item={activeItem}
                            detail={detail}
                            isLoading={isLoadingDetail}
                            snapshot={snapshot}
                            onDownloadStarted={handleDownloadStarted}
                            autoMatch={activeAutoMatch}
                            onAutoMatchChange={setActiveAutoMatch}
                        />
                    </AppLayoutStack>
                </div>
            )}
        </PageWrapper>
    )
}

function ActiveItemBody({ item, detail, isLoading, snapshot, onDownloadStarted, autoMatch, onAutoMatchChange }: {
    item: EnqueueFuture_Item | undefined
    detail: EnqueueFuture_Item | undefined
    isLoading: boolean
    snapshot: TorrentSearchSnapshot | undefined
    onDownloadStarted: () => void
    autoMatch: boolean
    onAutoMatchChange: (value: boolean) => void
}) {
    if (!item) return null

    if (item.status === ENQUEUE_FUTURE_STATUS.PENDING || item.status === ENQUEUE_FUTURE_STATUS.PREPARING) {
        return (
            <div className="text-center py-16 space-y-2 border rounded-[--radius-md] bg-gray-950">
                <LoadingSpinner />
                <p className="text-sm text-[--muted]">Still being prepared — it'll open as soon as it's ready.</p>
            </div>
        )
    }

    if (isLoading) {
        return <div className="py-16"><LoadingSpinner /></div>
    }

    const entry = detail?.snapshot?.entry
    if (!entry) {
        return (
            <div className="text-center py-16 space-y-2 border rounded-[--radius-md] bg-gray-950">
                <p className="text-sm text-[--muted]">
                    {item.lastError || "This one has no prepared data. Open its page to download it by hand."}
                </p>
            </div>
        )
    }

    return (
        <>
            <EnqueueFutureCurrentShow item={item} snapshot={detail?.snapshot} />

            {/* Keyed by anime so stepping to the next one gets a fresh search rather than the
                previous one's state carried across — the search UI holds its own filters and
                query internally. */}
            <TorrentSearchContainer
                key={item.mediaId}
                type="download"
                entry={entry}
                snapshot={snapshot}
                onDownloadStarted={onDownloadStarted}
                confirmAutoMatchOnce
                autoMatchValue={autoMatch}
                onAutoMatchChange={onAutoMatchChange}
            />

            <EnqueueFutureAddTorrents
                entry={entry}
                autoMatch={autoMatch}
                onAutoMatchChange={onAutoMatchChange}
                onAdded={onDownloadStarted}
            />
        </>
    )
}
