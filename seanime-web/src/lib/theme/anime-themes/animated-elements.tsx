"use client"
import React from "react"
import type { AnimeThemeId } from "./types"

type Props = {
    themeId: AnimeThemeId
    intensity: number // 0-100
}

export function ThemeAnimatedOverlay({ themeId, intensity }: Props) {
    if (intensity <= 0 || themeId === "seanime") return null

    const scale = intensity / 100 // 0..1

    return (
        <div
            className="fixed inset-0 pointer-events-none overflow-hidden"
            style={{ zIndex: 1, opacity: Math.min(1, 0.3 + scale * 0.7) }}
            aria-hidden
        >
            {themeId === "naruto" && <NarutoElements scale={scale} />}
            {themeId === "bleach" && <BleachElements scale={scale} />}
            {themeId === "one-piece" && <OnePieceElements scale={scale} />}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────
// NARUTO — Konoha: falling leaves, chakra wisps, Sharingan watermark
// ─────────────────────────────────────────────────────────────────

function NarutoElements({ scale }: { scale: number }) {
    const leafCount = Math.round(4 + scale * 11)   // 4..15
    const wispCount = Math.round(3 + scale * 7)    // 3..10

    const leaves = React.useMemo(() =>
        Array.from({ length: 15 }, (_, i) => ({
            id: i,
            left: `${5 + (i * 6.3) % 90}%`,
            delay: `${(i * 1.7) % 12}s`,
            duration: `${8 + (i * 1.3) % 7}s`,
            size: 10 + (i % 4) * 3,
            rotation: (i * 47) % 360,
            hue: 90 + (i * 13) % 40, // greens to yellow-greens
        })),
    [])

    const wisps = React.useMemo(() =>
        Array.from({ length: 10 }, (_, i) => ({
            id: i,
            left: `${8 + (i * 9.1) % 84}%`,
            delay: `${(i * 2.3) % 10}s`,
            duration: `${5 + (i * 1.1) % 5}s`,
            size: 3 + (i % 3) * 2,
        })),
    [])

    return (
        <>
            {/* Falling leaves */}
            {leaves.slice(0, leafCount).map(l => (
                <div
                    key={`leaf-${l.id}`}
                    className="absolute animate-leaf-fall will-change-transform"
                    style={{
                        left: l.left,
                        top: "-30px",
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

            {/* Chakra wisps */}
            {wisps.slice(0, wispCount).map(w => (
                <div
                    key={`wisp-${w.id}`}
                    className="absolute rounded-full animate-chakra-wisp will-change-transform"
                    style={{
                        left: w.left,
                        bottom: `${10 + (w.id * 7) % 30}%`,
                        animationDelay: w.delay,
                        animationDuration: w.duration,
                        width: w.size,
                        height: w.size,
                        background: "radial-gradient(circle, rgba(255,120,20,0.8) 0%, rgba(255,60,0,0.3) 60%, transparent 100%)",
                        boxShadow: "0 0 8px 2px rgba(255,100,0,0.4)",
                    }}
                />
            ))}

            {/* Sharingan watermark — only at ≥40% intensity */}
            {scale >= 0.4 && (
                <div
                    className="absolute animate-slow-spin"
                    style={{
                        bottom: "3%",
                        right: "3%",
                        width: 60,
                        height: 60,
                        opacity: 0.06 + scale * 0.06,
                    }}
                >
                    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="50" cy="50" r="45" fill="none" stroke="#c03000" strokeWidth="3" opacity="0.6" />
                        <circle cx="50" cy="50" r="12" fill="#c03000" opacity="0.5" />
                        {/* Three tomoe */}
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
// BLEACH — Karakura Town: cityscape, Hollow masks, reiatsu wisps,
//          soul butterflies, slash lines
// ─────────────────────────────────────────────────────────────────

function BleachElements({ scale }: { scale: number }) {
    const hollowCount = Math.round(2 + scale * 5)   // 2..7
    const wispCount = Math.round(2 + scale * 6)     // 2..8
    const butterflyCount = Math.round(1 + scale * 2) // 1..3
    const rooftopHollowCount = Math.round(2 + scale * 4) // 2..6

    const wisps = React.useMemo(() =>
        Array.from({ length: 8 }, (_, i) => ({
            id: i,
            left: `${3 + (i * 11.3) % 90}%`,
            delay: `${(i * 1.9) % 8}s`,
            duration: `${6 + (i * 1.4) % 5}s`,
            size: 3 + (i % 3) * 2,
        })),
    [])

    const butterflies = React.useMemo(() =>
        Array.from({ length: 3 }, (_, i) => ({
            id: i,
            startY: `${30 + (i * 22) % 40}%`,
            delay: `${(i * 4.5) % 12}s`,
            duration: `${18 + (i * 3) % 8}s`,
            size: 14 + (i % 2) * 4,
        })),
    [])

    // Slash line timer
    const [showSlash, setShowSlash] = React.useState(false)
    const slashRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
    React.useEffect(() => {
        if (scale < 0.3) return
        slashRef.current = setInterval(() => {
            setShowSlash(true)
            setTimeout(() => setShowSlash(false), 400)
        }, 12000 + Math.random() * 8000)
        return () => { if (slashRef.current) clearInterval(slashRef.current) }
    }, [scale])

    return (
        <>
            {/* Karakura moon + haze */}
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
                    opacity: 0.35 + scale * 0.18,
                }}
            />

            {/* Karakura Town cityscape silhouette */}
            <div
                className="absolute bottom-0 left-0 right-0"
                style={{ height: 80, opacity: 0.12 + scale * 0.08 }}
            >
                <svg viewBox="0 0 1200 80" preserveAspectRatio="none" className="w-full h-full"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M0 80 L0 55 L30 55 L30 35 L45 35 L45 40 L55 40 L55 20 L70 20 L70 38 L90 38 L90 28 L100 28 L100 45 L120 45 L120 15 L135 15 L135 42 L150 42 L150 50 L170 50 L170 30 L180 30 L180 25 L195 25 L195 35 L210 35 L210 48 L230 48 L230 18 L245 18 L245 12 L255 12 L255 40 L275 40 L275 52 L300 52 L300 22 L315 22 L315 35 L330 35 L330 45 L350 45 L350 30 L360 30 L360 10 L375 10 L375 38 L400 38 L400 50 L420 50 L420 28 L435 28 L435 42 L450 42 L450 55 L475 55 L475 25 L490 25 L490 15 L500 15 L500 35 L520 35 L520 48 L540 48 L540 20 L555 20 L555 40 L575 40 L575 30 L590 30 L590 45 L610 45 L610 55 L630 55 L630 22 L645 22 L645 8 L660 8 L660 32 L680 32 L680 48 L700 48 L700 35 L720 35 L720 18 L735 18 L735 42 L755 42 L755 28 L770 28 L770 50 L790 50 L790 38 L810 38 L810 15 L825 15 L825 30 L840 30 L840 45 L860 45 L860 55 L880 55 L880 25 L895 25 L895 40 L915 40 L915 50 L935 50 L935 32 L950 32 L950 20 L965 20 L965 38 L985 38 L985 52 L1010 52 L1010 28 L1025 28 L1025 42 L1045 42 L1045 55 L1065 55 L1065 35 L1080 35 L1080 18 L1095 18 L1095 45 L1115 45 L1115 30 L1130 30 L1130 50 L1150 50 L1150 55 L1170 55 L1170 40 L1185 40 L1185 55 L1200 55 L1200 80 Z"
                        fill="#1a1a30"
                    />
                    {/* Tiny lit windows */}
                    {[65, 133, 248, 365, 492, 648, 720, 830, 960, 1085].map((x, i) => (
                        <rect key={i} x={x} y={25 + (i * 7) % 20} width="3" height="3" rx="0.5"
                            fill="#ffdd88" opacity={0.3 + (i % 3) * 0.15}
                        >
                            <animate attributeName="opacity" values={`${0.2 + (i % 3) * 0.1};${0.5 + (i % 2) * 0.2};${0.2 + (i % 3) * 0.1}`} dur={`${3 + i % 4}s`} repeatCount="indefinite" />
                        </rect>
                    ))}
                </svg>
            </div>

            {/* Dark reiatsu wisps */}
            {wisps.slice(0, wispCount).map(w => (
                <div
                    key={`bwisp-${w.id}`}
                    className="absolute rounded-full animate-reiatsu-rise will-change-transform"
                    style={{
                        left: w.left,
                        bottom: "5%",
                        animationDelay: w.delay,
                        animationDuration: w.duration,
                        width: w.size,
                        height: w.size,
                        background: "radial-gradient(circle, rgba(80,90,200,0.7) 0%, rgba(40,30,120,0.3) 60%, transparent 100%)",
                        boxShadow: "0 0 10px 3px rgba(70,80,180,0.3)",
                    }}
                />
            ))}

            {/* Soul butterflies (Jigokuchō) */}
            {butterflies.slice(0, butterflyCount).map(b => (
                <div
                    key={`butterfly-${b.id}`}
                    className="absolute animate-butterfly-drift will-change-transform"
                    style={{
                        right: "-20px",
                        top: b.startY,
                        animationDelay: b.delay,
                        animationDuration: b.duration,
                        width: b.size,
                        height: b.size,
                        opacity: 0.25 + scale * 0.15,
                    }}
                >
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        {/* Left wing */}
                        <path d="M12 12 C8 6 2 4 4 10 C5 14 10 14 12 12Z"
                            fill="#1a1a40" stroke="#4040a0" strokeWidth="0.5" opacity="0.8"
                        />
                        {/* Right wing */}
                        <path d="M12 12 C16 6 22 4 20 10 C19 14 14 14 12 12Z"
                            fill="#1a1a40" stroke="#4040a0" strokeWidth="0.5" opacity="0.8"
                        />
                        {/* Lower wings */}
                        <path d="M12 12 C9 14 6 18 8 16 C10 14 11 13 12 12Z"
                            fill="#1a1a40" stroke="#3535a0" strokeWidth="0.4" opacity="0.6"
                        />
                        <path d="M12 12 C15 14 18 18 16 16 C14 14 13 13 12 12Z"
                            fill="#1a1a40" stroke="#3535a0" strokeWidth="0.4" opacity="0.6"
                        />
                        {/* Glow dot */}
                        <circle cx="12" cy="12" r="1.5" fill="#6666cc" opacity="0.7" />
                    </svg>
                </div>
            ))}

            {/* Slash line */}
            {showSlash && scale >= 0.3 && (
                <div
                    className="absolute inset-0 animate-slash-flash"
                    style={{ opacity: 0.15 + scale * 0.1 }}
                >
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <line x1="20" y1="80" x2="80" y2="20"
                            stroke="rgba(200,210,255,0.9)" strokeWidth="0.15"
                            strokeLinecap="round"
                        />
                    </svg>
                </div>
            )}
        </>
    )
}

// ─────────────────────────────────────────────────────────────────
// ONE PIECE — Going Merry: ocean waves, Sabaody bubbles, Jolly Roger
// ─────────────────────────────────────────────────────────────────

function OnePieceElements({ scale }: { scale: number }) {
    const bubbleCount = Math.round(4 + scale * 8) // 4..12

    const bubbles = React.useMemo(() =>
        Array.from({ length: 12 }, (_, i) => ({
            id: i,
            left: `${5 + (i * 7.9) % 88}%`,
            delay: `${(i * 1.6) % 10}s`,
            duration: `${7 + (i * 1.2) % 6}s`,
            size: 8 + (i % 4) * 5,
        })),
    [])

    return (
        <>
            {/* Ocean waves at bottom */}
            <div
                className="absolute bottom-0 left-0 right-0"
                style={{ height: 50, opacity: 0.2 + scale * 0.15 }}
            >
                {/* Wave layer 1 (back) */}
                <svg viewBox="0 0 1200 50" preserveAspectRatio="none"
                    className="absolute bottom-0 w-full h-full animate-wave-drift-slow"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M0 30 C100 15 200 40 300 28 C400 16 500 38 600 30 C700 22 800 42 900 28 C1000 14 1100 36 1200 30 L1200 50 L0 50 Z"
                        fill="rgba(10,60,90,0.5)"
                    />
                </svg>
                {/* Wave layer 2 (mid) */}
                <svg viewBox="0 0 1200 50" preserveAspectRatio="none"
                    className="absolute bottom-0 w-full h-full animate-wave-drift-mid"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M0 35 C150 22 250 42 400 32 C550 22 650 40 800 35 C950 28 1050 44 1200 35 L1200 50 L0 50 Z"
                        fill="rgba(15,80,120,0.4)"
                    />
                </svg>
                {/* Wave layer 3 (front) */}
                <svg viewBox="0 0 1200 50" preserveAspectRatio="none"
                    className="absolute bottom-0 w-full h-full animate-wave-drift-fast"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M0 40 C120 30 240 45 360 38 C480 31 600 44 720 40 C840 36 960 46 1080 40 L1200 42 L1200 50 L0 50 Z"
                        fill="rgba(20,100,140,0.35)"
                    />
                </svg>
                {/* Foam/sparkles */}
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

            {/* Sabaody bubbles */}
            {bubbles.slice(0, bubbleCount).map(b => (
                <div
                    key={`bubble-${b.id}`}
                    className="absolute rounded-full animate-bubble-rise will-change-transform"
                    style={{
                        left: b.left,
                        bottom: "60px",
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

            {/* Jolly Roger watermark — only at ≥35% intensity */}
            {scale >= 0.35 && (
                <div
                    className="absolute"
                    style={{
                        bottom: "60px",
                        right: "2%",
                        width: 55,
                        height: 55,
                        opacity: 0.05 + scale * 0.06,
                    }}
                >
                    <svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                        {/* Skull */}
                        <circle cx="30" cy="22" r="14" fill="none" stroke="#c8a040" strokeWidth="1.5" opacity="0.6" />
                        <circle cx="24" cy="20" r="3.5" fill="#c8a040" opacity="0.4" />
                        <circle cx="36" cy="20" r="3.5" fill="#c8a040" opacity="0.4" />
                        <path d="M27 28 L30 30 L33 28" fill="none" stroke="#c8a040" strokeWidth="1" opacity="0.4" />
                        {/* Crossbones */}
                        <line x1="12" y1="40" x2="48" y2="52" stroke="#c8a040" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
                        <line x1="48" y1="40" x2="12" y2="52" stroke="#c8a040" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
                        {/* Straw hat */}
                        <ellipse cx="30" cy="11" rx="17" ry="4" fill="none" stroke="#c8a040" strokeWidth="1.2" opacity="0.5" />
                        <path d="M18 11 C18 5 42 5 42 11" fill="none" stroke="#c8a040" strokeWidth="1.2" opacity="0.5" />
                        <line x1="18" y1="9" x2="42" y2="9" stroke="#c8a040" strokeWidth="0.8" opacity="0.3" />
                    </svg>
                </div>
            )}
        </>
    )
}
