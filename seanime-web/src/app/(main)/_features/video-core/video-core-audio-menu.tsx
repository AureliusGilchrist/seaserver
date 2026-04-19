import { MKVParser_TrackInfo } from "@/api/generated/types"
import { vc_audioManager } from "@/app/(main)/_features/video-core/video-core"
import { vc_perMediaTrackOverrides } from "@/app/(main)/_features/video-core/video-core.atoms"

import { vc_isFullscreen } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_miniPlayer } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_videoElement } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_containerElement } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_playbackInfo } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_requestTranscodeForAudio } from "@/app/(main)/_features/video-core/video-core-atoms"
import { VideoCoreControlButtonIcon } from "@/app/(main)/_features/video-core/video-core-control-bar"
import { HlsAudioTrack, vc_hlsAudioTracks, vc_hlsCurrentAudioTrack, vc_hlsSetAudioTrack } from "@/app/(main)/_features/video-core/video-core-hls"
import { VideoCoreMenu, VideoCoreMenuBody, VideoCoreMenuTitle, VideoCoreSettingSelect } from "@/app/(main)/_features/video-core/video-core-menu"
import { vc_dispatchAction } from "@/app/(main)/_features/video-core/video-core.utils"
import { useAtomValue } from "jotai"
import { useSetAtom } from "jotai/react"
import React from "react"
import { LuHeadphones } from "react-icons/lu"

export function VideoCoreAudioMenu() {
    const action = useSetAtom(vc_dispatchAction)
    const isMiniPlayer = useAtomValue(vc_miniPlayer)
    const playbackInfo = useAtomValue(vc_playbackInfo)
    const audioManager = useAtomValue(vc_audioManager)
    const videoElement = useAtomValue(vc_videoElement)
    const isFullscreen = useAtomValue(vc_isFullscreen)
    const containerElement = useAtomValue(vc_containerElement)
    const [selectedTrack, setSelectedTrack] = React.useState<number | null>(null)
    const setPerMediaOverrides = useSetAtom(vc_perMediaTrackOverrides)
    const requestTranscodeForAudio = useAtomValue(vc_requestTranscodeForAudio)

    // Get MKV audio tracks
    const mkvAudioTracks = playbackInfo?.mkvMetadata?.audioTracks

    // Get HLS audio tracks
    const hlsAudioTracks = useAtomValue(vc_hlsAudioTracks)
    const hlsCurrentAudioTrack = useAtomValue(vc_hlsCurrentAudioTrack)
    const hlsSetAudioTrack = useAtomValue(vc_hlsSetAudioTrack)

    // Determine which audio tracks to use
    // HLS tracks take priority — in transcode mode both mkvAudioTracks (synthesized)
    // and hlsAudioTracks exist, but only the HLS setter can actually switch audio
    const isHls = hlsAudioTracks.length > 0
    const audioTracks = isHls ? hlsAudioTracks : (mkvAudioTracks || null)

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
                        // Save per-media audio language + codec override FIRST so it persists across the stream switch
                        const mediaId = playbackInfo?.media?.id
                        if (mediaId) {
                            let lang: string | undefined
                            let codecID: string | undefined
                            if (isHls) {
                                lang = (audioTracks as HlsAudioTrack[])?.find(t => t.id === value)?.language
                            } else {
                                const track = (audioTracks as MKVParser_TrackInfo[])?.find(t => t.number === value)
                                lang = track?.language
                                codecID = track?.codecID
                            }
                            if (lang) {
                                setPerMediaOverrides(prev => ({
                                    ...prev,
                                    [String(mediaId)]: { ...prev[String(mediaId)], audioLanguage: lang, audioCodecID: codecID },
                                }))
                            }
                        }

                        if (isHls && hlsSetAudioTrack) {
                            // HLS mode: switch audio directly via HLS.js — reliable in all browsers.
                            hlsSetAudioTrack(value)
                            setSelectedTrack(value)
                            action({ type: "seek", payload: { time: -1 } })
                        } else if (requestTranscodeForAudio) {
                            // Direct play mode: extract the selected audio track via FFmpeg
                            // and play it through a hidden <audio> element synced to the video.
                            // Convert MKV track number to 0-based audio stream index.
                            const audioStreamIndex = mkvAudioTracks
                                ? mkvAudioTracks.findIndex(t => (t as MKVParser_TrackInfo).number === value)
                                : -1
                            setSelectedTrack(value)
                            requestTranscodeForAudio(audioStreamIndex >= 0 ? audioStreamIndex : 0)
                        }
                    }}
                    value={selectedTrack || 0}
                />
            </VideoCoreMenuBody>
        </VideoCoreMenu>
    )
}
