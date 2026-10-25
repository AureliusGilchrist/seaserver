
export function useIsCodecSupported() {
    const isCodecSupported = (codec: string) => {
        // Mobile used to be refused outright here, without asking the player. Android's WebView
        // decodes H.264 (and usually HEVC) in hardware, so the blanket "no" stopped every file
        // from direct playing on the Android client — and with direct-play-only on, from playing
        // at all. The player is asked like everywhere else.
        if (navigator.userAgent.search("Firefox") === -1)
            codec = codec.replace("video/x-matroska", "video/mp4")
        const videos = document.getElementsByTagName("video")
        const video = videos.item(0) ?? document.createElement("video")
        return video.canPlayType(codec) === "probably"
    }

    return {
        isCodecSupported,
    }
}
