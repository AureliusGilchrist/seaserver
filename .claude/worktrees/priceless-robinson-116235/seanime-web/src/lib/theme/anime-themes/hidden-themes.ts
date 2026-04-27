import type { AnimeThemeId } from "./types"

/**
 * Hidden themes that must be unlocked by meeting specific conditions.
 * Each entry maps a theme ID to its unlock requirements.
 */
export interface HiddenThemeRequirement {
    themeId: AnimeThemeId
    /** Human-readable unlock hint shown on the locked card */
    hint: string
    /**
     * AniList manga IDs that must appear in the user's manga collection
     * to unlock this theme. ANY match unlocks it.
     */
    requiredMangaIds: number[]
}

/**
 * tokyo-ghoul-re is unlocked when the user has Tokyo Ghoul:re (AniList manga ID 81117)
 * in their AniList manga collection.
 */
export const HIDDEN_THEMES: HiddenThemeRequirement[] = [
    {
        themeId: "tokyo-ghoul-re",
        hint: "Add Tokyo Ghoul:re to your manga list to unlock this theme.",
        requiredMangaIds: [81117],
    },
]

export const HIDDEN_THEME_IDS = new Set<AnimeThemeId>(
    HIDDEN_THEMES.map((h) => h.themeId),
)
