"use client"
import React from "react"
import { useAnimeTheme } from "@/lib/theme/anime-themes/anime-theme-provider"
import { WALLHAVEN_CURATED_QUERY } from "@/lib/theme/anime-themes/wallhaven-curated"
import {
    useDownloadThemeBackground,
    useSearchWallhaven,
    type WallhavenWallpaper,
} from "@/api/hooks/theme_backgrounds.hooks"
import { cn } from "@/components/ui/core/styling"

type Props = {
    open: boolean
    onClose: () => void
}

export function WallhavenPickerModal({ open, onClose }: Props) {
    const { themeId, config, setActiveBackgroundUrl } = useAnimeTheme()
    const [query, setQuery] = React.useState("")
    const [committedQuery, setCommittedQuery] = React.useState("")
    const [page, setPage] = React.useState(1)
    const [searchEnabled, setSearchEnabled] = React.useState(false)
    const [wallpapers, setWallpapers] = React.useState<WallhavenWallpaper[]>([])
    const [downloadingId, setDownloadingId] = React.useState<string | null>(null)
    const downloadMutation = useDownloadThemeBackground()
    const inputRef = React.useRef<HTMLInputElement>(null)

    // When the modal opens: seed the query from curated map and auto-search.
    React.useEffect(() => {
        if (!open) return
        const curatedQ = WALLHAVEN_CURATED_QUERY[themeId] ?? "anime landscape wallpaper"
        setQuery(curatedQ)
        setCommittedQuery(curatedQ)
        setPage(1)
        setWallpapers([])
        setSearchEnabled(true)
        setTimeout(() => inputRef.current?.focus(), 50)
    }, [open, themeId])

    const { data: searchResults, isFetching } = useSearchWallhaven(committedQuery, page, searchEnabled && open)

    // Merge results: replace on page 1, append on load-more pages.
    const prevResultsRef = React.useRef<typeof searchResults>(undefined)
    React.useEffect(() => {
        if (!searchResults?.data || searchResults === prevResultsRef.current) return
        prevResultsRef.current = searchResults
        setWallpapers(prev => page === 1 ? searchResults.data : [...prev, ...searchResults.data])
    }, [searchResults, page])

    const handleSearch = () => {
        if (!query.trim()) return
        setPage(1)
        setWallpapers([])
        setCommittedQuery(query.trim())
        setSearchEnabled(true)
    }

    const handleDownload = async (w: WallhavenWallpaper) => {
        if (downloadingId) return
        setDownloadingId(w.id)
        try {
            const result = await downloadMutation.mutateAsync({ url: w.path })
            if (result) {
                setActiveBackgroundUrl(result.url)
                onClose()
            }
        } catch { /* error handled by mutation hook */ } finally {
            setDownloadingId(null)
        }
    }

    const canLoadMore = !isFetching &&
        searchResults?.meta &&
        searchResults.meta.current_page < searchResults.meta.last_page

    if (!open) return null

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/85 backdrop-blur-lg"
                onClick={onClose}
            />

            {/* Modal container */}
            <div className="relative z-10 w-full max-w-5xl flex flex-col rounded-2xl border border-white/10 bg-[--background] shadow-2xl overflow-hidden"
                style={{ maxHeight: "88vh" }}>

                {/* Header */}
                <div
                    className="flex items-center gap-4 px-6 py-4 border-b border-white/10 shrink-0"
                    style={{
                        background: `linear-gradient(135deg, color-mix(in srgb, ${config.cssVars?.["--color-brand-950"] ?? "#111"} 90%, transparent), color-mix(in srgb, ${config.cssVars?.["--color-brand-900"] ?? "#1a1a1a"} 80%, transparent))`,
                    }}
                >
                    <div className="flex flex-col flex-1 min-w-0">
                        <h2 className="text-xl font-bold tracking-tight"
                            style={{ fontFamily: config.fontFamily }}>
                            Wallhaven Browser
                        </h2>
                        <p className="text-xs text-[--muted] mt-0.5">High-quality SFW anime wallpapers — click to download &amp; apply</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[--muted]">
                        {searchResults?.meta && (
                            <span className="hidden sm:inline">
                                {searchResults.meta.total.toLocaleString()} results
                            </span>
                        )}
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/15 transition-colors text-white/70 hover:text-white"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Search bar */}
                <div className="flex gap-2 px-4 py-3 bg-[--paper] border-b border-white/10 shrink-0">
                    <div className="flex-1 relative">
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleSearch()}
                            className="w-full h-9 pl-4 pr-4 rounded-lg bg-[--background] border border-white/10 focus:border-[--color-brand-500] outline-none text-sm text-[--foreground] placeholder:text-[--muted] transition-colors"
                            placeholder="Search Wallhaven…"
                        />
                    </div>
                    <button
                        onClick={handleSearch}
                        disabled={isFetching || !query.trim()}
                        className={cn(
                            "h-9 px-5 rounded-lg text-sm font-semibold transition-all",
                            "bg-[--color-brand-600] hover:bg-[--color-brand-500] text-white",
                            "disabled:opacity-40 disabled:cursor-not-allowed",
                        )}
                    >
                        {isFetching && page === 1 ? "Searching…" : "Search"}
                    </button>
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {isFetching && wallpapers.length === 0 ? (
                        /* Skeleton grid */
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {Array.from({ length: 9 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="aspect-video rounded-xl bg-white/5 animate-pulse"
                                />
                            ))}
                        </div>
                    ) : wallpapers.length === 0 && !isFetching ? (
                        <div className="flex flex-col items-center justify-center py-20 text-[--muted] gap-3">
                            <div className="text-4xl opacity-30">🖼</div>
                            <p className="text-sm">No results. Try a different search.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {wallpapers.map(w => (
                                <WallpaperCard
                                    key={w.id}
                                    wallpaper={w}
                                    downloading={downloadingId === w.id}
                                    anyDownloading={!!downloadingId}
                                    onDownload={handleDownload}
                                />
                            ))}
                        </div>
                    )}

                    {/* Load more */}
                    {canLoadMore && (
                        <div className="flex justify-center pt-2 pb-2">
                            <button
                                onClick={() => setPage(p => p + 1)}
                                className="px-6 py-2 rounded-full text-sm font-medium bg-[--paper] border border-white/10 hover:bg-white/10 hover:border-[--color-brand-500] text-[--foreground] transition-all"
                            >
                                Load more
                            </button>
                        </div>
                    )}

                    {isFetching && wallpapers.length > 0 && (
                        <div className="flex justify-center py-4">
                            <div className="w-5 h-5 rounded-full border-2 border-[--color-brand-500] border-t-transparent animate-spin" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function WallpaperCard({
    wallpaper,
    downloading,
    anyDownloading,
    onDownload,
}: {
    wallpaper: WallhavenWallpaper
    downloading: boolean
    anyDownloading: boolean
    onDownload: (w: WallhavenWallpaper) => void
}) {
    const [imgLoaded, setImgLoaded] = React.useState(false)

    return (
        <div className="group relative aspect-video rounded-xl overflow-hidden border border-white/10 bg-[--paper] cursor-pointer"
            onClick={() => !anyDownloading && onDownload(wallpaper)}
        >
            {/* Skeleton */}
            {!imgLoaded && (
                <div className="absolute inset-0 bg-white/5 animate-pulse" />
            )}

            <img
                src={wallpaper.thumbs.large}
                alt={wallpaper.resolution}
                loading="lazy"
                onLoad={() => setImgLoaded(true)}
                className={cn(
                    "w-full h-full object-cover transition-all duration-300",
                    "group-hover:scale-105",
                    !imgLoaded && "opacity-0",
                )}
            />

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

            {/* Resolution badge */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[10px] font-medium bg-black/70 text-white/90 px-1.5 py-0.5 rounded-md backdrop-blur-sm">
                    {wallpaper.resolution}
                </span>
            </div>

            {/* Download button */}
            <div className="absolute inset-x-0 bottom-0 p-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {downloading ? (
                    <div className="w-full py-1.5 flex items-center justify-center gap-2 bg-[--color-brand-600]/90 backdrop-blur-sm text-white rounded-lg text-xs font-semibold">
                        <div className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        Downloading…
                    </div>
                ) : (
                    <div className={cn(
                        "w-full py-1.5 flex items-center justify-center gap-1.5 backdrop-blur-sm text-white rounded-lg text-xs font-semibold transition-colors",
                        anyDownloading ? "bg-white/20 cursor-not-allowed" : "bg-[--color-brand-600]/90 hover:bg-[--color-brand-500]/90",
                    )}>
                        ↓ Download &amp; Apply
                    </div>
                )}
            </div>
        </div>
    )
}
