import { seanimeTheme } from "./seanime-theme"
import type { AnimeThemeConfig } from "./types"

/**
 * Bundled themes - only seanime (default) is bundled now.
 * All other themes are loaded dynamically from the marketplace (seanime-themes repo).
 */
export const ANIME_THEMES: Record<string, AnimeThemeConfig> = {
    "seanime": seanimeTheme,
}

/**
 * List of bundled themes for display in the theme manager.
 * Themes from the marketplace are fetched separately via the API.
 */
export const ANIME_THEME_LIST: AnimeThemeConfig[] = [
    seanimeTheme,
]
