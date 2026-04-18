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

        // Heuristic: some browsers (Firefox/Opera GX) report empty for HEVC but can still play when system codecs exist.
        const codecLower = codec.toLowerCase()
        const ua = navigator.userAgent.toLowerCase()
        const isHevc = codecLower.includes("hvc1") || codecLower.includes("hev1") || codecLower.includes("hevc")
        const isFirefox = ua.includes("firefox")
        const isOpera = ua.includes("opr") || ua.includes("opera")
        if (isHevc && (isFirefox || isOpera)) return true

        return false
    }

    return {
        isCodecSupported,
    }
}
