"use client"

import { getServerBaseUrl } from "@/api/client/server-url"
import { useServerMutation } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { useListThemeBackgrounds, useSearchWallhaven, WallhavenWallpaper } from "@/api/hooks/theme_backgrounds.hooks"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { ThemeBackgroundImage } from "@/lib/theme/anime-themes/anime-theme-provider"
import { useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"

export type WallpaperEffects = {
    dim: number
    blur: number
    exposure: number
    saturation: number
    contrast: number
    scanlinesStrength: number
    noiseStrength: number
    vignetteStrength: number
    glowStrength: number
    hologramStrength: number
}

export const DEFAULT_WALLPAPER_EFFECTS: WallpaperEffects = {
    dim: 0.5,
    blur: 0,
    exposure: 1,
    saturation: 1,
    contrast: 1,
    scanlinesStrength: 0,
    noiseStrength: 0,
    vignetteStrength: 0,
    glowStrength: 0,
    hologramStrength: 0,
}

export function parseWallpaperEffects(raw?: string | null): WallpaperEffects {
    if (!raw) return DEFAULT_WALLPAPER_EFFECTS
    try {
        return { ...DEFAULT_WALLPAPER_EFFECTS, ...(JSON.parse(raw) as Partial<WallpaperEffects>) }
    }
    catch {
        return DEFAULT_WALLPAPER_EFFECTS
    }
}

function resolveUrl(url: string): string {
    return url.startsWith("/") ? `${getServerBaseUrl()}${url}` : url
}

/** The profile's wallpaper, drawn with the same effect stack as the anime theme wallpaper. */
export function ProfileWallpaper({ url, effects }: { url?: string | null; effects?: string | null }) {
    const fx = React.useMemo(() => parseWallpaperEffects(effects), [effects])
    const [mounted, setMounted] = React.useState(false)
    React.useEffect(() => setMounted(true), [])
    if (!url || !mounted) return null
    // Portaled to <body> so no ancestor transform/stacking context can hide or clip the fixed layer.
    return createPortal(
        <ThemeBackgroundImage
            url={resolveUrl(url)}
            dim={fx.dim}
            blur={fx.blur}
            exposure={fx.exposure}
            saturation={fx.saturation}
            contrast={fx.contrast}
            scanlinesStrength={fx.scanlinesStrength}
            noiseStrength={fx.noiseStrength}
            vignetteStrength={fx.vignetteStrength}
            glowStrength={fx.glowStrength}
            hologramStrength={fx.hologramStrength}
        />,
        document.body,
    )
}

const SLIDERS: { key: keyof WallpaperEffects; label: string; min: number; max: number; step: number }[] = [
    { key: "dim", label: "Dim", min: 0.5, max: 0.95, step: 0.05 },
    { key: "blur", label: "Blur", min: 0, max: 20, step: 1 },
    { key: "exposure", label: "Exposure", min: 0.5, max: 1.5, step: 0.05 },
    { key: "saturation", label: "Saturation", min: 0, max: 2, step: 0.05 },
    { key: "contrast", label: "Contrast", min: 0.5, max: 1.5, step: 0.05 },
    { key: "scanlinesStrength", label: "Scan lines", min: 0, max: 1, step: 0.05 },
    { key: "noiseStrength", label: "Film noise", min: 0, max: 1, step: 0.05 },
    { key: "vignetteStrength", label: "Vignette", min: 0, max: 1, step: 0.05 },
    { key: "glowStrength", label: "Glow", min: 0, max: 1, step: 0.05 },
    { key: "hologramStrength", label: "Hologram", min: 0, max: 1, step: 0.05 },
]

export function ProfileWallpaperEditor({ currentUrl, currentEffects }: { currentUrl?: string | null; currentEffects?: string | null }) {
    const qc = useQueryClient()
    const [url, setUrl] = React.useState(currentUrl ?? "")
    const [fx, setFx] = React.useState<WallpaperEffects>(() => parseWallpaperEffects(currentEffects))
    const fileRef = React.useRef<HTMLInputElement>(null)
    const { data: themeBgs } = useListThemeBackgrounds()

    const [query, setQuery] = React.useState("")
    const [committedQuery, setCommittedQuery] = React.useState("")
    const [page, setPage] = React.useState(1)
    const [results, setResults] = React.useState<WallhavenWallpaper[]>([])
    const { data: searchData, isFetching } = useSearchWallhaven(committedQuery, page, !!committedQuery)
    const lastData = React.useRef<typeof searchData>(undefined)
    React.useEffect(() => {
        if (!searchData?.data || searchData === lastData.current) return
        lastData.current = searchData
        setResults(prev => page === 1 ? searchData.data : [...prev, ...searchData.data])
    }, [searchData, page])

    const runSearch = () => {
        const q = query.trim()
        if (!q) return
        lastData.current = undefined
        setResults([])
        setPage(1)
        setCommittedQuery(q)
    }

    const refresh = () => {
        qc.invalidateQueries({ queryKey: [API_ENDPOINTS.PROFILE_PAGE.GetMyProfile.key] })
        qc.invalidateQueries({ queryKey: [API_ENDPOINTS.PROFILE_PAGE.GetUserProfile.key] })
    }

    const { mutate: save, isPending: saving } = useServerMutation<unknown, { url: string; effects: string }>({
        endpoint: "/api/v1/profile/wallpaper",
        method: "PATCH",
        onSuccess: () => {
            toast.success("Profile wallpaper saved")
            refresh()
        },
    })

    const { mutate: upload, isPending: uploading } = useServerMutation<any, FormData>({
        endpoint: "/api/v1/profile/wallpaper/upload",
        method: "POST",
        onSuccess: (res) => {
            if (res?.wallpaperUrl) setUrl(res.wallpaperUrl)
            toast.success("Wallpaper uploaded")
            refresh()
        },
    })

    const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.target.value = ""
        if (!file) return
        const form = new FormData()
        form.append("wallpaper", file)
        upload(form)
    }

    return (
        <>
            <div>
                <div className="space-y-4">
                    <p className="text-sm text-[--muted]">
                        Everyone who visits your profile sees this wallpaper with these effects. Only you can edit it. The preview is the full page background,
                        live behind this tab.
                    </p>

                    {url && <ProfileWallpaper url={url} effects={JSON.stringify(fx)} />}

                    <div className="flex flex-wrap gap-2">
                        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={onPickFile} />
                        <Button intent="primary-outline" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
                            Upload image
                        </Button>
                        <Button intent="alert-subtle" size="sm" disabled={!url} onClick={() => setUrl("")}>
                            Remove
                        </Button>
                    </div>

                    <div>
                        <div className="text-sm font-medium mb-2">Search wallpapers</div>
                        <form className="flex gap-2 mb-2" onSubmit={e => { e.preventDefault(); runSearch() }}>
                            <input
                                className="flex-1 bg-[--subtle] border border-[--border] rounded px-3 py-1.5 text-sm"
                                placeholder="e.g. anime city night"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                            />
                            <Button type="submit" size="sm" intent="primary-outline" loading={isFetching && page === 1}>Search</Button>
                        </form>
                        {!!results.length && (
                            <>
                                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-h-72 overflow-y-auto pr-1">
                                    {results.map(w => (
                                        <button
                                            key={w.id}
                                            type="button"
                                            onClick={() => setUrl(w.path)}
                                            className={cn(
                                                "aspect-video rounded overflow-hidden border-2 bg-cover bg-center",
                                                url === w.path ? "border-brand-400" : "border-transparent hover:border-[--border]",
                                            )}
                                            style={{ backgroundImage: `url("${w.thumbs.small}")` }}
                                            title={w.resolution}
                                        />
                                    ))}
                                </div>
                                <Button className="mt-2" size="sm" intent="gray-subtle" loading={isFetching && page > 1} onClick={() => setPage(p => p + 1)}>
                                    Load more
                                </Button>
                            </>
                        )}
                    </div>

                    {!!themeBgs?.length && (
                        <div>
                            <div className="text-sm font-medium mb-2">Anime theme wallpapers</div>
                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto pr-1">
                                {themeBgs.map(bg => (
                                    <button
                                        key={bg.filename}
                                        type="button"
                                        onClick={() => setUrl(bg.url)}
                                        className={cn(
                                            "aspect-video rounded overflow-hidden border-2 bg-cover bg-center",
                                            url === bg.url ? "border-brand-400" : "border-transparent hover:border-[--border]",
                                        )}
                                        style={{ backgroundImage: `url("${resolveUrl(bg.url)}")` }}
                                        title={bg.filename}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                        {SLIDERS.map(s => (
                            <label key={s.key} className="flex items-center gap-3 text-sm">
                                <span className="w-24 shrink-0 text-[--muted]">{s.label}</span>
                                <input
                                    type="range"
                                    className="flex-1 accent-brand-400"
                                    min={s.min}
                                    max={s.max}
                                    step={s.step}
                                    value={fx[s.key]}
                                    onChange={e => setFx(prev => ({ ...prev, [s.key]: Number(e.target.value) }))}
                                />
                                <span className="w-10 text-right tabular-nums">{fx[s.key]}</span>
                            </label>
                        ))}
                    </div>

                    <div className="flex justify-between">
                        <Button intent="gray-subtle" size="sm" onClick={() => setFx(DEFAULT_WALLPAPER_EFFECTS)}>Reset effects</Button>
                        <Button intent="primary" loading={saving} onClick={() => save({ url, effects: JSON.stringify(fx) })}>Save</Button>
                    </div>
                </div>
            </div>
        </>
    )
}
