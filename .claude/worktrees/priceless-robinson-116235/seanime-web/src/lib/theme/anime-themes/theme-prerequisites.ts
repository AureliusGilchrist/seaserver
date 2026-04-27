import type { AnimeThemeId } from "./types"

/**
 * Sequel themes that require the player to have previously activated
 * (i.e., selected at least once) a prequel theme before they can use them.
 */
export interface ThemePrerequisite {
    /** The sequel theme that is locked */
    themeId: AnimeThemeId
    /** The prequel theme that must be activated first */
    requiresThemeId: AnimeThemeId
    /** Display name of the required prequel theme */
    requiresDisplayName: string
    /** Hint shown on the locked card */
    hint: string
}

export const THEME_PREREQUISITES: ThemePrerequisite[] = [
    // Dragon Ball → Dragon Ball Z → Dragon Ball GT
    {
        themeId: "dragon-ball-z",
        requiresThemeId: "dragon-ball",
        requiresDisplayName: "Dragon Ball",
        hint: "Activate the Dragon Ball theme first to unlock this sequel.",
    },
    {
        themeId: "dragon-ball-gt",
        requiresThemeId: "dragon-ball-z",
        requiresDisplayName: "Dragon Ball Z",
        hint: "Activate the Dragon Ball Z theme first to unlock this sequel.",
    },
    // Fate/stay night → Fate/Zero (chronologically FSN is entry point)
    {
        themeId: "fate-zero",
        requiresThemeId: "fate-stay-night",
        requiresDisplayName: "Fate/stay night",
        hint: "Activate the Fate/stay night theme first to unlock this prequel.",
    },
    // Fate/stay night → Fate/Grand Order
    {
        themeId: "fate-grand-order",
        requiresThemeId: "fate-stay-night",
        requiresDisplayName: "Fate/stay night",
        hint: "Activate the Fate/stay night theme first to unlock this spinoff.",
    },
    // Naruto → Boruto (Boruto is sequel to Naruto)
    // (Using naruto as the key; boruto not yet in the theme list but future-proof)
    // Attack on Titan is standalone so no prerequisite
    // Tokyo Ghoul → Tokyo Ghoul:re (hidden theme already, add prerequisite too)
    {
        themeId: "tokyo-ghoul-re",
        requiresThemeId: "tokyo-ghoul",
        requiresDisplayName: "Tokyo Ghoul",
        hint: "Activate the Tokyo Ghoul theme first to unlock this sequel.",
    },
    // Fullmetal Alchemist → (FMA:B is a remake, treat as its own)
    // Trigun → Trigun Stampede (remake/sequel)
    {
        themeId: "trigun-stampede",
        requiresThemeId: "trigun",
        requiresDisplayName: "Trigun",
        hint: "Activate the Trigun theme first to unlock its sequel.",
    },
    // Berserk → Berserk of Gluttony (different series actually but thematic sequel in spirit)
    // No — skip that, different IP.
    // Bleach → (bleach is standalone here)
    // Ghost in the Shell is standalone
    // FLCL: standalone
    // Dragon Ball → Dragon Ball GT chain handled above
    // Evangelion is standalone
    // Higurashi is standalone
    // Clannad is standalone (After Story would be a sequel DLC, not in list)
    // Serial Experiments Lain standalone
    // Macross is standalone
    // Kaguya-sama (multiple seasons, just one theme)
]

/**
 * A Set of theme IDs that have prerequisites, for fast O(1) lookup.
 */
export const PREREQUISITE_THEME_IDS = new Set<AnimeThemeId>(
    THEME_PREREQUISITES.map((p) => p.themeId),
)

/** localStorage key under which the set of ever-activated theme IDs is persisted */
export const ACTIVATED_THEMES_KEY = "sea-activated-themes"

/** Load the set of theme IDs the user has ever activated */
export function loadActivatedThemes(): Set<AnimeThemeId> {
    try {
        const raw = localStorage.getItem(ACTIVATED_THEMES_KEY)
        if (!raw) return new Set()
        const arr = JSON.parse(raw) as string[]
        return new Set(arr as AnimeThemeId[])
    } catch {
        return new Set()
    }
}

/** Persist a newly activated theme ID into localStorage */
export function recordActivatedTheme(id: AnimeThemeId): void {
    try {
        const current = loadActivatedThemes()
        current.add(id)
        localStorage.setItem(ACTIVATED_THEMES_KEY, JSON.stringify([...current]))
    } catch {
        // ignore storage errors
    }
}

/** Returns true if the given theme's prerequisites are satisfied */
export function isThemePrerequisiteMet(
    themeId: AnimeThemeId,
    activatedThemes: Set<AnimeThemeId>,
): boolean {
    const prereq = THEME_PREREQUISITES.find((p) => p.themeId === themeId)
    if (!prereq) return true
    return activatedThemes.has(prereq.requiresThemeId)
}
