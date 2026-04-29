"use client"
import React from "react"
import { useAnimeTheme, deriveBrandShades, wallpaperPreviewModeAtom } from "@/lib/theme/anime-themes/anime-theme-provider"
import { useSetAtom } from "jotai"
import { ANIME_THEME_LIST } from "@/lib/theme/anime-themes"
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
import { LuSettings2, LuSparkles, LuSearch, LuX, LuPalette, LuCheck, LuDownload, LuImage } from "react-icons/lu"
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

export default function ThemeManagerPage() {
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
    } = useAnimeTheme()

    const setWallpaperPreviewMode = useSetAtom(wallpaperPreviewModeAtom)
    React.useEffect(() => {
        setWallpaperPreviewMode(true)
        return () => setWallpaperPreviewMode(false)
    }, [setWallpaperPreviewMode])

    const [pickerOpen, setPickerOpen] = React.useState(false)
    const [searchQuery, setSearchQuery] = React.useState("")
    const [settingsPanelOpen, setSettingsPanelOpen] = React.useState(false)
    const [batchProgress, setBatchProgress] = React.useState<{ done: number; total: number } | null>(null)
    const { data: downloadedBgs, isLoading: bgsLoading } = useListThemeBackgrounds()
    const deleteMutation = useDeleteThemeBackground()
    const downloadBgMutation = useDownloadThemeBackground()
    const [downloadingBgId, setDownloadingBgId] = React.useState<string | null>(null)

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
            const result = await downloadBgMutation.mutateAsync({ url: w.path })
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
            try { await downloadBgMutation.mutateAsync({ url: toDownload[i].path }) } catch { /* ignored */ }
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
        <PageWrapper className="p-4 sm:p-8 max-w-5xl mx-auto space-y-10">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1
                        className="text-4xl font-bold mb-1"
                        style={{ fontFamily: config.fontFamily }}
                    >
                        Theme Manager
                    </h1>
                    <p className="text-[--muted] text-sm">Choose an anime theme to customize colors, navigation labels, and achievement names.</p>
                </div>
            </div>

            {/* Search bar */}
            <div className="relative">
                <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[--muted] pointer-events-none" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={`Search ${ANIME_THEME_LIST.length} themes…`}
                    className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-[--paper] border border-[--border] text-sm text-[--foreground] placeholder:text-[--muted] focus:outline-none focus:border-[--color-brand-500] transition-colors"
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[--muted] hover:text-[--foreground] transition-colors"
                    >
                        <LuX className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Theme Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {ANIME_THEME_LIST.filter(t =>
                    !searchQuery ||
                    t.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    t.description.toLowerCase().includes(searchQuery.toLowerCase()),
                ).map((theme) => {
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

            {/* Background */}
            {config.id !== "seanime" && (
                <div className="rounded-2xl border border-[--border] overflow-hidden">
                    {/* Live preview banner */}
                    <div className="relative w-full overflow-hidden" style={{ height: "140px" }}>
                        {activeBackgroundUrl ? (
                            <>
                                <div
                                    className="absolute inset-0 bg-cover bg-center transition-all duration-500"
                                    style={{
                                        backgroundImage: `url("${activeBackgroundUrl}")`,
                                        filter: `blur(${backgroundBlur * 0.3}px)`,
                                        opacity: 1 - backgroundDim * 0.6,
                                        transform: `scale(1.05)`,
                                    }}
                                />
                                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[--background]/80 to-transparent" />
                            </>
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-[--paper]">
                                <div className="text-center space-y-1">
                                    <div className="text-3xl opacity-20">🖼</div>
                                    <p className="text-xs text-[--muted]">No background set — browse below</p>
                                </div>
                            </div>
                        )}
                        <div className="absolute bottom-3 left-5">
                            <h2 className="text-lg font-semibold text-white drop-shadow" style={{ fontFamily: config.fontFamily }}>
                                Background
                            </h2>
                        </div>
                    </div>

                    {/* ── SLIDERS FIRST ─────────────────────────────────────────── */}
                    <div className="bg-[--background] border-t border-[--border] p-5 space-y-4">
                        <div className="flex items-center gap-4">
                            <span className="text-sm text-[--muted] w-12 shrink-0">Dim</span>
                            <div className="flex-1 relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className="absolute inset-y-0 left-0 bg-[--color-brand-500] rounded-full transition-all"
                                    style={{ width: `${backgroundDim * 100}%` }}
                                />
                                <input
                                    type="range" min={0} max={1} step={0.01}
                                    value={backgroundDim}
                                    onChange={e => setBackgroundDim(Number(e.target.value))}
                                    className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                                />
                            </div>
                            <span className="text-sm text-[--muted] w-10 text-right tabular-nums">{Math.round(backgroundDim * 100)}%</span>
                            <button
                                onClick={() => setBackgroundDim(config.backgroundDim ?? 0.30)}
                                className="text-xs text-[--muted] hover:text-[--foreground] px-2 py-0.5 rounded bg-[--paper] border border-[--border] transition-colors"
                            >Reset</button>
                        </div>

                        <div className="flex items-center gap-4">
                            <span className="text-sm text-[--muted] w-12 shrink-0">Blur</span>
                            <div className="flex-1 relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className="absolute inset-y-0 left-0 bg-[--color-brand-500] rounded-full transition-all"
                                    style={{ width: `${(backgroundBlur / 60) * 100}%` }}
                                />
                                <input
                                    type="range" min={0} max={60} step={1}
                                    value={backgroundBlur}
                                    onChange={e => setBackgroundBlur(Number(e.target.value))}
                                    className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                                />
                            </div>
                            <span className="text-sm text-[--muted] w-10 text-right tabular-nums">{backgroundBlur}px</span>
                            <button
                                onClick={() => setBackgroundBlur(config.backgroundBlur ?? 30)}
                                className="text-xs text-[--muted] hover:text-[--foreground] px-2 py-0.5 rounded bg-[--paper] border border-[--border] transition-colors"
                            >Reset</button>
                        </div>

                        <div className="flex items-center gap-4">
                            <span className="text-sm text-[--muted] w-16 shrink-0">Exposure</span>
                            <div className="flex-1 relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className="absolute inset-y-0 left-0 bg-[--color-brand-500] rounded-full transition-all"
                                    style={{ width: `${((backgroundExposure - 0.1) / (2.4)) * 100}%` }}
                                />
                                <input
                                    type="range" min={0.1} max={2.5} step={0.05}
                                    value={backgroundExposure}
                                    onChange={e => setBackgroundExposure(Number(e.target.value))}
                                    className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                                />
                            </div>
                            <span className="text-sm text-[--muted] w-10 text-right tabular-nums">{Math.round(backgroundExposure * 100)}%</span>
                            <button
                                onClick={() => setBackgroundExposure(1.0)}
                                className="text-xs text-[--muted] hover:text-[--foreground] px-2 py-0.5 rounded bg-[--paper] border border-[--border] transition-colors"
                            >Reset</button>
                        </div>

                        <div className="flex items-center gap-4">
                            <span className="text-sm text-[--muted] w-16 shrink-0">Saturation</span>
                            <div className="flex-1 relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className="absolute inset-y-0 left-0 bg-[--color-brand-500] rounded-full transition-all"
                                    style={{ width: `${(backgroundSaturation / 3.0) * 100}%` }}
                                />
                                <input
                                    type="range" min={0} max={3.0} step={0.05}
                                    value={backgroundSaturation}
                                    onChange={e => setBackgroundSaturation(Number(e.target.value))}
                                    className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                                />
                            </div>
                            <span className="text-sm text-[--muted] w-10 text-right tabular-nums">{Math.round(backgroundSaturation * 100)}%</span>
                            <button
                                onClick={() => setBackgroundSaturation(1.0)}
                                className="text-xs text-[--muted] hover:text-[--foreground] px-2 py-0.5 rounded bg-[--paper] border border-[--border] transition-colors"
                            >Reset</button>
                        </div>

                        <div className="flex items-center gap-4">
                            <span className="text-sm text-[--muted] w-16 shrink-0">Contrast</span>
                            <div className="flex-1 relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className="absolute inset-y-0 left-0 bg-[--color-brand-500] rounded-full transition-all"
                                    style={{ width: `${(backgroundContrast / 3.0) * 100}%` }}
                                />
                                <input
                                    type="range" min={0} max={3.0} step={0.05}
                                    value={backgroundContrast}
                                    onChange={e => setBackgroundContrast(Number(e.target.value))}
                                    className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                                />
                            </div>
                            <span className="text-sm text-[--muted] w-10 text-right tabular-nums">{Math.round(backgroundContrast * 100)}%</span>
                            <button
                                onClick={() => setBackgroundContrast(1.0)}
                                className="text-xs text-[--muted] hover:text-[--foreground] px-2 py-0.5 rounded bg-[--paper] border border-[--border] transition-colors"
                            >Reset</button>
                        </div>

                        {/* Vignette section */}
                        <div className="pt-3 border-t border-white/5 space-y-4">
                            <p className="text-xs font-semibold text-[--muted] uppercase tracking-wider">Vignette</p>
                            <div className="flex items-center gap-4">
                                <span className="text-sm text-[--muted] w-16 shrink-0">Strength</span>
                                <div className="flex-1 relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div className="absolute inset-y-0 left-0 bg-[--color-brand-500] rounded-full transition-all" style={{ width: `${vignetteStrength * 100}%` }} />
                                    <input type="range" min={0} max={1} step={0.01} value={vignetteStrength} onChange={e => setVignetteStrength(Number(e.target.value))} className="absolute inset-0 w-full opacity-0 cursor-pointer h-full" />
                                </div>
                                <span className="text-sm text-[--muted] w-10 text-right tabular-nums">{Math.round(vignetteStrength * 100)}%</span>
                                <button onClick={() => setVignetteStrength(0.5)} className="text-xs text-[--muted] hover:text-[--foreground] px-2 py-0.5 rounded bg-[--paper] border border-[--border] transition-colors">Reset</button>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-sm text-[--muted] w-16 shrink-0">Size</span>
                                <div className="flex-1 relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div className="absolute inset-y-0 left-0 bg-[--color-brand-500] rounded-full transition-all" style={{ width: `${vignetteSize * 100}%` }} />
                                    <input type="range" min={0} max={1} step={0.01} value={vignetteSize} onChange={e => setVignetteSize(Number(e.target.value))} className="absolute inset-0 w-full opacity-0 cursor-pointer h-full" />
                                </div>
                                <span className="text-sm text-[--muted] w-10 text-right tabular-nums">{Math.round(vignetteSize * 100)}%</span>
                                <button onClick={() => setVignetteSize(0.6)} className="text-xs text-[--muted] hover:text-[--foreground] px-2 py-0.5 rounded bg-[--paper] border border-[--border] transition-colors">Reset</button>
                            </div>
                        </div>

                        {/* Glow / Shimmer section */}
                        <div className="pt-3 border-t border-white/5 space-y-4">
                            <p className="text-xs font-semibold text-[--muted] uppercase tracking-wider">Shimmer Glow</p>
                            <div className="flex items-center gap-4">
                                <span className="text-sm text-[--muted] w-16 shrink-0">Strength</span>
                                <div className="flex-1 relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div className="absolute inset-y-0 left-0 bg-[--color-brand-500] rounded-full transition-all" style={{ width: `${glowStrength * 100}%` }} />
                                    <input type="range" min={0} max={1} step={0.01} value={glowStrength} onChange={e => setGlowStrength(Number(e.target.value))} className="absolute inset-0 w-full opacity-0 cursor-pointer h-full" />
                                </div>
                                <span className="text-sm text-[--muted] w-10 text-right tabular-nums">{Math.round(glowStrength * 100)}%</span>
                                <button onClick={() => setGlowStrength(0)} className="text-xs text-[--muted] hover:text-[--foreground] px-2 py-0.5 rounded bg-[--paper] border border-[--border] transition-colors">Reset</button>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-sm text-[--muted] w-16 shrink-0">Speed</span>
                                <div className="flex-1 relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div className="absolute inset-y-0 left-0 bg-[--color-brand-500] rounded-full transition-all" style={{ width: `${((glowSpeed - 0.2) / 4.8) * 100}%` }} />
                                    <input type="range" min={0.2} max={5} step={0.1} value={glowSpeed} onChange={e => setGlowSpeed(Number(e.target.value))} className="absolute inset-0 w-full opacity-0 cursor-pointer h-full" />
                                </div>
                                <span className="text-sm text-[--muted] w-10 text-right tabular-nums">{glowSpeed.toFixed(1)}x</span>
                                <button onClick={() => setGlowSpeed(1)} className="text-xs text-[--muted] hover:text-[--foreground] px-2 py-0.5 rounded bg-[--paper] border border-[--border] transition-colors">Reset</button>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-sm text-[--muted] w-16 shrink-0">Scale</span>
                                <div className="flex-1 relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div className="absolute inset-y-0 left-0 bg-[--color-brand-500] rounded-full transition-all" style={{ width: `${glowScale * 100}%` }} />
                                    <input type="range" min={0} max={1} step={0.01} value={glowScale} onChange={e => setGlowScale(Number(e.target.value))} className="absolute inset-0 w-full opacity-0 cursor-pointer h-full" />
                                </div>
                                <span className="text-sm text-[--muted] w-10 text-right tabular-nums">{Math.round(glowScale * 100)}%</span>
                                <button onClick={() => setGlowScale(0.5)} className="text-xs text-[--muted] hover:text-[--foreground] px-2 py-0.5 rounded bg-[--paper] border border-[--border] transition-colors">Reset</button>
                            </div>
                        </div>

                        {/* Scanlines section */}
                        <div className="pt-3 border-t border-white/5 space-y-4">
                            <p className="text-xs font-semibold text-[--muted] uppercase tracking-wider">Scanlines</p>
                            <div className="flex items-center gap-4">
                                <span className="text-sm text-[--muted] w-16 shrink-0">Strength</span>
                                <div className="flex-1 relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div className="absolute inset-y-0 left-0 bg-[--color-brand-500] rounded-full transition-all" style={{ width: `${scanlinesStrength * 100}%` }} />
                                    <input type="range" min={0} max={1} step={0.01} value={scanlinesStrength} onChange={e => setScanlinesStrength(Number(e.target.value))} className="absolute inset-0 w-full opacity-0 cursor-pointer h-full" />
                                </div>
                                <span className="text-sm text-[--muted] w-10 text-right tabular-nums">{Math.round(scanlinesStrength * 100)}%</span>
                                <button onClick={() => setScanlinesStrength(0)} className="text-xs text-[--muted] hover:text-[--foreground] px-2 py-0.5 rounded bg-[--paper] border border-[--border] transition-colors">Reset</button>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-sm text-[--muted] w-16 shrink-0">Spacing</span>
                                <div className="flex-1 relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div className="absolute inset-y-0 left-0 bg-[--color-brand-500] rounded-full transition-all" style={{ width: `${scanlinesSize * 100}%` }} />
                                    <input type="range" min={0} max={1} step={0.01} value={scanlinesSize} onChange={e => setScanlinesSize(Number(e.target.value))} className="absolute inset-0 w-full opacity-0 cursor-pointer h-full" />
                                </div>
                                <span className="text-sm text-[--muted] w-10 text-right tabular-nums">{Math.round(scanlinesSize * 100)}%</span>
                                <button onClick={() => setScanlinesSize(0.5)} className="text-xs text-[--muted] hover:text-[--foreground] px-2 py-0.5 rounded bg-[--paper] border border-[--border] transition-colors">Reset</button>
                            </div>
                        </div>

                        {/* Film Noise section */}
                        <div className="pt-3 border-t border-white/5 space-y-4">
                            <p className="text-xs font-semibold text-[--muted] uppercase tracking-wider">Film Noise</p>
                            <div className="flex items-center gap-4">
                                <span className="text-sm text-[--muted] w-16 shrink-0">Strength</span>
                                <div className="flex-1 relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div className="absolute inset-y-0 left-0 bg-[--color-brand-500] rounded-full transition-all" style={{ width: `${noiseStrength * 100}%` }} />
                                    <input type="range" min={0} max={1} step={0.01} value={noiseStrength} onChange={e => setNoiseStrength(Number(e.target.value))} className="absolute inset-0 w-full opacity-0 cursor-pointer h-full" />
                                </div>
                                <span className="text-sm text-[--muted] w-10 text-right tabular-nums">{Math.round(noiseStrength * 100)}%</span>
                                <button onClick={() => setNoiseStrength(0)} className="text-xs text-[--muted] hover:text-[--foreground] px-2 py-0.5 rounded bg-[--paper] border border-[--border] transition-colors">Reset</button>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-sm text-[--muted] w-16 shrink-0">Speed</span>
                                <div className="flex-1 relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div className="absolute inset-y-0 left-0 bg-[--color-brand-500] rounded-full transition-all" style={{ width: `${((noiseSpeed - 0.1) / 4.9) * 100}%` }} />
                                    <input type="range" min={0.1} max={5} step={0.1} value={noiseSpeed} onChange={e => setNoiseSpeed(Number(e.target.value))} className="absolute inset-0 w-full opacity-0 cursor-pointer h-full" />
                                </div>
                                <span className="text-sm text-[--muted] w-10 text-right tabular-nums">{noiseSpeed.toFixed(1)}x</span>
                                <button onClick={() => setNoiseSpeed(1)} className="text-xs text-[--muted] hover:text-[--foreground] px-2 py-0.5 rounded bg-[--paper] border border-[--border] transition-colors">Reset</button>
                            </div>
                        </div>
                    </div>

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

                                {/* Downloaded wallpapers */}
                                {bgsLoading && !downloadedBgs && Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="aspect-video rounded-lg bg-white/5 animate-pulse" />
                                ))}
                                {(downloadedBgs ?? []).map(bg => (
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
        </PageWrapper>
    )
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
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect() }}
            className={cn(
                "group/card relative rounded-2xl p-5 text-left cursor-pointer transition-all duration-200 border-2",
                "hover:scale-[1.02] active:scale-[0.98]",
                isActive
                    ? "border-[--color-brand-500] shadow-lg shadow-[rgba(0,0,0,0.4)]"
                    : "border-[--border] hover:border-[--color-brand-700]",
            )}
            style={{
                background: `linear-gradient(135deg, ${theme.previewColors.bg} 0%, color-mix(in srgb, ${theme.previewColors.bg} 85%, ${theme.previewColors.primary}) 100%)`,
            }}
        >
            {isActive && (
                <div className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-[--color-brand-400] shadow-[0_0_8px_2px_var(--tw-shadow-color)] shadow-[--color-brand-400]" />
            )}

            {/* Color swatches + settings button */}
            <div className="flex items-center mb-3">
                <div className="flex items-center gap-1.5">
                    {[theme.previewColors.primary, theme.previewColors.secondary, theme.previewColors.accent].map((color, i) => (
                        <div
                            key={i}
                            className="w-5 h-5 rounded-full border border-white/10 shrink-0"
                            style={{ background: color }}
                        />
                    ))}
                </div>

                {theme.id !== "seanime" && (
                    <button
                        onClick={e => { e.stopPropagation(); onSettingsClick() }}
                        title="Theme settings"
                        className={cn(
                            "ml-auto w-6 h-6 flex items-center justify-center text-white/40 hover:text-white/90 rounded-md hover:bg-white/10 transition-all duration-150",
                            "opacity-0 group-hover/card:opacity-100",
                            isActive && "opacity-100",
                        )}
                    >
                        <LuSettings2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            <div
                className="font-bold text-lg text-white"
                style={{ fontFamily: theme.fontFamily ?? "inherit" }}
            >
                {theme.displayName}
            </div>
            <p className="text-white/60 text-xs mt-1 line-clamp-2">
                {theme.description}
            </p>
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
