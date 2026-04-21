"use client"
import React from "react"
import { useAnimeTheme } from "@/lib/theme/anime-themes/anime-theme-provider"
import { ANIME_THEME_LIST } from "@/lib/theme/anime-themes"
import type { AnimeThemeId, AnimeThemeConfig } from "@/lib/theme/anime-themes"
import { HIDDEN_THEMES, HIDDEN_THEME_IDS } from "@/lib/theme/anime-themes/hidden-themes"
import { LuSettings2 } from "react-icons/lu"
import { useGetRawAnilistMangaCollection } from "@/api/hooks/manga.hooks"
import { cn } from "@/components/ui/core/styling"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { useListThemeBackgrounds, useDeleteThemeBackground } from "@/api/hooks/theme_backgrounds.hooks"
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
        backgroundBlur,
        setBackgroundBlur,
        backgroundExposure,
        setBackgroundExposure,
        backgroundSaturation,
        setBackgroundSaturation,
        activeBackgroundUrl,
        setActiveBackgroundUrl,
    } = useAnimeTheme()

    const [pickerOpen, setPickerOpen] = React.useState(false)
    const { data: downloadedBgs, isLoading: bgsLoading } = useListThemeBackgrounds()
    const deleteMutation = useDeleteThemeBackground()

    // Fetch manga collection for hidden theme unlock detection
    const { data: mangaCollection } = useGetRawAnilistMangaCollection()

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
            <div>
                <h1
                    className="text-4xl font-bold mb-1"
                    style={{ fontFamily: config.fontFamily }}
                >
                    Theme Manager
                </h1>
                <p className="text-[--muted] text-sm">Choose an anime theme to customize colors, navigation labels, and achievement names.</p>
            </div>

            {/* Theme Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {ANIME_THEME_LIST.map((theme) => {
                    const isHidden = HIDDEN_THEME_IDS.has(theme.id)
                    const isUnlocked = !isHidden || unlockedHiddenThemes.has(theme.id)
                    const isActive = theme.id === themeId

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

                    return (
                        <ThemeCard
                            key={theme.id}
                            theme={theme}
                            isActive={isActive}
                            onSelect={() => setThemeId(theme.id as AnimeThemeId)}
                            activeConfig={config}
                            backgroundDim={backgroundDim}
                            setBackgroundDim={setBackgroundDim}
                            backgroundBlur={backgroundBlur}
                            setBackgroundBlur={setBackgroundBlur}
                            backgroundExposure={backgroundExposure}
                            setBackgroundExposure={setBackgroundExposure}
                            backgroundSaturation={backgroundSaturation}
                            setBackgroundSaturation={setBackgroundSaturation}
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
                    <div
                        className="relative w-full overflow-hidden"
                        style={{ height: "160px" }}
                    >
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
                                <div className="absolute inset-0 bg-gradient-to-t from-[--background] via-[--background]/40 to-transparent" />
                            </>
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-[--paper]">
                                <div className="text-center space-y-1">
                                    <div className="text-3xl opacity-20">🖼</div>
                                    <p className="text-xs text-[--muted]">No background set — browse Wallhaven below</p>
                                </div>
                            </div>
                        )}
                        {/* Title overlay */}
                        <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between">
                            <div>
                                <h2
                                    className="text-xl font-semibold text-white drop-shadow"
                                    style={{ fontFamily: config.fontFamily }}
                                >
                                    Background
                                </h2>
                                {activeBackgroundUrl && (
                                    <p className="text-xs text-white/50 mt-0.5 truncate max-w-xs">
                                        {activeBackgroundUrl.startsWith("/theme-bg/")
                                            ? "Downloaded wallpaper"
                                            : "Bundled background"}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={() => setPickerOpen(true)}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-lg",
                                    "bg-[--color-brand-600] hover:bg-[--color-brand-500] text-white",
                                )}
                            >
                                <span>Browse Wallhaven</span>
                                <span className="text-base leading-none">↗</span>
                            </button>
                        </div>
                    </div>

                    {/* Thumbnail strip */}
                    <div className="bg-[--paper] border-t border-[--border] p-4 space-y-3">
                        <p className="text-xs text-[--muted] font-medium uppercase tracking-wider">Select Background</p>
                        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
                            {/* Bundled default */}
                            {config.backgroundImageUrl && (
                                <ThumbnailSlot
                                    url={config.backgroundImageUrl}
                                    label="Default"
                                    isActive={activeBackgroundUrl === config.backgroundImageUrl}
                                    onClick={() => setActiveBackgroundUrl(config.backgroundImageUrl!)}
                                />
                            )}

                            {/* Downloaded wallpapers */}
                            {bgsLoading && !downloadedBgs && (
                                <>{Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="shrink-0 w-28 h-[70px] rounded-xl bg-white/5 animate-pulse" />
                                ))}</>
                            )}
                            {(downloadedBgs ?? []).map(bg => (
                                <ThumbnailSlot
                                    key={bg.filename}
                                    url={bg.url}
                                    isActive={activeBackgroundUrl === bg.url}
                                    deletable
                                    onClick={() => setActiveBackgroundUrl(bg.url)}
                                    onDelete={() => {
                                        deleteMutation.mutate(bg.filename)
                                        if (activeBackgroundUrl === bg.url) {
                                            setActiveBackgroundUrl(config.backgroundImageUrl ?? null)
                                        }
                                    }}
                                />
                            ))}

                            {/* Browse CTA slot when list is empty */}
                            {!bgsLoading && !downloadedBgs?.length && !config.backgroundImageUrl && (
                                <button
                                    onClick={() => setPickerOpen(true)}
                                    className="shrink-0 w-28 h-[70px] rounded-xl border-2 border-dashed border-white/20 hover:border-[--color-brand-500] flex flex-col items-center justify-center gap-1 text-[--muted] hover:text-[--color-brand-400] transition-colors text-xs"
                                >
                                    <span className="text-lg">+</span>
                                    <span>Add</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Dim & Blur controls */}
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
                    </div>
                </div>
            )}

            <WallhavenPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} />

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
// Theme card with hover-reveal gear popover
// ─────────────────────────────────────────────────────────────────

interface ThemeCardProps {
    theme: AnimeThemeConfig
    isActive: boolean
    onSelect: () => void
    activeConfig: AnimeThemeConfig
    backgroundDim: number
    setBackgroundDim: (v: number) => void
    backgroundBlur: number
    setBackgroundBlur: (v: number) => void
    backgroundExposure: number
    setBackgroundExposure: (v: number) => void
    backgroundSaturation: number
    setBackgroundSaturation: (v: number) => void
}

function ThemeCard({
    theme, isActive, onSelect,
    activeConfig,
    backgroundDim, setBackgroundDim,
    backgroundBlur, setBackgroundBlur,
    backgroundExposure, setBackgroundExposure,
    backgroundSaturation, setBackgroundSaturation,
}: ThemeCardProps) {
    const [gearOpen, setGearOpen] = React.useState(false)
    const popoverRef = React.useRef<HTMLDivElement>(null)

    React.useEffect(() => {
        if (!gearOpen) return
        const handler = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setGearOpen(false)
            }
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [gearOpen])

    const handleGearClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        onSelect()
        setGearOpen(v => !v)
    }

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

            {/* Color swatches + gear icon */}
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

                {/* Gear + popover anchor */}
                <div ref={popoverRef} className="relative ml-auto">
                    <button
                        onClick={handleGearClick}
                        title="Background adjustments"
                        className={cn(
                            "w-5 h-5 flex items-center justify-center text-white/40 hover:text-white/90 rounded transition-all duration-150",
                            "opacity-0 group-hover/card:opacity-100",
                            (isActive || gearOpen) && "opacity-100",
                        )}
                    >
                        <LuSettings2 className="w-3.5 h-3.5" />
                    </button>

                    {gearOpen && (
                        <div
                            className="absolute right-0 top-full mt-2 z-[9999] w-72 rounded-xl bg-gray-950 border border-white/10 p-4 shadow-2xl space-y-3"
                            onClick={e => e.stopPropagation()}
                        >
                            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-2">Background adjustments</p>
                            <InlineSliderRow
                                label="Dim"
                                value={backgroundDim}
                                onChange={setBackgroundDim}
                                min={0} max={1} step={0.01}
                                display={v => `${Math.round(v * 100)}%`}
                                onReset={() => setBackgroundDim(activeConfig.backgroundDim ?? 0.30)}
                            />
                            <InlineSliderRow
                                label="Blur"
                                value={backgroundBlur}
                                onChange={setBackgroundBlur}
                                min={0} max={60} step={1}
                                display={v => `${v}px`}
                                onReset={() => setBackgroundBlur(activeConfig.backgroundBlur ?? 30)}
                            />
                            <InlineSliderRow
                                label="Exposure"
                                value={backgroundExposure}
                                onChange={setBackgroundExposure}
                                min={0.1} max={2.5} step={0.05}
                                display={v => `${Math.round(v * 100)}%`}
                                onReset={() => setBackgroundExposure(1.0)}
                            />
                            <InlineSliderRow
                                label="Saturation"
                                value={backgroundSaturation}
                                onChange={setBackgroundSaturation}
                                min={0} max={3.0} step={0.05}
                                display={v => `${Math.round(v * 100)}%`}
                                onReset={() => setBackgroundSaturation(1.0)}
                            />
                        </div>
                    )}
                </div>
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
