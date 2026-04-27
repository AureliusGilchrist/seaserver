import { CursorDefinition, CURSOR_DEFINITIONS } from "./cursor-definitions"

// ─── Encoding helpers ─────────────────────────────────────────────────────────

function enc(svg: string): string {
    return encodeURIComponent(svg)
}

function svgCursor(svg: string, hx = 8, hy = 8): string {
    return `url("data:image/svg+xml,${enc(svg)}") ${hx} ${hy}, auto`
}

// ─── Shape generators ─────────────────────────────────────────────────────────

type ShapeFn = (fill: string, stroke: string, accent: string) => { svg16: string; svg32: string; hotX: number; hotY: number }

const SHAPES: { id: string; label: string; fn: ShapeFn }[] = [
    {
        id: "circle",
        label: "Circle",
        fn: (f, s) => ({
            svg16: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="${f}" stroke="${s}" stroke-width="1.5"/></svg>`,
            svg32: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="12" fill="${f}" stroke="${s}" stroke-width="2.5"/></svg>`,
            hotX: 8, hotY: 8,
        }),
    },
    {
        id: "ring",
        label: "Ring",
        fn: (f, s, a) => ({
            svg16: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="none" stroke="${f}" stroke-width="2.5"/><circle cx="8" cy="8" r="2" fill="${a}"/></svg>`,
            svg32: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="12" fill="none" stroke="${f}" stroke-width="4"/><circle cx="16" cy="16" r="4" fill="${a}"/></svg>`,
            hotX: 8, hotY: 8,
        }),
    },
    {
        id: "diamond",
        label: "Diamond",
        fn: (f, s) => ({
            svg16: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><polygon points="8,1 15,8 8,15 1,8" fill="${f}" stroke="${s}" stroke-width="1.5"/></svg>`,
            svg32: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><polygon points="16,2 30,16 16,30 2,16" fill="${f}" stroke="${s}" stroke-width="2.5"/></svg>`,
            hotX: 8, hotY: 8,
        }),
    },
    {
        id: "star",
        label: "Star",
        fn: (f, s) => ({
            svg16: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><polygon points="10,2 12.4,7.6 18.5,8.2 14,12.4 15.4,18.5 10,15.4 4.6,18.5 6,12.4 1.5,8.2 7.6,7.6" fill="${f}" stroke="${s}" stroke-width="0.8"/></svg>`,
            svg32: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><polygon points="20,4 24.9,15.1 37,16.4 28,24.7 30.8,37 20,30.8 9.2,37 12,24.7 3,16.4 15.1,15.1" fill="${f}" stroke="${s}" stroke-width="1.5"/></svg>`,
            hotX: 10, hotY: 10,
        }),
    },
    {
        id: "arrow",
        label: "Arrow",
        fn: (f, s) => ({
            svg16: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="22"><path d="M2 2 L2 18 L6 14 L10 22 L13 20 L9 12 L15 12 Z" fill="${f}" stroke="${s}" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
            svg32: `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44"><path d="M4 4 L4 36 L12 28 L20 44 L26 40 L18 24 L30 24 Z" fill="${f}" stroke="${s}" stroke-width="3" stroke-linejoin="round"/></svg>`,
            hotX: 2, hotY: 2,
        }),
    },
    {
        id: "cross",
        label: "Cross",
        fn: (f, s) => ({
            svg16: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><line x1="8" y1="1" x2="8" y2="15" stroke="${f}" stroke-width="3" stroke-linecap="round"/><line x1="1" y1="8" x2="15" y2="8" stroke="${f}" stroke-width="3" stroke-linecap="round"/><line x1="8" y1="1" x2="8" y2="15" stroke="${s}" stroke-width="1" stroke-linecap="round"/></svg>`,
            svg32: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><line x1="16" y1="2" x2="16" y2="30" stroke="${f}" stroke-width="6" stroke-linecap="round"/><line x1="2" y1="16" x2="30" y2="16" stroke="${f}" stroke-width="6" stroke-linecap="round"/></svg>`,
            hotX: 8, hotY: 8,
        }),
    },
    {
        id: "triangle",
        label: "Triangle",
        fn: (f, s) => ({
            svg16: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><polygon points="9,1 17,17 1,17" fill="${f}" stroke="${s}" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
            svg32: `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><polygon points="18,2 34,34 2,34" fill="${f}" stroke="${s}" stroke-width="3" stroke-linejoin="round"/></svg>`,
            hotX: 9, hotY: 1,
        }),
    },
    {
        id: "shield",
        label: "Shield",
        fn: (f, s, a) => ({
            svg16: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="18"><path d="M8 1 L15 4 L15 9 Q15 15 8 17 Q1 15 1 9 L1 4 Z" fill="${f}" stroke="${s}" stroke-width="1.5"/><line x1="8" y1="5" x2="8" y2="13" stroke="${a}" stroke-width="1.5" stroke-linecap="round"/><line x1="4" y1="9" x2="12" y2="9" stroke="${a}" stroke-width="1.5" stroke-linecap="round"/></svg>`,
            svg32: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="36"><path d="M16 2 L30 8 L30 18 Q30 30 16 34 Q2 30 2 18 L2 8 Z" fill="${f}" stroke="${s}" stroke-width="2.5"/><line x1="16" y1="10" x2="16" y2="26" stroke="${a}" stroke-width="3" stroke-linecap="round"/><line x1="8" y1="18" x2="24" y2="18" stroke="${a}" stroke-width="3" stroke-linecap="round"/></svg>`,
            hotX: 8, hotY: 1,
        }),
    },
    {
        id: "hexagon",
        label: "Hexagon",
        fn: (f, s) => ({
            svg16: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><polygon points="9,1 16.8,5 16.8,13 9,17 1.2,13 1.2,5" fill="${f}" stroke="${s}" stroke-width="1.5"/></svg>`,
            svg32: `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><polygon points="18,2 33.6,10 33.6,26 18,34 2.4,26 2.4,10" fill="${f}" stroke="${s}" stroke-width="2.5"/></svg>`,
            hotX: 9, hotY: 9,
        }),
    },
    {
        id: "flame",
        label: "Flame",
        fn: (f, s) => ({
            svg16: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="20"><path d="M7 1 Q10 5 9 9 Q11 6 10 11 Q12 8 11 13 Q12 17 7 19 Q2 17 3 13 Q4 8 6 11 Q5 6 7 9 Q6 5 7 1 Z" fill="${f}" stroke="${s}" stroke-width="0.8" stroke-linejoin="round"/></svg>`,
            svg32: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40"><path d="M14 2 Q20 10 18 18 Q22 12 20 22 Q24 16 22 26 Q24 34 14 38 Q4 34 6 26 Q8 16 12 22 Q10 12 14 18 Q12 10 14 2 Z" fill="${f}" stroke="${s}" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
            hotX: 7, hotY: 18,
        }),
    },
    {
        id: "drop",
        label: "Drop",
        fn: (f, s) => ({
            svg16: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="20"><path d="M7 1 Q12 8 12 13 Q12 19 7 19 Q2 19 2 13 Q2 8 7 1 Z" fill="${f}" stroke="${s}" stroke-width="1.5"/></svg>`,
            svg32: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40"><path d="M14 2 Q24 16 24 26 Q24 38 14 38 Q4 38 4 26 Q4 16 14 2 Z" fill="${f}" stroke="${s}" stroke-width="2.5"/></svg>`,
            hotX: 7, hotY: 1,
        }),
    },
    {
        id: "x-mark",
        label: "X",
        fn: (f, s) => ({
            svg16: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><line x1="2" y1="2" x2="14" y2="14" stroke="${f}" stroke-width="3.5" stroke-linecap="round"/><line x1="14" y1="2" x2="2" y2="14" stroke="${f}" stroke-width="3.5" stroke-linecap="round"/><line x1="2" y1="2" x2="14" y2="14" stroke="${s}" stroke-width="1" stroke-linecap="round"/><line x1="14" y1="2" x2="2" y2="14" stroke="${s}" stroke-width="1" stroke-linecap="round"/></svg>`,
            svg32: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><line x1="4" y1="4" x2="28" y2="28" stroke="${f}" stroke-width="7" stroke-linecap="round"/><line x1="28" y1="4" x2="4" y2="28" stroke="${f}" stroke-width="7" stroke-linecap="round"/></svg>`,
            hotX: 8, hotY: 8,
        }),
    },
    {
        id: "flower",
        label: "Flower",
        fn: (f, s, a) => ({
            svg16: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><ellipse cx="9" cy="5" rx="2.5" ry="4" fill="${f}"/><ellipse cx="9" cy="13" rx="2.5" ry="4" fill="${f}"/><ellipse cx="5" cy="9" rx="4" ry="2.5" fill="${f}"/><ellipse cx="13" cy="9" rx="4" ry="2.5" fill="${f}"/><circle cx="9" cy="9" r="3" fill="${a}" stroke="${s}" stroke-width="0.8"/></svg>`,
            svg32: `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><ellipse cx="18" cy="10" rx="5" ry="8" fill="${f}"/><ellipse cx="18" cy="26" rx="5" ry="8" fill="${f}"/><ellipse cx="10" cy="18" rx="8" ry="5" fill="${f}"/><ellipse cx="26" cy="18" rx="8" ry="5" fill="${f}"/><circle cx="18" cy="18" r="6" fill="${a}" stroke="${s}" stroke-width="1.5"/></svg>`,
            hotX: 9, hotY: 9,
        }),
    },
    {
        id: "spiral",
        label: "Spiral",
        fn: (f, s) => ({
            svg16: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><path d="M9 9 Q9 5 12 6 Q15 7 13 10 Q11 13 8 11 Q5 9 7 7 Q9 5 11 7" fill="none" stroke="${f}" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="9" r="1.5" fill="${s}"/></svg>`,
            svg32: `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><path d="M18 18 Q18 10 24 12 Q30 14 26 20 Q22 26 16 22 Q10 18 14 14 Q18 10 22 14" fill="none" stroke="${f}" stroke-width="3.5" stroke-linecap="round"/><circle cx="18" cy="18" r="3" fill="${s}"/></svg>`,
            hotX: 9, hotY: 9,
        }),
    },
]

// ─── Color palettes per tier ──────────────────────────────────────────────────

interface Palette {
    fill: string
    stroke: string
    accent: string
    label: string
}

const TIER_PALETTES: Palette[][] = [
    // Tier 1 (levels 61-100): Vivid standard
    [
        { fill: "#f87171", stroke: "#991b1b", accent: "#fef2f2", label: "Crimson" },
        { fill: "#60a5fa", stroke: "#1e40af", accent: "#eff6ff", label: "Sapphire" },
        { fill: "#4ade80", stroke: "#166534", accent: "#f0fdf4", label: "Emerald" },
        { fill: "#facc15", stroke: "#92400e", accent: "#fefce8", label: "Golden" },
        { fill: "#c084fc", stroke: "#6b21a8", accent: "#faf5ff", label: "Violet" },
        { fill: "#f97316", stroke: "#7c2d12", accent: "#fff7ed", label: "Tangerine" },
        { fill: "#22d3ee", stroke: "#155e75", accent: "#ecfeff", label: "Cyan" },
        { fill: "#fb7185", stroke: "#9f1239", accent: "#fff1f2", label: "Rose" },
        { fill: "#a3e635", stroke: "#3f6212", accent: "#f7fee7", label: "Lime" },
        { fill: "#e879f9", stroke: "#86198f", accent: "#fdf4ff", label: "Fuchsia" },
    ],
    // Tier 2 (101-200): Metallic
    [
        { fill: "#d1d5db", stroke: "#374151", accent: "#f9fafb", label: "Silver" },
        { fill: "#fcd34d", stroke: "#78350f", accent: "#fffbeb", label: "Gold" },
        { fill: "#7dd3fc", stroke: "#0c4a6e", accent: "#f0f9ff", label: "Ice Blue" },
        { fill: "#86efac", stroke: "#14532d", accent: "#f0fdf4", label: "Mint" },
        { fill: "#fca5a5", stroke: "#7f1d1d", accent: "#fef2f2", label: "Copper" },
        { fill: "#a5b4fc", stroke: "#312e81", accent: "#eef2ff", label: "Steel" },
        { fill: "#fde68a", stroke: "#78350f", accent: "#fffbeb", label: "Brass" },
        { fill: "#6ee7b7", stroke: "#064e3b", accent: "#ecfdf5", label: "Aquamarine" },
        { fill: "#ddd6fe", stroke: "#4c1d95", accent: "#f5f3ff", label: "Lavender" },
        { fill: "#fed7aa", stroke: "#7c2d12", accent: "#fff7ed", label: "Bronze" },
    ],
    // Tier 3 (201-300): Neon
    [
        { fill: "#ff0080", stroke: "#4a0020", accent: "#ff80c0", label: "Neon Pink" },
        { fill: "#00ff88", stroke: "#004422", accent: "#80ffc4", label: "Neon Green" },
        { fill: "#0080ff", stroke: "#002044", accent: "#80c0ff", label: "Neon Blue" },
        { fill: "#ff8000", stroke: "#442000", accent: "#ffc080", label: "Neon Orange" },
        { fill: "#ff00ff", stroke: "#440044", accent: "#ff80ff", label: "Neon Magenta" },
        { fill: "#00ffff", stroke: "#004444", accent: "#80ffff", label: "Neon Cyan" },
        { fill: "#ffff00", stroke: "#444400", accent: "#ffff80", label: "Neon Yellow" },
        { fill: "#ff4040", stroke: "#441010", accent: "#ff9090", label: "Neon Red" },
        { fill: "#8000ff", stroke: "#200044", accent: "#c080ff", label: "Neon Purple" },
        { fill: "#40ff40", stroke: "#104410", accent: "#90ff90", label: "Neon Lime" },
    ],
    // Tier 4 (301-400): Pastel
    [
        { fill: "#fce7f3", stroke: "#be185d", accent: "#f9a8d4", label: "Pastel Pink" },
        { fill: "#dbeafe", stroke: "#1d4ed8", accent: "#93c5fd", label: "Pastel Blue" },
        { fill: "#dcfce7", stroke: "#15803d", accent: "#86efac", label: "Pastel Green" },
        { fill: "#fef9c3", stroke: "#a16207", accent: "#fde047", label: "Pastel Yellow" },
        { fill: "#ede9fe", stroke: "#6d28d9", accent: "#c4b5fd", label: "Pastel Violet" },
        { fill: "#fef3c7", stroke: "#b45309", accent: "#fcd34d", label: "Pastel Amber" },
        { fill: "#cffafe", stroke: "#0e7490", accent: "#67e8f9", label: "Pastel Cyan" },
        { fill: "#ffe4e6", stroke: "#be123c", accent: "#fda4af", label: "Pastel Rose" },
        { fill: "#ecfccb", stroke: "#4d7c0f", accent: "#bef264", label: "Pastel Lime" },
        { fill: "#fdf4ff", stroke: "#a21caf", accent: "#f0abfc", label: "Pastel Fuchsia" },
    ],
    // Tier 5 (401-500): Dark/Void
    [
        { fill: "#1e293b", stroke: "#94a3b8", accent: "#475569", label: "Slate" },
        { fill: "#1c1917", stroke: "#a8a29e", accent: "#44403c", label: "Obsidian" },
        { fill: "#0f172a", stroke: "#818cf8", accent: "#1e1b4b", label: "Midnight" },
        { fill: "#042f2e", stroke: "#2dd4bf", accent: "#134e4a", label: "Deep Teal" },
        { fill: "#1e1b4b", stroke: "#a5b4fc", accent: "#312e81", label: "Deep Indigo" },
        { fill: "#2d1b69", stroke: "#c084fc", accent: "#4c1d95", label: "Deep Purple" },
        { fill: "#3b0764", stroke: "#e879f9", accent: "#6b21a8", label: "Deep Violet" },
        { fill: "#431407", stroke: "#fb923c", accent: "#7c2d12", label: "Deep Ember" },
        { fill: "#082f49", stroke: "#38bdf8", accent: "#0c4a6e", label: "Abyss" },
        { fill: "#161b22", stroke: "#30363d", accent: "#21262d", label: "GitHub Dark" },
    ],
    // Tier 6 (501-600): Fire
    [
        { fill: "#ff4500", stroke: "#7c1900", accent: "#ff9060", label: "Magma" },
        { fill: "#ff6b00", stroke: "#7c3300", accent: "#ffb060", label: "Lava" },
        { fill: "#ffa200", stroke: "#7c4f00", accent: "#ffd060", label: "Ember" },
        { fill: "#ff2200", stroke: "#7c1000", accent: "#ff8070", label: "Blaze" },
        { fill: "#d42a00", stroke: "#6c1400", accent: "#ff6050", label: "Inferno" },
        { fill: "#ff5733", stroke: "#8b2500", accent: "#ffa090", label: "Flame" },
        { fill: "#ff8c00", stroke: "#804400", accent: "#ffcc80", label: "Amber Glow" },
        { fill: "#b91c1c", stroke: "#7f1d1d", accent: "#ef4444", label: "Dragon Red" },
        { fill: "#ea580c", stroke: "#7c2d12", accent: "#fb923c", label: "Solar" },
        { fill: "#dc2626", stroke: "#991b1b", accent: "#f87171", label: "Vermillion" },
    ],
    // Tier 7 (601-700): Ice
    [
        { fill: "#bae6fd", stroke: "#075985", accent: "#7dd3fc", label: "Frost" },
        { fill: "#cffafe", stroke: "#155e75", accent: "#67e8f9", label: "Crystal" },
        { fill: "#dde7f5", stroke: "#1e3a5f", accent: "#93c5fd", label: "Arctic" },
        { fill: "#e0f2fe", stroke: "#0369a1", accent: "#38bdf8", label: "Glacier" },
        { fill: "#a5f3fc", stroke: "#0e7490", accent: "#22d3ee", label: "Tundra" },
        { fill: "#c8e6f4", stroke: "#0c4a6e", accent: "#60a5fa", label: "Blizzard" },
        { fill: "#f0f9ff", stroke: "#0284c7", accent: "#7dd3fc", label: "Snowflake" },
        { fill: "#b8cfe8", stroke: "#1e40af", accent: "#93c5fd", label: "Permafrost" },
        { fill: "#bfdbfe", stroke: "#1d4ed8", accent: "#60a5fa", label: "Winter Sky" },
        { fill: "#d4f1f9", stroke: "#0369a1", accent: "#38bdf8", label: "Aqua Ice" },
    ],
    // Tier 8 (701-800): Cosmic
    [
        { fill: "#1a0533", stroke: "#c084fc", accent: "#7e22ce", label: "Nebula" },
        { fill: "#0f0c29", stroke: "#818cf8", accent: "#312e81", label: "Galaxy" },
        { fill: "#030637", stroke: "#38bdf8", accent: "#0c4a6e", label: "Deep Space" },
        { fill: "#1c0032", stroke: "#e879f9", accent: "#86198f", label: "Purple Void" },
        { fill: "#0d0d1e", stroke: "#6366f1", accent: "#1e1b4b", label: "Astral" },
        { fill: "#120523", stroke: "#a855f7", accent: "#6b21a8", label: "Cosmos" },
        { fill: "#0a1628", stroke: "#60a5fa", accent: "#1e3a5f", label: "Stellar" },
        { fill: "#1e0a3c", stroke: "#c4b5fd", accent: "#4c1d95", label: "Twilight" },
        { fill: "#050d14", stroke: "#0ea5e9", accent: "#0c4a6e", label: "Black Hole" },
        { fill: "#0c0020", stroke: "#f0abfc", accent: "#7e22ce", label: "Aurora" },
    ],
    // Tier 9 (801-900): Divine / Rainbow
    [
        { fill: "#fff1f2", stroke: "#f43f5e", accent: "#fda4af", label: "Divine Rose" },
        { fill: "#fefce8", stroke: "#ca8a04", accent: "#fde047", label: "Holy Gold" },
        { fill: "#f0fdf4", stroke: "#16a34a", accent: "#86efac", label: "Sacred Jade" },
        { fill: "#eff6ff", stroke: "#2563eb", accent: "#93c5fd", label: "Celestial" },
        { fill: "#fdf4ff", stroke: "#a21caf", accent: "#f0abfc", label: "Ethereal" },
        { fill: "#fff7ed", stroke: "#ea580c", accent: "#fed7aa", label: "Phoenix" },
        { fill: "#ecfeff", stroke: "#0891b2", accent: "#67e8f9", label: "Oracle" },
        { fill: "#f0fdf4", stroke: "#15803d", accent: "#4ade80", label: "Transcendent" },
        { fill: "#faf5ff", stroke: "#7c3aed", accent: "#ddd6fe", label: "Ascendant" },
        { fill: "#f8fafc", stroke: "#64748b", accent: "#cbd5e1", label: "Omniscient" },
    ],
    // Tier 10 (901-1000): Prismatic
    [
        { fill: "#ff0000", stroke: "#ff8800", accent: "#ffff00", label: "Prism Red" },
        { fill: "#ff4400", stroke: "#ff0088", accent: "#ff88ff", label: "Prism Fire" },
        { fill: "#00ff44", stroke: "#00ffff", accent: "#0044ff", label: "Prism Green" },
        { fill: "#0044ff", stroke: "#8800ff", accent: "#ff00ff", label: "Prism Blue" },
        { fill: "#8800ff", stroke: "#ff0000", accent: "#ffaa00", label: "Prism Violet" },
        { fill: "#ff00aa", stroke: "#aa00ff", accent: "#00aaff", label: "Prism Pink" },
        { fill: "#00ffff", stroke: "#ff00ff", accent: "#ffff00", label: "Prism Cyan" },
        { fill: "#ffaa00", stroke: "#ff0000", accent: "#00ff88", label: "Prism Gold" },
        { fill: "#ff55aa", stroke: "#55aaff", accent: "#aaff55", label: "Prism Tri" },
        { fill: "#ffffff", stroke: "#000000", accent: "#888888", label: "Prism White" },
    ],
]

// ─── Category labels per tier ─────────────────────────────────────────────────

const TIER_CATEGORIES: CursorDefinition["category"][] = [
    "abstract",  // 1 (61-100)
    "abstract",  // 2 (101-200)
    "special",   // 3 (201-300)
    "abstract",  // 4 (301-400)
    "special",   // 5 (401-500)
    "weapon",    // 6 (501-600)
    "abstract",  // 7 (601-700)
    "special",   // 8 (701-800)
    "special",   // 9 (801-900)
    "special",   // 10 (901-1000)
]

// ─── Generator ────────────────────────────────────────────────────────────────

function generateCursorAtLevel(level: number): CursorDefinition {
    const tierIdx = Math.min(Math.floor((level - 61) / 100), 9) // 0-9
    const posInTier = (level - 61) % 100
    const palette = TIER_PALETTES[tierIdx][posInTier % 10]
    const shape = SHAPES[posInTier % SHAPES.length]
    const { svg16, svg32, hotX, hotY } = shape.fn(palette.fill, palette.stroke, palette.accent)

    const tierNames = [
        "Vivid", "Metallic", "Neon", "Pastel", "Void", "Fire", "Ice", "Cosmic", "Divine", "Prismatic",
    ]
    const tierName = tierNames[tierIdx]

    return {
        id: `proc-lv${level}`,
        name: `${palette.label} ${shape.label}`,
        description: `${tierName} tier cursor unlocked at level ${level}.`,
        cursorCss: svgCursor(svg16, hotX, hotY),
        icon: `data:image/svg+xml,${enc(svg32)}`,
        requiredLevel: level,
        category: TIER_CATEGORIES[tierIdx],
        tags: ["procedural", tierName.toLowerCase()],
    }
}

// ─── Build the procedural extension from level 61 to 1000 ─────────────────────

const HANDCRAFTED_LEVELS = new Set(CURSOR_DEFINITIONS.map(c => c.requiredLevel))

const PROCEDURAL_CURSORS: CursorDefinition[] = []
for (let lv = 61; lv <= 1000; lv++) {
    if (!HANDCRAFTED_LEVELS.has(lv)) {
        PROCEDURAL_CURSORS.push(generateCursorAtLevel(lv))
    }
}

// ─── Combined catalogue (hand-crafted + procedural, sorted by level) ──────────

export const ALL_CURSOR_DEFINITIONS: CursorDefinition[] = [
    ...CURSOR_DEFINITIONS,
    ...PROCEDURAL_CURSORS,
].sort((a, b) => a.requiredLevel - b.requiredLevel)
