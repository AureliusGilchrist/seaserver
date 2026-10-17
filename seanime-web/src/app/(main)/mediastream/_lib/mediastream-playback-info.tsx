import { Mediastream_MediaContainer, Mediastream_StreamType } from "@/api/generated/types"
import { useMediastreamJassubOffscreenRender } from "@/app/(main)/mediastream/_lib/mediastream.atoms"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Modal } from "@/components/ui/modal"
import { Separator } from "@/components/ui/separator"
import { uniq } from "lodash"
import React from "react"
import { BiInfoCircle } from "react-icons/bi"

type MediastreamPlaybackInfoProps = {
    mediaContainer: Mediastream_MediaContainer | undefined
    isCodecSupported: (codec: string) => boolean
    handleChangeStreamType: (type: Mediastream_StreamType) => void
    disabledAutoSwitchToDirectPlay?: boolean
}

/**
 * The "Playback info" modal, shared by the mediastream page and the entry page's Local Player
 * tab so both expose the same controls: file path, codec compatibility, container data,
 * the Jassub offscreen rendering toggle and the direct play / transcoding switch.
 */
export function MediastreamPlaybackInfo({ mediaContainer, isCodecSupported, handleChangeStreamType, disabledAutoSwitchToDirectPlay }: MediastreamPlaybackInfoProps) {

    const { jassubOffscreenRender, setJassubOffscreenRender } = useMediastreamJassubOffscreenRender()

    return (
        <div className="">
            <Modal
                title="Playback"
                trigger={
                    <Button leftIcon={<BiInfoCircle />} className="rounded-full" intent="gray-basic" size="sm">
                        Playback info
                    </Button>
                }
                contentClass="sm:rounded-3xl"
            >
                <div className="space-y-2">
                    <p className="tracking-wide text-sm text-[--muted] break-all">
                        {mediaContainer?.mediaInfo?.path}
                    </p>
                    {isCodecSupported(mediaContainer?.mediaInfo?.mimeCodec || "") ? <Alert
                        intent="success"
                        description="File video and audio codecs are compatible with this client. Direct play is recommended."
                    /> : <Alert
                        intent="warning"
                        description="File video and audio codecs are not compatible with this client. Transcoding is needed."
                    />}

                    <p>
                        <span className="font-bold">Video codec: </span>
                        <span>{mediaContainer?.mediaInfo?.video?.mimeCodec}</span>
                    </p>
                    <p>
                        <span className="font-bold">Audio codec: </span>
                        <span>{uniq(mediaContainer?.mediaInfo?.audios?.map(n => n.mimeCodec)).join(", ")}</span>
                    </p>

                    <Modal
                        title="Playback"
                        trigger={
                            <Button size="sm" className="rounded-full" intent="gray-outline">
                                More data
                            </Button>
                        }
                        contentClass="max-w-3xl"
                    >
                        <pre className="overflow-x-auto overflow-y-auto max-h-[calc(100dvh-300px)] whitespace-pre-wrap p-2 rounded-[--radius-md] bg-gray-900">
                            {JSON.stringify(mediaContainer, null, 2)}
                        </pre>
                    </Modal>

                    <Separator />

                    <p className="font-semibold text-lg">
                        Jassub
                    </p>

                    <Checkbox
                        label="Offscreen rendering"
                        value={jassubOffscreenRender}
                        onValueChange={v => setJassubOffscreenRender(v as boolean)}
                        help="Enable this if you are experiencing performance issues"
                    />

                    <Separator />

                    {(mediaContainer?.streamType === "direct") &&
                        <div className="space-y-2">
                            <Button
                                intent="primary-subtle"
                                onClick={() => handleChangeStreamType("transcode")}
                                disabled={!disabledAutoSwitchToDirectPlay}
                            >
                                Switch to transcoding
                            </Button>
                            {!disabledAutoSwitchToDirectPlay && <p className="text-[--muted] text-sm italic opacity-50">
                                Enable 'prefer transcoding' in the media streaming settings if you want to switch to transcoding
                            </p>}
                        </div>}

                    {(mediaContainer?.streamType === "transcode" && isCodecSupported(mediaContainer?.mediaInfo?.mimeCodec || "")) &&
                        <Button intent="success-subtle" onClick={() => handleChangeStreamType("direct")}>
                            Switch to direct play
                        </Button>}
                </div>
            </Modal>
        </div>
    )
}
