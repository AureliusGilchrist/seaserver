"use client"

import { useGetMangaEntry } from "@/api/hooks/manga.hooks"
import { OfflineMetaSection } from "@/app/(main)/_features/offline/entry/_components/offline-meta-section"
import { OfflineChapterList } from "@/app/(main)/_features/offline/entry/manga/_components/offline-chapter-list"
import { MediaEntryPageLoadingDisplay } from "@/app/(main)/_features/media/_components/media-entry-page-loading-display"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { Button } from "@/components/ui/button"
import { useRouter, useSearchParams } from "@/lib/navigation"
import React from "react"

export default function Page() {
    const router = useRouter()
    const mediaId = useSearchParams().get("id")

    const { data: mangaEntry, isLoading: mangaEntryLoading, refetch: refetchMangaEntry } = useGetMangaEntry(mediaId)

    React.useEffect(() => {
        if (!mediaId) {
            router.push("/offline")
        }
    }, [mediaId, router])

    if (mangaEntryLoading) return <MediaEntryPageLoadingDisplay />

    if (!mangaEntry) {
        return (
            <PageWrapper className="p-4 flex flex-col items-center justify-center gap-4 min-h-[50vh]">
                <p className="text-[--muted]">Could not load manga entry</p>
                <div className="flex gap-2">
                    <Button onClick={() => refetchMangaEntry()}>Retry</Button>
                    <Button intent="white-subtle" onClick={() => router.push("/offline")}>Back to offline</Button>
                </div>
            </PageWrapper>
        )
    }

    return (
        <>
            <OfflineMetaSection type="manga" entry={mangaEntry} />
            <PageWrapper className="p-4 space-y-6">

                <h2>Chapters</h2>

                <OfflineChapterList entry={mangaEntry} />
            </PageWrapper>
        </>
    )

}
