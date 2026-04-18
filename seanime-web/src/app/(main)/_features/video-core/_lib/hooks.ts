import { isMobile } from "@/lib/utils/browser-detection"

export function useIsCodecSupported() {
    const isCodecSupported = (codec: string) => {
        if (isMobile()) return false
        if (navigator.userAgent.search("Firefox") === -1)
            codec = codec.replace("video/x-matroska", "video/mp4")
        const videos = document.getElementsByTagName("video")
        const video = videos.item(0) ?? document.createElement("video")
        const support = video.canPlayType(codec)
        // Treat both "probably" and "maybe" as acceptable to avoid false negatives on containers like MKV
        if (support === "probably" || support === "maybe") return true

        // Optimistic HEVC: browsers/WebView2 may report empty for HEVC even when OS-level codecs
        // (e.g. HEVC Video Extensions) can decode it. Try direct play; stall-detection will
        // auto-switch to transcode if playback actually fails.
        const codecLower = codec.toLowerCase()
        const isHevc = codecLower.includes("hvc1") || codecLower.includes("hev1") || codecLower.includes("hevc")
        if (isHevc) return true

        return false
    }

    return {
        isCodecSupported,
    }
}
