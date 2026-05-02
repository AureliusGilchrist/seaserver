"use client"
import { cn } from "@/components/ui/core/styling"
import { getAssetUrl } from "@/lib/server/assets"
import { useThemeSettings } from "@/lib/theme/hooks"
import { useUICustomize } from "@/lib/ui-customize/ui-customize-provider"
import { EFFECTS_PRESETS } from "@/lib/ui-customize/ui-customize-definitions"
import { motion } from "motion/react"
import { usePathname } from "@/lib/navigation"
import React from "react"

type CustomBackgroundImageProps = React.ComponentPropsWithoutRef<"div"> & {}

// ── Deep Sea bubble overlay ──────────────────────────────────────────────────
// Renders a set of animated circles that slowly rise up the screen.
const BUBBLE_COUNT = 14

function DeepSeaBubbles() {
    const bubbles = React.useMemo(() => {
        return Array.from({ length: BUBBLE_COUNT }, (_, i) => ({
            id: i,
            left: `${8 + (i * 6.5) % 84}%`,
            size: 4 + (i * 3.7) % 18,
            delay: `${(i * 0.85) % 9}s`,
            duration: `${7 + (i * 1.3) % 8}s`,
            opacity: 0.08 + (i % 5) * 0.04,
        }))
    }, [])

    return (
        <div
            className="fixed w-full h-full inset-0 z-[2] pointer-events-none overflow-hidden"
            aria-hidden="true"
        >
            {bubbles.map(b => (
                <div
                    key={b.id}
                    style={{
                        position: "absolute",
                        bottom: "-5%",
                        left: b.left,
                        width: b.size,
                        height: b.size,
                        borderRadius: "50%",
                        border: `1px solid rgba(125,211,252,${b.opacity * 2.5})`,
                        background: `radial-gradient(circle at 35% 35%, rgba(186,230,253,${b.opacity}), transparent 70%)`,
                        animationName: "sea-bg-bubble-rise",
                        animationDuration: b.duration,
                        animationDelay: b.delay,
                        animationTimingFunction: "ease-in-out",
                        animationIterationCount: "infinite",
                        animationFillMode: "both",
                    }}
                />
            ))}

            {/* Inline keyframe — injected once alongside the bubbles */}
            <style>{`
                @keyframes sea-bg-bubble-rise {
                    0%   { transform: translateY(0) translateX(0) scale(0.85); opacity: 0; }
                    8%   { opacity: 1; }
                    50%  { transform: translateY(-45vh) translateX(12px) scale(1); }
                    80%  { opacity: 0.6; }
                    100% { transform: translateY(-95vh) translateX(-8px) scale(1.1); opacity: 0; }
                }
            `}</style>
        </div>
    )
}

export function CustomBackgroundImage(props: CustomBackgroundImageProps) {

    const {
        className,
        ...rest
    } = props

    const ts = useThemeSettings()
    const pathname = usePathname()
    const { state: uiState } = useUICustomize()

    // Exclude specific pages from background effects
    const isExcludedPage = React.useMemo(() => {
        return pathname.includes('/manga/entry') ||
               pathname.includes('/entry') ||
               pathname.includes('/manga/_containers/chapter-reader')
    }, [pathname])

    // Read active visual effects preset values
    const effectPreset  = EFFECTS_PRESETS.find(p => p.id === uiState.effects)
    const vignetteStr   = parseFloat(effectPreset?.cssVars?.["--sea-vignette"]  ?? "0")
    const glowStr       = parseFloat(effectPreset?.cssVars?.["--sea-glow"]      ?? "0")
    const grainStr      = parseFloat(effectPreset?.cssVars?.["--sea-grain"]     ?? "0")
    const hasScanning   = effectPreset?.cssVars?.["--sea-scanlines"] === "1"
    const hasBlurEdge   = effectPreset?.cssVars?.["--sea-blur-edge"] === "1"
    const hasDeepSea    = effectPreset?.cssVars?.["--sea-deep-sea"]  === "1"
    const hasInkWash    = effectPreset?.cssVars?.["--sea-ink-wash"]  === "1"
    const hueRotate     = effectPreset?.cssVars?.["--sea-hue-rotate"] ?? ""

    // Build image filter string — combines slider glow, hue-rotate, and ink-wash
    const buildImageFilter = React.useCallback(() => {
        const parts: string[] = []
        if (ts.libraryScreenCustomBackgroundGlow > 0) {
            parts.push(`brightness(${1 + ts.libraryScreenCustomBackgroundGlow * 0.025})`)
            parts.push(`saturate(${1 + ts.libraryScreenCustomBackgroundGlow * 0.015})`)
        }
        if (hueRotate) {
            parts.push(`hue-rotate(${hueRotate})`)
        }
        if (hasInkWash) {
            parts.push("saturate(0.12)")
            parts.push("contrast(1.08)")
        }
        return parts.length > 0 ? parts.join(" ") : undefined
    }, [ts.libraryScreenCustomBackgroundGlow, hueRotate, hasInkWash])

    if (isExcludedPage) return null

    return (
        <>
            {!!ts.libraryScreenCustomBackgroundImage && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1, delay: 0.1 }}
                    className="fixed w-full h-full inset-0 pointer-events-none"
                    data-custom-background-image
                >
                    {/* Dim/blur overlay */}
                    <div
                        data-custom-background-image-blur
                        className="fixed w-full h-full inset-0 z-[0] backdrop-blur-2xl bg-black/80 transition-all duration-1000"
                    />

                    {/* Base wallpaper — hue-rotate and ink-wash applied here */}
                    <div
                        data-custom-background-image-cover
                        className={cn(
                            "fixed w-full h-full inset-0 z-[-1] bg-no-repeat bg-cover bg-center transition-opacity duration-1000 scroll-locked-offset-fixed",
                            className,
                        )}
                        style={{
                            backgroundImage: `url(${getAssetUrl(ts.libraryScreenCustomBackgroundImage)})`,
                            opacity: ts.libraryScreenCustomBackgroundOpacity / 100,
                            filter: buildImageFilter(),
                        }}
                        {...rest}
                    />

                    {/* ── Bloom/glow from settings slider ─────────────────── */}
                    {ts.libraryScreenCustomBackgroundGlow > 0 && (
                        <div
                            className="fixed w-full h-full inset-0 z-[0] pointer-events-none"
                            style={{
                                backgroundImage: `url(${getAssetUrl(ts.libraryScreenCustomBackgroundImage)})`,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                                opacity: (ts.libraryScreenCustomBackgroundGlow / 100) * 0.18,
                                filter: `blur(40px) brightness(2) saturate(1.5)`,
                                mixBlendMode: "screen",
                            }}
                        />
                    )}

                    {/* ── Visual effects preset — applied to wallpaper only ── */}

                    {/* Vignette: dark radial frame around the edges */}
                    {vignetteStr > 0 && (
                        <div
                            className="fixed w-full h-full inset-0 z-[1] pointer-events-none"
                            style={{
                                background: `radial-gradient(ellipse at center, transparent ${Math.max(0, 60 - vignetteStr * 30)}%, rgba(0,0,0,${Math.min(0.92, vignetteStr * 0.85)}) 100%)`,
                            }}
                        />
                    )}

                    {/* Glow: soft radial light from the center */}
                    {glowStr > 0 && (
                        <div
                            className="fixed w-full h-full inset-0 z-[1] pointer-events-none"
                            style={{
                                background: `radial-gradient(ellipse at center, rgba(255,255,255,${glowStr * 0.12}) 0%, transparent 65%)`,
                                mixBlendMode: "screen",
                            }}
                        />
                    )}

                    {/* Film grain: SVG turbulence noise texture */}
                    {grainStr > 0 && (
                        <div
                            className="fixed w-full h-full inset-0 z-[1] pointer-events-none"
                            style={{
                                opacity: grainStr * 0.55,
                                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
                                backgroundRepeat: "repeat",
                                backgroundSize: "128px 128px",
                                mixBlendMode: "overlay",
                            }}
                        />
                    )}

                    {/* Scan lines: fine horizontal lines */}
                    {hasScanning && (
                        <div
                            className="fixed w-full h-full inset-0 z-[1] pointer-events-none"
                            style={{
                                background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 4px)",
                            }}
                        />
                    )}

                    {/* Blur edges: soft mask at screen perimeter */}
                    {hasBlurEdge && (
                        <div
                            className="fixed w-full h-full inset-0 z-[1] pointer-events-none"
                            style={{
                                boxShadow: "inset 0 0 120px 60px rgba(0,0,0,0.65)",
                                borderRadius: 0,
                            }}
                        />
                    )}

                    {/* Deep Sea: cool blue tint overlay + rising bubble animation */}
                    {hasDeepSea && (
                        <>
                            {/* Blue tint layer */}
                            <div
                                className="fixed w-full h-full inset-0 z-[1] pointer-events-none"
                                style={{
                                    background: "linear-gradient(180deg, rgba(3,105,161,0.22) 0%, rgba(7,89,133,0.35) 100%)",
                                    mixBlendMode: "multiply",
                                }}
                            />
                            {/* Caustic-light shimmer ripple */}
                            <div
                                className="fixed w-full h-full inset-0 z-[1] pointer-events-none"
                                style={{
                                    background: "radial-gradient(ellipse 80% 40% at 50% 30%, rgba(125,211,252,0.08), transparent 70%)",
                                    mixBlendMode: "screen",
                                }}
                            />
                            {/* Rising bubbles */}
                            <DeepSeaBubbles />
                        </>
                    )}

                    {/* Ink Wash: secondary grain pass to reinforce the monochrome feel */}
                    {hasInkWash && grainStr === 0 && (
                        <div
                            className="fixed w-full h-full inset-0 z-[1] pointer-events-none"
                            style={{
                                opacity: 0.28,
                                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
                                backgroundRepeat: "repeat",
                                backgroundSize: "128px 128px",
                                mixBlendMode: "multiply",
                            }}
                        />
                    )}
                </motion.div>
            )}
        </>
    )
}
