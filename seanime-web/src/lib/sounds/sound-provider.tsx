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
    { id: "default",   name: "Default",     emoji: "🔔", description: "Clean system sounds",          requiredLevel: 1  },
    { id: "soft",      name: "Soft",        emoji: "🍃", description: "Gentle, subtle sounds",        requiredLevel: 5  },
    { id: "retro",     name: "Retro",       emoji: "👾", description: "8-bit game sounds",             requiredLevel: 10 },
    { id: "anime",     name: "Anime",       emoji: "⭐", description: "Anime-styled sound effects",   requiredLevel: 20 },
    { id: "cosmic",    name: "Cosmic",      emoji: "🌌", description: "Space-themed atmospheric",     requiredLevel: 35 },
    { id: "bamboo",    name: "Bamboo",      emoji: "🎍", description: "Traditional Japanese sounds",  requiredLevel: 50 },
]

type SoundName = "buttonClick" | "itemUnlock" | "notification" | "error" | "success"

// ── Web Audio synthesis ───────────────────────────────────────────────────────

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

type PackSoundFn = (ctx: AudioContext, vol: number) => void

const PACK_SOUNDS: Record<string, Record<SoundName, PackSoundFn>> = {
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
