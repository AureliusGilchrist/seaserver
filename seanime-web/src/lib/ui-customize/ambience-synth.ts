/**
 * Procedural ambience synthesizer.
 *
 * Each "kind" describes a way to build an audio graph from primitives:
 *   - filtered noise (white / pink / brown)
 *   - random impulses (drops, pops, crickets, clicks)
 *   - slow LFO modulation (waves, wind gusts)
 *   - bell / drone oscillators
 *
 * No asset files are required — everything is generated live.
 */

export type AmbienceKind =
    | "rain"
    | "thunder"
    | "forest"
    | "ocean"
    | "cafe"
    | "fireplace"
    | "night"
    | "vinyl"
    | "stream"
    | "wind"
    | "snow"
    | "shrine"
    | "train"
    | "library"
    | "space"
    | "bamboo"

// ─── Noise buffer cache ──────────────────────────────────────────────────────
let whiteBuf: AudioBuffer | null = null
let pinkBuf: AudioBuffer | null = null
let brownBuf: AudioBuffer | null = null

function getWhiteNoise(ctx: AudioContext): AudioBuffer {
    if (whiteBuf) return whiteBuf
    const len = ctx.sampleRate * 4
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    whiteBuf = buf
    return buf
}

function getPinkNoise(ctx: AudioContext): AudioBuffer {
    if (pinkBuf) return pinkBuf
    const len = ctx.sampleRate * 4
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.96900 * b2 + w * 0.1538520
        b3 = 0.86650 * b3 + w * 0.3104856
        b4 = 0.55000 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.0168980
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
        b6 = w * 0.115926
    }
    pinkBuf = buf
    return buf
}

function getBrownNoise(ctx: AudioContext): AudioBuffer {
    if (brownBuf) return brownBuf
    const len = ctx.sampleRate * 4
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1
        last = (last + 0.02 * w) / 1.02
        data[i] = last * 3.5
    }
    brownBuf = buf
    return buf
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loopNoise(ctx: AudioContext, kind: "white" | "pink" | "brown"): AudioBufferSourceNode {
    const src = ctx.createBufferSource()
    src.buffer = kind === "white" ? getWhiteNoise(ctx) : kind === "pink" ? getPinkNoise(ctx) : getBrownNoise(ctx)
    src.loop = true
    src.start()
    return src
}

function makeBiquad(ctx: AudioContext, type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode {
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    return f
}

function makeLfo(ctx: AudioContext, freq: number, depth: number, target: AudioParam, base: number) {
    const lfo = ctx.createOscillator()
    lfo.type = "sine"
    lfo.frequency.value = freq
    const gain = ctx.createGain()
    gain.gain.value = depth
    target.value = base
    lfo.connect(gain)
    gain.connect(target)
    lfo.start()
    return { lfo, gain }
}

// schedules `cb` at random intervals between minMs..maxMs until cancelled
function scheduleRandom(minMs: number, maxMs: number, cb: () => void): () => void {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = () => {
        if (cancelled) return
        cb()
        timer = setTimeout(tick, minMs + Math.random() * (maxMs - minMs))
    }
    timer = setTimeout(tick, minMs + Math.random() * (maxMs - minMs))
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
}

// ─── Builder type ────────────────────────────────────────────────────────────

export interface AmbienceVoice {
    /** stop and disconnect every node owned by this voice */
    stop: () => void
    /** master output gain — caller sets volume on this */
    output: GainNode
}

type Builder = (ctx: AudioContext) => AmbienceVoice

// ─── Individual ambience builders ────────────────────────────────────────────

function rain(ctx: AudioContext, heavy = false): AmbienceVoice {
    const out = ctx.createGain()
    out.gain.value = 1
    const src = loopNoise(ctx, "white")
    const hp = makeBiquad(ctx, "highpass", heavy ? 400 : 600)
    const lp = makeBiquad(ctx, "lowpass", heavy ? 8000 : 6000)
    const body = ctx.createGain()
    body.gain.value = heavy ? 0.45 : 0.3
    src.connect(hp).connect(lp).connect(body).connect(out)

    // Occasional drops
    const cancelDrops = scheduleRandom(40, 180, () => {
        const drop = ctx.createOscillator()
        drop.type = "sine"
        const f = 1200 + Math.random() * 2200
        drop.frequency.setValueAtTime(f, ctx.currentTime)
        drop.frequency.exponentialRampToValueAtTime(f * 0.3, ctx.currentTime + 0.05)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, ctx.currentTime)
        g.gain.linearRampToValueAtTime(0.04 + Math.random() * 0.04, ctx.currentTime + 0.005)
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06)
        drop.connect(g).connect(out)
        drop.start()
        drop.stop(ctx.currentTime + 0.07)
    })

    return {
        output: out,
        stop: () => { src.stop(); cancelDrops(); src.disconnect(); hp.disconnect(); lp.disconnect(); body.disconnect(); out.disconnect() },
    }
}

function thunder(ctx: AudioContext): AmbienceVoice {
    const r = rain(ctx, true)
    // periodic distant rumble
    const cancel = scheduleRandom(8000, 22000, () => {
        const dur = 3 + Math.random() * 3
        const n = ctx.createBufferSource()
        n.buffer = getBrownNoise(ctx)
        n.loop = true
        const f = makeBiquad(ctx, "lowpass", 120 + Math.random() * 80)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, ctx.currentTime)
        g.gain.linearRampToValueAtTime(0.7 + Math.random() * 0.3, ctx.currentTime + 0.4)
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
        n.connect(f).connect(g).connect(r.output)
        n.start()
        n.stop(ctx.currentTime + dur + 0.1)
    })
    return {
        output: r.output,
        stop: () => { cancel(); r.stop() },
    }
}

function forest(ctx: AudioContext): AmbienceVoice {
    const out = ctx.createGain()
    const wind = loopNoise(ctx, "pink")
    const lp = makeBiquad(ctx, "lowpass", 2200)
    const g = ctx.createGain()
    g.gain.value = 0.18
    wind.connect(lp).connect(g).connect(out)

    const cancelBirds = scheduleRandom(800, 4500, () => {
        const o = ctx.createOscillator()
        o.type = "sine"
        const base = 1800 + Math.random() * 2400
        const t = ctx.currentTime
        o.frequency.setValueAtTime(base, t)
        o.frequency.linearRampToValueAtTime(base * 1.4, t + 0.08)
        o.frequency.linearRampToValueAtTime(base * 0.9, t + 0.16)
        const og = ctx.createGain()
        og.gain.setValueAtTime(0, t)
        og.gain.linearRampToValueAtTime(0.05, t + 0.02)
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
        o.connect(og).connect(out)
        o.start(t)
        o.stop(t + 0.2)
    })

    return {
        output: out,
        stop: () => { wind.stop(); cancelBirds(); wind.disconnect(); lp.disconnect(); g.disconnect(); out.disconnect() },
    }
}

function ocean(ctx: AudioContext): AmbienceVoice {
    const out = ctx.createGain()
    const src = loopNoise(ctx, "pink")
    const lp = makeBiquad(ctx, "lowpass", 1100)
    const wave = ctx.createGain()
    wave.gain.value = 0.25
    src.connect(lp).connect(wave).connect(out)
    // slow gain LFO simulating waves
    makeLfo(ctx, 0.13, 0.18, wave.gain, 0.25)
    return {
        output: out,
        stop: () => { src.stop(); src.disconnect(); lp.disconnect(); wave.disconnect(); out.disconnect() },
    }
}

function cafe(ctx: AudioContext): AmbienceVoice {
    const out = ctx.createGain()
    const src = loopNoise(ctx, "brown")
    const bp = makeBiquad(ctx, "bandpass", 500, 0.6)
    const g = ctx.createGain()
    g.gain.value = 0.45
    src.connect(bp).connect(g).connect(out)
    makeLfo(ctx, 0.4, 0.1, g.gain, 0.45)
    // occasional cup/spoon clinks
    const cancelClinks = scheduleRandom(3000, 9000, () => {
        const o = ctx.createOscillator()
        o.type = "triangle"
        const f = 2500 + Math.random() * 1500
        const t = ctx.currentTime
        o.frequency.setValueAtTime(f, t)
        const og = ctx.createGain()
        og.gain.setValueAtTime(0.02, t)
        og.gain.exponentialRampToValueAtTime(0.0001, t + 0.4)
        o.connect(og).connect(out)
        o.start(t)
        o.stop(t + 0.45)
    })
    return {
        output: out,
        stop: () => { src.stop(); cancelClinks(); src.disconnect(); bp.disconnect(); g.disconnect(); out.disconnect() },
    }
}

function fireplace(ctx: AudioContext): AmbienceVoice {
    const out = ctx.createGain()
    const src = loopNoise(ctx, "pink")
    const lp = makeBiquad(ctx, "lowpass", 900)
    const g = ctx.createGain()
    g.gain.value = 0.3
    src.connect(lp).connect(g).connect(out)
    const cancelPops = scheduleRandom(150, 1200, () => {
        const n = ctx.createBufferSource()
        n.buffer = getWhiteNoise(ctx)
        const bp = makeBiquad(ctx, "bandpass", 1500 + Math.random() * 1500, 4)
        const ng = ctx.createGain()
        const t = ctx.currentTime
        ng.gain.setValueAtTime(0, t)
        ng.gain.linearRampToValueAtTime(0.06 + Math.random() * 0.05, t + 0.005)
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.08)
        n.connect(bp).connect(ng).connect(out)
        n.start(t)
        n.stop(t + 0.1)
    })
    return {
        output: out,
        stop: () => { src.stop(); cancelPops(); src.disconnect(); lp.disconnect(); g.disconnect(); out.disconnect() },
    }
}

function night(ctx: AudioContext): AmbienceVoice {
    const out = ctx.createGain()
    const src = loopNoise(ctx, "pink")
    const lp = makeBiquad(ctx, "lowpass", 1500)
    const g = ctx.createGain()
    g.gain.value = 0.12
    src.connect(lp).connect(g).connect(out)
    // crickets
    const cancelCrickets = scheduleRandom(180, 600, () => {
        const o = ctx.createOscillator()
        o.type = "square"
        const f = 4500 + Math.random() * 800
        const t = ctx.currentTime
        o.frequency.setValueAtTime(f, t)
        const og = ctx.createGain()
        og.gain.setValueAtTime(0, t)
        // ~3 chirps
        for (let i = 0; i < 3; i++) {
            const ti = t + i * 0.1
            og.gain.linearRampToValueAtTime(0.015, ti + 0.005)
            og.gain.linearRampToValueAtTime(0, ti + 0.04)
        }
        o.connect(og).connect(out)
        o.start(t)
        o.stop(t + 0.35)
    })
    return {
        output: out,
        stop: () => { src.stop(); cancelCrickets(); src.disconnect(); lp.disconnect(); g.disconnect(); out.disconnect() },
    }
}

function vinyl(ctx: AudioContext): AmbienceVoice {
    const out = ctx.createGain()
    const src = loopNoise(ctx, "pink")
    const hp = makeBiquad(ctx, "highpass", 300)
    const lp = makeBiquad(ctx, "lowpass", 6000)
    const g = ctx.createGain()
    g.gain.value = 0.15
    src.connect(hp).connect(lp).connect(g).connect(out)
    // crackles
    const cancelCrackles = scheduleRandom(60, 300, () => {
        const n = ctx.createBufferSource()
        n.buffer = getWhiteNoise(ctx)
        const bp = makeBiquad(ctx, "bandpass", 3000 + Math.random() * 2000, 6)
        const ng = ctx.createGain()
        const t = ctx.currentTime
        ng.gain.setValueAtTime(0.08 + Math.random() * 0.05, t)
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.04)
        n.connect(bp).connect(ng).connect(out)
        n.start(t)
        n.stop(t + 0.05)
    })
    return {
        output: out,
        stop: () => { src.stop(); cancelCrackles(); src.disconnect(); hp.disconnect(); lp.disconnect(); g.disconnect(); out.disconnect() },
    }
}

function stream(ctx: AudioContext): AmbienceVoice {
    const out = ctx.createGain()
    const src = loopNoise(ctx, "pink")
    const hp = makeBiquad(ctx, "highpass", 400)
    const lp = makeBiquad(ctx, "lowpass", 5000)
    const g = ctx.createGain()
    g.gain.value = 0.28
    src.connect(hp).connect(lp).connect(g).connect(out)
    makeLfo(ctx, 0.7, 0.06, g.gain, 0.28)
    // bubble pops
    const cancelBubbles = scheduleRandom(200, 700, () => {
        const o = ctx.createOscillator()
        o.type = "sine"
        const t = ctx.currentTime
        const f = 600 + Math.random() * 1200
        o.frequency.setValueAtTime(f, t)
        o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.05)
        const og = ctx.createGain()
        og.gain.setValueAtTime(0, t)
        og.gain.linearRampToValueAtTime(0.04, t + 0.005)
        og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08)
        o.connect(og).connect(out)
        o.start(t)
        o.stop(t + 0.1)
    })
    return {
        output: out,
        stop: () => { src.stop(); cancelBubbles(); src.disconnect(); hp.disconnect(); lp.disconnect(); g.disconnect(); out.disconnect() },
    }
}

function wind(ctx: AudioContext): AmbienceVoice {
    const out = ctx.createGain()
    const src = loopNoise(ctx, "pink")
    const lp = makeBiquad(ctx, "lowpass", 800)
    const g = ctx.createGain()
    g.gain.value = 0.3
    src.connect(lp).connect(g).connect(out)
    makeLfo(ctx, 0.08, 0.2, g.gain, 0.3)
    makeLfo(ctx, 0.05, 400, lp.frequency, 800)
    return {
        output: out,
        stop: () => { src.stop(); src.disconnect(); lp.disconnect(); g.disconnect(); out.disconnect() },
    }
}

function snow(ctx: AudioContext): AmbienceVoice {
    const out = ctx.createGain()
    const src = loopNoise(ctx, "pink")
    const lp = makeBiquad(ctx, "lowpass", 500)
    const g = ctx.createGain()
    g.gain.value = 0.18
    src.connect(lp).connect(g).connect(out)
    makeLfo(ctx, 0.04, 0.06, g.gain, 0.18)
    return {
        output: out,
        stop: () => { src.stop(); src.disconnect(); lp.disconnect(); g.disconnect(); out.disconnect() },
    }
}

function shrine(ctx: AudioContext): AmbienceVoice {
    const w = wind(ctx)
    // bells: occasional sine clusters with long decay
    const cancelBells = scheduleRandom(7000, 18000, () => {
        const t = ctx.currentTime
        const fund = 380 + Math.random() * 80
        const partials = [1, 2.01, 3.03, 4.95]
        for (const p of partials) {
            const o = ctx.createOscillator()
            o.type = "sine"
            o.frequency.value = fund * p
            const og = ctx.createGain()
            og.gain.setValueAtTime(0, t)
            og.gain.linearRampToValueAtTime(0.06 / p, t + 0.01)
            og.gain.exponentialRampToValueAtTime(0.0001, t + 4)
            o.connect(og).connect(w.output)
            o.start(t)
            o.stop(t + 4.2)
        }
    })
    return {
        output: w.output,
        stop: () => { cancelBells(); w.stop() },
    }
}

function train(ctx: AudioContext): AmbienceVoice {
    const out = ctx.createGain()
    const src = loopNoise(ctx, "brown")
    const lp = makeBiquad(ctx, "lowpass", 250)
    const g = ctx.createGain()
    g.gain.value = 0.5
    src.connect(lp).connect(g).connect(out)
    // rhythmic clacks
    const cancelClacks = scheduleRandom(380, 480, () => {
        const n = ctx.createBufferSource()
        n.buffer = getWhiteNoise(ctx)
        const bp = makeBiquad(ctx, "bandpass", 200, 4)
        const ng = ctx.createGain()
        const t = ctx.currentTime
        ng.gain.setValueAtTime(0, t)
        ng.gain.linearRampToValueAtTime(0.12, t + 0.005)
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
        n.connect(bp).connect(ng).connect(out)
        n.start(t)
        n.stop(t + 0.08)
    })
    return {
        output: out,
        stop: () => { src.stop(); cancelClacks(); src.disconnect(); lp.disconnect(); g.disconnect(); out.disconnect() },
    }
}

function library(ctx: AudioContext): AmbienceVoice {
    const out = ctx.createGain()
    const src = loopNoise(ctx, "brown")
    const lp = makeBiquad(ctx, "lowpass", 350)
    const g = ctx.createGain()
    g.gain.value = 0.18
    src.connect(lp).connect(g).connect(out)
    // page turns
    const cancelPages = scheduleRandom(6000, 16000, () => {
        const n = ctx.createBufferSource()
        n.buffer = getWhiteNoise(ctx)
        const bp = makeBiquad(ctx, "bandpass", 4000, 1.5)
        const ng = ctx.createGain()
        const t = ctx.currentTime
        ng.gain.setValueAtTime(0, t)
        ng.gain.linearRampToValueAtTime(0.04, t + 0.04)
        ng.gain.linearRampToValueAtTime(0, t + 0.25)
        n.connect(bp).connect(ng).connect(out)
        n.start(t)
        n.stop(t + 0.3)
    })
    return {
        output: out,
        stop: () => { src.stop(); cancelPages(); src.disconnect(); lp.disconnect(); g.disconnect(); out.disconnect() },
    }
}

function space(ctx: AudioContext): AmbienceVoice {
    const out = ctx.createGain()
    // deep drone
    const o1 = ctx.createOscillator(); o1.type = "sine"; o1.frequency.value = 55
    const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = 82.5
    const o3 = ctx.createOscillator(); o3.type = "sine"; o3.frequency.value = 110
    const dg = ctx.createGain(); dg.gain.value = 0.18
    o1.connect(dg); o2.connect(dg); o3.connect(dg); dg.connect(out)
    makeLfo(ctx, 0.05, 0.06, dg.gain, 0.18)
    o1.start(); o2.start(); o3.start()
    // faint static
    const src = loopNoise(ctx, "pink")
    const lp = makeBiquad(ctx, "lowpass", 1200)
    const sg = ctx.createGain(); sg.gain.value = 0.04
    src.connect(lp).connect(sg).connect(out)
    // occasional shimmer
    const cancelShimmer = scheduleRandom(4000, 12000, () => {
        const o = ctx.createOscillator()
        o.type = "sine"
        const t = ctx.currentTime
        const f = 800 + Math.random() * 1600
        o.frequency.setValueAtTime(f, t)
        const og = ctx.createGain()
        og.gain.setValueAtTime(0, t)
        og.gain.linearRampToValueAtTime(0.03, t + 0.6)
        og.gain.linearRampToValueAtTime(0, t + 1.6)
        o.connect(og).connect(out)
        o.start(t)
        o.stop(t + 1.8)
    })
    return {
        output: out,
        stop: () => {
            try { o1.stop(); o2.stop(); o3.stop(); src.stop() } catch {}
            cancelShimmer()
            o1.disconnect(); o2.disconnect(); o3.disconnect(); dg.disconnect(); src.disconnect(); lp.disconnect(); sg.disconnect(); out.disconnect()
        },
    }
}

function bamboo(ctx: AudioContext): AmbienceVoice {
    const w = wind(ctx)
    const cancelClicks = scheduleRandom(1200, 4000, () => {
        const o = ctx.createOscillator()
        o.type = "sine"
        const t = ctx.currentTime
        const f = 600 + Math.random() * 800
        o.frequency.setValueAtTime(f, t)
        o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.18)
        const og = ctx.createGain()
        og.gain.setValueAtTime(0, t)
        og.gain.linearRampToValueAtTime(0.05, t + 0.005)
        og.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
        o.connect(og).connect(w.output)
        o.start(t)
        o.stop(t + 0.25)
    })
    return {
        output: w.output,
        stop: () => { cancelClicks(); w.stop() },
    }
}

// ─── Registry ────────────────────────────────────────────────────────────────

const BUILDERS: Record<AmbienceKind, Builder> = {
    rain:      ctx => rain(ctx, false),
    thunder:   ctx => thunder(ctx),
    forest:    ctx => forest(ctx),
    ocean:     ctx => ocean(ctx),
    cafe:      ctx => cafe(ctx),
    fireplace: ctx => fireplace(ctx),
    night:     ctx => night(ctx),
    vinyl:     ctx => vinyl(ctx),
    stream:    ctx => stream(ctx),
    wind:      ctx => wind(ctx),
    snow:      ctx => snow(ctx),
    shrine:    ctx => shrine(ctx),
    train:     ctx => train(ctx),
    library:   ctx => library(ctx),
    space:     ctx => space(ctx),
    bamboo:    ctx => bamboo(ctx),
}

export function buildAmbience(ctx: AudioContext, kind: AmbienceKind): AmbienceVoice {
    return BUILDERS[kind](ctx)
}
