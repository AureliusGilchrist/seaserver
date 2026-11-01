"use client"

import { useServerMutation } from "@/api/client/requests"
import { Button } from "@/components/ui/button"
import { resolveLandingImage, useIsPhone, useLandingLook } from "@/lib/theme/landing-look"
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

/** Only on a phone, and only a phone uses it, so a desktop keeps its own wallpaper. */
export function MobileWallpaperSettings() {
    const { look, updateLook } = useLandingLook()
    const isPhone = useIsPhone()
    if (!isPhone) return null

    return (
        <section className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4" data-mobile-wallpaper-settings>
            <div>
                <p className="font-semibold text-white">Phone wallpaper</p>
                <p className="text-xs text-[--muted]">
                    Shows on every page, on phones only, in place of any other wallpaper. Left empty, your phone uses those as usual.
                </p>
            </div>
            <ImageRow label="Wallpaper" slot="mobile-wallpaper" value={look.mobileWallpaper} onChange={mobileWallpaper => updateLook({ mobileWallpaper })}>
                <Slider label="Opacity" value={look.mobileWallpaperOpacity} min={1} onChange={mobileWallpaperOpacity => updateLook({ mobileWallpaperOpacity })} />
                <Slider label="Glow" value={look.mobileWallpaperGlow} min={0} onChange={mobileWallpaperGlow => updateLook({ mobileWallpaperGlow })} />
            </ImageRow>
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

function Slider({ label, value, min, onChange }: { label: string, value: number, min: number, onChange: (value: number) => void }) {
    return (
        <label className="block text-xs text-[--muted]">
            <span className="flex justify-between"><span>{label}</span><span className="tabular-nums">{value}</span></span>
            <input
                type="range"
                min={min}
                max={100}
                value={value}
                onChange={event => onChange(Number(event.target.value))}
                className="mt-1 w-full accent-[rgb(var(--color-brand-500))]"
            />
        </label>
    )
}
