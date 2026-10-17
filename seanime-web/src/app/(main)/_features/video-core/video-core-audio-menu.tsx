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
import { vc_saveTrackOverride } from "@/app/(main)/_features/video-core/video-core.atoms"
import { saveLocalTrackOverride } from "@/app/(main)/_features/video-core/video-core-track-preferences"
import { useAtomValue } from "jotai"
import { useSetAtom } from "jotai/react"
import React from "react"
import { LuHeadphones } from "react-icons/lu"

export function VideoCoreAudioMenu({ mediaId }: { mediaId?: number }) {
    const action = useSetAtom(vc_dispatchAction)
    const isMiniPlayer = useAtomValue(vc_miniPlayer)
    const state = useAtomValue(nativePlayer_stateAtom)
    const audioManager = useAtomValue(vc_audioManager)
    const videoElement = useAtomValue(vc_videoElement)
    const isFullscreen = useAtomValue(vc_isFullscreen)
    const containerElement = useAtomValue(vc_containerElement)
    // Per-series audio preference: mirrors the subtitle menu's persist pattern (local +
    // server write-through) so a manually chosen audio track carries across episodes.
    const saveTrackOverride = useAtomValue(vc_saveTrackOverride)
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

    if (isMiniPlayer || !audioTracks?.length || audioTracks.length === 1) return null

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
                            // HLS track format
                            const hlsTrack = track as HlsAudioTrack
                            return {
                                label: hlsTrack.name || hlsTrack.language?.toUpperCase() || `Track ${hlsTrack.id + 1}`,
                                value: hlsTrack.id,
                                moreInfo: hlsTrack.language?.toUpperCase(),
                            }
                        } else {
                            // Event track format
                            const eventTrack = track as MKVParser_TrackInfo
                            return {
                                label: `${eventTrack.name || eventTrack.language?.toUpperCase() || eventTrack.languageIETF?.toUpperCase()}`,
                                value: eventTrack.number,
                                moreInfo: eventTrack.language?.toUpperCase(),
                            }
                        }
                    })}
                    onValueChange={(value: number) => {
                        audioManager?.selectTrack(value)
                        action({ type: "seek", payload: { time: -1 } })

                        // Persist the choice per-series so it is re-applied on every other episode
                        // of the same media.
                        const persist = (override: Parameters<NonNullable<typeof saveTrackOverride>>[1]) => {
                            if (mediaId == null) {
                                console.error("[VideoCore] Cannot persist audio choice without a media ID")
                                return
                            }
                            saveLocalTrackOverride(mediaId, override)
                            if (saveTrackOverride) saveTrackOverride(String(mediaId), override)
                            else console.warn("[VideoCore] Server track-preference sync is not ready; saved locally")
                        }

                        const track = audioTracks?.find(t => isHls
                            ? (t as HlsAudioTrack).id === value
                            : (t as MKVParser_TrackInfo).number === value)
                        if (track) {
                            persist(isHls
                                ? { audioLanguage: (track as HlsAudioTrack).language }
                                : {
                                    audioLanguage: (track as MKVParser_TrackInfo).language || (track as MKVParser_TrackInfo).languageIETF,
                                    audioCodecID: (track as MKVParser_TrackInfo).codecID,
                                })
                        }
                    }}
                    value={selectedTrack || 0}
                />
            </VideoCoreMenuBody>
        </VideoCoreMenu>
    )
}
