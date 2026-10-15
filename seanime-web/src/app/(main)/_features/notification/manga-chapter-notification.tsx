"use client"

import { useGetMangaCollection, useGetMangaEntryChapters, useGetMangaLatestChapterNumbersMap } from "@/api/hooks/manga.hooks"
import { useDownloadMangaChapters } from "@/api/hooks/manga_download.hooks"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { HibikeManga_ChapterDetails, Manga_MangaLatestChapterNumberItem } from "@/api/generated/types"
import { __manga_entryProviderAtom } from "@/app/(main)/manga/_lib/handle-manga-selected-provider"
import { useSetCurrentChapter } from "@/app/(main)/manga/_lib/handle-chapter-reader"
import { Button, IconButton } from "@/components/ui/button"
import { SeaImage } from "@/components/shared/sea-image"
import { getImageUrl } from "@/lib/server/assets"
import { displayTitle } from "@/lib/helpers/media"
import { useRouter } from "@/lib/navigation"
import { atomWithStorage } from "jotai/utils"
import { useAtom, useAtomValue, useSetAtom } from "jotai/react"
import { useQueryClient } from "@tanstack/react-query"
import React from "react"
import { LuBookOpen, LuDownload, LuX } from "react-icons/lu"

type MangaChapterNotice = {
    key: string
    mediaId: number
    title: string
    coverImage: string
    chapterNumber: number
    progress: number
    provider: string
}

const mangaChapterNoticesAtom = atomWithStorage<MangaChapterNotice[]>(
    "sea-manga-chapter-notices",
    [],
    undefined,
    { getOnInit: true },
)

const observedChapterNumbersAtom = atomWithStorage<Record<string, number>>(
    "sea-manga-observed-chapter-numbers",
    {},
    undefined,
    { getOnInit: true },
)

function getSourceKey(mediaId: number, item: Manga_MangaLatestChapterNumberItem) {
    return `${mediaId}:${item.provider}:${item.scanlator}:${item.language}`
}

export function MangaChapterNotification() {
    const router = useRouter()
    const { data: collection } = useGetMangaCollection()
    const { data: latestChapterNumbers } = useGetMangaLatestChapterNumbersMap()
    const storedProviders = useAtomValue(__manga_entryProviderAtom)
    const setStoredProviders = useSetAtom(__manga_entryProviderAtom)
    const [notices, setNotices] = useAtom(mangaChapterNoticesAtom)
    const [observedChapterNumbers, setObservedChapterNumbers] = useAtom(observedChapterNumbersAtom)
    const setCurrentChapter = useSetCurrentChapter()

    const readingEntries = React.useMemo(() => (
        collection?.lists
            ?.filter(list => list.type === "CURRENT" || list.type === "REPEATING")
            .flatMap(list => list.entries ?? []) ?? []
    ), [collection])

    const monitoredSources = React.useMemo(() => readingEntries.flatMap(entry => {
        const cachedSources = latestChapterNumbers?.[entry.mediaId] ?? []
        const latestCachedSource = [...cachedSources]
            .filter(source => source.provider !== "local-manga")
            .sort((a, b) => b.number - a.number)[0]
        const selectedProvider = storedProviders[String(entry.mediaId)]
        const provider = selectedProvider && selectedProvider !== "local-manga"
            ? selectedProvider
            : latestCachedSource?.provider
        return provider ? [{ mediaId: entry.mediaId, provider }] : []
    }).filter((source, index, sources) => (
        sources.findIndex(other => other.mediaId === source.mediaId && other.provider === source.provider) === index
    )), [latestChapterNumbers, readingEntries, storedProviders])

    React.useEffect(() => {
        if (!collection || !latestChapterNumbers) return

        const nextObserved = { ...observedChapterNumbers }
        const newNotices: MangaChapterNotice[] = []

        for (const list of collection.lists ?? []) {
            if (list.type !== "CURRENT" && list.type !== "REPEATING") continue

            for (const entry of list.entries ?? []) {
                const progress = entry.listData?.progress ?? 0
                const title = displayTitle(entry.media?.title) || `Manga ${entry.mediaId}`
                const coverImage = entry.media?.coverImage?.extraLarge || entry.media?.coverImage?.large || ""

                const selectedProvider = storedProviders[String(entry.mediaId)]
                const availableSources = latestChapterNumbers[entry.mediaId] ?? []
                const sources = selectedProvider && selectedProvider !== "local-manga"
                    ? availableSources.filter(source => source.provider === selectedProvider)
                    : availableSources

                for (const source of sources) {
                    const sourceKey = getSourceKey(entry.mediaId, source)
                    const previousNumber = observedChapterNumbers[sourceKey]
                    const isNewRelease = previousNumber !== undefined
                        ? source.number > previousNumber && source.number > progress
                        : source.number > progress && source.number <= progress + 1

                    nextObserved[sourceKey] = Math.max(previousNumber ?? 0, source.number)

                    if (!isNewRelease || !source.provider) continue

                    newNotices.push({
                        key: `${sourceKey}:${source.number}`,
                        mediaId: entry.mediaId,
                        title,
                        coverImage,
                        chapterNumber: source.number,
                        progress,
                        provider: source.provider,
                    })
                }
            }
        }

        if (JSON.stringify(nextObserved) !== JSON.stringify(observedChapterNumbers)) {
            setObservedChapterNumbers(nextObserved)
        }

        if (newNotices.length > 0) {
            newNotices.sort((a, b) => b.chapterNumber - a.chapterNumber)
            setNotices(previous => {
                const existingKeys = new Set(previous.map(notice => notice.key))
                return [...previous, ...newNotices.filter(notice => !existingKeys.has(notice.key))].slice(0, 20)
            })
        }
    }, [collection, latestChapterNumbers, observedChapterNumbers, setNotices, setObservedChapterNumbers])

    return (
        <>
            {monitoredSources.map((source, index) => (
                <MangaChapterSourceMonitor
                    key={`${source.mediaId}:${source.provider}`}
                    mediaId={source.mediaId}
                    provider={source.provider}
                    delayMs={index * 2_000}
                />
            ))}
            {!!notices.length && (
                <ActiveMangaChapterNotice
                    notice={notices[0]}
                    onClose={() => setNotices(previous => previous.slice(1))}
                    onRead={chapter => {
                        const notice = notices[0]
                        setStoredProviders(previous => ({
                            ...previous,
                            [String(notice.mediaId)]: notice.provider,
                        }))
                        setCurrentChapter({
                            chapterId: chapter.id,
                            chapterNumber: chapter.chapter,
                            provider: chapter.provider || notice.provider,
                            mediaId: notice.mediaId,
                        })
                        router.push(`/manga/entry?id=${notice.mediaId}`)
                        setNotices(previous => previous.slice(1))
                    }}
                />
            )}
        </>
    )
}

function MangaChapterSourceMonitor({
    mediaId,
    provider,
    delayMs,
}: {
    mediaId: number
    provider: string
    delayMs: number
}) {
    const queryClient = useQueryClient()
    const [enabled, setEnabled] = React.useState(delayMs === 0)
    const query = useGetMangaEntryChapters({
        mediaId: enabled ? mediaId : undefined,
        provider: enabled ? provider : undefined,
        refresh: true,
    })

    React.useEffect(() => {
        if (enabled) return
        const timeout = window.setTimeout(() => setEnabled(true), delayMs)
        return () => window.clearTimeout(timeout)
    }, [delayMs, enabled])

    React.useEffect(() => {
        if (enabled && query.dataUpdatedAt > 0) {
            void queryClient.invalidateQueries({
                queryKey: [API_ENDPOINTS.MANGA.GetMangaLatestChapterNumbersMap.key],
            })
        }
    }, [enabled, query.dataUpdatedAt, queryClient])

    React.useEffect(() => {
        if (query.error) {
            console.warn(`Could not refresh manga chapters for ${mediaId} from ${provider}`, query.error)
        }
    }, [mediaId, provider, query.error])

    return null
}

function ActiveMangaChapterNotice({
    notice,
    onClose,
    onRead,
}: {
    notice: MangaChapterNotice
    onClose: () => void
    onRead: (chapter: HibikeManga_ChapterDetails) => void
}) {
    const { data: chapterContainer, isFetching, isError, refetch } = useGetMangaEntryChapters({
        mediaId: notice.mediaId,
        provider: notice.provider,
        refresh: true,
    })
    const { mutate: downloadChapter, isPending: isDownloading } = useDownloadMangaChapters(notice.mediaId, notice.provider)

    const chapter = React.useMemo(() => {
        const available = (chapterContainer?.chapters ?? [])
            .map(item => ({ item, number: Number(item.chapter) }))
            .filter(item => Number.isFinite(item.number) && item.number > notice.progress && Math.floor(item.number) <= notice.chapterNumber)
            .sort((a, b) => a.number - b.number)
        return available.at(-1)?.item
    }, [chapterContainer, notice.chapterNumber, notice.progress])

    const handleDownload = () => {
        if (!chapter) return
        downloadChapter({
            mediaId: notice.mediaId,
            provider: notice.provider,
            chapterIds: [chapter.id],
            startNow: true,
            mediaTitle: notice.title,
            coverImage: notice.coverImage,
            silent: true,
        }, {
            onSuccess: onClose,
        })
    }

    const handleRead = () => {
        if (!chapter) return
        onRead(chapter)
    }

    return (
        <section
            aria-label="New manga chapter available"
            aria-live="assertive"
            className="fixed right-5 top-5 z-[110] w-[30rem] max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-2xl border border-[--border] bg-[--paper] shadow-2xl backdrop-blur-xl"
        >
            <div className="flex items-start gap-3 p-4">
                {notice.coverImage ? (
                    <SeaImage
                        src={getImageUrl(notice.coverImage)}
                        alt=""
                        className="h-16 w-12 flex-shrink-0 rounded-md object-cover"
                    />
                ) : (
                    <div className="flex h-16 w-12 flex-shrink-0 items-center justify-center rounded-md bg-brand-500/20 text-brand-300">
                        <LuBookOpen className="text-xl" />
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-300">
                        New chapter available
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-[--foreground]">{notice.title}</p>
                    <p className="mt-1 text-xs text-[--muted]">
                        Chapter {chapter ? Number(chapter.chapter) : notice.chapterNumber}
                        <span className="opacity-70"> · {notice.provider}</span>
                    </p>
                </div>
                <IconButton
                    icon={<LuX />}
                    size="xs"
                    intent="gray-subtle"
                    aria-label="Close new chapter notification"
                    onClick={onClose}
                />
            </div>
            {isError && (
                <div className="border-t border-[--border] px-4 py-2 text-xs text-[--muted]">
                    Chapter details could not be loaded.{" "}
                    <button type="button" className="text-brand-300 hover:underline" onClick={() => void refetch()}>
                        Retry
                    </button>
                </div>
            )}
            <div className="flex flex-wrap gap-2 border-t border-[--border] p-3">
                <Button
                    intent="primary"
                    size="xs"
                    leftIcon={<LuDownload />}
                    disabled={!chapter || isFetching || isDownloading}
                    loading={isDownloading}
                    onClick={handleDownload}
                >
                    Download
                </Button>
                <Button
                    intent="white-subtle"
                    size="xs"
                    leftIcon={<LuBookOpen />}
                    disabled={!chapter || isFetching}
                    onClick={handleRead}
                >
                    Read
                </Button>
                <Button intent="gray-outline" size="xs" className="ml-auto" onClick={onClose}>
                    Close
                </Button>
            </div>
        </section>
    )
}
