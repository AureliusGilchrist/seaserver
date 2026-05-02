"use client"
import React from "react"
import { atomWithStorage } from "jotai/utils"
import { useAtom } from "jotai/react"

// ── Sound Pack Definitions ────────────────────────────────────────────────────

export type SoundPack = {
    id: string
    name: string
    emoji: string
    description: string
    requiredLevel: number
}

export const SOUND_PACKS: SoundPack[] = [
    // ── Original synthesis packs (1–50) ──────────────────────────────────────
    { id: "default",      name: "Default",       emoji: "🔔", description: "Clean system sounds",              requiredLevel: 1   },
    { id: "soft",         name: "Soft",          emoji: "🍃", description: "Gentle, subtle sounds",            requiredLevel: 5   },
    { id: "retro",        name: "Retro",         emoji: "👾", description: "8-bit game sounds",               requiredLevel: 10  },
    { id: "anime",        name: "Anime",         emoji: "⭐", description: "Anime-styled sound effects",      requiredLevel: 20  },
    { id: "cosmic",       name: "Cosmic",        emoji: "🌌", description: "Space-themed atmospheric",        requiredLevel: 35  },
    { id: "bamboo",       name: "Bamboo",        emoji: "🎍", description: "Traditional Japanese sounds",     requiredLevel: 50  },
    // ── Real sounds loaded from Kenney's CC0 UI Audio library ─────────────────
    { id: "glass",        name: "Glass",         emoji: "🔮", description: "Crystal-clear glass taps",        requiredLevel: 60  },
    { id: "pebble",       name: "Pebble",        emoji: "🪨", description: "Light stone clicks",              requiredLevel: 70  },
    { id: "wood",         name: "Wood",          emoji: "🪵", description: "Warm wooden knocks",              requiredLevel: 80  },
    { id: "metal",        name: "Metal",         emoji: "⚙️", description: "Cold metallic clinks",            requiredLevel: 90  },
    { id: "spring",       name: "Spring",        emoji: "🌱", description: "Light bouncy pops",               requiredLevel: 100 },
    { id: "bubble",       name: "Bubble",        emoji: "🫧", description: "Soft rounded bubbles",            requiredLevel: 110 },
    { id: "chirp",        name: "Chirp",         emoji: "🐦", description: "Quick bright chirps",             requiredLevel: 120 },
    { id: "snap",         name: "Snap",          emoji: "✂️", description: "Sharp snapping clicks",           requiredLevel: 130 },
    { id: "tap",          name: "Tap",           emoji: "👆", description: "Clean desk taps",                 requiredLevel: 140 },
    { id: "chime",        name: "Chime",         emoji: "🔔", description: "Bell-like chimes",                requiredLevel: 150 },
    { id: "pluck",        name: "Pluck",         emoji: "🎸", description: "String plucks",                   requiredLevel: 160 },
    { id: "drum",         name: "Drum",          emoji: "🥁", description: "Percussive hits",                 requiredLevel: 170 },
    { id: "clickbox",     name: "Click Box",     emoji: "📦", description: "Satisfying box clicks",           requiredLevel: 180 },
    { id: "toggle",       name: "Toggle",        emoji: "🔘", description: "Switch toggles",                  requiredLevel: 190 },
    { id: "pop",          name: "Pop",           emoji: "🎈", description: "Crisp balloon pops",              requiredLevel: 200 },
    { id: "electro",      name: "Electro",       emoji: "⚡", description: "Electric zaps",                   requiredLevel: 210 },
    { id: "digital",      name: "Digital",       emoji: "💻", description: "Digital interface beeps",         requiredLevel: 220 },
    { id: "neon",         name: "Neon",          emoji: "💡", description: "Neon buzz and flicker",           requiredLevel: 230 },
    { id: "cyber",        name: "Cyber",         emoji: "🤖", description: "Cyberpunk interface sounds",      requiredLevel: 240 },
    { id: "matrix",       name: "Matrix",        emoji: "🟢", description: "Green code dripping",             requiredLevel: 250 },
    { id: "echo",         name: "Echo",          emoji: "🔊", description: "Reverberant echoes",              requiredLevel: 260 },
    { id: "crystal",      name: "Crystal",       emoji: "💎", description: "Singing crystal resonance",       requiredLevel: 270 },
    { id: "pixel",        name: "Pixel",         emoji: "🎮", description: "Pixelated game sounds",           requiredLevel: 280 },
    { id: "wave",         name: "Wave",          emoji: "〰️", description: "Smooth wave pulses",              requiredLevel: 290 },
    { id: "pulse",        name: "Pulse",         emoji: "💫", description: "Electronic pulse signals",        requiredLevel: 300 },
    { id: "surge",        name: "Surge",         emoji: "🔋", description: "Power surges",                   requiredLevel: 310 },
    { id: "spark",        name: "Spark",         emoji: "✨", description: "Electrical sparks",               requiredLevel: 320 },
    { id: "thunder",      name: "Thunder",       emoji: "⛈️", description: "Rolling thunder cracks",          requiredLevel: 330 },
    { id: "storm",        name: "Storm",         emoji: "🌩️", description: "Full storm ambience",             requiredLevel: 340 },
    { id: "rain",         name: "Rain",          emoji: "🌧️", description: "Rain drops on glass",             requiredLevel: 350 },
    { id: "wind",         name: "Wind",          emoji: "🌬️", description: "Wind chime cascade",              requiredLevel: 360 },
    { id: "ocean",        name: "Ocean",         emoji: "🌊", description: "Ocean wave pulses",               requiredLevel: 370 },
    { id: "fire",         name: "Fire",          emoji: "🔥", description: "Crackling fire pops",             requiredLevel: 380 },
    { id: "ice",          name: "Ice",           emoji: "❄️", description: "Icy crystal shatters",            requiredLevel: 390 },
    { id: "shadow",       name: "Shadow",        emoji: "🌑", description: "Dark ethereal whispers",          requiredLevel: 400 },
    { id: "phantom",      name: "Phantom",       emoji: "👻", description: "Ghostly apparitions",             requiredLevel: 410 },
    { id: "spirit",       name: "Spirit",        emoji: "💨", description: "Spirit energy flows",             requiredLevel: 420 },
    { id: "angel",        name: "Angel",         emoji: "👼", description: "Angelic bell tones",              requiredLevel: 430 },
    { id: "celestial",    name: "Celestial",     emoji: "⭐", description: "Celestial sphere harmonics",     requiredLevel: 440 },
    { id: "nebula",       name: "Nebula",        emoji: "🌌", description: "Nebula dust shimmer",             requiredLevel: 450 },
    { id: "galaxy",       name: "Galaxy",        emoji: "🌠", description: "Galactic whispers",               requiredLevel: 460 },
    { id: "quasar",       name: "Quasar",        emoji: "🔆", description: "Quasar energy burst",             requiredLevel: 470 },
    { id: "warp",         name: "Warp",          emoji: "🚀", description: "Warp drive engage",               requiredLevel: 480 },
    { id: "portal",       name: "Portal",        emoji: "🌀", description: "Portal open and close",           requiredLevel: 490 },
    { id: "quantum",      name: "Quantum",       emoji: "⚛️", description: "Quantum state collapse",          requiredLevel: 500 },
    { id: "circuit",      name: "Circuit",       emoji: "🔌", description: "Circuit board clicks",            requiredLevel: 510 },
    { id: "binary",       name: "Binary",        emoji: "0️⃣", description: "Binary code pulses",             requiredLevel: 520 },
    { id: "neural",       name: "Neural",        emoji: "🧠", description: "Neural network firing",           requiredLevel: 530 },
    { id: "hologram",     name: "Hologram",      emoji: "📡", description: "Holographic flickers",            requiredLevel: 540 },
    { id: "synthwave",    name: "Synthwave",     emoji: "🎹", description: "Retro synth arpeggios",           requiredLevel: 550 },
    { id: "retrowave",    name: "Retrowave",     emoji: "📻", description: "80s retro wave sounds",           requiredLevel: 560 },
    { id: "vaporwave",    name: "Vaporwave",     emoji: "🌸", description: "Dreamy vaporwave tones",          requiredLevel: 570 },
    { id: "dreamwave",    name: "Dreamwave",     emoji: "💭", description: "Drifting dream sounds",           requiredLevel: 580 },
    { id: "ambient",      name: "Ambient",       emoji: "🎵", description: "Ambient pad tones",               requiredLevel: 590 },
    { id: "lofi",         name: "Lo-fi",         emoji: "🎶", description: "Warm lo-fi clicks",               requiredLevel: 600 },
    { id: "jazz",         name: "Jazz",          emoji: "🎷", description: "Jazz-inspired stabs",             requiredLevel: 610 },
    { id: "orchestra",    name: "Orchestra",     emoji: "🎻", description: "Orchestral swells",               requiredLevel: 620 },
    { id: "epic",         name: "Epic",          emoji: "🎺", description: "Epic cinematic hits",             requiredLevel: 630 },
    { id: "legend",       name: "Legend",        emoji: "🏆", description: "Legendary hero fanfares",         requiredLevel: 640 },
    { id: "myth",         name: "Myth",          emoji: "🐉", description: "Mythical creature sounds",        requiredLevel: 650 },
    { id: "ancient",      name: "Ancient",       emoji: "🏛️", description: "Ancient rune activation",        requiredLevel: 660 },
    { id: "dragonfire",   name: "Dragon Fire",   emoji: "🔥", description: "Dragon breath igniting",          requiredLevel: 670 },
    { id: "phoenix",      name: "Phoenix",       emoji: "🦅", description: "Phoenix rising from ash",         requiredLevel: 680 },
    { id: "titan",        name: "Titan",         emoji: "🗿", description: "Titan footsteps",                 requiredLevel: 690 },
    { id: "divine",       name: "Divine",        emoji: "✨", description: "Divine light descends",           requiredLevel: 700 },
    { id: "archangel",    name: "Archangel",     emoji: "😇", description: "Archangel trumpet calls",         requiredLevel: 710 },
    { id: "cosmos",       name: "Cosmos",        emoji: "🌌", description: "The cosmos speaking",             requiredLevel: 720 },
    { id: "eternity",     name: "Eternity",      emoji: "♾️", description: "Eternal resonance",              requiredLevel: 730 },
    { id: "infinity",     name: "Infinity",      emoji: "🔄", description: "Infinite loop harmonics",         requiredLevel: 740 },
    { id: "beyond",       name: "Beyond",        emoji: "🌠", description: "Beyond all planes",              requiredLevel: 750 },
    { id: "transcend",    name: "Transcend",     emoji: "🌟", description: "Transcending existence",          requiredLevel: 760 },
    { id: "absolute",     name: "Absolute",      emoji: "💯", description: "The absolute truth",              requiredLevel: 770 },
    { id: "voidgod",      name: "Void God",      emoji: "🌑", description: "Void god awakening",              requiredLevel: 780 },
    { id: "trueform",     name: "True Form",     emoji: "💫", description: "True form revealed",              requiredLevel: 790 },
    { id: "awakening",    name: "Awakening",     emoji: "🌅", description: "Great awakening",                 requiredLevel: 800 },
    { id: "ascension",    name: "Ascension",     emoji: "🚀", description: "Final ascension",                 requiredLevel: 810 },
    { id: "enlighten",    name: "Enlightenment", emoji: "🕊️", description: "True enlightenment",             requiredLevel: 820 },
    { id: "singularity",  name: "Singularity",   emoji: "🌀", description: "The singularity point",           requiredLevel: 830 },
    { id: "omega",        name: "Omega",         emoji: "🔚", description: "The omega frequency",             requiredLevel: 840 },
    { id: "alpha",        name: "Alpha",         emoji: "🔛", description: "The alpha origin",                requiredLevel: 850 },
    { id: "genesis",      name: "Genesis",       emoji: "💥", description: "The genesis explosion",           requiredLevel: 860 },
    { id: "judgment",     name: "Judgment",      emoji: "⚖️", description: "Final judgment tone",             requiredLevel: 870 },
    { id: "apocalypse",   name: "Apocalypse",    emoji: "☄️", description: "Apocalyptic tremors",             requiredLevel: 880 },
    { id: "rebirth",      name: "Rebirth",       emoji: "🌱", description: "Rebirth from nothing",            requiredLevel: 890 },
    { id: "primordial",   name: "Primordial",    emoji: "🌍", description: "Primordial creation sound",       requiredLevel: 900 },
    { id: "celestialgod", name: "Celestial God", emoji: "🌟", description: "Celestial god speaks",            requiredLevel: 910 },
    { id: "universe",     name: "Universe",      emoji: "🌌", description: "The universe in sound",           requiredLevel: 920 },
    { id: "multiverse",   name: "Multiverse",    emoji: "🔀", description: "Multiverse harmonics",            requiredLevel: 930 },
    { id: "omniscience",  name: "Omniscience",   emoji: "👁️", description: "All-knowing resonance",          requiredLevel: 940 },
    { id: "omnipotence",  name: "Omnipotence",   emoji: "⚡", description: "Omnipotent surge",               requiredLevel: 950 },
    { id: "creation",     name: "Creation",      emoji: "🌟", description: "The act of creation itself",      requiredLevel: 960 },
    { id: "destruction",  name: "Destruction",   emoji: "💥", description: "Total destruction wave",          requiredLevel: 970 },
    { id: "balance",      name: "Balance",       emoji: "⚖️", description: "Perfect cosmic balance",          requiredLevel: 980 },
    { id: "transcendent", name: "Transcendent",  emoji: "✨", description: "Beyond all comprehension",        requiredLevel: 990 },
]

type SoundName = "buttonClick" | "itemUnlock" | "notification" | "error" | "success"

// ── Web Audio synthesis (used by original 6 packs + synthesis fallback) ───────

function createBeep(
    ctx: AudioContext,
    freq: number,
    duration: number,
    type: OscillatorType = "sine",
    gain = 0.15,
) {
    const osc = ctx.createOscillator()
    const gainNode = ctx.createGain()
    osc.connect(gainNode)
    gainNode.connect(ctx.destination)
    osc.type = type
    osc.frequency.setValueAtTime(freq, ctx.currentTime)
    gainNode.gain.setValueAtTime(gain, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration)
}

// ── Kenney UI Audio — CC0 sounds downloaded at runtime ───────────────────────
// Source: https://gamesounds.xyz (mirror of kenney.nl/assets/ui-audio, CC0)
// Files: click1-5.ogg, switch1-38.ogg, rollover1-6.ogg, mouseclick1.ogg, mouserelease1.ogg

const K_BASE = "https://gamesounds.xyz/Kenney%27s%20Sound%20Pack/UI%20Audio"
const _bufCache = new Map<string, AudioBuffer | null | "pending">()

function _loadPlay(ctx: AudioContext, file: string, rate: number, vol: number, delayMs = 0) {
    const url = `${K_BASE}/${file}`
    const cached = _bufCache.get(url)

    const doPlay = (buf: AudioBuffer) => {
        try {
            const src = ctx.createBufferSource()
            const g = ctx.createGain()
            src.buffer = buf
            src.playbackRate.value = Math.max(0.1, rate)
            g.gain.value = Math.min(vol * 1.15, 1.0)
            src.connect(g)
            g.connect(ctx.destination)
            if (delayMs > 0) {
                setTimeout(() => { try { src.start() } catch {} }, delayMs)
            } else {
                src.start()
            }
        } catch { /* audio context may have been closed */ }
    }

    if (cached instanceof AudioBuffer) { doPlay(cached); return }
    if (cached === null) {
        // URL failed — synthesize a quiet fallback tick
        createBeep(ctx, 440 * rate, 0.05, "sine", vol * 0.08)
        return
    }
    if (cached === "pending") return // already fetching

    _bufCache.set(url, "pending")
    fetch(url)
        .then(r => { if (!r.ok) throw new Error("404"); return r.arrayBuffer() })
        .then(arr => ctx.decodeAudioData(arr))
        .then(buf => { _bufCache.set(url, buf); doPlay(buf) })
        .catch(() => {
            _bufCache.set(url, null)
            createBeep(ctx, 440 * rate, 0.05, "sine", vol * 0.08)
        })
}

type PackSoundFn = (ctx: AudioContext, vol: number) => void

/** Play a single Kenney sound file at a given rate */
function u(file: string, rate = 1.0, delay = 0): PackSoundFn {
    return (ctx, vol) => _loadPlay(ctx, file, rate, vol, delay)
}
/** Play two sounds in sequence */
function u2(f1: string, r1: number, f2: string, r2: number, gap = 80): PackSoundFn {
    return (ctx, vol) => {
        _loadPlay(ctx, f1, r1, vol)
        _loadPlay(ctx, f2, r2, vol, gap)
    }
}
/** Play three sounds in sequence */
function u3(f1: string, r1: number, f2: string, r2: number, f3: string, r3: number, gap = 80): PackSoundFn {
    return (ctx, vol) => {
        _loadPlay(ctx, f1, r1, vol)
        _loadPlay(ctx, f2, r2, vol, gap)
        _loadPlay(ctx, f3, r3, vol, gap * 2)
    }
}
/** Ascending arpeggio of one file at escalating rates */
function uArp(file: string, baseRate: number, steps: number, stepRatio = 1.25, gap = 80): PackSoundFn {
    return (ctx, vol) => {
        for (let i = 0; i < steps; i++) {
            _loadPlay(ctx, file, baseRate * Math.pow(stepRatio, i), vol, i * gap)
        }
    }
}
/** Descending arpeggio */
function uDesc(file: string, baseRate: number, steps: number, ratio = 0.8, gap = 80): PackSoundFn {
    return (ctx, vol) => {
        for (let i = 0; i < steps; i++) {
            _loadPlay(ctx, file, baseRate * Math.pow(ratio, i), vol, i * gap)
        }
    }
}

// ── All pack sounds ───────────────────────────────────────────────────────────

const PACK_SOUNDS: Record<string, Record<SoundName, PackSoundFn>> = {
    // ── Original 6 synthesis packs ────────────────────────────────────────────
    default: {
        buttonClick:  (ctx, v) => createBeep(ctx, 880, 0.06, "sine", v * 0.12),
        itemUnlock:   (ctx, v) => { createBeep(ctx, 660, 0.1, "sine", v * 0.15); setTimeout(() => createBeep(ctx, 880, 0.15, "sine", v * 0.15), 80) },
        notification: (ctx, v) => { createBeep(ctx, 523, 0.12, "sine", v * 0.13); setTimeout(() => createBeep(ctx, 659, 0.12, "sine", v * 0.13), 120) },
        error:        (ctx, v) => createBeep(ctx, 220, 0.2, "sawtooth", v * 0.1),
        success:      (ctx, v) => { createBeep(ctx, 660, 0.1, "sine", v * 0.14); setTimeout(() => createBeep(ctx, 880, 0.15, "sine", v * 0.14), 100) },
    },
    soft: {
        buttonClick:  (ctx, v) => createBeep(ctx, 700, 0.08, "sine", v * 0.07),
        itemUnlock:   (ctx, v) => { createBeep(ctx, 523, 0.12, "sine", v * 0.09); setTimeout(() => createBeep(ctx, 784, 0.18, "sine", v * 0.09), 100) },
        notification: (ctx, v) => createBeep(ctx, 587, 0.2, "sine", v * 0.08),
        error:        (ctx, v) => createBeep(ctx, 311, 0.15, "sine", v * 0.07),
        success:      (ctx, v) => { createBeep(ctx, 523, 0.1, "sine", v * 0.08); setTimeout(() => createBeep(ctx, 659, 0.2, "sine", v * 0.08), 120) },
    },
    retro: {
        buttonClick:  (ctx, v) => createBeep(ctx, 440, 0.05, "square", v * 0.1),
        itemUnlock:   (ctx, v) => [0,1,2].forEach(i => setTimeout(() => createBeep(ctx, 330 + i * 110, 0.08, "square", v * 0.12), i * 60)),
        notification: (ctx, v) => createBeep(ctx, 660, 0.1, "square", v * 0.1),
        error:        (ctx, v) => createBeep(ctx, 110, 0.15, "square", v * 0.12),
        success:      (ctx, v) => [0,1,2].forEach(i => setTimeout(() => createBeep(ctx, 440 + i * 110, 0.1, "square", v * 0.12), i * 80)),
    },
    anime: {
        buttonClick:  (ctx, v) => createBeep(ctx, 1047, 0.05, "sine", v * 0.1),
        itemUnlock:   (ctx, v) => [0,1,2,3].forEach(i => setTimeout(() => createBeep(ctx, 523 * Math.pow(1.2, i), 0.1, "sine", v * 0.14), i * 70)),
        notification: (ctx, v) => { createBeep(ctx, 784, 0.1, "sine", v * 0.12); setTimeout(() => createBeep(ctx, 1047, 0.15, "sine", v * 0.12), 100) },
        error:        (ctx, v) => createBeep(ctx, 277, 0.18, "triangle", v * 0.1),
        success:      (ctx, v) => [0,1,2].forEach(i => setTimeout(() => createBeep(ctx, [523,659,784][i], 0.12, "sine", v * 0.14), i * 90)),
    },
    cosmic: {
        buttonClick:  (ctx, v) => createBeep(ctx, 200, 0.12, "triangle", v * 0.09),
        itemUnlock:   (ctx, v) => { createBeep(ctx, 110, 0.3, "sine", v * 0.08); setTimeout(() => createBeep(ctx, 440, 0.2, "sine", v * 0.12), 100) },
        notification: (ctx, v) => createBeep(ctx, 330, 0.25, "triangle", v * 0.1),
        error:        (ctx, v) => createBeep(ctx, 55, 0.3, "sawtooth", v * 0.08),
        success:      (ctx, v) => [0,1].forEach(i => setTimeout(() => createBeep(ctx, 220 * (i + 1), 0.2, "sine", v * 0.1), i * 150)),
    },
    bamboo: {
        buttonClick:  (ctx, v) => createBeep(ctx, 1200, 0.04, "triangle", v * 0.08),
        itemUnlock:   (ctx, v) => [0,1,2].forEach(i => setTimeout(() => createBeep(ctx, 800 + i * 200, 0.06, "triangle", v * 0.1), i * 80)),
        notification: (ctx, v) => { createBeep(ctx, 1000, 0.06, "triangle", v * 0.09); setTimeout(() => createBeep(ctx, 800, 0.08, "triangle", v * 0.09), 100) },
        error:        (ctx, v) => createBeep(ctx, 400, 0.12, "triangle", v * 0.08),
        success:      (ctx, v) => [0,1,2].forEach(i => setTimeout(() => createBeep(ctx, 600 + i * 300, 0.07, "triangle", v * 0.09), i * 90)),
    },

    // ── Kenney CC0 packs (levels 60–990) ─────────────────────────────────────
    // click1-5.ogg   = clean UI clicks (high)
    // switch1-38.ogg = satisfying switch/toggle sounds (varied)
    // rollover1-6.ogg = soft hover chimes
    // mouseclick1.ogg, mouserelease1.ogg = mouse sounds

    glass:       { buttonClick: u("click1.ogg",2.0), itemUnlock: u2("switch3.ogg",2.0,"switch3.ogg",2.5,110), notification: u("rollover1.ogg",2.0), error: u("switch2.ogg",0.7), success: u3("click2.ogg",1.8,"click2.ogg",2.1,"click2.ogg",2.4,80) },
    pebble:      { buttonClick: u("click3.ogg",1.5), itemUnlock: u2("switch5.ogg",1.2,"switch5.ogg",1.6,90),  notification: u("rollover2.ogg",1.4), error: u("switch4.ogg",0.6), success: u3("click4.ogg",1.3,"click4.ogg",1.6,"click4.ogg",1.9,90) },
    wood:        { buttonClick: u("switch1.ogg",0.7), itemUnlock: u2("switch1.ogg",0.6,"switch1.ogg",0.8,100), notification: u("rollover3.ogg",0.9), error: u("switch6.ogg",0.5), success: u3("switch2.ogg",0.7,"switch2.ogg",0.9,"switch2.ogg",1.1,100) },
    metal:       { buttonClick: u("switch7.ogg",1.2), itemUnlock: u2("switch8.ogg",1.0,"switch8.ogg",1.4,80),  notification: u("rollover4.ogg",1.1), error: u("switch9.ogg",0.5), success: u3("switch10.ogg",1.1,"switch10.ogg",1.3,"switch10.ogg",1.6,80) },
    spring:      { buttonClick: u("click5.ogg",1.8), itemUnlock: u2("switch11.ogg",1.5,"switch11.ogg",1.9,90), notification: u("rollover5.ogg",1.5), error: u("switch12.ogg",0.7), success: u3("click1.ogg",1.5,"click1.ogg",1.8,"click1.ogg",2.1,85) },
    bubble:      { buttonClick: u("switch13.ogg",1.6), itemUnlock: u2("switch14.ogg",1.3,"switch14.ogg",1.7,100), notification: u("rollover6.ogg",1.6), error: u("switch15.ogg",0.6), success: u3("switch13.ogg",1.4,"switch13.ogg",1.7,"switch13.ogg",2.0,90) },
    chirp:       { buttonClick: u("click2.ogg",2.2), itemUnlock: uArp("click2.ogg",1.8,3,1.2,80), notification: u("rollover1.ogg",2.2), error: u("switch16.ogg",0.7), success: uArp("click2.ogg",1.6,4,1.15,70) },
    snap:        { buttonClick: u("mouseclick1.ogg",1.5), itemUnlock: u2("mouseclick1.ogg",1.3,"mouserelease1.ogg",1.8,100), notification: u("rollover2.ogg",1.7), error: u("switch17.ogg",0.5), success: u3("mouseclick1.ogg",1.4,"mouseclick1.ogg",1.7,"mouserelease1.ogg",2.0,80) },
    tap:         { buttonClick: u("click4.ogg",1.1), itemUnlock: u2("switch18.ogg",1.0,"switch18.ogg",1.3,90), notification: u("rollover3.ogg",1.1), error: u("switch19.ogg",0.6), success: u3("click3.ogg",1.0,"click3.ogg",1.2,"click3.ogg",1.5,100) },
    chime:       { buttonClick: u("rollover1.ogg",1.9), itemUnlock: uArp("rollover2.ogg",1.5,4,1.2,100), notification: u("rollover3.ogg",1.7), error: u("switch20.ogg",0.6), success: uArp("rollover1.ogg",1.4,4,1.18,90) },
    pluck:       { buttonClick: u("switch21.ogg",1.3), itemUnlock: uArp("switch21.ogg",1.0,3,1.25,90), notification: u("rollover4.ogg",1.3), error: u("switch22.ogg",0.5), success: u3("switch21.ogg",1.1,"switch21.ogg",1.4,"switch21.ogg",1.7,90) },
    drum:        { buttonClick: u("switch23.ogg",0.9), itemUnlock: u2("switch23.ogg",0.8,"switch24.ogg",1.1,90), notification: u("rollover5.ogg",0.9), error: u("switch25.ogg",0.4), success: u3("switch23.ogg",0.9,"switch24.ogg",1.0,"switch25.ogg",1.2,80) },
    clickbox:    { buttonClick: u("mouseclick1.ogg",1.0), itemUnlock: u2("mouseclick1.ogg",0.9,"mouserelease1.ogg",1.2,120), notification: u("rollover6.ogg",1.2), error: u("switch26.ogg",0.6), success: u3("mouseclick1.ogg",1.0,"mouseclick1.ogg",1.2,"mouserelease1.ogg",1.5,100) },
    toggle:      { buttonClick: u("switch27.ogg",1.0), itemUnlock: u2("switch27.ogg",0.9,"switch28.ogg",1.2,100), notification: u("rollover1.ogg",1.2), error: u("switch29.ogg",0.5), success: u3("switch27.ogg",1.0,"switch28.ogg",1.2,"switch29.ogg",1.5,90) },
    pop:         { buttonClick: u("switch30.ogg",1.8), itemUnlock: u2("switch30.ogg",1.5,"switch31.ogg",2.0,80), notification: u("rollover2.ogg",1.8), error: u("switch32.ogg",0.6), success: u3("switch30.ogg",1.6,"switch30.ogg",1.9,"switch31.ogg",2.2,75) },
    electro:     { buttonClick: u("switch33.ogg",1.4), itemUnlock: u2("switch33.ogg",1.2,"switch34.ogg",1.6,80), notification: u("rollover3.ogg",1.5), error: u("switch35.ogg",0.5), success: uArp("switch33.ogg",1.2,3,1.3,80) },
    digital:     { buttonClick: u("click1.ogg",1.3), itemUnlock: u2("switch36.ogg",1.1,"switch36.ogg",1.5,90), notification: u("rollover4.ogg",1.4), error: u("switch37.ogg",0.6), success: u3("switch36.ogg",1.2,"switch36.ogg",1.5,"switch36.ogg",1.8,85) },
    neon:        { buttonClick: u("switch38.ogg",1.5), itemUnlock: u2("switch38.ogg",1.3,"switch1.ogg",1.8,80), notification: u("rollover5.ogg",1.6), error: u("switch2.ogg",0.5), success: u3("switch38.ogg",1.4,"switch1.ogg",1.7,"switch2.ogg",2.0,80) },
    cyber:       { buttonClick: u("switch3.ogg",1.6), itemUnlock: uArp("switch3.ogg",1.2,4,1.2,75), notification: u("rollover6.ogg",1.7), error: u("switch4.ogg",0.5), success: uArp("switch3.ogg",1.3,4,1.18,75) },
    matrix:      { buttonClick: u("click2.ogg",1.0), itemUnlock: u2("switch5.ogg",1.0,"switch5.ogg",1.4,90), notification: u("rollover1.ogg",1.0), error: u("switch6.ogg",0.4), success: uArp("click2.ogg",0.9,4,1.2,80) },
    echo:        { buttonClick: u("switch7.ogg",0.8), itemUnlock: u3("switch7.ogg",0.8,"switch7.ogg",0.9,"switch7.ogg",1.0,150), notification: u("rollover2.ogg",0.9), error: u("switch8.ogg",0.4), success: u3("switch7.ogg",0.8,"switch7.ogg",1.0,"switch7.ogg",1.2,130) },
    crystal:     { buttonClick: u("click3.ogg",2.4), itemUnlock: uArp("click3.ogg",2.0,4,1.15,90), notification: u("rollover3.ogg",2.2), error: u("switch9.ogg",0.6), success: uArp("click3.ogg",1.8,5,1.12,80) },
    pixel:       { buttonClick: u("switch10.ogg",1.7), itemUnlock: uArp("switch10.ogg",1.4,3,1.25,70), notification: u("rollover4.ogg",1.8), error: u("switch11.ogg",0.5), success: uArp("switch10.ogg",1.3,4,1.2,70) },
    wave:        { buttonClick: u("switch12.ogg",1.0), itemUnlock: u2("switch12.ogg",0.9,"switch12.ogg",1.2,120), notification: u("rollover5.ogg",1.0), error: u("switch13.ogg",0.4), success: u3("switch12.ogg",1.0,"switch12.ogg",1.2,"switch12.ogg",1.5,110) },
    pulse:       { buttonClick: u("switch14.ogg",1.3), itemUnlock: u2("switch14.ogg",1.1,"switch15.ogg",1.5,90), notification: u("rollover6.ogg",1.3), error: u("switch16.ogg",0.5), success: uArp("switch14.ogg",1.1,4,1.2,85) },
    surge:       { buttonClick: u("switch17.ogg",1.5), itemUnlock: uArp("switch17.ogg",1.2,4,1.2,80), notification: u("rollover1.ogg",1.5), error: u("switch18.ogg",0.4), success: uArp("switch17.ogg",1.3,4,1.22,80) },
    spark:       { buttonClick: u("click4.ogg",2.0), itemUnlock: uArp("click4.ogg",1.7,4,1.18,75), notification: u("rollover2.ogg",2.0), error: u("switch19.ogg",0.5), success: uArp("click4.ogg",1.6,5,1.15,75) },
    thunder:     { buttonClick: u("switch20.ogg",0.6), itemUnlock: u2("switch20.ogg",0.5,"switch21.ogg",0.7,120), notification: u("rollover3.ogg",0.7), error: u("switch22.ogg",0.3), success: u3("switch20.ogg",0.5,"switch20.ogg",0.7,"switch21.ogg",0.9,120) },
    storm:       { buttonClick: u("switch23.ogg",0.7), itemUnlock: u3("switch23.ogg",0.6,"switch24.ogg",0.8,"switch25.ogg",1.0,110), notification: u("rollover4.ogg",0.7), error: u("switch26.ogg",0.3), success: uArp("switch23.ogg",0.6,4,1.25,110) },
    rain:        { buttonClick: u("click5.ogg",1.6), itemUnlock: uArp("click5.ogg",1.3,4,1.2,100), notification: u("rollover5.ogg",1.5), error: u("switch27.ogg",0.5), success: uArp("click5.ogg",1.2,5,1.15,90) },
    wind:        { buttonClick: u("rollover1.ogg",1.4), itemUnlock: uArp("rollover1.ogg",1.2,4,1.2,110), notification: u("rollover2.ogg",1.3), error: u("switch28.ogg",0.4), success: uArp("rollover1.ogg",1.1,5,1.15,100) },
    ocean:       { buttonClick: u("switch29.ogg",0.9), itemUnlock: u2("switch29.ogg",0.8,"switch30.ogg",1.0,130), notification: u("rollover3.ogg",0.9), error: u("switch31.ogg",0.4), success: u3("switch29.ogg",0.8,"switch29.ogg",1.0,"switch30.ogg",1.2,120) },
    fire:        { buttonClick: u("switch32.ogg",0.8), itemUnlock: u2("switch32.ogg",0.7,"switch33.ogg",1.0,100), notification: u("rollover4.ogg",0.8), error: u("switch34.ogg",0.3), success: u3("switch32.ogg",0.7,"switch33.ogg",0.9,"switch34.ogg",1.1,100) },
    ice:         { buttonClick: u("click1.ogg",2.5), itemUnlock: uArp("click1.ogg",2.2,4,1.1,90), notification: u("rollover5.ogg",2.3), error: u("switch35.ogg",0.6), success: uArp("click1.ogg",2.0,5,1.1,85) },
    shadow:      { buttonClick: u("switch36.ogg",0.5), itemUnlock: u2("switch36.ogg",0.4,"switch37.ogg",0.6,140), notification: u("rollover6.ogg",0.5), error: u("switch38.ogg",0.2), success: u3("switch36.ogg",0.4,"switch36.ogg",0.6,"switch37.ogg",0.8,130) },
    phantom:     { buttonClick: u("switch1.ogg",0.6), itemUnlock: u2("switch1.ogg",0.5,"switch2.ogg",0.7,130), notification: u("rollover1.ogg",0.6), error: u("switch3.ogg",0.3), success: u3("switch1.ogg",0.5,"switch1.ogg",0.7,"switch2.ogg",0.9,130) },
    spirit:      { buttonClick: u("rollover2.ogg",0.8), itemUnlock: uArp("rollover2.ogg",0.7,4,1.2,130), notification: u("rollover3.ogg",0.8), error: u("switch4.ogg",0.3), success: uArp("rollover2.ogg",0.6,5,1.18,120) },
    angel:       { buttonClick: u("rollover4.ogg",2.0), itemUnlock: uArp("rollover4.ogg",1.7,4,1.18,110), notification: u("rollover5.ogg",1.9), error: u("switch5.ogg",0.5), success: uArp("rollover4.ogg",1.6,5,1.15,100) },
    celestial:   { buttonClick: u("click2.ogg",2.8), itemUnlock: uArp("click2.ogg",2.3,5,1.12,90), notification: u("rollover6.ogg",2.5), error: u("switch6.ogg",0.5), success: uArp("click2.ogg",2.0,6,1.1,80) },
    nebula:      { buttonClick: u("switch7.ogg",1.4), itemUnlock: uArp("switch7.ogg",1.1,5,1.2,90), notification: u("rollover1.ogg",1.5), error: u("switch8.ogg",0.4), success: uArp("switch7.ogg",1.0,6,1.18,85) },
    galaxy:      { buttonClick: u("switch9.ogg",1.6), itemUnlock: uArp("switch9.ogg",1.3,5,1.2,85), notification: u("rollover2.ogg",1.6), error: u("switch10.ogg",0.4), success: uArp("switch9.ogg",1.2,6,1.15,80) },
    quasar:      { buttonClick: u("switch11.ogg",1.8), itemUnlock: uArp("switch11.ogg",1.4,5,1.22,85), notification: u("rollover3.ogg",1.8), error: u("switch12.ogg",0.4), success: uArp("switch11.ogg",1.3,6,1.18,80) },
    warp:        { buttonClick: u("switch13.ogg",2.0), itemUnlock: uArp("switch13.ogg",1.6,5,1.22,80), notification: u("rollover4.ogg",1.9), error: u("switch14.ogg",0.3), success: uArp("switch13.ogg",1.5,6,1.18,75) },
    portal:      { buttonClick: u("switch15.ogg",0.7), itemUnlock: u3("switch15.ogg",0.6,"switch16.ogg",0.9,"switch17.ogg",1.2,110), notification: u("rollover5.ogg",0.7), error: u("switch18.ogg",0.3), success: u3("switch15.ogg",0.7,"switch16.ogg",1.0,"switch17.ogg",1.4,100) },
    quantum:     { buttonClick: u("click3.ogg",1.9), itemUnlock: uArp("click3.ogg",1.5,5,1.2,85), notification: u("rollover6.ogg",1.9), error: u("switch19.ogg",0.5), success: uArp("click3.ogg",1.4,6,1.15,80) },
    circuit:     { buttonClick: u("switch20.ogg",1.3), itemUnlock: uArp("switch20.ogg",1.1,5,1.2,80), notification: u("rollover1.ogg",1.3), error: u("switch21.ogg",0.4), success: uArp("switch20.ogg",1.0,6,1.18,80) },
    binary:      { buttonClick: u("switch22.ogg",1.5), itemUnlock: uArp("switch22.ogg",1.2,5,1.2,80), notification: u("rollover2.ogg",1.5), error: u("switch23.ogg",0.4), success: uArp("switch22.ogg",1.1,6,1.18,75) },
    neural:      { buttonClick: u("switch24.ogg",1.7), itemUnlock: uArp("switch24.ogg",1.3,5,1.22,80), notification: u("rollover3.ogg",1.7), error: u("switch25.ogg",0.4), success: uArp("switch24.ogg",1.2,6,1.18,75) },
    hologram:    { buttonClick: u("switch26.ogg",1.4), itemUnlock: uArp("switch26.ogg",1.1,5,1.2,80), notification: u("rollover4.ogg",1.4), error: u("switch27.ogg",0.4), success: uArp("switch26.ogg",1.0,6,1.18,80) },
    synthwave:   { buttonClick: u("click4.ogg",1.4), itemUnlock: uArp("click4.ogg",1.1,5,1.2,90), notification: u("rollover5.ogg",1.4), error: u("switch28.ogg",0.5), success: uArp("click4.ogg",1.0,6,1.18,85) },
    retrowave:   { buttonClick: u("switch29.ogg",1.3), itemUnlock: uArp("switch29.ogg",1.0,5,1.2,90), notification: u("rollover6.ogg",1.3), error: u("switch30.ogg",0.4), success: uArp("switch29.ogg",0.9,6,1.18,85) },
    vaporwave:   { buttonClick: u("rollover1.ogg",1.7), itemUnlock: uArp("rollover1.ogg",1.4,5,1.18,100), notification: u("rollover2.ogg",1.7), error: u("switch31.ogg",0.4), success: uArp("rollover1.ogg",1.3,6,1.15,95) },
    dreamwave:   { buttonClick: u("rollover3.ogg",1.5), itemUnlock: uArp("rollover3.ogg",1.2,5,1.18,110), notification: u("rollover4.ogg",1.5), error: u("switch32.ogg",0.4), success: uArp("rollover3.ogg",1.1,6,1.15,100) },
    ambient:     { buttonClick: u("rollover5.ogg",1.2), itemUnlock: uArp("rollover5.ogg",1.0,5,1.18,120), notification: u("rollover6.ogg",1.2), error: u("switch33.ogg",0.4), success: uArp("rollover5.ogg",0.9,6,1.15,110) },
    lofi:        { buttonClick: u("click5.ogg",0.9), itemUnlock: u2("click5.ogg",0.8,"switch34.ogg",1.1,120), notification: u("rollover1.ogg",0.9), error: u("switch35.ogg",0.4), success: u3("click5.ogg",0.8,"click5.ogg",1.0,"switch34.ogg",1.3,110) },
    jazz:        { buttonClick: u("switch36.ogg",1.1), itemUnlock: u3("switch36.ogg",1.0,"switch37.ogg",1.2,"switch38.ogg",1.5,100), notification: u("rollover2.ogg",1.1), error: u("switch1.ogg",0.4), success: uArp("switch36.ogg",1.0,5,1.2,100) },
    orchestra:   { buttonClick: u("switch2.ogg",0.8), itemUnlock: u3("switch2.ogg",0.7,"switch3.ogg",0.9,"switch4.ogg",1.1,110), notification: u("rollover3.ogg",0.8), error: u("switch5.ogg",0.3), success: uArp("switch2.ogg",0.7,5,1.2,110) },
    epic:        { buttonClick: u("switch6.ogg",0.7), itemUnlock: u3("switch6.ogg",0.6,"switch7.ogg",0.8,"switch8.ogg",1.0,110), notification: u("rollover4.ogg",0.7), error: u("switch9.ogg",0.3), success: uArp("switch6.ogg",0.6,5,1.22,110) },
    legend:      { buttonClick: u("click1.ogg",1.7), itemUnlock: uArp("click1.ogg",1.4,6,1.15,90), notification: u("rollover5.ogg",1.8), error: u("switch10.ogg",0.4), success: uArp("click1.ogg",1.3,7,1.13,85) },
    myth:        { buttonClick: u("switch11.ogg",0.9), itemUnlock: u3("switch11.ogg",0.8,"switch12.ogg",1.0,"switch13.ogg",1.3,110), notification: u("rollover6.ogg",0.9), error: u("switch14.ogg",0.3), success: uArp("switch11.ogg",0.8,6,1.2,110) },
    ancient:     { buttonClick: u("switch15.ogg",0.6), itemUnlock: u3("switch15.ogg",0.5,"switch16.ogg",0.7,"switch17.ogg",0.9,130), notification: u("rollover1.ogg",0.6), error: u("switch18.ogg",0.2), success: uArp("switch15.ogg",0.5,6,1.2,130) },
    dragonfire:  { buttonClick: u("switch19.ogg",0.5), itemUnlock: u3("switch19.ogg",0.4,"switch20.ogg",0.6,"switch21.ogg",0.8,120), notification: u("rollover2.ogg",0.5), error: u("switch22.ogg",0.2), success: uArp("switch19.ogg",0.4,6,1.22,120) },
    phoenix:     { buttonClick: u("click2.ogg",2.5), itemUnlock: uArp("click2.ogg",2.0,6,1.15,90), notification: u("rollover3.ogg",2.4), error: u("switch23.ogg",0.4), success: uArp("click2.ogg",1.8,7,1.12,85) },
    titan:       { buttonClick: u("switch24.ogg",0.4), itemUnlock: u2("switch24.ogg",0.3,"switch25.ogg",0.5,150), notification: u("rollover4.ogg",0.4), error: u("switch26.ogg",0.2), success: u3("switch24.ogg",0.3,"switch24.ogg",0.5,"switch25.ogg",0.7,140) },
    divine:      { buttonClick: u("rollover5.ogg",2.2), itemUnlock: uArp("rollover5.ogg",1.8,6,1.15,100), notification: u("rollover6.ogg",2.1), error: u("switch27.ogg",0.4), success: uArp("rollover5.ogg",1.7,7,1.12,95) },
    archangel:   { buttonClick: u("click3.ogg",2.8), itemUnlock: uArp("click3.ogg",2.2,6,1.13,90), notification: u("rollover1.ogg",2.7), error: u("switch28.ogg",0.4), success: uArp("click3.ogg",2.0,7,1.1,85) },
    cosmos:      { buttonClick: u("switch29.ogg",0.5), itemUnlock: u3("switch29.ogg",0.4,"switch30.ogg",0.6,"switch31.ogg",0.8,140), notification: u("rollover2.ogg",0.5), error: u("switch32.ogg",0.2), success: uArp("switch29.ogg",0.4,7,1.2,130) },
    eternity:    { buttonClick: u("rollover3.ogg",0.7), itemUnlock: uArp("rollover3.ogg",0.6,7,1.18,120), notification: u("rollover4.ogg",0.7), error: u("switch33.ogg",0.3), success: uArp("rollover3.ogg",0.5,8,1.15,110) },
    infinity:    { buttonClick: u("switch34.ogg",1.0), itemUnlock: uArp("switch34.ogg",0.8,7,1.2,110), notification: u("rollover5.ogg",1.0), error: u("switch35.ogg",0.3), success: uArp("switch34.ogg",0.7,8,1.18,100) },
    beyond:      { buttonClick: u("click4.ogg",3.0), itemUnlock: uArp("click4.ogg",2.4,7,1.12,90), notification: u("rollover6.ogg",2.8), error: u("switch36.ogg",0.4), success: uArp("click4.ogg",2.2,8,1.1,85) },
    transcend:   { buttonClick: u("switch37.ogg",1.8), itemUnlock: uArp("switch37.ogg",1.4,7,1.2,90), notification: u("rollover1.ogg",1.9), error: u("switch38.ogg",0.3), success: uArp("switch37.ogg",1.3,8,1.15,85) },
    absolute:    { buttonClick: u("click5.ogg",2.2), itemUnlock: uArp("click5.ogg",1.8,7,1.15,90), notification: u("rollover2.ogg",2.2), error: u("switch1.ogg",0.3), success: uArp("click5.ogg",1.7,8,1.12,85) },
    voidgod:     { buttonClick: u("switch2.ogg",0.3), itemUnlock: u3("switch2.ogg",0.2,"switch3.ogg",0.35,"switch4.ogg",0.5,160), notification: u("rollover3.ogg",0.3), error: u("switch5.ogg",0.15), success: uArp("switch2.ogg",0.2,8,1.22,150) },
    trueform:    { buttonClick: u("rollover4.ogg",2.5), itemUnlock: uArp("rollover4.ogg",2.0,7,1.15,95), notification: u("rollover5.ogg",2.4), error: u("switch6.ogg",0.3), success: uArp("rollover4.ogg",1.9,8,1.12,90) },
    awakening:   { buttonClick: u("switch7.ogg",1.9), itemUnlock: uArp("switch7.ogg",1.5,8,1.18,90), notification: u("rollover6.ogg",2.0), error: u("switch8.ogg",0.3), success: uArp("switch7.ogg",1.4,9,1.14,85) },
    ascension:   { buttonClick: u("click1.ogg",2.0), itemUnlock: uArp("click1.ogg",1.6,8,1.15,90), notification: u("rollover1.ogg",2.1), error: u("switch9.ogg",0.3), success: uArp("click1.ogg",1.5,9,1.12,85) },
    enlighten:   { buttonClick: u("rollover2.ogg",2.8), itemUnlock: uArp("rollover2.ogg",2.2,8,1.12,95), notification: u("rollover3.ogg",2.7), error: u("switch10.ogg",0.3), success: uArp("rollover2.ogg",2.1,9,1.1,90) },
    singularity: { buttonClick: u("switch11.ogg",0.4), itemUnlock: u3("switch11.ogg",0.3,"switch12.ogg",0.5,"switch13.ogg",0.7,150), notification: u("rollover4.ogg",0.4), error: u("switch14.ogg",0.15), success: uArp("switch11.ogg",0.3,9,1.2,140) },
    omega:       { buttonClick: u("switch15.ogg",0.3), itemUnlock: u3("switch15.ogg",0.25,"switch16.ogg",0.4,"switch17.ogg",0.6,160), notification: u("rollover5.ogg",0.3), error: u("switch18.ogg",0.12), success: uArp("switch15.ogg",0.25,9,1.22,150) },
    alpha:       { buttonClick: u("click2.ogg",3.5), itemUnlock: uArp("click2.ogg",2.8,8,1.12,85), notification: u("rollover6.ogg",3.2), error: u("switch19.ogg",0.3), success: uArp("click2.ogg",2.6,9,1.1,80) },
    genesis:     { buttonClick: u("switch20.ogg",0.35), itemUnlock: u3("switch20.ogg",0.3,"switch21.ogg",0.45,"switch22.ogg",0.65,150), notification: u("rollover1.ogg",0.35), error: u("switch23.ogg",0.15), success: uArp("switch20.ogg",0.28,9,1.22,140) },
    judgment:    { buttonClick: u("switch24.ogg",0.5), itemUnlock: u3("switch24.ogg",0.4,"switch25.ogg",0.6,"switch26.ogg",0.85,140), notification: u("rollover2.ogg",0.5), error: u("switch27.ogg",0.2), success: uArp("switch24.ogg",0.4,9,1.2,130) },
    apocalypse:  { buttonClick: u("switch28.ogg",0.3), itemUnlock: u3("switch28.ogg",0.25,"switch29.ogg",0.4,"switch30.ogg",0.6,160), notification: u("rollover3.ogg",0.3), error: u("switch31.ogg",0.12), success: uArp("switch28.ogg",0.25,9,1.22,150) },
    rebirth:     { buttonClick: u("click3.ogg",3.2), itemUnlock: uArp("click3.ogg",2.5,8,1.12,85), notification: u("rollover4.ogg",3.0), error: u("switch32.ogg",0.3), success: uArp("click3.ogg",2.3,9,1.1,80) },
    primordial:  { buttonClick: u("switch33.ogg",0.35), itemUnlock: u3("switch33.ogg",0.3,"switch34.ogg",0.45,"switch35.ogg",0.65,160), notification: u("rollover5.ogg",0.35), error: u("switch36.ogg",0.15), success: uArp("switch33.ogg",0.28,9,1.22,150) },
    celestialgod:{ buttonClick: u("rollover6.ogg",3.0), itemUnlock: uArp("rollover6.ogg",2.4,9,1.11,95), notification: u("rollover1.ogg",2.9), error: u("switch37.ogg",0.3), success: uArp("rollover6.ogg",2.2,10,1.09,90) },
    universe:    { buttonClick: u("switch38.ogg",0.4), itemUnlock: u3("switch38.ogg",0.3,"switch1.ogg",0.5,"switch2.ogg",0.7,160), notification: u("rollover2.ogg",0.4), error: u("switch3.ogg",0.15), success: uArp("switch38.ogg",0.3,10,1.2,150) },
    multiverse:  { buttonClick: u("click4.ogg",4.0), itemUnlock: uArp("click4.ogg",3.0,9,1.1,85), notification: u("rollover3.ogg",3.5), error: u("switch4.ogg",0.3), success: uArp("click4.ogg",2.8,10,1.08,80) },
    omniscience: { buttonClick: u("switch5.ogg",0.3), itemUnlock: u3("switch5.ogg",0.25,"switch6.ogg",0.4,"switch7.ogg",0.6,170), notification: u("rollover4.ogg",0.3), error: u("switch8.ogg",0.12), success: uArp("switch5.ogg",0.25,10,1.2,160) },
    omnipotence: { buttonClick: u("click5.ogg",4.0), itemUnlock: uArp("click5.ogg",3.2,9,1.1,85), notification: u("rollover5.ogg",3.8), error: u("switch9.ogg",0.3), success: uArp("click5.ogg",3.0,10,1.08,80) },
    creation:    { buttonClick: u("rollover6.ogg",4.0), itemUnlock: uArp("rollover6.ogg",3.0,9,1.1,95), notification: u("rollover1.ogg",3.5), error: u("switch10.ogg",0.3), success: uArp("rollover6.ogg",2.8,10,1.09,90) },
    destruction: { buttonClick: u("switch11.ogg",0.25), itemUnlock: u3("switch11.ogg",0.2,"switch12.ogg",0.35,"switch13.ogg",0.5,180), notification: u("rollover2.ogg",0.25), error: u("switch14.ogg",0.1), success: uArp("switch11.ogg",0.2,10,1.22,170) },
    balance:     { buttonClick: u2("click1.ogg",3.5,"switch1.ogg",0.28,5), itemUnlock: uArp("rollover3.ogg",2.5,10,1.1,95), notification: u2("rollover4.ogg",2.8,"rollover4.ogg",0.35,150), error: u("switch15.ogg",0.2), success: uArp("rollover3.ogg",2.3,11,1.09,90) },
    transcendent:{ buttonClick: u2("click2.ogg",4.5,"rollover5.ogg",3.8,8), itemUnlock: uArp("click2.ogg",3.5,10,1.1,90), notification: u2("rollover6.ogg",4.0,"rollover1.ogg",3.5,120), error: u("switch16.ogg",0.15), success: uArp("click2.ogg",3.2,12,1.08,85) },
}

// ── Jotai atoms ───────────────────────────────────────────────────────────────

const soundPackIdAtom = atomWithStorage<string>("sea-sound-pack-id", "default")
const soundVolumeAtom = atomWithStorage<number>("sea-sound-volume", 0.6)

// ── Context ───────────────────────────────────────────────────────────────────

type SoundContextValue = {
    activeSoundPackId: string
    setActiveSoundPackId: (id: string) => void
    soundVolume: number
    setSoundVolume: (v: number) => void
    soundPacks: SoundPack[]
    playSound: (name: SoundName) => void
}

const SoundContext = React.createContext<SoundContextValue | null>(null)

export function SoundProvider({ children }: { children: React.ReactNode }) {
    const [activeSoundPackId, setActiveSoundPackId] = useAtom(soundPackIdAtom)
    const [soundVolume, setSoundVolume] = useAtom(soundVolumeAtom)
    const audioCtxRef = React.useRef<AudioContext | null>(null)

    const playSound = React.useCallback(async (name: SoundName) => {
        if (soundVolume <= 0) return
        try {
            if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
            }
            if (audioCtxRef.current.state === "suspended") {
                await audioCtxRef.current.resume()
            }
            const pack = PACK_SOUNDS[activeSoundPackId] ?? PACK_SOUNDS["default"]
            pack[name]?.(audioCtxRef.current, soundVolume)
        } catch { /* noop — audio not available */ }
    }, [activeSoundPackId, soundVolume])

    // Global button-click sounds
    React.useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (soundVolume <= 0) return
            const target = e.target as Element | null
            if (!target) return
            const el = target.closest("button, [role='button'], [role='tab'], [role='option'], [role='menuitem']")
            if (el && !el.hasAttribute("disabled") && !(el as HTMLElement).dataset.noSound) {
                playSound("buttonClick")
            }
        }
        window.addEventListener("click", handleClick)
        return () => window.removeEventListener("click", handleClick)
    }, [playSound, soundVolume])

    const value = React.useMemo<SoundContextValue>(() => ({
        activeSoundPackId,
        setActiveSoundPackId,
        soundVolume,
        setSoundVolume,
        soundPacks: SOUND_PACKS,
        playSound,
    }), [activeSoundPackId, setActiveSoundPackId, soundVolume, setSoundVolume, playSound])

    return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>
}

export function useSound(): SoundContextValue {
    const ctx = React.useContext(SoundContext)
    if (!ctx) throw new Error("useSound must be used inside SoundProvider")
    return ctx
}
