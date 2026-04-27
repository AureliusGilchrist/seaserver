"use client"
import React from "react"
import { ANIME_THEMES } from "@/lib/theme/anime-themes"
import type { AnimeThemeId } from "@/lib/theme/anime-themes"
import { WALLHAVEN_CURATED_QUERY } from "@/lib/theme/anime-themes/wallhaven-curated"
import {
    useSearchWallhaven,
    useDownloadThemeBackground,
    useListThemeBackgrounds,
    type WallhavenWallpaper,
} from "@/api/hooks/theme_backgrounds.hooks"
import { useAnimeTheme } from "@/lib/theme/anime-themes/anime-theme-provider"
import { cn } from "@/components/ui/core/styling"
import {
    LuDownload,
    LuSearch,
    LuX,
    LuCheck,
    LuChevronDown,
    LuChevronRight,
    LuImage,
    LuLayoutGrid,
} from "react-icons/lu"

// ── Category definitions ──────────────────────────────────────────────────────

export const WALLPAPER_SHOP_CATEGORIES: { id: string; label: string; themeIds: AnimeThemeId[] }[] = [
    {
        id: "shonen",
        label: "Shonen / Action",
        themeIds: [
            "naruto", "bleach", "one-piece", "dragon-ball-z", "attack-on-titan",
            "my-hero-academia", "demon-slayer", "jujutsu-kaisen", "fullmetal-alchemist",
            "hunter-x-hunter", "black-clover", "fairy-tail", "fire-force", "chainsaw-man",
            "seven-deadly-sins", "akame-ga-kill", "blue-lock", "kaiju-8", "wind-breaker",
            "sakamoto-days", "one-punch-man", "mob-psycho-100", "dandadan", "frieren",
        ],
    },
    {
        id: "isekai",
        label: "Isekai / Fantasy",
        themeIds: [
            "re-zero", "konosuba", "mushoku-tensei", "slime-isekai", "overlord",
            "sword-art-online", "danmachi", "no-game-no-life", "log-horizon", "grimgar",
            "the-rising-of-the-shield-hero", "death-march", "greatest-demon-lord",
            "the-eminence-in-shadow", "arifureta", "shangri-la-frontier",
            "my-next-life-villainess", "dungeon-meshi", "little-witch-academia",
            "ancient-magus-bride", "mahouka", "date-a-live", "infinite-stratos",
        ],
    },
    {
        id: "romance",
        label: "Romance / Slice of Life",
        themeIds: [
            "your-name", "violet-evergarden", "toradora", "spy-x-family", "bocchi-the-rock",
            "kimi-ni-todoke", "nisekoi", "horimiya", "your-lie-in-april", "anohana",
            "clannad", "ore-monogatari", "ao-haru-ride", "maid-sama", "shikimori",
            "takagi-san", "nagatoro", "blue-box", "plastic-memories", "honey-and-clover",
            "golden-time", "kaguya-sama", "quintessential-quintuplets", "wotakoi",
            "my-dress-up-darling", "chobits", "k-on", "yuru-camp",
        ],
    },
    {
        id: "mecha",
        label: "Mecha / Sci-Fi",
        themeIds: [
            "evangelion", "steins-gate", "cowboy-bebop", "psycho-pass", "ghost-in-the-shell",
            "gundam", "code-geass", "macross", "gurren-lagann", "dr-stone", "accel-world",
            "eureka-seven", "patlabor", "re-creators", "metallic-rouge",
        ],
    },
    {
        id: "dark",
        label: "Dark / Seinen",
        themeIds: [
            "berserk", "vinland-saga", "made-in-abyss", "parasyte", "death-note",
            "tokyo-ghoul", "serial-experiments-lain", "higurashi", "another", "elfen-lied",
            "hellsing", "vagabond", "monster", "goodnight-punpun", "junji-ito", "uzumaki",
            "gantz", "akira", "texhnolyze", "banana-fish", "91-days", "rainbow-manga",
            "blade-of-the-immortal", "homunculus",
        ],
    },
    {
        id: "sports",
        label: "Sports",
        themeIds: [
            "haikyuu", "slam-dunk", "yuri-on-ice", "free", "eyeshield-21",
            "prince-of-tennis", "captain-tsubasa", "hajime-no-ippo", "chihayafuru",
            "run-with-the-wind", "ping-pong-animation", "major", "cross-game",
            "kuroko-no-basuke", "yowamushi-pedal", "grand-blue", "touch-baseball",
        ],
    },
    {
        id: "classic",
        label: "Classic",
        themeIds: [
            "sailor-moon", "cardcaptor-sakura", "inuyasha", "dragon-ball", "fist-of-the-north-star",
            "rurouni-kenshin", "yuyu-hakusho", "galaxy-express-999", "saint-seiya",
            "initial-d", "ranma-12", "samurai-champloo", "trigun", "outlaw-star",
            "great-teacher-onizuka", "city-hunter", "maison-ikkoku", "dr-slump",
            "mazinger-z", "space-battleship-yamato", "lupin-iii", "flcl",
            "haruhi-suzumiya", "lucky-star", "azumanga-daioh",
        ],
    },
    {
        id: "manga",
        label: "Manga / Originals",
        themeIds: [
            "solo-leveling", "tower-of-god", "kingdom", "blame", "battle-angel-alita",
            "pluto", "blue-period", "20th-century-boys", "berserk-of-gluttony",
            "omniscient-reader", "tokyo-revengers", "jojo-bizarre-adventure",
            "baki", "kengan-ashura", "wolf-children", "summer-wars",
            "your-name", "a-silent-voice", "suzume", "weathering-with-you",
        ],
    },
]

// ── Single wallpaper card ─────────────────────────────────────────────────────

function WallpaperCard({
    wallpaper,
    isDownloaded,
    isActive,
    isDownloading,
    onDownload,
    onApply,
}: {
    wallpaper: WallhavenWallpaper
    isDownloaded: boolean
    isActive: boolean
    isDownloading: boolean
    onDownload: () => void
    onApply: () => void
}) {
    const [imgLoaded, setImgLoaded] = React.useState(false)

    return (
        <div
            className={cn(
                "relative group shrink-0 rounded-xl overflow-hidden border-2 transition-all duration-150",
                isActive
                    ? "border-[--color-brand-400] shadow-[0_0_12px_2px_rgba(0,0,0,0.5)]"
                    : "border-transparent hover:border-white/30",
            )}
            style={{ width: 140, height: 88 }}
        >
            {!imgLoaded && <div className="absolute inset-0 bg-white/5 animate-pulse" />}
            <img
                src={wallpaper.thumbs.small}
                alt={wallpaper.id}
                loading="lazy"
                onLoad={() => setImgLoaded(true)}
                className={cn("w-full h-full object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
            />

            {/* Active checkmark */}
            {isActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="w-7 h-7 rounded-full bg-[--color-brand-500]/90 flex items-center justify-center shadow-lg">
                        <LuCheck className="w-3.5 h-3.5 text-white" />
                    </div>
                </div>
            )}

            {/* Resolution badge */}
            <div className="absolute bottom-1 left-1 bg-black/60 text-white/60 text-[9px] px-1 rounded leading-tight backdrop-blur-sm">
                {wallpaper.resolution}
            </div>

            {/* Downloaded badge */}
            {isDownloaded && !isActive && (
                <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-green-500/90 flex items-center justify-center">
                    <LuCheck className="w-2.5 h-2.5 text-white" />
                </div>
            )}

            {/* Hover actions */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {!isDownloaded && !isDownloading && (
                    <button
                        onClick={onDownload}
                        title="Download"
                        className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors backdrop-blur-sm"
                    >
                        <LuDownload className="w-3.5 h-3.5 text-white" />
                    </button>
                )}
                {isDownloading && (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {isDownloaded && (
                    <button
                        onClick={onApply}
                        title="Set as background"
                        className="w-8 h-8 rounded-full bg-[--color-brand-500]/80 hover:bg-[--color-brand-400] flex items-center justify-center transition-colors backdrop-blur-sm"
                    >
                        <LuImage className="w-3.5 h-3.5 text-white" />
                    </button>
                )}
            </div>
        </div>
    )
}

// ── Per-theme lazy wallpaper row ──────────────────────────────────────────────

function ThemeWallpaperRow({
    themeId,
    downloadedIdMap,
    activeBackgroundUrl,
    onApply,
    defaultOpen,
}: {
    themeId: AnimeThemeId
    downloadedIdMap: Map<string, string>
    activeBackgroundUrl: string | null
    onApply: (url: string) => void
    defaultOpen?: boolean
}) {
    const [open, setOpen] = React.useState(defaultOpen ?? false)
    const [downloadingIds, setDownloadingIds] = React.useState<Set<string>>(new Set())
    const [batchProgress, setBatchProgress] = React.useState<{ done: number; total: number } | null>(null)

    const theme = ANIME_THEMES[themeId]
    const query = WALLHAVEN_CURATED_QUERY[themeId]

    const { data, isFetching, isError } = useSearchWallhaven(query, 1, open && !!query)
    const wallpapers: WallhavenWallpaper[] = data?.data?.slice(0, 10) ?? []

    const downloadMutation = useDownloadThemeBackground()

    const isDownloaded = (w: WallhavenWallpaper) => downloadedIdMap.has(w.id)
    const localUrl = (w: WallhavenWallpaper) => downloadedIdMap.get(w.id) ?? null

    const handleDownload = async (w: WallhavenWallpaper) => {
        setDownloadingIds(prev => new Set(prev).add(w.id))
        try {
            const result = await downloadMutation.mutateAsync({ url: w.path })
            if (result) onApply(result.url)
        } catch { /* ignored */ } finally {
            setDownloadingIds(prev => { const s = new Set(prev); s.delete(w.id); return s })
        }
    }

    const handleBatchDownload = async () => {
        if (!wallpapers.length) return
        const toDownload = wallpapers.filter(w => !isDownloaded(w))
        if (!toDownload.length) return
        setBatchProgress({ done: 0, total: toDownload.length })
        for (let i = 0; i < toDownload.length; i++) {
            const w = toDownload[i]
            setDownloadingIds(prev => new Set(prev).add(w.id))
            try {
                await downloadMutation.mutateAsync({ url: w.path })
            } catch { /* ignored */ } finally {
                setDownloadingIds(prev => { const s = new Set(prev); s.delete(w.id); return s })
                setBatchProgress(prev => prev ? { ...prev, done: i + 1 } : null)
            }
        }
        setBatchProgress(null)
    }

    const downloadedCount = wallpapers.filter(w => isDownloaded(w)).length

    return (
        <div className="border border-[--border] rounded-xl overflow-hidden">
            {/* Row header */}
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
            >
                {open ? <LuChevronDown className="w-3.5 h-3.5 text-[--muted] shrink-0" /> : <LuChevronRight className="w-3.5 h-3.5 text-[--muted] shrink-0" />}
                <span
                    className="font-semibold text-sm"
                    style={{ fontFamily: theme?.fontFamily }}
                >
                    {theme?.displayName ?? themeId}
                </span>
                {/* Color swatches */}
                {theme && (
                    <div className="flex gap-1 ml-1">
                        {[theme.previewColors.primary, theme.previewColors.secondary, theme.previewColors.accent].map((c, i) => (
                            <div key={i} className="w-3 h-3 rounded-full border border-white/10" style={{ background: c }} />
                        ))}
                    </div>
                )}
                {open && wallpapers.length > 0 && (
                    <span className="text-xs text-[--muted] ml-auto">
                        {downloadedCount}/{wallpapers.length} downloaded
                    </span>
                )}
            </button>

            {/* Wallpaper strip */}
            {open && (
                <div className="border-t border-[--border] bg-[--background]/60 p-3 space-y-3">
                    {isFetching && wallpapers.length === 0 && (
                        <div className="flex gap-2">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="shrink-0 rounded-xl bg-white/5 animate-pulse" style={{ width: 140, height: 88 }} />
                            ))}
                        </div>
                    )}
                    {isError && (
                        <p className="text-xs text-red-400 py-2">Could not load wallpapers — check your connection and try again.</p>
                    )}
                    {!isFetching && !isError && wallpapers.length === 0 && !query && (
                        <p className="text-xs text-[--muted] py-2">No search query configured for this theme.</p>
                    )}
                    {!isFetching && !isError && wallpapers.length === 0 && !!query && (
                        <p className="text-xs text-[--muted] py-2">No wallpapers found for this theme.</p>
                    )}
                    {wallpapers.length > 0 && (
                        <>
                            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
                                {wallpapers.map(w => (
                                    <WallpaperCard
                                        key={w.id}
                                        wallpaper={w}
                                        isDownloaded={isDownloaded(w)}
                                        isActive={activeBackgroundUrl !== null && (activeBackgroundUrl === localUrl(w) || !!activeBackgroundUrl?.includes(w.id))}
                                        isDownloading={downloadingIds.has(w.id)}
                                        onDownload={() => handleDownload(w)}
                                        onApply={() => {
                                            const url = localUrl(w)
                                            if (url) onApply(url)
                                        }}
                                    />
                                ))}
                            </div>

                            {/* Batch download bar */}
                            <div className="flex items-center gap-3">
                                {batchProgress ? (
                                    <div className="flex items-center gap-2 text-xs text-[--muted]">
                                        <div className="w-3 h-3 border-2 border-[--muted] border-t-[--color-brand-400] rounded-full animate-spin" />
                                        Downloading {batchProgress.done}/{batchProgress.total}…
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleBatchDownload}
                                        disabled={downloadedCount === wallpapers.length}
                                        className={cn(
                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                                            downloadedCount === wallpapers.length
                                                ? "text-[--muted] bg-white/5 cursor-default"
                                                : "bg-[--color-brand-700] hover:bg-[--color-brand-600] text-white",
                                        )}
                                    >
                                        <LuDownload className="w-3 h-3" />
                                        {downloadedCount === wallpapers.length ? "All downloaded" : `Download all ${wallpapers.length - downloadedCount} remaining`}
                                    </button>
                                )}
                                <span className="text-[10px] text-[--muted]">{wallpapers.length} wallpapers · Wallhaven</span>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Main WallpaperShop component ──────────────────────────────────────────────

/** Extract the Wallhaven wallpaper ID from either a CDN URL or a local /theme-bg/ URL. */
function extractWallhavenId(url: string): string {
    // CDN URL: https://w.wallhaven.cc/full/ab/wallhaven-abc123.jpg  → "abc123"
    const cdnMatch = url.match(/wallhaven-([a-zA-Z0-9]+)\.[a-z]+$/)
    if (cdnMatch) return cdnMatch[1]
    // Local URL: /theme-bg/wh-abc123.jpg  → "abc123"
    const localMatch = url.match(/\/wh-([a-zA-Z0-9]+)\.[a-z]+$/)
    if (localMatch) return localMatch[1]
    return url // fallback: use full URL as key
}

export function WallpaperShop() {
    const { activeBackgroundUrl, setActiveBackgroundUrl, themeId } = useAnimeTheme()
    const { data: downloadedBgs } = useListThemeBackgrounds()

    // Map from wallhaven ID → local URL (for matching and applying downloaded wallpapers)
    const downloadedIdMap = React.useMemo(() => {
        const m = new Map<string, string>()
        if (downloadedBgs) downloadedBgs.forEach(bg => {
            const id = extractWallhavenId(bg.url)
            m.set(id, bg.url)
        })
        return m
    }, [downloadedBgs])

    // Keep Set<localUrl> for backward compat
    const downloadedUrls = React.useMemo(() => new Set(downloadedIdMap.values()), [downloadedIdMap])

    const [selectedCategory, setSelectedCategory] = React.useState("shonen")
    const [search, setSearch] = React.useState("")

    const category = WALLPAPER_SHOP_CATEGORIES.find(c => c.id === selectedCategory)!

    const filteredThemeIds = React.useMemo(() => {
        if (!search.trim()) return category.themeIds
        const q = search.toLowerCase()
        return category.themeIds.filter(id => {
            const theme = ANIME_THEMES[id]
            return theme?.displayName.toLowerCase().includes(q) || id.includes(q)
        })
    }, [category, search])

    // Find the category containing the active theme
    const activeThemeCategory = React.useMemo(() => {
        for (const cat of WALLPAPER_SHOP_CATEGORIES) {
            if (cat.themeIds.includes(themeId as AnimeThemeId)) return cat.id
        }
        return null
    }, [themeId])

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3 flex-wrap">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                    <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[--muted] pointer-events-none" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search themes…"
                        className="w-full pl-8 pr-8 py-2 rounded-xl bg-[--background] border border-[--border] text-sm text-[--foreground] placeholder:text-[--muted] focus:outline-none focus:border-[--color-brand-500] transition-colors"
                    />
                    {search && (
                        <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[--muted] hover:text-[--foreground]">
                            <LuX className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* Active theme shortcut */}
                {activeThemeCategory && themeId !== "seanime" && (
                    <button
                        onClick={() => setSelectedCategory(activeThemeCategory)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[--color-brand-700]/40 hover:bg-[--color-brand-700]/60 text-[--color-brand-300] border border-[--color-brand-700]/40 transition-colors"
                    >
                        <LuLayoutGrid className="w-3 h-3" />
                        Jump to active theme
                    </button>
                )}
            </div>

            {/* Category tabs */}
            <div className="flex gap-1.5 flex-wrap">
                {WALLPAPER_SHOP_CATEGORIES.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className={cn(
                            "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                            selectedCategory === cat.id
                                ? "border-[--color-brand-500] bg-[--color-brand-900]/40 text-[--color-brand-300]"
                                : "border-[--border] text-[--muted] hover:border-[--color-brand-700] hover:text-[--foreground]",
                        )}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Theme rows */}
            <div className="space-y-2">
                {filteredThemeIds.length === 0 && (
                    <p className="text-sm text-[--muted] text-center py-8">No themes match your search.</p>
                )}
                {filteredThemeIds.map(id => (
                    <ThemeWallpaperRow
                        key={id}
                        themeId={id}
                        downloadedIdMap={downloadedIdMap}
                        activeBackgroundUrl={activeBackgroundUrl}
                        onApply={url => setActiveBackgroundUrl(url)}
                        defaultOpen={id === themeId}
                    />
                ))}
            </div>

            {/* Footer info */}
            <p className="text-[10px] text-[--muted] text-center pt-2">
                Wallpapers sourced from Wallhaven.cc · All rights belong to their respective creators
            </p>
        </div>
    )
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────

export function WallpaperShopModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    if (!open) return null
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-10 w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl bg-[--background] border border-[--border] shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[--border] shrink-0">
                    <div className="flex items-center gap-3">
                        <LuImage className="w-5 h-5 text-[--color-brand-400]" />
                        <h2 className="text-lg font-bold">Wallpaper Shop</h2>
                        <span className="text-sm text-[--muted]">Browse & download themed wallpapers</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-[--muted] hover:text-[--foreground] hover:bg-white/5 transition-colors"
                    >
                        <LuX className="w-4 h-4" />
                    </button>
                </div>
                {/* Content */}
                <div className="overflow-y-auto p-6" style={{ scrollbarWidth: "thin" }}>
                    <WallpaperShop />
                </div>
            </div>
        </div>
    )
}
