import { Anime_Entry, Anime_EntryDownloadInfo, Torrent_SearchData } from "@/api/generated/types"
import { useAnimeListTorrentProviderExtensions } from "@/api/hooks/extensions.hooks"
import { useSearchTorrent } from "@/api/hooks/torrent_search.hooks"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { __torrentSearch_selectedTorrentsAtom } from "@/app/(main)/entry/_containers/torrent-search/torrent-search-container"
import { __torrentSearch_selectionEpisodeAtom, TorrentSelectionType } from "@/app/(main)/entry/_containers/torrent-search/torrent-search-drawer"
import { useDebounceWithTrigger } from "@/hooks/use-debounce"
import { logger } from "@/lib/helpers/debug"
import { TORRENT_PROVIDER } from "@/lib/server/settings"
import { useAtom } from "jotai/react"
import { atomWithStorage } from "jotai/utils"
import React, { startTransition } from "react"

type TorrentSearchHookProps = {
    hasEpisodesToDownload: boolean
    shouldLookForBatches: boolean
    downloadInfo: Anime_EntryDownloadInfo | undefined
    entry: Anime_Entry | undefined
    isAdult: boolean
    type: TorrentSelectionType
    /**
     * Results already fetched for this anime, along with the settings that produced them.
     *
     * Enqueue Future prepares these on the server in advance, which is the whole point of the
     * queue: opening an anime should not mean waiting for a search that was already run. They are
     * used only while the search below is still asking the same question — change the provider or
     * any filter and the search happens live, exactly as it would anywhere else.
     */
    snapshot?: TorrentSearchSnapshot
}

export type TorrentSearchSnapshot = {
    params: {
        type: string
        provider: string
        query: string
        episodeNumber: number
        batch: boolean
        absoluteOffset: number
        resolution: string
        bestRelease: boolean
    }
    data: Torrent_SearchData
    preparedAt?: number
}

export const enum Torrent_SearchType {
    SMART = "smart",
    SIMPLE = "simple",
}

export const __torrentSearch_searchAcrossProvidersAtom = atomWithStorage("sea-torrent-search-across-providers", false, undefined, { getOnInit: true })
export const __torrentSearch_extraProviderIdsAtom = atomWithStorage<string[]>("sea-torrent-search-extra-provider-ids",
    [],
    undefined,
    { getOnInit: true })

export function useHandleTorrentSearch(props: TorrentSearchHookProps) {

    const {
        hasEpisodesToDownload,
        shouldLookForBatches,
        downloadInfo,
        entry,
        isAdult,
        snapshot,
    } = props

    const serverStatus = useServerStatus()

    const { data: providerExtensions } = useAnimeListTorrentProviderExtensions()

    // Get the selected provider extension
    const defaultProviderExtension = React.useMemo(() => {
        if (serverStatus?.settings?.library?.torrentProvider === TORRENT_PROVIDER.NONE) {
            return undefined
        }

        const defaultExt = providerExtensions?.find(ext => ext.id === serverStatus?.settings?.library?.torrentProvider)
        if (!defaultExt) {
            return providerExtensions?.[0]
        }
        return defaultExt
    }, [serverStatus?.settings?.library?.torrentProvider, providerExtensions])

    // Gives the ability to change the selected provider extension
    const [selectedProviderExtensionId, setSelectedProviderExtensionId] = React.useState(defaultProviderExtension?.id || "none")

    // Update the selected provider only when the default provider changes
    React.useLayoutEffect(() => {
        setSelectedProviderExtensionId(defaultProviderExtension?.id || "none")
    }, [defaultProviderExtension?.id])

    // Get the selected provider extension
    const selectedProviderExtension = React.useMemo(() => {
        return providerExtensions?.find(ext => ext.id === selectedProviderExtensionId)
    }, [selectedProviderExtensionId, providerExtensions])

    const [soughtEpisode, setSoughtEpisode] = useAtom(__torrentSearch_selectionEpisodeAtom)

    // Smart search is not enabled for adult content
    const [searchType, setSearchType] = React.useState(!isAdult ? Torrent_SearchType.SMART : Torrent_SearchType.SIMPLE)

    const {
        value: globalFilter,
        debouncedValue: debouncedGlobalFilter,
        setValue: setGlobalFilter,
        triggerImmediate: triggerImmediateSearch,
    } = useDebounceWithTrigger(hasEpisodesToDownload ? "" : (entry?.media?.title?.romaji || ""), 500)
    const [selectedTorrents, setSelectedTorrents] = useAtom(__torrentSearch_selectedTorrentsAtom)
    const [searchAcrossProviders, setSearchAcrossProviders] = useAtom(__torrentSearch_searchAcrossProvidersAtom)
    const [extraProviderIds, setExtraProviderIds] = useAtom(__torrentSearch_extraProviderIdsAtom)
    const [smartSearchBatch, setSmartSearchBatch] = React.useState<boolean>(shouldLookForBatches || false)

    // Follow the entry, not just the first render.
    //
    // The state above is seeded once, which is right for a drawer opened over one anime and wrong
    // for the Enqueue Future queue, where the same component walks a hundred of them without
    // unmounting: the second anime would inherit whatever the first one's status implied, and an
    // airing show followed by a finished one opened in episode mode with no way to tell why. Keyed
    // on the media id so this only fires when the anime actually changes — flipping the switch by
    // hand within one anime is left alone.
    const lastSeededMediaId = React.useRef(entry?.media?.id)
    React.useLayoutEffect(() => {
        if (lastSeededMediaId.current === entry?.media?.id) return
        lastSeededMediaId.current = entry?.media?.id
        setSmartSearchBatch(shouldLookForBatches || false)
    }, [entry?.media?.id, shouldLookForBatches])
    // const [smartSearchEpisode, setSmartSearchEpisode] = React.useState<number>(downloadInfo?.episodesToDownload?.[0]?.episode?.episodeNumber || 1)
    const [smartSearchResolution, setSmartSearchResolution] = React.useState("")
    const [smartSearchBest, setSmartSearchBest] = React.useState(false)
    const {
        value: smartSearchEpisode,
        debouncedValue: debouncedSmartSearchEpisode,
        setValue: setSmartSearchEpisode,
        triggerImmediate: triggerImmediateEpisode,
    } = useDebounceWithTrigger(downloadInfo?.episodesToDownload?.[0]?.episode?.episodeNumber ?? 1, 500)

    const activeExtraProviderIds = React.useMemo(() => {
        const validProviderIds = new Set(providerExtensions?.map(ext => ext.id) ?? [])
        return extraProviderIds.filter((id, idx) => {
            return id !== selectedProviderExtensionId && validProviderIds.has(id) && extraProviderIds.indexOf(id) === idx
        })
    }, [extraProviderIds, providerExtensions, selectedProviderExtensionId])

    const searchProvider = React.useMemo(() => {
        if (!selectedProviderExtension?.id) return ""
        if (!searchAcrossProviders) return selectedProviderExtension.id
        return [selectedProviderExtension.id, ...activeExtraProviderIds].join(",")
    }, [activeExtraProviderIds, searchAcrossProviders, selectedProviderExtension?.id])

    const warnings = {
        noProvider: !selectedProviderExtension,
        extensionDoesNotSupportAdult: isAdult && selectedProviderExtension && !selectedProviderExtension?.settings?.supportsAdult,
        extensionDoesNotSupportSmartSearch: searchType === Torrent_SearchType.SMART && selectedProviderExtension && !selectedProviderExtension?.settings?.canSmartSearch,
        extensionDoesNotSupportBestRelease: smartSearchBest && selectedProviderExtension && !selectedProviderExtension?.settings?.smartSearchFilters?.includes(
            "bestReleases"),
        extensionDoesNotSupportBatchSearch: smartSearchBatch && selectedProviderExtension && !selectedProviderExtension?.settings?.smartSearchFilters?.includes(
            "batch"),
    }

    // Change fields when changing the selected provider - i.e. when [selectedProviderExtensionId] changes
    React.useLayoutEffect(() => {
        // If the selected provider supports smart search, enable it if it's not already enabled
        if (searchType === Torrent_SearchType.SIMPLE && selectedProviderExtension?.settings?.canSmartSearch) {
            setSearchType(Torrent_SearchType.SMART)
        }
    }, [searchType && warnings.extensionDoesNotSupportSmartSearch, selectedProviderExtension?.settings?.canSmartSearch, selectedProviderExtensionId])
    React.useLayoutEffect(() => {
        // If the selected provider does not support smart search, disable it
        if (searchType === Torrent_SearchType.SMART && warnings.extensionDoesNotSupportSmartSearch) {
            setSearchType(Torrent_SearchType.SIMPLE)
        }
    }, [warnings.extensionDoesNotSupportSmartSearch, selectedProviderExtensionId, searchType])
    React.useLayoutEffect(() => {
        // If the selected provider does not support best release, disable it
        if (smartSearchBest && warnings.extensionDoesNotSupportBestRelease) {
            setSmartSearchBest(false)
        }
    }, [warnings.extensionDoesNotSupportBestRelease, selectedProviderExtensionId, smartSearchBest])
    React.useLayoutEffect(() => {
        // If the selected provider does not support batch search, disable it
        if (smartSearchBatch && warnings.extensionDoesNotSupportBatchSearch) {
            setSmartSearchBatch(false)
        }
    }, [warnings.extensionDoesNotSupportBatchSearch, selectedProviderExtensionId, smartSearchBatch])

    React.useEffect(() => {
        console.log("globalFilter", globalFilter)
    }, [globalFilter])

    console.log("smartSearchResolution", smartSearchResolution)

    // What the search is currently asking for, reduced to the settings a snapshot records. Kept
    // separate from the request below so the comparison is against the same values that are sent.
    const activeSearchParams = React.useMemo(() => ({
        type: searchType as string,
        provider: searchProvider,
        query: debouncedGlobalFilter.trim().toLowerCase(),
        episodeNumber: smartSearchBatch ? 0 : debouncedSmartSearchEpisode,
        batch: smartSearchBatch,
        absoluteOffset: downloadInfo?.absoluteOffset || 0,
        resolution: smartSearchResolution,
        bestRelease: searchType === Torrent_SearchType.SMART && smartSearchBest,
    }), [searchType, searchProvider, debouncedGlobalFilter, smartSearchBatch, debouncedSmartSearchEpisode,
        downloadInfo?.absoluteOffset, smartSearchResolution, smartSearchBest])

    // Use the prepared results only while they still answer the question being asked. Touch the
    // provider selector or any filter and this goes undefined, so the search runs for real.
    const seed = React.useMemo(() => {
        if (!snapshot?.data) return undefined
        const p = snapshot.params
        const a = activeSearchParams
        const matches = p.type === a.type
            && p.provider === a.provider
            && p.query === a.query
            && p.episodeNumber === a.episodeNumber
            && p.batch === a.batch
            && p.absoluteOffset === a.absoluteOffset
            && p.resolution === a.resolution
            && p.bestRelease === a.bestRelease
        if (!matches) return undefined
        return { data: snapshot.data, preparedAt: snapshot.preparedAt }
    }, [snapshot, activeSearchParams])

    /**
     * Fetch torrent search data
     */
    const { data: _data, isLoading: _isLoading, isFetching: _isFetching, isError: _isError, refetch } = useSearchTorrent({
        query: debouncedGlobalFilter.trim().toLowerCase(),
        // A batch covers every episode, so don't narrow the search to one. Sending both made
        // providers build contradictory queries and return single episodes only.
        episodeNumber: smartSearchBatch ? 0 : debouncedSmartSearchEpisode,
            batch: smartSearchBatch,
            media: entry?.media,
            absoluteOffset: downloadInfo?.absoluteOffset || 0,
            resolution: smartSearchResolution,
            type: searchType,
        provider: searchProvider,
            bestRelease: searchType === Torrent_SearchType.SMART && smartSearchBest,
        },
        !(searchType === Torrent_SearchType.SIMPLE && debouncedGlobalFilter.length === 0) // If simple search, user input must not be empty
        && !warnings.noProvider
        && !warnings.extensionDoesNotSupportAdult
        && !warnings.extensionDoesNotSupportSmartSearch
        && !warnings.extensionDoesNotSupportBestRelease
        && !!providerExtensions, // Provider extensions must be loaded
        seed,
    )

    React.useLayoutEffect(() => {
        if (soughtEpisode !== undefined) {
            setSmartSearchEpisode(soughtEpisode)
            startTransition(() => {
                setSoughtEpisode(undefined)
            })
        }
    }, [soughtEpisode])

    // const data = React.useMemo(() => isAdult ? _nsfw_data : _data, [_data, _nsfw_data])
    // const isLoading = React.useMemo(() => isAdult ? _nsfw_isLoading : _isLoading, [_isLoading, _nsfw_isLoading])
    // const isFetching = React.useMemo(() => isAdult ? _nsfw_isFetching : _isFetching, [_isFetching, _nsfw_isFetching])

    React.useEffect(() => {
        logger("TORRENT SEARCH").info({ warnings })
    }, [warnings])
    React.useEffect(() => {
        logger("TORRENT SEARCH").info({ selectedProviderExtension })
    }, [warnings])
    React.useEffect(() => {
        logger("TORRENT SEARCH").info({
            globalFilter,
            searchType,
            smartSearchBatch,
            smartSearchEpisode,
            smartSearchResolution,
            smartSearchBest,
            debouncedSmartSearchEpisode,
            searchProvider,
        })
        },
        [globalFilter, searchType, smartSearchBatch, smartSearchEpisode, smartSearchResolution, smartSearchBest, debouncedSmartSearchEpisode,
            searchProvider])

    return {
        warnings,
        hasOneWarning: Object.values(warnings).some(w => w),
        providerExtensions,
        selectedProviderExtension,
        selectedProviderExtensionId,
        setSelectedProviderExtensionId,
        globalFilter,
        setGlobalFilter,
        debouncedGlobalFilter,
        triggerImmediateSearch,
        selectedTorrents,
        setSelectedTorrents,
        searchAcrossProviders,
        setSearchAcrossProviders,
        extraProviderIds,
        setExtraProviderIds,
        searchType,
        setSearchType,
        smartSearchBatch,
        setSmartSearchBatch,
        smartSearchEpisode,
        setSmartSearchEpisode,
        debouncedSmartSearchEpisode,
        triggerImmediateEpisode,
        smartSearchResolution,
        setSmartSearchResolution,
        smartSearchBest,
        setSmartSearchBest,
        soughtEpisode,
        data: _data,
        isLoading: _isLoading,
        isFetching: _isFetching,
        isError: _isError,
        refetch,
    }

}
