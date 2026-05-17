// ─── Bibata cursor pack system ─────────────────────────────────────────────
//
// Each pack is a SKIN composed of real cursor PNGs sourced from the
// Bibata cursor project (https://github.com/ful1e5/Bibata_Cursor).
// PNGs are vendored under `/cursors/bibata/<theme>/<state>.png`.
//
// Variant packs apply hue-rotate/saturate filters at runtime via canvas
// to recolor the real Bibata cursors — no procedural painting.

export type CursorState =
    | "arrow" | "pointer" | "text" | "wait" | "progress"
    | "crosshair" | "not-allowed" | "grab" | "grabbing"
    | "help" | "move" | "cell" | "copy" | "alias"
    | "zoom-in" | "zoom-out" | "context-menu"
    | "nw-resize" | "ne-resize" | "sw-resize" | "se-resize"
    | "w-resize" | "e-resize" | "n-resize" | "s-resize"
    | "ew-resize" | "ns-resize" | "nwse-resize" | "nesw-resize"

export type CursorBaseTheme =
    | "bibata-modern-classic"
    | "bibata-modern-ice"
    | "bibata-modern-amber"
    | "bibata-original-classic"
    | "bibata-original-ice"
    | "bibata-original-amber"

export type CursorPack = {
    id: string
    name: string
    description: string
    requiredLevel: number
    category: "default" | "weapon" | "character" | "abstract" | "special"
    baseTheme: CursorBaseTheme
    /** Hue rotation 0-360 deg. 0 = no change. */
    hueRotate: number
    /** Saturation multiplier 0..2. 1 = unchanged. */
    saturate: number
    /** Brightness multiplier 0..2. 1 = unchanged. */
    brightness: number
    /** Optional rainbow shimmer (cycles hue over time when set, for top tier) */
    shimmer?: boolean
    tags?: string[]
}

// ── Cursor state → file + hotspot table ───────────────────────────────────
//
// Hotspots scaled from Bibata's 256x256 originals down to our 32x32 PNGs
// (divide by 8). Where Bibata's TOML omitted a hotspot the default 128,128
// becomes 16,16.

export type CursorEntry = {
    state: CursorState
    file: string
    hotX: number
    hotY: number
    /** CSS fallback if URL fails to load */
    fallback: string
}

export const CURSOR_ENTRIES: CursorEntry[] = [
    { state: "arrow",        file: "arrow.png",        hotX: 7,  hotY: 2,  fallback: "default" },
    { state: "pointer",      file: "pointer.png",      hotX: 14, hotY: 2,  fallback: "pointer" },
    { state: "text",         file: "text.png",         hotX: 16, hotY: 16, fallback: "text" },
    { state: "wait",         file: "wait.png",         hotX: 16, hotY: 16, fallback: "wait" },
    { state: "progress",     file: "progress.png",     hotX: 7,  hotY: 2,  fallback: "progress" },
    { state: "crosshair",    file: "crosshair.png",    hotX: 16, hotY: 16, fallback: "crosshair" },
    { state: "not-allowed",  file: "not-allowed.png",  hotX: 13, hotY: 8,  fallback: "not-allowed" },
    { state: "grab",         file: "grab.png",         hotX: 18, hotY: 10, fallback: "grab" },
    { state: "grabbing",     file: "grabbing.png",     hotX: 16, hotY: 8,  fallback: "grabbing" },
    { state: "help",         file: "help.png",         hotX: 5,  hotY: 11, fallback: "help" },
    { state: "move",         file: "move.png",         hotX: 16, hotY: 16, fallback: "move" },
    { state: "cell",         file: "cell.png",         hotX: 16, hotY: 16, fallback: "cell" },
    { state: "copy",         file: "copy.png",         hotX: 7,  hotY: 2,  fallback: "copy" },
    { state: "alias",        file: "alias.png",        hotX: 7,  hotY: 2,  fallback: "alias" },
    { state: "zoom-in",      file: "zoom-in.png",      hotX: 15, hotY: 15, fallback: "zoom-in" },
    { state: "zoom-out",     file: "zoom-out.png",     hotX: 15, hotY: 15, fallback: "zoom-out" },
    { state: "context-menu", file: "context-menu.png", hotX: 7,  hotY: 2,  fallback: "context-menu" },
    { state: "nw-resize",    file: "nw-resize.png",    hotX: 4,  hotY: 3,  fallback: "nw-resize" },
    { state: "ne-resize",    file: "ne-resize.png",    hotX: 29, hotY: 3,  fallback: "ne-resize" },
    { state: "sw-resize",    file: "sw-resize.png",    hotX: 3,  hotY: 29, fallback: "sw-resize" },
    { state: "se-resize",    file: "se-resize.png",    hotX: 29, hotY: 29, fallback: "se-resize" },
    { state: "w-resize",     file: "w-resize.png",     hotX: 3,  hotY: 16, fallback: "w-resize" },
    { state: "e-resize",     file: "e-resize.png",     hotX: 29, hotY: 16, fallback: "e-resize" },
    { state: "n-resize",     file: "n-resize.png",     hotX: 16, hotY: 3,  fallback: "n-resize" },
    { state: "s-resize",     file: "s-resize.png",     hotX: 16, hotY: 29, fallback: "s-resize" },
    { state: "ew-resize",    file: "ew-resize.png",    hotX: 16, hotY: 16, fallback: "ew-resize" },
    { state: "ns-resize",    file: "ns-resize.png",    hotX: 16, hotY: 16, fallback: "ns-resize" },
    { state: "nwse-resize",  file: "nwse-resize.png",  hotX: 16, hotY: 16, fallback: "nwse-resize" },
    { state: "nesw-resize",  file: "nesw-resize.png",  hotX: 16, hotY: 16, fallback: "nesw-resize" },
]

// CSS selectors that should receive each cursor state.
export const CURSOR_STATE_SELECTORS: Record<CursorState, string> = {
    "arrow":        `html, body, *`,
    "pointer":      `a, button, [role="button"], [role="link"], [role="tab"], [role="menuitem"], summary, label, select, .cursor-pointer, [data-clickable]`,
    "text":         `input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, [contenteditable="true"], [contenteditable=""]`,
    "wait":         `[aria-busy="true"], .cursor-wait`,
    "progress":     `.cursor-progress, [data-loading="true"]`,
    "crosshair":    `.cursor-crosshair`,
    "not-allowed":  `:disabled, [aria-disabled="true"], .cursor-not-allowed`,
    "grab":         `.cursor-grab, [draggable="true"]:not(:active)`,
    "grabbing":     `.cursor-grabbing, [draggable="true"]:active`,
    "help":         `[role="tooltip"], [data-tooltip], .cursor-help, abbr[title]`,
    "move":         `.cursor-move`,
    "cell":         `.cursor-cell`,
    "copy":         `.cursor-copy`,
    "alias":        `.cursor-alias`,
    "zoom-in":      `.cursor-zoom-in`,
    "zoom-out":     `.cursor-zoom-out`,
    "context-menu": `.cursor-context-menu`,
    "nw-resize":    `.cursor-nw-resize, .resize-nw`,
    "ne-resize":    `.cursor-ne-resize, .resize-ne`,
    "sw-resize":    `.cursor-sw-resize, .resize-sw`,
    "se-resize":    `.cursor-se-resize, .resize-se`,
    "w-resize":     `.cursor-w-resize, .resize-w`,
    "e-resize":     `.cursor-e-resize, .resize-e`,
    "n-resize":     `.cursor-n-resize, .resize-n`,
    "s-resize":     `.cursor-s-resize, .resize-s`,
    "ew-resize":    `.cursor-ew-resize, .resize-ew`,
    "ns-resize":    `.cursor-ns-resize, .resize-ns`,
    "nwse-resize":  `.cursor-nwse-resize, .resize-nwse`,
    "nesw-resize":  `.cursor-nesw-resize, .resize-nesw`,
}

// ─── Pack catalogue (1000 entries, least cool → most cool) ────────────────

// Tier blueprint — each entry covers a contiguous level range, sourced
// from one of the 6 vendored Bibata themes, with hue/saturation/brightness
// progression that visually escalates "coolness".
type TierBlueprint = {
    label: string
    category: CursorPack["category"]
    baseTheme: CursorBaseTheme
    /** Inclusive level range */
    from: number
    to: number
    /** Hue range applied across the tier (deg) */
    hueFrom: number
    hueTo: number
    /** Saturation range across the tier */
    satFrom: number
    satTo: number
    /** Brightness range across the tier */
    briFrom: number
    briTo: number
    /** Name pool to cycle through */
    names: string[]
    /** Top-tier shimmer flag */
    shimmer?: boolean
}

const TIERS: TierBlueprint[] = [
    {
        label: "Basic", category: "default",
        baseTheme: "bibata-modern-classic",
        from: 1, to: 30,
        hueFrom: 0, hueTo: 30,
        satFrom: 0.7, satTo: 1.0,
        briFrom: 0.95, briTo: 1.05,
        names: ["Plain","Standard","Classic","Default","Clean","Simple","Tidy","Neat","Crisp","Lite","Mono","Slate","Pearl","Stone","Mist","Cloud","Linen","Chalk","Bone","Ash","Sand","Dune","Beige","Quartz","Silver","Pewter","Steel","Iron","Onyx","Coal"],
    },
    {
        label: "Frost", category: "abstract",
        baseTheme: "bibata-modern-ice",
        from: 31, to: 130,
        hueFrom: 0, hueTo: 200,
        satFrom: 0.8, satTo: 1.3,
        briFrom: 1.0, briTo: 1.1,
        names: ["Frost","Glacier","Tundra","Arctic","Polar","Snowfall","Frostbite","Hail","Sleet","Icicle","Permafrost","Powder","Drift","Flurry","Snowflake","Crystal","Quartz","Aqua","Lagoon","Tide","Surf","Breaker","Mariner","Cobalt","Sapphire","Indigo","Lapis","Azure","Cerulean","Cyan"],
    },
    {
        label: "Ember", category: "abstract",
        baseTheme: "bibata-modern-amber",
        from: 131, to: 260,
        hueFrom: 0, hueTo: 320,
        satFrom: 1.0, satTo: 1.4,
        briFrom: 1.0, briTo: 1.15,
        names: ["Ember","Cinder","Spark","Glow","Flicker","Kindle","Hearth","Bonfire","Torch","Lantern","Sunbeam","Sunlit","Honey","Amber","Topaz","Citrine","Marigold","Apricot","Tangerine","Peach","Coral","Salmon","Sunset","Solstice","Gilded","Brass","Bronze","Copper","Saffron","Mustard"],
    },
    {
        label: "Retro", category: "character",
        baseTheme: "bibata-original-classic",
        from: 261, to: 430,
        hueFrom: 0, hueTo: 360,
        satFrom: 0.6, satTo: 1.2,
        briFrom: 0.9, briTo: 1.1,
        names: ["Retro","Vintage","Antique","Heirloom","Relic","Throwback","Nostalgia","Cassette","Vinyl","Polaroid","Sepia","Tinted","Faded","Aged","Patina","Lacquer","Mahogany","Walnut","Velvet","Brocade","Damask","Tapestry","Manuscript","Quill","Inkwell","Parchment","Sigil","Crest","Heraldic","Regal"],
    },
    {
        label: "Aurora", category: "abstract",
        baseTheme: "bibata-original-ice",
        from: 431, to: 620,
        hueFrom: 0, hueTo: 360,
        satFrom: 1.0, satTo: 1.6,
        briFrom: 1.0, briTo: 1.2,
        names: ["Aurora","Borealis","Stellar","Astral","Nebula","Comet","Meteor","Quasar","Pulsar","Nova","Galaxy","Cosmos","Eclipse","Solstice","Equinox","Zenith","Twilight","Dusk","Dawn","Horizon","Starlight","Moonbeam","Halcyon","Empyrean","Celestial","Skybound","Voidwalker","Stargazer","Lightyear","Spectra"],
    },
    {
        label: "Inferno", category: "weapon",
        baseTheme: "bibata-original-amber",
        from: 621, to: 850,
        hueFrom: 0, hueTo: 360,
        satFrom: 1.2, satTo: 1.9,
        briFrom: 1.05, briTo: 1.25,
        names: ["Inferno","Wildfire","Phoenix","Magma","Lava","Pyre","Blaze","Searing","Scorch","Smoulder","Combust","Detonate","Fission","Vulcan","Crimson","Vermillion","Scarlet","Ruby","Garnet","Carmine","Maroon","Burgundy","Sangria","Ember-King","Flame-Lord","Sun-Eater","Star-Forge","Plasma","Ion","Quasar"],
    },
    {
        label: "Mythic", category: "special",
        baseTheme: "bibata-original-amber",
        from: 851, to: 980,
        hueFrom: 0, hueTo: 360,
        satFrom: 1.4, satTo: 2.0,
        briFrom: 1.15, briTo: 1.3,
        names: ["Mythic","Legendary","Sovereign","Imperial","Ascended","Transcendent","Apex","Pinnacle","Zenith","Empyrean","Hallowed","Sanctified","Anointed","Crowned","Throned","Godlike","Eternal","Boundless","Infinity","Genesis","Origin","Primordial","Singular","Solitary","Pristine","Flawless","Immaculate","Sublime","Exalted","Divine"],
    },
    {
        label: "Prismatic", category: "special",
        baseTheme: "bibata-original-amber",
        from: 981, to: 1000,
        hueFrom: 0, hueTo: 360,
        satFrom: 1.6, satTo: 2.0,
        briFrom: 1.2, briTo: 1.35,
        names: ["Prismatic","Rainbow","Iridescent","Spectrum","Kaleidoscope","Refraction","Chromatic","Polychrome","Holographic","Opalescent","Pearlescent","Lustrous","Radiant","Brilliant","Dazzling","Resplendent","Effulgent","Lambent","Coruscating","Scintillating"],
        shimmer: true,
    },
]

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
}

function buildPacksForTier(t: TierBlueprint): CursorPack[] {
    const out: CursorPack[] = []
    const count = t.to - t.from + 1
    for (let i = 0; i < count; i++) {
        const level = t.from + i
        const progress = count <= 1 ? 0 : i / (count - 1)
        const name = t.names[i % t.names.length]
        const idx = Math.floor(i / t.names.length)
        const suffix = idx === 0 ? "" : ` ${romanize(idx + 1)}`
        out.push({
            id: `pack-l${level}`,
            name: `${name}${suffix}`,
            description: `${t.label} tier — unlocks at level ${level}.`,
            requiredLevel: level,
            category: t.category,
            baseTheme: t.baseTheme,
            hueRotate: Math.round(lerp(t.hueFrom, t.hueTo, progress)),
            saturate: Number(lerp(t.satFrom, t.satTo, progress).toFixed(2)),
            brightness: Number(lerp(t.briFrom, t.briTo, progress).toFixed(2)),
            shimmer: t.shimmer,
            tags: [t.label.toLowerCase(), t.baseTheme.replace("bibata-", "")],
        })
    }
    return out
}

function romanize(n: number): string {
    const map: [number, string][] = [
        [1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],
        [50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"],
    ]
    let s = ""
    for (const [v, r] of map) {
        while (n >= v) { s += r; n -= v }
    }
    return s
}

// Default pack for unauthenticated/level-0 users — just uses the system cursor.
export const DEFAULT_PACK: CursorPack = {
    id: "default",
    name: "System Default",
    description: "The classic operating system cursor",
    requiredLevel: 0,
    category: "default",
    baseTheme: "bibata-modern-classic",
    hueRotate: 0,
    saturate: 1,
    brightness: 1,
}

export const CURSOR_PACKS: CursorPack[] = [
    DEFAULT_PACK,
    ...TIERS.flatMap(buildPacksForTier),
]

export const CURSOR_PACK_MAP: Record<string, CursorPack> = Object.fromEntries(
    CURSOR_PACKS.map(p => [p.id, p]),
)

export function pngUrl(theme: CursorBaseTheme, file: string): string {
    return `/cursors/bibata/${theme}/${file.replace(/\.png$/, "")}.png`
}

/** Build the CSS `filter` string for a pack. */
export function packFilter(p: CursorPack): string {
    const parts: string[] = []
    if (p.hueRotate) parts.push(`hue-rotate(${p.hueRotate}deg)`)
    if (p.saturate !== 1) parts.push(`saturate(${p.saturate})`)
    if (p.brightness !== 1) parts.push(`brightness(${p.brightness})`)
    return parts.join(" ") || "none"
}
