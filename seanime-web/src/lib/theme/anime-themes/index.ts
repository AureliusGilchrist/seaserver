export * from "./types"
export * from "./seanime-theme"
export * from "./naruto-theme"
export * from "./bleach-theme"
export * from "./one-piece-theme"

import { seanimeTheme } from "./seanime-theme"
import { narutoTheme } from "./naruto-theme"
import { bleachTheme } from "./bleach-theme"
import { onePieceTheme } from "./one-piece-theme"
import type { AnimeThemeConfig, AnimeThemeId } from "./types"

export const ANIME_THEMES: Record<AnimeThemeId, AnimeThemeConfig> = {
    "seanime": seanimeTheme,
    "naruto": narutoTheme,
    "bleach": bleachTheme,
    "one-piece": onePieceTheme,
}

export const ANIME_THEME_LIST: AnimeThemeConfig[] = [
    seanimeTheme,
    narutoTheme,
    bleachTheme,
    onePieceTheme,
]
