"use client"
import React from "react"
import { useAnimeTheme, deriveBrandShades, wallpaperPreviewModeAtom } from "@/lib/theme/anime-themes/anime-theme-provider"
import { useSetAtom } from "jotai"
import { ANIME_THEMES, ANIME_THEME_LIST } from "@/lib/theme/anime-themes"
import type { AnimeThemeId, AnimeThemeConfig } from "@/lib/theme/anime-themes"
import {
    DEFAULT_CUSTOM_THEME_DATA,
    CUSTOM_THEME_FONT_OPTIONS,
    deriveBrandShadesFromHex,
    type CustomThemeData,
} from "@/lib/theme/anime-themes/custom-theme"
import { HIDDEN_THEMES, HIDDEN_THEME_IDS } from "@/lib/theme/anime-themes/hidden-themes"
import {
    THEME_PREREQUISITES,
    PREREQUISITE_THEME_IDS,
    loadActivatedThemes,
    isThemePrerequisiteMet,
} from "@/lib/theme/anime-themes/theme-prerequisites"
import { WALLHAVEN_CURATED_QUERY } from "@/lib/theme/anime-themes/wallhaven-curated"
import { LuSettings2, LuSparkles, LuSearch, LuX, LuPalette, LuCheck, LuDownload, LuImage, LuBookmark, LuStore, LuCloudDownload, LuTrash2, LuSlidersHorizontal } from "react-icons/lu"
import { PresetsPanel } from "./_components/presets-panel"
import { useGetRawAnilistMangaCollection } from "@/api/hooks/manga.hooks"
import { cn } from "@/components/ui/core/styling"
import { getServerBaseUrl } from "@/api/client/server-url"

function resolveThemeBgUrl(url: string): string {
    if (!url) return url
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url
    return `${getServerBaseUrl()}${url}`
}
import { PageWrapper } from "@/components/shared/page-wrapper"
import {
    useListThemeBackgrounds,
    useDeleteThemeBackground,
    useDownloadThemeBackground,
    useSearchWallhaven,
    type WallhavenWallpaper,
    type ThemeBgFile,
} from "@/api/hooks/theme_backgrounds.hooks"
import { WallhavenPickerModal } from "./_components/wallhaven-picker"
import { WallpaperShop } from "./_components/wallpaper-shop"
import { fetchSharedThemesList, downloadSharedTheme, deleteSharedTheme, type SharedThemeInfo, type MarketplaceThemeMeta, fetchMarketplaceThemeMeta } from "@/lib/theme/marketplace-theme-loader"

export default function ThemeManagerPage() {
    // ── Shared/Marketplace themes state ──
    const [sharedThemes, setSharedThemes] = React.useState<SharedThemeInfo[]>([])
    const [marketplaceThemes, setMarketplaceThemes] = React.useState<MarketplaceThemeMeta[]>([])
    const [isLoadingMarketplace, setIsLoadingMarketplace] = React.useState(false)
    const [marketplaceError, setMarketplaceError] = React.useState<string | null>(null)
    const [activeMarketplaceTab, setActiveMarketplaceTab] = React.useState<"installed" | "browse">("installed")
    const [downloadingId, setDownloadingId] = React.useState<string | null>(null)
    const [deletingId, setDeletingId] = React.useState<string | null>(null)
    const [marketplaceSearchQuery, setMarketplaceSearchQuery] = React.useState("")

    // Load shared themes on mount
    React.useEffect(() => {
        fetchSharedThemesList().then(res => setSharedThemes(Array.isArray(res) ? res : []))
    }, [])

    // Fetch available marketplace themes from index
    React.useEffect(() => {
        setIsLoadingMarketplace(true)
        fetch(`${getServerBaseUrl()}/marketplace/index.json`)
            .then(r => r.ok ? r.json() as Promise<{themes?: {id: string}[]}> : null)
            .then(data => {
                if (data?.themes) {
                    // Load full metadata for each theme
                    const promises = data.themes.map((t) => 
                        fetchMarketplaceThemeMeta(t.id).then(meta => meta || null)
                    )
                    Promise.all(promises).then(results => {
                        const loaded = results.filter(Boolean) as MarketplaceThemeMeta[]
                        setMarketplaceThemes(loaded)
                        setIsLoadingMarketplace(false)
                        // Enrich already-downloaded themes with previewColors + backgroundImageUrl from meta
                        setSharedThemes(prev => prev.map(st => {
                            const meta = loaded.find(m => m.id === st.id)
                            if (!meta) return st
                            return {
                                ...st,
                                previewColors: st.previewColors ?? meta.previewColors,
                                backgroundImageUrl: st.backgroundImageUrl ?? meta.backgroundImageUrl,
                            }
                        }))
                    })
                } else {
                    setMarketplaceError("No marketplace themes found")
                    setIsLoadingMarketplace(false)
                }
            })
            .catch(() => {
                setMarketplaceError("Failed to load marketplace")
                setIsLoadingMarketplace(false)
            })
    }, [])

    const handleDownloadTheme = async (themeId: string) => {
        setDownloadingId(themeId)
        try {
            const result = await downloadSharedTheme(themeId)
            if (result) {
                setSharedThemes(prev => [...prev.filter(t => t.id !== themeId), result])
            }
        } finally {
            setDownloadingId(null)
        }
    }

    const handleDeleteTheme = async (themeId: string) => {
        setDeletingId(themeId)
        try {
            const success = await deleteSharedTheme(themeId)
            if (success) {
                setSharedThemes(prev => prev.filter(t => t.id !== themeId))
            }
        } finally {
            setDeletingId(null)
        }
    }

    const {
        themeId,
        setThemeId,
        musicEnabled,
        setMusicEnabled,
        musicVolume,
        setMusicVolume,
        config,
        animatedIntensity,
        setAnimatedIntensity,
        particleSettings,
        setParticleTypeEnabled,
        setParticleTypeIntensity,
        backgroundDim,
        setBackgroundDim,
        vignetteStrength,
        setVignetteStrength,
        vignetteSize,
        setVignetteSize,
        glowStrength,
        setGlowStrength,
        glowSpeed,
        setGlowSpeed,
        glowScale,
        setGlowScale,
        backgroundBlur,
        setBackgroundBlur,
        backgroundExposure,
        setBackgroundExposure,
        backgroundSaturation,
        setBackgroundSaturation,
        backgroundContrast,
        setBackgroundContrast,
        activeBackgroundUrl,
        setActiveBackgroundUrl,
        brandColorOverride,
        setBrandColorOverride,
        customThemeData,
        setCustomThemeData,
        scanlinesStrength,
        setScanlinesStrength,
        scanlinesSize,
        setScanlinesSize,
        noiseStrength,
        setNoiseStrength,
        noiseSpeed,
        setNoiseSpeed,
        hologramStrength,
        setHologramStrength,
    } = useAnimeTheme()

    const setWallpaperPreviewMode = useSetAtom(wallpaperPreviewModeAtom)
    React.useEffect(() => {
        setWallpaperPreviewMode(true)
        return () => setWallpaperPreviewMode(false)
    }, [setWallpaperPreviewMode])

    const [pickerOpen, setPickerOpen] = React.useState(false)
    const [searchQuery, setSearchQuery] = React.useState("")
    const [settingsPanelOpen, setSettingsPanelOpen] = React.useState(false)
    const [activeTab, setActiveTab] = React.useState<"themes" | "presets" | "wallpapers" | "effects">("themes")
    const [fontSearch, setFontSearch] = React.useState("")

    // Custom font override — persisted, overrides the theme font globally
    const [customFont, setCustomFontRaw] = React.useState<string | null>(() => {
        try { return localStorage.getItem("sea-custom-font") ?? null } catch { return null }
    })
    const setCustomFont = React.useCallback((font: string | null) => {
        setCustomFontRaw(font)
        try {
            if (font) localStorage.setItem("sea-custom-font", font)
            else localStorage.removeItem("sea-custom-font")
        } catch { /* ignore */ }
    }, [])

    // Inject Google Font link + apply --font-anime-theme for custom font
    React.useEffect(() => {
        const existing = document.getElementById("sea-custom-font-link")
        if (existing) existing.remove()
        if (!customFont) {
            document.documentElement.style.removeProperty("--font-anime-theme")
            return
        }
        const fontEntry = FONT_PICKER_LIST.find(f => f.family === customFont)
        if (fontEntry?.href) {
            const link = document.createElement("link")
            link.id = "sea-custom-font-link"
            link.rel = "stylesheet"
            link.href = fontEntry.href
            document.head.appendChild(link)
        }
        document.documentElement.style.setProperty("--font-anime-theme", customFont)
    }, [customFont])
    const [batchProgress, setBatchProgress] = React.useState<{ done: number; total: number } | null>(null)
    const { data: downloadedBgs, isLoading: bgsLoading } = useListThemeBackgrounds()
    const deleteMutation = useDeleteThemeBackground()
    const downloadBgMutation = useDownloadThemeBackground()
    const [downloadingBgId, setDownloadingBgId] = React.useState<string | null>(null)

    // Strict: only show wallpapers tagged for the current theme, nothing else.
    // Filename format: wh-{themeId}-{wallhavenId}.ext
    // themeId itself may contain hyphens (e.g. "attack-on-titan"), so we cannot
    // simply split on "-" and take the first part.  Instead we strip the "wh-"
    // prefix and then remove the LAST "-{wallhavenId}" segment to recover themeId.
    const themedDownloadedBgs = React.useMemo(() => {
        if (!downloadedBgs) return []
        return downloadedBgs.filter(bg => {
            const name = bg.filename
            if (!name.startsWith("wh-")) return false
            const withoutExt = name.replace(/\.[^.]+$/, "") // strip extension
            const withoutPrefix = withoutExt.slice(3)       // strip "wh-"
            const lastDash = withoutPrefix.lastIndexOf("-")
            if (lastDash === -1) return false               // legacy untagged — no themeId
            const extractedThemeId = withoutPrefix.slice(0, lastDash)
            return extractedThemeId === themeId
        })
    }, [downloadedBgs, themeId])

    // Wallhaven curated suggestions — only fetch when user explicitly loads them
    const curatedQuery = config.id !== "seanime" ? (WALLHAVEN_CURATED_QUERY[themeId] ?? "") : ""
    const [suggestionsEnabled, setSuggestionsEnabled] = React.useState(false)
    const { data: suggestedData, isFetching: loadingSuggestions, isError: suggestionsError } = useSearchWallhaven(
        curatedQuery, 1, suggestionsEnabled && config.id !== "seanime" && !!curatedQuery,
    )
    const suggestions: WallhavenWallpaper[] = suggestedData?.data?.slice(0, 10) ?? []

    const handleSuggestionClick = async (w: WallhavenWallpaper) => {
        if (downloadingBgId) return
        setDownloadingBgId(w.id)
        try {
            const result = await downloadBgMutation.mutateAsync({ url: w.path, themeId })
            if (result) setActiveBackgroundUrl(result.url)
        } catch { /* ignored */ } finally {
            setDownloadingBgId(null)
        }
    }

    const handleDownloadAllSuggestions = async () => {
        if (!suggestions.length || batchProgress) return
        const alreadyDownloaded = new Set((downloadedBgs ?? []).map(b => resolveThemeBgUrl(b.url)))
        const toDownload = suggestions.filter(w => !alreadyDownloaded.has(w.path))
        if (!toDownload.length) return
        setBatchProgress({ done: 0, total: toDownload.length })
        for (let i = 0; i < toDownload.length; i++) {
            try { await downloadBgMutation.mutateAsync({ url: toDownload[i].path, themeId }) } catch { /* ignored */ }
            setBatchProgress({ done: i + 1, total: toDownload.length })
        }
        setBatchProgress(null)
    }

    // Fetch manga collection for hidden theme unlock detection
    const { data: mangaCollection } = useGetRawAnilistMangaCollection()

    // Load set of themes the user has ever activated
    const [activatedThemes, setActivatedThemes] = React.useState(() => loadActivatedThemes())
    // Refresh when the active theme changes (user just activated it)
    React.useEffect(() => {
        setActivatedThemes(loadActivatedThemes())
    }, [themeId])

    const unlockedHiddenThemes = React.useMemo(() => {
        const ids = new Set<AnimeThemeId>()
        if (!mangaCollection?.MediaListCollection?.lists) return ids
        const userMangaIds = new Set<number>()
        for (const list of mangaCollection.MediaListCollection.lists ?? []) {
            for (const entry of list?.entries ?? []) {
                if (entry?.media?.id) userMangaIds.add(entry.media.id)
            }
        }
        for (const req of HIDDEN_THEMES) {
            if (req.requiredMangaIds.some((id) => userMangaIds.has(id))) {
                ids.add(req.themeId)
            }
        }
        return ids
    }, [mangaCollection])

    return (
        <PageWrapper className="p-0 h-screen max-w-none mx-auto flex flex-col">
            {/* Fixed Tab Navigation */}
            <div className="sticky top-0 z-40 flex items-center gap-1 p-4 sm:px-8 bg-[--background]/95 backdrop-blur-sm border-b border-[--border]">
                <div className="flex items-center gap-1 p-1 rounded-xl bg-[--paper] border border-[--border]">
                    {([
                        { id: "themes",     label: "Themes",     icon: <LuSparkles className="w-3.5 h-3.5" /> },
                        { id: "effects",    label: "Effects",    icon: <LuSlidersHorizontal className="w-3.5 h-3.5" /> },
                        { id: "wallpapers", label: "Wallpapers",  icon: <LuImage className="w-3.5 h-3.5" /> },
                        { id: "presets",    label: "Presets",    icon: <LuBookmark className="w-3.5 h-3.5" /> },
                    ] as const).map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                            activeTab === tab.id
                                ? "bg-[--color-brand-600] text-white shadow-sm"
                                : "text-[--muted] hover:text-[--foreground]",
                        )}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
                </div>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto">
                <div className="p-4 sm:p-8 space-y-10">

            {/* Presets tab */}
            {activeTab === "presets" && <PresetsPanel />}

            {/* Effects tab */}
            {activeTab === "effects" && (
                <div className="space-y-4">
                    {config.id === "seanime" && (
                        <div className="rounded-2xl border border-dashed border-[--border] bg-[--paper] px-5 py-4 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <LuSlidersHorizontal className="w-5 h-5 text-[--muted] opacity-40 shrink-0" />
                                <p className="text-sm text-[--muted]">Background effects require an active theme. Font picker is available below.</p>
                            </div>
                            <button onClick={() => setActiveTab("themes")} className="text-xs text-[--color-brand-400] hover:text-[--color-brand-300] transition-colors shrink-0">Pick a theme →</button>
                        </div>
                    )}
                    {config.id !== "seanime" && (
                    <div className="space-y-4">
                        {/* Large Live Background Preview Panel */}
                        <div className="rounded-2xl border border-[--border] overflow-hidden">
                            <div className="relative w-full overflow-hidden" style={{ height: "300px" }}>
                                {activeBackgroundUrl ? (
                                    <>
                                        {/* Wallpaper with live effects applied */}
                                        <div
                                            className="absolute inset-0 bg-cover bg-center transition-all duration-300"
                                            style={{
                                                backgroundImage: `url("${activeBackgroundUrl}")`,
                                                filter: `blur(${backgroundBlur}px) brightness(${backgroundExposure}) saturate(${backgroundSaturation}) contrast(${backgroundContrast})`,
                                                opacity: 1 - backgroundDim,
                                                transform: "scale(1.02)",
                                            }}
                                        />
                                        {/* Vignette overlay */}
                                        {vignetteStrength > 0 && (
                                            <div
                                                className="absolute inset-0 pointer-events-none"
                                                style={{
                                                    background: `radial-gradient(ellipse at center, transparent ${Math.max(0, 50 - vignetteSize * 50)}%, rgba(0,0,0,${Math.min(0.95, vignetteStrength * 0.95)}) 100%)`,
                                                }}
                                            />
                                        )}
                                        {/* Scanlines overlay */}
                                        {scanlinesStrength > 0 && (
                                            <div
                                                className="absolute inset-0 pointer-events-none"
                                                style={{
                                                    backgroundImage: `repeating-linear-gradient(0deg, rgba(0,0,0,${scanlinesStrength * 0.6}) 0px, rgba(0,0,0,${scanlinesStrength * 0.6}) 1px, transparent 1px, transparent ${Math.round(2 + scanlinesSize * 6)}px)`,
                                                }}
                                            />
                                        )}
                                        {/* Static Glow overlay */}
                                        {glowStrength > 0 && (
                                            <div
                                                className="absolute inset-0 pointer-events-none"
                                                style={{
                                                    background: `radial-gradient(ellipse at center, rgba(255,255,255,${glowStrength * 0.60}) 0%, transparent ${60 + glowScale * 30}%)`,
                                                    mixBlendMode: "screen",
                                                }}
                                            />
                                        )}
                                        {/* Hologram overlay */}
                                        {hologramStrength > 0 && (
                                            <>
                                                <div
                                                    className="absolute inset-0 pointer-events-none"
                                                    style={{
                                                        background: `linear-gradient(180deg, rgba(100,200,255,${hologramStrength * 0.15}) 0%, rgba(50,150,200,${hologramStrength * 0.10}) 50%, transparent 100%)`,
                                                        mixBlendMode: "overlay",
                                                    }}
                                                />
                                                <div
                                                    className="absolute inset-0 pointer-events-none"
                                                    style={{
                                                        background: `radial-gradient(ellipse at center, rgba(200,240,255,${hologramStrength * 0.25}) 0%, transparent 60%)`,
                                                        mixBlendMode: "screen",
                                                    }}
                                                />
                                            </>
                                        )}
                                        {/* Bottom fade for text readability */}
                                        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[--background] to-transparent" />
                                    </>
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center bg-[--paper]">
                                        <div className="text-center space-y-2">
                                            <div className="text-4xl opacity-20">🖼</div>
                                            <p className="text-sm text-[--muted]">No background — set one in Wallpapers</p>
                                        </div>
                                    </div>
                                )}
                                <div className="absolute bottom-4 left-5 flex items-center gap-2">
                                    <span className="text-sm font-semibold text-white drop-shadow-md">{config.displayName} — Live Preview</span>
                                </div>
                                {activeBackgroundUrl && (
                                    <button onClick={() => setActiveTab("wallpapers")} className="absolute bottom-4 right-4 text-xs text-white/70 hover:text-white transition-colors bg-black/30 hover:bg-black/50 px-3 py-1.5 rounded-full backdrop-blur-sm">Change wallpaper →</button>
                                )}
                            </div>

                            {/* All sliders */}
                            <div className="bg-[--background] border-t border-[--border] p-5 space-y-6">

                                {/* Background section */}
                                <div className="space-y-3">
                                    <p className="text-xs font-semibold text-[--muted] uppercase tracking-wider">Background</p>
                                    <EffectSlider label="Dim" value={backgroundDim} min={0} max={1} step={0.01} display={`${Math.round(backgroundDim * 100)}%`} onChange={setBackgroundDim} onReset={() => setBackgroundDim(config.backgroundDim ?? 0.30)} />
                                    <EffectSlider label="Blur" value={backgroundBlur} min={0} max={60} step={1} display={`${backgroundBlur}px`} fillPct={(backgroundBlur / 60) * 100} onChange={setBackgroundBlur} onReset={() => setBackgroundBlur(config.backgroundBlur ?? 0)} />
                                    <EffectSlider label="Exposure" value={backgroundExposure} min={0.1} max={2.5} step={0.05} display={`${Math.round(backgroundExposure * 100)}%`} fillPct={((backgroundExposure - 0.1) / 2.4) * 100} onChange={setBackgroundExposure} onReset={() => setBackgroundExposure(1.0)} />
                                    <EffectSlider label="Saturation" value={backgroundSaturation} min={0} max={3.0} step={0.05} display={`${Math.round(backgroundSaturation * 100)}%`} fillPct={(backgroundSaturation / 3.0) * 100} onChange={setBackgroundSaturation} onReset={() => setBackgroundSaturation(1.0)} />
                                    <EffectSlider label="Contrast" value={backgroundContrast} min={0} max={3.0} step={0.05} display={`${Math.round(backgroundContrast * 100)}%`} fillPct={(backgroundContrast / 3.0) * 100} onChange={setBackgroundContrast} onReset={() => setBackgroundContrast(1.0)} />
                                </div>

                                {/* Vignette */}
                                <div className="space-y-3 pt-4 border-t border-white/5">
                                    <p className="text-xs font-semibold text-[--muted] uppercase tracking-wider">Vignette</p>
                                    <EffectSlider label="Strength" value={vignetteStrength} min={0} max={1} step={0.01} display={`${Math.round(vignetteStrength * 100)}%`} onChange={setVignetteStrength} onReset={() => setVignetteStrength(0)} />
                                    <EffectSlider label="Size" value={vignetteSize} min={0} max={1} step={0.01} display={`${Math.round(vignetteSize * 100)}%`} onChange={setVignetteSize} onReset={() => setVignetteSize(0.6)} />
                                </div>

                                {/* Glow (Static - no animation) */}
                                <div className="space-y-3 pt-4 border-t border-white/5">
                                    <p className="text-xs font-semibold text-[--muted] uppercase tracking-wider">Glow</p>
                                    <EffectSlider label="Strength" value={glowStrength} min={0} max={1} step={0.01} display={`${Math.round(glowStrength * 100)}%`} onChange={setGlowStrength} onReset={() => setGlowStrength(0)} />
                                    <EffectSlider label="Scale" value={glowScale} min={0} max={1} step={0.01} display={`${Math.round(glowScale * 100)}%`} onChange={setGlowScale} onReset={() => setGlowScale(0.5)} />
                                </div>

                                {/* Scanlines */}
                                <div className="space-y-3 pt-4 border-t border-white/5">
                                    <p className="text-xs font-semibold text-[--muted] uppercase tracking-wider">Scanlines</p>
                                    <EffectSlider label="Strength" value={scanlinesStrength} min={0} max={1} step={0.01} display={`${Math.round(scanlinesStrength * 100)}%`} onChange={setScanlinesStrength} onReset={() => setScanlinesStrength(0)} />
                                    <EffectSlider label="Spacing" value={scanlinesSize} min={0} max={1} step={0.01} display={`${Math.round(scanlinesSize * 100)}%`} onChange={setScanlinesSize} onReset={() => setScanlinesSize(0.5)} />
                                </div>

                                {/* Film Noise */}
                                <div className="space-y-3 pt-4 border-t border-white/5">
                                    <p className="text-xs font-semibold text-[--muted] uppercase tracking-wider">Film Noise</p>
                                    <EffectSlider label="Strength" value={noiseStrength} min={0} max={1} step={0.01} display={`${Math.round(noiseStrength * 100)}%`} onChange={setNoiseStrength} onReset={() => setNoiseStrength(0)} />
                                    <EffectSlider label="Speed" value={noiseSpeed} min={0.1} max={5} step={0.1} display={`${noiseSpeed.toFixed(1)}x`} fillPct={((noiseSpeed - 0.1) / 4.9) * 100} onChange={setNoiseSpeed} onReset={() => setNoiseSpeed(1)} />
                                </div>

                                {/* Hologram */}
                                <div className="space-y-3 pt-4 border-t border-white/5">
                                    <p className="text-xs font-semibold text-[--muted] uppercase tracking-wider">Hologram</p>
                                    <EffectSlider label="Strength" value={hologramStrength} min={0} max={1} step={0.01} display={`${Math.round(hologramStrength * 100)}%`} onChange={setHologramStrength} onReset={() => setHologramStrength(0)} />
                                </div>

                            </div>
                        </div>

                    </div>
                    )}

                    {/* Font Picker — available for all themes */}
                    <div className="rounded-2xl border border-[--border] overflow-hidden">
                        <div className="bg-[--paper] border-b border-[--border] px-5 py-4 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold text-[--muted] uppercase tracking-wider">Global Font Override</p>
                                <p className="text-xs text-[--muted] mt-0.5">Overrides the theme font everywhere</p>
                            </div>
                            {customFont && (
                                <button onClick={() => setCustomFont(null)} className="text-xs text-[--muted] hover:text-[--foreground] px-2 py-1 rounded border border-[--border] bg-[--background] transition-colors shrink-0">Reset to theme font</button>
                            )}
                        </div>
                        <div className="bg-[--background] p-4 space-y-3">
                            <div className="rounded-xl border border-[--border] bg-[--paper] p-4 text-center">
                                <p className="text-2xl font-bold text-[--foreground]" style={{ fontFamily: customFont ?? config.fontFamily ?? "inherit" }}>
                                    {config.displayName}
                                </p>
                                <p className="text-xs text-[--muted] mt-1">{customFont ?? config.fontFamily ?? "Default system font"}</p>
                            </div>
                            <div className="relative">
                                <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[--muted] pointer-events-none" />
                                <input type="text" value={fontSearch} onChange={e => setFontSearch(e.target.value)} placeholder="Search fonts…" className="w-full pl-9 pr-4 py-2 rounded-xl bg-[--paper] border border-[--border] text-sm text-[--foreground] placeholder:text-[--muted] focus:outline-none focus:border-[--color-brand-500] transition-colors" />
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 max-h-72 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                                {FONT_PICKER_LIST.filter(f => !fontSearch || f.family.toLowerCase().includes(fontSearch.toLowerCase()) || f.label.toLowerCase().includes(fontSearch.toLowerCase())).map(f => (
                                    <button
                                        key={f.family}
                                        onClick={() => setCustomFont(f.family)}
                                        className={cn(
                                            "rounded-xl border-2 px-3 py-2.5 text-left transition-all",
                                            customFont === f.family
                                                ? "border-[--color-brand-500] bg-[--color-brand-900]/30"
                                                : "border-[--border] bg-[--paper] hover:border-[--color-brand-700]",
                                        )}
                                    >
                                        <FontPreviewTile family={f.family} href={f.href} label={f.label} isSelected={customFont === f.family} />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Wallpapers tab */}
            {activeTab === "wallpapers" && <WallpaperShopTab
                themeId={themeId}
                downloadedBgs={downloadedBgs ?? []}
                themedDownloadedBgs={themedDownloadedBgs}
                bgsLoading={bgsLoading}
                activeBackgroundUrl={activeBackgroundUrl}
                setActiveBackgroundUrl={setActiveBackgroundUrl}
                deleteMutation={deleteMutation}
                downloadBgMutation={downloadBgMutation}
                config={config}
                resolveThemeBgUrl={resolveThemeBgUrl}
            />}

            {/* Themes tab content (hidden when Presets is active) */}
            {activeTab === "themes" && <>

            {/* Theme Cards - Full Width Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                {ANIME_THEME_LIST.map((theme) => {
                    const isHidden = HIDDEN_THEME_IDS.has(theme.id)
                    const isUnlocked = !isHidden || unlockedHiddenThemes.has(theme.id)
                    const isActive = theme.id === themeId

                    // Check sequel prerequisite
                    const hasPrereq = PREREQUISITE_THEME_IDS.has(theme.id)
                    const prereqMet = !hasPrereq || isThemePrerequisiteMet(theme.id, activatedThemes)
                    const prereqInfo = hasPrereq
                        ? THEME_PREREQUISITES.find((p) => p.themeId === theme.id)
                        : undefined

                    if (isHidden && !isUnlocked) {
                        const req = HIDDEN_THEMES.find((h) => h.themeId === theme.id)
                        return (
                            <div
                                key={theme.id}
                                className="relative rounded-2xl p-5 text-left border-2 border-[--border] bg-[--paper] opacity-60 cursor-not-allowed select-none"
                            >
                                <div className="flex gap-1.5 mb-3">
                                    {[1, 2, 3].map((i) => (
                                        <div
                                            key={i}
                                            className="w-5 h-5 rounded-full bg-[--color-gray-700]"
                                        />
                                    ))}
                                </div>
                                <div className="font-bold text-lg text-[--muted]">???</div>
                                <p className="text-[--muted] text-xs mt-1">{req?.hint ?? "Unlock this hidden theme."}</p>
                            </div>
                        )
                    }

                    if (!prereqMet) {
                        return (
                            <div
                                key={theme.id}
                                className="relative rounded-2xl p-5 text-left border-2 border-[--border] bg-[--paper] opacity-50 cursor-not-allowed select-none"
                            >
                                <div className="flex gap-1.5 mb-3">
                                    {(theme.previewColors
                                        ? [theme.previewColors.primary, theme.previewColors.secondary, theme.previewColors.accent]
                                        : ["#555", "#444", "#333"]
                                    ).map((c, i) => (
                                        <div
                                            key={i}
                                            className="w-5 h-5 rounded-full opacity-40"
                                            style={{ background: c }}
                                        />
                                    ))}
                                    <span className="ml-auto text-[--muted] text-xs">🔒</span>
                                </div>
                                <div className="font-bold text-lg text-[--foreground]">{theme.displayName}</div>
                                <p className="text-[--muted] text-xs mt-1">
                                    {prereqInfo?.hint ?? `Activate the ${prereqInfo?.requiresDisplayName ?? "prequel"} theme first.`}
                                </p>
                            </div>
                        )
                    }

                    return (
                        <ThemeCard
                            key={theme.id}
                            theme={theme}
                            isActive={isActive}
                            onSelect={() => setThemeId(theme.id as AnimeThemeId)}
                            onSettingsClick={() => {
                                setThemeId(theme.id as AnimeThemeId)
                                setSettingsPanelOpen(true)
                            }}
                        />
                    )
                })}
            </div>

            {/* ── MARKETPLACE THEMES SECTION ── */}
            <div className="rounded-2xl border border-[--border] bg-[--paper] p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <LuStore className="w-5 h-5 text-[--color-brand-400]" />
                        <h2 className="text-xl font-semibold">Theme Marketplace</h2>
                    </div>
                    <div className="text-sm text-[--muted]">
                        {sharedThemes.length} installed · {Math.max(0, marketplaceThemes.length - sharedThemes.length)} available
                    </div>
                </div>

                {/* Tab navigation for marketplace */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-[--background] border border-[--border] w-fit">
                    {[
                        { id: "installed", label: "Installed", icon: <LuCheck className="w-3.5 h-3.5" /> },
                        { id: "browse", label: "Browse", icon: <LuCloudDownload className="w-3.5 h-3.5" /> },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveMarketplaceTab(tab.id as "installed" | "browse")}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                activeMarketplaceTab === tab.id
                                    ? "bg-[--color-brand-600] text-white shadow-sm"
                                    : "text-[--muted] hover:text-[--foreground]",
                            )}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Installed Themes Tab */}
                {activeMarketplaceTab === "installed" && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">

                        {/* Seanime (built-in) */}
                        <button
                            onClick={() => setThemeId("seanime")}
                            className={cn(
                                "relative group rounded-xl border-2 overflow-hidden transition-all text-left",
                                themeId === "seanime"
                                    ? "border-[--color-brand-400] shadow-[0_0_16px_2px_rgba(0,0,0,0.4)]"
                                    : "border-[--border] hover:border-[--color-brand-600]",
                            )}
                        >
                            <div className="relative h-20 w-full overflow-hidden">
                                <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #1a0a2e 0%, #4c1d95 50%, #7c3aed 100%)" }} />
                                <div className="absolute bottom-2 left-2 flex gap-1">
                                    {["#7c3aed", "#a78bfa", "#c4b5fd"].map((c, i) => (
                                        <div key={i} className="w-2.5 h-2.5 rounded-full border border-white/20" style={{ background: c }} />
                                    ))}
                                </div>
                                {themeId === "seanime" && <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[--color-brand-400]" />}
                            </div>
                            <div className="px-2 py-1.5 bg-[--paper] border-t border-[--border]">
                                <p className="text-[11px] font-semibold truncate">Seanime</p>
                            </div>
                        </button>

                        {/* Downloaded themes */}
                        {sharedThemes.map(theme => (
                            <div
                                key={theme.id}
                                className={cn(
                                    "relative group rounded-xl border-2 overflow-hidden transition-all",
                                    themeId === theme.id
                                        ? "border-[--color-brand-400] shadow-[0_0_16px_2px_rgba(0,0,0,0.4)]"
                                        : "border-[--border] hover:border-[--color-brand-600]",
                                )}
                            >
                                <button
                                    onClick={() => setThemeId(theme.id as AnimeThemeId)}
                                    className="w-full text-left"
                                >
                                    <div className="relative h-20 w-full overflow-hidden">
                                        {theme.backgroundImageUrl ? (
                                            <img
                                                src={theme.backgroundImageUrl.startsWith("/") ? `${getServerBaseUrl()}${theme.backgroundImageUrl}` : theme.backgroundImageUrl}
                                                alt=""
                                                className="absolute inset-0 w-full h-full object-cover scale-110"
                                                style={{ filter: "blur(5px) brightness(0.5) saturate(1.4)" }}
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="absolute inset-0" style={{ background: theme.previewColors
                                                ? `linear-gradient(135deg, ${theme.previewColors.bg} 0%, color-mix(in srgb, ${theme.previewColors.bg} 50%, ${theme.previewColors.primary}) 100%)`
                                                : "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)"
                                            }} />
                                        )}
                                        <div className="absolute bottom-2 left-2 flex gap-1">
                                            {theme.previewColors
                                                ? [theme.previewColors.primary, theme.previewColors.secondary, theme.previewColors.accent].map((c, i) => (
                                                    <div key={i} className="w-2.5 h-2.5 rounded-full border border-white/20" style={{ background: c }} />
                                                ))
                                                : null
                                            }
                                        </div>
                                        {themeId === theme.id && <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[--color-brand-400]" />}
                                    </div>
                                    <div className="px-2 py-1.5 bg-[--paper] border-t border-[--border]" style={{ background: theme.previewColors ? `linear-gradient(180deg, ${theme.previewColors.bg} 0%, color-mix(in srgb, ${theme.previewColors.bg} 90%, ${theme.previewColors.primary}) 100%)` : undefined }}>
                                        <p className="text-[11px] font-semibold truncate text-white">{theme.displayName || theme.id}</p>
                                    </div>
                                </button>
                                <button
                                    onClick={() => handleDeleteTheme(theme.id)}
                                    disabled={deletingId === theme.id}
                                    className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-black/60 text-white/60 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                    title="Delete theme"
                                >
                                    {deletingId === theme.id ? (
                                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <LuTrash2 className="w-3 h-3" />
                                    )}
                                </button>
                            </div>
                        ))}

                        {/* Browse more tile */}
                        <button
                            onClick={() => setActiveMarketplaceTab("browse")}
                            className="rounded-xl border-2 border-dashed border-[--border] hover:border-[--color-brand-500] overflow-hidden transition-all flex flex-col items-center justify-center gap-2 py-6 text-[--muted] hover:text-[--foreground]"
                        >
                            <LuStore className="w-5 h-5" />
                            <span className="text-xs font-medium">Browse more</span>
                            {marketplaceThemes.length > 0 && (
                                <span className="text-[10px] text-[--muted]">{marketplaceThemes.length} available</span>
                            )}
                        </button>

                    </div>
                )}

                {/* Browse Tab */}
                {activeMarketplaceTab === "browse" && (
                    <div className="space-y-4">
                        {/* Search bar */}
                        <div className="relative">
                            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[--muted] pointer-events-none" />
                            <input
                                type="text"
                                value={marketplaceSearchQuery}
                                onChange={e => setMarketplaceSearchQuery(e.target.value)}
                                placeholder="Search marketplace themes…"
                                className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-[--background] border border-[--border] text-sm text-[--foreground] placeholder:text-[--muted] focus:outline-none focus:border-[--color-brand-500] transition-colors"
                            />
                            {marketplaceSearchQuery && (
                                <button
                                    onClick={() => setMarketplaceSearchQuery("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[--muted] hover:text-[--foreground] transition-colors"
                                >
                                    <LuX className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        {isLoadingMarketplace ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-8 h-8 border-2 border-[--color-brand-500] border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : marketplaceError ? (
                            <div className="text-center py-8 text-red-400">
                                <p>{marketplaceError}</p>
                            </div>
                        ) : marketplaceThemes.length === 0 ? (
                            <div className="text-center py-8 text-[--muted]">
                                <p>No themes available in marketplace.</p>
                            </div>
                        ) : (() => {
                            const browseable = marketplaceThemes
                                .filter(theme => !Array.isArray(sharedThemes) || !sharedThemes.some(st => st.id === theme.id))
                                .filter(theme => !marketplaceSearchQuery ||
                                    theme.displayName.toLowerCase().includes(marketplaceSearchQuery.toLowerCase()) ||
                                    (theme.description ?? "").toLowerCase().includes(marketplaceSearchQuery.toLowerCase())
                                )
                            return browseable.length === 0 ? (
                                <div className="text-center py-8 text-[--muted]">
                                    <p>No themes match your search.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                                    {browseable.map(theme => (
                                        <div
                                            key={theme.id}
                                            className="group relative rounded-xl border-2 border-[--border] hover:border-[--color-brand-600] overflow-hidden transition-all"
                                        >
                                            {/* Banner art */}
                                            <div className="relative h-20 w-full overflow-hidden">
                                                {theme.backgroundImageUrl ? (
                                                    <img
                                                        src={theme.backgroundImageUrl.startsWith("/") ? `${getServerBaseUrl()}${theme.backgroundImageUrl}` : theme.backgroundImageUrl}
                                                        alt=""
                                                        className="absolute inset-0 w-full h-full object-cover scale-110"
                                                        style={{ filter: "blur(5px) brightness(0.5) saturate(1.4)" }}
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${theme.previewColors?.bg ?? "#0a0a0a"} 0%, color-mix(in srgb, ${theme.previewColors?.bg ?? "#0a0a0a"} 50%, ${theme.previewColors?.primary ?? "#333"}) 100%)` }} />
                                                )}
                                                <div className="absolute bottom-2 left-2 flex gap-1">
                                                    {[theme.previewColors?.primary, theme.previewColors?.secondary, theme.previewColors?.accent].map((c, i) => c && (
                                                        <div key={i} className="w-2.5 h-2.5 rounded-full border border-white/20" style={{ background: c }} />
                                                    ))}
                                                </div>
                                                {/* Download button overlay */}
                                                <button
                                                    onClick={() => handleDownloadTheme(theme.id)}
                                                    disabled={downloadingId === theme.id}
                                                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg bg-[--color-brand-600]/90 hover:bg-[--color-brand-500] disabled:opacity-60 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Download theme"
                                                >
                                                    {downloadingId === theme.id ? (
                                                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    ) : (
                                                        <LuCloudDownload className="w-3 h-3 text-white" />
                                                    )}
                                                </button>
                                            </div>
                                            {/* Label */}
                                            <div className="px-2 py-1.5 border-t border-[--border]" style={{ background: theme.previewColors ? `linear-gradient(180deg, ${theme.previewColors.bg} 0%, color-mix(in srgb, ${theme.previewColors.bg} 90%, ${theme.previewColors.primary}) 100%)` : "var(--paper)" }}>
                                                <p className="text-[11px] font-semibold truncate text-white">{theme.displayName}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        })()}
                    </div>
                )}
            </div>

            {/* Music & Event Controls */}
            {config.id !== "seanime" && (
                <div className="rounded-2xl border border-[--border] bg-[--paper] p-6 space-y-6">
                    <h2
                        className="text-xl font-semibold"
                        style={{ fontFamily: config.fontFamily }}
                    >
                        Music
                    </h2>

                    {/* Music toggle */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setMusicEnabled(!musicEnabled)}
                            className={cn(
                                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none",
                                musicEnabled ? "bg-[--color-brand-500]" : "bg-[--color-gray-700]",
                            )}
                            role="switch"
                            aria-checked={musicEnabled}
                        >
                            <span
                                className={cn(
                                    "inline-block size-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                                    musicEnabled ? "translate-x-6" : "translate-x-1",
                                )}
                            />
                        </button>
                        <span className="text-sm text-[--foreground]">
                            Background music
                            <span className="ml-2 text-[--muted] text-xs">
                                (drop your .mp3 file at{" "}
                                <code className="bg-[--paper] px-1 rounded text-[--color-brand-400]">{config.musicUrl}</code>
                                )
                            </span>
                        </span>
                    </div>

                    {/* Volume slider */}
                    {musicEnabled && (
                        <div className="flex items-center gap-4">
                            <span className="text-sm text-[--muted] w-16">Volume</span>
                            <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.01}
                                value={musicVolume}
                                onChange={e => setMusicVolume(Number(e.target.value))}
                                className="w-48 accent-[--color-brand-500]"
                            />
                            <span className="text-sm text-[--muted]">{Math.round(musicVolume * 100)}%</span>
                        </div>
                    )}

                    {/* Audio slot info */}
                    <div className="rounded-xl bg-[--background] border border-[--border] p-4 text-xs text-[--muted] space-y-1">
                        <div className="font-semibold text-[--foreground] mb-2">Audio file slots</div>
                        <div>Opening music: <code className="text-[--color-brand-400]">{config.musicUrl.replace("/public", "seanime-web/public")}</code></div>
                        <div className="pt-1 text-white/40">Drop your own files at those paths — they will be played automatically.</div>
                    </div>
                </div>
            )}

            {config.id !== "seanime" && (
                <div className="rounded-2xl border border-[--border] overflow-hidden">
                    {/* ── WALLPAPER SCROLLABLE BOX ───────────────────────────────── */}
                    <div className="bg-[--paper] border-t border-[--border] p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-[--muted] font-semibold uppercase tracking-wider">Wallpapers</p>
                            {batchProgress ? (
                                <span className="text-xs text-[--muted] flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 border-2 border-[--muted] border-t-[--color-brand-400] rounded-full animate-spin" />
                                    {batchProgress.done}/{batchProgress.total}
                                </span>
                            ) : suggestions.length > 0 ? (
                                <button
                                    onClick={handleDownloadAllSuggestions}
                                    disabled={!!downloadingBgId}
                                    className="text-xs text-[--color-brand-400] hover:text-[--color-brand-300] transition-colors"
                                >
                                    <LuDownload className="w-3 h-3 inline mr-1" />
                                    Download top {suggestions.length}
                                </button>
                            ) : null}
                        </div>

                        {/* Fixed-height scrollable grid */}
                        <div
                            className="overflow-y-auto rounded-xl border border-[--border] bg-[--background]/60 p-2"
                            style={{ maxHeight: "320px", scrollbarWidth: "thin" }}
                        >
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                {/* Bundled default */}
                                {config.backgroundImageUrl && (
                                    <button
                                        onClick={() => setActiveBackgroundUrl(config.backgroundImageUrl!)}
                                        className={cn(
                                            "relative aspect-video rounded-lg overflow-hidden border-2 transition-all",
                                            activeBackgroundUrl === config.backgroundImageUrl
                                                ? "border-[--color-brand-400]"
                                                : "border-transparent hover:border-white/30",
                                        )}
                                    >
                                        <img src={config.backgroundImageUrl} alt="Default" className="w-full h-full object-cover" loading="lazy" />
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-[9px] text-white/70 text-center py-0.5">Default</div>
                                    </button>
                                )}

                                {/* Downloaded wallpapers — filtered to current theme */}
                                {bgsLoading && !downloadedBgs && Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="aspect-video rounded-lg bg-white/5 animate-pulse" />
                                ))}
                                {themedDownloadedBgs.map(bg => (
                                    <div key={bg.filename} className="relative group">
                                        <button
                                            onClick={() => setActiveBackgroundUrl(resolveThemeBgUrl(bg.url))}
                                            className={cn(
                                                "relative aspect-video w-full rounded-lg overflow-hidden border-2 transition-all",
                                                activeBackgroundUrl === resolveThemeBgUrl(bg.url)
                                                    ? "border-[--color-brand-400]"
                                                    : "border-transparent hover:border-white/30",
                                            )}
                                        >
                                            <img src={resolveThemeBgUrl(bg.url)} alt="" className="w-full h-full object-cover" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.opacity = "0.3" }} />
                                        </button>
                                        <button
                                            onClick={() => {
                                                deleteMutation.mutate(bg.filename)
                                                if (activeBackgroundUrl === resolveThemeBgUrl(bg.url)) setActiveBackgroundUrl(config.backgroundImageUrl ?? null)
                                            }}
                                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white/60 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px]"
                                        >✕</button>
                                    </div>
                                ))}

                                {/* Top picks — lazy loaded */}
                                {!suggestionsEnabled && curatedQuery && (
                                    <button
                                        onClick={() => setSuggestionsEnabled(true)}
                                        className="col-span-full py-3 text-xs text-[--color-brand-400] hover:text-[--color-brand-300] border border-dashed border-[--border] rounded-lg transition-colors"
                                    >
                                        <LuSparkles className="w-3 h-3 inline mr-1" />
                                        Load top picks
                                    </button>
                                )}
                                {suggestionsEnabled && loadingSuggestions && suggestions.length === 0 && Array.from({ length: 6 }).map((_, i) => (
                                    <div key={`sk-${i}`} className="aspect-video rounded-lg bg-white/5 animate-pulse" />
                                ))}
                                {suggestions.map(w => (
                                    <button
                                        key={w.id}
                                        onClick={() => handleSuggestionClick(w)}
                                        disabled={!!downloadingBgId}
                                        title={`${w.resolution} — download & apply`}
                                        className={cn(
                                            "relative aspect-video rounded-lg overflow-hidden border-2 transition-all",
                                            downloadingBgId === w.id
                                                ? "border-[--color-brand-400] opacity-70"
                                                : "border-transparent hover:border-[--color-brand-500]",
                                        )}
                                    >
                                        <img src={w.thumbs.small} alt={w.id} className="w-full h-full object-cover" loading="lazy" />
                                        {downloadingBgId === w.id && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            </div>
                                        )}
                                        <div className="absolute bottom-0.5 right-0.5 bg-black/50 text-white/60 text-[8px] px-1 rounded">
                                            {w.resolution}
                                        </div>
                                    </button>
                                ))}
                                {suggestionsError && (
                                    <div className="col-span-full text-xs text-red-400 text-center py-4">Could not load wallpapers — check your connection.</div>
                                )}

                                {/* Last entry: Browse Wallhaven for more */}
                                <button
                                    onClick={() => setPickerOpen(true)}
                                    className="aspect-video rounded-lg border-2 border-dashed border-white/15 hover:border-[--color-brand-500]/60 hover:bg-[--color-brand-900]/20 flex flex-col items-center justify-center gap-1 text-[--muted] hover:text-[--color-brand-400] transition-all"
                                >
                                    <LuImage className="w-4 h-4" />
                                    <span className="text-[9px] font-medium text-center leading-tight">Browse<br/>Wallhaven</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <WallhavenPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} />

            <ThemeSettingsPanel
                open={settingsPanelOpen}
                onClose={() => setSettingsPanelOpen(false)}
                config={config}
                brandColorOverride={brandColorOverride}
                setBrandColorOverride={setBrandColorOverride}
                backgroundDim={backgroundDim}
                setBackgroundDim={setBackgroundDim}
                backgroundBlur={backgroundBlur}
                setBackgroundBlur={setBackgroundBlur}
                backgroundExposure={backgroundExposure}
                setBackgroundExposure={setBackgroundExposure}
                backgroundSaturation={backgroundSaturation}
                setBackgroundSaturation={setBackgroundSaturation}
                backgroundContrast={backgroundContrast}
                setBackgroundContrast={setBackgroundContrast}
                vignetteStrength={vignetteStrength}
                setVignetteStrength={setVignetteStrength}
                vignetteSize={vignetteSize}
                setVignetteSize={setVignetteSize}
                glowStrength={glowStrength}
                setGlowStrength={setGlowStrength}
                glowSpeed={glowSpeed}
                setGlowSpeed={setGlowSpeed}
                glowScale={glowScale}
                setGlowScale={setGlowScale}
                scanlinesStrength={scanlinesStrength}
                setScanlinesStrength={setScanlinesStrength}
                scanlinesSize={scanlinesSize}
                setScanlinesSize={setScanlinesSize}
                noiseStrength={noiseStrength}
                setNoiseStrength={setNoiseStrength}
                noiseSpeed={noiseSpeed}
                setNoiseSpeed={setNoiseSpeed}
                activeBackgroundUrl={activeBackgroundUrl}
                setActiveBackgroundUrl={setActiveBackgroundUrl}
                downloadedBgs={downloadedBgs ?? undefined}
                downloadBgMutation={downloadBgMutation}
            />

            {/* Animated Elements */}
            {config.hasAnimatedElements && (
                <div className="rounded-2xl border border-[--border] bg-[--paper] p-6 space-y-6">
                    <h2
                        className="text-xl font-semibold"
                        style={{ fontFamily: config.fontFamily }}
                    >
                        Animated Elements
                    </h2>
                    <p className="text-sm text-[--muted]">
                        {config.id === "naruto" && "Falling leaves, chakra wisps, and a Sharingan watermark float around Konoha."}
                        {config.id === "bleach" && "Karakura Town at night with hell butterflies, reiatsu wisps, and a moonlit cityscape."}
                        {config.id === "one-piece" && "Ocean waves, Sabaody bubbles, and the Straw Hat Jolly Roger."}
                    </p>

                    <div className="flex items-center gap-4">
                        <span className="text-sm text-[--muted] w-20 shrink-0">Intensity</span>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={animatedIntensity}
                            onChange={e => setAnimatedIntensity(Number(e.target.value))}
                            className="w-56 accent-[--color-brand-500]"
                        />
                        <span className="text-sm text-[--muted] w-10 text-right">{animatedIntensity}%</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {[0, 25, 50, 75, 100].map(preset => (
                            <button
                                key={preset}
                                onClick={() => setAnimatedIntensity(preset)}
                                className={cn(
                                    "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                                    animatedIntensity === preset
                                        ? "bg-[--color-brand-600] text-white"
                                        : "bg-[--color-gray-800] text-[--muted] hover:bg-[--color-gray-700]",
                                )}
                            >
                                {preset === 0 ? "Off" : `${preset}%`}
                            </button>
                        ))}
                    </div>

                    {/* Per-particle type controls */}
                    {config.particleTypes && Object.keys(config.particleTypes).length > 0 && (
                        <div className="space-y-3 pt-2 border-t border-[--border]">
                            <h3 className="text-sm font-medium text-[--foreground]">Particle Types</h3>
                            {Object.entries(config.particleTypes).map(([key, pt]) => {
                                const s = particleSettings[key]
                                const enabled = s?.enabled ?? pt.defaultEnabled
                                const intensity = s?.intensity ?? pt.defaultIntensity
                                return (
                                    <div key={key} className="flex items-center gap-4">
                                        <button
                                            onClick={() => setParticleTypeEnabled(key, !enabled)}
                                            className={cn(
                                                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none shrink-0",
                                                enabled ? "bg-[--color-brand-500]" : "bg-[--color-gray-700]",
                                            )}
                                            role="switch"
                                            aria-checked={enabled}
                                        >
                                            <span
                                                className={cn(
                                                    "inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform duration-200",
                                                    enabled ? "translate-x-[18px]" : "translate-x-0.5",
                                                )}
                                            />
                                        </button>
                                        <span className="text-sm text-[--foreground] w-24 shrink-0">{pt.label}</span>
                                        {enabled && (
                                            <>
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={100}
                                                    step={1}
                                                    value={intensity}
                                                    onChange={e => setParticleTypeIntensity(key, Number(e.target.value))}
                                                    className="w-36 accent-[--color-brand-500]"
                                                />
                                                <span className="text-xs text-[--muted] w-8 text-right">{intensity}%</span>
                                            </>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Custom Theme Builder */}
            <CustomThemeBuilder
                themeId={themeId}
                setThemeId={setThemeId}
                customThemeData={customThemeData}
                setCustomThemeData={setCustomThemeData}
            />

            {/* Credits */}
            <div className="rounded-xl border border-[--border] bg-[--paper] p-5 text-xs text-[--muted] space-y-1">
                <div className="font-semibold text-[--foreground] mb-2">Font credits (Google Fonts, OFL)</div>
                <div>Naruto: <span className="text-[--foreground]">Bangers</span> by Vernon Adams</div>
                <div>Bleach: <span className="text-[--foreground]">Cinzel Decorative</span> by Natanael Gama</div>
                <div>One Piece: <span className="text-[--foreground]">Boogaloo</span> by John Vargas Beltrán</div>
            </div>

            </> /* end themes tab */}
                </div>
                </div>
        </PageWrapper>
    )
}

// ─────────────────────────────────────────────────────────────────
// Reusable slider row for the Effects tab
// ─────────────────────────────────────────────────────────────────

function EffectSlider({
    label, value, min, max, step, display, fillPct, onChange, onReset,
}: {
    label: string
    value: number
    min: number
    max: number
    step: number
    display: string
    fillPct?: number
    onChange: (v: number) => void
    onReset: () => void
}) {
    const pct = fillPct ?? ((value - min) / (max - min)) * 100
    return (
        <div className="flex items-center gap-4">
            <span className="text-sm text-[--muted] w-20 shrink-0">{label}</span>
            <div className="flex-1 relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-[--color-brand-500] rounded-full transition-all" style={{ width: `${pct}%` }} />
                <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="absolute inset-0 w-full opacity-0 cursor-pointer h-full" />
            </div>
            <span className="text-sm text-[--muted] w-12 text-right tabular-nums">{display}</span>
            <button onClick={onReset} className="text-xs text-[--muted] hover:text-[--foreground] px-2 py-0.5 rounded bg-[--paper] border border-[--border] transition-colors shrink-0">Reset</button>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────
// Font picker data + preview tile
// ─────────────────────────────────────────────────────────────────

const FONT_PICKER_LIST: { family: string; label: string; href: string }[] = [
    { family: "'Bangers', cursive",           label: "Bangers",           href: "https://fonts.googleapis.com/css2?family=Bangers&display=swap" },
    { family: "'Rajdhani', sans-serif",        label: "Rajdhani",          href: "https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&display=swap" },
    { family: "'Cinzel Decorative', cursive",  label: "Cinzel Decorative", href: "https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700&display=swap" },
    { family: "'Boogaloo', cursive",           label: "Boogaloo",          href: "https://fonts.googleapis.com/css2?family=Boogaloo&display=swap" },
    { family: "'Oswald', sans-serif",          label: "Oswald",            href: "https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&display=swap" },
    { family: "'Bebas Neue', cursive",         label: "Bebas Neue",        href: "https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap" },
    { family: "'Black Han Sans', sans-serif",  label: "Black Han Sans",    href: "https://fonts.googleapis.com/css2?family=Black+Han+Sans&display=swap" },
    { family: "'Press Start 2P', cursive",     label: "Press Start 2P",    href: "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" },
    { family: "'Orbitron', sans-serif",        label: "Orbitron",          href: "https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap" },
    { family: "'Exo 2', sans-serif",           label: "Exo 2",             href: "https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;800&display=swap" },
    { family: "'Russo One', sans-serif",       label: "Russo One",         href: "https://fonts.googleapis.com/css2?family=Russo+One&display=swap" },
    { family: "'Righteous', cursive",          label: "Righteous",         href: "https://fonts.googleapis.com/css2?family=Righteous&display=swap" },
    { family: "'Permanent Marker', cursive",   label: "Permanent Marker",  href: "https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap" },
    { family: "'Rock Salt', cursive",          label: "Rock Salt",         href: "https://fonts.googleapis.com/css2?family=Rock+Salt&display=swap" },
    { family: "'Special Elite', cursive",      label: "Special Elite",     href: "https://fonts.googleapis.com/css2?family=Special+Elite&display=swap" },
    { family: "'Cinzel', serif",               label: "Cinzel",            href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&display=swap" },
    { family: "'Playfair Display', serif",     label: "Playfair Display",  href: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&display=swap" },
    { family: "'Abril Fatface', cursive",      label: "Abril Fatface",     href: "https://fonts.googleapis.com/css2?family=Abril+Fatface&display=swap" },
    { family: "'Fredoka One', cursive",        label: "Fredoka One",       href: "https://fonts.googleapis.com/css2?family=Fredoka+One&display=swap" },
    { family: "'Pacifico', cursive",           label: "Pacifico",          href: "https://fonts.googleapis.com/css2?family=Pacifico&display=swap" },
    { family: "'Lobster', cursive",            label: "Lobster",           href: "https://fonts.googleapis.com/css2?family=Lobster&display=swap" },
    { family: "'Satisfy', cursive",            label: "Satisfy",           href: "https://fonts.googleapis.com/css2?family=Satisfy&display=swap" },
    { family: "'Dancing Script', cursive",     label: "Dancing Script",    href: "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&display=swap" },
    { family: "'Caveat', cursive",             label: "Caveat",            href: "https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&display=swap" },
    { family: "'Kalam', cursive",              label: "Kalam",             href: "https://fonts.googleapis.com/css2?family=Kalam:wght@300;400;700&display=swap" },
    { family: "'Quicksand', sans-serif",       label: "Quicksand",         href: "https://fonts.googleapis.com/css2?family=Quicksand:wght@400;600;700&display=swap" },
    { family: "'Nunito', sans-serif",          label: "Nunito",            href: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;900&display=swap" },
    { family: "'Poppins', sans-serif",         label: "Poppins",           href: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;800&display=swap" },
    { family: "'Inter', sans-serif",           label: "Inter",             href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" },
    { family: "'Roboto', sans-serif",          label: "Roboto",            href: "https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&display=swap" },
    { family: "'Montserrat', sans-serif",      label: "Montserrat",        href: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;900&display=swap" },
    { family: "'Lato', sans-serif",            label: "Lato",              href: "https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap" },
    { family: "'Source Sans 3', sans-serif",   label: "Source Sans 3",     href: "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;700;900&display=swap" },
    { family: "'Raleway', sans-serif",         label: "Raleway",           href: "https://fonts.googleapis.com/css2?family=Raleway:wght@400;700;900&display=swap" },
    { family: "'Ubuntu', sans-serif",          label: "Ubuntu",            href: "https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;700&display=swap" },
    { family: "'Barlow', sans-serif",          label: "Barlow",            href: "https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;800&display=swap" },
    { family: "'Sora', sans-serif",            label: "Sora",              href: "https://fonts.googleapis.com/css2?family=Sora:wght@400;700;800&display=swap" },
    { family: "'DM Sans', sans-serif",         label: "DM Sans",           href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&display=swap" },
    { family: "'Space Grotesk', sans-serif",   label: "Space Grotesk",     href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&display=swap" },
    { family: "'Space Mono', monospace",       label: "Space Mono",        href: "https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" },
    { family: "'JetBrains Mono', monospace",   label: "JetBrains Mono",    href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" },
    { family: "'Fira Code', monospace",        label: "Fira Code",         href: "https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;700&display=swap" },
    { family: "'Share Tech Mono', monospace",  label: "Share Tech Mono",   href: "https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" },
    { family: "'VT323', monospace",            label: "VT323",             href: "https://fonts.googleapis.com/css2?family=VT323&display=swap" },
    { family: "'Chakra Petch', sans-serif",    label: "Chakra Petch",      href: "https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;700&display=swap" },
    { family: "'Audiowide', sans-serif",       label: "Audiowide",         href: "https://fonts.googleapis.com/css2?family=Audiowide&display=swap" },
    { family: "'Syncopate', sans-serif",       label: "Syncopate",         href: "https://fonts.googleapis.com/css2?family=Syncopate:wght@400;700&display=swap" },
    { family: "'Teko', sans-serif",            label: "Teko",              href: "https://fonts.googleapis.com/css2?family=Teko:wght@400;600;700&display=swap" },
    { family: "'Barlow Condensed', sans-serif",label: "Barlow Condensed",  href: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;900&display=swap" },
    { family: "'Anton', sans-serif",           label: "Anton",             href: "https://fonts.googleapis.com/css2?family=Anton&display=swap" },
    { family: "'Black Ops One', cursive",      label: "Black Ops One",     href: "https://fonts.googleapis.com/css2?family=Black+Ops+One&display=swap" },
    { family: "'Bungee', cursive",             label: "Bungee",            href: "https://fonts.googleapis.com/css2?family=Bungee&display=swap" },
    { family: "'Bungee Shade', cursive",       label: "Bungee Shade",      href: "https://fonts.googleapis.com/css2?family=Bungee+Shade&display=swap" },
    { family: "'Squada One', cursive",         label: "Squada One",        href: "https://fonts.googleapis.com/css2?family=Squada+One&display=swap" },
    { family: "'Tilt Neon', cursive",          label: "Tilt Neon",         href: "https://fonts.googleapis.com/css2?family=Tilt+Neon&display=swap" },
    { family: "'Changa', sans-serif",          label: "Changa",            href: "https://fonts.googleapis.com/css2?family=Changa:wght@400;700;800&display=swap" },
    { family: "'Graduate', serif",             label: "Graduate",          href: "https://fonts.googleapis.com/css2?family=Graduate&display=swap" },
    { family: "'Limelight', cursive",          label: "Limelight",         href: "https://fonts.googleapis.com/css2?family=Limelight&display=swap" },
    { family: "'Poiret One', cursive",         label: "Poiret One",        href: "https://fonts.googleapis.com/css2?family=Poiret+One&display=swap" },
    { family: "'Comfortaa', cursive",          label: "Comfortaa",         href: "https://fonts.googleapis.com/css2?family=Comfortaa:wght@400;700&display=swap" },
    { family: "'Varela Round', sans-serif",    label: "Varela Round",      href: "https://fonts.googleapis.com/css2?family=Varela+Round&display=swap" },
    { family: "'Josefin Sans', sans-serif",    label: "Josefin Sans",      href: "https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@400;600;700&display=swap" },
    { family: "'Josefin Slab', serif",         label: "Josefin Slab",      href: "https://fonts.googleapis.com/css2?family=Josefin+Slab:wght@400;700&display=swap" },
    { family: "'Alfa Slab One', cursive",      label: "Alfa Slab One",     href: "https://fonts.googleapis.com/css2?family=Alfa+Slab+One&display=swap" },
    { family: "'Calistoga', cursive",          label: "Calistoga",         href: "https://fonts.googleapis.com/css2?family=Calistoga&display=swap" },
    { family: "'Titan One', cursive",          label: "Titan One",         href: "https://fonts.googleapis.com/css2?family=Titan+One&display=swap" },
    { family: "'Monoton', cursive",            label: "Monoton",           href: "https://fonts.googleapis.com/css2?family=Monoton&display=swap" },
    { family: "'Megrim', cursive",             label: "Megrim",            href: "https://fonts.googleapis.com/css2?family=Megrim&display=swap" },
    { family: "'Henny Penny', cursive",        label: "Henny Penny",       href: "https://fonts.googleapis.com/css2?family=Henny+Penny&display=swap" },
    { family: "'Pirata One', cursive",         label: "Pirata One",        href: "https://fonts.googleapis.com/css2?family=Pirata+One&display=swap" },
    { family: "'MedievalSharp', cursive",      label: "MedievalSharp",     href: "https://fonts.googleapis.com/css2?family=MedievalSharp&display=swap" },
    { family: "'Caesar Dressing', cursive",    label: "Caesar Dressing",   href: "https://fonts.googleapis.com/css2?family=Caesar+Dressing&display=swap" },
    { family: "'Vast Shadow', cursive",        label: "Vast Shadow",       href: "https://fonts.googleapis.com/css2?family=Vast+Shadow&display=swap" },
    { family: "'Eater', cursive",              label: "Eater",             href: "https://fonts.googleapis.com/css2?family=Eater&display=swap" },
    { family: "'Creepster', cursive",          label: "Creepster",         href: "https://fonts.googleapis.com/css2?family=Creepster&display=swap" },
    { family: "'Nosifer', cursive",            label: "Nosifer",           href: "https://fonts.googleapis.com/css2?family=Nosifer&display=swap" },
    { family: "'Rye', cursive",                label: "Rye",               href: "https://fonts.googleapis.com/css2?family=Rye&display=swap" },
    { family: "'UnifrakturMaguntia', cursive", label: "UnifrakturMaguntia",href: "https://fonts.googleapis.com/css2?family=UnifrakturMaguntia&display=swap" },
    { family: "'MedievalSharp', cursive",      label: "Medieval Sharp",    href: "https://fonts.googleapis.com/css2?family=MedievalSharp&display=swap" },
    { family: "'Yusei Magic', sans-serif",     label: "Yusei Magic",       href: "https://fonts.googleapis.com/css2?family=Yusei+Magic&display=swap" },
    { family: "'Zen Dots', cursive",           label: "Zen Dots",          href: "https://fonts.googleapis.com/css2?family=Zen+Dots&display=swap" },
    { family: "'Zen Tokyo Zoo', cursive",      label: "Zen Tokyo Zoo",     href: "https://fonts.googleapis.com/css2?family=Zen+Tokyo+Zoo&display=swap" },
    { family: "'Stick', sans-serif",           label: "Stick",             href: "https://fonts.googleapis.com/css2?family=Stick&display=swap" },
    { family: "'New Tegomin', serif",          label: "New Tegomin",       href: "https://fonts.googleapis.com/css2?family=New+Tegomin&display=swap" },
    { family: "'Syne', sans-serif",            label: "Syne",              href: "https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&display=swap" },
    { family: "'Syne Mono', monospace",        label: "Syne Mono",         href: "https://fonts.googleapis.com/css2?family=Syne+Mono&display=swap" },
    { family: "'Outfit', sans-serif",          label: "Outfit",            href: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" },
    { family: "'Plus Jakarta Sans', sans-serif",label: "Plus Jakarta Sans",href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700;800&display=swap" },
    { family: "'Bricolage Grotesque', sans-serif",label: "Bricolage Grotesque",href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;700;800&display=swap" },
    { family: "'Lexend', sans-serif",          label: "Lexend",            href: "https://fonts.googleapis.com/css2?family=Lexend:wght@400;700;900&display=swap" },
    { family: "'Familjen Grotesk', sans-serif",label: "Familjen Grotesk",  href: "https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;700&display=swap" },
    { family: "'Geist', sans-serif",           label: "Geist",             href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;700;900&display=swap" },
    { family: "'Sono', monospace",             label: "Sono",              href: "https://fonts.googleapis.com/css2?family=Sono:wght@400;700&display=swap" },
    { family: "'Tourney', cursive",            label: "Tourney",           href: "https://fonts.googleapis.com/css2?family=Tourney:wght@400;700;900&display=swap" },
    { family: "'Saira Condensed', sans-serif", label: "Saira Condensed",   href: "https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@400;700;900&display=swap" },
    { family: "'Big Shoulders Display', cursive",label: "Big Shoulders Display",href: "https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@400;700;900&display=swap" },
    { family: "'Chivo Mono', monospace",       label: "Chivo Mono",        href: "https://fonts.googleapis.com/css2?family=Chivo+Mono:wght@400;700&display=swap" },
]

function FontPreviewTile({ family, href, label, isSelected }: { family: string; label: string; href: string; isSelected: boolean }) {
    const [loaded, setLoaded] = React.useState(false)
    React.useEffect(() => {
        if (loaded) return
        const existing = document.querySelector(`link[href="${href}"]`)
        if (existing) { setLoaded(true); return }
        const link = document.createElement("link")
        link.rel = "stylesheet"
        link.href = href
        link.onload = () => setLoaded(true)
        document.head.appendChild(link)
    }, [href, loaded])
    return (
        <div>
            <p className="text-xs font-bold leading-tight truncate" style={{ fontFamily: loaded ? family : "inherit" }}>Aa</p>
            <p className={cn("text-[10px] mt-0.5 truncate leading-tight", isSelected ? "text-[--color-brand-300]" : "text-[--muted]")}>{label}</p>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────
// Wallpapers tab — per-theme wallpaper shop + downloaded grid
// ─────────────────────────────────────────────────────────────────

function WallpaperShopTab({
    themeId,
    downloadedBgs,
    themedDownloadedBgs,
    bgsLoading,
    activeBackgroundUrl,
    setActiveBackgroundUrl,
    deleteMutation,
    downloadBgMutation,
    config,
    resolveThemeBgUrl,
}: {
    themeId: string
    downloadedBgs: import("@/api/hooks/theme_backgrounds.hooks").ThemeBgFile[]
    themedDownloadedBgs: import("@/api/hooks/theme_backgrounds.hooks").ThemeBgFile[]
    bgsLoading: boolean
    activeBackgroundUrl: string | null
    setActiveBackgroundUrl: (url: string | null) => void
    deleteMutation: ReturnType<typeof useDeleteThemeBackground>
    downloadBgMutation: ReturnType<typeof useDownloadThemeBackground>
    config: { backgroundImageUrl?: string; fontFamily?: string; id?: string; displayName?: string }
    resolveThemeBgUrl: (url: string) => string
}) {
    const [pickerOpen, setPickerOpen] = React.useState(false)
    const theme = ANIME_THEMES[themeId as AnimeThemeId]

    return (
        <div className="space-y-6">
            {/* Your Downloads — half-height scrollable for current theme only */}
            <div className="rounded-2xl border border-[--border] bg-[--paper] p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-semibold">Your Downloads</h2>
                        <p className="text-xs text-[--muted] mt-0.5">
                            {themedDownloadedBgs.length} wallpaper{themedDownloadedBgs.length !== 1 ? "s" : ""} for {theme?.displayName ?? "this theme"}
                        </p>
                    </div>
                    <button
                        onClick={() => setPickerOpen(true)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[--color-brand-600] hover:bg-[--color-brand-500] text-white text-xs font-medium transition-colors"
                    >
                        <LuSearch className="w-3 h-3" />
                        Search Wallhaven
                    </button>
                </div>

                {/* Half-height scrollable container */}
                <div className="max-h-[50vh] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
                    {themedDownloadedBgs.length === 0 && !bgsLoading ? (
                        <div className="text-center py-8 text-[--muted] text-sm border border-dashed border-[--border] rounded-xl">
                            <LuImage className="w-6 h-6 mx-auto mb-2 opacity-40" />
                            <p>No wallpapers downloaded yet.</p>
                            <p className="text-xs mt-1">Search Wallhaven or browse new wallpapers below.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                            {config.backgroundImageUrl && (
                                <button
                                    onClick={() => setActiveBackgroundUrl(config.backgroundImageUrl!)}
                                    className={cn(
                                        "relative aspect-video rounded-lg overflow-hidden border-2 transition-all",
                                        activeBackgroundUrl === config.backgroundImageUrl
                                            ? "border-[--color-brand-400]"
                                            : "border-transparent hover:border-white/30",
                                    )}
                                >
                                    <img src={config.backgroundImageUrl} alt="Default" className="w-full h-full object-cover" loading="lazy" />
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-[9px] text-white/70 text-center py-0.5">Default</div>
                                </button>
                            )}
                            {bgsLoading && !downloadedBgs.length && Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="aspect-video rounded-lg bg-white/5 animate-pulse" />
                            ))}
                            {themedDownloadedBgs.map(bg => (
                                <div key={bg.filename} className="relative group">
                                    <button
                                        onClick={() => setActiveBackgroundUrl(resolveThemeBgUrl(bg.url))}
                                        className={cn(
                                            "relative aspect-video w-full rounded-lg overflow-hidden border-2 transition-all",
                                            activeBackgroundUrl === resolveThemeBgUrl(bg.url)
                                                ? "border-[--color-brand-400]"
                                                : "border-transparent hover:border-white/30",
                                        )}
                                    >
                                        <img src={resolveThemeBgUrl(bg.url)} alt="" className="w-full h-full object-cover" loading="lazy" />
                                        {activeBackgroundUrl === resolveThemeBgUrl(bg.url) && (
                                            <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-[--color-brand-500] flex items-center justify-center">
                                                <LuCheck className="w-2.5 h-2.5 text-white" />
                                            </div>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => {
                                            deleteMutation.mutate(bg.filename)
                                            if (activeBackgroundUrl === resolveThemeBgUrl(bg.url)) setActiveBackgroundUrl(config.backgroundImageUrl ?? null)
                                        }}
                                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white/60 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px]"
                                    >✕</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* New Wallpapers — current theme only */}
            {config.id !== "seanime" && (
                <div className="rounded-2xl border border-[--border] bg-[--paper] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[--border] bg-[--paper]">
                        <h2 className="text-base font-semibold">New Wallpapers</h2>
                        <p className="text-xs text-[--muted] mt-0.5">Discover and download new wallpapers for {theme?.displayName ?? "this theme"}</p>
                    </div>
                    <div className="p-4">
                        <CurrentThemeWallpaperRow
                            themeId={themeId as AnimeThemeId}
                            downloadedBgs={downloadedBgs}
                            activeBackgroundUrl={activeBackgroundUrl}
                            setActiveBackgroundUrl={setActiveBackgroundUrl}
                            downloadBgMutation={downloadBgMutation}
                        />
                    </div>
                </div>
            )}

            <WallhavenPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} />
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────
// Current Theme Wallpaper Row — shows Wallhaven wallpapers for current theme
// ─────────────────────────────────────────────────────────────────

function CurrentThemeWallpaperRow({
    themeId,
    downloadedBgs,
    activeBackgroundUrl,
    setActiveBackgroundUrl,
    downloadBgMutation,
}: {
    themeId: AnimeThemeId
    downloadedBgs: ThemeBgFile[]
    activeBackgroundUrl: string | null
    setActiveBackgroundUrl: (url: string | null) => void
    downloadBgMutation: ReturnType<typeof useDownloadThemeBackground>
}) {
    const [downloadingIds, setDownloadingIds] = React.useState<Set<string>>(new Set())
    const theme = ANIME_THEMES[themeId]
    const query = WALLHAVEN_CURATED_QUERY[themeId]

    const { data, isFetching, isError } = useSearchWallhaven(query, 1, !!query)
    const wallpapers: WallhavenWallpaper[] = data?.data?.slice(0, 12) ?? []

    // Map from wallhaven ID → local URL
    const downloadedIdMap = React.useMemo(() => {
        const m = new Map<string, string>()
        downloadedBgs.forEach(bg => {
            const id = extractWallhavenId(bg.url)
            m.set(id, bg.url)
        })
        return m
    }, [downloadedBgs])

    const isDownloaded = (w: WallhavenWallpaper) => downloadedIdMap.has(w.id)
    const localUrl = (w: WallhavenWallpaper) => downloadedIdMap.get(w.id) ?? null

    const handleDownload = async (w: WallhavenWallpaper) => {
        setDownloadingIds(prev => new Set(prev).add(w.id))
        try {
            const result = await downloadBgMutation.mutateAsync({ url: w.path, themeId })
            if (result) setActiveBackgroundUrl(result.url)
        } catch { /* ignored */ } finally {
            setDownloadingIds(prev => { const s = new Set(prev); s.delete(w.id); return s })
        }
    }

    if (isError) {
        return <p className="text-xs text-red-400 py-2">Could not load wallpapers.</p>
    }

    if (!query) {
        return (
            <div className="text-center py-6 text-[--muted] text-sm">
                <p>No curated wallpapers available for this theme.</p>
                <p className="text-xs mt-1">Use the search button above to find wallpapers on Wallhaven.</p>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {isFetching && wallpapers.length === 0 && (
                <div className="flex gap-2 overflow-x-auto">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="shrink-0 rounded-xl bg-white/5 animate-pulse" style={{ width: 160, height: 100 }} />
                    ))}
                </div>
            )}

            {wallpapers.length > 0 && (
                <>
                    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
                        {wallpapers.map(w => (
                            <div key={w.id} className="relative group shrink-0 rounded-xl overflow-hidden border-2 transition-all"
                                style={{ width: 160, height: 100, borderColor: activeBackgroundUrl && (activeBackgroundUrl === localUrl(w) || activeBackgroundUrl.includes(w.id)) ? "var(--color-brand-400)" : "transparent" }}
                            >
                                <img src={w.thumbs.small} alt="" className="w-full h-full object-cover" loading="lazy" />
                                {isDownloaded(w) && !downloadingIds.has(w.id) && (
                                    <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-green-500/90 flex items-center justify-center">
                                        <LuCheck className="w-3 h-3 text-white" />
                                    </div>
                                )}
                                <div className="absolute bottom-1 left-1 bg-black/60 text-white/60 text-[9px] px-1 rounded">{w.resolution}</div>
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    {downloadingIds.has(w.id) && (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    )}
                                    {!downloadingIds.has(w.id) && !isDownloaded(w) && (
                                        <button onClick={() => handleDownload(w)}
                                            className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors">
                                            <LuDownload className="w-4 h-4 text-white" />
                                        </button>
                                    )}
                                    {!downloadingIds.has(w.id) && isDownloaded(w) && (
                                        <button onClick={() => { const url = localUrl(w); if (url) setActiveBackgroundUrl(url) }}
                                            className="w-9 h-9 rounded-full bg-[--color-brand-500]/80 hover:bg-[--color-brand-400] flex items-center justify-center transition-colors">
                                            <LuImage className="w-4 h-4 text-white" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="text-[10px] text-[--muted]">{wallpapers.length} curated wallpapers from Wallhaven</p>
                </>
            )}
        </div>
    )
}

/** Extract the Wallhaven wallpaper ID from either a CDN URL or a local /theme-bg/ URL. */
function extractWallhavenId(url: string): string {
    // CDN URL: https://w.wallhaven.cc/full/ab/wallhaven-abc123.jpg  → "abc123"
    const cdnMatch = url.match(/wallhaven-([a-zA-Z0-9]+)\.[a-z]+$/)
    if (cdnMatch) return cdnMatch[1]
    // New themed local URL: /theme-bg/wh-{themeId}-abc123.jpg  → "abc123"
    const themedMatch = url.match(/\/wh-[^-]+-([a-zA-Z0-9]+)\.[a-z]+$/)
    if (themedMatch) return themedMatch[1]
    // Legacy local URL: /theme-bg/wh-abc123.jpg  → "abc123"
    const localMatch = url.match(/\/wh-([a-zA-Z0-9]+)\.[a-z]+$/)
    if (localMatch) return localMatch[1]
    return url // fallback: use full URL as key
}

// ─────────────────────────────────────────────────────────────────
// Inline slider row — used inside the per-card gear popover
// ─────────────────────────────────────────────────────────────────

type InlineSliderRowProps = {
    label: string
    value: number
    onChange: (v: number) => void
    min: number
    max: number
    step: number
    display: (v: number) => string
    onReset: () => void
}

function InlineSliderRow({ label, value, onChange, min, max, step, display, onReset }: InlineSliderRowProps) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-[11px] text-white/50 w-16 shrink-0">{label}</span>
            <div className="flex-1 relative h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                    className="absolute inset-y-0 left-0 bg-[--color-brand-500] rounded-full"
                    style={{ width: `${((value - min) / (max - min)) * 100}%` }}
                />
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={e => onChange(Number(e.target.value))}
                    onClick={e => e.stopPropagation()}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                />
            </div>
            <span className="text-[11px] text-white/50 w-9 text-right tabular-nums">{display(value)}</span>
            <button
                onClick={e => { e.stopPropagation(); onReset() }}
                className="text-[10px] text-white/30 hover:text-white/70 px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 transition-colors leading-none"
            >↺</button>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────
// Theme card
// ─────────────────────────────────────────────────────────────────

interface ThemeCardProps {
    theme: AnimeThemeConfig
    isActive: boolean
    onSelect: () => void
    onSettingsClick: () => void
}

function ThemeCard({ theme, isActive, onSelect, onSettingsClick }: ThemeCardProps) {
    const bgUrl = theme.backgroundImageUrl
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect() }}
            className={cn(
                "group/card relative rounded-xl overflow-hidden text-left cursor-pointer transition-all duration-200 border-2",
                "hover:scale-[1.02] active:scale-[0.98]",
                isActive
                    ? "border-[--color-brand-500] shadow-lg shadow-[rgba(0,0,0,0.5)]"
                    : "border-[--border] hover:border-[--color-brand-700]",
            )}
        >
            {/* Art banner — blurred background image or color gradient fallback */}
            <div className="relative h-24 w-full overflow-hidden">
                {bgUrl ? (
                    <>
                        <img
                            src={bgUrl.startsWith("/") ? `${getServerBaseUrl()}${bgUrl}` : bgUrl}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover scale-110"
                            style={{ filter: "blur(6px) brightness(0.55) saturate(1.4)" }}
                            loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/70" />
                    </>
                ) : (
                    <div
                        className="absolute inset-0"
                        style={{ background: `linear-gradient(135deg, ${theme.previewColors.bg} 0%, color-mix(in srgb, ${theme.previewColors.bg} 60%, ${theme.previewColors.primary}) 100%)` }}
                    />
                )}
                {/* Active dot */}
                {isActive && (
                    <div className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-[--color-brand-400] shadow-[0_0_8px_2px_rgba(0,0,0,0.4)]" />
                )}
                {/* Settings button */}
                {theme.id !== "seanime" && (
                    <button
                        onClick={e => { e.stopPropagation(); onSettingsClick() }}
                        title="Theme settings"
                        className={cn(
                            "absolute top-1.5 left-1.5 w-6 h-6 flex items-center justify-center text-white/60 hover:text-white rounded-md hover:bg-black/40 transition-all duration-150",
                            "opacity-0 group-hover/card:opacity-100",
                            isActive && "opacity-100",
                        )}
                    >
                        <LuSettings2 className="w-3.5 h-3.5" />
                    </button>
                )}
                {/* Color swatches bottom-left */}
                <div className="absolute bottom-2 left-2 flex gap-1">
                    {[theme.previewColors.primary, theme.previewColors.secondary, theme.previewColors.accent].map((color, i) => (
                        <div key={i} className="w-3 h-3 rounded-full border border-white/20" style={{ background: color }} />
                    ))}
                </div>
            </div>
            {/* Label row */}
            <div
                className="px-3 py-2 text-left"
                style={{ background: `linear-gradient(180deg, ${theme.previewColors.bg} 0%, color-mix(in srgb, ${theme.previewColors.bg} 90%, ${theme.previewColors.primary}) 100%)` }}
            >
                <div className="font-bold text-sm text-white leading-tight" style={{ fontFamily: theme.fontFamily ?? "inherit" }}>
                    {theme.displayName}
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────
// Slide-out theme settings panel
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// Side-panel wallpaper picker (used inside ThemeSettingsPanel)
// ─────────────────────────────────────────────────────────────────

function SidePanelWallpaperPicker({
    config,
    activeBackgroundUrl,
    setActiveBackgroundUrl,
    downloadedBgs,
    downloadBgMutation,
}: {
    config: AnimeThemeConfig
    activeBackgroundUrl: string | null
    setActiveBackgroundUrl: (url: string | null) => void
    downloadedBgs: ThemeBgFile[] | undefined
    downloadBgMutation: ReturnType<typeof useDownloadThemeBackground>
}) {
    const curatedQuery = config.id !== "seanime" ? (WALLHAVEN_CURATED_QUERY[config.id as AnimeThemeId] ?? "") : ""
    const [page, setPage] = React.useState(1)
    const [wallEnabled, setWallEnabled] = React.useState(false)
    const { data: wallData, isFetching } = useSearchWallhaven(curatedQuery, page, wallEnabled && config.id !== "seanime" && !!curatedQuery)
    const wallpapers: WallhavenWallpaper[] = wallData?.data ?? []
    const hasMore = wallData?.meta && page < wallData.meta.last_page
    const [downloadingId, setDownloadingId] = React.useState<string | null>(null)

    const handleDownload = async (w: WallhavenWallpaper) => {
        if (downloadingId) return
        setDownloadingId(w.id)
        try {
            const result = await downloadBgMutation.mutateAsync({ url: w.path })
            if (result) setActiveBackgroundUrl(result.url)
        } catch { } finally {
            setDownloadingId(null)
        }
    }

    // Map wallhaven ID → resolved local URL
    const downloadedIdMap = React.useMemo(() => {
        const m = new Map<string, string>()
        ;(downloadedBgs ?? []).forEach(bg => {
            const resolved = resolveThemeBgUrl(bg.url)
            const m2 = bg.url.match(/\/wh-([a-zA-Z0-9]+)\.[a-z]+$/)
            if (m2) m.set(m2[1], resolved)
            else m.set(bg.url, resolved)
        })
        return m
    }, [downloadedBgs])
    const whIsDownloaded = (w: WallhavenWallpaper) => downloadedIdMap.has(w.id)
    const whLocalUrl = (w: WallhavenWallpaper) => downloadedIdMap.get(w.id) ?? null

    return (
        <div className="space-y-2">
            {/* Downloaded wallpapers */}
            {(downloadedBgs ?? []).length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-[10px] text-[--muted] uppercase tracking-wider font-semibold">Your downloads</p>
                    <div className="flex gap-1.5 flex-wrap">
                        {config.backgroundImageUrl && (
                            <ThumbnailSlot
                                url={config.backgroundImageUrl}
                                label="Default"
                                isActive={activeBackgroundUrl === config.backgroundImageUrl}
                                onClick={() => setActiveBackgroundUrl(config.backgroundImageUrl!)}
                            />
                        )}
                        {(downloadedBgs ?? []).map(bg => {
                            const resolvedUrl = resolveThemeBgUrl(bg.url)
                            return (
                                <ThumbnailSlot
                                    key={bg.filename}
                                    url={resolvedUrl}
                                    isActive={activeBackgroundUrl === resolvedUrl}
                                    deletable
                                    onClick={() => setActiveBackgroundUrl(resolvedUrl)}
                                    onDelete={() => {
                                        if (activeBackgroundUrl === resolvedUrl) setActiveBackgroundUrl(config.backgroundImageUrl ?? null)
                                    }}
                                />
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Wallhaven top picks — lazy */}
            {curatedQuery && (
                <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                        <LuSparkles className="w-3 h-3 text-[--color-brand-400]" />
                        <p className="text-[10px] text-[--muted] uppercase tracking-wider font-semibold">Top Picks</p>
                        {!wallEnabled && (
                            <button onClick={() => setWallEnabled(true)} className="ml-auto text-[10px] text-[--color-brand-400] hover:text-[--color-brand-300] transition-colors">Load</button>
                        )}
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                        {wallEnabled && isFetching && wallpapers.length === 0 && (
                            Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="w-[86px] h-[54px] rounded-lg bg-white/5 animate-pulse shrink-0" />
                            ))
                        )}
                        {wallpapers.map(w => {
                            const isDownloaded = whIsDownloaded(w)
                            const lurl = whLocalUrl(w)
                            const isActive = (lurl !== null && activeBackgroundUrl === lurl) || !!activeBackgroundUrl?.includes(w.id)
                            return (
                                <button
                                    key={w.id}
                                    onClick={() => {
                                        if (isDownloaded && lurl) { setActiveBackgroundUrl(lurl); return }
                                        handleDownload(w)
                                    }}
                                    disabled={!!downloadingId}
                                    title={isDownloaded ? "Apply wallpaper" : `${w.resolution} — click to download & set`}
                                    className={cn(
                                        "relative shrink-0 rounded-lg overflow-hidden border-2 transition-all duration-150",
                                        "w-[86px] h-[54px]",
                                        isActive ? "border-[--color-brand-400]" : isDownloaded ? "border-green-500/60" : "border-transparent hover:border-[--color-brand-500]",
                                    )}
                                >
                                    <img src={w.thumbs.small} alt="" className="w-full h-full object-cover" loading="lazy" />
                                    {downloadingId === w.id && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        </div>
                                    )}
                                    {isDownloaded && !isActive && (
                                        <div className="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-green-500/90 flex items-center justify-center">
                                            <LuCheck className="w-2 h-2 text-white" />
                                        </div>
                                    )}
                                    <div className="absolute bottom-0.5 right-0.5 bg-black/50 text-white/60 text-[8px] px-0.5 rounded leading-tight">{w.resolution}</div>
                                </button>
                            )
                        })}
                    </div>
                    {hasMore && (
                        <button
                            onClick={() => setPage(p => p + 1)}
                            disabled={isFetching}
                            className="w-full py-1.5 text-xs text-[--muted] hover:text-[--foreground] border border-[--border] hover:border-[--color-brand-700] rounded-lg transition-colors"
                        >
                            {isFetching ? "Loading…" : "Load more"}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}

interface ThemeSettingsPanelProps {
    open: boolean
    onClose: () => void
    config: AnimeThemeConfig
    brandColorOverride: string | null
    setBrandColorOverride: (v: string | null) => void
    backgroundDim: number
    setBackgroundDim: (v: number) => void
    backgroundBlur: number
    setBackgroundBlur: (v: number) => void
    backgroundExposure: number
    setBackgroundExposure: (v: number) => void
    backgroundSaturation: number
    setBackgroundSaturation: (v: number) => void
    backgroundContrast: number
    setBackgroundContrast: (v: number) => void
    vignetteStrength: number
    setVignetteStrength: (v: number) => void
    vignetteSize: number
    setVignetteSize: (v: number) => void
    glowStrength: number
    setGlowStrength: (v: number) => void
    glowSpeed: number
    setGlowSpeed: (v: number) => void
    glowScale: number
    setGlowScale: (v: number) => void
    scanlinesStrength: number
    setScanlinesStrength: (v: number) => void
    scanlinesSize: number
    setScanlinesSize: (v: number) => void
    noiseStrength: number
    setNoiseStrength: (v: number) => void
    noiseSpeed: number
    setNoiseSpeed: (v: number) => void
    activeBackgroundUrl: string | null
    setActiveBackgroundUrl: (url: string | null) => void
    downloadedBgs: ThemeBgFile[] | undefined
    downloadBgMutation: ReturnType<typeof useDownloadThemeBackground>
}

function ThemeSettingsPanel({
    open, onClose, config,
    brandColorOverride, setBrandColorOverride,
    backgroundDim, setBackgroundDim,
    backgroundBlur, setBackgroundBlur,
    backgroundExposure, setBackgroundExposure,
    backgroundSaturation, setBackgroundSaturation,
    backgroundContrast, setBackgroundContrast,
    vignetteStrength, setVignetteStrength,
    vignetteSize, setVignetteSize,
    glowStrength, setGlowStrength,
    glowSpeed, setGlowSpeed,
    glowScale, setGlowScale,
    scanlinesStrength, setScanlinesStrength,
    scanlinesSize, setScanlinesSize,
    noiseStrength, setNoiseStrength,
    noiseSpeed, setNoiseSpeed,
    activeBackgroundUrl, setActiveBackgroundUrl,
    downloadedBgs, downloadBgMutation,
}: ThemeSettingsPanelProps) {
    const [colorInput, setColorInput] = React.useState(brandColorOverride ?? "")
    React.useEffect(() => { setColorInput(brandColorOverride ?? "") }, [brandColorOverride, open])

    // Preview shades from current override
    const previewShades = brandColorOverride ? deriveBrandShades(brandColorOverride) : null

    const handleColorText = (v: string) => {
        setColorInput(v)
        if (/^#[0-9a-fA-F]{6}$/.test(v)) setBrandColorOverride(v)
        else if (!v) setBrandColorOverride(null)
    }

    const isSeanime = config.id === "seanime"

    return (
        <>
            {/* Backdrop — click outside closes panel */}
            <div
                className={cn(
                    "fixed inset-0 z-[9990] transition-opacity duration-300",
                    open ? "pointer-events-auto bg-black/30" : "pointer-events-none opacity-0",
                )}
                onClick={onClose}
            />
            {/* Panel */}
            <div
                className={cn(
                    "fixed right-0 top-0 h-full w-80 z-[9991] flex flex-col",
                    "bg-[--background] border-l border-[--border] shadow-2xl",
                    "transform transition-transform duration-300 ease-in-out",
                    open ? "translate-x-0" : "translate-x-full",
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-[--border] shrink-0">
                    <div>
                        <p className="text-[10px] text-[--muted] uppercase tracking-widest">Theme Settings</p>
                        <h3 className="font-bold text-[--foreground] mt-0.5" style={{ fontFamily: config.fontFamily }}>
                            {config.displayName}
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-[--muted] hover:text-[--foreground] hover:bg-white/5 transition-colors"
                    >
                        <LuX className="w-4 h-4" />
                    </button>
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-7" style={{ scrollbarWidth: "thin" }}>
                    {isSeanime ? (
                        <p className="text-sm text-[--muted]">Select an anime theme to customize its settings.</p>
                    ) : (
                        <>
                            {/* ── Brand Color ── */}
                            <section className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <LuPalette className="w-3.5 h-3.5 text-[--color-brand-400]" />
                                    <p className="text-[10px] font-semibold text-[--muted] uppercase tracking-widest">Brand Color</p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="relative shrink-0">
                                        <input
                                            type="color"
                                            value={brandColorOverride ?? config.previewColors.primary}
                                            onChange={e => setBrandColorOverride(e.target.value)}
                                            className="w-10 h-10 rounded-xl cursor-pointer border-2 border-[--border] bg-transparent p-0.5"
                                        />
                                    </div>
                                    <input
                                        type="text"
                                        value={colorInput}
                                        placeholder="Default (theme color)"
                                        onChange={e => handleColorText(e.target.value)}
                                        className="flex-1 min-w-0 bg-[--paper] border border-[--border] rounded-lg px-3 py-2 text-sm text-[--foreground] placeholder:text-[--muted] font-mono focus:outline-none focus:border-[--color-brand-500] transition-colors"
                                    />
                                </div>

                                {/* Preview swatches */}
                                {previewShades && (
                                    <div className="flex gap-1.5">
                                        {["300", "400", "500", "600", "700"].map(level => (
                                            <div key={level} className="flex flex-col items-center gap-1">
                                                <div className="w-7 h-7 rounded-md border border-white/10" style={{ background: previewShades[`--color-brand-${level}-hex`] ?? previewShades[`--color-brand-${level}`] }} />
                                                <span className="text-[8px] text-[--muted]">{level}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {brandColorOverride && (
                                    <button
                                        onClick={() => setBrandColorOverride(null)}
                                        className="text-xs text-[--muted] hover:text-[--foreground] px-3 py-1.5 rounded-lg bg-[--paper] border border-[--border] transition-colors w-full text-center"
                                    >
                                        Reset to theme default
                                    </button>
                                )}
                            </section>

                            {/* ── Background sliders (at top) ── */}
                            <section className="space-y-3">
                                <p className="text-[10px] font-semibold text-[--muted] uppercase tracking-widest">Background</p>
                                <InlineSliderRow label="Dim" value={backgroundDim} onChange={setBackgroundDim} min={0} max={1} step={0.01} display={v => `${Math.round(v * 100)}%`} onReset={() => setBackgroundDim(config.backgroundDim ?? 0.30)} />
                                <InlineSliderRow label="Blur" value={backgroundBlur} onChange={setBackgroundBlur} min={0} max={60} step={1} display={v => `${v}px`} onReset={() => setBackgroundBlur(config.backgroundBlur ?? 30)} />
                                <InlineSliderRow label="Exposure" value={backgroundExposure} onChange={setBackgroundExposure} min={0.1} max={2.5} step={0.05} display={v => `${Math.round(v * 100)}%`} onReset={() => setBackgroundExposure(1.0)} />
                                <InlineSliderRow label="Saturation" value={backgroundSaturation} onChange={setBackgroundSaturation} min={0} max={3.0} step={0.05} display={v => `${Math.round(v * 100)}%`} onReset={() => setBackgroundSaturation(1.0)} />
                                <InlineSliderRow label="Contrast" value={backgroundContrast} onChange={setBackgroundContrast} min={0} max={3.0} step={0.05} display={v => `${Math.round(v * 100)}%`} onReset={() => setBackgroundContrast(1.0)} />
                            </section>

                            {/* ── Vignette ── */}
                            <section className="space-y-3">
                                <p className="text-[10px] font-semibold text-[--muted] uppercase tracking-widest">Vignette</p>
                                <InlineSliderRow label="Strength" value={vignetteStrength} onChange={setVignetteStrength} min={0} max={1} step={0.01} display={v => `${Math.round(v * 100)}%`} onReset={() => setVignetteStrength(0)} />
                                <InlineSliderRow label="Size" value={vignetteSize} onChange={setVignetteSize} min={0} max={1} step={0.01} display={v => `${Math.round(v * 100)}%`} onReset={() => setVignetteSize(0.5)} />
                            </section>

                            {/* ── Shimmer Glow ── */}
                            <section className="space-y-3">
                                <p className="text-[10px] font-semibold text-[--muted] uppercase tracking-widest">Shimmer Glow</p>
                                <InlineSliderRow label="Strength" value={glowStrength} onChange={setGlowStrength} min={0} max={1} step={0.01} display={v => `${Math.round(v * 100)}%`} onReset={() => setGlowStrength(0)} />
                                <InlineSliderRow label="Speed" value={glowSpeed} onChange={setGlowSpeed} min={0.2} max={5} step={0.1} display={v => `${v.toFixed(1)}x`} onReset={() => setGlowSpeed(2)} />
                                <InlineSliderRow label="Scale" value={glowScale} onChange={setGlowScale} min={0} max={1} step={0.01} display={v => `${Math.round(v * 100)}%`} onReset={() => setGlowScale(0.5)} />
                            </section>

                            {/* ── Scanlines ── */}
                            <section className="space-y-3">
                                <p className="text-[10px] font-semibold text-[--muted] uppercase tracking-widest">Scanlines</p>
                                <InlineSliderRow label="Strength" value={scanlinesStrength} onChange={setScanlinesStrength} min={0} max={1} step={0.01} display={v => `${Math.round(v * 100)}%`} onReset={() => setScanlinesStrength(0)} />
                                <InlineSliderRow label="Spacing" value={scanlinesSize} onChange={setScanlinesSize} min={0} max={1} step={0.01} display={v => `${Math.round(v * 100)}%`} onReset={() => setScanlinesSize(0.5)} />
                            </section>

                            {/* ── Film Noise ── */}
                            <section className="space-y-3">
                                <p className="text-[10px] font-semibold text-[--muted] uppercase tracking-widest">Film Noise</p>
                                <InlineSliderRow label="Strength" value={noiseStrength} onChange={setNoiseStrength} min={0} max={1} step={0.01} display={v => `${Math.round(v * 100)}%`} onReset={() => setNoiseStrength(0)} />
                                <InlineSliderRow label="Speed" value={noiseSpeed} onChange={setNoiseSpeed} min={0.1} max={5} step={0.1} display={v => `${v.toFixed(1)}x`} onReset={() => setNoiseSpeed(1)} />
                            </section>

                            {/* ── Wallpaper (below sliders) ── */}
                            <section className="space-y-3">
                                <p className="text-[10px] font-semibold text-[--muted] uppercase tracking-widest">Wallpaper</p>
                                <SidePanelWallpaperPicker
                                    config={config}
                                    activeBackgroundUrl={activeBackgroundUrl}
                                    setActiveBackgroundUrl={setActiveBackgroundUrl}
                                    downloadedBgs={downloadedBgs}
                                    downloadBgMutation={downloadBgMutation}
                                />
                            </section>
                        </>
                    )}
                </div>
            </div>
        </>
    )
}

// ─────────────────────────────────────────────────────────────────
// Thumbnail slot component
// ─────────────────────────────────────────────────────────────────

type ThumbnailSlotProps = {
    url: string
    label?: string
    isActive: boolean
    deletable?: boolean
    onClick: () => void
    onDelete?: () => void
}

function ThumbnailSlot({ url, label, isActive, deletable, onClick, onDelete }: ThumbnailSlotProps) {
    const [loaded, setLoaded] = React.useState(false)
    return (
        <div
            className={cn(
                "relative shrink-0 w-28 h-[70px] rounded-xl overflow-hidden cursor-pointer transition-all duration-200",
                "border-2",
                isActive
                    ? "border-[--color-brand-400] shadow-[0_0_0_1px_var(--color-brand-400),0_0_12px_2px_rgba(0,0,0,0.5)]"
                    : "border-transparent hover:border-white/30",
            )}
            onClick={onClick}
        >
            {!loaded && <div className="absolute inset-0 bg-white/5 animate-pulse" />}
            <img
                src={url}
                alt=""
                loading="lazy"
                onLoad={() => setLoaded(true)}
                className={cn(
                    "w-full h-full object-cover transition-opacity duration-300",
                    loaded ? "opacity-100" : "opacity-0",
                )}
            />
            {/* Active checkmark */}
            {isActive && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-6 h-6 rounded-full bg-[--color-brand-500]/90 flex items-center justify-center shadow-lg">
                        <span className="text-white text-xs font-bold">✓</span>
                    </div>
                </div>
            )}
            {/* Label badge */}
            {label && (
                <div className="absolute bottom-1 left-1">
                    <span className="text-[9px] font-semibold bg-black/70 text-white/90 px-1.5 py-0.5 rounded-md backdrop-blur-sm">
                        {label}
                    </span>
                </div>
            )}
            {/* Delete button */}
            {deletable && onDelete && (
                <button
                    onClick={e => { e.stopPropagation(); onDelete() }}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center text-white/70 hover:bg-red-600 hover:text-white transition-colors text-[10px] leading-none backdrop-blur-sm"
                >
                    ✕
                </button>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────
// Custom Theme Builder
// ─────────────────────────────────────────────────────────────────

interface CustomThemeBuilderProps {
    themeId: AnimeThemeId
    setThemeId: (id: AnimeThemeId) => void
    customThemeData: CustomThemeData | null
    setCustomThemeData: (data: CustomThemeData) => void
}

function CustomThemeBuilder({ themeId, setThemeId, customThemeData, setCustomThemeData }: CustomThemeBuilderProps) {
    const isActive = themeId === "custom"
    const [draft, setDraft] = React.useState<CustomThemeData>(() => customThemeData ?? DEFAULT_CUSTOM_THEME_DATA)

    // Sync from external when opened
    React.useEffect(() => {
        if (customThemeData) setDraft(customThemeData)
    }, [customThemeData])

    const previewShades = React.useMemo(() => deriveBrandShadesFromHex(draft.brandColor), [draft.brandColor])

    const update = (patch: Partial<CustomThemeData>) => {
        const next = { ...draft, ...patch }
        setDraft(next)
        if (isActive) setCustomThemeData(next)
    }

    const handleApply = () => {
        setCustomThemeData(draft)
        setThemeId("custom" as AnimeThemeId)
    }

    const handleReset = () => {
        setDraft(DEFAULT_CUSTOM_THEME_DATA)
        if (isActive) setCustomThemeData(DEFAULT_CUSTOM_THEME_DATA)
    }

    // Inject font preview into head so the font picker dropdown shows live previews
    const [previewFontHref, setPreviewFontHref] = React.useState("")
    React.useEffect(() => {
        if (!previewFontHref) return
        const el = document.createElement("link")
        el.rel = "stylesheet"
        el.href = previewFontHref
        el.id = "custom-theme-font-preview"
        const prev = document.getElementById("custom-theme-font-preview")
        if (prev) prev.remove()
        document.head.appendChild(el)
    }, [previewFontHref])

    const selectedFont = CUSTOM_THEME_FONT_OPTIONS.find((f: { value: string }) => f.value === (draft.fontFamily ?? "")) ?? CUSTOM_THEME_FONT_OPTIONS[0]

    return (
        <div className="rounded-2xl border border-[--border] bg-[--paper] p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-0.5">
                        <LuPalette className="w-4 h-4 text-[--color-brand-400]" />
                        <h2 className="text-xl font-semibold" style={{ fontFamily: draft.fontFamily }}>Custom Theme</h2>
                        {isActive && (
                            <span className="flex items-center gap-1 text-xs font-semibold text-[--color-brand-400] bg-[--color-brand-900]/40 border border-[--color-brand-700]/40 px-2 py-0.5 rounded-full">
                                <LuCheck className="w-3 h-3" /> Active
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-[--muted]">Build your own fully personalized theme with custom colors and font.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* ── Controls ── */}
                <div className="space-y-5">
                    {/* Name */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-[--muted] uppercase tracking-wider">Theme Name</label>
                        <input
                            type="text"
                            value={draft.displayName}
                            onChange={e => update({ displayName: e.target.value })}
                            className="w-full bg-[--background] border border-[--border] rounded-xl px-3 py-2 text-sm text-[--foreground] focus:outline-none focus:border-[--color-brand-500] transition-colors"
                            style={{ fontFamily: draft.fontFamily }}
                        />
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-[--muted] uppercase tracking-wider">Description</label>
                        <input
                            type="text"
                            value={draft.description}
                            onChange={e => update({ description: e.target.value })}
                            className="w-full bg-[--background] border border-[--border] rounded-xl px-3 py-2 text-sm text-[--foreground] focus:outline-none focus:border-[--color-brand-500] transition-colors"
                        />
                    </div>

                    {/* Brand Color */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-[--muted] uppercase tracking-wider">Brand Color</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="color"
                                value={draft.brandColor}
                                onChange={e => update({ brandColor: e.target.value })}
                                className="w-10 h-10 rounded-xl cursor-pointer border-2 border-[--border] bg-transparent p-0.5 shrink-0"
                            />
                            <input
                                type="text"
                                value={draft.brandColor}
                                onChange={e => {
                                    if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) update({ brandColor: e.target.value })
                                }}
                                className="flex-1 min-w-0 bg-[--background] border border-[--border] rounded-xl px-3 py-2 text-sm text-[--foreground] font-mono focus:outline-none focus:border-[--color-brand-500] transition-colors"
                            />
                        </div>
                        {/* Shade strip */}
                        <div className="flex gap-1 mt-1">
                            {["200","300","400","500","600","700","800","900"].map(level => (
                                <div
                                    key={level}
                                    className="flex-1 h-4 rounded-sm border border-white/5"
                                    style={{ background: previewShades[`--color-brand-${level}-hex`] ?? previewShades[`--color-brand-${level}`] ?? "transparent" }}
                                    title={`--color-brand-${level}`}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Background + Paper colors */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-[--muted] uppercase tracking-wider">Background</label>
                            <div className="flex items-center gap-2">
                                <input type="color" value={draft.backgroundColor} onChange={e => update({ backgroundColor: e.target.value })}
                                    className="w-8 h-8 rounded-lg cursor-pointer border border-[--border] bg-transparent p-0.5 shrink-0" />
                                <input type="text" value={draft.backgroundColor}
                                    onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) update({ backgroundColor: e.target.value }) }}
                                    className="flex-1 min-w-0 bg-[--background] border border-[--border] rounded-lg px-2 py-1.5 text-xs text-[--foreground] font-mono focus:outline-none focus:border-[--color-brand-500] transition-colors" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-[--muted] uppercase tracking-wider">Surface</label>
                            <div className="flex items-center gap-2">
                                <input type="color" value={draft.paperColor} onChange={e => update({ paperColor: e.target.value })}
                                    className="w-8 h-8 rounded-lg cursor-pointer border border-[--border] bg-transparent p-0.5 shrink-0" />
                                <input type="text" value={draft.paperColor}
                                    onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) update({ paperColor: e.target.value }) }}
                                    className="flex-1 min-w-0 bg-[--background] border border-[--border] rounded-lg px-2 py-1.5 text-xs text-[--foreground] font-mono focus:outline-none focus:border-[--color-brand-500] transition-colors" />
                            </div>
                        </div>
                    </div>

                    {/* Font picker */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-[--muted] uppercase tracking-wider">Font</label>
                        <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
                            {CUSTOM_THEME_FONT_OPTIONS.map((opt: { label: string; value: string; href: string }) => (
                                <button
                                    key={opt.value}
                                    onClick={() => {
                                        update({ fontFamily: opt.value || undefined, fontHref: opt.href || undefined })
                                        if (opt.href) setPreviewFontHref(opt.href)
                                    }}
                                    className={cn(
                                        "text-left px-3 py-2 rounded-lg border text-sm transition-all",
                                        selectedFont.value === opt.value
                                            ? "border-[--color-brand-500] bg-[--color-brand-900]/30 text-[--foreground]"
                                            : "border-[--border] text-[--muted] hover:border-[--color-brand-700] hover:text-[--foreground]",
                                    )}
                                    style={{ fontFamily: opt.value || "inherit" }}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Live Preview ── */}
                <div className="space-y-3">
                    <p className="text-xs font-semibold text-[--muted] uppercase tracking-wider">Preview</p>

                    {/* Mini app mock */}
                    <div
                        className="rounded-xl overflow-hidden border border-white/10 shadow-xl"
                        style={{ background: draft.backgroundColor }}
                    >
                        {/* Fake topbar */}
                        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06]" style={{ background: draft.paperColor }}>
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: previewShades["--color-brand-400-hex"] }} />
                            <span className="text-xs font-bold" style={{ color: previewShades["--color-brand-300-hex"], fontFamily: draft.fontFamily }}>
                                {draft.displayName}
                            </span>
                        </div>
                        {/* Fake content */}
                        <div className="p-4 space-y-3">
                            <div className="flex gap-2">
                                {/* Fake sidebar */}
                                <div className="flex flex-col gap-2 w-6">
                                    {[0,1,2,3,4].map(i => (
                                        <div key={i} className="w-4 h-4 rounded" style={{ background: i === 0 ? previewShades["--color-brand-500-hex"] : "rgba(255,255,255,0.06)" }} />
                                    ))}
                                </div>
                                {/* Fake cards */}
                                <div className="flex-1 grid grid-cols-3 gap-2">
                                    {[0,1,2,3,4,5].map(i => (
                                        <div
                                            key={i}
                                            className="h-10 rounded-lg"
                                            style={{ background: i === 0 ? (previewShades["--color-brand-700-hex"] + "66") : draft.paperColor, border: `1px solid rgba(255,255,255,0.06)` }}
                                        />
                                    ))}
                                </div>
                            </div>
                            {/* Fake button */}
                            <div className="flex gap-2">
                                <div className="h-7 rounded-lg px-3 flex items-center" style={{ background: previewShades["--color-brand-600-hex"] }}>
                                    <span className="text-xs text-white font-semibold" style={{ fontFamily: draft.fontFamily }}>Action</span>
                                </div>
                                <div className="h-7 rounded-lg px-3 flex items-center border" style={{ borderColor: previewShades["--color-brand-700-hex"], color: previewShades["--color-brand-300-hex"] }}>
                                    <span className="text-xs font-semibold" style={{ fontFamily: draft.fontFamily }}>Secondary</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Color palette display */}
                    <div className="rounded-xl p-3 border border-white/10 space-y-2" style={{ background: draft.paperColor }}>
                        <p className="text-[10px] text-white/40 uppercase tracking-wider">Color Palette</p>
                        <div className="flex gap-2 flex-wrap">
                            {[
                                { label: "BG", color: draft.backgroundColor },
                                { label: "Paper", color: draft.paperColor },
                                { label: "Brand", color: previewShades["--color-brand-500-hex"] ?? draft.brandColor },
                                { label: "Light", color: previewShades["--color-brand-300-hex"] ?? draft.brandColor },
                                { label: "Dark", color: previewShades["--color-brand-700-hex"] ?? draft.brandColor },
                            ].map(({ label, color }) => (
                                <div key={label} className="flex items-center gap-1.5">
                                    <div className="w-4 h-4 rounded border border-white/10" style={{ background: color }} />
                                    <span className="text-[10px] text-white/50">{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-4 border-t border-[--border]">
                <button
                    onClick={handleApply}
                    className={cn(
                        "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all",
                        isActive
                            ? "bg-[--color-brand-600] hover:bg-[--color-brand-500] text-white"
                            : "bg-[--color-brand-700] hover:bg-[--color-brand-600] text-white",
                    )}
                >
                    {isActive ? (
                        <><LuCheck className="w-4 h-4" /> Update Theme</>
                    ) : (
                        <>Apply Theme</>
                    )}
                </button>
                <button
                    onClick={handleReset}
                    className="px-4 py-2.5 rounded-xl text-sm text-[--muted] hover:text-[--foreground] border border-[--border] hover:border-[--color-brand-700] transition-colors"
                >
                    Reset
                </button>
                {isActive && (
                    <button
                        onClick={() => setThemeId("seanime" as AnimeThemeId)}
                        className="ml-auto text-xs text-[--muted] hover:text-[--foreground] transition-colors"
                    >
                        Deactivate custom theme
                    </button>
                )}
            </div>
        </div>
    )
}
