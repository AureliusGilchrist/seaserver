"use client"
import { cn } from "@/components/ui/core/styling"
import React from "react"

export function getLevelTier(level: number): {
    tier: string
    ringClass: string
    glow: string
    label: string
    animated: boolean
} {
    if (level >= 200) return { tier: "prismatic",    ringClass: "stroke-fuchsia-400", glow: "shadow-fuchsia-400/60", label: "text-fuchsia-400", animated: true  }
    if (level >= 150) return { tier: "gold-rose",    ringClass: "stroke-yellow-300",  glow: "shadow-yellow-400/60",  label: "text-yellow-300",  animated: true  }
    if (level >= 100) return { tier: "gold-shimmer", ringClass: "stroke-yellow-400",  glow: "shadow-yellow-400/50",  label: "text-yellow-400",  animated: true  }
    if (level >=  80) return { tier: "gold",         ringClass: "stroke-yellow-400",  glow: "shadow-yellow-400/50",  label: "text-yellow-400",  animated: false }
    if (level >=  65) return { tier: "purple",       ringClass: "stroke-purple-400",  glow: "shadow-purple-400/50",  label: "text-purple-400",  animated: false }
    if (level >=  50) return { tier: "indigo",       ringClass: "stroke-indigo-400",  glow: "shadow-indigo-400/50",  label: "text-indigo-400",  animated: false }
    if (level >=  35) return { tier: "blue",         ringClass: "stroke-blue-400",    glow: "shadow-blue-400/50",    label: "text-blue-400",    animated: false }
    if (level >=  20) return { tier: "teal",         ringClass: "stroke-teal-400",    glow: "shadow-teal-400/40",    label: "text-teal-400",    animated: false }
    if (level >=  10) return { tier: "green",        ringClass: "stroke-green-400",   glow: "shadow-green-400/30",   label: "text-green-400",   animated: false }
    return               { tier: "gray",         ringClass: "stroke-gray-400",    glow: "shadow-gray-400/30",    label: "text-gray-400",    animated: false }
}

export function xpForLevel(level: number): number {
    if (level <= 1) return 0
    return Math.floor(100 * Math.pow(level - 1, 1.5))
}

const RING_GRADIENTS: Record<string, { stops: string[]; dur: string }> = {
    "gold-shimmer": { stops: ["#78350f", "#fbbf24", "#fde68a", "#fbbf24", "#78350f"], dur: "2s" },
    "gold-rose":    { stops: ["#fbbf24", "#f9a8d4", "#fde68a", "#f9a8d4", "#fbbf24"], dur: "2.5s" },
    "prismatic":    { stops: ["#f43f5e", "#f97316", "#facc15", "#4ade80", "#60a5fa", "#a78bfa", "#f43f5e"], dur: "3s" },
}

export function LevelRingAvatar({
    profile,
    size = 80,
    xpBarFillOverride,
}: {
    profile: { currentLevel: number; totalXP?: number; avatarPath?: string; anilistAvatar?: string; name: string }
    size?: number
    xpBarFillOverride?: string
}) {
    const tierInfo = getLevelTier(profile.currentLevel)
    const avatarSrc = profile.avatarPath || profile.anilistAvatar
    const radius = (size - 6) / 2
    const circumference = 2 * Math.PI * radius
    const currentLevelXP = xpForLevel(profile.currentLevel)
    const nextLevelXP = xpForLevel(profile.currentLevel + 1)
    const xpRange = nextLevelXP - currentLevelXP
    const xpInLevel = (profile.totalXP ?? 0) - currentLevelXP
    const progress = xpRange > 0 ? Math.max(0, Math.min(xpInLevel / xpRange, 1)) : 0
    const strokeDashoffset = circumference * (1 - progress)

    const gradId = `lvring-${tierInfo.tier}-${size}`
    const gradDef = RING_GRADIENTS[tierInfo.tier]

    // Parse color stops from an xpBarFillOverride CSS gradient
    const overrideStops = React.useMemo<string[] | null>(() => {
        if (!xpBarFillOverride) return null
        if (!xpBarFillOverride.startsWith("linear-gradient")) return null
        const matches = xpBarFillOverride.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g)
        return matches && matches.length >= 2 ? matches : null
    }, [xpBarFillOverride])

    const overrideGradId = `lvring-override-${size}`
    const overrideSolid = xpBarFillOverride && !xpBarFillOverride.startsWith("linear-gradient")
        ? xpBarFillOverride : null
    const overrideGlowColor = overrideStops?.[0] ?? overrideSolid ?? null

    const glowColor = overrideGlowColor ?? gradDef?.stops?.[0] ?? null
    const glowStyle = glowColor ? { boxShadow: `0 0 16px 4px ${glowColor}60` } : {}

    // Determine stroke reference
    const strokeRef = overrideStops
        ? `url(#${overrideGradId})`
        : overrideSolid
            ? overrideSolid
            : tierInfo.animated ? `url(#${gradId})` : undefined

    return (
        <div
            className={cn("relative inline-flex items-center justify-center rounded-full", !glowColor && `shadow-lg ${tierInfo.glow}`)}
            style={{ width: size, height: size, ...glowStyle }}
        >
            <svg className="absolute inset-0" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <defs>
                    {overrideStops && (
                        <linearGradient id={overrideGradId} x1="0%" y1="0%" x2="100%" y2="0%">
                            {overrideStops.map((color, i) => (
                                <stop key={i} offset={`${(i / (overrideStops.length - 1)) * 100}%`} stopColor={color} />
                            ))}
                        </linearGradient>
                    )}
                    {gradDef && !overrideStops && (
                        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%" gradientUnits="objectBoundingBox">
                            {gradDef.stops.map((color, i) => (
                                <stop key={i} offset={`${(i / (gradDef.stops.length - 1)) * 100}%`} stopColor={color} />
                            ))}
                            <animateTransform
                                attributeName="gradientTransform"
                                type="translate"
                                from="-1 0"
                                to="1 0"
                                dur={gradDef.dur}
                                repeatCount="indefinite"
                            />
                        </linearGradient>
                    )}
                </defs>
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={3} className="stroke-gray-700/50" />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth={tierInfo.animated || overrideStops ? 4 : 3}
                    className={!strokeRef ? tierInfo.ringClass : ""}
                    style={{
                        stroke: strokeRef,
                        transition: "stroke-dashoffset 0.6s ease",
                    }}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </svg>
            {avatarSrc ? (
                <img src={avatarSrc} alt={profile.name} className="rounded-full object-cover" style={{ width: size - 10, height: size - 10 }} />
            ) : (
                <div
                    className="rounded-full bg-[--muted] flex items-center justify-center text-white font-bold"
                    style={{ width: size - 10, height: size - 10, fontSize: size / 3 }}
                >
                    {profile.name.charAt(0).toUpperCase()}
                </div>
            )}
        </div>
    )
}
