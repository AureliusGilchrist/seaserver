export type CustomThemeData = {
    displayName: string
    description: string
    brandColor: string
    backgroundColor: string
    paperColor: string
    fontFamily?: string
    fontHref?: string
    backgroundImageUrl?: string
    backgroundOpacity?: number
}

export const DEFAULT_CUSTOM_THEME_DATA: CustomThemeData = {
    displayName: "My Theme",
    description: "Custom theme",
    brandColor: "#8b5cf6",
    backgroundColor: "#0c1018",
    paperColor: "#111827",
    fontFamily: undefined,
    fontHref: undefined,
    backgroundImageUrl: undefined,
    backgroundOpacity: 0.35,
}

export type CustomThemeFontOption = {
    label: string
    value: string
    href: string
}

export const CUSTOM_THEME_FONT_OPTIONS: CustomThemeFontOption[] = [
    { label: "Default (system)", value: "", href: "" },
    { label: "Inter", value: "Inter, sans-serif", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" },
    { label: "Rajdhani", value: "Rajdhani, sans-serif", href: "https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&display=swap" },
    { label: "Orbitron", value: "Orbitron, sans-serif", href: "https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap" },
    { label: "Cinzel", value: "Cinzel, serif", href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&display=swap" },
    { label: "Bangers", value: "Bangers, cursive", href: "https://fonts.googleapis.com/css2?family=Bangers&display=swap" },
    { label: "Press Start 2P", value: "'Press Start 2P', monospace", href: "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" },
    { label: "Exo 2", value: "'Exo 2', sans-serif", href: "https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700&display=swap" },
    { label: "Righteous", value: "Righteous, cursive", href: "https://fonts.googleapis.com/css2?family=Righteous&display=swap" },
    { label: "Nunito", value: "Nunito, sans-serif", href: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap" },
]

function hexToHSL(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    let h = 0, s = 0
    const l = (max + min) / 2
    if (max !== min) {
        const d = max - min
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
            case g: h = ((b - r) / d + 2) / 6; break
            case b: h = ((r - g) / d + 4) / 6; break
        }
    }
    return [h * 360, s * 100, l * 100]
}

function hslToHex(h: number, s: number, l: number): string {
    const lN = l / 100, sN = s / 100
    const a = sN * Math.min(lN, 1 - lN)
    const f = (n: number) => {
        const k = (n + h / 30) % 12
        return Math.round(255 * (lN - a * Math.max(Math.min(k - 3, 9 - k, 1), -1))).toString(16).padStart(2, "0")
    }
    return `#${f(0)}${f(8)}${f(4)}`
}

export function deriveBrandShadesFromHex(hex: string): Record<string, string> {
    try {
        if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return {}
        const [h, s] = hexToHSL(hex)
        return {
            "--color-brand-300": hslToHex(h, s, 75),
            "--color-brand-400": hslToHex(h, s, 65),
            "--color-brand-500": hex,
            "--color-brand-600": hslToHex(h, s, 45),
            "--color-brand-700": hslToHex(h, s, 35),
        }
    } catch { return {} }
}
