"use client"
import { THEME_PLAYER_VOLUME_DEFAULT } from "@/app/(main)/_features/anime-themes/theme-player"
import { cn } from "@/components/ui/core/styling"
import { Switch } from "@/components/ui/switch"
import { setClientSettings, useClientSettings } from "@/lib/client-settings"
import React from "react"
import { LuVolume1, LuVolume2, LuVolumeX } from "react-icons/lu"

/**
 * Personal -> "Automatically play openings on anime pages", and the volume the openings player plays
 * at (the autoplay, the Anime Themes view and favourite openings alike). The volume follows the
 * slider live, so a theme already playing can be tuned by ear; it is saved once the slider stops.
 */
export function OpeningsAutoplaySettings() {
    const { autoPlayThemesOnDetails, themePlayerVolume } = useClientSettings()
    const [draft, setDraft] = React.useState<number | null>(null)
    React.useEffect(() => setDraft(null), [themePlayerVolume])
    const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
    React.useEffect(() => () => clearTimeout(timer.current), [])
    const lastAudible = React.useRef(THEME_PLAYER_VOLUME_DEFAULT)

    const volume = draft ?? themePlayerVolume ?? THEME_PLAYER_VOLUME_DEFAULT
    if (volume > 0) lastAudible.current = volume

    const change = (v: number, immediate = false) => {
        const next = Math.min(100, Math.max(0, Math.round(v)))
        setDraft(next)
        // The bar reads the setting, so playing audio follows each step quickly.
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setClientSettings(prev => ({ ...prev, themePlayerVolume: next })), immediate ? 0 : 120)
    }

    const Icon = volume === 0 ? LuVolumeX : volume < 50 ? LuVolume1 : LuVolume2

    return (
        <div className="space-y-4">
            <Switch
                side="right"
                value={!!autoPlayThemesOnDetails}
                onValueChange={v => setClientSettings(prev => ({ ...prev, autoPlayThemesOnDetails: v }))}
                label="Automatically play openings on anime pages"
                help="Opening an anime page plays every opening and ending of the series in order, from the first. Pause or stop it from the player at the bottom."
            />

            <div className={cn("rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 transition-opacity", !autoPlayThemesOnDetails && "opacity-80")}>
                <div className="mb-2.5 flex items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-medium">Openings volume</p>
                        <p className="text-xs text-[--muted]">For every opening and ending the app plays, here and in the Anime Themes view.</p>
                    </div>
                    <span className="shrink-0 rounded-md bg-white/[0.06] px-2 py-0.5 text-xs font-semibold tabular-nums">{volume}%</span>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => change(volume === 0 ? lastAudible.current : 0, true)}
                        aria-label={volume === 0 ? "Unmute openings" : "Mute openings"}
                        title={volume === 0 ? "Unmute" : "Mute"}
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-[--muted] transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <Icon className="size-4" />
                    </button>
                    <div className="group relative h-6 flex-1">
                        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/10">
                            <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-brand-600 to-brand-400" style={{ width: `${volume}%` }} />
                        </div>
                        <div
                            className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_4px_rgb(var(--color-brand-500)/0.25)] transition-transform group-hover:scale-110 group-active:scale-125"
                            style={{ left: `calc(${volume}% - 8px)` }}
                        />
                        <input
                            type="range"
                            aria-label="Openings volume"
                            min={0}
                            max={100}
                            step={1}
                            value={volume}
                            onChange={e => change(Number(e.target.value))}
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
