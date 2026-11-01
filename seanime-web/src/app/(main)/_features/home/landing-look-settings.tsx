"use client"

import { useServerMutation } from "@/api/client/requests"
import { Button } from "@/components/ui/button"
import { useAnimeThemeOrNull } from "@/lib/theme/anime-themes/anime-theme-provider"
import { resolveLandingImage, useLandingLook, useMobileLook } from "@/lib/theme/landing-look"
import { __isMobileShell__ } from "@/types/constants"
import React from "react"
import { LuImage, LuTrash2, LuUpload } from "react-icons/lu"
import { toast } from "sonner"

/** The landing page's wallpaper and banner. Saved as you go, so the page behind the dialog updates. */
export function LandingLookSettings() {
    const { look, updateLook } = useLandingLook()

    return (
        <section className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4" data-landing-look-settings>
            <div>
                <p className="font-semibold text-white">Wallpaper and banner</p>
                <p className="text-xs text-[--muted]">
                    For this page only. They take your theme's effects, like the app-wide images do, and left empty the app-wide images are used.
                </p>
            </div>

            <ImageRow label="Wallpaper" slot="wallpaper" value={look.wallpaper} onChange={wallpaper => updateLook({ wallpaper })}>
                <Slider label="Opacity" value={look.wallpaperOpacity} min={1} onChange={wallpaperOpacity => updateLook({ wallpaperOpacity })} />
                <Slider label="Glow" value={look.wallpaperGlow} min={0} onChange={wallpaperGlow => updateLook({ wallpaperGlow })} />
            </ImageRow>

            <ImageRow label="Banner" slot="banner" value={look.banner} onChange={banner => updateLook({ banner })}>
                <Slider label="Opacity" value={look.bannerOpacity} min={1} onChange={bannerOpacity => updateLook({ bannerOpacity })} />
                <label className="block text-xs text-[--muted]">
                    Position
                    <input
                        value={look.bannerPosition}
                        onChange={event => updateLook({ bannerPosition: event.target.value })}
                        placeholder="50% 50%"
                        className="mt-1 w-full rounded-lg border border-white/10 bg-gray-950/80 px-2.5 py-1.5 text-sm text-white focus:border-[--brand]/60 focus:outline-none"
                    />
                </label>
            </ImageRow>
        </section>
    )
}

/** Denshi Mobile only: the wallpaper and effects here are the phone's own and never reach another device. */
export function MobileWallpaperSettings() {
    if (!__isMobileShell__) return null
    return <MobileWallpaperControls />
}

const percent = (value: number) => `${Math.round(value * 100)}%`

function MobileWallpaperControls() {
    const { look, updateLook } = useMobileLook()
    const theme = useAnimeThemeOrNull()
    if (!theme) return null

    const resetEffects = () => {
        theme.resetBackgroundDim()
        theme.setBackgroundBlur(0)
        theme.setBackgroundExposure(1)
        theme.setBackgroundSaturation(1)
        theme.setBackgroundContrast(1)
        theme.setScanlinesStrength(0)
        theme.setScanlinesSize(0.5)
        theme.setVignetteStrength(0)
        theme.setVignetteSize(0.5)
        theme.setGlowStrength(0)
        theme.setGlowScale(0.5)
        theme.setNoiseStrength(0)
        theme.setNoiseSpeed(1)
        theme.setHologramStrength(0)
    }

    return (
        <section className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4" data-mobile-wallpaper-settings>
            <div>
                <p className="font-semibold text-white">Phone wallpaper</p>
                <p className="text-xs text-[--muted]">
                    Shows on every page of this app, in place of any other wallpaper. Left empty, your theme's wallpaper is used. Nothing here changes your desktop.
                </p>
            </div>
            <ImageRow label="Wallpaper" slot="mobile-wallpaper" value={look.wallpaper} onChange={wallpaper => updateLook({ wallpaper })}>
                <Slider label="Opacity" value={look.wallpaperOpacity} min={1} onChange={wallpaperOpacity => updateLook({ wallpaperOpacity })} />
                <Slider label="Bloom" value={look.wallpaperGlow} min={0} onChange={wallpaperGlow => updateLook({ wallpaperGlow })} />
            </ImageRow>

            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                <Slider label="Dim" value={theme.backgroundDim} min={0} max={0.95} step={0.01} display={percent(theme.backgroundDim)} onChange={theme.setBackgroundDim} />
                <Slider label="Blur" value={theme.backgroundBlur} min={0} max={60} display={`${theme.backgroundBlur}px`} onChange={theme.setBackgroundBlur} />
                <Slider label="Exposure" value={theme.backgroundExposure} min={0.1} max={2.5} step={0.05} display={percent(theme.backgroundExposure)} onChange={theme.setBackgroundExposure} />
                <Slider label="Saturation" value={theme.backgroundSaturation} min={0} max={3} step={0.05} display={percent(theme.backgroundSaturation)} onChange={theme.setBackgroundSaturation} />
                <Slider label="Contrast" value={theme.backgroundContrast} min={0} max={3} step={0.05} display={percent(theme.backgroundContrast)} onChange={theme.setBackgroundContrast} />
                <Slider label="Scanlines" value={theme.scanlinesStrength} min={0} max={1} step={0.01} display={percent(theme.scanlinesStrength)} onChange={theme.setScanlinesStrength} />
                <Slider label="Scanline spacing" value={theme.scanlinesSize} min={0} max={1} step={0.01} display={percent(theme.scanlinesSize)} onChange={theme.setScanlinesSize} />
                <Slider label="Vignette" value={theme.vignetteStrength} min={0} max={1} step={0.01} display={percent(theme.vignetteStrength)} onChange={theme.setVignetteStrength} />
                <Slider label="Vignette size" value={theme.vignetteSize} min={0} max={1} step={0.01} display={percent(theme.vignetteSize)} onChange={theme.setVignetteSize} />
                <Slider label="Glow" value={theme.glowStrength} min={0} max={1} step={0.01} display={percent(theme.glowStrength)} onChange={theme.setGlowStrength} />
                <Slider label="Glow size" value={theme.glowScale} min={0} max={1} step={0.01} display={percent(theme.glowScale)} onChange={theme.setGlowScale} />
                <Slider label="Film noise" value={theme.noiseStrength} min={0} max={1} step={0.01} display={percent(theme.noiseStrength)} onChange={theme.setNoiseStrength} />
                <Slider label="Noise speed" value={theme.noiseSpeed} min={0.1} max={5} step={0.1} display={`${theme.noiseSpeed.toFixed(1)}x`} onChange={theme.setNoiseSpeed} />
                <Slider label="Hologram" value={theme.hologramStrength} min={0} max={1} step={0.01} display={percent(theme.hologramStrength)} onChange={theme.setHologramStrength} />
            </div>

            <Button size="xs" intent="white-subtle" onClick={resetEffects}>Reset effects</Button>
        </section>
    )
}

function ImageRow({ label, slot, value, onChange, children }: {
    label: string
    slot: "wallpaper" | "banner" | "mobile-wallpaper"
    value: string
    onChange: (value: string) => void
    children: React.ReactNode
}) {
    const inputRef = React.useRef<HTMLInputElement>(null)
    const { mutate: upload, isPending } = useServerMutation<{ url: string }, FormData>({
        endpoint: "/api/v1/profile/landing-image/upload",
        method: "POST",
        mutationKey: ["landing-image-upload", slot],
        onSuccess: result => {
            if (!result?.url) return
            onChange(result.url)
            toast.success(`${label} uploaded`)
        },
    })

    const onPickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        event.target.value = ""
        if (!file) return
        const form = new FormData()
        form.append("slot", slot)
        form.append("image", file)
        upload(form)
    }

    return (
        <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-3 sm:flex-row">
            <div
                className="flex h-24 w-full shrink-0 items-center justify-center rounded-lg bg-white/[0.04] bg-cover bg-center ring-1 ring-white/10 sm:w-40"
                style={value ? { backgroundImage: `url("${resolveLandingImage(value)}")` } : undefined}
            >
                {!value && <LuImage className="size-6 text-white/30" />}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-white">{label}</p>
                    <div className="flex items-center gap-1.5">
                        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={onPickFile} />
                        <Button size="xs" intent="white-subtle" leftIcon={<LuUpload />} loading={isPending} onClick={() => inputRef.current?.click()}>Upload</Button>
                        {!!value && <Button size="xs" intent="alert-subtle" leftIcon={<LuTrash2 />} onClick={() => onChange("")}>Remove</Button>}
                    </div>
                </div>
                <input
                    value={value}
                    onChange={event => onChange(event.target.value)}
                    placeholder="Or an image path, e.g. image.png"
                    aria-label={`${label} image path`}
                    className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-2.5 py-1.5 text-sm text-white focus:border-[--brand]/60 focus:outline-none"
                />
                {!!value && <div className="grid gap-2 sm:grid-cols-2">{children}</div>}
            </div>
        </div>
    )
}

function Slider({ label, value, min, max = 100, step = 1, display, onChange }: {
    label: string
    value: number
    min: number
    max?: number
    step?: number
    display?: string
    onChange: (value: number) => void
}) {
    return (
        <label className="block text-xs text-[--muted]">
            <span className="flex justify-between"><span>{label}</span><span className="tabular-nums">{display ?? value}</span></span>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={event => onChange(Number(event.target.value))}
                className="mt-1 w-full accent-[rgb(var(--color-brand-500))]"
            />
        </label>
    )
}
