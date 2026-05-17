"use client"
import React from "react"
import { atomWithStorage } from "jotai/utils"
import { useAtom } from "jotai/react"
import { seaJotaiStorage } from "@/lib/sea-storage/sea-storage"

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
    { id: "soft",         name: "Soft",          emoji: "🍃", description: "Gentle, subtle sounds",            requiredLevel: 1   },
    { id: "retro",        name: "Retro",         emoji: "👾", description: "8-bit game sounds",               requiredLevel: 1   },
    { id: "anime",        name: "Anime",         emoji: "⭐", description: "Anime-styled sound effects",      requiredLevel: 1   },
    { id: "cosmic",       name: "Cosmic",        emoji: "🌌", description: "Space-themed atmospheric",        requiredLevel: 1   },
    { id: "bamboo",       name: "Bamboo",        emoji: "🎍", description: "Traditional Japanese sounds",     requiredLevel: 1   },
    // ── Real sounds loaded from Kenney's CC0 UI Audio library ─────────────────
    { id: "glass",        name: "Glass",         emoji: "🔮", description: "Crystal-clear glass taps",        requiredLevel: 1   },
    { id: "pebble",       name: "Pebble",        emoji: "🪨", description: "Light stone clicks",              requiredLevel: 1   },
    { id: "wood",         name: "Wood",          emoji: "🪵", description: "Warm wooden knocks",              requiredLevel: 1   },
    { id: "metal",        name: "Metal",         emoji: "⚙️", description: "Cold metallic clinks",            requiredLevel: 1   },
    { id: "spring",       name: "Spring",        emoji: "🌱", description: "Light bouncy pops",               requiredLevel: 2   },
    { id: "bubble",       name: "Bubble",        emoji: "🫧", description: "Soft rounded bubbles",            requiredLevel: 2   },
    { id: "chirp",        name: "Chirp",         emoji: "🐦", description: "Quick bright chirps",             requiredLevel: 3   },
    { id: "snap",         name: "Snap",          emoji: "✂️", description: "Sharp snapping clicks",           requiredLevel: 3   },
    { id: "tap",          name: "Tap",           emoji: "👆", description: "Clean desk taps",                 requiredLevel: 4   },
    { id: "chime",        name: "Chime",         emoji: "🔔", description: "Bell-like chimes",                requiredLevel: 4   },
    { id: "pluck",        name: "Pluck",         emoji: "🎸", description: "String plucks",                   requiredLevel: 5   },
    { id: "drum",         name: "Drum",          emoji: "🥁", description: "Percussive hits",                 requiredLevel: 6   },
    { id: "clickbox",     name: "Click Box",     emoji: "📦", description: "Satisfying box clicks",           requiredLevel: 7   },
    { id: "toggle",       name: "Toggle",        emoji: "🔘", description: "Switch toggles",                  requiredLevel: 8   },
    { id: "pop",          name: "Pop",           emoji: "🎈", description: "Crisp balloon pops",              requiredLevel: 9   },
    { id: "electro",      name: "Electro",       emoji: "⚡", description: "Electric zaps",                   requiredLevel: 11  },
    { id: "digital",      name: "Digital",       emoji: "💻", description: "Digital interface beeps",         requiredLevel: 12  },
    { id: "neon",         name: "Neon",          emoji: "💡", description: "Neon buzz and flicker",           requiredLevel: 14  },
    { id: "cyber",        name: "Cyber",         emoji: "🤖", description: "Cyberpunk interface sounds",      requiredLevel: 16  },
    { id: "matrix",       name: "Matrix",        emoji: "🟢", description: "Green code dripping",             requiredLevel: 18  },
    { id: "echo",         name: "Echo",          emoji: "🔊", description: "Reverberant echoes",              requiredLevel: 21  },
    { id: "crystal",      name: "Crystal",       emoji: "💎", description: "Singing crystal resonance",       requiredLevel: 24  },
    { id: "pixel",        name: "Pixel",         emoji: "🎮", description: "Pixelated game sounds",           requiredLevel: 27  },
    { id: "wave",         name: "Wave",          emoji: "〰️", description: "Smooth wave pulses",              requiredLevel: 31  },
    { id: "pulse",        name: "Pulse",         emoji: "💫", description: "Electronic pulse signals",        requiredLevel: 36  },
    { id: "surge",        name: "Surge",         emoji: "🔋", description: "Power surges",                   requiredLevel: 41  },
    { id: "spark",        name: "Spark",         emoji: "✨", description: "Electrical sparks",               requiredLevel: 47  },
    { id: "thunder",      name: "Thunder",       emoji: "⛈️", description: "Rolling thunder cracks",          requiredLevel: 54  },
    { id: "storm",        name: "Storm",         emoji: "🌩️", description: "Full storm ambience",             requiredLevel: 62  },
    { id: "rain",         name: "Rain",          emoji: "🌧️", description: "Rain drops on glass",             requiredLevel: 71  },
    { id: "wind",         name: "Wind",          emoji: "🌬️", description: "Wind chime cascade",              requiredLevel: 81  },
    { id: "ocean",        name: "Ocean",         emoji: "🌊", description: "Ocean wave pulses",               requiredLevel: 93  },
    { id: "fire",         name: "Fire",          emoji: "🔥", description: "Crackling fire pops",             requiredLevel: 106 },
    { id: "ice",          name: "Ice",           emoji: "❄️", description: "Icy crystal shatters",            requiredLevel: 121 },
    { id: "shadow",       name: "Shadow",        emoji: "🌑", description: "Dark ethereal whispers",          requiredLevel: 139 },
    { id: "phantom",      name: "Phantom",       emoji: "👻", description: "Ghostly apparitions",             requiredLevel: 159 },
    { id: "spirit",       name: "Spirit",        emoji: "💨", description: "Spirit energy flows",             requiredLevel: 182 },
    { id: "angel",        name: "Angel",         emoji: "👼", description: "Angelic bell tones",              requiredLevel: 208 },
    { id: "celestial",    name: "Celestial",     emoji: "⭐", description: "Celestial sphere harmonics",     requiredLevel: 237 },
    { id: "nebula",       name: "Nebula",        emoji: "🌌", description: "Nebula dust shimmer",             requiredLevel: 271 },
    { id: "galaxy",       name: "Galaxy",        emoji: "🌠", description: "Galactic whispers",               requiredLevel: 310 },
    { id: "quasar",       name: "Quasar",        emoji: "🔆", description: "Quasar energy burst",             requiredLevel: 354 },
    { id: "warp",         name: "Warp",          emoji: "🚀", description: "Warp drive engage",               requiredLevel: 405 },
    { id: "portal",       name: "Portal",        emoji: "🌀", description: "Portal open and close",           requiredLevel: 463 },
    { id: "quantum",      name: "Quantum",       emoji: "⚛️", description: "Quantum state collapse",          requiredLevel: 500 },
    { id: "circuit",      name: "Circuit",       emoji: "🔌", description: "Circuit board clicks",            requiredLevel: 2   },
    { id: "binary",       name: "Binary",        emoji: "0️⃣", description: "Binary code pulses",             requiredLevel: 2   },
    { id: "neural",       name: "Neural",        emoji: "🧠", description: "Neural network firing",           requiredLevel: 3   },
    { id: "hologram",     name: "Hologram",      emoji: "📡", description: "Holographic flickers",            requiredLevel: 3   },
    { id: "synthwave",    name: "Synthwave",     emoji: "🎹", description: "Retro synth arpeggios",           requiredLevel: 4   },
    { id: "retrowave",    name: "Retrowave",     emoji: "📻", description: "80s retro wave sounds",           requiredLevel: 5   },
    { id: "vaporwave",    name: "Vaporwave",     emoji: "🌸", description: "Dreamy vaporwave tones",          requiredLevel: 6   },
    { id: "dreamwave",    name: "Dreamwave",     emoji: "💭", description: "Drifting dream sounds",           requiredLevel: 7   },
    { id: "ambient",      name: "Ambient",       emoji: "🎵", description: "Ambient pad tones",               requiredLevel: 8   },
    { id: "lofi",         name: "Lo-fi",         emoji: "🎶", description: "Warm lo-fi clicks",               requiredLevel: 9   },
    { id: "jazz",         name: "Jazz",          emoji: "🎷", description: "Jazz-inspired stabs",             requiredLevel: 11  },
    { id: "orchestra",    name: "Orchestra",     emoji: "🎻", description: "Orchestral swells",               requiredLevel: 12  },
    { id: "epic",         name: "Epic",          emoji: "🎺", description: "Epic cinematic hits",             requiredLevel: 14  },
    { id: "legend",       name: "Legend",        emoji: "🏆", description: "Legendary hero fanfares",         requiredLevel: 16  },
    { id: "myth",         name: "Myth",          emoji: "🐉", description: "Mythical creature sounds",        requiredLevel: 18  },
    { id: "ancient",      name: "Ancient",       emoji: "🏛️", description: "Ancient rune activation",        requiredLevel: 21  },
    { id: "dragonfire",   name: "Dragon Fire",   emoji: "🔥", description: "Dragon breath igniting",          requiredLevel: 24  },
    { id: "phoenix",      name: "Phoenix",       emoji: "🦅", description: "Phoenix rising from ash",         requiredLevel: 27  },
    { id: "titan",        name: "Titan",         emoji: "🗿", description: "Titan footsteps",                 requiredLevel: 31  },
    { id: "divine",       name: "Divine",        emoji: "✨", description: "Divine light descends",           requiredLevel: 36  },
    { id: "archangel",    name: "Archangel",     emoji: "😇", description: "Archangel trumpet calls",         requiredLevel: 41  },
    { id: "cosmos",       name: "Cosmos",        emoji: "🌌", description: "The cosmos speaking",             requiredLevel: 47  },
    { id: "eternity",     name: "Eternity",      emoji: "♾️", description: "Eternal resonance",              requiredLevel: 54  },
    { id: "infinity",     name: "Infinity",      emoji: "🔄", description: "Infinite loop harmonics",         requiredLevel: 62  },
    { id: "beyond",       name: "Beyond",        emoji: "🌠", description: "Beyond all planes",              requiredLevel: 71  },
    { id: "transcend",    name: "Transcend",     emoji: "🌟", description: "Transcending existence",          requiredLevel: 81  },
    { id: "absolute",     name: "Absolute",      emoji: "💯", description: "The absolute truth",              requiredLevel: 93  },
    { id: "voidgod",      name: "Void God",      emoji: "🌑", description: "Void god awakening",              requiredLevel: 106 },
    { id: "trueform",     name: "True Form",     emoji: "💫", description: "True form revealed",              requiredLevel: 121 },
    { id: "awakening",    name: "Awakening",     emoji: "🌅", description: "Great awakening",                 requiredLevel: 139 },
    { id: "ascension",    name: "Ascension",     emoji: "🚀", description: "Final ascension",                 requiredLevel: 159 },
    { id: "enlighten",    name: "Enlightenment", emoji: "🕊️", description: "True enlightenment",             requiredLevel: 182 },
    { id: "singularity",  name: "Singularity",   emoji: "🌀", description: "The singularity point",           requiredLevel: 208 },
    { id: "omega",        name: "Omega",         emoji: "🔚", description: "The omega frequency",             requiredLevel: 237 },
    { id: "alpha",        name: "Alpha",         emoji: "🔛", description: "The alpha origin",                requiredLevel: 271 },
    { id: "genesis",      name: "Genesis",       emoji: "💥", description: "The genesis explosion",           requiredLevel: 310 },
    { id: "judgment",     name: "Judgment",      emoji: "⚖️", description: "Final judgment tone",             requiredLevel: 354 },
    { id: "apocalypse",   name: "Apocalypse",    emoji: "☄️", description: "Apocalyptic tremors",             requiredLevel: 405 },
    { id: "rebirth",      name: "Rebirth",       emoji: "🌱", description: "Rebirth from nothing",            requiredLevel: 463 },
    { id: "primordial",   name: "Primordial",    emoji: "🌍", description: "Primordial creation sound",       requiredLevel: 500 },
    { id: "celestialgod", name: "Celestial God", emoji: "🌟", description: "Celestial god speaks",            requiredLevel: 2   },
    { id: "universe",     name: "Universe",      emoji: "🌌", description: "The universe in sound",           requiredLevel: 2   },
    { id: "multiverse",   name: "Multiverse",    emoji: "🔀", description: "Multiverse harmonics",            requiredLevel: 3   },
    { id: "omniscience",  name: "Omniscience",   emoji: "👁️", description: "All-knowing resonance",          requiredLevel: 3   },
    { id: "omnipotence",  name: "Omnipotence",   emoji: "⚡", description: "Omnipotent surge",               requiredLevel: 4   },
    { id: "creation",     name: "Creation",      emoji: "🌟", description: "The act of creation itself",      requiredLevel: 5   },
    { id: "destruction",  name: "Destruction",   emoji: "💥", description: "Total destruction wave",          requiredLevel: 6   },
    { id: "balance",      name: "Balance",       emoji: "⚖️", description: "Perfect cosmic balance",          requiredLevel: 7   },
    { id: "transcendent", name: "Transcendent",  emoji: "✨", description: "Beyond all comprehension",        requiredLevel: 8   },
]

type CoreSoundName = "buttonClick" | "itemUnlock" | "notification" | "error" | "success"
export type ExtendedSoundName = "hover" | "toggleSwitch" | "navClick" | "tabSwitch" | "modalOpen" | "modalClose" | "inputFocus" | "linkClick" | "dropdownOpen" | "checkbox" | "carouselSwipe"
type SoundName = CoreSoundName | ExtendedSoundName

const CORE_SOUND_NAMES = new Set<string>(["buttonClick", "itemUnlock", "notification", "error", "success"])

/** Minimum player level required to hear each extended sound */
export const SOUND_LEVEL_REQUIREMENTS: Record<ExtendedSoundName, number> = {
    hover:        5,
    toggleSwitch: 10,
    navClick:     15,
    tabSwitch:    20,
    modalOpen:    25,
    modalClose:   30,
    inputFocus:   35,
    linkClick:    40,
    dropdownOpen: 45,
    checkbox:     50,
    carouselSwipe: 55,
}

export const EXTENDED_SOUND_LABELS: Record<ExtendedSoundName, string> = {
    hover:        "Hover",
    toggleSwitch: "Toggle Switch",
    navClick:     "Navigation Click",
    tabSwitch:    "Tab Switch",
    modalOpen:    "Modal Open",
    modalClose:   "Modal Close",
    inputFocus:   "Input Focus",
    linkClick:    "Link Click",
    dropdownOpen: "Dropdown Open",
    checkbox:     "Checkbox",
    carouselSwipe: "Carousel Swipe",
}

/**
 * Derive a level-gated sound from the pack's core sounds.
 * Volume multipliers are chosen so extended sounds are subtler than buttonClick.
 */
function getExtendedSound(pack: Record<CoreSoundName, PackSoundFn>, name: ExtendedSoundName, ctx?: AudioContext): PackSoundFn {
    switch (name) {
        case "hover":        return (ctx, vol) => pack.buttonClick(ctx, vol * 0.28)
        case "toggleSwitch": return (ctx, vol) => pack.buttonClick(ctx, vol * 0.85)
        case "navClick":     return (ctx, vol) => pack.buttonClick(ctx, vol * 0.78)
        case "tabSwitch":    return (ctx, vol) => pack.buttonClick(ctx, vol * 0.72)
        case "modalOpen":    return (ctx, vol) => pack.notification(ctx, vol * 0.85)
        case "modalClose":   return (ctx, vol) => pack.buttonClick(ctx, vol * 0.58)
        case "inputFocus":   return (ctx, vol) => pack.buttonClick(ctx, vol * 0.22)
        case "linkClick":    return (ctx, vol) => pack.buttonClick(ctx, vol * 0.68)
        case "dropdownOpen": return (ctx, vol) => pack.notification(ctx, vol * 0.55)
        case "checkbox":     return (ctx, vol) => pack.buttonClick(ctx, vol * 0.88)
        case "carouselSwipe": return (ctx, vol) => createWhoosh(ctx, 200, 800, 0.25, vol * 0.3)
    }
}

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

/** Create a whoosh sound by sweeping frequency upward then downward */
function createWhoosh(ctx: AudioContext, startFreq: number, endFreq: number, duration: number, gain = 0.15) {
    const osc = ctx.createOscillator()
    const gainNode = ctx.createGain()
    osc.connect(gainNode)
    gainNode.connect(ctx.destination)
    osc.type = "triangle"
    
    // Sweep up to peak then down
    const peak = (startFreq + endFreq) / 2
    const peakTime = ctx.currentTime + duration * 0.4
    
    osc.frequency.setValueAtTime(startFreq, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(peak, peakTime)
    osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + duration)
    
    gainNode.gain.setValueAtTime(gain * 0.4, ctx.currentTime)
    gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + duration * 0.1)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)
    
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration)
}

// ── Kenney UI Audio — CC0 sounds bundled locally ─────────────────────────────
// Source: kenney.nl/assets/ui-audio (CC0). Files served from /public/sounds/kenney
// to avoid CORS issues (gamesounds.xyz does not send Access-Control-Allow-Origin,
// which breaks fetches in Electron's app:// origin and falls back to a synth tick
// that makes every pack sound identical).
// Files: click1-5.ogg, switch1-38.ogg, rollover1-6.ogg, mouseclick1.ogg, mouserelease1.ogg

const K_BASE = "/sounds/kenney"
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

// ── Synth toolkit for unique pack signatures ─────────────────────────────────
//
// Most Kenney one-shots end up sounding the same when rate-shifted, so the
// non-distinctive packs are now built from a small synth toolkit. Each pack
// picks a unique (click waveform, swoosh shape, frequency, chord) recipe so
// no two packs feel alike.

/** Filtered noise burst with a frequency sweep — the "swoosh" primitive. */
function synthSwoosh(
    ctx: AudioContext,
    fromHz: number,
    toHz: number,
    duration: number,
    vol: number,
    q = 8,
    shape: BiquadFilterType = "bandpass",
) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration))
    const buf = ctx.createBuffer(1, length, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < length; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource(); src.buffer = buf
    const filter = ctx.createBiquadFilter(); filter.type = shape; filter.Q.value = q
    const now = ctx.currentTime
    filter.frequency.setValueAtTime(Math.max(20, fromHz), now)
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, toHz), now + duration)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), now + duration * 0.08)
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    src.connect(filter); filter.connect(g); g.connect(ctx.destination)
    src.start(now); src.stop(now + duration)
}

/** Pitched click — short oscillator burst, optionally FM-modulated. */
function synthClick(
    ctx: AudioContext,
    freq: number,
    decay: number,
    vol: number,
    waveform: OscillatorType = "sine",
    fm?: { mod: number; amt: number },
) {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = waveform
    const now = ctx.currentTime
    osc.frequency.setValueAtTime(freq * 2.5, now)
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq), now + decay * 0.3)
    if (fm) {
        const modOsc = ctx.createOscillator()
        const modGain = ctx.createGain()
        modOsc.frequency.value = fm.mod; modGain.gain.value = fm.amt
        modOsc.connect(modGain); modGain.connect(osc.frequency)
        modOsc.start(now); modOsc.stop(now + decay)
    }
    g.gain.setValueAtTime(Math.max(0.0002, vol), now)
    g.gain.exponentialRampToValueAtTime(0.0001, now + decay)
    osc.connect(g); g.connect(ctx.destination)
    osc.start(now); osc.stop(now + decay)
}

/** Bandpassed noise tick — a crisp percussive accent. */
function synthTick(ctx: AudioContext, freq: number, vol: number, q = 20) {
    const buf = ctx.createBuffer(1, 512, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < 512; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / 512)
    const src = ctx.createBufferSource(); src.buffer = buf
    const filter = ctx.createBiquadFilter(); filter.type = "bandpass"; filter.frequency.value = freq; filter.Q.value = q
    const g = ctx.createGain(); g.gain.value = vol
    src.connect(filter); filter.connect(g); g.connect(ctx.destination)
    src.start(ctx.currentTime)
}

/** Detuned two-osc blip — sweet/bright "ding". */
function synthBlip(ctx: AudioContext, freq: number, decay: number, vol: number, detune = 7) {
    const o1 = ctx.createOscillator()
    const o2 = ctx.createOscillator()
    const g = ctx.createGain()
    o1.type = "triangle"; o2.type = "sawtooth"
    o1.frequency.value = freq; o2.frequency.value = freq; o2.detune.value = detune
    const now = ctx.currentTime
    g.gain.setValueAtTime(Math.max(0.0002, vol), now)
    g.gain.exponentialRampToValueAtTime(0.0001, now + decay)
    o1.connect(g); o2.connect(g); g.connect(ctx.destination)
    o1.start(now); o1.stop(now + decay)
    o2.start(now); o2.stop(now + decay)
}

type ClickKind = "sine" | "triangle" | "square" | "sawtooth" | "tick" | "blip" | "fm"
type SwooshKind = "up" | "down" | "upDown" | "downUp" | "sparkle" | "deep" | "airy" | "pulse"

interface Recipe {
    click: ClickKind
    clickHz: number
    clickDec: number
    swoosh: SwooshKind
    swooshLo: number
    swooshHi: number
    swooshDur: number
    chord: number[]
    palette: number
}

const SHAPES: BiquadFilterType[] = ["bandpass", "lowpass", "highpass"]

function playClick(ctx: AudioContext, r: Recipe, freqMul: number, vol: number) {
    const f = r.clickHz * freqMul
    switch (r.click) {
        case "tick": return synthTick(ctx, f, vol, 15 + (r.palette % 5) * 3)
        case "blip": return synthBlip(ctx, f, r.clickDec, vol, 3 + (r.palette % 5) * 2)
        case "fm":   return synthClick(ctx, f, r.clickDec, vol, "sine", { mod: f * 1.7, amt: f * (r.palette % 5) * 0.4 })
        default:     return synthClick(ctx, f, r.clickDec, vol, r.click)
    }
}

function playSwoosh(ctx: AudioContext, r: Recipe, vol: number) {
    const q = 4 + (r.palette % 5) * 2
    const shape = SHAPES[r.palette % 3]
    switch (r.swoosh) {
        case "up":     return synthSwoosh(ctx, r.swooshLo, r.swooshHi, r.swooshDur, vol * 0.4, q, shape)
        case "down":   return synthSwoosh(ctx, r.swooshHi, r.swooshLo, r.swooshDur, vol * 0.4, q, shape)
        case "upDown": {
            synthSwoosh(ctx, r.swooshLo, r.swooshHi, r.swooshDur * 0.5, vol * 0.4, q, shape)
            setTimeout(() => synthSwoosh(ctx, r.swooshHi, r.swooshLo, r.swooshDur * 0.5, vol * 0.35, q, shape), r.swooshDur * 500)
            return
        }
        case "downUp": {
            synthSwoosh(ctx, r.swooshHi, r.swooshLo, r.swooshDur * 0.5, vol * 0.4, q, shape)
            setTimeout(() => synthSwoosh(ctx, r.swooshLo, r.swooshHi, r.swooshDur * 0.5, vol * 0.35, q, shape), r.swooshDur * 500)
            return
        }
        case "sparkle":
            for (let i = 0; i < 4; i++) setTimeout(() => synthTick(ctx, r.swooshLo * Math.pow(1.5, i), vol * 0.25, 20), i * 60)
            return
        case "deep":  return synthSwoosh(ctx, r.swooshLo, r.swooshLo * 0.5, r.swooshDur, vol * 0.5, q + 2, "lowpass")
        case "airy":  return synthSwoosh(ctx, r.swooshLo, r.swooshHi, r.swooshDur, vol * 0.25, 2, "highpass")
        case "pulse":
            for (let i = 0; i < 3; i++) setTimeout(() => synthSwoosh(ctx, r.swooshLo, r.swooshHi, r.swooshDur / 3, vol * 0.35, q, shape), i * (r.swooshDur * 1000 / 3))
            return
    }
}

function buildPack(r: Recipe): Record<CoreSoundName, PackSoundFn> {
    const semi = (n: number) => Math.pow(2, n / 12)
    return {
        buttonClick: (ctx, v) => playClick(ctx, r, 1, v * 0.55),
        itemUnlock:  (ctx, v) => {
            r.chord.forEach((s, i) => setTimeout(() => playClick(ctx, r, semi(s), v * 0.55), i * 75))
            setTimeout(() => playSwoosh(ctx, r, v * 0.6), r.chord.length * 75)
        },
        notification: (ctx, v) => {
            playClick(ctx, r, 1, v * 0.45)
            setTimeout(() => playClick(ctx, r, semi(r.chord[1] ?? 7), v * 0.5), 90)
        },
        error: (ctx, v) => {
            playClick(ctx, r, 0.6, v * 0.5)
            setTimeout(() => playClick(ctx, r, 0.45, v * 0.5), 110)
        },
        success: (ctx, v) => {
            r.chord.forEach((s, i) => setTimeout(() => playClick(ctx, r, semi(s), v * 0.55), i * 85))
        },
    }
}

/** Build a Recipe from compact tuple form. */
function rcp(
    click: ClickKind,
    clickHz: number,
    swoosh: SwooshKind,
    chord: number[],
    palette: number,
    clickDec = 0.05,
    swooshDur = 0.3,
): Recipe {
    return {
        click, clickHz, clickDec,
        swoosh,
        swooshLo: Math.max(40, clickHz * 0.3),
        swooshHi: clickHz * 2.5,
        swooshDur,
        chord, palette,
    }
}

// ── All pack sounds ───────────────────────────────────────────────────────────

const PACK_SOUNDS: Record<string, Record<CoreSoundName, PackSoundFn>> = {
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
    // ── Synth-recipe packs: each has a unique (click waveform, swoosh shape, base freq, chord) signature ──
    spring:      buildPack(rcp("blip",      880,  "upDown",  [0,4,7,12],  1, 0.06, 0.32)),
    bubble:      buildPack(rcp("blip",      1320, "upDown",  [0,3,7,10],       2, 0.06, 0.28)),
    chirp:       buildPack(rcp("tick",      2400, "sparkle", [0,4,7,11],       3, 0.04, 0.30)),
    snap:        buildPack(rcp("square",    1800, "down",    [0,4,7,12],       4, 0.04, 0.20)),
    tap:         buildPack(rcp("triangle",  700,  "up",      [0,5,7,12],       0, 0.05, 0.24)),
    chime:       buildPack(rcp("blip",      1568, "sparkle", [0,4,7,11,16],    5, 0.10, 0.40)),
    pluck:       buildPack(rcp("triangle",  660,  "up",      [0,2,4,7,9],      1, 0.08, 0.28)),
    drum:        buildPack(rcp("sine",      80,   "deep",    [0,12],           2, 0.18, 0.30)),
    clickbox:    buildPack(rcp("square",    1100, "pulse",   [0,4,7],          3, 0.05, 0.30)),
    toggle:      buildPack(rcp("tick",      950,  "upDown",  [0,7],            4, 0.05, 0.22)),
    pop:         buildPack(rcp("triangle",  1500, "up",      [0,7,12],         0, 0.04, 0.18)),
    electro:     buildPack(rcp("square",    1400, "downUp",  [0,3,6,9],        1, 0.06, 0.26)),
    digital:     buildPack(rcp("square",    800,  "pulse",   [0,4,7,12],       2, 0.05, 0.28)),
    neon:        buildPack(rcp("sawtooth",  1200, "upDown",  [0,4,7,11],       3, 0.07, 0.30)),
    cyber:       buildPack(rcp("fm",        900,  "sparkle", [0,2,4,6,8],      4, 0.06, 0.30)),
    matrix:      buildPack(rcp("square",    600,  "pulse",   [0,7,12],         0, 0.05, 0.32)),
    echo:        buildPack(rcp("sine",      440,  "down",    [0,5,12],         1, 0.12, 0.45)),
    crystal:     buildPack(rcp("blip",      2200, "sparkle", [0,4,7,11],       2, 0.08, 0.32)),
    pixel:       buildPack(rcp("square",    1024, "up",      [0,4,7,12],       3, 0.04, 0.22)),
    wave:        buildPack(rcp("sine",      500,  "upDown",  [0,4,7],          4, 0.10, 0.40)),
    pulse:       buildPack(rcp("fm",        700,  "pulse",   [0,3,7,10],       0, 0.05, 0.30)),
    surge:       buildPack(rcp("sawtooth",  1100, "upDown",  [0,4,7,12],       1, 0.06, 0.28)),
    spark:       buildPack(rcp("tick",      2800, "sparkle", [0,4,7,11,16],    2, 0.03, 0.24)),
    thunder:     buildPack(rcp("fm",        100,  "deep",    [0,12],           3, 0.25, 0.55)),
    storm:       buildPack(rcp("sawtooth",  200,  "deep",    [0,3,7],          4, 0.18, 0.45)),
    rain:        buildPack(rcp("tick",      1800, "sparkle", [0,4,7,11],       0, 0.03, 0.50)),
    wind:        buildPack(rcp("sine",      600,  "airy",    [0,5,7,12],       1, 0.15, 0.55)),
    ocean:       buildPack(rcp("sine",      220,  "deep",    [0,5,7,12],       2, 0.20, 0.60)),
    fire:        buildPack(rcp("sawtooth",  350,  "pulse",   [0,3,7],          3, 0.10, 0.35)),
    ice:         buildPack(rcp("blip",      1800, "sparkle", [0,4,7,11],       4, 0.10, 0.35)),
    shadow:      buildPack(rcp("sine",      180,  "down",    [0,3,7],          0, 0.20, 0.50)),
    phantom:     buildPack(rcp("triangle",  280,  "downUp",  [0,1,5,7,8],      1, 0.15, 0.50)),
    spirit:      buildPack(rcp("sine",      450,  "airy",    [0,5,7,12],       2, 0.14, 0.55)),
    angel:       buildPack(rcp("blip",      1760, "up",      [0,4,7,11,16],    3, 0.10, 0.45)),
    celestial:   buildPack(rcp("tick",      2100, "sparkle", [0,4,7,11,16],    4, 0.06, 0.45)),
    nebula:      buildPack(rcp("sawtooth",  600,  "airy",    [0,4,7,11],       0, 0.12, 0.50)),
    galaxy:      buildPack(rcp("fm",        800,  "upDown",  [0,4,7,11],       1, 0.10, 0.45)),
    quasar:      buildPack(rcp("fm",        1200, "sparkle", [0,4,7,11,16],    2, 0.08, 0.40)),
    warp:        buildPack(rcp("sawtooth",  1500, "upDown",  [0,4,7,12],       3, 0.07, 0.35)),
    portal:      buildPack(rcp("sine",      660,  "downUp",  [0,1,5,7,8],      4, 0.12, 0.45)),
    quantum:     buildPack(rcp("fm",        900,  "pulse",   [0,3,6,9],        0, 0.06, 0.30)),
    circuit:     buildPack(rcp("square",    1024, "pulse",   [0,4,7,12],       1, 0.05, 0.30)),
    binary:      buildPack(rcp("square",    1300, "up",      [0,4,7],          2, 0.04, 0.26)),
    neural:      buildPack(rcp("fm",        700,  "sparkle", [0,3,7,10],       3, 0.07, 0.35)),
    hologram:    buildPack(rcp("fm",        1100, "airy",    [0,4,7,11],       4, 0.09, 0.40)),
    synthwave:   buildPack(rcp("sawtooth",  880,  "upDown",  [0,4,7,12],       0, 0.08, 0.35)),
    retrowave:   buildPack(rcp("sawtooth",  700,  "down",    [0,3,7,10],       1, 0.09, 0.38)),
    vaporwave:   buildPack(rcp("triangle",  550,  "airy",    [0,5,7,12],       2, 0.12, 0.55)),
    dreamwave:   buildPack(rcp("sine",      660,  "airy",    [0,4,7,11],       3, 0.14, 0.55)),
    ambient:     buildPack(rcp("sine",      330,  "airy",    [0,5,7,12],       4, 0.18, 0.65)),
    lofi:        buildPack(rcp("triangle",  440,  "down",    [0,3,7],          0, 0.10, 0.40)),
    jazz:        buildPack(rcp("triangle",  587,  "up",      [0,4,7,11,14],    1, 0.10, 0.40)),
    orchestra:   buildPack(rcp("triangle",  392,  "upDown",  [0,4,7,12,16],    2, 0.14, 0.50)),
    epic:        buildPack(rcp("sawtooth",  220,  "upDown",  [0,3,7,12],       3, 0.18, 0.55)),
    legend:      buildPack(rcp("blip",      1320, "up",      [0,4,7,12,16],    4, 0.10, 0.45)),
    myth:        buildPack(rcp("triangle",  392,  "downUp",  [0,3,7,10],       0, 0.12, 0.45)),
    ancient:     buildPack(rcp("sine",      174,  "deep",    [0,5,7],          1, 0.22, 0.60)),
    dragonfire:  buildPack(rcp("fm",        180,  "deep",    [0,3,6,11],       2, 0.25, 0.55)),
    phoenix:     buildPack(rcp("blip",      1760, "up",      [0,4,7,12,16],    3, 0.10, 0.45)),
    titan:       buildPack(rcp("sine",      90,   "deep",    [0,12],           4, 0.30, 0.70)),
    divine:      buildPack(rcp("blip",      1568, "sparkle", [0,4,7,11,16,19], 0, 0.12, 0.50)),
    archangel:   buildPack(rcp("tick",      2100, "sparkle", [0,4,7,11,16,21], 1, 0.06, 0.50)),
    cosmos:      buildPack(rcp("sine",      220,  "airy",    [0,4,7,12],       2, 0.20, 0.65)),
    eternity:    buildPack(rcp("sine",      330,  "airy",    [0,5,7,12,17],    3, 0.18, 0.70)),
    infinity:    buildPack(rcp("triangle",  660,  "sparkle", [0,4,7,11,14],    4, 0.10, 0.55)),
    beyond:      buildPack(rcp("blip",      1980, "sparkle", [0,4,7,11,16,19], 0, 0.08, 0.50)),
    transcend:   buildPack(rcp("fm",        880,  "upDown",  [0,4,7,11,14,18], 1, 0.10, 0.55)),
    absolute:    buildPack(rcp("blip",      1760, "up",      [0,4,7,12],       2, 0.10, 0.40)),
    voidgod:     buildPack(rcp("sine",      60,   "deep",    [0,12,24],        3, 0.35, 0.80)),
    trueform:    buildPack(rcp("triangle",  880,  "upDown",  [0,4,7,11],       4, 0.10, 0.45)),
    awakening:   buildPack(rcp("blip",      880,  "up",      [0,4,7,12,16],    0, 0.10, 0.50)),
    ascension:   buildPack(rcp("blip",      1100, "up",      [0,4,7,12,19],    1, 0.10, 0.55)),
    enlighten:   buildPack(rcp("tick",      1980, "sparkle", [0,4,7,11,14,19], 2, 0.06, 0.55)),
    singularity: buildPack(rcp("fm",        80,   "deep",    [0,12,24],        3, 0.40, 0.85)),
    omega:       buildPack(rcp("sine",      70,   "deep",    [0,12,24,36],     4, 0.45, 0.90)),
    alpha:       buildPack(rcp("blip",      2200, "up",      [0,4,7,12,19,24], 0, 0.08, 0.55)),
    genesis:     buildPack(rcp("sine",      110,  "deep",    [0,7,12],         1, 0.28, 0.70)),
    judgment:    buildPack(rcp("sawtooth",  150,  "deep",    [0,3,7,12],       2, 0.25, 0.65)),
    apocalypse:  buildPack(rcp("fm",        90,   "deep",    [0,3,6,12],       3, 0.35, 0.80)),
    rebirth:     buildPack(rcp("blip",      1568, "up",      [0,4,7,12,16,19], 4, 0.10, 0.55)),
    primordial:  buildPack(rcp("sine",      100,  "deep",    [0,7,14],         0, 0.30, 0.70)),
    celestialgod:buildPack(rcp("blip",      1760, "sparkle", [0,4,7,11,16,19,23], 1, 0.10, 0.60)),
    universe:    buildPack(rcp("sine",      130,  "airy",    [0,4,7,12,16],    2, 0.25, 0.75)),
    multiverse:  buildPack(rcp("fm",        1400, "sparkle", [0,4,7,11,14,18,22], 3, 0.10, 0.60)),
    omniscience: buildPack(rcp("sine",      90,   "airy",    [0,5,7,12,17,24], 4, 0.30, 0.85)),
    omnipotence: buildPack(rcp("blip",      1980, "up",      [0,4,7,12,16,19,24], 0, 0.10, 0.65)),
    creation:    buildPack(rcp("triangle",  1100, "upDown",  [0,4,7,11,16,21], 1, 0.12, 0.60)),
    destruction: buildPack(rcp("fm",        70,   "deep",    [0,3,6,9,12],     2, 0.40, 0.90)),
    balance:     buildPack(rcp("triangle",  660,  "upDown",  [0,4,7,12,16],    3, 0.12, 0.55)),
    transcendent:buildPack(rcp("blip",      2200, "sparkle", [0,4,7,11,14,18,22,26], 4, 0.10, 0.70)),
}

// ── Jotai atoms ───────────────────────────────────────────────────────────────

const soundPackIdAtom = atomWithStorage<string>("sea-sound-pack-id", "default", seaJotaiStorage)
const soundVolumeAtom = atomWithStorage<number>("sea-sound-volume", 0.6, seaJotaiStorage)
/** Set this atom to the user's current level so level-gated sounds unlock correctly */
export const userSoundLevelAtom = atomWithStorage<number>("sea-user-sound-level", 1, seaJotaiStorage)

// ── Context ───────────────────────────────────────────────────────────────────

type SoundContextValue = {
    activeSoundPackId: string
    setActiveSoundPackId: (id: string) => void
    soundVolume: number
    setSoundVolume: (v: number) => void
    soundPacks: SoundPack[]
    playSound: (name: SoundName) => void
    userLevel: number
    setUserLevel: (n: number) => void
    soundLevelRequirements: Record<ExtendedSoundName, number>
    extendedSoundLabels: Record<ExtendedSoundName, string>
}

const SoundContext = React.createContext<SoundContextValue | null>(null)

export function SoundProvider({ children }: { children: React.ReactNode }) {
    const [activeSoundPackId, setActiveSoundPackId] = useAtom(soundPackIdAtom)
    const [soundVolume, setSoundVolume] = useAtom(soundVolumeAtom)
    const [userLevel, setUserLevel] = useAtom(userSoundLevelAtom)
    const audioCtxRef = React.useRef<AudioContext | null>(null)

    const playSound = React.useCallback(async (name: SoundName) => {
        if (soundVolume <= 0) return
        // Level-gate extended sounds
        if (!CORE_SOUND_NAMES.has(name)) {
            const required = SOUND_LEVEL_REQUIREMENTS[name as ExtendedSoundName] ?? 1
            if (userLevel < required) return
        }
        try {
            if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
            }
            if (audioCtxRef.current.state === "suspended") {
                await audioCtxRef.current.resume()
            }
            const pack = PACK_SOUNDS[activeSoundPackId] ?? PACK_SOUNDS["default"]
            if (CORE_SOUND_NAMES.has(name)) {
                pack[name as CoreSoundName]?.(audioCtxRef.current, soundVolume)
            } else {
                getExtendedSound(pack, name as ExtendedSoundName)(audioCtxRef.current, soundVolume)
            }
        } catch { /* noop — audio not available */ }
    }, [activeSoundPackId, soundVolume, userLevel])

    // Global click sounds — debounced to reduce spam, passive listener for performance
    React.useEffect(() => {
        let clickTimeout: NodeJS.Timeout | null = null
        const handleClick = (e: MouseEvent) => {
            if (soundVolume <= 0 || clickTimeout) return
            const target = e.target as Element | null
            if (!target) return
            const el = target.closest(
                "button, [role='button'], [role='tab'], [role='option'], [role='menuitem'], " +
                "[role='switch'], [role='checkbox'], [role='radio'], a[href], [role='link']",
            )
            if (!el || el.hasAttribute("disabled") || (el as HTMLElement).dataset.noSound) return

            // Debounce: prevent sound spam from rapid clicks
            clickTimeout = setTimeout(() => { clickTimeout = null }, 50)

            const role = el.getAttribute("role")
            const tag = el.tagName?.toLowerCase()

            if (role === "switch")                     { playSound("toggleSwitch"); return }
            if (role === "checkbox" || role === "radio") { playSound("checkbox");     return }
            if (role === "tab")                         { playSound("tabSwitch");    return }
            if (tag === "a")                            { playSound("linkClick");    return }
            if (el.closest("nav, aside, [data-sidebar], [data-nav]")) { playSound("navClick"); return }
            playSound("buttonClick")
        }
        window.addEventListener("click", handleClick, { passive: true, capture: false })
        return () => { window.removeEventListener("click", handleClick); if (clickTimeout) clearTimeout(clickTimeout) }
    }, [playSound, soundVolume])

    // Hover sound — optimized with weakref tracking, passive listener
    React.useEffect(() => {
        let lastEl: WeakRef<Element> | null = null
        const handleHover = (e: MouseEvent) => {
            if (soundVolume <= 0) return
            const target = e.target as Element | null
            if (!target) return
            const el = target.closest(
                "button:not([disabled]), [role='button'], [role='tab'], [role='option'], [role='menuitem']",
            )
            if (!el || (el as HTMLElement).dataset.noSound) return
            if (lastEl?.deref() === el) return
            lastEl = new WeakRef(el)
            playSound("hover")
        }
        window.addEventListener("mouseover", handleHover, { passive: true, capture: false })
        return () => window.removeEventListener("mouseover", handleHover)
    }, [playSound, soundVolume])

    // Input focus sound — optimized focus handler, passive listener
    React.useEffect(() => {
        const handleFocus = (e: FocusEvent) => {
            if (soundVolume <= 0) return
            const target = e.target as Element | null
            if (!target) return
            const tag = target.tagName?.toLowerCase()
            const type = (target as HTMLInputElement).type?.toLowerCase()
            if (tag === "input" && type !== "hidden" && type !== "range" && type !== "checkbox" && type !== "radio") {
                playSound("inputFocus")
            } else if (tag === "textarea") {
                playSound("inputFocus")
            } else if (tag === "select" || target.getAttribute("role") === "combobox") {
                playSound("dropdownOpen")
            }
        }
        window.addEventListener("focusin", handleFocus, { passive: true, capture: false })
        return () => window.removeEventListener("focusin", handleFocus)
    }, [playSound, soundVolume])

    // Modal open/close sound via MutationObserver on data-state attribute
    React.useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type !== "attributes" || m.attributeName !== "data-state") continue
                const el = m.target as Element
                if (el.getAttribute("role") !== "dialog") continue
                const state = el.getAttribute("data-state")
                if (state === "open")   playSound("modalOpen")
                else if (state === "closed") playSound("modalClose")
            }
        })
        observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-state"] })
        return () => observer.disconnect()
    }, [playSound])

    const value = React.useMemo<SoundContextValue>(() => ({
        activeSoundPackId,
        setActiveSoundPackId,
        soundVolume,
        setSoundVolume,
        soundPacks: SOUND_PACKS,
        playSound,
        userLevel,
        setUserLevel,
        soundLevelRequirements: SOUND_LEVEL_REQUIREMENTS,
        extendedSoundLabels: EXTENDED_SOUND_LABELS,
    }), [activeSoundPackId, setActiveSoundPackId, soundVolume, setSoundVolume, playSound, userLevel, setUserLevel])

    return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>
}

export function useSound(): SoundContextValue {
    const ctx = React.useContext(SoundContext)
    if (!ctx) throw new Error("useSound must be used inside SoundProvider")
    return ctx
}
