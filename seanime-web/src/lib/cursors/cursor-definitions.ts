// ─── Cursor definitions (compatibility layer over CURSOR_PACKS) ────────────
//
// The cursor system used to expose ONE cursor per reward. It now exposes
// cursor PACKS where each pack contains a real PNG cursor for every CSS
// cursor state. This file keeps the old `CursorDefinition` shape so the
// reward-shop UI can list packs without changes.

import {
    CURSOR_PACKS,
    CURSOR_PACK_MAP,
    CursorPack,
    DEFAULT_PACK,
    packFilter,
    pngUrl,
} from "./cursor-packs"

export type CursorDefinition = {
    id: string
    name: string
    description: string
    /** Legacy CSS cursor value — kept for type compat. Empty for pack-based entries. */
    cursorCss: string
    /** Preview icon (data URI or URL) shown in the reward shop card. */
    icon?: string
    requiredLevel: number
    category: "default" | "weapon" | "character" | "abstract" | "special"
    tags?: string[]
    /** New: reference to the pack backing this definition. */
    pack?: CursorPack
}

function packToDefinition(p: CursorPack): CursorDefinition {
    const arrow = pngUrl(p.baseTheme, "arrow")
    return {
        id: p.id,
        name: p.name,
        description: p.description,
        cursorCss: "",
        icon: arrow,
        requiredLevel: p.requiredLevel,
        category: p.category,
        tags: p.tags,
        pack: p,
    }
}

export const CURSOR_DEFINITIONS: CursorDefinition[] = CURSOR_PACKS.map(packToDefinition)

export const CURSOR_MAP: Record<string, CursorDefinition> = Object.fromEntries(
    CURSOR_DEFINITIONS.map(d => [d.id, d]),
)

export { packFilter, DEFAULT_PACK, CURSOR_PACK_MAP }
