import { AL_MangaDetailsById_Media, HibikeManga_ChapterDetails, Manga_ChapterContainer, Manga_Entry, Manga_MediaDownloadData } from "@/api/generated/types"
import { useEmptyMangaEntryCache } from "@/api/hooks/manga.hooks"
import { SeaCommandInjectableItem, useSeaCommandInject } from "@/app/(main)/_features/sea-command/use-inject"
import { manga_downloadedChapterContainerAtom } from "@/app/(main)/manga/_containers/chapter-list/downloaded-chapter-list"
import { MangaManualMappingModal } from "@/app/(main)/manga/_containers/chapter-list/manga-manual-mapping-modal"
import { ChapterReaderDrawer } from "@/app/(main)/manga/_containers/chapter-reader/chapter-reader-drawer"
import { __manga_selectedChapterAtom } from "@/app/(main)/manga/_lib/handle-chapter-reader"
import { getChapterListStatus } from "@/app/(main)/manga/_lib/chapter-list-status"
import { useHandleMangaChapters } from "@/app/(main)/manga/_lib/handle-manga-chapters"
import { useHandleDownloadMangaChapter } from "@/app/(main)/manga/_lib/handle-manga-downloads"
import { getChapterNumberFromChapter, getDecimalFromChapter, useMangaDownloadDataUtils } from "@/app/(main)/manga/_lib/handle-manga-utils"
import { LANGUAGES_LIST } from "@/app/(main)/manga/_lib/language-map"
import { ConfirmationDialog, useConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { LuffyError } from "@/components/shared/luffy-error"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { Select } from "@/components/ui/select"
import { formatNumber } from "@/lib/helpers/number"
import { useAtom, useSetAtom } from "jotai/react"
import React from "react"
import { ErrorBoundary } from "react-error-boundary"
import {
    LuArrowUpDown, LuBookOpen, LuCheck, LuClock, LuDownload, LuHardDrive, LuListChecks, LuRefreshCw, LuSearch, LuSparkles, LuX,
} from "react-icons/lu"

type ChapterListProps = {
    mediaId: string | null
    entry: Manga_Entry
    details: AL_MangaDetailsById_Media | undefined
    downloadData: Manga_MediaDownloadData | undefined
    downloadDataLoading: boolean
}

type Tab = "all" | "unread" | "downloaded"

/** How many tiles one range holds: long series are browsed a hundred chapters at a time. */
const RANGE_SIZE = 100

/**
 * The chapter list: where you are in the series and what is on disk, up top; then the chapters
 * themselves as tiles — read ones dimmed, the next one marked, downloads and queued ones badged —
 * a hundred at a time, so a series with a thousand chapters opens as fast as one with ten.
 */
export function ChapterList(props: ChapterListProps) {
    const { mediaId, entry, downloadData, downloadDataLoading } = props

    const {
        selectedExtension,
        providerExtensionsLoading,
        providerOptions,
        selectedProvider,
        setSelectedProvider,
        selectedFilters,
        setSelectedLanguage,
        setSelectedScanlator,
        languageOptions,
        scanlatorOptions,
        chapterContainer,
        chapterContainerLoading,
        chapterContainerError,
        refetchChapterContainer,
    } = useHandleMangaChapters(mediaId)
    const { mutate: clearMangaCache, isPending: isClearingMangaCache } = useEmptyMangaEntryCache()

    const hasSources = providerOptions.length > 0

    // Chapters already on the server, from the download data the page loads anyway. Shown when
    // the source fails or comes back empty, so downloaded chapters never disappear behind a source
    // that is down: the reader opens a downloaded chapter from disk by its source and id.
    const downloadedFallback = React.useMemo(() => {
        if (chapterContainer?.chapters?.length) return null
        const out: HibikeManga_ChapterDetails[] = []
        for (const [provider, items] of Object.entries(downloadData?.downloaded ?? {})) {
            for (const item of items ?? []) {
                if (!item?.chapterId) continue
                const n = getDecimalFromChapter(item.chapterNumber || "")
                out.push({
                    provider,
                    id: item.chapterId,
                    url: "",
                    title: `Chapter ${n || item.chapterNumber}`,
                    chapter: item.chapterNumber,
                    index: 0,
                })
            }
        }
        out.sort((a, b) => getDecimalFromChapter(a.chapter) - getDecimalFromChapter(b.chapter))
        out.forEach((ch, i) => ch.index = i)
        return out.length ? out : null
    }, [chapterContainer?.chapters, downloadData?.downloaded])
    // Loading until the source has actually answered — see getChapterListStatus.
    const status = getChapterListStatus({
        busy: isClearingMangaCache || providerExtensionsLoading || chapterContainerLoading,
        hasData: !!chapterContainer,
        hasError: !!chapterContainerError,
        chapterCount: chapterContainer?.chapters?.length ?? 0,
        downloadedCount: downloadedFallback?.length ?? 0,
        hasSources,
        hasProvider: !!selectedProvider,
    })
    const usingFallback = status === "fallback"
    const chapterList = React.useMemo(
        () => usingFallback ? downloadedFallback! : chapterContainer?.chapters ?? [],
        [usingFallback, downloadedFallback, chapterContainer?.chapters],
    )
    const effectiveContainer = React.useMemo<Manga_ChapterContainer | undefined>(
        () => usingFallback
            ? { mediaId: Number(mediaId), provider: selectedProvider || downloadedFallback![0].provider, chapters: downloadedFallback! }
            : chapterContainer,
        [usingFallback, downloadedFallback, chapterContainer, mediaId, selectedProvider],
    )

    // Chapter numbers as integers, by chapter id: used for read/unread and by the reader.
    const chapterIdToNumbersMap = React.useMemo(() => {
        const map = new Map<string, number>()
        for (const chapter of chapterList) {
            map.set(chapter.id, getChapterNumberFromChapter(chapter.chapter))
        }
        return map
    }, [chapterList])

    const setSelectedChapter = useSetAtom(__manga_selectedChapterAtom)
    const { downloadChapters, isSendingDownloadRequest } = useHandleDownloadMangaChapter(mediaId, entry.media?.title?.romaji ?? undefined)
    const { isChapterQueued, isChapterDownloaded, isChapterLocal } = useMangaDownloadDataUtils(downloadData, downloadDataLoading)
    const { inject, remove } = useSeaCommandInject()

    const progress = entry.listData?.progress ?? 0
    const isRead = React.useCallback((chapter: HibikeManga_ChapterDetails) => {
        const n = chapterIdToNumbersMap.get(chapter.id)
        return !!progress && n !== undefined && n <= progress
    }, [chapterIdToNumbersMap, progress])

    const confirmReloadSource = useConfirmationDialog({
        title: "Reload sources",
        actionIntent: "primary",
        actionText: "Reload",
        description: "This action will empty the cache for this manga and fetch the latest data from the selected source.",
        onConfirm: () => {
            if (mediaId) clearMangaCache({ mediaId: Number(mediaId) })
        },
    })

    // Oldest first, by number; unread keeps the source's own reading order.
    const ascending = React.useMemo(() => {
        return [...chapterList].sort((a, b) => getDecimalFromChapter(a.chapter) - getDecimalFromChapter(b.chapter))
    }, [chapterList])
    const unreadChapters = React.useMemo(() => ascending.filter(ch => !isRead(ch)), [ascending, isRead])
    const nextChapter = unreadChapters[0]
    const downloadedCount = React.useMemo(() => ascending.filter(ch => isChapterDownloaded(ch)).length, [ascending, isChapterDownloaded])
    const queuedCount = React.useMemo(() => ascending.filter(ch => isChapterQueued(ch)).length, [ascending, isChapterQueued])
    const latest = ascending[ascending.length - 1]

    const [tab, setTab] = React.useState<Tab>("all")
    const [newestFirst, setNewestFirst] = React.useState(false)
    const [query, setQuery] = React.useState("")
    const [selecting, setSelecting] = React.useState(false)
    const [selected, setSelected] = React.useState<Map<string, HibikeManga_ChapterDetails>>(new Map())

    const visible = React.useMemo(() => {
        let list = tab === "unread" ? unreadChapters : tab === "downloaded" ? ascending.filter(ch => isChapterDownloaded(ch) || isChapterQueued(ch)) : ascending
        const q = query.trim().toLowerCase()
        if (q) {
            list = list.filter(ch => ch.title?.toLowerCase().includes(q) || String(getDecimalFromChapter(ch.chapter)).startsWith(q) || ch.scanlator?.toLowerCase().includes(q))
        }
        return newestFirst ? [...list].reverse() : list
    }, [tab, unreadChapters, ascending, isChapterDownloaded, isChapterQueued, query, newestFirst])

    const ranges = React.useMemo(() => {
        const out: { start: number, label: string }[] = []
        for (let i = 0; i < visible.length; i += RANGE_SIZE) {
            const first = visible[i]
            const last = visible[Math.min(visible.length, i + RANGE_SIZE) - 1]
            out.push({ start: i, label: `${formatNumber(getDecimalFromChapter(first.chapter))}–${formatNumber(getDecimalFromChapter(last.chapter))}` })
        }
        return out
    }, [visible])

    // Open on the range that holds the next chapter to read.
    const [rangeStart, setRangeStart] = React.useState(0)
    const jumpedFor = React.useRef<string | null>(null)
    React.useEffect(() => {
        const key = `${tab}|${newestFirst}|${query}|${visible.length}`
        if (jumpedFor.current === key) return
        jumpedFor.current = key
        const idx = nextChapter ? visible.findIndex(ch => ch.id === nextChapter.id) : -1
        setRangeStart(idx > 0 ? Math.floor(idx / RANGE_SIZE) * RANGE_SIZE : 0)
    }, [tab, newestFirst, query, visible, nextChapter])
    const page = React.useMemo(() => visible.slice(rangeStart, rangeStart + RANGE_SIZE), [visible, rangeStart])

    const canSelect = React.useCallback((ch: HibikeManga_ChapterDetails) => !isChapterLocal(ch) && !isChapterDownloaded(ch) && !isChapterQueued(ch),
        [isChapterLocal, isChapterDownloaded, isChapterQueued])
    const toggleSelected = React.useCallback((ch: HibikeManga_ChapterDetails) => {
        setSelected(prev => {
            const next = new Map(prev)
            if (next.has(ch.id)) next.delete(ch.id)
            else next.set(ch.id, ch)
            return next
        })
    }, [])
    const clearSelection = React.useCallback(() => setSelected(new Map()), [])

    const openChapter = React.useCallback((ch: HibikeManga_ChapterDetails) => {
        setSelectedChapter({ chapterId: ch.id, chapterNumber: ch.chapter, provider: ch.provider, mediaId: Number(mediaId) })
    }, [mediaId, setSelectedChapter])

    // Command palette: the next chapter and the ten after it.
    React.useEffect(() => {
        if (!chapterList.length) return
        const item = (chapter: HibikeManga_ChapterDetails, heading: string, priority: number, id: string) => ({
            data: chapter,
            id,
            value: `${chapter.chapter}`,
            heading,
            priority,
            render: () => (
                <div className="flex gap-1 items-center w-full">
                    <p className="max-w-[70%] truncate">Chapter {chapter.chapter}</p>
                    {chapter.scanlator && <p className="text-[--muted]">({chapter.scanlator})</p>}
                </div>
            ),
            onSelect: ({ ctx }) => {
                openChapter(chapter)
                ctx.close()
            },
        } as SeaCommandInjectableItem)
        inject("manga-chapters", {
            items: [
                ...(nextChapter ? [item(nextChapter, "Next Chapter", 2, `next-chapter-${nextChapter.id}`)] : []),
                ...unreadChapters.slice(0, 10).map(ch => item(ch, "Upcoming Chapters", 1, `chapter-${ch.id}`)),
            ],
            filter: ({ item, input }) => {
                if (!input) return true
                return item.value.toLowerCase().includes(input.toLowerCase()) || (item.data.title?.toLowerCase() || "").includes(input.toLowerCase())
            },
            priority: 100,
        })
        return () => remove("manga-chapters")
    }, [chapterList, unreadChapters, nextChapter, openChapter])

    const [downloadedChapterContainer] = useAtom(manga_downloadedChapterContainerAtom)

    const total = ascending.length
    const readCount = total - unreadChapters.length
    const loading = status === "loading"
    const failed = status === "error"

    return (
        <div
            className="space-y-5"
            data-chapter-list-container
            data-selected-filters={JSON.stringify(selectedFilters)}
            data-selected-provider={JSON.stringify(selectedProvider)}
        >
            {/* Where you are */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" data-chapter-list-header-container>
                <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[--brand]">Chapters</p>
                    <h2 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                        {loading && !total ? "Finding chapters…" : total ? `${formatNumber(total)} chapters` : failed ? "Couldn't load chapters" : !hasSources ? "No sources installed" : "No chapters yet"}
                    </h2>
                    {!!total && (
                        <p className="mt-1 text-sm text-white/55">
                            {[
                                readCount ? `Read ${formatNumber(readCount)}` : "Not started",
                                downloadedCount ? `${formatNumber(downloadedCount)} downloaded` : null,
                                queuedCount ? `${formatNumber(queuedCount)} queued` : null,
                                latest ? `Latest: chapter ${formatNumber(getDecimalFromChapter(latest.chapter))}` : null,
                            ].filter(Boolean).join(" · ")}
                        </p>
                    )}
                </div>
                {!!total && (nextChapter ? (
                    <button
                        type="button"
                        onClick={() => openChapter(nextChapter)}
                        className="group relative flex items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 py-2.5 pl-3 pr-5 text-left text-white shadow-lg shadow-brand-900/40 ring-1 ring-white/20 transition hover:-translate-y-0.5 hover:shadow-xl"
                    >
                        <span className="flex size-10 items-center justify-center rounded-xl bg-black/20"><LuBookOpen className="size-5" /></span>
                        <span>
                            <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-white/75">{readCount ? "Continue reading" : "Start reading"}</span>
                            <span className="block text-base font-bold">Chapter {formatNumber(getDecimalFromChapter(nextChapter.chapter))}</span>
                        </span>
                    </button>
                ) : (
                    <span className="flex items-center gap-2 rounded-full bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-300/20">
                        <LuSparkles className="size-4" />All caught up
                    </span>
                ))}
            </div>

            {!!total && (
                <div className="sea-progress-track relative h-2 overflow-hidden rounded-full bg-white/[0.07]" title={`${readCount} read, ${downloadedCount} downloaded of ${total}`}>
                    <div className="absolute inset-y-0 left-0 rounded-full bg-sky-400/35" style={{ width: `${(downloadedCount / total) * 100}%` }} />
                    <div className="sea-progress-fill absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-brand-500 to-brand-300" style={{ width: `${(readCount / total) * 100}%` }} />
                </div>
            )}

            {/* Source and filters */}
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-black/25 p-2 ring-1 ring-white/[0.07] backdrop-blur-md">
                <Select
                    fieldClass="w-fit"
                    options={providerOptions}
                    value={selectedProvider || ""}
                    onValueChange={v => setSelectedProvider({ mId: mediaId, provider: v })}
                    leftAddon="Source"
                    size="sm"
                    disabled={isClearingMangaCache}
                />
                <ToolButton onClick={() => confirmReloadSource.open()} title="Reload sources" disabled={isClearingMangaCache}>
                    <LuRefreshCw className={cn("size-4", isClearingMangaCache && "animate-spin")} />
                </ToolButton>
                <MangaManualMappingModal entry={entry}>
                    <button type="button" className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white/75 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white">
                        <LuSearch className="size-3.5" />Manual match
                    </button>
                </MangaManualMappingModal>

                <ErrorBoundary fallbackRender={({ error }) => <Alert intent="alert" title="Client side error" description={`Could not load chapter filters. Please contact the extension developer: "${error}"`} />}>
                    {selectedExtension?.settings?.supportsMultiScanlator && (
                        <Select
                            fieldClass="w-56"
                            size="sm"
                            options={scanlatorOptions}
                            placeholder="All"
                            value={selectedFilters.scanlators[0] || ""}
                            onValueChange={v => setSelectedScanlator({ mId: mediaId, scanlators: [v] })}
                            leftAddon="Scanlator"
                        />
                    )}
                    {selectedExtension?.settings?.supportsMultiLanguage && (
                        <Select
                            fieldClass="w-56"
                            size="sm"
                            options={languageOptions}
                            placeholder="All"
                            value={selectedFilters.language}
                            onValueChange={v => setSelectedLanguage({ mId: mediaId, language: v })}
                            leftAddon="Language"
                        />
                    )}
                </ErrorBoundary>

                {!!total && (
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                        <div className="flex rounded-lg bg-black/30 p-0.5 ring-1 ring-white/10" role="tablist">
                            {([
                                ["all", "All", total],
                                ["unread", "Unread", unreadChapters.length],
                                ...(selectedProvider !== "local-manga" ? [["downloaded", "Downloaded", downloadedCount + queuedCount]] : []),
                            ] as [Tab, string, number][]).map(([id, label, count]) => (
                                <button
                                    key={id}
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === id}
                                    onClick={() => setTab(id)}
                                    className={cn("rounded-md px-2.5 py-1 text-xs font-semibold transition", tab === id ? "bg-white/15 text-white" : "text-white/55 hover:text-white")}
                                >
                                    {label}<span className="ml-1 tabular-nums text-white/40">{formatNumber(count)}</span>
                                </button>
                            ))}
                        </div>
                        <label className="flex h-8 items-center gap-1.5 rounded-lg bg-black/30 px-2.5 ring-1 ring-white/10 focus-within:ring-[--brand]/60">
                            <LuSearch className="size-3.5 text-white/40" />
                            <input
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Find a chapter"
                                className="w-28 bg-transparent text-xs text-white placeholder:text-white/35 focus:outline-none sm:w-36"
                            />
                        </label>
                        <ToolButton onClick={() => setNewestFirst(v => !v)} title={newestFirst ? "Newest first" : "Oldest first"} active={newestFirst}>
                            <LuArrowUpDown className="size-4" />
                        </ToolButton>
                        {selectedProvider !== "local-manga" && (
                            <ToolButton
                                onClick={() => {
                                    setSelecting(v => !v)
                                    clearSelection()
                                }}
                                title="Select chapters to download"
                                active={selecting}
                            >
                                <LuListChecks className="size-4" />
                            </ToolButton>
                        )}
                    </div>
                )}
            </div>

            {/* The chapters */}
            {usingFallback && !loading && (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-amber-400/[0.07] px-4 py-3 ring-1 ring-amber-300/20" data-chapter-list-fallback>
                    <LuHardDrive className="size-4 flex-none text-amber-200" />
                    <p className="min-w-0 flex-1 text-sm text-amber-100/90">
                        {chapterContainerError
                            ? "The source didn't answer, so these are the chapters already downloaded to the server."
                            : "The source found no chapters, so these are the chapters already downloaded to the server."}
                    </p>
                    <Button intent="white-subtle" size="sm" onClick={() => refetchChapterContainer()}>Try the source again</Button>
                </div>
            )}

            {loading ? <ChapterSkeleton /> : failed ? (
                <LuffyError title="No chapters found">
                    <p className="text-sm text-[--muted] mb-2">The source didn't answer in time, or found nothing for this title.</p>
                    <Button intent="primary-subtle" size="md" className="mb-2" onClick={() => refetchChapterContainer()}>Try again</Button>
                    <MangaManualMappingModal entry={entry}>
                        <Button leftIcon={<LuSearch className="text-lg" />} intent="gray-outline" size="md">Manual match</Button>
                    </MangaManualMappingModal>
                </LuffyError>
            ) : !total ? (
                <LuffyError title="No chapters found"><p>{hasSources ? "Try another source" : "Install a manga source extension to find chapters."}</p></LuffyError>
            ) : (
                <div className="space-y-3">
                    {ranges.length > 1 && (
                        <div className="flex gap-1.5 overflow-x-auto pb-1" data-chapter-ranges>
                            {ranges.map(r => (
                                <button
                                    key={r.start}
                                    type="button"
                                    onClick={() => setRangeStart(r.start)}
                                    className={cn(
                                        "flex-none rounded-full px-3 py-1 text-xs font-semibold tabular-nums ring-1 transition",
                                        rangeStart === r.start ? "bg-white text-black ring-white" : "bg-white/[0.05] text-white/65 ring-white/10 hover:bg-white/10 hover:text-white",
                                    )}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {!page.length ? (
                        <p className="rounded-2xl border border-dashed border-white/15 px-4 py-10 text-center text-sm text-white/50">
                            {query ? `No chapter matches "${query}".` : tab === "unread" ? "Nothing left to read here." : "Nothing downloaded yet."}
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" data-chapter-grid>
                            {page.map(chapter => (
                                <ChapterTile
                                    key={chapter.id}
                                    chapter={chapter}
                                    read={isRead(chapter)}
                                    next={chapter.id === nextChapter?.id}
                                    downloaded={isChapterDownloaded(chapter)}
                                    queued={isChapterQueued(chapter)}
                                    local={isChapterLocal(chapter)}
                                    showScanlator={!!selectedExtension?.settings?.supportsMultiScanlator}
                                    showLanguage={!!selectedExtension?.settings?.supportsMultiLanguage}
                                    selecting={selecting}
                                    selectable={canSelect(chapter)}
                                    selected={selected.has(chapter.id)}
                                    downloadDisabled={isSendingDownloadRequest}
                                    onOpen={openChapter}
                                    onToggle={toggleSelected}
                                    onDownload={ch => downloadChapters([ch])}
                                />
                            ))}
                        </div>
                    )}

                    {selecting && (
                        <div className="sticky bottom-4 z-[5] flex flex-wrap items-center gap-2 rounded-2xl bg-black/80 p-2.5 pl-4 shadow-2xl ring-1 ring-white/15 backdrop-blur-xl" data-chapter-selection-bar>
                            <span className="text-sm font-semibold text-white">{formatNumber(selected.size)} selected</span>
                            <button
                                type="button"
                                onClick={() => setSelected(new Map(page.filter(canSelect).map(ch => [ch.id, ch])))}
                                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white"
                            >
                                Select this range
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelected(new Map(unreadChapters.filter(canSelect).map(ch => [ch.id, ch])))}
                                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white"
                            >
                                All unread
                            </button>
                            <div className="ml-auto flex items-center gap-2">
                                {!!selected.size && <Button size="sm" intent="white" leftIcon={<LuDownload />} disabled={isSendingDownloadRequest} onClick={() => {
                                    downloadChapters([...selected.values()])
                                    clearSelection()
                                    setSelecting(false)
                                }} data-download-selected-chapters-button>
                                    Download {formatNumber(selected.size)}
                                </Button>}
                                <ToolButton onClick={() => {
                                    clearSelection()
                                    setSelecting(false)
                                }} title="Done">
                                    <LuX className="size-4" />
                                </ToolButton>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {(effectiveContainer || downloadedChapterContainer) && <ChapterReaderDrawer
                entry={entry}
                chapterContainer={effectiveContainer || downloadedChapterContainer!}
                chapterIdToNumbersMap={chapterIdToNumbersMap}
            />}

            <ConfirmationDialog {...confirmReloadSource} />
        </div>
    )
}

type ChapterTileProps = {
    chapter: HibikeManga_ChapterDetails
    read: boolean
    next: boolean
    downloaded: boolean
    queued: boolean
    local: boolean
    showScanlator: boolean
    showLanguage: boolean
    selecting: boolean
    selectable: boolean
    selected: boolean
    downloadDisabled: boolean
    onOpen: (chapter: HibikeManga_ChapterDetails) => void
    onToggle: (chapter: HibikeManga_ChapterDetails) => void
    onDownload: (chapter: HibikeManga_ChapterDetails) => void
}

const ChapterTile = React.memo(function ChapterTile(props: ChapterTileProps) {
    const { chapter, read, next, downloaded, queued, local, showScanlator, showLanguage, selecting, selectable, selected, downloadDisabled, onOpen, onToggle, onDownload } = props
    const number = getDecimalFromChapter(chapter.chapter)
    // A title that only repeats the number says nothing; show what else is known instead.
    const plainTitle = !chapter.title || /^(ch(apter)?\.?\s*)?[\d.]+$/i.test(chapter.title.trim())
    const meta = [
        showScanlator ? chapter.scanlator : null,
        showLanguage && chapter.language ? LANGUAGES_LIST[chapter.language]?.nativeName || chapter.language : null,
        chapter.updatedAt ? formatUpdated(chapter.updatedAt) : null,
    ].filter(Boolean).join(" · ")

    const handleClick = () => {
        if (selecting) {
            if (selectable) onToggle(chapter)
            return
        }
        onOpen(chapter)
    }

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    handleClick()
                }
            }}
            data-chapter-tile
            data-chapter-read={read}
            className={cn(
                "group relative flex min-h-[4.25rem] cursor-pointer items-center gap-3 overflow-hidden rounded-xl p-2.5 pr-3 ring-1 transition-all duration-150",
                "bg-white/[0.035] ring-white/[0.07] hover:-translate-y-px hover:bg-white/[0.07] hover:ring-white/15",
                next && "bg-gradient-to-r from-brand-500/20 to-transparent ring-[--brand]/50 hover:ring-[--brand]/80",
                read && !next && "opacity-55 hover:opacity-100",
                selecting && !selectable && "cursor-default opacity-40",
                selected && "ring-2 ring-white/80",
            )}
        >
            <div className={cn(
                "flex size-12 flex-none flex-col items-center justify-center rounded-lg tabular-nums",
                next ? "bg-[--brand] text-white" : "bg-black/35 text-white ring-1 ring-white/10",
            )}>
                <span className="text-[9px] font-bold uppercase leading-none tracking-wider opacity-60">Ch</span>
                <span className={cn("font-extrabold leading-tight", number >= 1000 ? "text-sm" : "text-base")}>{formatNumber(number)}</span>
            </div>

            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                    {plainTitle ? `Chapter ${formatNumber(number)}` : chapter.title}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-white/45">
                    {next && <span className="font-bold uppercase tracking-wider text-brand-200">Up next</span>}
                    {read && !next && <span className="flex items-center gap-0.5 text-emerald-300/80"><LuCheck className="size-3" />Read</span>}
                    {meta && <span className="truncate">{meta}</span>}
                </p>
            </div>

            <div className="flex flex-none items-center gap-1">
                {selecting ? (
                    selectable && (
                        <span className={cn("flex size-5 items-center justify-center rounded-md ring-1", selected ? "bg-white text-black ring-white" : "ring-white/30")}>
                            {selected && <LuCheck className="size-3.5" />}
                        </span>
                    )
                ) : <>
                    {downloaded && <span title="Downloaded" className="flex size-7 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300"><LuHardDrive className="size-3.5" /></span>}
                    {queued && <span title="Queued" className="flex size-7 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300"><LuClock className="size-3.5 animate-pulse" /></span>}
                    {!downloaded && !queued && !local && (
                        <button
                            type="button"
                            title="Download"
                            disabled={downloadDisabled}
                            onClick={e => {
                                e.stopPropagation()
                                onDownload(chapter)
                            }}
                            className="flex size-7 items-center justify-center rounded-lg text-white/40 opacity-0 transition hover:bg-white/10 hover:text-white focus:opacity-100 group-hover:opacity-100 disabled:opacity-30 max-sm:opacity-100"
                        >
                            <LuDownload className="size-4" />
                        </button>
                    )}
                </>}
            </div>
        </div>
    )
})

function ToolButton({ children, onClick, title, active, disabled }: { children: React.ReactNode, onClick: () => void, title: string, active?: boolean, disabled?: boolean }) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            aria-pressed={active}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "flex size-8 items-center justify-center rounded-lg ring-1 transition disabled:opacity-40",
                active ? "bg-white text-black ring-white" : "text-white/70 ring-white/10 hover:bg-white/10 hover:text-white",
            )}
        >
            {children}
        </button>
    )
}

function ChapterSkeleton() {
    return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-busy="true" aria-label="Loading chapters">
            {Array.from({ length: 12 }, (_, i) => (
                <div key={i} className="flex h-[4.25rem] items-center gap-3 rounded-xl bg-white/[0.035] p-2.5 ring-1 ring-white/[0.06]">
                    <div className="size-12 animate-pulse rounded-lg bg-white/[0.07]" />
                    <div className="flex-1 space-y-2">
                        <div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.07]" />
                        <div className="h-2.5 w-1/3 animate-pulse rounded bg-white/[0.05]" />
                    </div>
                </div>
            ))}
        </div>
    )
}

function formatUpdated(value: string) {
    const time = new Date(value).getTime()
    if (!Number.isFinite(time) || time <= 0) return null
    const days = Math.floor((Date.now() - time) / 86_400_000)
    if (days < 1) return "today"
    if (days === 1) return "yesterday"
    if (days < 30) return `${days}d ago`
    return new Date(time).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}
