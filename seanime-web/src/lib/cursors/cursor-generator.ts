// ─── Backward-compat re-export ────────────────────────────────────────────
//
// The procedural cursor generator was replaced by the Bibata cursor PACK
// system in `cursor-packs.ts`. The reward-shop UI still imports
// `ALL_CURSOR_DEFINITIONS` from this file, so we expose the pack catalogue
// (1000 entries) through that name.

import { CURSOR_DEFINITIONS } from "./cursor-definitions"
import type { CursorDefinition } from "./cursor-definitions"

export const ALL_CURSOR_DEFINITIONS: CursorDefinition[] = [...CURSOR_DEFINITIONS]
    .sort((a, b) => a.requiredLevel - b.requiredLevel)
