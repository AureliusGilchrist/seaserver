"use client"
import React from "react"
import type { AnimeThemeId } from "./types"

type ParticleSettings = Record<string, { enabled: boolean; intensity: number }>

type Props = {
    themeId: AnimeThemeId
    intensity: number // 0-100
    particleSettings: ParticleSettings
}

function ps(settings: ParticleSettings, key: string): { enabled: boolean; scale: number } {
    const s = settings[key]
    if (!s || !s.enabled) return { enabled: false, scale: 0 }
    return { enabled: true, scale: s.intensity / 100 }
}

export function ThemeAnimatedOverlay({ themeId, intensity, particleSettings }: Props) {
    if (intensity <= 0 || themeId === "seanime") return null

    const globalScale = intensity / 100

    return (
        <div
            className="fixed inset-0 pointer-events-none overflow-hidden"
            style={{ zIndex: -1, opacity: Math.min(1, 0.3 + globalScale * 0.7) }}
            aria-hidden
        >
            {themeId === "naruto" && <NarutoElements globalScale={globalScale} ps={particleSettings} />}
            {themeId === "bleach" && <BleachElements globalScale={globalScale} ps={particleSettings} />}
            {themeId === "one-piece" && <OnePieceElements globalScale={globalScale} ps={particleSettings} />}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────
// NARUTO — Konoha: falling leaves, chakra wisps, Sharingan watermark
// ─────────────────────────────────────────────────────────────────

function NarutoElements({ globalScale, ps: settings }: { globalScale: number; ps: ParticleSettings }) {
    const leavesP = ps(settings, "leaves")
    const wispsP = ps(settings, "wisps")
    const sharinganP = ps(settings, "sharingan")

    const leafCount = leavesP.enabled ? Math.round(4 + leavesP.scale * 11) : 0
    const wispCount = wispsP.enabled ? Math.round(3 + wispsP.scale * 7) : 0

    const leaves = React.useMemo(() =>
        Array.from({ length: 15 }, (_, i) => ({
            id: i,
            left: `${5 + (i * 6.3) % 90}%`,
            delay: `${(i * 1.7) % 8}s`,
            duration: `${6 + (i * 1.3) % 5}s`,
            size: 10 + (i % 4) * 3,
            rotation: (i * 47) % 360,
            hue: 90 + (i * 13) % 40,
        })),
    [])

    const wisps = React.useMemo(() =>
        Array.from({ length: 10 }, (_, i) => ({
            id: i,
            left: `${8 + (i * 9.1) % 84}%`,
            delay: `${(i * 2.3) % 8}s`,
            duration: `${4 + (i * 1.1) % 4}s`,
            size: 3 + (i % 3) * 2,
        })),
    [])

    return (
        <>
            {leaves.slice(0, leafCount).map(l => (
                <div
                    key={`leaf-${l.id}`}
                    className="absolute animate-leaf-fall will-change-transform"
                    style={{
                        left: l.left,
                        top: `${55 + (l.id * 3) % 20}%`,
                        animationDelay: l.delay,
                        animationDuration: l.duration,
                        width: l.size,
                        height: l.size * 0.6,
                    }}
                >
                    <svg viewBox="0 0 20 12" fill="none" xmlns="http://www.w3.org/2000/svg"
                        style={{ transform: `rotate(${l.rotation}deg)` }}
                    >
                        <ellipse cx="10" cy="6" rx="10" ry="6"
                            fill={`hsl(${l.hue}, 55%, 35%)`}
                            opacity="0.7"
                        />
                        <line x1="2" y1="6" x2="18" y2="6" stroke={`hsl(${l.hue}, 40%, 25%)`} strokeWidth="0.5" opacity="0.5" />
                    </svg>
                </div>
            ))}

            {wisps.slice(0, wispCount).map(w => (
                <div
                    key={`wisp-${w.id}`}
                    className="absolute rounded-full animate-chakra-wisp will-change-transform"
                    style={{
                        left: w.left,
                        bottom: `${2 + (w.id * 5) % 15}%`,
                        animationDelay: w.delay,
                        animationDuration: w.duration,
                        width: w.size,
                        height: w.size,
                        background: "radial-gradient(circle, rgba(255,120,20,0.8) 0%, rgba(255,60,0,0.3) 60%, transparent 100%)",
                        boxShadow: "0 0 8px 2px rgba(255,100,0,0.4)",
                    }}
                />
            ))}

            {sharinganP.enabled && sharinganP.scale >= 0.3 && (
                <div
                    className="absolute animate-slow-spin"
                    style={{
                        bottom: "3%",
                        right: "3%",
                        width: 60,
                        height: 60,
                        opacity: 0.06 + sharinganP.scale * 0.06,
                    }}
                >
                    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="50" cy="50" r="45" fill="none" stroke="#c03000" strokeWidth="3" opacity="0.6" />
                        <circle cx="50" cy="50" r="12" fill="#c03000" opacity="0.5" />
                        {[0, 120, 240].map(angle => (
                            <g key={angle} transform={`rotate(${angle} 50 50)`}>
                                <circle cx="50" cy="18" r="7" fill="#c03000" opacity="0.6" />
                                <path d="M50 18 Q58 28 50 35 Q42 28 50 18Z" fill="#c03000" opacity="0.4" />
                            </g>
                        ))}
                    </svg>
                </div>
            )}
        </>
    )
}

// ─────────────────────────────────────────────────────────────────
// BLEACH — Karakura Town: 3D hell butterflies, reiatsu wisps,
//          moon haze, cityscape silhouette
// ─────────────────────────────────────────────────────────────────

function BleachElements({ globalScale, ps: settings }: { globalScale: number; ps: ParticleSettings }) {
    const butterfliesP = ps(settings, "butterflies")
    const wispsP = ps(settings, "wisps")
    const moonP = ps(settings, "moon")
    const cityscapeP = ps(settings, "cityscape")

    const butterflyCount = butterfliesP.enabled ? Math.round(5 + butterfliesP.scale * 10) : 0
    const wispCount = wispsP.enabled ? Math.round(2 + wispsP.scale * 6) : 0

    const butterflies = React.useMemo(() =>
        Array.from({ length: 15 }, (_, i) => {
            // Pseudo-random seeded by index for deterministic but varied paths
            const s = (n: number) => ((i * 7919 + n * 104729) % 1000) / 1000
            return {
                id: i,
                startX: `${5 + s(1) * 90}%`,
                startY: `${20 + s(2) * 60}%`,
                delay: `${s(3) * 18}s`,
                duration: `${8 + s(4) * 12}s`,
                size: 22 + (i % 4) * 6,
                wingPhase: s(5),
                wingSpeed: 0.8 + s(6) * 0.8,
                // Unique erratic path waypoints for each butterfly
                path: Array.from({ length: 8 }, (_, k) => ({
                    x: (s(k * 10 + 7) - 0.5) * 30,
                    y: (s(k * 10 + 8) - 0.5) * 25,
                    r: (s(k * 10 + 9) - 0.5) * 20,
                })),
            }
        }),
    [])
    
    const wisps = React.useMemo(() =>
        Array.from({ length: 8 }, (_, i) => ({
            id: i,
            left: `${3 + (i * 11.3) % 90}%`,
            delay: `${(i * 1.9) % 6}s`,
            duration: `${5 + (i * 1.4) % 4}s`,
            size: 3 + (i % 3) * 2,
        })),
    [])

    return (
        <>
            {/* Moon + haze */}
            {moonP.enabled && (
                <div
                    className="absolute"
                    style={{
                        top: "8%",
                        right: "10%",
                        width: 85,
                        height: 85,
                        borderRadius: "9999px",
                        background: "radial-gradient(circle, rgba(220,230,255,0.28) 0%, rgba(170,190,255,0.12) 45%, rgba(130,145,210,0.04) 75%, transparent 100%)",
                        boxShadow: "0 0 36px rgba(130,150,230,0.22)",
                        opacity: 0.35 + moonP.scale * 0.18,
                    }}
                />
            )}

            {/* Cityscape silhouette */}
            {cityscapeP.enabled && (
                <div
                    className="absolute bottom-0 left-0 right-0"
                    style={{ height: 80, opacity: 0.12 + cityscapeP.scale * 0.08 }}
                >
                    <svg viewBox="0 0 1200 80" preserveAspectRatio="none" className="w-full h-full"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M0 80 L0 55 L30 55 L30 35 L45 35 L45 40 L55 40 L55 20 L70 20 L70 38 L90 38 L90 28 L100 28 L100 45 L120 45 L120 15 L135 15 L135 42 L150 42 L150 50 L170 50 L170 30 L180 30 L180 25 L195 25 L195 35 L210 35 L210 48 L230 48 L230 18 L245 18 L245 12 L255 12 L255 40 L275 40 L275 52 L300 52 L300 22 L315 22 L315 35 L330 35 L330 45 L350 45 L350 30 L360 30 L360 10 L375 10 L375 38 L400 38 L400 50 L420 50 L420 28 L435 28 L435 42 L450 42 L450 55 L475 55 L475 25 L490 25 L490 15 L500 15 L500 35 L520 35 L520 48 L540 48 L540 20 L555 20 L555 40 L575 40 L575 30 L590 30 L590 45 L610 45 L610 55 L630 55 L630 22 L645 22 L645 8 L660 8 L660 32 L680 32 L680 48 L700 48 L700 35 L720 35 L720 18 L735 18 L735 42 L755 42 L755 28 L770 28 L770 50 L790 50 L790 38 L810 38 L810 15 L825 15 L825 30 L840 30 L840 45 L860 45 L860 55 L880 55 L880 25 L895 25 L895 40 L915 40 L915 50 L935 50 L935 32 L950 32 L950 20 L965 20 L965 38 L985 38 L985 52 L1010 52 L1010 28 L1025 28 L1025 42 L1045 42 L1045 55 L1065 55 L1065 35 L1080 35 L1080 18 L1095 18 L1095 45 L1115 45 L1115 30 L1130 30 L1130 50 L1150 50 L1150 55 L1170 55 L1170 40 L1185 40 L1185 55 L1200 55 L1200 80 Z"
                            fill="#1a1a30"
                        />
                        {[65, 133, 248, 365, 492, 648, 720, 830, 960, 1085].map((x, i) => (
                            <rect key={i} x={x} y={25 + (i * 7) % 20} width="3" height="3" rx="0.5"
                                fill="#ffdd88" opacity={0.3 + (i % 3) * 0.15}
                            >
                                <animate attributeName="opacity" values={`${0.2 + (i % 3) * 0.1};${0.5 + (i % 2) * 0.2};${0.2 + (i % 3) * 0.1}`} dur={`${3 + i % 4}s`} repeatCount="indefinite" />
                            </rect>
                        ))}
                    </svg>
                </div>
            )}

            {/* Dark reiatsu wisps */}
            {wisps.slice(0, wispCount).map(w => (
                <div
                    key={`bwisp-${w.id}`}
                    className="absolute rounded-full animate-reiatsu-rise will-change-transform"
                    style={{
                        left: w.left,
                        bottom: `${2 + (w.id * 3) % 8}%`,
                        animationDelay: w.delay,
                        animationDuration: w.duration,
                        width: w.size,
                        height: w.size,
                        background: "radial-gradient(circle, rgba(80,90,200,0.7) 0%, rgba(40,30,120,0.3) 60%, transparent 100%)",
                        boxShadow: "0 0 10px 3px rgba(70,80,180,0.3)",
                    }}
                />
            ))}

            {/* 3D Hell Butterflies (Jigokuchō) */}
            {butterflies.slice(0, butterflyCount).map(b => (
                <HellButterfly key={`hb-${b.id}`} b={b} scale={butterfliesP.scale} />
            ))}
        </>
    )
}

// ── 3D Hell Butterfly ──
type ButterflyData = {
    id: number; startX: string; startY: string; delay: string; duration: string
    size: number; wingPhase: number; wingSpeed: number
    path: Array<{ x: number; y: number; r: number }>
}

function HellButterfly({ b, scale }: {
    b: ButterflyData
    scale: number
}) {
    // Generate unique erratic keyframe name for this butterfly
    const animName = `hb-path-${b.id}`
    const keyframeCSS = React.useMemo(() => {
        const p = b.path
        const pcts = [0, 12, 24, 36, 48, 60, 72, 84]
        const frames = pcts.map((pct, i) => {
            const wp = p[i % p.length]
            return `${pct}% { transform: translate(${wp.x}vw, ${wp.y}vh) rotate(${wp.r}deg); }`
        })
        frames.push(`100% { transform: translate(0, 0) rotate(0deg); }`)
        return `@keyframes ${animName} { ${frames.join(" ")} }`
    }, [b.path, animName])

    return (
        <>
            <style>{keyframeCSS}</style>
            <div
                className="absolute will-change-transform"
                style={{
                    left: b.startX,
                    top: b.startY,
                    animation: `${animName} ${b.duration} ease-in-out ${b.delay} infinite`,
                    width: b.size,
                    height: b.size,
                    opacity: 0.3 + scale * 0.3,
                    perspective: "200px",
            }}
        >
            <div
                className="relative w-full h-full"
                style={{ transformStyle: "preserve-3d", transform: "rotateY(15deg)" }}
            >
                {/* Left wing */}
                <div
                    className="absolute animate-wing-flap-left"
                    style={{
                        right: "50%",
                        top: "15%",
                        width: "55%",
                        height: "70%",
                        transformOrigin: "right center",
                        animationDelay: `${b.wingPhase}s`,
                        animationDuration: `${b.wingSpeed}s`,
                    }}
                >
                    <svg viewBox="0 0 50 60" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <radialGradient id={`lwg-${b.id}`} cx="70%" cy="40%">
                                <stop offset="0%" stopColor="#3b2d80" stopOpacity="0.9" />
                                <stop offset="50%" stopColor="#1a1040" stopOpacity="0.85" />
                                <stop offset="100%" stopColor="#0a0820" stopOpacity="0.7" />
                            </radialGradient>
                        </defs>
                        <path
                            d="M50 30 C45 10 30 0 15 5 C5 8 0 20 5 30 C8 38 20 45 35 40 C42 38 48 34 50 30Z"
                            fill={`url(#lwg-${b.id})`}
                            stroke="#6050c0" strokeWidth="0.8" strokeOpacity="0.6"
                        />
                        <path
                            d="M50 30 C40 32 25 38 15 50 C10 56 12 58 18 55 C28 48 42 40 50 30Z"
                            fill="#120a30" stroke="#5040b0" strokeWidth="0.5" strokeOpacity="0.4"
                        />
                        <path d="M48 30 C35 22 20 18 15 20" fill="none" stroke="#7060d0" strokeWidth="0.3" strokeOpacity="0.3" />
                        <path d="M48 30 C38 28 25 30 18 38" fill="none" stroke="#7060d0" strokeWidth="0.3" strokeOpacity="0.25" />
                    </svg>
                </div>
                {/* Right wing */}
                <div
                    className="absolute animate-wing-flap-right"
                    style={{
                        left: "50%",
                        top: "15%",
                        width: "55%",
                        height: "70%",
                        transformOrigin: "left center",
                        animationDelay: `${b.wingPhase}s`,
                        animationDuration: `${b.wingSpeed}s`,
                    }}
                >
                    <svg viewBox="0 0 50 60" className="w-full h-full" xmlns="http://www.w3.org/2000/svg" style={{ transform: "scaleX(-1)" }}>
                        <defs>
                            <radialGradient id={`rwg-${b.id}`} cx="70%" cy="40%">
                                <stop offset="0%" stopColor="#3b2d80" stopOpacity="0.9" />
                                <stop offset="50%" stopColor="#1a1040" stopOpacity="0.85" />
                                <stop offset="100%" stopColor="#0a0820" stopOpacity="0.7" />
                            </radialGradient>
                        </defs>
                        <path
                            d="M50 30 C45 10 30 0 15 5 C5 8 0 20 5 30 C8 38 20 45 35 40 C42 38 48 34 50 30Z"
                            fill={`url(#rwg-${b.id})`}
                            stroke="#6050c0" strokeWidth="0.8" strokeOpacity="0.6"
                        />
                        <path
                            d="M50 30 C40 32 25 38 15 50 C10 56 12 58 18 55 C28 48 42 40 50 30Z"
                            fill="#120a30" stroke="#5040b0" strokeWidth="0.5" strokeOpacity="0.4"
                        />
                        <path d="M48 30 C35 22 20 18 15 20" fill="none" stroke="#7060d0" strokeWidth="0.3" strokeOpacity="0.3" />
                        <path d="M48 30 C38 28 25 30 18 38" fill="none" stroke="#7060d0" strokeWidth="0.3" strokeOpacity="0.25" />
                    </svg>
                </div>
                {/* Body */}
                <div
                    className="absolute"
                    style={{
                        left: "50%",
                        top: "25%",
                        width: 3,
                        height: "50%",
                        marginLeft: -1.5,
                        background: "linear-gradient(180deg, #2a1a60, #1a1040)",
                        borderRadius: "2px",
                    }}
                />
                {/* Spirit glow */}
                <div
                    className="absolute rounded-full animate-butterfly-glow"
                    style={{
                        left: "50%",
                        top: "45%",
                        width: 6,
                        height: 6,
                        marginLeft: -3,
                        marginTop: -3,
                        background: "radial-gradient(circle, rgba(120,100,220,0.8), rgba(80,60,180,0.3), transparent)",
                        boxShadow: "0 0 10px 3px rgba(100,80,200,0.4)",
                    }}
                />
            </div>
        </div>
        </>
    )
}

// ─────────────────────────────────────────────────────────────────
// ONE PIECE — Thousand Sunny: ocean waves, Sabaody bubbles, Jolly Roger
// ─────────────────────────────────────────────────────────────────

function OnePieceElements({ globalScale, ps: settings }: { globalScale: number; ps: ParticleSettings }) {
    const bubblesP = ps(settings, "bubbles")
    const wavesP = ps(settings, "waves")
    const jollyP = ps(settings, "jollyRoger")

    const bubbleCount = bubblesP.enabled ? Math.round(4 + bubblesP.scale * 8) : 0

    const bubbles = React.useMemo(() =>
        Array.from({ length: 12 }, (_, i) => ({
            id: i,
            left: `${5 + (i * 7.9) % 88}%`,
            delay: `${(i * 1.6) % 8}s`,
            duration: `${5 + (i * 1.2) % 5}s`,
            size: 8 + (i % 4) * 5,
        })),
    [])

    return (
        <>
            {/* Ocean waves */}
            {wavesP.enabled && (
                <div
                    className="absolute bottom-0 left-0 right-0"
                    style={{ height: 50, opacity: 0.2 + wavesP.scale * 0.15 }}
                >
                    <svg viewBox="0 0 1200 50" preserveAspectRatio="none"
                        className="absolute bottom-0 w-full h-full animate-wave-drift-slow"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M0 30 C100 15 200 40 300 28 C400 16 500 38 600 30 C700 22 800 42 900 28 C1000 14 1100 36 1200 30 L1200 50 L0 50 Z"
                            fill="rgba(10,60,90,0.5)"
                        />
                    </svg>
                    <svg viewBox="0 0 1200 50" preserveAspectRatio="none"
                        className="absolute bottom-0 w-full h-full animate-wave-drift-mid"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M0 35 C150 22 250 42 400 32 C550 22 650 40 800 35 C950 28 1050 44 1200 35 L1200 50 L0 50 Z"
                            fill="rgba(15,80,120,0.4)"
                        />
                    </svg>
                    <svg viewBox="0 0 1200 50" preserveAspectRatio="none"
                        className="absolute bottom-0 w-full h-full animate-wave-drift-fast"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M0 40 C120 30 240 45 360 38 C480 31 600 44 720 40 C840 36 960 46 1080 40 L1200 42 L1200 50 L0 50 Z"
                            fill="rgba(20,100,140,0.35)"
                        />
                    </svg>
                    <svg viewBox="0 0 1200 50" preserveAspectRatio="none"
                        className="absolute bottom-0 w-full h-full"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        {[80, 220, 400, 580, 750, 930, 1100].map((x, i) => (
                            <circle key={i} cx={x} cy={38 + (i % 3) * 3} r="1.5" fill="rgba(200,230,255,0.3)">
                                <animate attributeName="opacity" values="0.1;0.4;0.1" dur={`${2 + i % 3}s`} repeatCount="indefinite" />
                            </circle>
                        ))}
                    </svg>
                </div>
            )}

            {/* Sabaody bubbles */}
            {bubbles.slice(0, bubbleCount).map(b => (
                <div
                    key={`bubble-${b.id}`}
                    className="absolute rounded-full animate-bubble-rise will-change-transform"
                    style={{
                        left: b.left,
                        bottom: `${2 + (b.id * 3) % 6}%`,
                        animationDelay: b.delay,
                        animationDuration: b.duration,
                        width: b.size,
                        height: b.size,
                        background: "radial-gradient(ellipse at 35% 30%, rgba(200,230,255,0.3) 0%, rgba(100,180,220,0.1) 50%, transparent 75%)",
                        border: "1px solid rgba(180,220,255,0.2)",
                        boxShadow: "inset -2px -2px 4px rgba(255,255,255,0.05), 0 0 6px rgba(100,200,255,0.15)",
                    }}
                />
            ))}

            {/* Jolly Roger watermark */}
            {jollyP.enabled && jollyP.scale >= 0.3 && (
                <div
                    className="absolute"
                    style={{
                        bottom: "4%",
                        right: "2%",
                        width: 55,
                        height: 55,
                        opacity: 0.05 + jollyP.scale * 0.06,
                    }}
                >
                    <svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="30" cy="22" r="14" fill="none" stroke="#c8a040" strokeWidth="1.5" opacity="0.6" />
                        <circle cx="24" cy="20" r="3.5" fill="#c8a040" opacity="0.4" />
                        <circle cx="36" cy="20" r="3.5" fill="#c8a040" opacity="0.4" />
                        <path d="M27 28 L30 30 L33 28" fill="none" stroke="#c8a040" strokeWidth="1" opacity="0.4" />
                        <line x1="12" y1="40" x2="48" y2="52" stroke="#c8a040" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
                        <line x1="48" y1="40" x2="12" y2="52" stroke="#c8a040" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
                        <ellipse cx="30" cy="11" rx="17" ry="4" fill="none" stroke="#c8a040" strokeWidth="1.2" opacity="0.5" />
                        <path d="M18 11 C18 5 42 5 42 11" fill="none" stroke="#c8a040" strokeWidth="1.2" opacity="0.5" />
                        <line x1="18" y1="9" x2="42" y2="9" stroke="#c8a040" strokeWidth="0.8" opacity="0.3" />
                    </svg>
                </div>
            )}
        </>
    )
}
