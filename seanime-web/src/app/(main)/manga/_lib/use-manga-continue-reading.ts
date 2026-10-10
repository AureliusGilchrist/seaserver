"use client"
import { AL_BaseManga } from "@/api/generated/types"
import { MangaReadingHistory, useGetMangaCollection, useGetMangaReadingHistory } from "@/api/hooks/manga.hooks"
import React from "react"

export type MangaContinueReadingEntry = {
    mediaId: number
    media: AL_BaseManga | null
    /** The chapter to read next — the slot the anime home's episode card fills with "Episode N". */
    chapterNumber: number | undefined
    chaptersTotal: number | undefined
    lastReadAt: string | undefined
    isSynthetic: boolean
}

/**
 * The manga counterpart of the anime home screen's continue-watching list.
 *
 * The anime list is built server-side from the library collection, so it always carries full media
 * and never goes blank. The reading history alone cannot do that: its media enrichment depends on
 * the server's collection being reachable at that moment, it knows nothing about series you started
 * but never opened a chapter of, and when it is empty the header and the carousel used to vanish
 * altogether. So the list is built from the collection this page already loads — every Currently
 * Reading and Repeating entry with a chapter left, the way the anime home keeps every
 * currently-watching entry with a next episode. The reading history only refines it: the reading
 * order (most recently read first) and the entries it alone knows about, synthetic manga above all,
 * which are on no AniList list.
 */
export function useMangaContinueReadingList(): { entries: MangaContinueReadingEntry[]; isLoading: boolean } {
    const { data: collection } = useGetMangaCollection()
    const { data: readingHistory, isLoading: historyLoading } = useGetMangaReadingHistory()

    return React.useMemo(() => {
        if (!collection) return { entries: [], isLoading: false }
        // The order comes from the history, so render nothing until it settles — success or
        // failure. On failure the history reads as empty and the collection alone drives the list,
        // which is the honest answer rather than a blank section.
        if (historyLoading) return { entries: [], isLoading: true }

        const history: MangaReadingHistory[] = readingHistory ?? []
        const historyByMediaId = new Map<number, MangaReadingHistory>()
        for (const h of history) {
            // The endpoint returns the most recent first; keep one entry per series.
            if (!historyByMediaId.has(h.mediaId)) historyByMediaId.set(h.mediaId, h)
        }

        const items: MangaContinueReadingEntry[] = []
        const seen = new Set<number>()

        // The next chapter to read, the way the anime home's card shows the next episode: one past
        // what AniList recorded, or one past the last locally read chapter when AniList knows
        // nothing yet.
        const nextChapter = (progress: number | undefined, lastRead: MangaReadingHistory | undefined): number | undefined => {
            if (!!progress && progress > 0) return progress + 1
            const local = lastRead?.lastChapterNumber ? parseInt(lastRead.lastChapterNumber, 10) : undefined
            if (!!local && local > 0) return local + 1
            return 1
        }

        for (const list of collection.lists ?? []) {
            if (list.type !== "CURRENT" && list.type !== "REPEATING") continue
            for (const entry of list.entries ?? []) {
                if (!entry.media) continue
                if (seen.has(entry.mediaId)) continue
                const progress = entry.listData?.progress ?? 0
                const total = entry.media.chapters ?? undefined
                // Fully read — nothing to continue, the way the anime home drops series with
                // every episode watched.
                if (!!total && progress >= total) continue
                seen.add(entry.mediaId)
                const lastRead = historyByMediaId.get(entry.mediaId)
                items.push({
                    mediaId: entry.mediaId,
                    media: entry.media,
                    chapterNumber: nextChapter(progress, lastRead),
                    chaptersTotal: total,
                    lastReadAt: lastRead?.lastReadAt,
                    isSynthetic: false,
                })
            }
        }

        // History-only entries — synthetic manga on no AniList list, and anything the collection
        // does not know about. They earn their place by being read; the media record is whatever
        // the endpoint enriched, which can be missing entirely (the cards take a placeholder then).
        for (const h of history) {
            if (seen.has(h.mediaId)) continue
            seen.add(h.mediaId)
            const total = h.media?.chapters ?? undefined
            const local = h.lastChapterNumber ? parseInt(h.lastChapterNumber, 10) : undefined
            if (!!total && !!local && local >= total) continue
            items.push({
                mediaId: h.mediaId,
                media: h.media ?? null,
                chapterNumber: nextChapter(undefined, h),
                chaptersTotal: total,
                lastReadAt: h.lastReadAt,
                isSynthetic: h.isSynthetic,
            })
        }

        // Most recently read first; series with no history keep collection order after them.
        // A locally built array, sorted in place — the query cache is never touched.
        items.sort((a, b) => {
            const aTime = a.lastReadAt ? new Date(a.lastReadAt).getTime() : 0
            const bTime = b.lastReadAt ? new Date(b.lastReadAt).getTime() : 0
            return bTime - aTime
        })

        return { entries: items, isLoading: false }
    }, [collection, readingHistory, historyLoading])
}
