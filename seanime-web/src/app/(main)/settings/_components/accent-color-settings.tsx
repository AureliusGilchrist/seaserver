"use client"
import { cn } from "@/components/ui/core/styling"
import { setClientSettings, useClientSettings } from "@/lib/client-settings"
import { animeThemeBrandOverrideAtom, wallpaperAccentColorAtom } from "@/lib/theme/color-mixing"
import { useThemeSettings } from "@/lib/theme/hooks"
import { colord } from "colord"
import { useAtomValue } from "jotai/react"
import React from "react"
import { LuCheck, LuPalette, LuPipette, LuWandSparkles } from "react-icons/lu"

const SWATCHES = [
    "#6152df", "#8b5cf6", "#d946ef", "#ec4899", "#f43f5e", "#ef4444",
    "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e", "#10b981",
    "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1", "#94a3b8",
]

/**
 * Personal -> Accent colour. Default keeps the accent the theme, the Theme Manager or the wallpaper
 * gives; Custom sets this profile's own, over all of them. The app recolours a moment after a pick.
 */
export function AccentColorSettings() {
    const { accentColorOverride } = useClientSettings()
    const ts = useThemeSettings()
    const wallpaperAccent = useAtomValue(wallpaperAccentColorAtom)
    const themeBrand = useAtomValue(animeThemeBrandOverrideAtom)
    const defaultAccent = wallpaperAccent ?? themeBrand ?? (ts.enableColorSettings ? ts.accentColor : null) ?? "#6152df"
    const defaultSource = wallpaperAccent ? "From your wallpaper" : themeBrand ? "From the Theme Manager" : "From the theme"

    const [draft, setDraft] = React.useState<string | null>(null)
    React.useEffect(() => setDraft(null), [accentColorOverride])
    const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
    React.useEffect(() => () => clearTimeout(timer.current), [])

    const custom = draft ?? accentColorOverride ?? null
    const isCustom = custom !== null
    const shown = custom ?? defaultAccent
    const [hex, setHex] = React.useState(shown)
    React.useEffect(() => setHex(shown), [shown])

    const pick = (color: string, immediate = false) => {
        const v = colord(color)
        if (!v.isValid()) return
        const next = v.toHex().slice(0, 7)
        setDraft(next)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setClientSettings(prev => ({ ...prev, accentColorOverride: next })), immediate ? 0 : 200)
    }
    const useDefault = () => {
        clearTimeout(timer.current)
        setDraft(null)
        setClientSettings(prev => {
            const next = { ...prev }
            delete next.accentColorOverride
            return next
        })
    }

    const light = colord(shown).lighten(0.3).desaturate(0.05).toHex()
    const deep = colord(shown).darken(0.2).toHex()

    return (
        <div className="space-y-4">
            <div>
                <p className="inline-flex items-center gap-2 text-sm font-medium"><LuPalette className="size-4 text-[--muted]" /> Accent colour</p>
                <p className="text-xs text-[--muted]">The colour of buttons, highlights, progress and the tint. Keep the default or pick your own for this profile.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <Tile active={!isCustom} onClick={useDefault} color={defaultAccent} icon={LuWandSparkles} title="Default" badge="Recommended" description={defaultSource} />
                <Tile
                    active={isCustom}
                    onClick={() => pick(custom ?? defaultAccent, true)}
                    color={custom ?? defaultAccent}
                    icon={LuPipette}
                    title="Custom"
                    description="Your own colour, everywhere."
                />
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_15rem]">
                <div className="space-y-3">
                    <div className="grid grid-cols-9 gap-2">
                        {SWATCHES.map(c => {
                            const active = isCustom && custom?.toLowerCase() === c
                            return (
                                <button
                                    key={c}
                                    type="button"
                                    aria-label={`Accent ${c}`}
                                    onClick={() => pick(c, true)}
                                    className={cn(
                                        "relative aspect-square rounded-full transition-transform hover:scale-110 active:scale-95",
                                        active && "scale-110",
                                    )}
                                    style={{
                                        backgroundColor: c,
                                        boxShadow: active ? `0 0 0 2px var(--background, #070707), 0 0 0 4px ${c}, 0 6px 16px -4px ${c}` : `inset 0 1px 0 rgb(255 255 255 / 0.25)`,
                                    }}
                                >
                                    {active && <LuCheck className="absolute inset-0 m-auto size-3.5 text-[#fff] drop-shadow" />}
                                </button>
                            )
                        })}
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[rgba(0,0,0,0.18)] p-1.5 pr-2 focus-within:border-white/25">
                        <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-lg ring-1 ring-white/20" style={{ backgroundColor: shown }}>
                            <input
                                type="color"
                                aria-label="Pick any accent colour"
                                value={shown}
                                onChange={e => pick(e.target.value)}
                                className="absolute inset-0 size-full cursor-pointer opacity-0"
                            />
                        </label>
                        <input
                            type="text"
                            value={hex}
                            spellCheck={false}
                            maxLength={7}
                            onChange={e => setHex(e.target.value)}
                            onBlur={() => colord(hex.startsWith("#") ? hex : `#${hex}`).isValid() ? pick(hex.startsWith("#") ? hex : `#${hex}`, true) : setHex(shown)}
                            onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                            className="min-w-0 flex-1 bg-transparent font-mono text-sm uppercase tracking-wide outline-none"
                        />
                        <span className="text-[0.65rem] uppercase tracking-wider text-[--muted]">Any colour</span>
                    </div>
                </div>

                {/* Preview: the pieces the accent paints, drawn with the colour being picked. */}
                <div
                    className="space-y-3 rounded-2xl border border-white/[0.07] p-4"
                    style={{ background: `radial-gradient(120% 120% at 100% 0%, ${shown}22, transparent 60%), rgb(0 0 0 / 0.22)` }}
                >
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[--muted]">Preview</p>
                    <div className="flex items-center gap-2">
                        <span className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#fff] shadow-lg" style={{ backgroundColor: shown, boxShadow: `0 8px 20px -8px ${shown}` }}>Watch</span>
                        <span className="rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: `${shown}66`, color: light }}>Add to list</span>
                        <span className="relative ml-auto h-5 w-9 rounded-full" style={{ backgroundColor: shown }}>
                            <span className="absolute right-0.5 top-0.5 size-4 rounded-full bg-[#fff]" />
                        </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full w-2/3 rounded-full" style={{ background: `linear-gradient(90deg, ${deep}, ${shown}, ${light})` }} />
                    </div>
                    <p className="text-xs text-[--muted]">Episode 8 of 12 · <span style={{ color: light }}>Continue watching</span></p>
                </div>
            </div>
        </div>
    )
}

function Tile({ active, onClick, color, icon: Icon, title, badge, description }: {
    active: boolean
    onClick: () => void
    color: string
    icon: React.ElementType
    title: string
    badge?: string
    description: string
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
                active ? "border-brand-300/50 bg-brand-500/10 shadow-[0_0_0_3px_rgb(var(--color-brand-500)/0.15)]" : "border-white/10 hover:border-white/25 hover:bg-white/[0.03]",
            )}
        >
            <span
                className="relative flex size-12 shrink-0 items-center justify-center rounded-lg ring-1 ring-white/15"
                style={{ background: `linear-gradient(135deg, ${colord(color).lighten(0.15).toHex()}, ${colord(color).darken(0.15).toHex()})` }}
            >
                <Icon className="size-5 text-[#fff] drop-shadow" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold">
                    {title}
                    {badge && <span className="rounded-full bg-brand-500/25 px-1.5 py-px text-[0.6rem] font-semibold uppercase tracking-wider text-brand-200">{badge}</span>}
                </span>
                <span className="mt-0.5 block text-xs text-[--muted]">{description}</span>
            </span>
            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border transition-all", active ? "border-transparent bg-brand-500 text-[#fff]" : "border-white/20")}>
                {active && <LuCheck className="size-3" />}
            </span>
        </button>
    )
}
