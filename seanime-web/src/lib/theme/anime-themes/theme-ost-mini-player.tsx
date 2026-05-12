"use client"

import React from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
    equippedThemeOstIdAtom,
    themeOstCurrentTrackIndexAtom,
    themeOstLoopModeAtom,
    themeOstPlayingAtom,
    themeOstPositionAtom,
    themeOstSeekRequestAtom,
    themeOstSkipDirectionAtom,
    type ThemeOstLoopMode,
} from "./theme-ost-atoms"
import {
    useListAllThemeMusic,
    useListThemeMusicMetadata,
    useIsThemeMusicDownloading,
    type ThemeMusicMetadataTrack,
} from "@/api/hooks/theme-music.hooks"
import { useAnimeTheme } from "./anime-theme-provider"
import { ANIME_THEMES } from "./index"
import {
    LuPlay,
    LuPause,
    LuSkipBack,
    LuSkipForward,
    LuRepeat,
    LuRepeat1,
    LuRepeat2,
    LuMusic,
    LuPin,
    LuPinOff,
} from "react-icons/lu"
import { cn } from "@/components/ui/core/styling"

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, "0")}`
}

function trackLabel(t: ThemeMusicMetadataTrack | undefined): { title: string; artist?: string } {
    if (!t) return { title: "—" }
    const title = (t.title && t.title.trim()) || t.name || t.filename || "Unknown"
    const artist = t.artist?.trim() || t.albumArtist?.trim() || undefined
    return { title, artist }
}

function loopModeLabel(m: ThemeOstLoopMode): string {
    switch (m) {
        case "off": return "Loop off"
        case "one": return "Loop one"
        case "all": return "Loop all"
    }
}

function nextLoopMode(m: ThemeOstLoopMode): ThemeOstLoopMode {
    return m === "off" ? "all" : m === "all" ? "one" : "off"
}

export function ThemeOstMiniPlayer() {
    const { config } = useAnimeTheme()
    const [equippedId, setEquippedId] = useAtom(equippedThemeOstIdAtom)
    const [playing, setPlaying] = useAtom(themeOstPlayingAtom)
    const [trackIndex, setTrackIndex] = useAtom(themeOstCurrentTrackIndexAtom)
    const [loopMode, setLoopMode] = useAtom(themeOstLoopModeAtom)
    const setSkipDir = useSetAtom(themeOstSkipDirectionAtom)
    const setSeekReq = useSetAtom(themeOstSeekRequestAtom)
    const position = useAtomValue(themeOstPositionAtom)

    const activeId = (equippedId && equippedId.length > 0) ? equippedId : config.id
    const all = useListAllThemeMusic()
    const tracks = useListThemeMusicMetadata(activeId, !!activeId && activeId !== "seanime")

    // Map id → display name from registered themes (fallback to id).
    const themeName = React.useCallback((id: string): string => {
        const t = (ANIME_THEMES as any)[id]
        return t?.displayName ?? id
    }, [])

    // Themes with tracks available, sorted by display name.
    const themesWithTracks = React.useMemo(() => {
        const list = (all.data ?? []).filter(s => s.trackCount > 0)
        return list
            .map(s => ({ id: s.themeId, name: themeName(s.themeId), count: s.trackCount }))
            .sort((a, b) => a.name.localeCompare(b.name))
    }, [all.data, themeName])

    const trackList = tracks.data ?? []
    const current = trackList[Math.min(trackIndex, Math.max(0, trackList.length - 1))]
    const label = trackLabel(current)
    const isDownloading = useIsThemeMusicDownloading(activeId)

    const duration = position.duration || 0
    const progress = duration > 0 ? Math.min(position.current / duration, 1) : 0

    function onSeekChange(e: React.ChangeEvent<HTMLInputElement>) {
        const pct = Number(e.target.value) / 1000
        if (duration > 0) setSeekReq(pct * duration)
    }

    function onEquipChange(value: string) {
        setEquippedId(value === "__follow__" ? null : value)
    }

    const isEquipped = !!equippedId && equippedId.length > 0
    const hasTracks = trackList.length > 0

    return (
        <div className="space-y-4 rounded-xl border border-[--border] bg-[--paper] p-4">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <LuMusic className="size-4 text-[--color-brand-300] shrink-0" />
                    <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">Theme OST Player</p>
                        <p className="text-[11px] text-[--muted] truncate">
                            {isEquipped
                                ? `Equipped: ${themeName(activeId)}`
                                : `Following active theme: ${themeName(activeId)}`}
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setEquippedId(isEquipped ? null : config.id)}
                    title={isEquipped ? "Unequip — follow active theme" : "Equip current theme"}
                    className={cn(
                        "shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] border transition-colors",
                        isEquipped
                            ? "border-[--color-brand-600] bg-[--color-brand-900]/30 text-[--color-brand-200]"
                            : "border-[--border] text-[--muted] hover:text-[--foreground] hover:bg-white/5",
                    )}
                >
                    {isEquipped ? <LuPin className="size-3" /> : <LuPinOff className="size-3" />}
                    {isEquipped ? "Equipped" : "Equip current"}
                </button>
            </div>

            {/* Equipped-theme selector */}
            <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[--muted]">Source</span>
                <select
                    className="mt-1 w-full bg-[--background] border border-[--border] rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-[--color-brand-500]"
                    value={equippedId ?? "__follow__"}
                    onChange={(e) => onEquipChange(e.target.value)}
                >
                    <option value="__follow__">Follow active theme</option>
                    {themesWithTracks.length === 0 && (
                        <option disabled value="">No themes have downloaded OSTs yet</option>
                    )}
                    {themesWithTracks.map(t => (
                        <option key={t.id} value={t.id}>{t.name} ({t.count})</option>
                    ))}
                </select>
            </label>

            {/* Now-playing line */}
            <div className="min-w-0">
                <p className="text-sm font-medium truncate" title={label.title}>{label.title}</p>
                <p className="text-xs text-[--muted] truncate">
                    {label.artist ?? (hasTracks ? "Unknown artist" : (isDownloading ? "Downloading… tracks will appear automatically" : "No tracks downloaded for this theme"))}
                </p>
            </div>

            {/* Seek bar */}
            <div className="space-y-1">
                <input
                    type="range"
                    min={0}
                    max={1000}
                    value={Math.round(progress * 1000)}
                    onChange={onSeekChange}
                    disabled={!hasTracks || duration <= 0}
                    className="w-full accent-[--color-brand-500] disabled:opacity-40"
                />
                <div className="flex justify-between text-[10px] text-[--muted] tabular-nums">
                    <span>{formatTime(position.current)}</span>
                    <span>{formatTime(duration)}</span>
                </div>
            </div>

            {/* Transport */}
            <div className="flex items-center justify-center gap-2">
                <button
                    type="button"
                    onClick={() => setSkipDir("prev")}
                    disabled={!hasTracks}
                    title="Previous"
                    className="sea-hoverable rounded-full p-2 border border-[--border] bg-[--background] hover:bg-white/5 disabled:opacity-40"
                >
                    <LuSkipBack className="size-4" />
                </button>
                <button
                    type="button"
                    onClick={() => setPlaying(p => !p)}
                    disabled={!hasTracks}
                    title={playing ? "Pause" : "Play"}
                    className="sea-hoverable rounded-full p-3 border border-[--color-brand-700] bg-[--color-brand-900]/40 hover:bg-[--color-brand-900]/60 disabled:opacity-40"
                >
                    {playing ? <LuPause className="size-5" /> : <LuPlay className="size-5" />}
                </button>
                <button
                    type="button"
                    onClick={() => setSkipDir("next")}
                    disabled={!hasTracks}
                    title="Next"
                    className="sea-hoverable rounded-full p-2 border border-[--border] bg-[--background] hover:bg-white/5 disabled:opacity-40"
                >
                    <LuSkipForward className="size-4" />
                </button>
                <button
                    type="button"
                    onClick={() => setLoopMode(nextLoopMode(loopMode))}
                    title={loopModeLabel(loopMode)}
                    className={cn(
                        "sea-hoverable rounded-full p-2 border ml-2 transition-colors",
                        loopMode === "off"
                            ? "border-[--border] bg-[--background] text-[--muted] hover:text-[--foreground]"
                            : "border-[--color-brand-600] bg-[--color-brand-900]/30 text-[--color-brand-200]",
                    )}
                >
                    {loopMode === "one" ? <LuRepeat1 className="size-4" /> : loopMode === "all" ? <LuRepeat className="size-4" /> : <LuRepeat2 className="size-4" />}
                </button>
            </div>

            {/* Playlist (compact) */}
            {hasTracks && (
                <div className="max-h-48 overflow-y-auto rounded-md border border-[--border] bg-[--background]">
                    <ul className="text-xs">
                        {trackList.map((t, i) => {
                            const isCurrent = i === trackIndex
                            const lbl = trackLabel(t)
                            return (
                                <li key={t.filename + ":" + i}>
                                    <button
                                        type="button"
                                        onClick={() => { setTrackIndex(i); setPlaying(true) }}
                                        className={cn(
                                            "w-full text-left px-2 py-1.5 flex items-center gap-2 border-b border-[--border] last:border-b-0 transition-colors",
                                            isCurrent
                                                ? "bg-[--color-brand-900]/30 text-[--color-brand-100]"
                                                : "hover:bg-white/[0.03]",
                                        )}
                                    >
                                        <span className={cn("tabular-nums shrink-0", isCurrent ? "text-[--color-brand-300]" : "text-[--muted]")}>{(i + 1).toString().padStart(2, "0")}</span>
                                        <span className="min-w-0 truncate flex-1" title={lbl.title}>{lbl.title}</span>
                                        {lbl.artist && (
                                            <span className="text-[--muted] truncate max-w-[40%] shrink" title={lbl.artist}>{lbl.artist}</span>
                                        )}
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            )}
        </div>
    )
}
