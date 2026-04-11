import { MKVParser_TrackInfo } from "@/api/generated/types"
import { nativePlayer_stateAtom } from "@/app/(main)/_features/native-player/native-player.atoms"
import { submenuClass, VdsSubmenuButton } from "@/app/(main)/onlinestream/_components/onlinestream-video-addons"
import { vc_audioManager, vc_subtitleManager } from "@/app/(main)/_features/video-core/video-core"
import { vc_videoElement } from "@/app/(main)/_features/video-core/video-core-atoms"
import { HlsAudioTrack, vc_hlsAudioTracks, vc_hlsCurrentAudioTrack } from "@/app/(main)/_features/video-core/video-core-hls"
import { NormalizedTrackInfo } from "@/app/(main)/_features/video-core/video-core-subtitles"
import { vc_dispatchAction } from "@/app/(main)/_features/video-core/video-core.utils"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/components/ui/core/styling"
import { Menu } from "@vidstack/react"
import { useAtom } from "jotai/react"
import { useAtomValue, useSetAtom } from "jotai"
import React from "react"
import { AiFillPlayCircle } from "react-icons/ai"
import { LuCaptions, LuHeadphones } from "react-icons/lu"
import { MdPlaylistPlay } from "react-icons/md"
import { RxSlider } from "react-icons/rx"
import { TbHistory } from "react-icons/tb"
import {
    __seaMediaPlayer_autoNextAtom,
    __seaMediaPlayer_autoPlayAtom,
    __seaMediaPlayer_autoSkipEndingAtom,
    __seaMediaPlayer_autoSkipOpeningAtom,
    __seaMediaPlayer_discreteControlsAtom,
    __seaMediaPlayer_watchContinuityAtom,
} from "./sea-media-player.atoms"

export function SeaMediaPlayerPlaybackSubmenu() {

    const [autoPlay, setAutoPlay] = useAtom(__seaMediaPlayer_autoPlayAtom)
    const [autoNext, setAutoNext] = useAtom(__seaMediaPlayer_autoNextAtom)
    const [autoSkipOpening, setAutoSkipOpening] = useAtom(__seaMediaPlayer_autoSkipOpeningAtom)
    const [autoSkipEnding, setAutoSkipEnding] = useAtom(__seaMediaPlayer_autoSkipEndingAtom)
    const [discreteControls, setDiscreteControls] = useAtom(__seaMediaPlayer_discreteControlsAtom)
    const [watchContinuity, setWatchContinuity] = useAtom(__seaMediaPlayer_watchContinuityAtom)

    return (
        <>
            <Menu.Root>
                <VdsSubmenuButton
                    label={`Auto Play`}
                    hint={autoPlay ? "On" : "Off"}
                    disabled={false}
                    icon={AiFillPlayCircle}
                />
                <Menu.Content className={submenuClass}>
                    <Switch
                        label="Auto play"
                        fieldClass="py-2 px-2"
                        value={autoPlay}
                        onValueChange={setAutoPlay}
                    />
                </Menu.Content>
            </Menu.Root>
            <Menu.Root>
                <VdsSubmenuButton
                    label={`Auto Play Next Episode`}
                    hint={autoNext ? "On" : "Off"}
                    disabled={false}
                    icon={MdPlaylistPlay}
                />
                <Menu.Content className={submenuClass}>
                    <Switch
                        label="Auto play next episode"
                        fieldClass="py-2 px-2"
                        value={autoNext}
                        onValueChange={setAutoNext}
                    />
                </Menu.Content>
            </Menu.Root>
            <Menu.Root>
                <VdsSubmenuButton
                    label={`Skip Opening`}
                    hint={autoSkipOpening ? "On" : "Off"}
                    disabled={false}
                    icon={MdPlaylistPlay}
                />
                <Menu.Content className={submenuClass}>
                    <Switch
                        label="Skip opening"
                        fieldClass="py-2 px-2"
                        value={autoSkipOpening}
                        onValueChange={setAutoSkipOpening}
                    />
                </Menu.Content>
            </Menu.Root>
            <Menu.Root>
                <VdsSubmenuButton
                    label={`Skip Ending`}
                    hint={autoSkipEnding ? "On" : "Off"}
                    disabled={false}
                    icon={MdPlaylistPlay}
                />
                <Menu.Content className={submenuClass}>
                    <Switch
                        label="Skip ending"
                        fieldClass="py-2 px-2"
                        value={autoSkipEnding}
                        onValueChange={setAutoSkipEnding}
                    />
                </Menu.Content>
            </Menu.Root>
            <Menu.Root>
                <VdsSubmenuButton
                    label={`Discrete Controls`}
                    hint={discreteControls ? "On" : "Off"}
                    disabled={false}
                    icon={RxSlider}
                />
                <Menu.Content className={submenuClass}>
                    <Switch
                        label="Discrete controls"
                        help="Only show the controls when the mouse is over the bottom part. (Large screens only)"
                        fieldClass="py-2 px-2"
                        value={discreteControls}
                        onValueChange={setDiscreteControls}
                        fieldHelpTextClass="max-w-xs"
                    />
                </Menu.Content>
            </Menu.Root>
            <Menu.Root>
                <VdsSubmenuButton
                    label={`Watch Continuity`}
                    hint={watchContinuity === "inherit" ? "Global" : watchContinuity === "on" ? "On" : "Off"}
                    disabled={false}
                    icon={TbHistory}
                />
                <Menu.Content className={submenuClass}>
                    <div className="space-y-2 p-2">
                        {(["inherit", "on", "off"] as const).map((val) => (
                            <label key={val} className="flex items-center gap-2 cursor-pointer text-sm">
                                <input
                                    type="radio"
                                    name="smp-watch-continuity"
                                    checked={watchContinuity === val}
                                    onChange={() => setWatchContinuity(val)}
                                    className="accent-brand-300"
                                />
                                {val === "inherit" ? "Use global setting" : val === "on" ? "Always on" : "Always off"}
                            </label>
                        ))}
                    </div>
                </Menu.Content>
            </Menu.Root>
            <SeaMediaPlayerAudioTrackSubmenu />
            <SeaMediaPlayerSubtitleTrackSubmenu />
        </>
    )
}

// ── Audio Track Selector (replaces Language Preferences text input) ──

function SeaMediaPlayerAudioTrackSubmenu() {
    const state = useAtomValue(nativePlayer_stateAtom)
    const audioManager = useAtomValue(vc_audioManager)
    const videoElement = useAtomValue(vc_videoElement)
    const action = useSetAtom(vc_dispatchAction)
    const hlsAudioTracks = useAtomValue(vc_hlsAudioTracks)
    const hlsCurrentAudioTrack = useAtomValue(vc_hlsCurrentAudioTrack)

    const [selectedTrack, setSelectedTrack] = React.useState<number | null>(null)

    const mkvAudioTracks = state.playbackInfo?.mkvMetadata?.audioTracks
    const audioTracks = mkvAudioTracks || (hlsAudioTracks.length > 0 ? hlsAudioTracks : null)
    const isHls = !mkvAudioTracks && hlsAudioTracks.length > 0

    function onAudioChange() {
        setSelectedTrack(audioManager?.getSelectedTrackNumberOrNull?.() ?? null)
    }

    React.useEffect(() => {
        if (!videoElement || !audioManager) return
        videoElement?.audioTracks?.addEventListener?.("change", onAudioChange)
        return () => {
            videoElement?.audioTracks?.removeEventListener?.("change", onAudioChange)
        }
    }, [videoElement, audioManager])

    React.useEffect(() => { onAudioChange() }, [audioManager])

    React.useEffect(() => {
        if (isHls && hlsCurrentAudioTrack !== -1) setSelectedTrack(hlsCurrentAudioTrack)
    }, [hlsCurrentAudioTrack, isHls])

    const currentLabel = React.useMemo(() => {
        if (!audioTracks?.length) return "No file"
        const track = audioTracks.find((t: any) => {
            if (isHls) return (t as HlsAudioTrack).id === selectedTrack
            return (t as MKVParser_TrackInfo).number === selectedTrack
        })
        if (!track) return "Auto"
        if (isHls) return (track as HlsAudioTrack).name || (track as HlsAudioTrack).language || "Auto"
        const mkv = track as MKVParser_TrackInfo
        return mkv.name || mkv.language || mkv.languageIETF || "Auto"
    }, [audioTracks, selectedTrack, isHls])

    return (
        <Menu.Root>
            <VdsSubmenuButton
                label="Audio Track"
                hint={currentLabel}
                disabled={false}
                icon={LuHeadphones}
            />
            <Menu.Content className={submenuClass}>
                <div className="max-h-[250px] overflow-y-auto py-1">
                    {!audioTracks?.length ? (
                        <p className="text-xs text-[--muted] px-2 py-2">No audio tracks available</p>
                    ) : (
                        audioTracks.map((track: any) => {
                            const { label, value, info } = formatAudioTrack(track, isHls)
                            const isSelected = value === selectedTrack
                            return (
                                <button
                                    key={value}
                                    onClick={() => {
                                        audioManager?.selectTrack(value)
                                        action({ type: "seek", payload: { time: -1 } })
                                    }}
                                    className={cn(
                                        "w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm rounded-md transition-colors",
                                        isSelected ? "bg-brand-500/20 text-brand-300" : "hover:bg-white/10 text-gray-300",
                                    )}
                                >
                                    <span className={cn(
                                        "size-2 rounded-full shrink-0",
                                        isSelected ? "bg-brand-400" : "bg-transparent",
                                    )} />
                                    <span className="truncate flex-1">{label}</span>
                                    {info && <span className="text-xs text-[--muted] shrink-0">{info}</span>}
                                </button>
                            )
                        })
                    )}
                </div>
            </Menu.Content>
        </Menu.Root>
    )
}

function formatAudioTrack(track: any, isHls: boolean): { label: string; value: number; info?: string } {
    if (isHls) {
        const t = track as HlsAudioTrack
        const parts: string[] = []
        if (t.name) parts.push(t.name)
        if (t.language) parts.push(`[${t.language}]`)
        return { label: parts.length > 0 ? parts.join(" ") : `Track ${t.id + 1}`, value: t.id, info: t.language?.toUpperCase() }
    }
    const t = track as MKVParser_TrackInfo
    const lang = t.language || t.languageIETF
    const parts: string[] = []
    if (t.name) parts.push(t.name)
    if (lang) parts.push(`[${lang}]`)
    const codec = t.codecID?.replace("A_", "")
    if (codec) parts.push(`(${codec})`)
    const ch = t.audio?.Channels
    if (ch) parts.push(`${ch}ch`)
    return { label: parts.length > 0 ? parts.join(" ") : `Track ${t.number}`, value: t.number, info: lang?.toUpperCase() }
}

// ── Subtitle Track Selector ──

function SeaMediaPlayerSubtitleTrackSubmenu() {
    const subtitleManager = useAtomValue(vc_subtitleManager)
    const videoElement = useAtomValue(vc_videoElement)
    const action = useSetAtom(vc_dispatchAction)

    const [selectedTrack, setSelectedTrack] = React.useState<number | null>(null)
    const [subtitleTracks, setSubtitleTracks] = React.useState<NormalizedTrackInfo[]>([])

    React.useEffect(() => {
        if (!videoElement || !subtitleManager) return

        setSelectedTrack(subtitleManager.getSelectedTrackNumberOrNull?.() ?? null)

        subtitleManager.setTrackChangedEventListener((trackNumber) => {
            setSelectedTrack(trackNumber)
        })

        subtitleManager.setTracksLoadedEventListener((tracks) => {
            setSubtitleTracks(tracks)
        })

        // Load current tracks
        const current = subtitleManager.getTracks?.()
        if (current?.length) setSubtitleTracks(current)
    }, [videoElement, subtitleManager])

    const currentLabel = React.useMemo(() => {
        if (!subtitleTracks.length) return "No file"
        if (selectedTrack === null || selectedTrack === -1) return "Off"
        const track = subtitleTracks.find(t => t.number === selectedTrack)
        if (!track) return "Off"
        return track.label || track.language?.toUpperCase() || track.languageIETF?.toUpperCase() || `Track ${track.number}`
    }, [subtitleTracks, selectedTrack])

    return (
        <Menu.Root>
            <VdsSubmenuButton
                label="Subtitle Track"
                hint={currentLabel}
                disabled={false}
                icon={LuCaptions}
            />
            <Menu.Content className={submenuClass}>
                <div className="max-h-[250px] overflow-y-auto py-1">
                    {!subtitleTracks.length ? (
                        <p className="text-xs text-[--muted] px-2 py-2">No subtitle tracks available</p>
                    ) : (
                        <>
                            <button
                                onClick={() => { subtitleManager?.setNoTrack() }}
                                className={cn(
                                    "w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm rounded-md transition-colors",
                                    (selectedTrack === null || selectedTrack === -1)
                                        ? "bg-brand-500/20 text-brand-300"
                                        : "hover:bg-white/10 text-gray-300",
                                )}
                            >
                                <span className={cn(
                                    "size-2 rounded-full shrink-0",
                                    (selectedTrack === null || selectedTrack === -1) ? "bg-brand-400" : "bg-transparent",
                                )} />
                                <span>Off</span>
                            </button>
                            {subtitleTracks.map(track => {
                                const isSelected = track.number === selectedTrack
                                const label = track.label || track.language?.toUpperCase() || track.languageIETF?.toUpperCase() || `Track ${track.number}`
                                const codecShort = track.codecID?.replace("S_TEXT/", "").replace("S_HDMV/", "")
                                const langInfo = track.language && track.language !== track.label
                                    ? `${track.language.toUpperCase()}${codecShort ? "/" + codecShort : ""}`
                                    : codecShort
                                return (
                                    <button
                                        key={track.number}
                                        onClick={() => { subtitleManager?.selectTrack(track.number) }}
                                        className={cn(
                                            "w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm rounded-md transition-colors",
                                            isSelected ? "bg-brand-500/20 text-brand-300" : "hover:bg-white/10 text-gray-300",
                                        )}
                                    >
                                        <span className={cn(
                                            "size-2 rounded-full shrink-0",
                                            isSelected ? "bg-brand-400" : "bg-transparent",
                                        )} />
                                        <span className="truncate flex-1">{label}</span>
                                        {track.forced && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1 rounded">F</span>}
                                        {langInfo && <span className="text-xs text-[--muted] shrink-0">{langInfo}</span>}
                                    </button>
                                )
                            })}
                        </>
                    )}
                </div>
            </Menu.Content>
        </Menu.Root>
    )
}
