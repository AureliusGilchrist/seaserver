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
    const effectPreset = EFFECTS_PRESETS.find(p => p.id === uiState.effects)
    const vignetteStr  = parseFloat(effectPreset?.cssVars?.["--sea-vignette"]  ?? "0")
    const glowStr      = parseFloat(effectPreset?.cssVars?.["--sea-glow"]      ?? "0")
    const grainStr     = parseFloat(effectPreset?.cssVars?.["--sea-grain"]     ?? "0")
    const hasScanning  = effectPreset?.cssVars?.["--sea-scanlines"] === "1"
    const hasBlurEdge  = effectPreset?.cssVars?.["--sea-blur-edge"] === "1"

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

                    {/* Base wallpaper */}
                    <div
                        data-custom-background-image-cover
                        className={cn(
                            "fixed w-full h-full inset-0 z-[-1] bg-no-repeat bg-cover bg-center transition-opacity duration-1000 scroll-locked-offset-fixed",
                            className,
                        )}
                        style={{
                            backgroundImage: `url(${getAssetUrl(ts.libraryScreenCustomBackgroundImage)})`,
                            opacity: ts.libraryScreenCustomBackgroundOpacity / 100,
                            filter: ts.libraryScreenCustomBackgroundGlow > 0
                                ? `brightness(${1 + ts.libraryScreenCustomBackgroundGlow * 0.025}) saturate(${1 + ts.libraryScreenCustomBackgroundGlow * 0.015})`
                                : undefined,
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
                </motion.div>
            )}
        </>
    )
}
