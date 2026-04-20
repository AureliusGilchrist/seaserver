export type CursorDefinition = {
    id: string
    name: string
    description: string
    /** CSS cursor value, e.g. "url('/cursors/sword.png') 8 8, auto" or a standard CSS cursor name */
    cursorCss: string
    /** SVG data URI or URL. If null, uses cursorCss directly */
    icon?: string
    requiredLevel: number
    category: "default" | "weapon" | "character" | "abstract" | "special"
    tags?: string[]
}

// ------------------------------------------------------------------
// SVG cursor helpers
// ------------------------------------------------------------------

function svgCursor(svg: string, hotX = 8, hotY = 8): string {
    const encoded = encodeURIComponent(svg)
    return `url("data:image/svg+xml,${encoded}") ${hotX} ${hotY}, auto`
}

// ------------------------------------------------------------------
// Cursor catalogue
// ------------------------------------------------------------------

export const CURSOR_DEFINITIONS: CursorDefinition[] = [
    // ── DEFAULT / FREE (level 1) ──────────────────────────────────────
    {
        id: "default",
        name: "Default",
        description: "The classic system cursor",
        cursorCss: "auto",
        requiredLevel: 1,
        category: "default",
    },
    {
        id: "crosshair",
        name: "Crosshair",
        description: "A precise crosshair",
        cursorCss: "crosshair",
        requiredLevel: 1,
        category: "default",
    },
    {
        id: "dot-white",
        name: "White Dot",
        description: "A clean minimal dot",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="4" fill="white" stroke="black" stroke-width="1"/></svg>`),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="8" fill="white" stroke="black" stroke-width="2"/></svg>`)}`,
        requiredLevel: 1,
        category: "abstract",
    },
    {
        id: "dot-red",
        name: "Red Dot",
        description: "An energetic red dot",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="4" fill="#ef4444" stroke="#991b1b" stroke-width="1"/></svg>`),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="8" fill="#ef4444" stroke="#991b1b" stroke-width="2"/></svg>`)}`,
        requiredLevel: 1,
        category: "abstract",
    },
    {
        id: "ring-white",
        name: "White Ring",
        description: "A hollow ring cursor",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="5" fill="none" stroke="white" stroke-width="2"/></svg>`),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="10" fill="none" stroke="white" stroke-width="3"/></svg>`)}`,
        requiredLevel: 1,
        category: "abstract",
    },
    {
        id: "star-yellow",
        name: "Star",
        description: "A golden five-pointed star",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><polygon points="10,2 12.4,7.6 18.5,8.2 14,12.4 15.4,18.5 10,15.4 4.6,18.5 6,12.4 1.5,8.2 7.6,7.6" fill="#facc15" stroke="#b45309" stroke-width="1"/></svg>`, 10, 10),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><polygon points="20,4 24.9,15.1 37,16.4 28,24.7 30.8,37 20,30.8 9.2,37 12,24.7 3,16.4 15.1,15.1" fill="#facc15" stroke="#b45309" stroke-width="2"/></svg>`)}`,
        requiredLevel: 1,
        category: "abstract",
    },
    {
        id: "heart-pink",
        name: "Pink Heart",
        description: "A lovely pink heart",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z" fill="#f472b6"/></svg>`, 9, 16),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24"><path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z" fill="#f472b6"/></svg>`)}`,
        requiredLevel: 1,
        category: "abstract",
    },
    {
        id: "diamond-blue",
        name: "Diamond",
        description: "A shimmering blue diamond",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><polygon points="9,1 17,9 9,17 1,9" fill="#38bdf8" stroke="#0369a1" stroke-width="1"/></svg>`, 9, 9),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><polygon points="18,2 34,18 18,34 2,18" fill="#38bdf8" stroke="#0369a1" stroke-width="2"/></svg>`)}`,
        requiredLevel: 1,
        category: "abstract",
    },
    {
        id: "arrow-white",
        name: "White Arrow",
        description: "A clean white pointer arrow",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="22"><path d="M2 2 L2 18 L6 14 L10 22 L13 20 L9 12 L15 12 Z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/></svg>`, 2, 2),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44"><path d="M4 4 L4 36 L12 28 L20 44 L26 40 L18 24 L30 24 Z" fill="white" stroke="black" stroke-width="3" stroke-linejoin="round"/></svg>`)}`,
        requiredLevel: 1,
        category: "default",
    },
    {
        id: "arrow-gold",
        name: "Golden Arrow",
        description: "A prestige golden arrow",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="22"><path d="M2 2 L2 18 L6 14 L10 22 L13 20 L9 12 L15 12 Z" fill="#facc15" stroke="#92400e" stroke-width="1.5" stroke-linejoin="round"/></svg>`, 2, 2),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44"><path d="M4 4 L4 36 L12 28 L20 44 L26 40 L18 24 L30 24 Z" fill="#facc15" stroke="#92400e" stroke-width="3" stroke-linejoin="round"/></svg>`)}`,
        requiredLevel: 1,
        category: "default",
    },

    // ── WEAPON CURSORS (level-gated) ────────────────────────────────
    {
        id: "sword",
        name: "Sword",
        description: "A katana blade pointer",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><line x1="4" y1="24" x2="22" y2="6" stroke="#e2e8f0" stroke-width="2.5" stroke-linecap="round"/><line x1="3" y1="23" x2="6" y2="26" stroke="#94a3b8" stroke-width="3" stroke-linecap="round"/><line x1="17" y1="11" x2="19" y2="8" stroke="#60a5fa" stroke-width="2" stroke-linecap="round"/></svg>`, 4, 24),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><line x1="6" y1="42" x2="38" y2="10" stroke="#e2e8f0" stroke-width="4" stroke-linecap="round"/><line x1="5" y1="41" x2="10" y2="46" stroke="#94a3b8" stroke-width="5" stroke-linecap="round"/><line x1="30" y1="18" x2="34" y2="14" stroke="#60a5fa" stroke-width="3" stroke-linecap="round"/></svg>`)}`,
        requiredLevel: 5,
        category: "weapon",
        tags: ["blade", "katana"],
    },
    {
        id: "scythe",
        name: "Scythe",
        description: "A grim reaper's curved scythe",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><path d="M4 24 Q8 8 20 6 Q24 6 22 10 Q16 12 8 20 Z" fill="#1e293b" stroke="#94a3b8" stroke-width="1.5"/><line x1="4" y1="24" x2="7" y2="27" stroke="#64748b" stroke-width="2" stroke-linecap="round"/></svg>`, 4, 24),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><path d="M8 40 Q14 14 36 10 Q42 10 38 18 Q28 22 14 36 Z" fill="#1e293b" stroke="#94a3b8" stroke-width="2.5"/><line x1="8" y1="40" x2="13" y2="45" stroke="#64748b" stroke-width="3" stroke-linecap="round"/></svg>`)}`,
        requiredLevel: 8,
        category: "weapon",
        tags: ["death note", "dark"],
    },
    {
        id: "trident",
        name: "Trident",
        description: "A powerful three-pronged trident",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="28"><line x1="12" y1="4" x2="12" y2="26" stroke="#60a5fa" stroke-width="2.5"/><path d="M4 4 Q4 12 8 12 M20 4 Q20 12 16 12" stroke="#60a5fa" fill="none" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="12" x2="16" y2="12" stroke="#60a5fa" stroke-width="2"/></svg>`, 12, 4),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="56"><line x1="24" y1="8" x2="24" y2="52" stroke="#60a5fa" stroke-width="5"/><path d="M8 8 Q8 24 16 24 M40 8 Q40 24 32 24" stroke="#60a5fa" fill="none" stroke-width="4" stroke-linecap="round"/><line x1="16" y1="24" x2="32" y2="24" stroke="#60a5fa" stroke-width="4"/></svg>`)}`,
        requiredLevel: 12,
        category: "weapon",
    },
    {
        id: "kunai",
        name: "Kunai",
        description: "A ninja throwing blade",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="22" height="28"><path d="M11 2 L14 12 L11 10 L8 12 Z" fill="#94a3b8"/><rect x="10" y="12" width="2" height="10" fill="#6b7280" rx="1"/><line x1="7" y1="17" x2="15" y2="17" stroke="#374151" stroke-width="1.5"/><path d="M11 22 L11 26 L9 26 L11 28 L13 26 L11 26" fill="#6b7280"/></svg>`, 11, 2),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="44" height="56"><path d="M22 4 L28 24 L22 20 L16 24 Z" fill="#94a3b8"/><rect x="20" y="24" width="4" height="20" fill="#6b7280" rx="2"/><line x1="14" y1="34" x2="30" y2="34" stroke="#374151" stroke-width="3"/><path d="M22 44 L22 52 L18 52 L22 56 L26 52 L22 52" fill="#6b7280"/></svg>`)}`,
        requiredLevel: 15,
        category: "weapon",
        tags: ["naruto", "ninja"],
    },
    {
        id: "spear",
        name: "Spear",
        description: "A battle spear tip",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="28"><path d="M10 2 L14 10 L10 8 L6 10 Z" fill="#f97316"/><line x1="10" y1="8" x2="10" y2="26" stroke="#92400e" stroke-width="2.5" stroke-linecap="round"/></svg>`, 10, 2),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="56"><path d="M20 4 L28 20 L20 16 L12 20 Z" fill="#f97316"/><line x1="20" y1="16" x2="20" y2="52" stroke="#92400e" stroke-width="5" stroke-linecap="round"/></svg>`)}`,
        requiredLevel: 18,
        category: "weapon",
    },
    {
        id: "wand",
        name: "Magic Wand",
        description: "A sparkling wizard wand",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><line x1="4" y1="22" x2="20" y2="6" stroke="#a78bfa" stroke-width="2.5" stroke-linecap="round"/><circle cx="21" cy="5" r="3" fill="#fbbf24"/><circle cx="5" cy="5" r="1" fill="#fbbf24" opacity="0.6"/><circle cx="21" cy="19" r="1" fill="#fbbf24" opacity="0.6"/><circle cx="13" cy="3" r="1" fill="#fbbf24" opacity="0.8"/></svg>`, 4, 22),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52"><line x1="8" y1="44" x2="40" y2="12" stroke="#a78bfa" stroke-width="5" stroke-linecap="round"/><circle cx="42" cy="10" r="6" fill="#fbbf24"/><circle cx="10" cy="10" r="3" fill="#fbbf24" opacity="0.6"/><circle cx="42" cy="38" r="3" fill="#fbbf24" opacity="0.6"/><circle cx="26" cy="6" r="2" fill="#fbbf24" opacity="0.8"/></svg>`)}`,
        requiredLevel: 20,
        category: "weapon",
        tags: ["magic", "fairy tail"],
    },
    {
        id: "bow-arrow",
        name: "Bow & Arrow",
        description: "An archer's drawn bow",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><path d="M6 20 Q2 12 8 6" stroke="#92400e" fill="none" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="20" x2="8" y2="6" stroke="#78350f" stroke-width="1" stroke-dasharray="1,1"/><line x1="4" y1="13" x2="22" y2="13" stroke="#a3a3a3" stroke-width="1.5"/><path d="M22 13 L18 11 L18 15 Z" fill="#6b7280"/></svg>`, 4, 13),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52"><path d="M12 40 Q4 24 16 12" stroke="#92400e" fill="none" stroke-width="4" stroke-linecap="round"/><line x1="12" y1="40" x2="16" y2="12" stroke="#78350f" stroke-width="2" stroke-dasharray="2,2"/><line x1="8" y1="26" x2="44" y2="26" stroke="#a3a3a3" stroke-width="3"/><path d="M44 26 L36 22 L36 30 Z" fill="#6b7280"/></svg>`)}`,
        requiredLevel: 22,
        category: "weapon",
        tags: ["hunter x hunter"],
    },
    {
        id: "flame-sword",
        name: "Flame Sword",
        description: "A sword wreathed in fire",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><line x1="4" y1="24" x2="22" y2="6" stroke="#fbbf24" stroke-width="2.5" stroke-linecap="round"/><path d="M22 6 Q24 2 20 4 Q22 1 18 3 Q20 0 16 2 Q19 4 18 8 Z" fill="#ef4444" opacity="0.8"/><line x1="3" y1="23" x2="6" y2="26" stroke="#78350f" stroke-width="3" stroke-linecap="round"/></svg>`, 4, 24),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><line x1="6" y1="42" x2="38" y2="10" stroke="#fbbf24" stroke-width="4.5" stroke-linecap="round"/><path d="M38 10 Q42 2 36 6 Q40 1 32 5 Q36 0 28 4 Q34 7 32 14 Z" fill="#ef4444" opacity="0.9"/><line x1="5" y1="41" x2="10" y2="46" stroke="#78350f" stroke-width="5" stroke-linecap="round"/></svg>`)}`,
        requiredLevel: 30,
        category: "weapon",
        tags: ["fma", "fire"],
    },

    // ── ABSTRACT / ENERGY CURSORS ────────────────────────────────────
    {
        id: "chakra-blue",
        name: "Chakra",
        description: "Glowing blue chakra energy",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="9" cy="9" r="7" fill="none" stroke="#38bdf8" stroke-width="1.5" opacity="0.8"/><circle cx="9" cy="9" r="3" fill="#38bdf8" opacity="0.9"/></svg>`, 9, 9),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="14" fill="none" stroke="#38bdf8" stroke-width="3" opacity="0.8"/><circle cx="18" cy="18" r="6" fill="#38bdf8" opacity="0.9"/></svg>`)}`,
        requiredLevel: 10,
        category: "abstract",
        tags: ["naruto", "chakra"],
    },
    {
        id: "lightning-bolt",
        name: "Lightning",
        description: "A crackling lightning bolt",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="24"><path d="M10 2 L6 12 L10 12 L8 22 L14 10 L10 10 L14 2 Z" fill="#fbbf24" stroke="#78350f" stroke-width="0.5"/></svg>`, 9, 2),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48"><path d="M20 4 L12 24 L20 24 L16 44 L28 20 L20 20 L28 4 Z" fill="#fbbf24" stroke="#78350f" stroke-width="1"/></svg>`)}`,
        requiredLevel: 14,
        category: "abstract",
        tags: ["mha", "lightning"],
    },
    {
        id: "spiral-power",
        name: "Spiral Power",
        description: "An ever-spinning drill spiral",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M10 10 Q10 4 14 6 Q18 8 14 12 Q10 16 6 12 Q2 8 6 6 Q10 4 12 8" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="10" r="1.5" fill="#f97316"/></svg>`, 10, 10),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><path d="M20 20 Q20 8 28 12 Q36 16 28 24 Q20 32 12 24 Q4 16 12 12 Q20 8 24 16" fill="none" stroke="#f97316" stroke-width="3" stroke-linecap="round"/><circle cx="20" cy="20" r="3" fill="#f97316"/></svg>`)}`,
        requiredLevel: 25,
        category: "abstract",
    },
    {
        id: "eye-sharingan",
        name: "Sharingan Eye",
        description: "The legendary tomoe eye",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8" fill="#dc2626"/><circle cx="10" cy="10" r="5" fill="#1c1917"/><circle cx="10" cy="6" r="2" fill="#dc2626"/><circle cx="13.7" cy="12" r="2" fill="#dc2626"/><circle cx="6.3" cy="12" r="2" fill="#dc2626"/><circle cx="10" cy="10" r="1.5" fill="#0a0a0a"/></svg>`, 10, 10),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="16" fill="#dc2626"/><circle cx="20" cy="20" r="10" fill="#1c1917"/><circle cx="20" cy="12" r="4" fill="#dc2626"/><circle cx="27.4" cy="24" r="4" fill="#dc2626"/><circle cx="12.6" cy="24" r="4" fill="#dc2626"/><circle cx="20" cy="20" r="3" fill="#0a0a0a"/></svg>`)}`,
        requiredLevel: 35,
        category: "special",
        tags: ["naruto", "sharingan", "uchiha"],
    },
    {
        id: "titan-shifter",
        name: "Titan Shifter",
        description: "Glowing green titan power",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="22"><ellipse cx="9" cy="8" rx="6" ry="7" fill="#86efac" opacity="0.9"/><path d="M9 14 L5 22 L9 20 L13 22 Z" fill="#4ade80"/><circle cx="6.5" cy="7" r="1.5" fill="#052e16"/><circle cx="11.5" cy="7" r="1.5" fill="#052e16"/></svg>`, 9, 8),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44"><ellipse cx="18" cy="16" rx="12" ry="14" fill="#86efac" opacity="0.9"/><path d="M18 28 L10 44 L18 40 L26 44 Z" fill="#4ade80"/><circle cx="13" cy="14" r="3" fill="#052e16"/><circle cx="23" cy="14" r="3" fill="#052e16"/></svg>`)}`,
        requiredLevel: 40,
        category: "special",
        tags: ["aot", "titan"],
    },
    {
        id: "alchemy-circle",
        name: "Alchemy Circle",
        description: "A transmutation circle",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8" fill="none" stroke="#fbbf24" stroke-width="1.5"/><circle cx="10" cy="10" r="5" fill="none" stroke="#fbbf24" stroke-width="1"/><line x1="10" y1="2" x2="10" y2="18" stroke="#fbbf24" stroke-width="0.8"/><line x1="2" y1="10" x2="18" y2="10" stroke="#fbbf24" stroke-width="0.8"/><line x1="4.3" y1="4.3" x2="15.7" y2="15.7" stroke="#fbbf24" stroke-width="0.8"/><line x1="15.7" y1="4.3" x2="4.3" y2="15.7" stroke="#fbbf24" stroke-width="0.8"/></svg>`, 10, 10),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="16" fill="none" stroke="#fbbf24" stroke-width="3"/><circle cx="20" cy="20" r="10" fill="none" stroke="#fbbf24" stroke-width="2"/><line x1="20" y1="4" x2="20" y2="36" stroke="#fbbf24" stroke-width="1.5"/><line x1="4" y1="20" x2="36" y2="20" stroke="#fbbf24" stroke-width="1.5"/><line x1="8.7" y1="8.7" x2="31.3" y2="31.3" stroke="#fbbf24" stroke-width="1.5"/><line x1="31.3" y1="8.7" x2="8.7" y2="31.3" stroke="#fbbf24" stroke-width="1.5"/></svg>`)}`,
        requiredLevel: 28,
        category: "special",
        tags: ["fma", "alchemy"],
    },
    {
        id: "demon-mark",
        name: "Demon Mark",
        description: "Cursed demon energy from Tanjiro",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M10 2 L14 10 L18 6 L14 14 L18 18 L10 14 L2 18 L6 14 L2 6 L6 10 Z" fill="#dc2626" opacity="0.9"/></svg>`, 10, 10),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><path d="M20 4 L28 20 L36 12 L28 28 L36 36 L20 28 L4 36 L12 28 L4 12 L12 20 Z" fill="#dc2626" opacity="0.9"/></svg>`)}`,
        requiredLevel: 32,
        category: "special",
        tags: ["demon slayer", "flame"],
    },
    {
        id: "jujutsu-void",
        name: "Cursed Void",
        description: "The hollow purple cursed technique",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8" fill="#7c3aed" opacity="0.7"/><circle cx="10" cy="10" r="5" fill="#4c1d95" opacity="0.8"/><circle cx="10" cy="10" r="2" fill="#ede9fe" opacity="0.9"/></svg>`, 10, 10),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="16" fill="#7c3aed" opacity="0.7"/><circle cx="20" cy="20" r="10" fill="#4c1d95" opacity="0.8"/><circle cx="20" cy="20" r="4" fill="#ede9fe" opacity="0.9"/></svg>`)}`,
        requiredLevel: 45,
        category: "special",
        tags: ["jjk", "gojo"],
    },
    {
        id: "plus-ultra",
        name: "Plus Ultra!",
        description: "SMASH with All Might's signature cursor",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M12 2 L14 8 L20 8 L15 12 L17 18 L12 14 L7 18 L9 12 L4 8 L10 8 Z" fill="#1d4ed8"/><path d="M12 4 L13.5 8 L18 8 L14.5 11 L16 16 L12 13.5 L8 16 L9.5 11 L6 8 L10.5 8 Z" fill="#fbbf24"/></svg>`, 12, 12),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><path d="M24 4 L28 16 L40 16 L30 24 L34 36 L24 28 L14 36 L18 24 L8 16 L20 16 Z" fill="#1d4ed8"/><path d="M24 8 L27 16 L36 16 L29 22 L32 32 L24 27 L16 32 L19 22 L12 16 L21 16 Z" fill="#fbbf24"/></svg>`)}`,
        requiredLevel: 50,
        category: "special",
        tags: ["mha", "all might"],
    },
    // ── BONUS HIGH-LEVEL CURSORS ────────────────────────────────────
    {
        id: "infinity-seal",
        name: "Infinity Seal",
        description: "The six eyes limitless seal",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16"><path d="M4 8 Q4 2 10 2 Q16 2 12 8 Q16 14 22 14 Q28 14 28 8 Q28 2 22 2 Q16 2 12 8 Q8 14 4 14 Q-2 14 -2 8" fill="none" stroke="#06b6d4" stroke-width="2.5" stroke-linecap="round"/></svg>`, 12, 8),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="32"><path d="M8 16 Q8 4 20 4 Q32 4 24 16 Q32 28 44 28 Q56 28 56 16 Q56 4 44 4 Q32 4 24 16 Q16 28 8 28 Q-4 28 -4 16" fill="none" stroke="#06b6d4" stroke-width="5" stroke-linecap="round"/></svg>`)}`,
        requiredLevel: 60,
        category: "special",
        tags: ["jjk", "infinity"],
    },
    {
        id: "death-apple",
        name: "Shinigami Apple",
        description: "A shinigami's cursed apple",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="22"><path d="M9 4 Q14 0 15 4 Q18 2 16 6 Q19 8 16 12 Q18 18 9 20 Q0 18 2 12 Q-1 8 2 6 Q0 2 3 4 Q4 0 9 4 Z" fill="#dc2626"/><line x1="9" y1="2" x2="12" y2="0" stroke="#4d7c0f" stroke-width="1.5" stroke-linecap="round"/></svg>`, 9, 11),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44"><path d="M18 8 Q28 0 30 8 Q36 4 32 12 Q38 16 32 24 Q36 36 18 40 Q0 36 4 24 Q-2 16 4 12 Q0 4 6 8 Q8 0 18 8 Z" fill="#dc2626"/><line x1="18" y1="4" x2="24" y2="0" stroke="#4d7c0f" stroke-width="3" stroke-linecap="round"/></svg>`)}`,
        requiredLevel: 55,
        category: "special",
        tags: ["death note"],
    },
    {
        id: "wings-freedom",
        name: "Wings of Freedom",
        description: "Scout Regiment wings that soar",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="20"><path d="M12 10 Q6 4 2 8 Q0 12 4 14 Q8 16 12 12 Z" fill="#64748b"/><path d="M12 10 Q18 4 22 8 Q24 12 20 14 Q16 16 12 12 Z" fill="#64748b"/><ellipse cx="12" cy="13" rx="2" ry="3" fill="#475569"/></svg>`, 12, 13),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="40"><path d="M24 20 Q12 8 4 16 Q0 24 8 28 Q16 32 24 24 Z" fill="#64748b"/><path d="M24 20 Q36 8 44 16 Q48 24 40 28 Q32 32 24 24 Z" fill="#64748b"/><ellipse cx="24" cy="26" rx="4" ry="6" fill="#475569"/></svg>`)}`,
        requiredLevel: 42,
        category: "special",
        tags: ["aot", "scouts"],
    },
    {
        id: "grimoire",
        name: "Grimoire",
        description: "A five-leaf grimoire of Black Clover",
        cursorCss: svgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="22"><rect x="3" y="2" width="12" height="18" rx="1" fill="#1c1917" stroke="#78350f" stroke-width="1.5"/><line x1="9" y1="4" x2="9" y2="18" stroke="#78350f" stroke-width="0.8"/><circle cx="9" cy="11" r="3" fill="none" stroke="#fbbf24" stroke-width="1"/><path d="M9 8 L10 11 L9 14 L8 11 Z" fill="#fbbf24"/></svg>`, 9, 4),
        icon: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44"><rect x="6" y="4" width="24" height="36" rx="2" fill="#1c1917" stroke="#78350f" stroke-width="3"/><line x1="18" y1="8" x2="18" y2="36" stroke="#78350f" stroke-width="1.5"/><circle cx="18" cy="22" r="6" fill="none" stroke="#fbbf24" stroke-width="2"/><path d="M18 16 L20 22 L18 28 L16 22 Z" fill="#fbbf24"/></svg>`)}`,
        requiredLevel: 38,
        category: "special",
        tags: ["black clover"],
    },
]

export const CURSOR_MAP: Record<string, CursorDefinition> = Object.fromEntries(
    CURSOR_DEFINITIONS.map(c => [c.id, c])
)
