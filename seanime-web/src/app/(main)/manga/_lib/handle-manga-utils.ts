"use client"
import { getServerBaseUrl } from "@/api/client/server-url"
import { HibikeManga_ChapterDetails, Manga_MediaDownloadData } from "@/api/generated/types"
import { useServerHMACAuth, useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { DataGridRowSelectedEvent } from "@/components/ui/datagrid/use-datagrid-row-selection"
import { RowSelectionState } from "@tanstack/react-table"
import React from "react"

export function getChapterNumberFromChapter(chapter: string): number {
    const chapterNumber = chapter.match(/(\d+(\.\d+)?)/)?.[0]
    return chapterNumber ? Math.floor(parseFloat(chapterNumber)) : 0
}

export function getDecimalFromChapter(chapter: string): number {
    const chapterNumber = chapter.match(/(\d+(\.\d+)?)/)?.[0]
    return chapterNumber ? parseFloat(chapterNumber) : 0
}

export function isChapterBefore(a: string, b: string): boolean {
    // compare the decimal part of the chapter number
    return getDecimalFromChapter(a) < getDecimalFromChapter(b)
}

export function isChapterAfter(a: string, b: string): boolean {
    // compare the decimal part of the chapter number
    return getDecimalFromChapter(a) > getDecimalFromChapter(b)
}

export function useMangaReaderUtils() {
    const serverStatus = useServerStatus()
    const { getHMACTokenQueryParam, password } = useServerHMACAuth()
    const [tokenQueryParam, setTokenQueryParam] = React.useState<string>("")
    const [localPageToken, setLocalPageToken] = React.useState<string>("")

    React.useLayoutEffect(() => {
        (async () => {
            setTokenQueryParam(await getHMACTokenQueryParam("/api/v1/image-proxy", "&"))
            setLocalPageToken(await getHMACTokenQueryParam("/api/v1/manga/local-page", "?"))
        })()
    }, [password])

    const getChapterPageUrl = React.useCallback((url: string, isDownloaded: boolean | undefined, headers?: Record<string, string>) => {
        if (url.startsWith("{{manga-local-assets}}")) {
            return `${getServerBaseUrl()}/api/v1/manga/local-page/${encodeURIComponent(url)}${localPageToken}`
        }

        if (!isDownloaded) {
            if (headers && Object.keys(headers).length > 0) {
                return `${getServerBaseUrl()}/api/v1/image-proxy?url=${encodeURIComponent(url)}&headers=${encodeURIComponent(
                    JSON.stringify(headers))}` + tokenQueryParam
            }
            return url
        }

        return `${getServerBaseUrl()}/manga-downloads/${url}`
    }, [tokenQueryParam, localPageToken])

    /**
     * The same page fetched by the server instead of the device. Used when a direct provider image
     * fails to load: image hosts commonly reject requests by referrer/origin, and the Android
     * client's origin (https://localhost) is one they refuse. Returns null for pages that already
     * come from the server.
     */
    const getProxiedChapterPageUrl = React.useCallback((url: string, isDownloaded: boolean | undefined, headers?: Record<string, string>) => {
        if (isDownloaded || url.startsWith("{{manga-local-assets}}") || !/^https?:\/\//i.test(url)) return null
        if (url.startsWith(getServerBaseUrl())) return null
        return `${getServerBaseUrl()}/api/v1/image-proxy?url=${encodeURIComponent(url)}&headers=${encodeURIComponent(
            JSON.stringify(headers ?? {}))}` + tokenQueryParam
    }, [tokenQueryParam])

    return {
        isReady: (!serverStatus?.serverHasPassword) || (!!password && !!tokenQueryParam),
        getChapterPageUrl,
        getProxiedChapterPageUrl,
    }

}

export function useMangaDownloadDataUtils(data: Manga_MediaDownloadData | undefined, loading: boolean) {
    const downloadedByProvider = React.useMemo(() => {
        const result = new Map<string, Set<string>>()
        for (const [provider, chapters] of Object.entries(data?.downloaded ?? {})) {
            result.set(provider, new Set(chapters.map(chapter => chapter.chapterId)))
        }
        return result
    }, [data])
    const queuedByProvider = React.useMemo(() => {
        const result = new Map<string, Set<string>>()
        for (const [provider, chapters] of Object.entries(data?.queued ?? {})) {
            result.set(provider, new Set(chapters.map(chapter => chapter.chapterId)))
        }
        return result
    }, [data])

    const isChapterLocal = React.useCallback((chapter: HibikeManga_ChapterDetails | undefined) => {
        if (!chapter) return false
        return chapter.provider === "local-manga"
    }, [])

    const isChapterDownloaded = React.useCallback((chapter: HibikeManga_ChapterDetails | undefined) => {
        if (!chapter) return false
        return downloadedByProvider.get(chapter.provider)?.has(chapter.id) ?? false
    }, [downloadedByProvider])

    const isChapterQueued = React.useCallback((chapter: HibikeManga_ChapterDetails | undefined) => {
        if (!chapter) return false
        return queuedByProvider.get(chapter.provider)?.has(chapter.id) ?? false
    }, [queuedByProvider])

    const getProviderNumberOfDownloadedChapters = React.useCallback((provider: string) => {
        return downloadedByProvider.get(provider)?.size ?? 0
    }, [downloadedByProvider])
    return {
        isChapterDownloaded,
        isChapterQueued,
        getProviderNumberOfDownloadedChapters,
        showActionButtons: !loading,
        isChapterLocal,
    }

}

export function useMangaChapterListRowSelection() {

    const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

    const [selectedChapters, setSelectedChapters] = React.useState<HibikeManga_ChapterDetails[]>([])

    const onSelectChange = React.useCallback((event: DataGridRowSelectedEvent<HibikeManga_ChapterDetails>) => {
        setSelectedChapters(event.data)
    }, [])
    return {
        rowSelection, setRowSelection,
        rowSelectedChapters: selectedChapters,
        onRowSelectionChange: onSelectChange,
        resetRowSelection: () => {
            setRowSelection({})
            setSelectedChapters([])
        },
    }
}
