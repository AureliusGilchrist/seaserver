import { vc_subtitleManager } from "@/app/(main)/_features/video-core/video-core"
import { vc_mediaCaptionsManager } from "@/app/(main)/_features/video-core/video-core"
import { vc_perMediaTrackOverrides, vc_saveTrackOverride } from "@/app/(main)/_features/video-core/video-core.atoms"
import { vc_menuOpen } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_menuSectionOpen } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_isFullscreen } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_miniPlayer } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_videoElement } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_containerElement } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_playbackInfo } from "@/app/(main)/_features/video-core/video-core-atoms"
import { VideoCoreControlButtonIcon } from "@/app/(main)/_features/video-core/video-core-control-bar"
import { MediaCaptionsTrack } from "@/app/(main)/_features/video-core/video-core-media-captions"
import { VideoCoreMenu, VideoCoreMenuBody, VideoCoreMenuTitle, VideoCoreSettingSelect } from "@/app/(main)/_features/video-core/video-core-menu"
import { NormalizedTrackInfo } from "@/app/(main)/_features/video-core/video-core-subtitles"
import { vc_dispatchAction } from "@/app/(main)/_features/video-core/video-core.utils"
import { IconButton } from "@/components/ui/button"
import { Tooltip } from "@/components/ui/tooltip"
import { useAtomValue } from "jotai"
import { useSetAtom } from "jotai/react"
import React from "react"
import { AiFillInfoCircle } from "react-icons/ai"
import { LuCaptions, LuPaintbrush } from "react-icons/lu"

export function VideoCoreSubtitleMenu({ inline }: { inline?: boolean }) {
    const action = useSetAtom(vc_dispatchAction)
    const isMiniPlayer = useAtomValue(vc_miniPlayer)
    const playbackInfo = useAtomValue(vc_playbackInfo)
    const subtitleManager = useAtomValue(vc_subtitleManager)
    const mediaCaptionsManager = useAtomValue(vc_mediaCaptionsManager)
    const videoElement = useAtomValue(vc_videoElement)
    const isFullscreen = useAtomValue(vc_isFullscreen)
    const containerElement = useAtomValue(vc_containerElement)
    const [selectedTrack, setSelectedTrack] = React.useState<number | null>(null)
    const saveTrackOverride = useAtomValue(vc_saveTrackOverride)
    const perMediaTrackOverrides = useAtomValue(vc_perMediaTrackOverrides)
    const savedSubtitleLang = playbackInfo?.media?.id ? perMediaTrackOverrides[String(playbackInfo.media.id)]?.subtitleLanguage : undefined

    const setMenuOpen = useSetAtom(vc_menuOpen)
    const setMenuSectionOpen = useSetAtom(vc_menuSectionOpen)

    const [subtitleTracks, setSubtitleTracks] = React.useState<NormalizedTrackInfo[]>([])
    const [mediaCaptionsTracks, setMediaCaptionsTracks] = React.useState<MediaCaptionsTrack[]>([])

    function onTextTrackChange() {
        setSubtitleTracks(p => subtitleManager?.getTracks?.() ?? p)
    }

    function onTrackChange(trackNumber: number | null) {
        setSelectedTrack(trackNumber)
    }

    const firstRender = React.useRef(true)

    React.useEffect(() => {
        if (!videoElement) return

        /**
         * MKV subtitle tracks
         */
        if (subtitleManager) {
            if (firstRender.current) {
                // firstRender.current = false
                onTrackChange(subtitleManager?.getSelectedTrackNumberOrNull?.() ?? null)
            }

            // Listen for subtitle track changes
            subtitleManager.setTrackChangedEventListener(onTrackChange)

            // Listen for when the subtitle tracks are mounted
            subtitleManager.setTracksLoadedEventListener(tracks => {
                setSubtitleTracks(tracks)
            })
        } else if (mediaCaptionsManager) {
            /**
             * Media captions tracks
             */
            if (firstRender.current) {
                // firstRender.current = false
                setSelectedTrack(mediaCaptionsManager.getSelectedTrackIndexOrNull?.() ?? null)
            }

            // Listen for subtitle track changes
            mediaCaptionsManager.setTrackChangedEventListener(onTrackChange)

            mediaCaptionsManager.setTracksLoadedEventListener(tracks => {
                setMediaCaptionsTracks(tracks)
            })
        }
    }, [videoElement, subtitleManager, mediaCaptionsManager])

    React.useEffect(() => {
        onTextTrackChange()
    }, [subtitleManager])

    // When the stream ID changes (new episode / retranscode), reset subtitle state
    // so the menu re-syncs from the new manager once tracks are loaded.
    // NOTE: intentionally keyed on playbackInfo?.id, NOT streamUrl — streamUrl can change
    // during a retranscode while the manager + tracks are still valid, which was causing
    // the subtitle button to vanish after manually selecting a track in Denshi.
    React.useEffect(() => {
        setSelectedTrack(null)
        setSubtitleTracks([])
        setMediaCaptionsTracks([])
    }, [playbackInfo?.id])

    // Get active manager
    const activeManager = subtitleManager || mediaCaptionsManager
    const activeTracks = subtitleManager ? subtitleTracks : mediaCaptionsTracks

    if (isMiniPlayer || !activeTracks?.length) return null

    return (
        <VideoCoreMenu
            name="subtitle"
            trigger={<VideoCoreControlButtonIcon
                icons={[
                    ["default", LuCaptions],
                ]}
                state="default"
                onClick={() => {

                }}
            />}
        >
            <VideoCoreMenuTitle>Subtitles {(!!subtitleManager && !inline) && <Tooltip
                trigger={<AiFillInfoCircle className="text-sm" />}
                className="z-[150]"
                portalContainer={containerElement ?? undefined}
            >
                You can add subtitles by dragging and dropping files onto the player.
            </Tooltip>}
                <IconButton
                    intent="gray-link" size="xs"
                    onClick={() => {
                        setMenuOpen("settings")
                        React.startTransition(() => {
                            setMenuSectionOpen("Subtitle Styles")
                        })
                    }}
                    icon={<LuPaintbrush />}
                    className="absolute right-2 top-[calc(50%-1rem)]"
                /></VideoCoreMenuTitle>
            <VideoCoreMenuBody>
                <VideoCoreSettingSelect
                    isFullscreen={isFullscreen}
                    containerElement={containerElement}
                    options={[
                        {
                            label: "Off",
                            value: -1,
                        },
                        ...(() => {
                            // Compute isDefault with proper uniqueness guarantees
                            const savedCodec = playbackInfo?.media?.id ? perMediaTrackOverrides[String(playbackInfo.media.id)]?.subtitleCodecID : undefined
                            const SIGNS_RE = /\b(signs?|songs?|signs?\s*[&+]\s*songs?|songs?\s*[&+]\s*signs?|commentary|forced)\b/i
                            const isSignsTrack = (label?: string) => !!label && SIGNS_RE.test(label)

                            // First pass: find exact codec match, preferring non-signs tracks
                            let defaultTrackNumber: number | undefined
                            if (savedCodec && savedSubtitleLang && savedSubtitleLang !== "none") {
                                const codecMatches = subtitleTracks.filter(t =>
                                    t.language?.toLowerCase() === savedSubtitleLang.toLowerCase() &&
                                    t.codecID === savedCodec
                                )
                                // Prefer non-signs track with exact codec match
                                const nonSignsMatch = codecMatches.find(t => !isSignsTrack(t.label))
                                if (nonSignsMatch) {
                                    defaultTrackNumber = nonSignsMatch.number
                                } else if (codecMatches.length > 0) {
                                    // All matches are signs tracks, use first one
                                    defaultTrackNumber = codecMatches[0].number
                                }
                            }

                            // Second pass: if no exact codec match, pick first non-signs track with matching lang
                            if (defaultTrackNumber === undefined && savedSubtitleLang && savedSubtitleLang !== "none") {
                                const nonSignsMatch = subtitleTracks.find(t =>
                                    t.language?.toLowerCase() === savedSubtitleLang.toLowerCase() &&
                                    !isSignsTrack(t.label)
                                )
                                if (nonSignsMatch) defaultTrackNumber = nonSignsMatch.number
                            }

                            return subtitleTracks.map(track => {
                                const isDefault = track.number === defaultTrackNumber
                                return {
                                    label: `${track.label || track.language?.toUpperCase() || track.languageIETF?.toUpperCase()}`,
                                    value: track.number,
                                    moreInfo: track.language && track.language !== track.label
                                        ? `${track.language.toUpperCase()}${track.codecID ? "/" + getSubtitleTrackType(track.codecID) : ``}`
                                        : undefined,
                                    isDefault,
                                }
                            })
                        })(),
                        ...(() => {
                            // Single-pass: find first non-signs track with matching lang
                            let defaultCaptionsNumber: number | undefined
                            if (savedSubtitleLang && savedSubtitleLang !== "none") {
                                const SIGNS_RE = /\b(signs?|songs?|signs?\s*[&+]\s*songs?|songs?\s*[&+]\s*signs?|commentary|forced)\b/i
                                const match = mediaCaptionsTracks.find(t =>
                                    t.language?.toLowerCase() === savedSubtitleLang.toLowerCase() &&
                                    !(!!t.label && SIGNS_RE.test(t.label))
                                )
                                if (match) defaultCaptionsNumber = match.number
                            }
                            return mediaCaptionsTracks.map(track => {
                                const isDefault = track.number === defaultCaptionsNumber
                                return {
                                    label: track.label,
                                    value: track.number,
                                    moreInfo: track.language && track.language !== track.label ? track.language?.toUpperCase() : undefined,
                                    isDefault,
                                }
                            })
                        })(),
                    ]}
                    onValueChange={(value: number) => {
                        if (value === -1) {
                            activeManager?.setNoTrack()
                            setSelectedTrack(null)
                            // Save "none" subtitle preference
                            const mediaId = playbackInfo?.media?.id
                            if (mediaId && saveTrackOverride) {
                                saveTrackOverride(String(mediaId), { subtitleLanguage: "none" })
                            }
                            return
                        }
                        if (subtitleManager) {
                            subtitleManager.selectTrack(value)
                        } else if (mediaCaptionsManager) {
                            mediaCaptionsManager.selectTrack(value)
                            setSelectedTrack(value)
                        }

                        // Save per-media subtitle language + codec override
                        // Only save when there is a real language code — never fall back to label
                        // (a label like "Songs & Signs" would incorrectly match the same track on the next episode)
                        const mediaId = playbackInfo?.media?.id
                        if (mediaId && saveTrackOverride) {
                            const subTrack = subtitleTracks.find(t => t.number === value)
                            const captionTrack = mediaCaptionsTracks.find(t => t.number === value)
                            const lang = subTrack?.language || captionTrack?.language
                            const codecID = subTrack?.codecID
                            if (lang) {
                                saveTrackOverride(String(mediaId), { subtitleLanguage: lang, subtitleCodecID: codecID })
                            }
                        }
                    }}
                    value={selectedTrack ?? -1}
                />
            </VideoCoreMenuBody>
        </VideoCoreMenu>
    )
}

export function getSubtitleTrackType(codecID: string) {
    switch (codecID) {
        case "S_TEXT/ASS":
            return "ASS"
        case "S_TEXT/SSA":
            return "SSA"
        case "S_TEXT/UTF8":
            return "TEXT"
        case "S_HDMV/PGS":
            return "PGS"
    }
    return "unknown"
}
