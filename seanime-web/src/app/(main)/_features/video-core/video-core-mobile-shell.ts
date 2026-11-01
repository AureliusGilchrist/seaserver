import { Mediastream_MediaContainer } from "@/api/generated/types"
import { __isMobileShell__ } from "@/types/constants"

const HTTP_INTERCEPTOR = "/_capacitor_http_interceptor_"

/**
 * On Android, Capacitor replaces XMLHttpRequest with a version that never passes responseType to the
 * native side, so a video segment arrives as text and cannot be played. Its own proxy path is left
 * alone and keeps the bytes intact. hls.js leaves a request as it is if xhrSetup has already opened it.
 */
export const mobileShellHlsConfig = __isMobileShell__ ? {
    // Waiting a moment beats 240p on a phone: a slow first segment is the encoder starting, not the network.
    minAutoBitrate: 2_000_000,
    xhrSetup: (xhr: XMLHttpRequest, url: string) => {
        const proxy = new URL(window.location.origin)
        proxy.pathname = HTTP_INTERCEPTOR
        proxy.searchParams.set("u", new URL(url, window.location.href).toString())
        xhr.open("GET", proxy.toString(), true)
        // hls.js resolves a playlist's relative links against this, so it has to stay the real address.
        Object.defineProperty(xhr, "responseURL", { get: () => url })
    },
} : {}

/** Past this a Blu-ray remux would stall on a phone's connection, so it gets re-encoded instead. */
const MAX_UNTOUCHED_BITRATE = 20_000_000

/**
 * Asks for the source video untouched when this phone can decode it itself. Re-encoding costs
 * quality the phone doesn't need, and the player drops to 240p whenever the encoder falls behind.
 */
export function mobileShellStreamQuery(container: Mediastream_MediaContainer | null | undefined) {
    if (!__isMobileShell__ || container?.streamType !== "transcode") return ""
    if ((container.mediaInfo?.video?.bitrate ?? 0) > MAX_UNTOUCHED_BITRATE) return ""
    const codec = container.mediaInfo?.mimeCodec?.match(/(?:avc1|hvc1|hev1)\.[^",\s]+/)?.[0]
    if (!codec) return ""
    const playable = codec.replace(/^hev1/, "hvc1").replace(/L-\d+/, "L150")
    return MediaSource.isTypeSupported(`video/mp4; codecs="${playable}"`) ? "?copy=1" : ""
}

/**
 * The WebView has no picture in picture of its own, so the whole app goes into Android's. Fullscreen
 * first, so the player is what fills the window, with its subtitles on it.
 */
export async function enterAndroidPip(video: HTMLVideoElement) {
    const shell = (window as any).Capacitor?.Plugins?.MobileShell
    if (!shell) return
    if (!document.fullscreenElement) await (video.closest("[data-vc-element='container']") ?? video).requestFullscreen()
    await shell.enterPictureInPicture({ width: video.videoWidth || 16, height: video.videoHeight || 9 })
}
