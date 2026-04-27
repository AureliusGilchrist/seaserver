"use client"
import React from "react"
import { useAnimeThemeOrNull } from "@/lib/theme/anime-themes/anime-theme-provider"
import { cn } from "@/components/ui/core/styling"
import { LuMusic, LuPause, LuPlay, LuVolumeX, LuVolume2 } from "react-icons/lu"

/**
 * Floating mini-player for the active anime theme's background OST.
 * Only renders when a non-seanime theme with music is selected.
 */
export function OSTPlayer() {
    const theme = useAnimeThemeOrNull()
    const [minimized, setMinimized] = React.useState(true)

    if (!theme || theme.config.id === "seanime" || !theme.config.musicUrl) return null

    const { musicEnabled, setMusicEnabled, musicVolume, setMusicVolume, config } = theme

    if (minimized) {
        return (
            <button
                onClick={() => setMinimized(false)}
                title={`${config.displayName} OST`}
                className={cn(
                    "fixed bottom-5 right-5 z-50 flex items-center gap-2 px-3 py-2 rounded-2xl",
                    "bg-[--paper] border border-[--border] shadow-xl",
                    "hover:border-[--color-brand-500] transition-all duration-200 text-sm",
                    musicEnabled && "border-[--color-brand-500]/50",
                )}
            >
                <LuMusic className="w-3.5 h-3.5 text-[--color-brand-400]" />
                {musicEnabled && (
                    <span className="flex gap-px items-end h-3">
                        {[0, 1, 2].map(i => (
                            <span
                                key={i}
                                className="w-0.5 bg-[--color-brand-400] rounded-full animate-pulse"
                                style={{ height: `${6 + i * 3}px`, animationDelay: `${i * 0.15}s` }}
                            />
                        ))}
                    </span>
                )}
            </button>
        )
    }

    return (
        <div className="fixed bottom-5 right-5 z-50 w-56 rounded-2xl bg-[--paper] border border-[--border] shadow-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                    <LuMusic className="w-3.5 h-3.5 text-[--color-brand-400] shrink-0" />
                    <span className="text-xs font-semibold truncate">{config.displayName} OST</span>
                </div>
                <button
                    onClick={() => setMinimized(true)}
                    className="text-[--muted] hover:text-[--foreground] text-xs px-1"
                >
                    ✕
                </button>
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={() => setMusicEnabled(!musicEnabled)}
                    className="w-7 h-7 rounded-full bg-[--color-brand-500]/20 hover:bg-[--color-brand-500]/40 flex items-center justify-center transition-colors shrink-0"
                >
                    {musicEnabled
                        ? <LuPause className="w-3 h-3 text-[--color-brand-400]" />
                        : <LuPlay className="w-3 h-3 text-[--color-brand-400]" />
                    }
                </button>

                <div className="flex-1 flex items-center gap-1.5">
                    {musicVolume === 0
                        ? <LuVolumeX className="w-3 h-3 text-[--muted] shrink-0" />
                        : <LuVolume2 className="w-3 h-3 text-[--muted] shrink-0" />
                    }
                    <div className="flex-1 relative h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="absolute inset-y-0 left-0 bg-[--color-brand-500] rounded-full" style={{ width: `${musicVolume * 100}%` }} />
                        <input
                            type="range" min={0} max={1} step={0.01} value={musicVolume}
                            onChange={e => setMusicVolume(Number(e.target.value))}
                            className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
