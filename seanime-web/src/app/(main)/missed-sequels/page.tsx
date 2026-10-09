"use client"

import { useAnilistListMissedSequels } from "@/api/hooks/anilist.hooks"
import { useGetLibraryCollection } from "@/api/hooks/anime_collection.hooks"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { TorrentSearchContainer } from "@/app/(main)/entry/_containers/torrent-search/torrent-search-container"
import { __torrentSearch_selectedTorrentsAtom } from "@/app/(main)/entry/_containers/torrent-search/torrent-search-container"
import { useGetAnimeEntry } from "@/api/hooks/anime_entries.hooks"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { Button, IconButton } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { Drawer } from "@/components/ui/drawer"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { useSetAtom } from "jotai/react"
import { atomWithStorage } from "jotai/utils"
import { useAtom } from "jotai/react"
import React from "react"
import { LuDownload, LuEye, LuEyeOff, LuGitFork, LuX } from "react-icons/lu"

/**
 * The sequels you have missed, as a worklist.
 *
 * Two timelines of the same story: what continues something you finished and is not on your lists
 * at all, and what continues something you finished and is in your library with nothing on disk.
 * The first is one press to add; the second is where the work is, and it opens the same download
 * UI the anime page opens — the real torrent search, live — rather than sending you there by hand.
 *
 * Everything on the page can be hidden. Hidden things stay hidden and skipped things stay skipped;
 * the page is a worklist, and a worklist that fills itself back up after you have said so is not
 * one.
 */

// Hidden per series, remembered across visits. A skip is a decision; hiding is putting it aside
// for now — both are kept, because the difference matters the next time the page is opened.
export const __missedSequels_hiddenAtom = atomWithStorage<number[]>("sea-missed-sequels-hidden", [])
export const __missedSequels_skippedAtom = atomWithStorage<number[]>("sea-missed-sequels-skipped", [])

export default function Page() {
    return (
        <>
            <CustomLibraryBanner discrete />
            <PageWrapper className="p-4 sm:p-8 space-y-8">
                <div className="flex items-center gap-3">
                    <LuGitFork className="text-3xl text-brand-200" />
                    <div>
                        <h2 className="text-2xl font-bold">Missed sequels</h2>
                        <p className="text-sm text-[--muted] mt-0.5">
                            What continues what you have finished — and what you have finished that has nothing on disk.
                        </p>
                    </div>
                </div>

                <NotWatchedSection />
                <NotMatchedSection />
            </PageWrapper>
        </>
    )
}

/**
 * Sequels that are not on your lists at all — finished or airing, continuing something you marked
 * completed, and one press from being added.
 */
function NotWatchedSection() {
    const { data, isLoading } = useAnilistListMissedSequels(true)
    const [hidden, setHidden] = useAtom(__missedSequels_hiddenAtom)
    const [skipped, setSkipped] = useAtom(__missedSequels_skippedAtom)

    const visible = React.useMemo(() => {
        if (!data?.length) return []
        return data.filter(Boolean).filter(m => !hidden.includes(m.id) && !skipped.includes(m.id))
    }, [data, hidden, skipped])

    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <h3 className="text-lg font-semibold">Not watched</h3>
                    <p className="text-xs text-[--muted]">Sequels continuing what you have completed, and not on your lists.</p>
                </div>
                <span className="text-xs text-[--muted]">{visible.length} to look at</span>
            </div>

            {isLoading ? (
                <div className="py-8"><LoadingSpinner /></div>
            ) : !visible.length ? (
                <div className="text-center py-10 border rounded-xl bg-gray-950/50">
                    <p className="text-sm text-[--muted]">Nothing here — everything that continues what you have finished is already on your lists.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {visible.map(media => (
                        <div key={media.id} className="col-span-1 group/msq relative">
                            <MediaEntryCard
                                media={media}
                                type="anime"
                                showLibraryBadge
                                containerClassName="col-span-1"
                            />
                            <NotMatchedActions
                                id={media.id}
                                onHide={() => setHidden(prev => [...(prev ?? []), media.id])}
                                onSkip={() => setSkipped(prev => [...(prev ?? []), media.id])}
                            />
                        </div>
                    ))}
                </div>
            )}

            <HiddenCount hiddenCount={hidden.length} skippedCount={skipped.length} onRestore={() => { setHidden([]); setSkipped([]) }} />
        </section>
    )
}

/**
 * Sequels in your library with nothing on disk — the entry exists, and nothing is downloaded for
 * it. The card opens a drawer with the real torrent search under it: the same container the anime
 * page opens, searching live, so a sequel is downloaded without leaving the page.
 */
function NotMatchedSection() {
    const { data: libraryCollection, isLoading } = useGetLibraryCollection({ staleTime: 30_000 })
    const [hidden, setHidden] = useAtom(__missedSequels_hiddenAtom)
    const [skipped, setSkipped] = useAtom(__missedSequels_skippedAtom)
    const [openMediaId, setOpenMediaId] = React.useState<number | undefined>(undefined)

    const withNoFiles = React.useMemo(() => {
        if (!libraryCollection?.lists) return []
        return libraryCollection.lists
            .flatMap(l => l.entries ?? [])
            .filter(Boolean)
            .filter(e => !e.libraryData)
            .filter(e => !hidden.includes(e.mediaId) && !skipped.includes(e.mediaId))
    }, [libraryCollection, hidden, skipped])

    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <h3 className="text-lg font-semibold">Not matched</h3>
                    <p className="text-xs text-[--muted]">In your library, with nothing on disk to watch — press one to download it.</p>
                </div>
                <span className="text-xs text-[--muted]">{withNoFiles.length} to get</span>
            </div>

            {isLoading ? null : !withNoFiles.length ? (
                <div className="text-center py-10 border rounded-xl bg-gray-950/50">
                    <p className="text-sm text-[--muted]">Nothing here — everything in your library has something on disk.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {withNoFiles.slice(0, 60).map(entry => (
                        <div key={entry.mediaId} className="col-span-1 group/msq relative">
                            <button className="w-full text-left" onClick={() => setOpenMediaId(entry.mediaId)}>
                                <MediaEntryCard
                                    media={entry.media as any}
                                    type="anime"
                                    containerClassName="col-span-1"
                                />
                            </button>
                            <NotMatchedActions
                                id={entry.mediaId}
                                onHide={() => setHidden(prev => [...(prev ?? []), entry.mediaId])}
                                onSkip={() => setSkipped(prev => [...(prev ?? []), entry.mediaId])}
                            />
                        </div>
                    ))}
                </div>
            )}

            <HiddenCount hiddenCount={hidden.length} skippedCount={skipped.length} onRestore={() => { setHidden([]); setSkipped([]) }} />

            <SequelDownloadDrawer mediaId={openMediaId} onOpenChange={v => !v && setOpenMediaId(undefined)} />
        </section>
    )
}

/**
 * The hide/skip actions, on the card itself. Hidden until the card is touched, the way the queue's
 * row actions are — a grid of covers should not be a wall of buttons.
 */
function NotMatchedActions({ id, onHide, onSkip }: { id: number, onHide: () => void, onSkip: () => void }) {
    return (
        <div className={cn(
            "absolute top-1 right-1 z-20 flex items-center gap-1 opacity-0 transition-opacity",
            "group-hover/msq:opacity-100 focus-within:opacity-100",
        )}>
            <IconButton
                icon={<LuEyeOff />}
                intent="gray-basic"
                size="xs"
                title="Hide for now"
                onClick={onHide}
            />
            <IconButton
                icon={<LuX />}
                intent="gray-basic"
                size="xs"
                title="Skip — don't suggest again"
                onClick={onSkip}
            />
        </div>
    )
}

function HiddenCount({ hiddenCount, skippedCount, onRestore }: { hiddenCount: number, skippedCount: number, onRestore: () => void }) {
    if (hiddenCount + skippedCount === 0) return null
    return (
        <div className="flex items-center gap-2">
            <Button
                intent="gray-subtle"
                size="xs"
                leftIcon={<LuEye />}
                onClick={onRestore}
            >
                Show {hiddenCount} hidden and {skippedCount} skipped
            </Button>
        </div>
    )
}

/**
 * The download drawer: one sequel at a time, the same torrent search the anime page opens, live.
 * Keyed by series so stepping to the next one gets a fresh search rather than the last one's state.
 */
function SequelDownloadDrawer({ mediaId, onOpenChange }: { mediaId: number | undefined, onOpenChange: (open: boolean) => void }) {
    const { data: entry, isLoading } = useGetAnimeEntry(mediaId ?? null)
    const setSelectedTorrents = useSetAtom(__torrentSearch_selectedTorrentsAtom)

    // The torrent selection is shared with the anime page's drawer, so it is emptied on every open.
    React.useEffect(() => {
        if (mediaId) setSelectedTorrents([])
    }, [mediaId, setSelectedTorrents])

    return (
        <Drawer
            open={!!mediaId}
            onOpenChange={onOpenChange}
            title={entry?.media?.title?.userPreferred || (mediaId ? `#${mediaId}` : "")}
            side="right"
            contentClass="max-w-3xl"
        >
            <div className="space-y-4">
                {isLoading && <div className="py-10"><LoadingSpinner /></div>}

                {!isLoading && !entry && (
                    <p className="text-sm text-[--muted] py-6 text-center">
                        This one's page could not be fetched. Try again in a moment.
                    </p>
                )}

                {!!entry && (
                    <div className="rounded-[--radius-md] border bg-gray-950 p-4">
                        <TorrentSearchContainer
                            key={mediaId}
                            type="download"
                            entry={entry}
                        />
                    </div>
                )}
            </div>
        </Drawer>
    )
}
