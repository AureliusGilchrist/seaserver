"use client"

import { useAnilistListMissedSequels } from "@/api/hooks/anilist.hooks"
import { useGetLibraryCollection } from "@/api/hooks/anime_collection.hooks"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import React from "react"
import { LuGitFork } from "react-icons/lu"

/**
 * The sequels you have missed, as a worklist.
 *
 * The discover page's carousel answers "what might I have missed"; this page answers "what should I
 * do about it" — one section of what is not on your lists at all, and one of what is in your library
 * but has nothing to watch. Both are two timelines of the same story: the thing that continues it,
 * and the copy of it you do not have.
 */
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

    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">Not watched</h3>
                <p className="text-xs text-[--muted]">Sequels continuing what you have completed, and not on your lists.</p>
            </div>

            {isLoading ? (
                <div className="py-8"><LoadingSpinner /></div>
            ) : !data?.length ? (
                <div className="text-center py-10 border rounded-xl bg-gray-950/50">
                    <p className="text-sm text-[--muted]">Nothing here — everything that continues what you have finished is already on your lists.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {data.filter(Boolean).map(media => (
                        <MediaEntryCard
                            key={media.id}
                            media={media}
                            type="anime"
                            showLibraryBadge
                            containerClassName="col-span-1"
                        />
                    ))}
                </div>
            )}
        </section>
    )
}

/**
 * Sequels that ARE in your library — the entry exists — but have no local files behind them:
 * nothing downloaded, so nothing to watch. The same story as the section above, one step later:
 * the sequel was added, and its copy is what is missing.
 */
function NotMatchedSection() {
    const { data: libraryCollection, isLoading } = useGetLibraryCollection({ staleTime: 30_000 })

    const entries = React.useMemo(() => {
        if (!libraryCollection?.lists) return []
        return libraryCollection.lists.flatMap(l => l.entries ?? []).filter(Boolean)
    }, [libraryCollection])

    // A sequel with no local files: the entry is in the library, and nothing is downloaded for it —
    // `libraryData` is what a local copy carries, so its absence is the whole answer.
    const withNoFiles = React.useMemo(() => {
        return entries.filter(e => !e.libraryData)
    }, [entries])

    if (isLoading) return null
    if (!withNoFiles.length) return null

    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">Not matched</h3>
                <p className="text-xs text-[--muted]">In your library, with nothing on disk to watch.</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {withNoFiles.slice(0, 60).map(entry => (
                    <MediaEntryCard
                        key={entry.mediaId}
                        media={entry.media as any}
                        type="anime"
                        containerClassName="col-span-1"
                    />
                ))}
            </div>
        </section>
    )
}
