"use client"
import React from "react"
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { useListThemeMusicMetadata } from "@/api/hooks/theme-music.hooks"
import {
    equippedThemeOstIdAtom,
    themeOstCurrentTrackIndexAtom,
    themeOstLoopModeAtom,
    themeOstPlayingAtom,
    themeOstPositionAtom,
    themeOstSeekRequestAtom,
    themeOstSkipDirectionAtom,
    videoFadeActiveAtom,
} from "@/lib/theme/anime-themes/theme-ost-atoms"

// Signals that a page wants to show wallpaper at near-full opacity (e.g. theme manager)
export const wallpaperPreviewModeAtom = atom(false)
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { ANIME_THEMES, ANIME_THEME_LIST } from "@/lib/theme/anime-themes"
import type { AnimeThemeId, AnimeThemeConfig, ParticleTypeConfig } from "@/lib/theme/anime-themes"
import { ThemeAnimatedOverlay } from "@/lib/theme/anime-themes/animated-elements"
import { buildThemeCursorCSS } from "@/lib/theme/anime-themes/cursor-svgs"
import { recordActivatedTheme } from "@/lib/theme/anime-themes/theme-prerequisites"
import { fetchMarketplaceThemeMeta, getCachedMarketplaceThemeMeta } from "@/lib/theme/marketplace-theme-loader"
import { applyRootCssVars } from "@/lib/helpers/css"
import { seaStorage } from "@/lib/sea-storage/sea-storage"

// ─────────────────────────────────────────────────────────────────
// Milestone name utility
// ─────────────────────────────────────────────────────────────────

/**
 * Returns the milestone rank name for a given level under the current theme.
 * Picks the highest defined threshold that is ≤ the user's level.
 */
export function getMilestoneName(
    level: number,
    milestoneNames?: Record<number, string>,
): string | null {
    if (!milestoneNames) return null
    const thresholds = Object.keys(milestoneNames)
        .map(Number)
        .sort((a, b) => a - b)
    let name: string | null = null
    for (const t of thresholds) {
        if (level >= t) name = milestoneNames[t]
    }
    return name
}

/**
 * Hook to get the milestone name for the current theme + level.
 */
export function useThemeMilestoneName(level: number): string | null {
    const ctx = React.useContext(AnimeThemeContext)
    if (!ctx) return null
    return getMilestoneName(level, ctx.config.milestoneNames)
}

/**
 * Returns the milestone name for a profile given its server-stored themeId.
 * Works across any browser/device since it reads from the API response, not localStorage.
 */
export function getProfileOwnerMilestoneName(themeId: string | undefined, level: number): string | null {
    const resolvedId = (themeId && themeId in ANIME_THEMES) ? themeId as AnimeThemeId : "seanime"
    return getMilestoneName(level, ANIME_THEMES[resolvedId]?.milestoneNames ?? undefined)
}

// ─────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────

type ParticleSettings = Record<string, { enabled: boolean; intensity: number }>

// ─────────────────────────────────────────────────────────────────
// Brand color utilities
// ─────────────────────────────────────────────────────────────────

function hexToHSL(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    let h = 0, s = 0
    const l = (max + min) / 2
    if (max !== min) {
        const d = max - min
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
            case g: h = ((b - r) / d + 2) / 6; break
            case b: h = ((r - g) / d + 4) / 6; break
        }
    }
    return [h * 360, s * 100, l * 100]
}

function hslToHex(h: number, s: number, l: number): string {
    const lN = l / 100, sN = s / 100
    const a = sN * Math.min(lN, 1 - lN)
    const f = (n: number) => {
        const k = (n + h / 30) % 12
        return Math.round(255 * (lN - a * Math.max(Math.min(k - 3, 9 - k, 1), -1))).toString(16).padStart(2, "0")
    }
    return `#${f(0)}${f(8)}${f(4)}`
}

export function deriveBrandShades(hex: string): Record<string, string> {
    try {
        if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return {}
        const [h, s] = hexToHSL(hex)
        return {
            "--color-brand-300": hslToHex(h, s, 75),
            "--color-brand-400": hslToHex(h, s, 65),
            "--color-brand-500": hex,
            "--color-brand-600": hslToHex(h, s, 45),
            "--color-brand-700": hslToHex(h, s, 35),
        }
    } catch { return {} }
}

type AnimeThemeContextValue = {
    themeId: AnimeThemeId
    config: AnimeThemeConfig
    setThemeId: (id: AnimeThemeId) => void
    musicEnabled: boolean
    setMusicEnabled: (v: boolean) => void
    musicVolume: number
    setMusicVolume: (v: number) => void
    animatedIntensity: number
    setAnimatedIntensity: (v: number) => void
    particleSettings: ParticleSettings
    setParticleTypeEnabled: (typeId: string, enabled: boolean) => void
    setParticleTypeIntensity: (typeId: string, intensity: number) => void
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
    activeBackgroundUrl: string | null
    setActiveBackgroundUrl: (url: string | null) => void
    brandColorOverride: string | null
    setBrandColorOverride: (v: string | null) => void
    // ── Vignette effect ──
    vignetteStrength: number
    setVignetteStrength: (v: number) => void
    vignetteSize: number
    setVignetteSize: (v: number) => void
    // ── Glow effect ──
    glowStrength: number
    setGlowStrength: (v: number) => void
    glowSpeed: number
    setGlowSpeed: (v: number) => void
    glowScale: number
    setGlowScale: (v: number) => void
    // ── Custom theme ──
    customThemeData: import("./custom-theme").CustomThemeData | null
    setCustomThemeData: (data: import("./custom-theme").CustomThemeData) => void
    // ── Scanlines ──
    scanlinesStrength: number
    setScanlinesStrength: (v: number) => void
    scanlinesSize: number
    setScanlinesSize: (v: number) => void
    scanlinesSpeed: number
    setScanlinesSpeed: (v: number) => void
    // ── Noise ──
    noiseStrength: number
    setNoiseStrength: (v: number) => void
    noiseSpeed: number
    setNoiseSpeed: (v: number) => void
    noiseScale: number
    setNoiseScale: (v: number) => void
    // ── Hologram ──
    hologramStrength: number
    setHologramStrength: (v: number) => void
}

const AnimeThemeContext = React.createContext<AnimeThemeContextValue | null>(null)

/** Build a full AnimeThemeConfig from marketplace meta so the provider uses it like any bundled theme. */
function buildConfigFromMeta(meta: import("@/lib/theme/marketplace-theme-loader").MarketplaceThemeMeta): AnimeThemeConfig {
    return {
        id: meta.id as AnimeThemeId,
        displayName: meta.displayName,
        description: meta.description ?? "",
        cssVars: meta.cssVars ?? {},
        fontFamily: meta.fontFamily,
        fontHref: meta.fontHref,
        sidebarOverrides: {},
        achievementNames: meta.achievementNames ?? {},
        musicUrl: `/theme-music/${meta.id}/opening.mp3`,
        previewColors: meta.previewColors ?? { primary: "#333", secondary: "#444", accent: "#555", bg: "#0a0a0a" },
        milestoneNames: meta.milestoneNames,
    }
}

export function useAnimeTheme(): AnimeThemeContextValue {
    const ctx = React.useContext(AnimeThemeContext)
    if (!ctx) throw new Error("useAnimeTheme must be used inside AnimeThemeProvider")
    return ctx
}

/**
 * Safe version — returns null if called outside AnimeThemeProvider.
 * Use this in sidebar/layout components to prevent a missing-provider crash
 * from cascading up and hiding sibling UI (e.g. the user avatar dropdown).
 */
export function useAnimeThemeOrNull(): AnimeThemeContextValue | null {
    return React.useContext(AnimeThemeContext)
}

// ─────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────

export function AnimeThemeProvider({ children }: { children: React.ReactNode }) {
    const currentProfile = useAtomValue(currentProfileAtom)
    const profileKey = currentProfile?.id ? String(currentProfile.id) : "default"
    const profileId = currentProfile?.id ?? 0

    // ── Theme persistence ──
    // Allow any string theme ID (including marketplace themes not bundled in-app)
    const [themeId, setThemeIdRaw] = React.useState<AnimeThemeId>(() => {
        if (typeof window === "undefined") return "seanime"
        try {
            const stored = seaStorage.getItem(`sea-anime-theme-${profileKey}`)
            if (stored) return stored as AnimeThemeId
        } catch { /* noop */ }
        return "seanime"
    })

    // Reload from storage when profile changes
    React.useEffect(() => {
        try {
            const stored = seaStorage.getItem(`sea-anime-theme-${profileKey}`)
            if (stored) {
                setThemeIdRaw(stored as AnimeThemeId)
            } else {
                setThemeIdRaw("seanime")
            }
        } catch { /* noop */ }
    }, [profileKey])

    // When themeId is a marketplace theme (not bundled), build a full AnimeThemeConfig from its meta
    // so that config.id, config.cssVars, config.backgroundImageUrl etc. are all correct.
    const [marketplaceConfig, setMarketplaceConfig] = React.useState<AnimeThemeConfig | null>(() => {
        if (typeof window === "undefined") return null
        if (themeId in ANIME_THEMES) return null
        const cached = getCachedMarketplaceThemeMeta(themeId)
        if (!cached) return null
        return buildConfigFromMeta(cached)
    })

    React.useEffect(() => {
        if (themeId in ANIME_THEMES) {
            setMarketplaceConfig(null)
            return
        }
        const cached = getCachedMarketplaceThemeMeta(themeId)
        if (cached) {
            setMarketplaceConfig(buildConfigFromMeta(cached))
            return
        }
        let cancelled = false
        fetchMarketplaceThemeMeta(themeId).then(meta => {
            if (cancelled || !meta) return
            setMarketplaceConfig(buildConfigFromMeta(meta))
        })
        return () => { cancelled = true }
    }, [themeId])

    const setThemeId = React.useCallback((id: AnimeThemeId) => {
        setThemeIdRaw(id)
        try {
            seaStorage.setItem(`sea-anime-theme-${profileKey}`, id)
            recordActivatedTheme(id)
        } catch { /* noop */ }
        // Persist to server so other devices / browsers see the same theme
        if (profileId > 0) {
            fetch(`/api/v1/profiles/${profileId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ themeId: id }),
            }).catch(() => { /* best-effort */ })
        }
    }, [profileKey, profileId])

    const config: AnimeThemeConfig = ANIME_THEMES[themeId as AnimeThemeId] ?? marketplaceConfig ?? ANIME_THEMES["seanime"]

    // ── Music state ──
    const [musicEnabled, setMusicEnabledRaw] = React.useState<boolean>(() => {
        if (typeof window === "undefined") return false
        try {
            return seaStorage.getItem(`sea-anime-music-${profileKey}`) === "true"
        } catch { return false }
    })
    const [musicVolume, setMusicVolumeRaw] = React.useState<number>(() => {
        if (typeof window === "undefined") return 0.3
        try {
            const v = parseFloat(seaStorage.getItem(`sea-anime-vol-${profileKey}`) ?? "")
            return isNaN(v) ? 0.3 : Math.max(0, Math.min(1, v))
        } catch { return 0.3 }
    })

    const setMusicEnabled = React.useCallback((v: boolean) => {
        setMusicEnabledRaw(v)
        try { seaStorage.setItem(`sea-anime-music-${profileKey}`, String(v)) } catch { }
    }, [profileKey])

    const setMusicVolume = React.useCallback((v: number) => {
        setMusicVolumeRaw(v)
        try { seaStorage.setItem(`sea-anime-vol-${profileKey}`, String(v)) } catch { }
    }, [profileKey])

    // ── Animated elements intensity ──
    const [animatedIntensity, setAnimatedIntensityRaw] = React.useState<number>(() => {
        if (typeof window === "undefined") return 50
        try {
            const v = parseInt(seaStorage.getItem(`sea-anime-particles-${profileKey}`) ?? "", 10)
            return isNaN(v) ? 50 : Math.max(0, Math.min(100, v))
        } catch { return 50 }
    })

    const setAnimatedIntensity = React.useCallback((v: number) => {
        const clamped = Math.max(0, Math.min(100, v))
        setAnimatedIntensityRaw(clamped)
        try { seaStorage.setItem(`sea-anime-particles-${profileKey}`, String(clamped)) } catch { }
    }, [profileKey])

    // ── Per-particle-type settings ──
    const particleStorageKey = `sea-anime-ptypes-${profileKey}-${themeId}`

    const buildDefaultParticleSettings = React.useCallback((): ParticleSettings => {
        const types = config.particleTypes ?? {}
        const out: ParticleSettings = {}
        for (const [k, v] of Object.entries(types) as [string, ParticleTypeConfig][]) {
            out[k] = { enabled: v.defaultEnabled, intensity: v.defaultIntensity }
        }
        return out
    }, [config.particleTypes])

    const [particleSettings, setParticleSettingsRaw] = React.useState<ParticleSettings>(() => {
        const defaults = (() => {
            const types = (ANIME_THEMES[themeId as AnimeThemeId]?.particleTypes ?? {}) as Record<string, ParticleTypeConfig>
            const out: ParticleSettings = {}
            for (const [k, v] of Object.entries(types) as [string, ParticleTypeConfig][]) {
                out[k] = { enabled: v.defaultEnabled, intensity: v.defaultIntensity }
            }
            return out
        })()
        if (typeof window === "undefined") return defaults
        try {
            const raw = seaStorage.getItem(particleStorageKey)
            if (raw) {
                const parsed = JSON.parse(raw) as ParticleSettings
                // merge with defaults so new particle types get defaults
                return { ...defaults, ...parsed }
            }
        } catch { /* noop */ }
        return defaults
    })

    // Reset particle settings when theme changes
    React.useEffect(() => {
        const defaults = buildDefaultParticleSettings()
        try {
            const raw = seaStorage.getItem(particleStorageKey)
            if (raw) {
                const parsed = JSON.parse(raw) as ParticleSettings
                setParticleSettingsRaw({ ...defaults, ...parsed })
            } else {
                setParticleSettingsRaw(defaults)
            }
        } catch {
            setParticleSettingsRaw(defaults)
        }
    }, [themeId, particleStorageKey, buildDefaultParticleSettings])

    const persistParticleSettings = React.useCallback((settings: ParticleSettings) => {
        setParticleSettingsRaw(settings)
        try { seaStorage.setItem(particleStorageKey, JSON.stringify(settings)) } catch { }
    }, [particleStorageKey])

    const setParticleTypeEnabled = React.useCallback((typeId: string, enabled: boolean) => {
        setParticleSettingsRaw((prev: ParticleSettings) => {
            const next = { ...prev, [typeId]: { ...prev[typeId], enabled } }
            try { seaStorage.setItem(particleStorageKey, JSON.stringify(next)) } catch { }
            return next
        })
    }, [particleStorageKey])

    const setParticleTypeIntensity = React.useCallback((typeId: string, intensity: number) => {
        const clamped = Math.max(0, Math.min(100, intensity))
        setParticleSettingsRaw((prev: ParticleSettings) => {
            const next = { ...prev, [typeId]: { ...prev[typeId], intensity: clamped } }
            try { seaStorage.setItem(particleStorageKey, JSON.stringify(next)) } catch { }
            return next
        })
    }, [particleStorageKey])

    // ── Background dim / blur (per-theme, user-overridable) ──
    const [backgroundDim, setBackgroundDimRaw] = React.useState<number>(() => {
        if (typeof window === "undefined") return config.backgroundDim ?? 0.30
        try {
            const stored = seaStorage.getItem(`sea-anime-bgdim-${profileKey}-${themeId}`)
            if (stored !== null) {
                const v = parseFloat(stored)
                if (!isNaN(v)) return Math.max(0, Math.min(1, v))
            }
        } catch { }
        return config.backgroundDim ?? 0.30
    })

    const [backgroundBlur, setBackgroundBlurRaw] = React.useState<number>(() => {
        if (typeof window === "undefined") return config.backgroundBlur ?? 30
        try {
            const stored = seaStorage.getItem(`sea-anime-bgblur-${profileKey}-${themeId}`)
            if (stored !== null) {
                const v = parseFloat(stored)
                if (!isNaN(v)) return Math.max(0, Math.min(100, v))
            }
        } catch { }
        return config.backgroundBlur ?? 30
    })

    // ── Background exposure / saturation (per-theme, user-overridable) ──
    const [backgroundExposure, setBackgroundExposureRaw] = React.useState<number>(() => {
        if (typeof window === "undefined") return 1.0
        try {
            const stored = seaStorage.getItem(`sea-anime-bgexposure-${profileKey}-${themeId}`)
            if (stored !== null) {
                const v = parseFloat(stored)
                if (!isNaN(v)) return Math.max(0.1, Math.min(2.5, v))
            }
        } catch { }
        return 1.0
    })

    const [backgroundSaturation, setBackgroundSaturationRaw] = React.useState<number>(() => {
        if (typeof window === "undefined") return 1.0
        try {
            const stored = seaStorage.getItem(`sea-anime-bgsat-${profileKey}-${themeId}`)
            if (stored !== null) {
                const v = parseFloat(stored)
                if (!isNaN(v)) return Math.max(0, Math.min(3.0, v))
            }
        } catch { }
        return 1.0
    })

    const [backgroundContrast, setBackgroundContrastRaw] = React.useState<number>(() => {
        if (typeof window === "undefined") return 1.0
        try {
            const stored = seaStorage.getItem(`sea-anime-bgcontrast-${profileKey}-${themeId}`)
            if (stored !== null) {
                const v = parseFloat(stored)
                if (!isNaN(v)) return Math.max(0, Math.min(3.0, v))
            }
        } catch { }
        return 1.0
    })

    // ── Brand color override (per-theme, per-profile) ──
    const [brandColorOverride, setBrandColorOverrideRaw] = React.useState<string | null>(() => {
        if (typeof window === "undefined") return null
        try {
            return seaStorage.getItem(`sea-anime-color-${profileKey}-${themeId}`) ?? null
        } catch { return null }
    })

    // Reload dim/blur/exposure/saturation/brand when theme or profile changes
    React.useEffect(() => {
        try {
            const s = seaStorage.getItem(`sea-anime-bgdim-${profileKey}-${themeId}`)
            setBackgroundDimRaw(s !== null && !isNaN(parseFloat(s)) ? Math.max(0, Math.min(1, parseFloat(s))) : (config.backgroundDim ?? 0.30))
        } catch { setBackgroundDimRaw(config.backgroundDim ?? 0.30) }
        try {
            const s = seaStorage.getItem(`sea-anime-bgblur-${profileKey}-${themeId}`)
            setBackgroundBlurRaw(s !== null && !isNaN(parseFloat(s)) ? Math.max(0, Math.min(100, parseFloat(s))) : (config.backgroundBlur ?? 30))
        } catch { setBackgroundBlurRaw(config.backgroundBlur ?? 30) }
        try {
            const s = seaStorage.getItem(`sea-anime-bgexposure-${profileKey}-${themeId}`)
            setBackgroundExposureRaw(s !== null && !isNaN(parseFloat(s)) ? Math.max(0.1, Math.min(2.5, parseFloat(s))) : 1.0)
        } catch { setBackgroundExposureRaw(1.0) }
        try {
            const s = seaStorage.getItem(`sea-anime-bgsat-${profileKey}-${themeId}`)
            setBackgroundSaturationRaw(s !== null && !isNaN(parseFloat(s)) ? Math.max(0, Math.min(3.0, parseFloat(s))) : 1.0)
        } catch { setBackgroundSaturationRaw(1.0) }
        try {
            const s = seaStorage.getItem(`sea-anime-bgcontrast-${profileKey}-${themeId}`)
            setBackgroundContrastRaw(s !== null && !isNaN(parseFloat(s)) ? Math.max(0, Math.min(3.0, parseFloat(s))) : 1.0)
        } catch { setBackgroundContrastRaw(1.0) }
        try {
            setBrandColorOverrideRaw(seaStorage.getItem(`sea-anime-color-${profileKey}-${themeId}`) ?? null)
        } catch { setBrandColorOverrideRaw(null) }
    }, [themeId, profileKey, config.backgroundDim, config.backgroundBlur])

    const setBackgroundDim = React.useCallback((v: number) => {
        const clamped = Math.max(0, Math.min(1, v))
        setBackgroundDimRaw(clamped)
        try { seaStorage.setItem(`sea-anime-bgdim-${profileKey}-${themeId}`, String(clamped)) } catch { }
    }, [profileKey, themeId])

    const setBackgroundBlur = React.useCallback((v: number) => {
        const clamped = Math.max(0, Math.min(100, v))
        setBackgroundBlurRaw(clamped)
        try { seaStorage.setItem(`sea-anime-bgblur-${profileKey}-${themeId}`, String(clamped)) } catch { }
    }, [profileKey, themeId])

    const setBackgroundExposure = React.useCallback((v: number) => {
        const clamped = Math.max(0.1, Math.min(2.5, v))
        setBackgroundExposureRaw(clamped)
        try { seaStorage.setItem(`sea-anime-bgexposure-${profileKey}-${themeId}`, String(clamped)) } catch { }
    }, [profileKey, themeId])

    const setBackgroundSaturation = React.useCallback((v: number) => {
        const clamped = Math.max(0, Math.min(3.0, v))
        setBackgroundSaturationRaw(clamped)
        try { seaStorage.setItem(`sea-anime-bgsat-${profileKey}-${themeId}`, String(clamped)) } catch { }
    }, [profileKey, themeId])

    const setBackgroundContrast = React.useCallback((v: number) => {
        const clamped = Math.max(0, Math.min(3.0, v))
        setBackgroundContrastRaw(clamped)
        try { seaStorage.setItem(`sea-anime-bgcontrast-${profileKey}-${themeId}`, String(clamped)) } catch { }
    }, [profileKey, themeId])

    const setBrandColorOverride = React.useCallback((color: string | null) => {
        setBrandColorOverrideRaw(color)
        try {
            if (color === null) {
                seaStorage.removeItem(`sea-anime-color-${profileKey}-${themeId}`)
            } else {
                seaStorage.setItem(`sea-anime-color-${profileKey}-${themeId}`, color)
            }
        } catch { }
    }, [profileKey, themeId])

    // ── Active background URL (per-theme, per-profile, user-selectable) ──
    const [activeBackgroundUrl, setActiveBackgroundUrlRaw] = React.useState<string | null>(() => {
        if (typeof window === "undefined") return ANIME_THEMES[themeId as AnimeThemeId]?.backgroundImageUrl ?? null
        if (themeId === "seanime") return null
        try {
            const stored = seaStorage.getItem(`sea-anime-bgurl-${profileKey}-${themeId}`)
            if (stored !== null) return stored
        } catch { }
        return ANIME_THEMES[themeId as AnimeThemeId]?.backgroundImageUrl ?? null
    })

    // Reload active background when theme or profile changes
    React.useEffect(() => {
        if (themeId === "seanime") {
            setActiveBackgroundUrlRaw(null)
            return
        }
        try {
            const stored = seaStorage.getItem(`sea-anime-bgurl-${profileKey}-${themeId}`)
            setActiveBackgroundUrlRaw(stored !== null ? stored : (ANIME_THEMES[themeId as AnimeThemeId]?.backgroundImageUrl ?? null))
        } catch {
            setActiveBackgroundUrlRaw(ANIME_THEMES[themeId as AnimeThemeId]?.backgroundImageUrl ?? null)
        }
    }, [themeId, profileKey])

    const setActiveBackgroundUrl = React.useCallback((url: string | null) => {
        if (themeId === "seanime") return
        setActiveBackgroundUrlRaw(url)
        try {
            if (url === null || url === (ANIME_THEMES[themeId as AnimeThemeId]?.backgroundImageUrl ?? null)) {
                seaStorage.removeItem(`sea-anime-bgurl-${profileKey}-${themeId}`)
            } else {
                seaStorage.setItem(`sea-anime-bgurl-${profileKey}-${themeId}`, url)
            }
        } catch { }
    }, [profileKey, themeId])

    // ── CSS var injection ──
    React.useEffect(() => {
        const root = document.documentElement
        const vars = config.cssVars
        Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v as string))
        // Apply brand color override (derived shades) after base vars
        if (brandColorOverride) {
            const shades = deriveBrandShades(brandColorOverride)
            Object.entries(shades).forEach(([k, v]) => root.style.setProperty(k, v))
        }

        return () => {
            // On cleanup, clear only the vars this theme set (next theme will overwrite)
            Object.keys(vars).forEach(k => root.style.removeProperty(k))
        }
    }, [config, brandColorOverride])

    // ── Background image: hide default body:before AND body:after when a custom bg is active ──
    React.useEffect(() => {
        const root = document.documentElement
        if (config.id !== "seanime" && activeBackgroundUrl) {
            root.style.setProperty("--body-bg-opacity", "0")
            root.style.setProperty("--body-after-opacity", "0")
        } else {
            root.style.removeProperty("--body-bg-opacity")
            root.style.removeProperty("--body-after-opacity")
        }
        return () => {
            root.style.removeProperty("--body-bg-opacity")
            root.style.removeProperty("--body-after-opacity")
        }
    }, [config.id, activeBackgroundUrl])

    // ── Google Font injection ──
    React.useEffect(() => {
        const prevLink = document.getElementById("anime-theme-font")
        if (prevLink) prevLink.remove()
        if (!config.fontHref) return

        const link = document.createElement("link")
        link.id = "anime-theme-font"
        link.rel = "stylesheet"
        link.href = config.fontHref
        document.head.appendChild(link)

        return () => {
            const el = document.getElementById("anime-theme-font")
            if (el) el.remove()
        }
    }, [config.fontHref])

    // ── Global font-family override ──
    React.useEffect(() => {
        if (config.fontFamily && config.id !== "seanime") {
            document.documentElement.style.setProperty("--font-anime-theme", config.fontFamily)
        } else {
            document.documentElement.style.removeProperty("--font-anime-theme")
        }
    }, [config.fontFamily, config.id])

    // ── Theme data-attribute for per-theme CSS text animations ──
    React.useEffect(() => {
        if (config.id !== "seanime") {
            document.documentElement.dataset.animeTheme = config.id
        } else {
            delete document.documentElement.dataset.animeTheme
        }
        return () => { delete document.documentElement.dataset.animeTheme }
    }, [config.id])

    // ── Themed cursor CSS injection ──
    // Skip if the user has chosen a custom cursor from the reward shop (--sea-cursor is set)
    React.useEffect(() => {
        const prevStyle = document.getElementById("anime-theme-cursors")
        if (prevStyle) prevStyle.remove()
        if (config.id === "seanime") return

        // If the user has a reward-shop cursor active, don't override it with the theme cursor
        const seaCursor = document.documentElement.style.getPropertyValue("--sea-cursor")
        if (seaCursor && seaCursor !== "auto") return

        const color = config.particleColor ?? "#ffffff"
        const style = document.createElement("style")
        style.id = "anime-theme-cursors"
        style.textContent = buildThemeCursorCSS(color)
        document.head.appendChild(style)

        return () => {
            const el = document.getElementById("anime-theme-cursors")
            if (el) el.remove()
        }
    }, [config.id, config.particleColor])

    // ── Vignette / Glow effects ──
    const [vignetteStrength, setVignetteStrengthRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(`sea-anime-vignette-${profileKey}-${themeId}`) ?? ""); return isNaN(v) ? 0 : Math.max(0, Math.min(1, v)) } catch { return 0 }
    })
    const [vignetteSize, setVignetteSizeRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(`sea-anime-vsize-${profileKey}-${themeId}`) ?? ""); return isNaN(v) ? 0.5 : Math.max(0, Math.min(1, v)) } catch { return 0.5 }
    })
    const [glowStrength, setGlowStrengthRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(`sea-anime-glow-${profileKey}-${themeId}`) ?? ""); return isNaN(v) ? 0 : Math.max(0, Math.min(1, v)) } catch { return 0 }
    })
    const [glowSpeed, setGlowSpeedRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(`sea-anime-gspeed-${profileKey}-${themeId}`) ?? ""); return isNaN(v) ? 2 : Math.max(0.2, Math.min(5, v)) } catch { return 2 }
    })
    const [glowScale, setGlowScaleRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(`sea-anime-gscale-${profileKey}-${themeId}`) ?? ""); return isNaN(v) ? 0.5 : Math.max(0, Math.min(1, v)) } catch { return 0.5 }
    })
    const setVignetteStrength = React.useCallback((v: number) => { const c = Math.max(0, Math.min(1, v)); setVignetteStrengthRaw(c); try { seaStorage.setItem(`sea-anime-vignette-${profileKey}-${themeId}`, String(c)) } catch { } }, [profileKey, themeId])
    const setVignetteSize = React.useCallback((v: number) => { const c = Math.max(0, Math.min(1, v)); setVignetteSizeRaw(c); try { seaStorage.setItem(`sea-anime-vsize-${profileKey}-${themeId}`, String(c)) } catch { } }, [profileKey, themeId])
    const setGlowStrength = React.useCallback((v: number) => { const c = Math.max(0, Math.min(1, v)); setGlowStrengthRaw(c); try { seaStorage.setItem(`sea-anime-glow-${profileKey}-${themeId}`, String(c)) } catch { } }, [profileKey, themeId])
    const setGlowSpeed = React.useCallback((v: number) => { const c = Math.max(0.2, Math.min(5, v)); setGlowSpeedRaw(c); try { seaStorage.setItem(`sea-anime-gspeed-${profileKey}-${themeId}`, String(c)) } catch { } }, [profileKey, themeId])
    const setGlowScale = React.useCallback((v: number) => { const c = Math.max(0, Math.min(1, v)); setGlowScaleRaw(c); try { seaStorage.setItem(`sea-anime-gscale-${profileKey}-${themeId}`, String(c)) } catch { } }, [profileKey, themeId])

    // ── Hologram effect ──
    const [hologramStrength, setHologramStrengthRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(`sea-anime-hologram-${profileKey}-${themeId}`) ?? ""); return isNaN(v) ? 0 : Math.max(0, Math.min(1, v)) } catch { return 0 }
    })
    const setHologramStrength = React.useCallback((v: number) => { const c = Math.max(0, Math.min(1, v)); setHologramStrengthRaw(c); try { seaStorage.setItem(`sea-anime-hologram-${profileKey}-${themeId}`, String(c)) } catch { } }, [profileKey, themeId])

    // ── Scanlines ──
    const [scanlinesStrength, setScanlinesStrengthRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(`sea-anime-scan-${profileKey}-${themeId}`) ?? ""); return isNaN(v) ? 0 : Math.max(0, Math.min(1, v)) } catch { return 0 }
    })
    const [scanlinesSize, setScanlinesSizeRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(`sea-anime-scansize-${profileKey}-${themeId}`) ?? ""); return isNaN(v) ? 0.5 : Math.max(0, Math.min(1, v)) } catch { return 0.5 }
    })
    const [scanlinesSpeed, setScanlinesSpeedRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(`sea-anime-scanspeed-${profileKey}-${themeId}`) ?? ""); return isNaN(v) ? 1 : Math.max(0.1, Math.min(5, v)) } catch { return 1 }
    })
    const setScanlinesStrength = React.useCallback((v: number) => { const c = Math.max(0, Math.min(1, v)); setScanlinesStrengthRaw(c); try { seaStorage.setItem(`sea-anime-scan-${profileKey}-${themeId}`, String(c)) } catch { } }, [profileKey, themeId])
    const setScanlinesSize = React.useCallback((v: number) => { const c = Math.max(0, Math.min(1, v)); setScanlinesSizeRaw(c); try { seaStorage.setItem(`sea-anime-scansize-${profileKey}-${themeId}`, String(c)) } catch { } }, [profileKey, themeId])
    const setScanlinesSpeed = React.useCallback((v: number) => { const c = Math.max(0.1, Math.min(5, v)); setScanlinesSpeedRaw(c); try { seaStorage.setItem(`sea-anime-scanspeed-${profileKey}-${themeId}`, String(c)) } catch { } }, [profileKey, themeId])

    // ── Noise ──
    const [noiseStrength, setNoiseStrengthRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(`sea-anime-noise-${profileKey}-${themeId}`) ?? ""); return isNaN(v) ? 0 : Math.max(0, Math.min(1, v)) } catch { return 0 }
    })
    const [noiseSpeed, setNoiseSpeedRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(`sea-anime-nspeed-${profileKey}-${themeId}`) ?? ""); return isNaN(v) ? 1 : Math.max(0.1, Math.min(5, v)) } catch { return 1 }
    })
    const [noiseScale, setNoiseScaleRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(`sea-anime-nscale-${profileKey}-${themeId}`) ?? ""); return isNaN(v) ? 1 : Math.max(0.5, Math.min(3, v)) } catch { return 1 }
    })
    const setNoiseStrength = React.useCallback((v: number) => { const c = Math.max(0, Math.min(1, v)); setNoiseStrengthRaw(c); try { seaStorage.setItem(`sea-anime-noise-${profileKey}-${themeId}`, String(c)) } catch { } }, [profileKey, themeId])
    const setNoiseSpeed = React.useCallback((v: number) => { const c = Math.max(0.1, Math.min(5, v)); setNoiseSpeedRaw(c); try { seaStorage.setItem(`sea-anime-nspeed-${profileKey}-${themeId}`, String(c)) } catch { } }, [profileKey, themeId])
    const setNoiseScale = React.useCallback((v: number) => { const c = Math.max(0.5, Math.min(3, v)); setNoiseScaleRaw(c); try { seaStorage.setItem(`sea-anime-nscale-${profileKey}-${themeId}`, String(c)) } catch { } }, [profileKey, themeId])

    // ── Custom theme data ──
    const [customThemeData, setCustomThemeDataRaw] = React.useState<import("./custom-theme").CustomThemeData | null>(() => {
        try { const raw = seaStorage.getItem(`sea-custom-theme-${profileKey}`); return raw ? JSON.parse(raw) as import("./custom-theme").CustomThemeData : null } catch { return null }
    })
    const setCustomThemeData = React.useCallback((data: import("./custom-theme").CustomThemeData) => {
        setCustomThemeDataRaw(data)
        try { seaStorage.setItem(`sea-custom-theme-${profileKey}`, JSON.stringify(data)) } catch { }
    }, [profileKey])

    const value = React.useMemo<AnimeThemeContextValue>(() => ({
        themeId,
        config,
        setThemeId,
        musicEnabled,
        setMusicEnabled,
        musicVolume,
        setMusicVolume,
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
        backgroundContrast,
        setBackgroundContrast,
        activeBackgroundUrl,
        setActiveBackgroundUrl,
        brandColorOverride,
        setBrandColorOverride,
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
        customThemeData,
        setCustomThemeData,
        scanlinesStrength,
        setScanlinesStrength,
        scanlinesSize,
        setScanlinesSize,
        scanlinesSpeed,
        setScanlinesSpeed,
        noiseStrength,
        setNoiseStrength,
        noiseSpeed,
        setNoiseSpeed,
        noiseScale,
        setNoiseScale,
        hologramStrength,
        setHologramStrength,
    }), [themeId, config, setThemeId, musicEnabled, setMusicEnabled, musicVolume, setMusicVolume, animatedIntensity, setAnimatedIntensity, particleSettings, setParticleTypeEnabled, setParticleTypeIntensity, backgroundDim, setBackgroundDim, backgroundBlur, setBackgroundBlur, backgroundExposure, setBackgroundExposure, backgroundSaturation, setBackgroundSaturation, backgroundContrast, setBackgroundContrast, activeBackgroundUrl, setActiveBackgroundUrl, brandColorOverride, setBrandColorOverride, vignetteStrength, setVignetteStrength, vignetteSize, setVignetteSize, glowStrength, setGlowStrength, glowSpeed, setGlowSpeed, glowScale, setGlowScale, customThemeData, setCustomThemeData, scanlinesStrength, setScanlinesStrength, scanlinesSize, setScanlinesSize, scanlinesSpeed, setScanlinesSpeed, noiseStrength, setNoiseStrength, noiseSpeed, setNoiseSpeed, noiseScale, setNoiseScale, hologramStrength, setHologramStrength])

    return (
        <AnimeThemeContext.Provider value={value}>
            {children}
            <AnimeThemeMusicPlayer />
            {config.id !== "seanime" && activeBackgroundUrl && <ThemeBackgroundImage url={activeBackgroundUrl} dim={backgroundDim} blur={backgroundBlur} exposure={backgroundExposure} saturation={backgroundSaturation} contrast={backgroundContrast} scanlinesStrength={scanlinesStrength} scanlinesSize={scanlinesSize} noiseStrength={noiseStrength} noiseSpeed={noiseSpeed} vignetteStrength={vignetteStrength} vignetteSize={vignetteSize} glowStrength={glowStrength} glowSpeed={glowSpeed} glowScale={glowScale} hologramStrength={hologramStrength} />}
            {config.id !== "seanime" && <ThemeAnimatedOverlay themeId={themeId} intensity={animatedIntensity} particleSettings={particleSettings} particleColor={config.particleColor} />}
        </AnimeThemeContext.Provider>
    )
}

// ─────────────────────────────────────────────────────────────────
// Music Player
// ─────────────────────────────────────────────────────────────────
//
// Playlist player with:
//   • Crossfade between tracks (3s)
//   • Fade-out while any <video> is playing, fade back in when it stops
//   • Loop modes: off / one / all
//   • Cross-theme "equip" support — equippedThemeOstIdAtom overrides the active theme
//   • Backward-compatible: when no downloaded tracks exist but the legacy
//     config.musicUrl ("opening.mp3") is present, the single file loops as before.

const FADE_MS = 3000

function useVideoFadeWatcher() {
    const setVideoFade = useSetAtom(videoFadeActiveAtom)
    React.useEffect(() => {
        if (typeof document === "undefined") return
        const playing = new Set<HTMLVideoElement>()
        const isVideo = (t: EventTarget | null): t is HTMLVideoElement =>
            !!t && (t as HTMLElement).tagName === "VIDEO"
        const recompute = () => setVideoFade(playing.size > 0)
        const onPlay = (e: Event) => { if (isVideo(e.target)) { playing.add(e.target); recompute() } }
        const onStop = (e: Event) => { if (isVideo(e.target)) { playing.delete(e.target); recompute() } }
        document.addEventListener("play", onPlay, true)
        document.addEventListener("pause", onStop, true)
        document.addEventListener("ended", onStop, true)
        // On unmount, treat all as stopped (also catches DOM removal cases).
        return () => {
            document.removeEventListener("play", onPlay, true)
            document.removeEventListener("pause", onStop, true)
            document.removeEventListener("ended", onStop, true)
            playing.clear()
            setVideoFade(false)
        }
    }, [setVideoFade])
}

function AnimeThemeMusicPlayer() {
    const { config, musicEnabled, musicVolume } = useAnimeTheme()
    const equippedThemeId = useAtomValue(equippedThemeOstIdAtom)
    const activeThemeId = (equippedThemeId && equippedThemeId.length > 0) ? equippedThemeId : config.id
    const tracksQuery = useListThemeMusicMetadata(activeThemeId, activeThemeId !== "seanime")
    const tracks = tracksQuery.data ?? []

    const [playing, setPlaying] = useAtom(themeOstPlayingAtom)
    const [trackIndex, setTrackIndex] = useAtom(themeOstCurrentTrackIndexAtom)
    const loopMode = useAtomValue(themeOstLoopModeAtom)
    const [skipDir, setSkipDir] = useAtom(themeOstSkipDirectionAtom)
    const [seekReq, setSeekReq] = useAtom(themeOstSeekRequestAtom)
    const videoFade = useAtomValue(videoFadeActiveAtom)
    const setPosition = useSetAtom(themeOstPositionAtom)

    useVideoFadeWatcher()

    const audioARef = React.useRef<HTMLAudioElement | null>(null)
    const audioBRef = React.useRef<HTMLAudioElement | null>(null)
    const activeRef = React.useRef<"A" | "B">("A")
    const fadingRef = React.useRef<boolean>(false)
    const videoFadeAmountRef = React.useRef<number>(0) // 0 = full volume, 1 = silent
    const lastTickRef = React.useRef<number>(0)

    // Resolve current legacy single-file source (used when no playlist tracks).
    const legacySrc = (tracks.length === 0 && config.musicUrl && config.id !== "seanime" && !equippedThemeId)
        ? config.musicUrl
        : null

    // Clamp track index when playlist size shrinks.
    React.useEffect(() => {
        if (tracks.length === 0) {
            if (trackIndex !== 0) setTrackIndex(0)
            return
        }
        if (trackIndex >= tracks.length) setTrackIndex(0)
    }, [tracks.length, trackIndex, setTrackIndex])

    // Reset track index when the active theme changes.
    const prevThemeRef = React.useRef(activeThemeId)
    React.useEffect(() => {
        if (prevThemeRef.current !== activeThemeId) {
            prevThemeRef.current = activeThemeId
            setTrackIndex(0)
        }
    }, [activeThemeId, setTrackIndex])

    // Effective playback volume — combines user volume + video-fade dim.
    const effectiveVolume = React.useCallback(() => {
        return Math.max(0, Math.min(1, musicVolume)) * (1 - videoFadeAmountRef.current)
    }, [musicVolume])

    // Helper: get refs by side.
    const refFor = React.useCallback((side: "A" | "B") => (side === "A" ? audioARef.current : audioBRef.current), [])

    // ── Load active track when index/theme/source changes ──────────────
    React.useEffect(() => {
        const a = refFor(activeRef.current)
        if (!a) return
        if (legacySrc) {
            if (a.src !== absoluteUrl(legacySrc)) a.src = legacySrc
            a.loop = true
        } else if (tracks.length > 0) {
            const url = tracks[trackIndex]?.url
            if (url && a.src !== absoluteUrl(url)) {
                a.src = url
                a.currentTime = 0
            }
            a.loop = false
        } else {
            a.removeAttribute("src")
            a.load?.()
        }
        a.volume = effectiveVolume()
        // Inactive side should be silent and paused while not crossfading.
        const inactive = refFor(activeRef.current === "A" ? "B" : "A")
        if (inactive && !fadingRef.current) {
            inactive.pause()
            inactive.volume = 0
        }
    }, [tracks, trackIndex, legacySrc, refFor, effectiveVolume])

    // ── Play/pause state ───────────────────────────────────────────────
    React.useEffect(() => {
        const a = refFor(activeRef.current)
        if (!a) return
        const shouldPlay = musicEnabled && playing && (!!legacySrc || tracks.length > 0)
        if (shouldPlay) {
            a.play().catch(() => { /* autoplay rejected — wait for user gesture */ })
        } else {
            a.pause()
            const inactive = refFor(activeRef.current === "A" ? "B" : "A")
            inactive?.pause()
        }
    }, [musicEnabled, playing, legacySrc, tracks.length, refFor])

    // ── Skip handling ─────────────────────────────────────────────────
    React.useEffect(() => {
        if (!skipDir) return
        if (tracks.length === 0) { setSkipDir(null); return }
        const delta = skipDir === "next" ? 1 : -1
        const nextIdx = ((trackIndex + delta) % tracks.length + tracks.length) % tracks.length
        setTrackIndex(nextIdx)
        setSkipDir(null)
    }, [skipDir, tracks.length, trackIndex, setTrackIndex, setSkipDir])

    // ── Seek handling ─────────────────────────────────────────────────
    React.useEffect(() => {
        if (seekReq == null) return
        const a = refFor(activeRef.current)
        if (a && isFinite(seekReq)) {
            try { a.currentTime = Math.max(0, seekReq) } catch { /* ignore */ }
        }
        setSeekReq(null)
    }, [seekReq, refFor, setSeekReq])

    // ── Volume + video-fade ramp ──────────────────────────────────────
    React.useEffect(() => {
        let raf = 0
        const tick = (t: number) => {
            const dt = lastTickRef.current ? (t - lastTickRef.current) : 16
            lastTickRef.current = t
            const target = videoFade ? 1 : 0
            const cur = videoFadeAmountRef.current
            if (cur !== target) {
                const step = (dt / FADE_MS)
                videoFadeAmountRef.current = target > cur
                    ? Math.min(target, cur + step)
                    : Math.max(target, cur - step)
                const a = refFor(activeRef.current)
                if (a) a.volume = effectiveVolume()
            }
            raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => { cancelAnimationFrame(raf); lastTickRef.current = 0 }
    }, [videoFade, refFor, effectiveVolume])

    // Apply volume when musicVolume changes directly.
    React.useEffect(() => {
        const a = refFor(activeRef.current)
        if (a) a.volume = effectiveVolume()
    }, [musicVolume, refFor, effectiveVolume])

    // ── On-ended: handle loop modes (no crossfade case) ───────────────
    const handleEnded = React.useCallback((side: "A" | "B") => {
        // Only handle if this is the active element and we are not already crossfading.
        if (side !== activeRef.current) return
        if (legacySrc) return // loops natively
        if (tracks.length === 0) return
        if (loopMode === "one") {
            const a = refFor(activeRef.current)
            if (a) { a.currentTime = 0; a.play().catch(() => { }) }
            return
        }
        if (loopMode === "off" && trackIndex >= tracks.length - 1) {
            setPlaying(false)
            return
        }
        const nextIdx = (trackIndex + 1) % tracks.length
        setTrackIndex(nextIdx)
    }, [legacySrc, tracks.length, loopMode, trackIndex, refFor, setTrackIndex, setPlaying])

    // ── Crossfade engine: when active track is ≤ FADE_MS from end, start fading into next. ──
    const handleTimeUpdate = React.useCallback((side: "A" | "B") => {
        if (side !== activeRef.current) return
        const a = refFor(activeRef.current)
        if (!a) return
        const cur = a.currentTime || 0
        const dur = a.duration || 0
        setPosition({ current: cur, duration: isFinite(dur) ? dur : 0 })

        if (legacySrc) return
        if (tracks.length < 2) return
        if (loopMode === "one") return
        if (fadingRef.current) return
        if (!isFinite(dur) || dur <= 0) return
        const remaining = dur - cur
        if (remaining > FADE_MS / 1000) return

        // Determine the next track index.
        const nextIdx = (trackIndex + 1) % tracks.length
        // Loop "off": at the very last track, don't crossfade — let onEnded stop us.
        if (loopMode === "off" && trackIndex >= tracks.length - 1) return

        // Begin crossfade.
        const nextSide: "A" | "B" = activeRef.current === "A" ? "B" : "A"
        const nextEl = refFor(nextSide)
        if (!nextEl) return
        const nextUrl = tracks[nextIdx]?.url
        if (!nextUrl) return
        nextEl.src = nextUrl
        nextEl.currentTime = 0
        nextEl.volume = 0
        nextEl.loop = false
        nextEl.play().catch(() => { /* user gesture may be needed */ })

        fadingRef.current = true
        const start = performance.now()
        const startCurVol = a.volume
        const target = effectiveVolume()
        const stepFn = (t: number) => {
            const k = Math.min(1, (t - start) / FADE_MS)
            const aEl = refFor(activeRef.current)
            const nEl = refFor(nextSide)
            if (aEl) aEl.volume = startCurVol * (1 - k)
            if (nEl) nEl.volume = target * k
            if (k < 1) {
                requestAnimationFrame(stepFn)
            } else {
                if (aEl) { aEl.pause(); aEl.volume = 0 }
                activeRef.current = nextSide
                fadingRef.current = false
                setTrackIndex(nextIdx)
            }
        }
        requestAnimationFrame(stepFn)
    }, [legacySrc, tracks, trackIndex, loopMode, refFor, setPosition, setTrackIndex, effectiveVolume])

    if (!legacySrc && tracks.length === 0) {
        // Nothing to play — render hidden audios for future state but no source.
        return null
    }

    return (
        <>
            <audio
                ref={audioARef}
                preload="auto"
                onEnded={() => handleEnded("A")}
                onTimeUpdate={() => handleTimeUpdate("A")}
                style={{ display: "none" }}
            />
            <audio
                ref={audioBRef}
                preload="auto"
                onEnded={() => handleEnded("B")}
                onTimeUpdate={() => handleTimeUpdate("B")}
                style={{ display: "none" }}
            />
        </>
    )
}

// absoluteUrl resolves a possibly-relative audio URL the same way the
// browser would when setting `audio.src`, so we can compare cleanly.
function absoluteUrl(u: string): string {
    if (typeof window === "undefined") return u
    try { return new URL(u, window.location.href).toString() } catch { return u }
}

// ─────────────────────────────────────────────────────────────────
// Theme Background Image
// ─────────────────────────────────────────────────────────────────

function ThemeBackgroundImage({ url, dim, blur, exposure, saturation, contrast, scanlinesStrength = 0, scanlinesSize = 0.5, noiseStrength = 0, noiseSpeed = 1, noiseScale = 1, vignetteStrength = 0, vignetteSize = 0.5, glowStrength = 0, glowSpeed = 2, glowScale = 0.5, hologramStrength = 0 }: { url: string; dim?: number; blur?: number; exposure?: number; saturation?: number; contrast?: number; scanlinesStrength?: number; scanlinesSize?: number; noiseStrength?: number; noiseSpeed?: number; noiseScale?: number; vignetteStrength?: number; vignetteSize?: number; glowStrength?: number; glowSpeed?: number; glowScale?: number; hologramStrength?: number }) {
    const previewMode = useAtomValue(wallpaperPreviewModeAtom)
    const effectiveDim = previewMode ? 0.05 : (dim ?? 0.65)
    const opacity = 1 - effectiveDim
    const filterParts: string[] = []
    if (blur) filterParts.push(`blur(${blur}px)`)
    if (exposure != null && exposure !== 1) filterParts.push(`brightness(${exposure})`)
    if (saturation != null && saturation !== 1) filterParts.push(`saturate(${saturation})`)
    if (contrast != null && contrast !== 1) filterParts.push(`contrast(${contrast})`)
    const lineHeight = Math.round(2 + scanlinesSize * 6)
    const noiseAnimDuration = `${(1 / noiseSpeed).toFixed(2)}s`
    return (
        <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none" }}>
            {/* Wallpaper image */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: `url("${url}")`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    opacity,
                    filter: filterParts.length > 0 ? filterParts.join(" ") : undefined,
                    boxShadow: "inset 0 0 120px 40px rgba(0,0,0,0.5), inset 0 0 40px 20px rgba(0,0,0,0.3)",
                }}
            />
            {/* Scanlines - static overlay (no animation to avoid lag) */}
            {scanlinesStrength > 0 && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        backgroundImage: `repeating-linear-gradient(0deg, rgba(0,0,0,${scanlinesStrength * 0.6}) 0px, rgba(0,0,0,${scanlinesStrength * 0.6}) 1px, transparent 1px, transparent ${lineHeight}px)`,
                        pointerEvents: "none",
                    }}
                />
            )}
            {/* Film noise - fixed to not increase brightness */}
            {noiseStrength > 0 && (
                <>
                    <style>{`@keyframes sea-noise{0%{background-position:0 0}20%{background-position:-20% -20%}40%{background-position:40% 10%}60%{background-position:-10% 30%}80%{background-position:20% -10%}100%{background-position:0 0}}`}</style>
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            opacity: noiseStrength * 0.25,
                            mixBlendMode: "overlay",
                            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                            backgroundSize: `${200 * noiseScale}px ${200 * noiseScale}px`,
                            animation: `sea-noise ${noiseAnimDuration} steps(4) infinite`,
                            willChange: "transform",
                        }}
                    />
                </>
            )}
            {/* Vignette effect - fixed visibility at high size */}
            {vignetteStrength > 0 && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        background: `radial-gradient(ellipse at center, transparent ${Math.max(0, 50 - vignetteSize * 50)}%, rgba(0,0,0,${Math.min(0.95, vignetteStrength * 0.95)}) 100%)`,
                        pointerEvents: "none",
                    }}
                />
            )}
            {/* Static Glow effect - brightens bright spots, no animation */}
            {glowStrength > 0 && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        background: `radial-gradient(ellipse at center, rgba(255,255,255,${glowStrength * 0.60}) 0%, transparent ${60 + glowScale * 30}%)`,
                        mixBlendMode: "screen",
                        pointerEvents: "none",
                    }}
                />
            )}
            {/* Hologram effect - ghost hologram: cool tint with edge glow on bright spots */}
            {hologramStrength > 0 && (
                <>
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            background: `linear-gradient(180deg, rgba(100,200,255,${hologramStrength * 0.15}) 0%, rgba(50,150,200,${hologramStrength * 0.10}) 50%, transparent 100%)`,
                            mixBlendMode: "overlay",
                            pointerEvents: "none",
                        }}
                    />
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            background: `radial-gradient(ellipse at center, rgba(200,240,255,${hologramStrength * 0.25}) 0%, transparent 60%)`,
                            mixBlendMode: "screen",
                            pointerEvents: "none",
                        }}
                    />
                </>
            )}
        </div>
    )
}

