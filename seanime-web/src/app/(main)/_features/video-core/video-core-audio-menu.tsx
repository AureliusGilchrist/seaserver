import { MKVParser_TrackInfo } from "@/api/generated/types"
import { nativePlayer_stateAtom } from "@/app/(main)/_features/native-player/native-player.atoms"
import { vc_audioManager } from "@/app/(main)/_features/video-core/video-core"

import { vc_isFullscreen } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_miniPlayer } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_videoElement } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_containerElement } from "@/app/(main)/_features/video-core/video-core-atoms"
import { VideoCoreControlButtonIcon } from "@/app/(main)/_features/video-core/video-core-control-bar"
import { HlsAudioTrack, vc_hlsAudioTracks, vc_hlsCurrentAudioTrack } from "@/app/(main)/_features/video-core/video-core-hls"
import { VideoCoreMenu, VideoCoreMenuBody, VideoCoreMenuTitle, VideoCoreSettingSelect } from "@/app/(main)/_features/video-core/video-core-menu"
import { vc_dispatchAction } from "@/app/(main)/_features/video-core/video-core.utils"
import { useAtomValue } from "jotai"
import { useSetAtom } from "jotai/react"
import React from "react"
import { LuHeadphones } from "react-icons/lu"

export function VideoCoreAudioMenu() {
    const action = useSetAtom(vc_dispatchAction)
    const isMiniPlayer = useAtomValue(vc_miniPlayer)
    const state = useAtomValue(nativePlayer_stateAtom)
    const audioManager = useAtomValue(vc_audioManager)
    const videoElement = useAtomValue(vc_videoElement)
    const isFullscreen = useAtomValue(vc_isFullscreen)
    const containerElement = useAtomValue(vc_containerElement)
    const [selectedTrack, setSelectedTrack] = React.useState<number | null>(null)

    // Get MKV audio tracks
    const mkvAudioTracks = state.playbackInfo?.mkvMetadata?.audioTracks

    // Get HLS audio tracks
    const hlsAudioTracks = useAtomValue(vc_hlsAudioTracks)
    const hlsCurrentAudioTrack = useAtomValue(vc_hlsCurrentAudioTrack)

    // Determine which audio tracks to use
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

    React.useEffect(() => {
        onAudioChange()
    }, [audioManager])

    // Update selected track when HLS audio track changes
    React.useEffect(() => {
        if (isHls && hlsCurrentAudioTrack !== -1) {
            setSelectedTrack(hlsCurrentAudioTrack)
        }
    }, [hlsCurrentAudioTrack, isHls])

    if (isMiniPlayer || !audioTracks?.length) return null

    return (
        <VideoCoreMenu
            name="audio"
            trigger={<VideoCoreControlButtonIcon
                icons={[
                    ["default", LuHeadphones],
                ]}
                state="default"
                className="text-2xl"
                onClick={() => {

                }}
            />}
        >
            <VideoCoreMenuTitle>Audio</VideoCoreMenuTitle>
            <VideoCoreMenuBody>
                <VideoCoreSettingSelect
                    isFullscreen={isFullscreen}
                    containerElement={containerElement}
                    options={audioTracks.map(track => {
                        if (isHls) {
                            const hlsTrack = track as HlsAudioTrack
                            const parts: string[] = []
                            if (hlsTrack.name) parts.push(hlsTrack.name)
                            if (hlsTrack.language) parts.push(`[${hlsTrack.language}]`)
                            return {
                                label: parts.length > 0 ? parts.join(" ") : `Track ${hlsTrack.id + 1}`,
                                value: hlsTrack.id,
                                moreInfo: hlsTrack.language?.toUpperCase(),
                            }
                        } else {
                            const eventTrack = track as MKVParser_TrackInfo
                            const lang = eventTrack.language || eventTrack.languageIETF
                            const parts: string[] = []
                            if (eventTrack.name) parts.push(eventTrack.name)
                            if (lang) parts.push(`[${lang}]`)
                            const codec = eventTrack.codecID?.replace("A_", "")
                            if (codec) parts.push(`(${codec})`)
                            const ch = eventTrack.audio?.Channels
                            if (ch) parts.push(`${ch}ch`)
                            return {
                                label: parts.length > 0 ? parts.join(" ") : `Track ${eventTrack.number}`,
                                value: eventTrack.number,
                                moreInfo: lang?.toUpperCase(),
                            }
                        }
                    })}
                    onValueChange={(value: number) => {
                        audioManager?.selectTrack(value)
                        action({ type: "seek", payload: { time: -1 } })
                    }}
                    value={selectedTrack || 0}
                />
            </VideoCoreMenuBody>
        </VideoCoreMenu>
    )
}
