"use client"
import React from "react"
import { useAnimeTheme } from "@/lib/theme/anime-themes/anime-theme-provider"
import { WALLHAVEN_CURATED_QUERY } from "@/lib/theme/anime-themes/wallhaven-curated"
import {
    useDeleteThemeBackground,
    useDownloadThemeBackground,
    useListThemeBackgrounds,
    useSearchWallhaven,
    type WallhavenWallpaper,
} from "@/api/hooks/theme_backgrounds.hooks"
import { cn } from "@/components/ui/core/styling"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { toast } from "sonner"

type Props = {
    open: boolean
    onClose: () => void
}

export function WallhavenPickerModal({ open, onClose }: Props) {
    const { themeId, config, setActiveBackgroundUrl } = useAnimeTheme()
    const serverStatus = useServerStatus()
    const isAdmin = serverStatus?.currentProfile?.isAdmin ?? false

    const [query, setQuery] = React.useState("")
    const [committedQuery, setCommittedQuery] = React.useState("")
    const [page, setPage] = React.useState(1)
    const [searchEnabled, setSearchEnabled] = React.useState(false)
    const [wallpapers, setWallpapers] = React.useState<WallhavenWallpaper[]>([])
    const [downloadingId, setDownloadingId] = React.useState<string | null>(null)
    const [activeTab, setActiveTab] = React.useState<"browse" | "saved">("browse")

    const downloadMutation = useDownloadThemeBackground()
    const deleteMutation = useDeleteThemeBackground()
    const { data: listData, refetch: refetchList } = useListThemeBackgrounds()
    const inputRef = React.useRef<HTMLInputElement>(null)

    const userCount = listData?.userCount ?? 0
    const limit = listData?.limit ?? 5
    const savedFiles = listData?.files ?? []

    // When the modal opens: seed the query from curated map and auto-search.
    React.useEffect(() => {
        if (!open) return
        const curatedQ = WALLHAVEN_CURATED_QUERY[themeId] ?? "anime landscape wallpaper"
        setQuery(curatedQ)
        setCommittedQuery(curatedQ)
        setPage(1)
        setWallpapers([])
        setSearchEnabled(true)
        setActiveTab("browse")
        setTimeout(() => inputRef.current?.focus(), 50)
    }, [open, themeId])

    const { data: searchResults, isFetching } = useSearchWallhaven(committedQuery, page, searchEnabled && open)

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
        if (!isAdmin && userCount >= limit) {
            toast.error(`Download limit reached: you can only save ${limit} wallpapers`)
            return
        }
        setDownloadingId(w.id)
        try {
            const result = await downloadMutation.mutateAsync({ url: w.path })
            if (result) {
                setActiveBackgroundUrl(result.url)
                toast.success("Wallpaper downloaded and applied")
                onClose()
            }
        } catch {
            // error handled by mutation hook
        } finally {
            setDownloadingId(null)
        }
    }

    const handleDelete = async (filename: string) => {
        if (!isAdmin) return
        try {
            await deleteMutation.mutateAsync(filename)
            refetchList()
            toast.success("Wallpaper deleted")
        } catch {
            // handled by hook
        }
    }

    const handleApplySaved = (url: string) => {
        setActiveBackgroundUrl(url)
        toast.success("Wallpaper applied")
        onClose()
    }

    const canLoadMore = !isFetching &&
        searchResults?.meta &&
        searchResults.meta.current_page < searchResults.meta.last_page

    const atLimit = !isAdmin && userCount >= limit
    const nearLimit = !isAdmin && userCount === limit - 1

    if (!open) return null

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/85 backdrop-blur-lg" onClick={onClose} />

            <div
                className="relative z-10 w-full max-w-5xl flex flex-col rounded-2xl border border-white/10 bg-[--background] shadow-2xl overflow-hidden"
                style={{ maxHeight: "88vh" }}
            >
                {/* Header */}
                <div
                    className="flex items-center gap-4 px-6 py-4 border-b border-white/10 shrink-0"
                    style={{
                        background: `linear-gradient(135deg, color-mix(in srgb, ${config.cssVars?.["--color-brand-950"] ?? "#111"} 90%, transparent), color-mix(in srgb, ${config.cssVars?.["--color-brand-900"] ?? "#1a1a1a"} 80%, transparent))`,
                    }}
                >
                    <div className="flex flex-col flex-1 min-w-0">
                        <h2 className="text-xl font-bold tracking-tight" style={{ fontFamily: config.fontFamily }}>
                            Wallpaper Browser
                        </h2>
                        <p className="text-xs text-[--muted] mt-0.5">High-quality SFW anime wallpapers from Wallhaven</p>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Download counter */}
                        <div className={cn(
                            "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border",
                            atLimit
                                ? "bg-red-500/15 border-red-500/30 text-red-400"
                                : nearLimit
                                    ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                                    : "bg-white/5 border-white/10 text-[--muted]"
                        )}>
                            <span className="font-semibold">{userCount}/{isAdmin ? "∞" : limit}</span>
                            <span>saved</span>
                        </div>

                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/15 transition-colors text-white/70 hover:text-white"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 px-4 pt-3 pb-0 shrink-0 border-b border-white/10">
                    {(["browse", "saved"] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={cn(
                                "px-4 py-2 text-sm font-medium rounded-t-lg -mb-px border-b-2 transition-all capitalize",
                                activeTab === tab
                                    ? "text-white border-[--color-brand-500] bg-[--color-brand-500]/10"
                                    : "text-[--muted] border-transparent hover:text-white hover:border-white/20"
                            )}
                        >
                            {tab}
                            {tab === "saved" && savedFiles.length > 0 && (
                                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-white/10">
                                    {savedFiles.length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {activeTab === "browse" && (
                    <>
                        {/* Search bar */}
                        <div className="flex gap-2 px-4 py-3 bg-[--paper] shrink-0">
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

                        {/* Limit warning */}
                        {atLimit && (
                            <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 shrink-0">
                                You have reached your {limit} wallpaper limit. Delete a saved wallpaper to download more.
                            </div>
                        )}
                        {nearLimit && !atLimit && (
                            <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 shrink-0">
                                You can save {limit - userCount} more wallpaper before reaching your limit.
                            </div>
                        )}

                        {/* Grid */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {isFetching && wallpapers.length === 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {Array.from({ length: 9 }).map((_, i) => (
                                        <div key={i} className="aspect-video rounded-xl bg-white/5 animate-pulse" />
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
                                            atLimit={atLimit}
                                            onDownload={handleDownload}
                                        />
                                    ))}
                                </div>
                            )}

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
                    </>
                )}

                {activeTab === "saved" && (
                    <div className="flex-1 overflow-y-auto p-4">
                        {savedFiles.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-[--muted] gap-3">
                                <div className="text-4xl opacity-30">📁</div>
                                <p className="text-sm">No saved wallpapers yet. Browse to download some.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {savedFiles.map(file => (
                                    <SavedWallpaperCard
                                        key={file.filename}
                                        file={file}
                                        isAdmin={isAdmin}
                                        onApply={handleApplySaved}
                                        onDelete={handleDelete}
                                        deleting={deleteMutation.isPending}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

function WallpaperCard({
    wallpaper,
    downloading,
    anyDownloading,
    atLimit,
    onDownload,
}: {
    wallpaper: WallhavenWallpaper
    downloading: boolean
    anyDownloading: boolean
    atLimit: boolean
    onDownload: (w: WallhavenWallpaper) => void
}) {
    const [imgLoaded, setImgLoaded] = React.useState(false)
    const disabled = anyDownloading || atLimit

    return (
        <div
            className={cn(
                "group relative aspect-video rounded-xl overflow-hidden border border-white/10 bg-[--paper]",
                disabled ? "cursor-not-allowed" : "cursor-pointer"
            )}
            onClick={() => !disabled && onDownload(wallpaper)}
        >
            {!imgLoaded && <div className="absolute inset-0 bg-white/5 animate-pulse" />}

            <img
                src={wallpaper.thumbs.large}
                alt={wallpaper.resolution}
                loading="lazy"
                onLoad={() => setImgLoaded(true)}
                className={cn(
                    "w-full h-full object-cover transition-all duration-300",
                    "group-hover:scale-105",
                    !imgLoaded && "opacity-0",
                    disabled && "opacity-60",
                )}
            />

            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[10px] font-medium bg-black/70 text-white/90 px-1.5 py-0.5 rounded-md backdrop-blur-sm">
                    {wallpaper.resolution}
                </span>
            </div>

            <div className="absolute inset-x-0 bottom-0 p-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {downloading ? (
                    <div className="w-full py-1.5 flex items-center justify-center gap-2 bg-[--color-brand-600]/90 backdrop-blur-sm text-white rounded-lg text-xs font-semibold">
                        <div className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        Downloading…
                    </div>
                ) : atLimit ? (
                    <div className="w-full py-1.5 flex items-center justify-center backdrop-blur-sm text-red-400 bg-black/70 rounded-lg text-xs font-semibold">
                        Limit reached
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

function SavedWallpaperCard({
    file,
    isAdmin,
    onApply,
    onDelete,
    deleting,
}: {
    file: { filename: string; url: string; canDelete: boolean }
    isAdmin: boolean
    onApply: (url: string) => void
    onDelete: (filename: string) => void
    deleting: boolean
}) {
    const [imgLoaded, setImgLoaded] = React.useState(false)

    return (
        <div className="group relative aspect-video rounded-xl overflow-hidden border border-white/10 bg-[--paper]">
            {!imgLoaded && <div className="absolute inset-0 bg-white/5 animate-pulse" />}

            <img
                src={file.url}
                alt=""
                loading="lazy"
                onLoad={() => setImgLoaded(true)}
                className={cn("w-full h-full object-cover transition-all duration-300 group-hover:scale-105", !imgLoaded && "opacity-0")}
            />

            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

            <div className="absolute inset-x-0 bottom-0 p-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-1.5">
                <button
                    onClick={() => onApply(file.url)}
                    className="flex-1 py-1.5 text-xs font-semibold bg-[--color-brand-600]/90 hover:bg-[--color-brand-500]/90 backdrop-blur-sm text-white rounded-lg transition-colors"
                >
                    Apply
                </button>
                {isAdmin && (
                    <button
                        onClick={() => onDelete(file.filename)}
                        disabled={deleting}
                        className="py-1.5 px-2.5 text-xs font-semibold bg-red-600/80 hover:bg-red-500/90 backdrop-blur-sm text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                        🗑
                    </button>
                )}
            </div>
        </div>
    )
}
