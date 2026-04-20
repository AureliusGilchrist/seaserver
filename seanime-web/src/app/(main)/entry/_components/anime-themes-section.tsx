"use client"

import { useGetAnimeThemes, AnimeTheme } from "@/api/hooks/anime_themes.hooks"
import { getServerBaseUrl } from "@/api/client/server-url"
import React, { useState, useRef } from "react"
import { LuMusic, LuPlay, LuPause, LuChevronDown, LuChevronUp } from "react-icons/lu"

type Props = {
    malId: number | null | undefined
}

export function AnimeThemesSection({ malId }: Props) {
    const { data, isLoading } = useGetAnimeThemes(malId)
    const [expanded, setExpanded] = useState(false)

    if (isLoading || !data?.themes?.length) return null

    const openings = data.themes.filter(t => t.type === "OP")
    const endings = data.themes.filter(t => t.type === "ED")

    return (
        <div className="space-y-4">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 text-lg font-semibold hover:text-white transition text-[--muted]"
            >
                <LuMusic className="text-xl" />
                <span>Themes ({data.themes.length})</span>
                {expanded ? <LuChevronUp /> : <LuChevronDown />}
            </button>

            {expanded && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-200">
                    {openings.length > 0 && (
                        <div className="space-y-2">
                            <h3 className="text-sm font-medium text-[--muted] uppercase tracking-wider">Openings</h3>
                            <div className="space-y-1">
                                {openings.map(theme => (
                                    <ThemeRow key={theme.slug} theme={theme} />
                                ))}
                            </div>
                        </div>
                    )}

                    {endings.length > 0 && (
                        <div className="space-y-2">
                            <h3 className="text-sm font-medium text-[--muted] uppercase tracking-wider">Endings</h3>
                            <div className="space-y-1">
                                {endings.map(theme => (
                                    <ThemeRow key={theme.slug} theme={theme} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function ThemeRow({ theme }: { theme: AnimeTheme }) {
    const [playing, setPlaying] = useState(false)
    const [showVideo, setShowVideo] = useState(false)
    const videoRef = useRef<HTMLVideoElement>(null)

    const bestVideo = theme.entries?.[0]?.videos?.[0]
    const songTitle = theme.song?.title ?? "Unknown"
    const artists = theme.song?.artists?.map(a => a.name).join(", ") ?? ""

    const videoUrl = bestVideo?.link
        ? `${getServerBaseUrl()}/api/v1/proxy?url=${encodeURIComponent(bestVideo.link)}`
        : null

    function togglePlay() {
        if (!videoRef.current) {
            if (videoUrl) {
                setShowVideo(true)
                setPlaying(true)
            }
            return
        }
        if (playing) {
            videoRef.current.pause()
            setPlaying(false)
        } else {
            videoRef.current.play()
            setPlaying(true)
        }
    }

    return (
        <div className="rounded-md bg-gray-900/50 border border-[--border] overflow-hidden">
            <div className="flex items-center gap-3 px-3 py-2">
                <button
                    onClick={togglePlay}
                    disabled={!videoUrl}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-brand-500/20 text-brand-300 hover:bg-brand-500/30 transition disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                >
                    {playing ? <LuPause className="text-sm" /> : <LuPlay className="text-sm" />}
                </button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-brand-200 bg-brand-900/40 px-1.5 py-0.5 rounded">
                            {theme.slug}
                        </span>
                        <span className="text-sm font-medium truncate">{songTitle}</span>
                    </div>
                    {artists && (
                        <p className="text-xs text-[--muted] truncate">{artists}</p>
                    )}
                </div>
                {bestVideo && (
                    <span className="text-xs text-[--muted] flex-shrink-0">
                        {bestVideo.resolution}p
                    </span>
                )}
            </div>

            {showVideo && videoUrl && (
                <div className="border-t border-[--border]">
                    <video
                        ref={videoRef}
                        src={videoUrl}
                        autoPlay
                        controls
                        className="w-full max-h-[300px]"
                        onEnded={() => setPlaying(false)}
                        onPause={() => setPlaying(false)}
                        onPlay={() => setPlaying(true)}
                    />
                </div>
            )}
        </div>
    )
}
