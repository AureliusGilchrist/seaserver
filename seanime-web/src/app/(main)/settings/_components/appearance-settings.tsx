"use client"
import { getServerBaseUrl } from "@/api/client/server-url"
import { useListThemeBackgrounds } from "@/api/hooks/theme_backgrounds.hooks"
import { useIsLightMode } from "@/app/(main)/_features/glass/glass-variables"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/components/ui/core/styling"
import { type ClientSettings, setClientSettings, useClientSettings } from "@/lib/client-settings"
import { useAnimeThemeOrNull } from "@/lib/theme/anime-themes/anime-theme-provider"
import {
    DEFAULT_DARK_START_HOUR,
    DEFAULT_LIGHT_START_HOUR,
    formatHour,
    pickScheduledWallpaper,
    useLocalHour,
    type WallpaperScheduleEntry,
} from "@/lib/theme/time-schedule"
import React from "react"
import { LuClock, LuMoon, LuPlus, LuSun, LuSunMoon, LuTrash2 } from "react-icons/lu"

function set<K extends keyof ClientSettings>(key: K, value: ClientSettings[K]) {
    setClientSettings(prev => ({ ...prev, [key]: value }))
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)

function HourSelect({ value, onChange, disabled }: { value: number, onChange: (h: number) => void, disabled?: boolean }) {
    return (
        <select
            className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm text-white outline-none focus:border-brand-300/50 disabled:opacity-50"
            value={value}
            disabled={disabled}
            onChange={e => onChange(Number(e.target.value))}
        >
            {HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
        </select>
    )
}

/** Personal -> Display -> Appearance: dark, light, or light by day and dark by night. */
export function AppearanceSettings() {
    const { appearanceMode = "dark", lightModeStartHour, darkModeStartHour } = useClientSettings()
    const light = useIsLightMode()
    const lightStart = lightModeStartHour ?? DEFAULT_LIGHT_START_HOUR
    const darkStart = darkModeStartHour ?? DEFAULT_DARK_START_HOUR

    const options = [
        { value: "dark" as const, label: "Dark", icon: LuMoon },
        { value: "light" as const, label: "Light", icon: LuSun },
        { value: "schedule" as const, label: "By time of day", icon: LuSunMoon },
    ]

    return (
        <div className="space-y-3" data-appearance-settings>
            <div>
                <p className="text-sm font-medium">Appearance</p>
                <p className="text-xs text-[--muted]">
                    Dark, light, or switching between them by the clock. Glass, tint and wallpapers work in both.
                    The players stay dark.
                </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
                {options.map(o => (
                    <button
                        key={o.value}
                        type="button"
                        onClick={() => set("appearanceMode", o.value === "dark" ? undefined : o.value)}
                        className={cn(
                            "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition",
                            appearanceMode === o.value
                                ? "border-brand-300/50 bg-brand-500/15 text-white"
                                : "border-white/10 text-[--muted] hover:text-white",
                        )}
                    >
                        <o.icon className="size-4" /> {o.label}
                    </button>
                ))}
            </div>
            {appearanceMode === "schedule" && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm">
                    <span className="inline-flex items-center gap-2"><LuSun className="size-4 text-amber-300" /> Light from
                        <HourSelect value={lightStart} onChange={h => set("lightModeStartHour", h)} />
                    </span>
                    <span className="inline-flex items-center gap-2"><LuMoon className="size-4 text-indigo-300" /> Dark from
                        <HourSelect value={darkStart} onChange={h => set("darkModeStartHour", h)} />
                    </span>
                    <span className="text-xs text-[--muted]">Now: {light ? "light" : "dark"}</span>
                </div>
            )}
        </div>
    )
}

function resolveUrl(url: string) {
    return url.startsWith("/") ? `${getServerBaseUrl()}${url}` : url
}

/** Personal -> Display -> Wallpaper by time of day. */
export function WallpaperScheduleSettings() {
    const { wallpaperScheduleEnabled, wallpaperSchedule } = useClientSettings()
    const { data: saved } = useListThemeBackgrounds()
    const theme = useAnimeThemeOrNull()
    const hour = useLocalHour()
    const entries: WallpaperScheduleEntry[] = wallpaperSchedule ?? []
    const now = wallpaperScheduleEnabled ? pickScheduledWallpaper(entries, hour) : null

    const choices = React.useMemo(() => {
        const list: { url: string, label: string }[] = []
        const current = theme?.activeBackgroundUrl
        if (current && !now) list.push({ url: current.replace(getServerBaseUrl(), ""), label: "Current wallpaper" })
        if (theme?.config?.backgroundImageUrl) list.push({ url: theme.config.backgroundImageUrl, label: `${theme.config.displayName} default` })
        for (const f of saved ?? []) list.push({ url: f.url, label: f.filename })
        return list.filter((c, i, a) => a.findIndex(x => x.url === c.url) === i)
    }, [saved, theme?.activeBackgroundUrl, theme?.config, now])

    const write = (next: WallpaperScheduleEntry[]) => set("wallpaperSchedule", next.slice().sort((a, b) => a.fromHour - b.fromHour))
    const update = (i: number, patch: Partial<WallpaperScheduleEntry>) => write(entries.map((e, j) => j === i ? { ...e, ...patch } : e))

    const addEntry = () => {
        const used = new Set(entries.map(e => e.fromHour))
        const fromHour = [DEFAULT_LIGHT_START_HOUR, DEFAULT_DARK_START_HOUR, 12, 0, 16, 22].find(h => !used.has(h)) ?? 0
        write([...entries, { fromHour, url: choices[0]?.url ?? "", label: choices[0]?.label }])
    }

    return (
        <div className="space-y-3" data-wallpaper-schedule-settings>
            <Switch
                side="right"
                value={!!wallpaperScheduleEnabled}
                onValueChange={v => set("wallpaperScheduleEnabled", v || undefined)}
                label="Wallpaper by time of day"
                help="Each wallpaper is shown from its hour until the next one's. Works with light and dark mode alike; turning it off brings back the wallpaper you picked."
            />
            {wallpaperScheduleEnabled && (
                <div className="space-y-2">
                    {entries.map((e, i) => (
                        <div
                            key={i}
                            className={cn(
                                "flex flex-wrap items-center gap-2 rounded-xl border px-2.5 py-2",
                                now === e ? "border-brand-300/40 bg-brand-500/10" : "border-white/10",
                            )}
                        >
                            <div className="h-10 w-16 shrink-0 overflow-hidden rounded-md bg-black/40">
                                {e.url && <img src={resolveUrl(e.url)} alt="" className="size-full object-cover" loading="lazy" />}
                            </div>
                            <span className="inline-flex items-center gap-1.5 text-sm"><LuClock className="size-3.5 text-[--muted]" /> From</span>
                            <HourSelect value={e.fromHour} onChange={h => update(i, { fromHour: h })} />
                            <select
                                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm text-white outline-none focus:border-brand-300/50"
                                value={choices.some(c => c.url === e.url) ? e.url : "__custom"}
                                onChange={ev => {
                                    if (ev.target.value === "__custom") return
                                    const c = choices.find(c => c.url === ev.target.value)
                                    update(i, { url: ev.target.value, label: c?.label })
                                }}
                            >
                                {!choices.some(c => c.url === e.url) && <option value="__custom">{e.label || e.url || "Choose a wallpaper"}</option>}
                                {choices.map(c => <option key={c.url} value={c.url}>{c.label}</option>)}
                            </select>
                            {now === e && <span className="text-[10px] font-bold uppercase tracking-wider text-brand-200">Now</span>}
                            <button
                                type="button"
                                aria-label="Remove"
                                onClick={() => write(entries.filter((_, j) => j !== i))}
                                className="rounded-md p-1.5 text-[--muted] hover:bg-white/10 hover:text-white"
                            >
                                <LuTrash2 className="size-4" />
                            </button>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={addEntry}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-1.5 text-xs text-[--muted] hover:text-white"
                    >
                        <LuPlus className="size-3.5" /> Add a time
                    </button>
                    <p className="text-xs text-[--muted]">
                        Saved wallpapers come from the Theme manager (Wallhaven and Alpha Coders). Paste any image link instead:
                    </p>
                    <PasteWallpaperLink onAdd={(url) => write([...entries, { fromHour: 0, url, label: url.split("/").pop() }])} />
                </div>
            )}
        </div>
    )
}

function PasteWallpaperLink({ onAdd }: { onAdd: (url: string) => void }) {
    const [value, setValue] = React.useState("")
    const valid = /^https?:\/\/\S+$/.test(value.trim())
    return (
        <div className="flex gap-2">
            <input
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-brand-300/50"
                placeholder="https://…/wallpaper.jpg"
                value={value}
                onChange={e => setValue(e.target.value)}
            />
            <button
                type="button"
                disabled={!valid}
                onClick={() => {
                    onAdd(value.trim())
                    setValue("")
                }}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white disabled:opacity-40"
            >
                Add
            </button>
        </div>
    )
}

/** Personal -> Playback -> HDR, for the local and the online player. */
export function HdrSettings() {
    const { hdrMode = "auto" } = useClientSettings()
    const options = [
        { value: "auto" as const, label: "Auto", help: "The display decides." },
        { value: "hdr" as const, label: "HDR", help: "HDR video uses the display's full brightness." },
        { value: "sdr" as const, label: "SDR", help: "HDR video is tone-mapped to SDR (for washed-out HDR)." },
        { value: "boost" as const, label: "HDR boost", help: "SDR video gets deeper blacks, brighter highlights and richer colour." },
    ]
    const current = options.find(o => o.value === hdrMode) ?? options[0]
    return (
        <div className="space-y-2" data-hdr-settings>
            <div>
                <p className="text-sm font-medium">HDR</p>
                <p className="text-xs text-[--muted]">For the local player and the online player. {current.help}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {options.map(o => (
                    <button
                        key={o.value}
                        type="button"
                        onClick={() => set("hdrMode", o.value === "auto" ? undefined : o.value)}
                        className={cn(
                            "rounded-xl border px-3 py-2 text-sm transition",
                            hdrMode === o.value ? "border-brand-300/50 bg-brand-500/15 text-white" : "border-white/10 text-[--muted] hover:text-white",
                        )}
                    >
                        {o.label}
                    </button>
                ))}
            </div>
        </div>
    )
}
