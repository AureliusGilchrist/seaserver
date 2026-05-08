"use client"

import React from "react"
import { atomWithStorage } from "jotai/utils"
import { useAtom } from "jotai/react"
import { useUICustomize } from "./ui-customize-provider"
import { seaJotaiStorage } from "@/lib/sea-storage/sea-storage"
import { buildAmbience, type AmbienceKind, type AmbienceVoice } from "./ambience-synth"

const ambienceVolumeAtom = atomWithStorage<number>("sea-ambience-volume", 0.5, seaJotaiStorage)
const ambienceEnabledAtom = atomWithStorage<boolean>("sea-ambience-enabled", true, seaJotaiStorage)

export function useAmbienceVolume() {
    return useAtom(ambienceVolumeAtom)
}

export function useAmbienceEnabled() {
    return useAtom(ambienceEnabledAtom)
}

const VALID_KINDS: ReadonlyArray<AmbienceKind> = [
    "rain", "thunder", "forest", "ocean", "cafe", "fireplace",
    "night", "vinyl", "stream", "wind", "snow", "shrine",
    "train", "library", "space", "bamboo",
]

function presetIdToKind(id: string): AmbienceKind | null {
    if (!id || id === "ambience-none") return null
    const k = id.startsWith("ambience-") ? id.slice("ambience-".length) : id
    return (VALID_KINDS as ReadonlyArray<string>).includes(k) ? k as AmbienceKind : null
}

/**
 * Procedural ambient sound player. Synthesizes ambient audio in real-time
 * via the Web Audio API (no asset files). Selection comes from
 * `useUICustomize().state.ambience`; volume/on-off persisted via seaStorage.
 */
export function AmbiencePlayer() {
    const { state } = useUICustomize()
    const [volume] = useAtom(ambienceVolumeAtom)
    const [enabled] = useAtom(ambienceEnabledAtom)

    const ctxRef = React.useRef<AudioContext | null>(null)
    const masterRef = React.useRef<GainNode | null>(null)
    const voiceRef = React.useRef<AmbienceVoice | null>(null)

    const targetKind = presetIdToKind(state.ambience)
    const active = enabled && targetKind !== null

    // Build/teardown voice when target preset or active flag changes
    React.useEffect(() => {
        if (typeof window === "undefined") return

        const tearDown = () => {
            if (voiceRef.current) {
                try { voiceRef.current.stop() } catch { /* noop */ }
                voiceRef.current = null
            }
        }

        if (!active || !targetKind) {
            tearDown()
            return
        }

        // Lazy create context (will need user gesture to actually start playing)
        if (!ctxRef.current) {
            try {
                const AC: typeof AudioContext =
                    (window.AudioContext as typeof AudioContext) ||
                    ((window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext as typeof AudioContext)
                if (!AC) return
                const ctx = new AC()
                const master = ctx.createGain()
                master.gain.value = volume
                master.connect(ctx.destination)
                ctxRef.current = ctx
                masterRef.current = master
            } catch {
                return
            }
        }

        const ctx = ctxRef.current
        const master = masterRef.current
        if (!ctx || !master) return

        if (ctx.state === "suspended") {
            ctx.resume().catch(() => { /* will retry on next user gesture */ })
        }

        tearDown()

        try {
            const voice = buildAmbience(ctx, targetKind)
            voice.output.connect(master)
            voiceRef.current = voice
        } catch {
            voiceRef.current = null
        }

        return tearDown
    }, [active, targetKind])

    // Apply volume changes smoothly
    React.useEffect(() => {
        const master = masterRef.current
        const ctx = ctxRef.current
        if (!master || !ctx) return
        const v = Math.max(0, Math.min(1, volume))
        try {
            master.gain.cancelScheduledValues(ctx.currentTime)
            master.gain.linearRampToValueAtTime(v, ctx.currentTime + 0.05)
        } catch {
            master.gain.value = v
        }
    }, [volume])

    // Try to resume context on user interaction (handles browser autoplay block)
    React.useEffect(() => {
        if (typeof window === "undefined") return
        const tryResume = () => {
            const ctx = ctxRef.current
            if (ctx && ctx.state === "suspended") {
                ctx.resume().catch(() => { /* noop */ })
            }
        }
        window.addEventListener("pointerdown", tryResume)
        window.addEventListener("keydown", tryResume)
        return () => {
            window.removeEventListener("pointerdown", tryResume)
            window.removeEventListener("keydown", tryResume)
        }
    }, [])

    // Cleanup on unmount
    React.useEffect(() => {
        return () => {
            if (voiceRef.current) {
                try { voiceRef.current.stop() } catch { /* noop */ }
                voiceRef.current = null
            }
            if (ctxRef.current) {
                try { ctxRef.current.close() } catch { /* noop */ }
                ctxRef.current = null
                masterRef.current = null
            }
        }
    }, [])

    return null
}
