import { cn } from "@/components/ui/core/styling"
import React from "react"
import {
    attackOnTitanPlayerIcons,
    blackCloverPlayerIcons,
    bleachPlayerIcons,
    bleachTybwPlayerIcons,
    cowboyBebopPlayerIcons,
    deathNotePlayerIcons,
    demonSlayerPlayerIcons,
    dragonBallZPlayerIcons,
    fairyTailPlayerIcons,
    fullmetalAlchemistPlayerIcons,
    hunterXHunterPlayerIcons,
    jujutsuKaisenPlayerIcons,
    myHeroAcademiaPlayerIcons,
    narutoPlayerIcons,
    onePiecePlayerIcons,
    swordArtOnlinePlayerIcons,
} from "./player-icons"
import type { PlayerIconOverrides, ThemeIconComponent } from "./types"

/**
 * Player icon sets a theme can pick by name with `"playerIconSet": "<name>"` in its theme.json.
 *
 * Two kinds live here:
 *  - the hand-drawn sets from player-icons.tsx, named after the theme they were drawn for
 *    ("bleach", "naruto", …);
 *  - stylised families ("blade", "petal", "rune", …) that any theme can share. Each family keeps
 *    the shapes readable as play / pause / volume / fullscreen and changes only their silhouette.
 *
 * Per-key `playerIconOverrides` slugs in the theme.json still win over the set.
 */

type WaveStyle = "curve" | "angular" | "dots" | "spark" | "pixel" | "bars"
type CornerStyle = "line" | "round" | "bracket" | "diamond" | "pixel"

type Family = {
    /** Play glyph, drawn in a 24×24 box, filled with currentColor. */
    play: React.ReactNode
    pause: React.ReactNode
    wave: WaveStyle
    corner: CornerStyle
    /** Alternative speaker body (defaults to the usual cone). */
    speaker?: React.ReactNode
}

const svg = (children: React.ReactNode, className?: string) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)} aria-hidden>
        {children}
    </svg>
)

const DEFAULT_SPEAKER = <path d="M3 9v6h4l5 5V4L7 9H3z" />
const PIXEL_SPEAKER = <path d="M3 9h4V7h2V5h2v14H9v-2H7v-2H3z" />

const strokeProps = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" } as const

function waves(style: WaveStyle, level: 0 | 1 | 2): React.ReactNode {
    if (level === 0) return null
    switch (style) {
        case "curve":
            return <>
                <path d="M15.5 8.5a5 5 0 0 1 0 7" {...strokeProps} />
                {level === 2 && <path d="M18.5 5.5a9.2 9.2 0 0 1 0 13" {...strokeProps} />}
            </>
        case "angular":
            return <>
                <path d="M15.5 8 L17.5 12 L15.5 16" {...strokeProps} strokeLinecap="square" strokeLinejoin="miter" />
                {level === 2 && <path d="M18.5 5 L21.5 12 L18.5 19" {...strokeProps} strokeLinecap="square" strokeLinejoin="miter" />}
            </>
        case "dots":
            return <>
                <circle cx="16" cy="12" r="1.5" />
                {level === 2 && <><circle cx="19.5" cy="8" r="1.4" /><circle cx="20.5" cy="12" r="1.4" /><circle cx="19.5" cy="16" r="1.4" /></>}
            </>
        case "spark":
            return <>
                <path d="M16.5 9.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
                {level === 2 && <path d="M20.5 5.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9zM20.5 14.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" />}
            </>
        case "pixel":
            return <>
                <path d="M14 10h2v4h-2z" />
                {level === 2 && <path d="M17 7h2v2h-2zM19 9h2v6h-2zM17 15h2v2h-2z" />}
            </>
        case "bars":
            return <>
                <rect x="14.5" y="9.5" width="2" height="5" rx="0.5" />
                {level === 2 && <><rect x="18" y="7" width="2" height="10" rx="0.5" /><rect x="21.5" y="9.5" width="2" height="5" rx="0.5" /></>}
            </>
    }
}

function muteMark(style: WaveStyle): React.ReactNode {
    if (style === "pixel") return <path d="M15 9h2v2h-2zM17 11h2v2h-2zM19 9h2v2h-2zM15 13h2v2h-2zM19 13h2v2h-2z" />
    return <>
        <line x1="15.5" y1="9" x2="21.5" y2="15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="21.5" y1="9" x2="15.5" y2="15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </>
}

/** The four corners of a fullscreen glyph; `inward` draws the exit variant. */
function corners(style: CornerStyle, inward: boolean): React.ReactNode {
    const lp = { fill: "none", stroke: "currentColor", strokeWidth: 2.2 } as const
    switch (style) {
        case "line":
            return inward
                ? <g {...lp} strokeLinecap="square"><path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5" /></g>
                : <g {...lp} strokeLinecap="square"><path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5" /></g>
        case "round":
            return inward
                ? <g {...lp} strokeLinecap="round"><path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3" /></g>
                : <g {...lp} strokeLinecap="round"><path d="M3 8V5a2 2 0 0 1 2-2h3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3" /></g>
        case "bracket":
            return inward
                ? <path d="M6 2h3v7H2V6h4zM15 2h3v4h4v3h-7zM2 15h7v7H6v-4H2zM15 15h7v3h-4v4h-3z" />
                : <path d="M2 2h7v3H5v4H2zM15 2h7v7h-3V5h-4zM2 15h3v4h4v3H2zM19 15h3v7h-7v-3h4z" />
        case "diamond":
            return inward
                ? <path d="M9 2v7H2zM15 2l7 7h-7zM2 15h7v7zM15 15h7l-7 7z" />
                : <path d="M2 2h7L2 9zM22 2v7l-7-7zM2 22v-7l7 7zM22 22h-7l7-7z" />
        case "pixel":
            return inward
                ? <path d="M7 2h2v7H2V7h5zM15 2h2v5h5v2h-7zM2 15h7v7H7v-5H2zM15 15h7v2h-5v5h-2z" />
                : <path d="M2 2h7v2H4v5H2zM15 2h7v7h-2V4h-5zM2 15h2v5h5v2H2zM20 15h2v7h-7v-2h5z" />
    }
}

function pipGlyph(style: CornerStyle, off: boolean): React.ReactNode {
    const rx = style === "round" ? 2.5 : style === "pixel" ? 0 : 1
    return <>
        <rect x="2.5" y="4.5" width="19" height="15" rx={rx} fill="none" stroke="currentColor" strokeWidth="1.9" />
        <rect x="12" y="11.5" width="7" height="5.5" rx={rx / 2} />
        {off && <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </>
}

/** The family's play glyph shrunk to the left with a stop bar — the "next episode" button. */
function nextGlyph(f: Family): React.ReactNode {
    const rx = f.corner === "round" ? 1.2 : 0
    return <>
        <g transform="translate(-0.5 3) scale(0.75)">{f.play}</g>
        <rect x="18" y="4" width="2.8" height="16" rx={rx} />
    </>
}

function makeFamily(name: string, f: Family): PlayerIconOverrides {
    const speaker = f.speaker ?? DEFAULT_SPEAKER
    const comp = (label: string, node: React.ReactNode): ThemeIconComponent => {
        const C: React.FC<{ className?: string }> = ({ className }) => svg(node, className)
        C.displayName = `PlayerIcon(${name}.${label})`
        return C
    }
    return {
        play: comp("play", f.play),
        pause: comp("pause", f.pause),
        volumeHigh: comp("volumeHigh", <>{speaker}{waves(f.wave, 2)}</>),
        volumeMid: comp("volumeMid", <>{speaker}{waves(f.wave, 1)}</>),
        volumeLow: comp("volumeLow", <>{speaker}</>),
        volumeMuted: comp("volumeMuted", <>{speaker}{muteMark(f.wave)}</>),
        fullscreenEnter: comp("fullscreenEnter", corners(f.corner, false)),
        fullscreenExit: comp("fullscreenExit", corners(f.corner, true)),
        skipForward: comp("skipForward", nextGlyph(f)),
        skipBack: comp("skipBack", <g transform="translate(24 0) scale(-1 1)">{nextGlyph(f)}</g>),
        pip: comp("pip", pipGlyph(f.corner, false)),
        pipOff: comp("pipOff", pipGlyph(f.corner, true)),
    }
}

const FAMILIES: Record<string, Family> = {
    /** Sharp, angled — swords, shinigami, samurai. */
    blade: {
        play: <path d="M6 2 L22 12 L6 22 L9 12 Z" />,
        pause: <path d="M5 2h4l-1 20H5zM15 2h4v20h-3z" />,
        wave: "angular",
        corner: "line",
    },
    /** Flickering back edge — fire, demons, hot-blooded shonen. */
    flame: {
        play: <path d="M8 3c-3 3 1 5-2 9 3 4-1 6 2 9l13-9z" />,
        pause: <path d="M5 21V10c0-3 2-4 2-7 2 2 2 4 2 7v11zM15 21V10c0-3 2-4 2-7 2 2 2 4 2 7v11z" />,
        wave: "curve",
        corner: "round",
    },
    /** Soft rounded shapes — romance, slice of life, magical girls. */
    petal: {
        play: <path d="M7 4.3c0-1.1 1.2-1.7 2.1-1.1l10.6 7.6c.8.6.8 1.8 0 2.4L9.1 20.8C8.2 21.4 7 20.8 7 19.7z" />,
        pause: <path d="M5 5a2 2 0 0 1 4 0v14a2 2 0 0 1-4 0zM15 5a2 2 0 0 1 4 0v14a2 2 0 0 1-4 0z" />,
        wave: "dots",
        corner: "round",
    },
    /** Twinkles — idols, space opera, magic. */
    star: {
        play: <path d="M8.5 4L21 12 8.5 20zM4 2l.9 2 2 .9-2 .9L4 7.8l-.9-2-2-.9 2-.9z" />,
        pause: <path d="M6 5h3.5v15H6zM14.5 5H18v15h-3.5zM12 0.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" />,
        wave: "spark",
        corner: "diamond",
    },
    /** Chamfered HUD panels — sci-fi, mecha, cyberpunk, VR. */
    hud: {
        play: <path fillRule="evenodd" d="M5 3l17 9-17 9zM7 6.4v11.2L17.6 12z" />,
        pause: <path d="M5 5l2-2h2v18H7l-2-2zM15 5l2-2h2v16l-2 2h-2z" />,
        wave: "bars",
        corner: "bracket",
    },
    /** Magic circle — sorcery, alchemy, the occult. */
    rune: {
        play: <path fillRule="evenodd" d="M12 1.5a10.5 10.5 0 1 0 0 21 10.5 10.5 0 0 0 0-21zm0 2a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM9.5 7.5v9l7.5-4.5z" />,
        pause: <path fillRule="evenodd" d="M12 1.5a10.5 10.5 0 1 0 0 21 10.5 10.5 0 0 0 0-21zm0 2a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM8.5 8h2.5v8H8.5zM13 8h2.5v8H13z" />,
        wave: "spark",
        corner: "diamond",
    },
    /** Chunky 8-bit — games, isekai, nerd comedies. */
    pixel: {
        play: <path d="M6 3h2v2h2v2h2v2h2v2h2v2h-2v2h-2v2h-2v2H8v2H6zM16 11h2v2h-2z" />,
        pause: <path d="M5 4h4v16H5zM15 4h4v16h-4z" />,
        wave: "pixel",
        corner: "pixel",
        speaker: PIXEL_SPEAKER,
    },
    /** Ink-brush strokes — period pieces, martial arts, calligraphy. */
    brush: {
        play: <path d="M6.5 3.3c1.2-.6 13.9 7.6 14 8.7.1 1.2-12.8 9.4-14 8.8-1.1-1.6-.9-15.9 0-17.5z" />,
        pause: <path d="M6.3 3.2c1-.5 2.7-.3 2.9.5.4 5.1.4 12.1 0 16.8-.4.8-2.1.9-2.9.3-.6-5.6-.6-12.2 0-17.6zM14.8 3.4c1-.6 2.7-.3 2.9.4.5 5.2.3 12-.1 16.8-.4.8-2 .8-2.8.3-.6-5.6-.6-12 0-17.5z" />,
        wave: "curve",
        corner: "round",
    },
    /** Rolling water — sea, swimming, sailing. */
    wave: {
        play: <path d="M7 3l13 9-13 9c1.6-1.5 0-3 1.5-4.5S7 13.5 8.5 12 7 9 8.5 7.5 5.5 4.5 7 3z" />,
        pause: <path d="M6 3c2 2-1 4 1 6s-1 4 1 6-1 4 1 6H6.5C5 19 7.5 17 6 15s1-4-.5-6S7 5 5.5 3zM16 3c2 2-1 4 1 6s-1 4 1 6-1 4 1 6h-2.5c-1.5-2 1-4-.5-6s1-4-.5-6S17 5 15.5 3z" />,
        wave: "curve",
        corner: "round",
    },
    /** Hearts — love comedies, shoujo. */
    heart: {
        play: <path d="M9 4l12 8-12 8zM4.5 9.2c.9-1.3 2.9-.6 2.9 1 0 1.8-2.9 3.6-2.9 3.6s-2.9-1.8-2.9-3.6c0-1.6 2-2.3 2.9-1z" />,
        pause: <path d="M5.5 4.5a2 2 0 0 1 4 0v15a2 2 0 0 1-4 0zM14.5 4.5a2 2 0 0 1 4 0v15a2 2 0 0 1-4 0zM12 .6c.6-.9 2-.4 2 .7 0 1.2-2 2.5-2 2.5s-2-1.3-2-2.5c0-1.1 1.4-1.6 2-.7z" />,
        wave: "dots",
        corner: "round",
    },
    /** Spiked silhouettes — horror, dark fantasy, gothic. */
    thorn: {
        play: <path d="M7 3l13 9-13 9 1.5-3-3-1.5 3-2-3-2.5 3-2.5-3-2 3-1.5z" />,
        pause: <path d="M5 2l2 2 2-2v20l-2-2-2 2zM15 2l2 2 2-2v20l-2-2-2 2z" />,
        wave: "angular",
        corner: "diamond",
    },
    /** Lightning — speed, power-ups, electric heroes. */
    bolt: {
        play: <path d="M6 3l15 9-15 9 3.5-7.5H6.5L9.5 10z" />,
        pause: <path d="M9.5 2L6 12.5h3L7 22l5.5-12h-3L12 2zM17.5 2L14 12.5h3L15 22l5.5-12h-3L20 2z" />,
        wave: "angular",
        corner: "line",
    },
    /** Round bubbles — cute, kids, comfy. */
    bubble: {
        play: <path fillRule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM9.8 7.6v8.8l7-4.4z" />,
        pause: <path fillRule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8.5 8h2.6v8H8.5zm4.4 0h2.6v8h-2.6z" />,
        wave: "dots",
        corner: "round",
    },
    /** Leaves — nature, Ghibli, countryside, spirits of the forest. */
    leaf: {
        play: <><path d="M6 3c8 0 15 6 15 9s-7 9-15 9c2-6 2-12 0-18z" /><path d="M8 12h10" fill="none" stroke="black" strokeOpacity="0.25" strokeWidth="1" /></>,
        pause: <path d="M7 2c2.5 3 2.5 17 0 20-2.5-3-2.5-17 0-20zM17 2c2.5 3 2.5 17 0 20-2.5-3-2.5-17 0-20z" />,
        wave: "curve",
        corner: "round",
    },
    /** Riveted plates — steampunk, mecha workshops, sports gear. */
    gear: {
        play: <path fillRule="evenodd" d="M5 3l17 9-17 9zM8 8.2a1.2 1.2 0 1 0 0 .01zM8 15.8a1.2 1.2 0 1 0 0 .01z" />,
        pause: <path fillRule="evenodd" d="M4.5 3h5v18h-5zM7 5a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm0 12a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM14.5 3h5v18h-5zM17 5a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm0 12a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" />,
        wave: "bars",
        corner: "bracket",
    },
    /** Crescent — night, vampires, quiet melancholy. */
    moon: {
        play: <path d="M8 3.5l13 8.5-13 8.5c2.5-2.5 3.5-5.5 3.5-8.5S10.5 6 8 3.5z" />,
        pause: <path d="M8 3c-3 3-3 15 0 18H5V3zM18 3c-3 3-3 15 0 18h-3V3z" />,
        wave: "curve",
        corner: "round",
    },
}

const BESPOKE: Record<string, PlayerIconOverrides> = {
    "naruto": narutoPlayerIcons,
    "bleach": bleachPlayerIcons,
    "bleach-tybw": bleachTybwPlayerIcons,
    "one-piece": onePiecePlayerIcons,
    "dragon-ball-z": dragonBallZPlayerIcons,
    "attack-on-titan": attackOnTitanPlayerIcons,
    "my-hero-academia": myHeroAcademiaPlayerIcons,
    "demon-slayer": demonSlayerPlayerIcons,
    "jujutsu-kaisen": jujutsuKaisenPlayerIcons,
    "fullmetal-alchemist": fullmetalAlchemistPlayerIcons,
    "hunter-x-hunter": hunterXHunterPlayerIcons,
    "black-clover": blackCloverPlayerIcons,
    "fairy-tail": fairyTailPlayerIcons,
    "sword-art-online": swordArtOnlinePlayerIcons,
    "death-note": deathNotePlayerIcons,
    "cowboy-bebop": cowboyBebopPlayerIcons,
}

const BUILT: Record<string, PlayerIconOverrides> = Object.fromEntries(
    Object.entries(FAMILIES).map(([name, f]) => [name, makeFamily(name, f)]),
)

/** Every name `playerIconSet` accepts. */
export const PLAYER_ICON_SET_NAMES: string[] = [...Object.keys(BUILT), ...Object.keys(BESPOKE)]

/**
 * Resolve a `playerIconSet` name. Bespoke sets only draw some keys, so the rest are filled from
 * the family named in `fallbackFamily` (blade by default) — a themed play button next to a stock
 * fullscreen icon looks like a bug.
 */
export function resolvePlayerIconSet(name: string | undefined, fallbackFamily = "blade"): PlayerIconOverrides | undefined {
    if (!name) return undefined
    const family = BUILT[name]
    if (family) return family
    const bespoke = BESPOKE[name]
    if (bespoke) return { ...(BUILT[fallbackFamily] ?? BUILT.blade), ...bespoke }
    return undefined
}
