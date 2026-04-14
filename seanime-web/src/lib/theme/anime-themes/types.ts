import type React from "react"

export type AnimeThemeId = "seanime" | "naruto" | "bleach" | "one-piece"

export type SidebarItemOverride = {
    icon: React.ComponentType<{ className?: string }>
    label: string
}

export type ParticleTypeConfig = {
    /** Display name in settings UI */
    label: string
    /** Max particle count at 100% */
    maxCount: number
    /** Default enabled state */
    defaultEnabled: boolean
    /** Default sub-intensity 0-100 (controls count, speed, opacity for this type) */
    defaultIntensity: number
}

export type AnimeThemeConfig = {
    id: AnimeThemeId
    displayName: string
    description: string
    /** CSS custom property overrides injected onto :root */
    cssVars: Record<string, string>
    /** Google Font family name to load (injected as <link>) */
    fontFamily?: string
    /** Google Fonts href */
    fontHref?: string
    /** Sidebar item overrides: nav item id → { icon, label } */
    sidebarOverrides: Record<string, SidebarItemOverride>
    /** Achievement key → themed display name */
    achievementNames: Record<string, string>
    /** URL to hosted or local background music (CC-licensed or user-supplied) */
    musicUrl: string
    /** Preview color for theme selector card */
    previewColors: {
        primary: string
        secondary: string
        accent: string
        bg: string
    }
    /** Whether this theme has animated background elements */
    hasAnimatedElements?: boolean
    /** Full-resolution background image URL (loaded from CDN, cached by browser) */
    backgroundImageUrl?: string
    /** Background dim (0-1), default 0 means use default opacity */
    backgroundDim?: number
    /** Background blur in px, default 0 */
    backgroundBlur?: number
    /** Per-particle-type configuration (keyed by particle type id) */
    particleTypes?: Record<string, ParticleTypeConfig>
}
