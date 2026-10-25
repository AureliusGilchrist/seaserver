import { isMobile } from "@/lib/utils/browser-detection"

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
        const support = video.canPlayType(codec)
        // Phones get no benefit of the doubt: a WebView's "maybe" (MKV) and HEVC are usually a no,
        // and a wrong yes means a file that never starts. Only a firm "probably" direct-plays there.
        if (isMobile()) return support === "probably"
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
