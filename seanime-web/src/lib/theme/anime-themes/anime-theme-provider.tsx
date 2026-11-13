"use client"
import { isMobile } from "@/lib/utils/browser-detection"
import { __isMobileShell__ } from "@/types/constants"
import { buildSeaQuery } from "@/api/client/requests"
import { resolveServerAsset } from "@/lib/server/assets"
import { resolveLandingImage, useWallpaperOverride } from "@/lib/theme/landing-look"
import React from "react"
import { atom, useAtomValue, useSetAtom } from "jotai"

// Signals that a page wants to show wallpaper at near-full opacity (e.g. theme manager)
export const wallpaperPreviewModeAtom = atom(false)
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { ANIME_THEMES, ANIME_THEME_LIST } from "@/lib/theme/anime-themes"
import type { AnimeThemeId, AnimeThemeConfig, ParticleTypeConfig, SidebarItemOverride, PlayerIconOverrides } from "@/lib/theme/anime-themes"
import { ThemeAnimatedOverlay } from "@/lib/theme/anime-themes/animated-elements"
import { vc_isFullscreen } from "@/app/(main)/_features/video-core/video-core-atoms"
import { buildThemeCursorCSS } from "@/lib/theme/anime-themes/cursor-svgs"
import { resolveIcon } from "@/lib/theme/anime-themes/icon-registry"
import { resolvePlayerIconSet } from "@/lib/theme/anime-themes/player-icon-styles"
import { recordActivatedTheme } from "@/lib/theme/anime-themes/theme-prerequisites"
import { fetchMarketplaceThemeMeta, getCachedMarketplaceThemeMeta } from "@/lib/theme/marketplace-theme-loader"
import { applyRootCssVars } from "@/lib/helpers/css"
import { animeThemeBaseColorAtom, animeThemeBrandOverrideAtom, animeThemePrimaryColorAtom, SETTINGS_OWNED_COLOR_VARS, wallpaperAccentColorAtom } from "@/lib/theme/color-mixing"
import { extractWallpaperAccent } from "@/lib/theme/wallpaper-accent"
import { useThemeSettings } from "@/lib/theme/hooks"
import { seaStorage } from "@/lib/sea-storage/sea-storage"
import { getAssetUrl } from "@/lib/server/assets"
import { getServerBaseUrl } from "@/api/client/server-url"
import { usePathname } from "@/lib/navigation"

/**
 * Where a wallpaper effect is stored. Denshi Mobile keeps one set per profile, across themes, so its
 * wallpaper looks the same wherever it shows; everything else keeps one per theme. The keys never
 * overlap, so neither side can change the other's.
 */
function effectStorageKey(name: string, profileKey: string, themeId: AnimeThemeId) {
    return __isMobileShell__ ? `sea-anime-mobile-${name}-${profileKey}` : `sea-anime-${name}-${profileKey}-${themeId}`
}

function readBackgroundBlur(profileKey: string, themeId: AnimeThemeId): number {
    if (__isMobileShell__) {
        const value = parseFloat(seaStorage.getItem(effectStorageKey("bgblur", profileKey, themeId)) ?? "")
        return isNaN(value) ? 0 : Math.max(0, Math.min(100, value))
    }

    const globalKey = "sea-global-anime-bgblur"
    const globalValue = seaStorage.getItem(globalKey)
    if (globalValue !== null) {
        const value = parseFloat(globalValue)
        if (!isNaN(value)) return Math.max(0, Math.min(100, value))
    }

    const legacyGlobalKeys = [`sea-global-anime-bgblur-${themeId}`]
    const legacyProfileKeys = [
        `sea-anime-bgblur-default-${themeId}`,
        `sea-anime-bgblur-${profileKey}-${themeId}`,
    ]
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (!key) continue
            if (key.startsWith("sea-global-anime-bgblur-") && !legacyGlobalKeys.includes(key)) {
                legacyGlobalKeys.push(key)
            } else if (key.startsWith("sea-anime-bgblur-") && !legacyProfileKeys.includes(key)) {
                legacyProfileKeys.push(key)
            }
        }
    } catch {}

    for (const key of [...legacyGlobalKeys, ...legacyProfileKeys]) {
        const legacyValue = seaStorage.getItem(key)
        if (legacyValue === null) continue
        const value = parseFloat(legacyValue)
        if (!isNaN(value)) {
            const clamped = Math.max(0, Math.min(100, value))
            seaStorage.setItem(globalKey, String(clamped))
            return clamped
        }
    }

    return 0
}

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

/** `#rrggbb` as the space-separated triplet every `--color-brand-*` variable is written in. */
export function hexToTriplet(hex: string): string {
    const h = hex.replace("#", "")
    const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h
    const r = parseInt(full.slice(0, 2), 16) || 0
    const g = parseInt(full.slice(2, 4), 16) || 0
    const b = parseInt(full.slice(4, 6), 16) || 0
    return `${r} ${g} ${b}`
}

/**
 * The brand ramp, derived from one color: the color itself is the 500, lighter steps are mixed
 * toward white and darker ones toward black.
 *
 * Written as space-separated RGB triplets because that is what the ramp is consumed as —
 * `rgb(var(--color-brand-500) / <alpha-value>)` in the Tailwind config. Hex values used to be
 * written here, which `rgb()` cannot read, so a brand override never actually took.
 */
export function deriveBrandShades(hex: string): Record<string, string> {
    try {
        if (!/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(hex)) return {}
        const [h, s] = hexToHSL(hex.length === 4
            ? `#${hex.slice(1).split("").map(c => c + c).join("")}`
            : hex)
        const ramp: Record<string, number> = {
            "200": 88, "300": 75, "400": 65, "500": 52, "600": 45, "700": 35, "800": 27, "900": 20, "950": 12,
        }
        const shades: Record<string, string> = {}
        for (const [step, lightness] of Object.entries(ramp)) {
            const shade = step === "500" ? hex : hslToHex(h, s, lightness)
            shades[`--color-brand-${step}`] = hexToTriplet(shade)
        }
        // `--brand` is the flat alias the app reads in a few places; it tracks the 500.
        shades["--brand"] = shades["--color-brand-500"]!
        return shades
    } catch { return {} }
}

type AnimeThemeContextValue = {
    themeId: AnimeThemeId
    config: AnimeThemeConfig
    setThemeId: (id: AnimeThemeId) => void
    animatedIntensity: number
    setAnimatedIntensity: (v: number) => void
    particleSettings: ParticleSettings
    setParticleTypeEnabled: (typeId: string, enabled: boolean) => void
    setParticleTypeIntensity: (typeId: string, intensity: number) => void
    backgroundDim: number
    backgroundDimDefault: number
    setBackgroundDim: (v: number) => void
    resetBackgroundDim: () => void
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
    const sidebarOverrides: Record<string, SidebarItemOverride> = {}
    for (const [id, slug] of Object.entries(meta.sidebarIcons ?? {})) {
        const icon = resolveIcon(slug)
        if (icon) sidebarOverrides[id] = { icon }
    }
    for (const [id, ov] of Object.entries(meta.sidebarOverrides ?? {})) {
        sidebarOverrides[id] = { icon: resolveIcon(ov.icon) ?? sidebarOverrides[id]?.icon, label: ov.label }
    }

    const playerIconOverrides: PlayerIconOverrides = { ...resolvePlayerIconSet(meta.playerIconSet) }
    for (const [key, slug] of Object.entries(meta.playerIconOverrides ?? {})) {
        const icon = resolveIcon(slug)
        if (icon) (playerIconOverrides as Record<string, import("@/lib/theme/anime-themes/types").ThemeIconComponent>)[key] = icon
    }

    return {
        id: meta.id as AnimeThemeId,
        displayName: meta.displayName,
        description: meta.description ?? "",
        cssVars: meta.cssVars ?? {},
        fontFamily: meta.fontFamily,
        fontHref: meta.fontHref,
        sidebarOverrides,
        achievementNames: meta.achievementNames ?? {},
        // Without these a marketplace theme never had a wallpaper (on any platform).
        backgroundImageUrl: meta.backgroundImageUrl,
        mobileBackgroundImageUrl: meta.mobileBackgroundImageUrl,
        previewColors: meta.previewColors ?? { primary: "#333", secondary: "#444", accent: "#555", bg: "#0a0a0a" },
        milestoneNames: meta.milestoneNames,
        milestoneCategoryNames: meta.milestoneCategoryNames,
        playerIconOverrides,
        splashMessages: meta.splashMessages,
        easterEggs: meta.easterEggs,
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

export function AnimeThemeProvider({ children, ambient = true }: {
    children: React.ReactNode
    /**
     * The wallpaper, its animated effects and the theme music. Off for a window that only plays
     * video (the Denshi popout): it keeps the theme's colors, but nothing is drawn around the
     * picture every frame and no second music player runs alongside the main window's.
     */
    ambient?: boolean
}) {
    const currentProfile = useAtomValue(currentProfileAtom)
    const pathname = usePathname()
    const profileKey = currentProfile?.id ? String(currentProfile.id) : "default"
    const profileId = currentProfile?.id ?? 0

    const themeSettings = useThemeSettings()
    const colorSettingsEnabled = !!themeSettings?.enableColorSettings
    const setAnimeThemeBaseColor = useSetAtom(animeThemeBaseColorAtom)
    const setAnimeThemeBrandOverride = useSetAtom(animeThemeBrandOverrideAtom)
    const setAnimeThemePrimaryColor = useSetAtom(animeThemePrimaryColorAtom)
    const setWallpaperAccent = useSetAtom(wallpaperAccentColorAtom)
    const wallpaperAccent = useAtomValue(wallpaperAccentColorAtom)

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
            buildSeaQuery({
                endpoint: `/api/v1/profiles/${profileId}`,
                method: "PATCH",
                data: { themeId: id },
            }).catch(() => { /* best-effort */ })
        }
    }, [profileKey, profileId])

    const config: AnimeThemeConfig = ANIME_THEMES[themeId as AnimeThemeId] ?? marketplaceConfig ?? ANIME_THEMES["seanime"]
    const effectKey = (name: string) => effectStorageKey(name, profileKey, themeId)

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
    //
    // Undimmed until the user dims it. A wallpaper is only ever darkened by the Dim setting: no theme
    // default, no phone minimum, on every page and client.
    const wallpaperOverride = useWallpaperOverride()
    const backgroundDimDefault = 0
    const [backgroundDim, setBackgroundDimRaw] = React.useState<number>(() => {
        if (typeof window === "undefined") return backgroundDimDefault
        try {
            const stored = seaStorage.getItem(effectKey("bgdim"))
            if (stored !== null) {
                const v = parseFloat(stored)
                if (!isNaN(v)) return Math.max(0, Math.min(1, v))
            }
        } catch { }
        return backgroundDimDefault
    })

    const [backgroundBlur, setBackgroundBlurRaw] = React.useState<number>(() => {
        if (typeof window === "undefined") return 0
        try { return readBackgroundBlur(profileKey, themeId) } catch { return 0 }
    })

    // ── Background exposure / saturation (per-theme, user-overridable) ──
    const [backgroundExposure, setBackgroundExposureRaw] = React.useState<number>(() => {
        if (typeof window === "undefined") return 1.0
        try {
            const stored = seaStorage.getItem(effectKey("bgexposure"))
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
            const stored = seaStorage.getItem(effectKey("bgsat"))
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
            const stored = seaStorage.getItem(effectKey("bgcontrast"))
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
            const s = seaStorage.getItem(effectKey("bgdim"))
            setBackgroundDimRaw(s !== null && !isNaN(parseFloat(s)) ? Math.max(0, Math.min(1, parseFloat(s))) : backgroundDimDefault)
        } catch { setBackgroundDimRaw(backgroundDimDefault) }
        try { setBackgroundBlurRaw(readBackgroundBlur(profileKey, themeId)) } catch { setBackgroundBlurRaw(0) }
        try {
            const s = seaStorage.getItem(effectKey("bgexposure"))
            setBackgroundExposureRaw(s !== null && !isNaN(parseFloat(s)) ? Math.max(0.1, Math.min(2.5, parseFloat(s))) : 1.0)
        } catch { setBackgroundExposureRaw(1.0) }
        try {
            const s = seaStorage.getItem(effectKey("bgsat"))
            setBackgroundSaturationRaw(s !== null && !isNaN(parseFloat(s)) ? Math.max(0, Math.min(3.0, parseFloat(s))) : 1.0)
        } catch { setBackgroundSaturationRaw(1.0) }
        try {
            const s = seaStorage.getItem(effectKey("bgcontrast"))
            setBackgroundContrastRaw(s !== null && !isNaN(parseFloat(s)) ? Math.max(0, Math.min(3.0, parseFloat(s))) : 1.0)
        } catch { setBackgroundContrastRaw(1.0) }
        try {
            setBrandColorOverrideRaw(seaStorage.getItem(`sea-anime-color-${profileKey}-${themeId}`) ?? null)
        } catch { setBrandColorOverrideRaw(null) }
    }, [themeId, profileKey, backgroundDimDefault])

    React.useEffect(() => {
        const reloadBackgroundBlur = () => {
            try { setBackgroundBlurRaw(readBackgroundBlur(profileKey, themeId)) } catch { setBackgroundBlurRaw(0) }
        }
        window.addEventListener("sea-client-prefs-hydrated", reloadBackgroundBlur)
        return () => window.removeEventListener("sea-client-prefs-hydrated", reloadBackgroundBlur)
    }, [profileKey, themeId])

    const setBackgroundDim = React.useCallback((v: number) => {
        const clamped = Math.max(0, Math.min(1, v))
        setBackgroundDimRaw(clamped)
        try { seaStorage.setItem(effectKey("bgdim"), String(clamped)) } catch { }
    }, [profileKey, themeId])

    // Forgets the dim rather than saving today's default, which depends on the wallpaper showing.
    const resetBackgroundDim = React.useCallback(() => {
        setBackgroundDimRaw(backgroundDimDefault)
        try { seaStorage.removeItem(effectKey("bgdim")) } catch { }
    }, [profileKey, themeId, backgroundDimDefault])

    const setBackgroundBlur = React.useCallback((v: number) => {
        const clamped = Math.max(0, Math.min(100, v))
        setBackgroundBlurRaw(clamped)
        try { seaStorage.setItem(__isMobileShell__ ? effectStorageKey("bgblur", profileKey, themeId) : "sea-global-anime-bgblur", String(clamped)) } catch { }
    }, [profileKey, themeId])

    const setBackgroundExposure = React.useCallback((v: number) => {
        const clamped = Math.max(0.1, Math.min(2.5, v))
        setBackgroundExposureRaw(clamped)
        try { seaStorage.setItem(effectKey("bgexposure"), String(clamped)) } catch { }
    }, [profileKey, themeId])

    const setBackgroundSaturation = React.useCallback((v: number) => {
        const clamped = Math.max(0, Math.min(3.0, v))
        setBackgroundSaturationRaw(clamped)
        try { seaStorage.setItem(effectKey("bgsat"), String(clamped)) } catch { }
    }, [profileKey, themeId])

    const setBackgroundContrast = React.useCallback((v: number) => {
        const clamped = Math.max(0, Math.min(3.0, v))
        setBackgroundContrastRaw(clamped)
        try { seaStorage.setItem(effectKey("bgcontrast"), String(clamped)) } catch { }
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
    //
    // Phones keep a wallpaper of their own: a landscape desktop wallpaper is mostly cropped away on
    // a portrait screen. Same behaviour as desktop otherwise — pick it in the Theme Manager on the
    // phone, and the accent comes from it. A theme may ship a portrait default
    // (mobileBackgroundImageUrl); without one the desktop image is used, center-cropped.
    const isPhone = React.useMemo(() => __isMobileShell__ || (typeof window !== "undefined" && isMobile()), [])
    const bgStorageKey = `${isPhone ? "sea-anime-bgurl-mobile" : "sea-anime-bgurl"}-${profileKey}-${themeId}`
    const themeDefaultBackground = (isPhone ? config.mobileBackgroundImageUrl : undefined) ?? config.backgroundImageUrl ?? null

    const [activeBackgroundUrl, setActiveBackgroundUrlRaw] = React.useState<string | null>(() => {
        if (typeof window === "undefined") return themeDefaultBackground
        if (themeId === "seanime") return null
        try {
            const stored = seaStorage.getItem(bgStorageKey)
            if (stored !== null) return stored
        } catch { }
        return themeDefaultBackground
    })

    // Reload active background when theme or profile changes
    React.useEffect(() => {
        if (themeId === "seanime") {
            setActiveBackgroundUrlRaw(null)
            return
        }
        try {
            const stored = seaStorage.getItem(bgStorageKey)
            setActiveBackgroundUrlRaw(stored !== null ? stored : themeDefaultBackground)
        } catch {
            setActiveBackgroundUrlRaw(themeDefaultBackground)
        }
    }, [themeId, profileKey, bgStorageKey, themeDefaultBackground])

    const setActiveBackgroundUrl = React.useCallback((url: string | null) => {

        if (themeId === "seanime") return
        setActiveBackgroundUrlRaw(url)
        try {
            if (url === null || url === themeDefaultBackground) {
                seaStorage.removeItem(bgStorageKey)
            } else {
                seaStorage.setItem(bgStorageKey, url)
            }
        } catch { }
    }, [themeId, bgStorageKey, themeDefaultBackground])

    // ── CSS var injection ──
    // When the user's color scheme (Settings > Color scheme) is enabled, it owns the UI
    // surface and brand colors — `CustomThemeProvider` writes those, mixing this theme's
    // background in as a tint. The theme still owns everything else: wallpaper, effects,
    // fonts, cursors, icons and the lighter gray text ramp.
    React.useEffect(() => {
        const root = document.documentElement
        const vars = config.cssVars
        const entries = Object.entries(vars).filter(([k]) => !(colorSettingsEnabled && SETTINGS_OWNED_COLOR_VARS.has(k)))
        entries.forEach(([k, v]) => root.style.setProperty(k, v as string))
        // Apply brand color override (derived shades) after base vars.
        // With color settings on, `CustomThemeProvider` applies it last instead.
        if (brandColorOverride && !colorSettingsEnabled) {
            const shades = deriveBrandShades(brandColorOverride)
            Object.entries(shades).forEach(([k, v]) => root.style.setProperty(k, v))
        }
        // The wallpaper has the last word, and deliberately so: the primary color is the general
        // highlight of the picture behind the UI, not a color a theme or a reward declares. A theme
        // still contributes its wallpaper, its effects, its fonts — and the interface's color comes
        // out of that wallpaper, changing with it.
        if (wallpaperAccent) {
            const shades = deriveBrandShades(wallpaperAccent)
            Object.entries(shades).forEach(([k, v]) => root.style.setProperty(k, v))
        }

        return () => {
            // On cleanup, clear only the vars this theme set (next theme will overwrite)
            entries.forEach(([k]) => root.style.removeProperty(k))
        }
    }, [config, brandColorOverride, colorSettingsEnabled, wallpaperAccent])

    // ── Publish the theme's own colors so the settings color scheme can mix them in ──
    React.useEffect(() => {
        setAnimeThemeBaseColor(config.id === "seanime" ? null : ((config.cssVars["--background"] as string) ?? null))
        return () => setAnimeThemeBaseColor(null)
    }, [config, setAnimeThemeBaseColor])

    React.useEffect(() => {
        setAnimeThemeBrandOverride(brandColorOverride)
        return () => setAnimeThemeBrandOverride(null)
    }, [brandColorOverride, setAnimeThemeBrandOverride])

    // ── Publish the theme's own primary color for theme-aware consumers ──
    React.useEffect(() => {
        setAnimeThemePrimaryColor(config.id === "seanime" ? null : (config.previewColors?.primary ?? null))
        return () => setAnimeThemePrimaryColor(null)
    }, [config, setAnimeThemePrimaryColor])

    // ── The wallpaper's color ──
    //
    // Read the wallpaper currently shown by the app: a Settings background takes priority, then a
    // Theme Manager wallpaper, then the active profile wallpaper. Profile pages keep their own
    // scoped colors and are deliberately excluded from the latter two fallback sources.
    const isProfilePage = pathname.startsWith("/profile")
    const wallpaperOverrideImage = wallpaperOverride?.image ?? ""
    React.useEffect(() => {
        const profileWallpaperUrl = currentProfile?.wallpaperUrl
            ? currentProfile.wallpaperUrl.startsWith("/")
                ? `${getServerBaseUrl()}${currentProfile.wallpaperUrl}`
                : currentProfile.wallpaperUrl
            : null
        const url = wallpaperOverrideImage
            ? resolveLandingImage(wallpaperOverrideImage)
            : !isProfilePage && themeSettings.libraryScreenCustomBackgroundImage
            ? getAssetUrl(themeSettings.libraryScreenCustomBackgroundImage)
            : config.id !== "seanime" && activeBackgroundUrl
                ? activeBackgroundUrl
                : !isProfilePage
                    ? profileWallpaperUrl
                    : null

        if (!url) {
            setWallpaperAccent(null)
            return
        }

        // Keep the last wallpaper-derived accent while the new image is sampled. Clearing it here
        // exposes the theme's accent (often red) on every navigation and when image sampling fails.
        let cancelled = false
        extractWallpaperAccent(resolveServerAsset(url)).then(accent => {
            if (cancelled || !accent) return
            setWallpaperAccent(accent)
        })

        return () => { cancelled = true }
    }, [
        config.id,
        activeBackgroundUrl,
        currentProfile?.wallpaperUrl,
        isProfilePage,
        wallpaperOverrideImage,
        themeSettings.libraryScreenCustomBackgroundImage,
        setWallpaperAccent,
    ])

    // ── Background image: hide default body:before AND body:after when a custom bg is active ──
    React.useEffect(() => {
        const root = document.documentElement
        if (wallpaperOverrideImage || (config.id !== "seanime" && activeBackgroundUrl)) {
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
    }, [config.id, activeBackgroundUrl, wallpaperOverrideImage])

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
        try { const v = parseFloat(seaStorage.getItem(effectKey("vignette")) ?? ""); return isNaN(v) ? 0 : Math.max(0, Math.min(1, v)) } catch { return 0 }
    })
    const [vignetteSize, setVignetteSizeRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(effectKey("vsize")) ?? ""); return isNaN(v) ? 0.5 : Math.max(0, Math.min(1, v)) } catch { return 0.5 }
    })
    const [glowStrength, setGlowStrengthRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(effectKey("glow")) ?? ""); return isNaN(v) ? 0 : Math.max(0, Math.min(1, v)) } catch { return 0 }
    })
    const [glowSpeed, setGlowSpeedRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(effectKey("gspeed")) ?? ""); return isNaN(v) ? 2 : Math.max(0.2, Math.min(5, v)) } catch { return 2 }
    })
    const [glowScale, setGlowScaleRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(effectKey("gscale")) ?? ""); return isNaN(v) ? 0.5 : Math.max(0, Math.min(1, v)) } catch { return 0.5 }
    })
    const setVignetteStrength = React.useCallback((v: number) => { const c = Math.max(0, Math.min(1, v)); setVignetteStrengthRaw(c); try { seaStorage.setItem(effectKey("vignette"), String(c)) } catch { } }, [profileKey, themeId])
    const setVignetteSize = React.useCallback((v: number) => { const c = Math.max(0, Math.min(1, v)); setVignetteSizeRaw(c); try { seaStorage.setItem(effectKey("vsize"), String(c)) } catch { } }, [profileKey, themeId])
    const setGlowStrength = React.useCallback((v: number) => { const c = Math.max(0, Math.min(1, v)); setGlowStrengthRaw(c); try { seaStorage.setItem(effectKey("glow"), String(c)) } catch { } }, [profileKey, themeId])
    const setGlowSpeed = React.useCallback((v: number) => { const c = Math.max(0.2, Math.min(5, v)); setGlowSpeedRaw(c); try { seaStorage.setItem(effectKey("gspeed"), String(c)) } catch { } }, [profileKey, themeId])
    const setGlowScale = React.useCallback((v: number) => { const c = Math.max(0, Math.min(1, v)); setGlowScaleRaw(c); try { seaStorage.setItem(effectKey("gscale"), String(c)) } catch { } }, [profileKey, themeId])

    // ── Hologram effect ──
    const [hologramStrength, setHologramStrengthRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(effectKey("hologram")) ?? ""); return isNaN(v) ? 0 : Math.max(0, Math.min(1, v)) } catch { return 0 }
    })
    const setHologramStrength = React.useCallback((v: number) => { const c = Math.max(0, Math.min(1, v)); setHologramStrengthRaw(c); try { seaStorage.setItem(effectKey("hologram"), String(c)) } catch { } }, [profileKey, themeId])

    // ── Scanlines ──
    const [scanlinesStrength, setScanlinesStrengthRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(effectKey("scan")) ?? ""); return isNaN(v) ? 0 : Math.max(0, Math.min(1, v)) } catch { return 0 }
    })
    const [scanlinesSize, setScanlinesSizeRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(effectKey("scansize")) ?? ""); return isNaN(v) ? 0.5 : Math.max(0, Math.min(1, v)) } catch { return 0.5 }
    })
    const [scanlinesSpeed, setScanlinesSpeedRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(effectKey("scanspeed")) ?? ""); return isNaN(v) ? 1 : Math.max(0.1, Math.min(5, v)) } catch { return 1 }
    })
    const setScanlinesStrength = React.useCallback((v: number) => { const c = Math.max(0, Math.min(1, v)); setScanlinesStrengthRaw(c); try { seaStorage.setItem(effectKey("scan"), String(c)) } catch { } }, [profileKey, themeId])
    const setScanlinesSize = React.useCallback((v: number) => { const c = Math.max(0, Math.min(1, v)); setScanlinesSizeRaw(c); try { seaStorage.setItem(effectKey("scansize"), String(c)) } catch { } }, [profileKey, themeId])
    const setScanlinesSpeed = React.useCallback((v: number) => { const c = Math.max(0.1, Math.min(5, v)); setScanlinesSpeedRaw(c); try { seaStorage.setItem(effectKey("scanspeed"), String(c)) } catch { } }, [profileKey, themeId])

    // ── Noise ──
    const [noiseStrength, setNoiseStrengthRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(effectKey("noise")) ?? ""); return isNaN(v) ? 0 : Math.max(0, Math.min(1, v)) } catch { return 0 }
    })
    const [noiseSpeed, setNoiseSpeedRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(effectKey("nspeed")) ?? ""); return isNaN(v) ? 1 : Math.max(0.1, Math.min(5, v)) } catch { return 1 }
    })
    const [noiseScale, setNoiseScaleRaw] = React.useState<number>(() => {
        try { const v = parseFloat(seaStorage.getItem(effectKey("nscale")) ?? ""); return isNaN(v) ? 1 : Math.max(0.5, Math.min(3, v)) } catch { return 1 }
    })
    const setNoiseStrength = React.useCallback((v: number) => { const c = Math.max(0, Math.min(1, v)); setNoiseStrengthRaw(c); try { seaStorage.setItem(effectKey("noise"), String(c)) } catch { } }, [profileKey, themeId])
    const setNoiseSpeed = React.useCallback((v: number) => { const c = Math.max(0.1, Math.min(5, v)); setNoiseSpeedRaw(c); try { seaStorage.setItem(effectKey("nspeed"), String(c)) } catch { } }, [profileKey, themeId])
    const setNoiseScale = React.useCallback((v: number) => { const c = Math.max(0.5, Math.min(3, v)); setNoiseScaleRaw(c); try { seaStorage.setItem(effectKey("nscale"), String(c)) } catch { } }, [profileKey, themeId])

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
        animatedIntensity,
        setAnimatedIntensity,
        particleSettings,
        setParticleTypeEnabled,
        setParticleTypeIntensity,
        backgroundDim,
        backgroundDimDefault,
        setBackgroundDim,
        resetBackgroundDim,
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
    }), [themeId, config, setThemeId, animatedIntensity, setAnimatedIntensity, particleSettings, setParticleTypeEnabled, setParticleTypeIntensity, backgroundDim, backgroundDimDefault, setBackgroundDim, resetBackgroundDim, backgroundBlur, setBackgroundBlur, backgroundExposure, setBackgroundExposure, backgroundSaturation, setBackgroundSaturation, backgroundContrast, setBackgroundContrast, activeBackgroundUrl, setActiveBackgroundUrl, brandColorOverride, setBrandColorOverride, vignetteStrength, setVignetteStrength, vignetteSize, setVignetteSize, glowStrength, setGlowStrength, glowSpeed, setGlowSpeed, glowScale, setGlowScale, customThemeData, setCustomThemeData, scanlinesStrength, setScanlinesStrength, scanlinesSize, setScanlinesSize, scanlinesSpeed, setScanlinesSpeed, noiseStrength, setNoiseStrength, noiseSpeed, setNoiseSpeed, noiseScale, setNoiseScale, hologramStrength, setHologramStrength])

    // Behind a fullscreen video the wallpaper and its animated overlays are never seen, but they
    // are still composited every frame (blend modes, filters, animated noise) and that load builds
    // up over a long session. Unmounted while fullscreen instead.
    const videoFullscreen = useAtomValue(vc_isFullscreen)
    const [browserFullscreen, setBrowserFullscreen] = React.useState(false)
    React.useEffect(() => {
        const onChange = () => setBrowserFullscreen(!!document.fullscreenElement)
        document.addEventListener("fullscreenchange", onChange)
        return () => document.removeEventListener("fullscreenchange", onChange)
    }, [])
    const hideBackdrop = !ambient || videoFullscreen || browserFullscreen

    return (
        <AnimeThemeContext.Provider value={value}>
            {children}
            {!hideBackdrop && !wallpaperOverride && config.id !== "seanime" && activeBackgroundUrl && <ThemeBackgroundImage url={activeBackgroundUrl} dim={backgroundDim} dimMode={__isMobileShell__ ? "darken" : "fade"} blur={backgroundBlur} exposure={backgroundExposure} saturation={backgroundSaturation} contrast={backgroundContrast} scanlinesStrength={scanlinesStrength} scanlinesSize={scanlinesSize} noiseStrength={noiseStrength} noiseSpeed={noiseSpeed} vignetteStrength={vignetteStrength} vignetteSize={vignetteSize} glowStrength={glowStrength} glowSpeed={glowSpeed} glowScale={glowScale} hologramStrength={hologramStrength} />}
            {!hideBackdrop && config.id !== "seanime" && <ThemeAnimatedOverlay themeId={themeId} intensity={animatedIntensity} particleSettings={particleSettings} particleColor={config.particleColor} />}
        </AnimeThemeContext.Provider>
    )
}

// Theme Background Image
// ─────────────────────────────────────────────────────────────────

export function ThemeBackgroundImage({ url, dim, dimMode = "fade", blur, exposure, saturation, contrast, scanlinesStrength = 0, scanlinesSize = 0.5, noiseStrength = 0, noiseSpeed = 1, noiseScale = 1, vignetteStrength = 0, vignetteSize = 0.5, glowStrength = 0, glowSpeed = 2, glowScale = 0.5, hologramStrength = 0, effectsOnly = false }: { url: string; effectsOnly?: boolean; dim?: number; /** "fade" lowers the image's opacity over a dark underlay; "darken" keeps it opaque and lowers its brightness. */ dimMode?: "fade" | "darken"; blur?: number; exposure?: number; saturation?: number; contrast?: number; scanlinesStrength?: number; scanlinesSize?: number; noiseStrength?: number; noiseSpeed?: number; noiseScale?: number; vignetteStrength?: number; vignetteSize?: number; glowStrength?: number; glowSpeed?: number; glowScale?: number; hologramStrength?: number }) {
    const previewMode = useAtomValue(wallpaperPreviewModeAtom)
    // The Dim slider is the only thing that dims the wallpaper: 0 means fully vivid, on every page,
    // the theme preview included.
    const darken = dimMode === "darken"
    const effectiveDim = Math.min(Math.max(dim ?? 0, 0), 0.95)
    // Darken: the picture stays solid and only gets darker, so its colours don't wash into the page.
    const opacity = darken ? 1 : 1 - effectiveDim
    const brightness = (exposure ?? 1) * (darken ? 1 - effectiveDim : 1)
    const filterParts: string[] = []
    if (blur) filterParts.push(`blur(${blur}px)`)
    if (brightness !== 1) filterParts.push(`brightness(${brightness.toFixed(3)})`)
    if (saturation != null && saturation !== 1) filterParts.push(`saturate(${saturation})`)
    if (contrast != null && contrast !== 1) filterParts.push(`contrast(${contrast})`)
    const lineHeight = Math.round(2 + scanlinesSize * 6)
    const noiseAnimDuration = `${(1 / noiseSpeed).toFixed(2)}s`
    return (
        <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: effectsOnly ? 0 : -1, pointerEvents: "none", overflow: "hidden" }}>
            {/* Dark underlay so the semi-transparent wallpaper reads darker */}
            {!previewMode && !effectsOnly && <div style={{ position: "absolute", inset: 0, background: darken ? "#000" : "rgba(0,0,0,0.75)" }} />}
            {/* Wallpaper image */}
            {!effectsOnly && <div
                style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: `url("${resolveServerAsset(url)}")`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    opacity,
                    filter: filterParts.length > 0 ? filterParts.join(" ") : undefined,
                    // Edge shading follows the Dim slider (full strength at dim 0.5+, none at 0) so an
                    // undimmed wallpaper has no darkening the user didn't ask for.
                    boxShadow: effectiveDim > 0
                        ? `inset 0 0 120px 40px rgba(0,0,0,${(0.5 * Math.min(effectiveDim / 0.5, 1)).toFixed(3)}), inset 0 0 40px 20px rgba(0,0,0,${(0.3 * Math.min(effectiveDim / 0.5, 1)).toFixed(3)})`
                        : undefined,
                }}
            />}
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
                    {/* Moved with transform on an oversized layer: runs on the compositor, where shifting the
                        background-position repainted the whole screen on every step. */}
                    <style>{`@keyframes sea-noise{0%{transform:translate3d(0,0,0)}20%{transform:translate3d(-8%,-8%,0)}40%{transform:translate3d(8%,4%,0)}60%{transform:translate3d(-4%,8%,0)}80%{transform:translate3d(6%,-4%,0)}100%{transform:translate3d(0,0,0)}}`}</style>
                    <div
                        style={{
                            position: "absolute",
                            inset: "-15%",
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
