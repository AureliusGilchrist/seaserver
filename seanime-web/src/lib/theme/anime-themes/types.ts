import type React from "react"

export type AnimeThemeId = "seanime" | "naruto" | "bleach" | "one-piece"

export type SidebarItemOverride = {
    icon: React.ComponentType<{ className?: string }>
    label: string
}

export type AnimeThemeEventConfig = {
    name: string
    /** Duration in ms */
    durationMs: number
    /** Voice text spoken by Web Speech API */
    voiceText: string
    voicePitch: number
    voiceRate: number
    /** Path to local audio clip, played if available */
    audioClipPath: string
    /** When true, activates the Gear 5 body-bounce effect */
    isGear5?: boolean
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
    /** Event config */
    event: AnimeThemeEventConfig
    /** Preview color for theme selector card */
    previewColors: {
        primary: string
        secondary: string
        accent: string
        bg: string
    }
    /** Whether this theme has animated background elements */
    hasAnimatedElements?: boolean
}
