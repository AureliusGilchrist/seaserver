import type React from "react"

export type AnimeThemeId =
    | "seanime"
    | "naruto"
    | "bleach"
    | "one-piece"
    // ── Shonen / Action ──
    | "dragon-ball-z"
    | "attack-on-titan"
    | "my-hero-academia"
    | "demon-slayer"
    | "jujutsu-kaisen"
    | "fullmetal-alchemist"
    | "hunter-x-hunter"
    | "black-clover"
    | "fairy-tail"
    | "sword-art-online"
    | "death-note"
    | "code-geass"
    | "tokyo-ghoul"
    | "mob-psycho-100"
    | "one-punch-man"
    // ── Isekai / Fantasy ──
    | "re-zero"
    | "konosuba"
    | "mushoku-tensei"
    | "slime-isekai"
    | "overlord"
    // ── Romance / Slice of Life ──
    | "your-name"
    | "violet-evergarden"
    | "toradora"
    | "spy-x-family"
    | "bocchi-the-rock"
    // ── Mecha / Sci-Fi ──
    | "evangelion"
    | "steins-gate"
    | "cowboy-bebop"
    | "psycho-pass"
    | "ghost-in-the-shell"
    // ── Dark / Seinen ──
    | "berserk"
    | "vinland-saga"
    | "chainsaw-man"
    | "made-in-abyss"
    | "parasyte"
    // ── Sports / Other ──
    | "haikyuu"
    | "frieren"
    | "dandadan"
    | "dr-stone"
    | "fire-force"
    // ── Manga ──
    | "solo-leveling"
    | "tower-of-god"
    | "vagabond"
    | "20th-century-boys"
    | "monster"
    | "goodnight-punpun"
    | "slam-dunk"
    | "akira"
    | "gantz"
    | "dorohedoro"

export type SidebarItemOverride = {
    icon: React.ComponentType<{ className?: string }>
    label: string
}

export type PlayerIconOverrides = {
    play?: React.ComponentType<{ className?: string }>
    pause?: React.ComponentType<{ className?: string }>
    volumeHigh?: React.ComponentType<{ className?: string }>
    volumeMid?: React.ComponentType<{ className?: string }>
    volumeLow?: React.ComponentType<{ className?: string }>
    volumeMuted?: React.ComponentType<{ className?: string }>
    fullscreenEnter?: React.ComponentType<{ className?: string }>
    fullscreenExit?: React.ComponentType<{ className?: string }>
    skipForward?: React.ComponentType<{ className?: string }>
    skipBack?: React.ComponentType<{ className?: string }>
    pip?: React.ComponentType<{ className?: string }>
    pipOff?: React.ComponentType<{ className?: string }>
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
    /** Player icon overrides for video player controls */
    playerIconOverrides?: PlayerIconOverrides
    /**
     * Level → rank name. Keys are level thresholds; the highest key ≤ current level wins.
     * Example: { 1: "Genin", 15: "Chunin", 30: "Jonin" }
     */
    milestoneNames?: Record<number, string>
}
