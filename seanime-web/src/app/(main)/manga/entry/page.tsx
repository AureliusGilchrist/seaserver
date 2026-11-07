"use client"
import { useIsStillOnPath } from "@/lib/navigation"
import { useGetMangaEntry, useGetMangaEntryChapters, useGetMangaEntryDetails } from "@/api/hooks/manga.hooks"
import { __manga_entryProviderAtom } from "@/app/(main)/manga/_lib/handle-manga-selected-provider"
import { MediaEntryPageLoadingDisplay } from "@/app/(main)/_features/media/_components/media-entry-page-loading-display"
import { PluginWebviewSlot } from "@/app/(main)/_features/plugin/webview/plugin-webviews"
import { MangaEntryDetailsTabs } from "@/app/(main)/manga/_components/manga-entry-details-tabs"
import { MangaReleaseEstimate } from "@/app/(main)/manga/_components/manga-release-estimate"
import { MetaSection } from "@/app/(main)/manga/_components/meta-section"
import { ChapterList } from "@/app/(main)/manga/_containers/chapter-list/chapter-list"
import { useHandleMangaDownloadData } from "@/app/(main)/manga/_lib/handle-manga-downloads"
import { __manga_selectedChapterAtom } from "@/app/(main)/manga/_lib/handle-chapter-reader"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { Button } from "@/components/ui/button"
import { displayTitle } from "@/lib/helpers/media"
import { useRouter, useSearchParams } from "@/lib/navigation"
import { useAtomValue, useSetAtom } from "jotai/react"
import React from "react"

export const dynamic = "force-static"

export default function Page() {
    const router = useRouter()
    const isStillOnPath = useIsStillOnPath()
    const searchParams = useSearchParams()
    const mediaId = searchParams.get("id")
    const readProvider = searchParams.get("readProvider")
    const readChapterId = searchParams.get("readChapterId")
    const readChapterNumber = searchParams.get("readChapterNumber")
    const setSelectedChapter = useSetAtom(__manga_selectedChapterAtom)
    const {
        data: mangaEntry,
        isLoading: mangaEntryLoading,
        isError: mangaEntryError,
        refetch: refetchMangaEntry,
    } = useGetMangaEntry(mediaId)
    const {
        data: mangaDetails,
        isLoading: mangaDetailsLoading,
        isError: mangaDetailsError,
        refetch: refetchMangaDetails,
    } = useGetMangaEntryDetails(mediaId)

    // Start the chapter list now, alongside the entry, rather than after it: the list asks the
    // source and is usually the slowest thing on the page. Same query the chapter list reads, so
    // it simply finds the answer there (or the request already under way).
    const storedProviders = useAtomValue(__manga_entryProviderAtom)
    useGetMangaEntryChapters({
        mediaId: Number(mediaId),
        provider: mediaId ? storedProviders[mediaId] : undefined,
    })

    /**
     * Fetch manga download data
     */
    const { downloadData, downloadDataLoading } = useHandleMangaDownloadData(mediaId)

    React.useEffect(() => {
        // Only while this page is still the one shown (see isStillOnPath).
        if (!mediaId && isStillOnPath("/manga/entry")) {
            router.push("/")
        }
    }, [mediaId, router])

    React.useEffect(() => {
        if (!mediaId || !readProvider || !readChapterId) return

        setSelectedChapter({
            mediaId: Number(mediaId),
            provider: readProvider,
            chapterId: readChapterId,
            chapterNumber: readChapterNumber || "?",
        })
        router.replace(`/manga/entry?id=${encodeURIComponent(mediaId)}`)
    }, [mediaId, readProvider, readChapterId, readChapterNumber, router, setSelectedChapter])

    React.useEffect(() => {
        try {
            if (displayTitle(mangaEntry?.media?.title)) {
                document.title = `${displayTitle(mangaEntry?.media?.title)} | Deus Ex Aeternae`
            }
        }
        catch {
        }
    }, [mangaEntry])

    if (mangaEntryLoading || mangaDetailsLoading) return <MediaEntryPageLoadingDisplay />

    if (!mangaEntry) {
        return (
            <PageWrapper className="px-4 md:px-8 py-10 space-y-4">
                <div className="text-xl font-semibold">Could not load manga entry</div>
                <p className="text-sm text-gray-300">
                    {mangaEntryError || mangaDetailsError
                        ? "The request failed. This can happen if AniList or the shared library request is temporarily unavailable."
                        : "This manga entry is currently unavailable."}
                </p>
                <div className="flex gap-2 flex-wrap">
                    <Button
                        intent="white-subtle"
                        onClick={() => {
                            refetchMangaEntry()
                            refetchMangaDetails()
                        }}
                    >
                        Retry
                    </Button>
                    <Button intent="gray-subtle" onClick={() => router.push("/")}>Back to home</Button>
                </div>
            </PageWrapper>
        )
    }

    return (
        <div
            data-manga-entry-page
            data-media={JSON.stringify(mangaEntry.media)}
            data-manga-entry-list-data={JSON.stringify(mangaEntry.listData)}
        >
            <MetaSection entry={mangaEntry} details={mangaDetails} />

            <div data-manga-entry-page-content-container className="px-4 md:px-8 relative z-[8]">

                {/* Inside the raised content container: on its own it sat under the fixed banner
                    (z-3) and couldn't be seen on desktop. */}
                <MangaReleaseEstimate
                    mediaId={mangaEntry.mediaId}
                    status={mangaEntry.media?.status}
                />

                <PageWrapper
                    data-manga-entry-page-content
                    key="chapter-list"
                    className="relative 2xl:order-first pb-10 pt-4 lg:pt-6"
                    {...{
                        // Quick and without a wait: the chapters were held back half a second.
                        initial: { opacity: 0, y: 8 },
                        animate: { opacity: 1, y: 0 },
                        exit: { opacity: 0, y: 8 },
                        transition: { duration: 0.2, ease: "easeOut" },
                    }}
                >

                    <div
                        data-manga-entry-page-chapters
                        // transform-gpu: its own layer, so the blurred panel does not flicker while scrolling.
                        className="space-y-2 rounded-3xl bg-[--background]/55 p-4 shadow-[0_24px_60px_-30px_rgb(0_0_0_/_0.9)] ring-1 ring-white/[0.07] backdrop-blur-md transform-gpu sm:p-6"
                    >
                        <ChapterList
                            entry={mangaEntry}
                            mediaId={mediaId}
                            details={mangaDetails}
                            downloadData={downloadData}
                            downloadDataLoading={downloadDataLoading}
                        />
                    </div>

                    <PluginWebviewSlot slot="after-manga-entry-chapter-list" />

                    {/* Characters, staff, information, related titles and comments, as tabs. */}
                    <MangaEntryDetailsTabs entry={mangaEntry} details={mangaDetails} />

                    <PluginWebviewSlot slot="manga-entry-screen-bottom" />

                </PageWrapper>
            </div>
        </div>
    )
}
