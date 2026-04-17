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
    const kunaiP = ps(settings, "kunai")
    const villageP = ps(settings, "village")
    const sharinganP = ps(settings, "sharingan")

    const leafCount = leavesP.enabled ? Math.round(4 + leavesP.scale * 11) : 0
    const wispCount = wispsP.enabled ? Math.round(3 + wispsP.scale * 7) : 0
    const kunaiCount = kunaiP.enabled ? Math.round(2 + kunaiP.scale * 6) : 0

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

    const kunais = React.useMemo(() =>
        Array.from({ length: 8 }, (_, i) => ({
            id: i,
            left: `${10 + (i * 11.7) % 80}%`,
            delay: `${(i * 2.8) % 10}s`,
            duration: `${3 + (i * 0.9) % 3}s`,
            size: 14 + (i % 3) * 4,
            rotation: 30 + (i * 23) % 60,
            isShuriken: i % 3 === 0,
        })),
    [])

    return (
        <>
            {/* Village silhouette — Konoha skyline with Hokage Rock */}
            {villageP.enabled && (
                <div
                    className="absolute bottom-0 left-0 right-0"
                    style={{ height: 90, opacity: 0.08 + villageP.scale * 0.07 }}
                >
                    <svg viewBox="0 0 1200 90" preserveAspectRatio="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M0 90 L0 65 L40 65 L40 50 L55 50 L55 42 L65 42 L65 35 L80 35 L80 45 L100 45 L100 55 L130 55 L130 30 L145 30 L145 20 L160 18 L175 20 L175 30 L190 30 L190 55 L220 55 L220 40 L240 40 L240 25 L255 22 L270 25 L270 40 L290 40 L290 55 L310 55 L310 38 L325 35 L340 38 L340 55 L370 55 L370 45 L390 45 L390 30 L400 28 L410 25 L420 22 L430 25 L440 28 L450 30 L450 45 L470 45 L470 55 L500 55 L500 42 L520 42 L520 55 L560 55 L560 48 L580 48 L580 55 L620 55 L620 42 L640 42 L640 55 L680 55 L680 45 L700 40 L720 45 L720 55 L760 55 L760 50 L780 48 L800 50 L800 55 L840 55 L840 60 L900 60 L900 55 L950 55 L950 48 L980 48 L980 55 L1020 55 L1020 60 L1060 60 L1060 55 L1100 55 L1100 50 L1140 50 L1140 60 L1200 60 L1200 90 Z"
                            fill="#1a0800"
                        />
                        {/* Hokage Rock faces hint */}
                        {[155, 185, 215, 245].map((x, i) => (
                            <rect key={i} x={x} y={22 + i * 2} width="10" height="8" rx="2" fill="#2a1500" opacity={0.4} />
                        ))}
                        {/* Window lights */}
                        {[50, 90, 140, 200, 280, 380, 460, 540, 650, 750, 860, 980, 1100].map((x, i) => (
                            <rect key={`w-${i}`} x={x} y={45 + (i * 5) % 15} width="2.5" height="2.5" rx="0.3"
                                fill="#ff9040" opacity={0.25 + (i % 3) * 0.1}
                            >
                                <animate attributeName="opacity" values={`${0.15 + (i % 3) * 0.08};${0.35 + (i % 2) * 0.15};${0.15 + (i % 3) * 0.08}`} dur={`${3 + i % 4}s`} repeatCount="indefinite" />
                            </rect>
                        ))}
                    </svg>
                </div>
            )}

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

            {/* Kunai & Shuriken */}
            {kunais.slice(0, kunaiCount).map(k => (
                <div
                    key={`kunai-${k.id}`}
                    className="absolute animate-leaf-fall will-change-transform"
                    style={{
                        left: k.left,
                        top: `${10 + (k.id * 7) % 40}%`,
                        animationDelay: k.delay,
                        animationDuration: k.duration,
                        width: k.size,
                        height: k.size,
                        opacity: 0.25 + kunaiP.scale * 0.2,
                    }}
                >
                    {k.isShuriken ? (
                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="animate-slow-spin"
                            style={{ animationDuration: `${1.5 + k.id * 0.3}s` }}
                        >
                            <path d="M12 2 L14 10 L12 12 L10 10 Z" fill="#888" opacity="0.7" />
                            <path d="M22 12 L14 14 L12 12 L14 10 Z" fill="#999" opacity="0.7" />
                            <path d="M12 22 L10 14 L12 12 L14 14 Z" fill="#888" opacity="0.7" />
                            <path d="M2 12 L10 10 L12 12 L10 14 Z" fill="#999" opacity="0.7" />
                            <circle cx="12" cy="12" r="2" fill="#666" />
                        </svg>
                    ) : (
                        <svg viewBox="0 0 12 30" xmlns="http://www.w3.org/2000/svg"
                            style={{ transform: `rotate(${k.rotation}deg)` }}
                        >
                            <path d="M6 0 L8 10 L6 12 L4 10 Z" fill="#aaa" opacity="0.7" />
                            <rect x="5" y="12" width="2" height="14" fill="#666" opacity="0.6" />
                            <rect x="3" y="26" width="6" height="3" rx="1" fill="#c04000" opacity="0.5" />
                        </svg>
                    )}
                </div>
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
    const lasNochesP = ps(settings, "lasNoches")

    const butterflyCount = butterfliesP.enabled ? Math.round(5 + butterfliesP.scale * 10) : 0
    const wispCount = wispsP.enabled ? Math.round(2 + wispsP.scale * 6) : 0

    const butterflies = React.useMemo(() =>
        Array.from({ length: 15 }, (_, i) => {
            // Pseudo-random seeded by index for deterministic but varied paths
            const s = (n: number) => ((i * 7919 + n * 104729) % 1000) / 1000
            return {
                id: i,
                startX: `${-15 + s(1) * 130}%`,
                startY: `${-10 + s(2) * 120}%`,
                delay: `${s(3) * 18}s`,
                duration: `${8 + s(4) * 12}s`,
                size: 22 + (i % 4) * 6,
                wingPhase: s(5),
                wingSpeed: 0.8 + s(6) * 0.8,
                // Unique erratic path waypoints for each butterfly — wide roaming including off-screen
                path: Array.from({ length: 8 }, (_, k) => ({
                    x: (s(k * 10 + 7) - 0.5) * 70,
                    y: (s(k * 10 + 8) - 0.5) * 60,
                    r: (s(k * 10 + 9) - 0.5) * 30,
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

            {/* Las Noches silhouette — Hueco Mundo fortress */}
            {lasNochesP.enabled && (
                <div
                    className="absolute bottom-0 left-0 right-0"
                    style={{ height: 100, opacity: 0.10 + lasNochesP.scale * 0.08 }}
                >
                    <svg viewBox="0 0 1200 100" preserveAspectRatio="none" className="w-full h-full"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        {/* Desert dunes */}
                        <path
                            d="M0 100 L0 75 C100 68 200 78 300 72 C400 66 500 76 600 70 C700 64 800 74 900 68 C1000 62 1100 72 1200 70 L1200 100 Z"
                            fill="#0d0d1a"
                        />
                        {/* Central dome — Las Noches */}
                        <path
                            d="M400 72 L420 65 L440 55 L460 42 L480 32 L500 25 L520 20 L540 16 L560 14 L580 13 L600 12 L620 13 L640 14 L660 16 L680 20 L700 25 L720 32 L740 42 L760 55 L780 65 L800 72"
                            fill="#111122" stroke="#1a1a35" strokeWidth="0.5"
                        />
                        {/* Fortress towers */}
                        <rect x="350" y="50" width="12" height="22" fill="#0e0e1e" />
                        <rect x="354" y="44" width="4" height="6" fill="#0e0e1e" />
                        <rect x="838" y="50" width="12" height="22" fill="#0e0e1e" />
                        <rect x="842" y="44" width="4" height="6" fill="#0e0e1e" />
                        <rect x="550" y="18" width="8" height="10" fill="#0e0e1e" />
                        <rect x="642" y="18" width="8" height="10" fill="#0e0e1e" />
                        {/* Gate */}
                        <path d="M585 70 L585 55 L600 48 L615 55 L615 70" fill="#080814" opacity="0.6" />
                        {/* Faint glow from windows */}
                        {[500, 560, 640, 700, 580, 620].map((x, i) => (
                            <rect key={i} x={x} y={30 + (i * 7) % 25} width="2" height="2" rx="0.3"
                                fill="#4050aa" opacity={0.2 + (i % 3) * 0.1}
                            >
                                <animate attributeName="opacity" values={`${0.1 + (i % 3) * 0.05};${0.3 + (i % 2) * 0.1};${0.1 + (i % 3) * 0.05}`} dur={`${4 + i % 3}s`} repeatCount="indefinite" />
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
    const sparklesP = ps(settings, "sparkles")
    const bountyP = ps(settings, "bountyPoster")
    const jollyP = ps(settings, "jollyRoger")

    const bubbleCount = bubblesP.enabled ? Math.round(4 + bubblesP.scale * 8) : 0
    const sparkleCount = sparklesP.enabled ? Math.round(3 + sparklesP.scale * 7) : 0

    const bubbles = React.useMemo(() =>
        Array.from({ length: 12 }, (_, i) => ({
            id: i,
            left: `${5 + (i * 7.9) % 88}%`,
            delay: `${(i * 1.6) % 8}s`,
            duration: `${5 + (i * 1.2) % 5}s`,
            size: 8 + (i % 4) * 5,
        })),
    [])

    const sparkles = React.useMemo(() =>
        Array.from({ length: 10 }, (_, i) => ({
            id: i,
            left: `${8 + (i * 9.3) % 84}%`,
            top: `${15 + (i * 7.7) % 60}%`,
            delay: `${(i * 1.4) % 6}s`,
            duration: `${2 + (i * 0.7) % 3}s`,
            size: 4 + (i % 3) * 3,
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

            {/* Treasure Sparkles — floating gold glints */}
            {sparkles.slice(0, sparkleCount).map(s => (
                <div
                    key={`sparkle-${s.id}`}
                    className="absolute will-change-transform"
                    style={{
                        left: s.left,
                        top: s.top,
                        width: s.size,
                        height: s.size,
                        animationDelay: s.delay,
                        animation: `treasureGlint ${s.duration} ease-in-out ${s.delay} infinite`,
                        opacity: 0.2 + sparklesP.scale * 0.3,
                    }}
                >
                    <svg viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 0 L7 5 L12 6 L7 7 L6 12 L5 7 L0 6 L5 5 Z" fill="#ffd700" opacity="0.7" />
                    </svg>
                </div>
            ))}

            {/* Bounty Poster watermark */}
            {bountyP.enabled && bountyP.scale >= 0.3 && (
                <div
                    className="absolute"
                    style={{
                        bottom: "8%",
                        left: "3%",
                        width: 70,
                        height: 90,
                        opacity: 0.04 + bountyP.scale * 0.05,
                        transform: "rotate(-3deg)",
                    }}
                >
                    <svg viewBox="0 0 70 90" xmlns="http://www.w3.org/2000/svg">
                        <rect x="2" y="2" width="66" height="86" rx="2" fill="#1a1508" stroke="#8b7530" strokeWidth="1" opacity="0.6" />
                        <text x="35" y="14" textAnchor="middle" fill="#c8a040" fontSize="6" fontWeight="bold" opacity="0.5">WANTED</text>
                        <rect x="12" y="20" width="46" height="35" rx="1" fill="#0d0a04" opacity="0.4" />
                        <text x="35" y="66" textAnchor="middle" fill="#c8a040" fontSize="4" opacity="0.4">DEAD OR ALIVE</text>
                        <text x="35" y="78" textAnchor="middle" fill="#daa520" fontSize="5" fontWeight="bold" opacity="0.5">B 3,000,000,000</text>
                    </svg>
                </div>
            )}

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
