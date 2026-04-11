"use client"
import React from "react"
import { useAtomValue } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { ANIME_THEMES, ANIME_THEME_LIST } from "@/lib/theme/anime-themes"
import type { AnimeThemeId, AnimeThemeConfig } from "@/lib/theme/anime-themes"
import { ThemeAnimatedOverlay } from "@/lib/theme/anime-themes/animated-elements"

// ─────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────

type AnimeThemeContextValue = {
    themeId: AnimeThemeId
    config: AnimeThemeConfig
    setThemeId: (id: AnimeThemeId) => void
    isEventActive: boolean
    triggerEvent: () => void
    musicEnabled: boolean
    setMusicEnabled: (v: boolean) => void
    musicVolume: number
    setMusicVolume: (v: number) => void
    animatedIntensity: number
    setAnimatedIntensity: (v: number) => void
}

const AnimeThemeContext = React.createContext<AnimeThemeContextValue | null>(null)

export function useAnimeTheme(): AnimeThemeContextValue {
    const ctx = React.useContext(AnimeThemeContext)
    if (!ctx) throw new Error("useAnimeTheme must be used inside AnimeThemeProvider")
    return ctx
}

/**
 * Safe version — returns null if called outside AnimeThemeProvider.
 * Use this in sidebar/layout components to prevent a missing-provider crash
 * from cascading up and hiding sibling UI (e.g. the user avatar dropdown).
 */
export function useAnimeThemeOrNull(): AnimeThemeContextValue | null {
    return React.useContext(AnimeThemeContext)
}

// ─────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────

export function AnimeThemeProvider({ children }: { children: React.ReactNode }) {
    const currentProfile = useAtomValue(currentProfileAtom)
    const profileKey = currentProfile?.id ? String(currentProfile.id) : "default"

    // ── Theme persistence ──
    const [themeId, setThemeIdRaw] = React.useState<AnimeThemeId>(() => {
        if (typeof window === "undefined") return "seanime"
        try {
            const stored = localStorage.getItem(`sea-anime-theme-${profileKey}`)
            if (stored && stored in ANIME_THEMES) return stored as AnimeThemeId
        } catch { /* noop */ }
        return "seanime"
    })

    // Reload from storage when profile changes
    React.useEffect(() => {
        try {
            const stored = localStorage.getItem(`sea-anime-theme-${profileKey}`)
            if (stored && stored in ANIME_THEMES) {
                setThemeIdRaw(stored as AnimeThemeId)
            } else {
                setThemeIdRaw("seanime")
            }
        } catch { /* noop */ }
    }, [profileKey])

    const setThemeId = React.useCallback((id: AnimeThemeId) => {
        setThemeIdRaw(id)
        try {
            localStorage.setItem(`sea-anime-theme-${profileKey}`, id)
        } catch { /* noop */ }
    }, [profileKey])

    const config = ANIME_THEMES[themeId as AnimeThemeId] ?? ANIME_THEMES["seanime"]

    // ── Music state ──
    const [musicEnabled, setMusicEnabledRaw] = React.useState<boolean>(() => {
        if (typeof window === "undefined") return false
        try {
            return localStorage.getItem(`sea-anime-music-${profileKey}`) === "true"
        } catch { return false }
    })
    const [musicVolume, setMusicVolumeRaw] = React.useState<number>(() => {
        if (typeof window === "undefined") return 0.3
        try {
            const v = parseFloat(localStorage.getItem(`sea-anime-vol-${profileKey}`) ?? "")
            return isNaN(v) ? 0.3 : Math.max(0, Math.min(1, v))
        } catch { return 0.3 }
    })

    const setMusicEnabled = React.useCallback((v: boolean) => {
        setMusicEnabledRaw(v)
        try { localStorage.setItem(`sea-anime-music-${profileKey}`, String(v)) } catch { }
    }, [profileKey])

    const setMusicVolume = React.useCallback((v: number) => {
        setMusicVolumeRaw(v)
        try { localStorage.setItem(`sea-anime-vol-${profileKey}`, String(v)) } catch { }
    }, [profileKey])

    // ── Animated elements intensity ──
    const [animatedIntensity, setAnimatedIntensityRaw] = React.useState<number>(() => {
        if (typeof window === "undefined") return 50
        try {
            const v = parseInt(localStorage.getItem(`sea-anime-particles-${profileKey}`) ?? "", 10)
            return isNaN(v) ? 50 : Math.max(0, Math.min(100, v))
        } catch { return 50 }
    })

    const setAnimatedIntensity = React.useCallback((v: number) => {
        const clamped = Math.max(0, Math.min(100, v))
        setAnimatedIntensityRaw(clamped)
        try { localStorage.setItem(`sea-anime-particles-${profileKey}`, String(clamped)) } catch { }
    }, [profileKey])

    // ── CSS var injection ──
    React.useEffect(() => {
        const root = document.documentElement
        const vars = config.cssVars
        Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v as string))

        return () => {
            // On cleanup, clear only the vars this theme set (next theme will overwrite)
            Object.keys(vars).forEach(k => root.style.removeProperty(k))
        }
    }, [config])

    // ── Google Font injection ──
    React.useEffect(() => {
        const prevLink = document.getElementById("anime-theme-font")
        if (prevLink) prevLink.remove()
        if (!config.fontHref) return

        const link = document.createElement("link")
        link.id = "anime-theme-font"
        link.rel = "stylesheet"
        link.href = config.fontHref
        document.head.appendChild(link)

        return () => {
            const el = document.getElementById("anime-theme-font")
            if (el) el.remove()
        }
    }, [config.fontHref])

    // ── Global font-family override ──
    React.useEffect(() => {
        if (config.fontFamily && config.id !== "seanime") {
            document.documentElement.style.setProperty("--font-anime-theme", config.fontFamily)
        } else {
            document.documentElement.style.removeProperty("--font-anime-theme")
        }
    }, [config.fontFamily, config.id])

    // ── Event engine ──
    const [isEventActive, setIsEventActive] = React.useState(false)
    const eventTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    const eventEndRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    const audioRef = React.useRef<HTMLAudioElement | null>(null)

    const triggerEvent = React.useCallback(() => {
        if (config.id === "seanime") return
        if (isEventActive) return

        setIsEventActive(true)

        // Voice synthesis
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
            const utter = new SpeechSynthesisUtterance(config.event.voiceText)
            utter.pitch = config.event.voicePitch
            utter.rate = config.event.voiceRate
            window.speechSynthesis.speak(utter)
        }

        // Audio clip
        if (config.event.audioClipPath) {
            try {
                const audio = new Audio(config.event.audioClipPath)
                audio.volume = 0.8
                audio.play().catch(() => { /* user hasn't interacted yet, ignore */ })
                audioRef.current = audio
            } catch { /* noop */ }
        }

        // Gear 5 body bounce
        if (config.event.isGear5) {
            document.body.classList.add("gear-5-active")
        }

        // End event
        if (eventEndRef.current) clearTimeout(eventEndRef.current)
        eventEndRef.current = setTimeout(() => {
            setIsEventActive(false)
            if (config.event.isGear5) {
                document.body.classList.remove("gear-5-active")
            }
        }, config.event.durationMs)
    }, [config, isEventActive])

    // Random timer: 1-3 hours
    const scheduleNextEvent = React.useCallback(() => {
        if (eventTimerRef.current) clearTimeout(eventTimerRef.current)
        if (config.id === "seanime") return

        const minMs = 60 * 60 * 1000       // 1 hour
        const maxMs = 3 * 60 * 60 * 1000   // 3 hours
        const delay = minMs + Math.random() * (maxMs - minMs)

        eventTimerRef.current = setTimeout(() => {
            triggerEvent()
            scheduleNextEvent()
        }, delay)
    }, [config.id, triggerEvent])

    React.useEffect(() => {
        scheduleNextEvent()
        return () => {
            if (eventTimerRef.current) clearTimeout(eventTimerRef.current)
            if (eventEndRef.current) clearTimeout(eventEndRef.current)
        }
    }, [scheduleNextEvent])

    // Clean up Gear 5 on theme switch
    React.useEffect(() => {
        document.body.classList.remove("gear-5-active")
        setIsEventActive(false)
    }, [themeId])

    const value = React.useMemo<AnimeThemeContextValue>(() => ({
        themeId,
        config,
        setThemeId,
        isEventActive,
        triggerEvent,
        musicEnabled,
        setMusicEnabled,
        musicVolume,
        setMusicVolume,
        animatedIntensity,
        setAnimatedIntensity,
    }), [themeId, config, setThemeId, isEventActive, triggerEvent, musicEnabled, setMusicEnabled, musicVolume, setMusicVolume, animatedIntensity, setAnimatedIntensity])

    return (
        <AnimeThemeContext.Provider value={value}>
            {children}
            <AnimeThemeMusicPlayer />
            {config.hasAnimatedElements && <ThemeAnimatedOverlay themeId={themeId} intensity={animatedIntensity} />}
            {isEventActive && config.id === "naruto" && <NarutoEventOverlay />}
            {isEventActive && config.id === "bleach" && <BleachBankaiOverlay />}
            {isEventActive && config.id === "one-piece" && <OnePieceGear5Overlay />}
        </AnimeThemeContext.Provider>
    )
}

// ─────────────────────────────────────────────────────────────────
// Music Player
// ─────────────────────────────────────────────────────────────────

function AnimeThemeMusicPlayer() {
    const { config, musicEnabled, musicVolume } = useAnimeTheme()
    const audioRef = React.useRef<HTMLAudioElement | null>(null)

    React.useEffect(() => {
        if (!audioRef.current) return
        audioRef.current.volume = musicVolume
    }, [musicVolume])

    React.useEffect(() => {
        if (!audioRef.current) return
        if (musicEnabled && config.musicUrl && config.id !== "seanime") {
            audioRef.current.play().catch(() => { })
        } else {
            audioRef.current.pause()
        }
    }, [musicEnabled, config.musicUrl, config.id])

    if (!config.musicUrl || config.id === "seanime") return null

    return (
        <audio
            ref={audioRef}
            src={config.musicUrl}
            loop
            preload="none"
            style={{ display: "none" }}
        />
    )
}

// ─────────────────────────────────────────────────────────────────
// Event Overlays
// ─────────────────────────────────────────────────────────────────

function NarutoEventOverlay() {
    const [phase, setPhase] = React.useState<"burst" | "text" | "fade">("burst")

    React.useEffect(() => {
        const t1 = setTimeout(() => setPhase("text"), 600)
        const t2 = setTimeout(() => setPhase("fade"), 4000)
        return () => { clearTimeout(t1); clearTimeout(t2) }
    }, [])

    return (
        <div
            className="fixed inset-0 pointer-events-none z-[9999] flex items-center justify-center overflow-hidden"
            style={{
                transition: "opacity 1s ease",
                opacity: phase === "fade" ? 0 : 1,
            }}
        >
            {/* Radial flame burst */}
            <div
                className="absolute inset-0"
                style={{
                    background: phase === "burst"
                        ? "radial-gradient(circle at center, rgba(255,120,0,0.7) 0%, rgba(200,40,0,0.4) 40%, transparent 75%)"
                        : "radial-gradient(circle at center, rgba(255,80,0,0.35) 0%, rgba(200,40,0,0.15) 50%, transparent 80%)",
                    transition: "background 0.6s ease",
                }}
            />
            {/* Nine-tails cloak veins */}
            <div
                className="absolute inset-0 opacity-20"
                style={{
                    background: "repeating-conic-gradient(rgba(255,80,0,0.3) 0deg, transparent 5deg, transparent 18deg, rgba(255,80,0,0.3) 20deg)",
                    animation: phase !== "fade" ? "spin 8s linear infinite" : undefined,
                }}
            />
            {phase === "text" && (
                <div
                    className="relative text-center"
                    style={{
                        animation: "narutoTextPop 0.4s cubic-bezier(0.17, 0.89, 0.32, 1.28) both",
                        fontFamily: "'Bangers', cursive",
                        color: "#ff6a00",
                        textShadow: "0 0 30px rgba(255,80,0,0.9), 0 0 60px rgba(255,40,0,0.5), 3px 3px 0 #000",
                        fontSize: "clamp(2.5rem, 8vw, 6rem)",
                        letterSpacing: "0.1em",
                        lineHeight: 1.1,
                    }}
                >
                    NINE-TAILS<br />CHAKRA MODE
                </div>
            )}
        </div>
    )
}

function BleachBankaiOverlay() {
    const [phase, setPhase] = React.useState<"flash" | "ban" | "kai" | "fade">("flash")

    React.useEffect(() => {
        const t1 = setTimeout(() => setPhase("ban"), 400)
        const t2 = setTimeout(() => setPhase("kai"), 1600)
        const t3 = setTimeout(() => setPhase("fade"), 4500)
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
    }, [])

    return (
        <div
            className="fixed inset-0 pointer-events-none z-[9999] flex items-center justify-center overflow-hidden"
            style={{
                transition: "opacity 1.5s ease",
                opacity: phase === "fade" ? 0 : 1,
                background: phase === "flash" ? "rgba(240,240,255,0.95)" : "transparent",
            }}
        >
            {(phase === "ban" || phase === "kai") && (
                <div
                    className="absolute inset-0"
                    style={{
                        background: "radial-gradient(ellipse at center, rgba(80,90,180,0.18) 0%, transparent 70%)",
                    }}
                />
            )}
            {phase === "ban" && (
                <div
                    style={{
                        fontFamily: "'Cinzel Decorative', cursive",
                        color: "#d0d8ff",
                        fontSize: "clamp(4rem, 14vw, 11rem)",
                        fontWeight: 900,
                        textShadow: "0 0 40px rgba(160,170,255,0.9), 0 0 80px rgba(100,120,255,0.5), 4px 4px 0 #000",
                        letterSpacing: "0.2em",
                        animation: "bleachZoomIn 0.5s cubic-bezier(0.17, 0.89, 0.32, 1.28) both",
                    }}
                >
                    BAN.
                </div>
            )}
            {phase === "kai" && (
                <div
                    style={{
                        fontFamily: "'Cinzel Decorative', cursive",
                        color: "#ffffff",
                        fontSize: "clamp(5rem, 18vw, 14rem)",
                        fontWeight: 900,
                        textShadow: "0 0 60px rgba(200,210,255,0.95), 0 0 120px rgba(140,160,255,0.7), 6px 6px 0 #000",
                        letterSpacing: "0.25em",
                        animation: "bleachZoomIn 0.4s cubic-bezier(0.17, 0.89, 0.32, 1.28) both",
                    }}
                >
                    KAI.
                </div>
            )}
        </div>
    )
}

function OnePieceGear5Overlay() {
    const [phase, setPhase] = React.useState<"flash" | "text" | "fade">("flash")

    React.useEffect(() => {
        const t1 = setTimeout(() => setPhase("text"), 300)
        const t2 = setTimeout(() => setPhase("fade"), 5000)
        return () => { clearTimeout(t1); clearTimeout(t2) }
    }, [])

    return (
        <div
            className="fixed inset-0 pointer-events-none z-[9999] flex items-center justify-center overflow-hidden"
            style={{
                transition: "opacity 1.5s ease",
                opacity: phase === "fade" ? 0 : 1,
                background: phase === "flash" ? "rgba(255,255,240,0.98)" : "transparent",
            }}
        >
            {phase === "text" && (
                <>
                    <div
                        className="absolute inset-0"
                        style={{
                            background: "radial-gradient(circle at center, rgba(255,230,80,0.3) 0%, rgba(255,140,0,0.12) 55%, transparent 80%)",
                        }}
                    />
                    <div
                        className="relative text-center"
                        style={{
                            fontFamily: "'Boogaloo', cursive",
                            color: "#fff",
                            fontSize: "clamp(3rem, 10vw, 8rem)",
                            fontWeight: 700,
                            textShadow: "0 0 30px rgba(255,200,50,0.9), 0 0 60px rgba(255,140,0,0.6), 4px 4px 0 #8b4500",
                            letterSpacing: "0.1em",
                            lineHeight: 1.1,
                            animation: "gear5BounceIn 0.5s cubic-bezier(0.17, 0.89, 0.32, 1.28) both",
                        }}
                    >
                        GEAR...<br />
                        <span style={{ fontSize: "1.4em", color: "#ffe566" }}>FIVE!</span>
                    </div>
                </>
            )}
        </div>
    )
}
