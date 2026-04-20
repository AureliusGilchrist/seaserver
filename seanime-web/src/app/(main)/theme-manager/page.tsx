"use client"
import React from "react"
import { useAnimeTheme } from "@/lib/theme/anime-themes/anime-theme-provider"
import { ANIME_THEME_LIST } from "@/lib/theme/anime-themes"
import type { AnimeThemeId } from "@/lib/theme/anime-themes"
import { HIDDEN_THEMES, HIDDEN_THEME_IDS } from "@/lib/theme/anime-themes/hidden-themes"
import { useGetRawAnilistMangaCollection } from "@/api/hooks/manga.hooks"
import { cn } from "@/components/ui/core/styling"
import { PageWrapper } from "@/components/shared/page-wrapper"

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
    } = useAnimeTheme()

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
                        <button
                            key={theme.id}
                            onClick={() => setThemeId(theme.id as AnimeThemeId)}
                            className={cn(
                                "relative rounded-2xl p-5 text-left transition-all duration-200 border-2",
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

                            {/* Color swatches */}
                            <div className="flex gap-1.5 mb-3">
                                {[
                                    theme.previewColors.primary,
                                    theme.previewColors.secondary,
                                    theme.previewColors.accent,
                                ].map((color, i) => (
                                    <div
                                        key={i}
                                        className="w-5 h-5 rounded-full border border-white/10"
                                        style={{ background: color }}
                                    />
                                ))}
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
                        </button>
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
