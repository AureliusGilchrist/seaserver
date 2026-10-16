"use client"

import { useGetMangaCollection, useGetMangaLatestChapterNumbersMap, useCheckMangaChapterUpdates } from "@/api/hooks/manga.hooks"
import { useListMangaProviderExtensions } from "@/api/hooks/extensions.hooks"
import { useDownloadMangaChapters } from "@/api/hooks/manga_download.hooks"
import { Manga_MangaLatestChapterNumberItem } from "@/api/generated/types"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { getDefaultMangaProvider, useStoredMangaProviders } from "@/app/(main)/manga/_lib/handle-manga-selected-provider"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { useRouter } from "@/lib/navigation"
import { atom } from "jotai"
import { useAtom } from "jotai/react"
import { atomWithStorage } from "jotai/utils"
import React from "react"
import { LuBookOpen, LuDownload, LuMegaphone, LuX } from "react-icons/lu"
import { toast } from "sonner"

type MangaChapterNotice = {
    key: string
    mediaId: number
    provider: string
    chapterId: string
    chapterNumber: string
    updatedAt?: string
    title: string
    coverImage?: string
}

type MangaChapterNoticeState = {
    baseline: Record<string, number>
    dismissed: string[]
    pending: MangaChapterNotice[]
}

const emptyState: MangaChapterNoticeState = {
    baseline: {},
    dismissed: [],
    pending: [],
}

const mangaChapterNoticeStateAtom = atomWithStorage<Record<string, MangaChapterNoticeState>>(
    "sea-manga-chapter-notices",
    {},
    undefined,
    { getOnInit: true },
)

function latestChapter(items: Manga_MangaLatestChapterNumberItem[] | undefined, provider?: string): Manga_MangaLatestChapterNumberItem | null {
    const candidates = items?.filter(item => !provider || item.provider === provider)
    if (!candidates?.length) return null
    return [...candidates].sort((a, b) => {
        const aNumber = Number.parseFloat(a.chapter || String(a.number))
        const bNumber = Number.parseFloat(b.chapter || String(b.number))
        return (Number.isFinite(bNumber) ? bNumber : 0) - (Number.isFinite(aNumber) ? aNumber : 0)
    })[0] ?? null
}

export function NewMangaChapterNotifier() {
    const serverStatus = useServerStatus()
    const profileId = String(serverStatus?.currentProfile?.id ?? "default")
    const { data: collection } = useGetMangaCollection()
    const { data: latestNumbers } = useGetMangaLatestChapterNumbersMap(true)
    const { data: mangaProviderExtensions } = useListMangaProviderExtensions()
    const { storedProviders } = useStoredMangaProviders(mangaProviderExtensions)
    const defaultProvider = getDefaultMangaProvider(serverStatus, mangaProviderExtensions)
    const [states, setStates] = useAtom(mangaChapterNoticeStateAtom)
    const { mutate: downloadChapters, isPending: isDownloading } = useDownloadMangaChapters(null, null)
    const { mutate: checkForChapterUpdates } = useCheckMangaChapterUpdates()
    const router = useRouter()
    const [downloadError, setDownloadError] = React.useState<string | null>(null)
    const state = states[profileId] ?? emptyState

    const selectedProviderMap = React.useMemo(() => {
        const providerMap: Record<number, string> = {}
        for (const list of collection?.lists ?? []) {
            if (list.type !== "CURRENT" && list.type !== "REPEATING") continue
            for (const entry of list.entries ?? []) {
                const cachedProvider = latestNumbers?.[entry.mediaId]?.[0]?.provider
                const provider = storedProviders[String(entry.mediaId)] || defaultProvider || cachedProvider
                if (provider) providerMap[entry.mediaId] = provider
            }
        }
        return providerMap
    }, [collection, defaultProvider, latestNumbers, storedProviders])
    const selectedProviderMapRef = React.useRef(selectedProviderMap)
    selectedProviderMapRef.current = selectedProviderMap
    const providerMapSignature = Object.entries(selectedProviderMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mediaId, provider]) => `${mediaId}:${provider}`)
        .join(",")

    React.useEffect(() => {
        if (!providerMapSignature) return

        const checkForUpdates = () => {
            checkForChapterUpdates({ selectedProviderMap: selectedProviderMapRef.current }, {
                onError: error => toast.error("Could not check for new manga chapters", {
                    description: error.message,
                }),
            })
        }

        checkForUpdates()
        const interval = window.setInterval(checkForUpdates, 30 * 60 * 1000)
        return () => window.clearInterval(interval)
    }, [checkForChapterUpdates, profileId, providerMapSignature])

    React.useEffect(() => {
        if (!collection || !latestNumbers) return

        setStates(previous => {
            const current = previous[profileId] ?? emptyState
            const baseline = { ...current.baseline }
            const dismissed = new Set(current.dismissed)
            const pendingByMedia = new Map(current.pending.map(item => [item.mediaId, item]))

            for (const list of collection.lists ?? []) {
                if (list.type !== "CURRENT") continue
                for (const entry of list.entries ?? []) {
                    const provider = storedProviders[String(entry.mediaId)]
                        || defaultProvider
                        || latestNumbers[entry.mediaId]?.[0]?.provider
                    const chapter = latestChapter(latestNumbers[entry.mediaId], provider)
                    if (!entry.media || !chapter) continue

                    const chapterNumber = chapter.chapter || String(chapter.number)
                    const numericChapter = Number.parseFloat(chapterNumber)
                    if (!Number.isFinite(numericChapter)) continue

                    const mediaKey = String(entry.mediaId)
                    const previousNumber = baseline[mediaKey]
                    if (previousNumber === undefined) {
                        baseline[mediaKey] = numericChapter
                        continue
                    }

                    baseline[mediaKey] = Math.max(previousNumber, numericChapter)
                    const progress = entry.listData?.progress ?? 0
                    const updateKey = `${entry.mediaId}:${chapterNumber}`
                    if (numericChapter <= previousNumber || numericChapter <= progress || dismissed.has(updateKey)) {
                        continue
                    }

                    pendingByMedia.set(entry.mediaId, {
                        key: updateKey,
                        mediaId: entry.mediaId,
                        provider: chapter.provider,
                        chapterId: chapter.chapterId,
                        chapterNumber,
                        updatedAt: chapter.updatedAt,
                        title: entry.media.title?.userPreferred
                            || entry.media.title?.romaji
                            || entry.media.title?.english
                            || `Manga ${entry.mediaId}`,
                        coverImage: entry.media.coverImage?.extraLarge || entry.media.coverImage?.large || undefined,
                    })
                }
            }

            return {
                ...previous,
                [profileId]: {
                    baseline,
                    dismissed: [...dismissed],
                    pending: [...pendingByMedia.values()].sort((a, b) => a.title.localeCompare(b.title)),
                },
            }
        })
    }, [collection, defaultProvider, latestNumbers, profileId, setStates, storedProviders])

    const resolveNotice = React.useCallback((notice: MangaChapterNotice) => {
        setStates(previous => {
            const current = previous[profileId] ?? emptyState
            return {
                ...previous,
                [profileId]: {
                    ...current,
                    dismissed: [...new Set([...current.dismissed, notice.key])],
                    pending: current.pending.filter(item => item.key !== notice.key),
                },
            }
        })
    }, [profileId, setStates])

    const closeAll = React.useCallback(() => {
        setStates(previous => {
            const current = previous[profileId] ?? emptyState
            return {
                ...previous,
                [profileId]: {
                    ...current,
                    dismissed: [...new Set([...current.dismissed, ...current.pending.map(item => item.key)])],
                    pending: [],
                },
            }
        })
    }, [profileId, setStates])

    const openChapter = React.useCallback((notice: MangaChapterNotice) => {
        resolveNotice(notice)
        const params = new URLSearchParams({
            id: String(notice.mediaId),
            readProvider: notice.provider,
            readChapterId: notice.chapterId,
            readChapterNumber: notice.chapterNumber,
        })
        router.push(`/manga/entry?${params.toString()}`)
    }, [resolveNotice, router])

    const downloadChapter = React.useCallback((notice: MangaChapterNotice) => {
        setDownloadError(null)
        downloadChapters({
            mediaId: notice.mediaId,
            provider: notice.provider,
            chapterIds: [notice.chapterId],
            startNow: false,
            mediaTitle: notice.title,
            coverImage: notice.coverImage ?? "",
        }, {
            onSuccess: () => resolveNotice(notice),
            onError: error => setDownloadError(error?.message || `Could not queue Chapter ${notice.chapterNumber}.`),
        })
    }, [downloadChapters, resolveNotice])

    if (!state.pending.length) return null

    return (
        <div className="fixed inset-x-0 top-4 z-[997] mx-auto w-full max-w-4xl px-3 sm:px-5" data-new-manga-chapter-notifier>
            <section
                className="overflow-hidden rounded-2xl border border-brand-300/25 bg-gray-950/95 shadow-2xl shadow-black/50 backdrop-blur-2xl"
                aria-live="polite"
                aria-label="New manga chapters"
            >
                <header className="flex items-center gap-3 border-b border-white/[0.08] bg-gradient-to-r from-brand-500/15 via-black/10 to-transparent px-4 py-3 sm:px-5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-brand-300/20 bg-brand-400/10 text-brand-200">
                        <LuMegaphone className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate text-sm font-bold text-white">New chapters from your reading list</h2>
                        <p className="text-xs text-white/55">{state.pending.length} series have a newer chapter available</p>
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        intent="gray-basic"
                        className="shrink-0"
                        onClick={closeAll}
                        title="Close and dismiss these updates"
                    >
                        <LuX className="mr-1.5 size-4" />
                        Close
                    </Button>
                </header>

                <div className="max-h-72 divide-y divide-white/[0.06] overflow-y-auto">
                    {state.pending.map(notice => (
                        <article key={notice.key} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-white">{notice.title}</p>
                                <p className="mt-0.5 text-xs text-white/55">
                                    Chapter {notice.chapterNumber}
                                    {notice.updatedAt ? ` · released ${notice.updatedAt}` : ""}
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    intent="gray-outline"
                                    className={cn("rounded-full")}
                                    onClick={() => openChapter(notice)}
                                    title={`Read Chapter ${notice.chapterNumber}`}
                                >
                                    <LuBookOpen className="mr-1.5 size-4" />
                                    Read
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    intent="primary-subtle"
                                    className="rounded-full"
                                    disabled={isDownloading || !notice.chapterId}
                                    loading={isDownloading}
                                    onClick={() => downloadChapter(notice)}
                                    title={`Download Chapter ${notice.chapterNumber}`}
                                >
                                    <LuDownload className="mr-1.5 size-4" />
                                    Download
                                </Button>
                            </div>
                        </article>
                    ))}
                </div>

                {downloadError && (
                    <p role="alert" className="border-t border-red-400/15 bg-red-500/[0.08] px-4 py-2 text-xs text-red-200 sm:px-5">
                        {downloadError}
                    </p>
                )}
            </section>
        </div>
    )
}
