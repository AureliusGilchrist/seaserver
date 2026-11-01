import { Mediastream_MediaContainer } from "@/api/generated/types"
import { __isMobileShell__ } from "@/types/constants"

const HTTP_INTERCEPTOR = "/_capacitor_http_interceptor_"

/**
 * On Android, Capacitor replaces XMLHttpRequest with a version that never passes responseType to the
 * native side, so a video segment arrives as text and cannot be played. hls.js leaves a request as it
 * is if xhrSetup has already opened it, which is how segments get past that.
 */
export const mobileShellHlsConfig = __isMobileShell__ ? {
    // Never 240p, but low enough that a connection which cannot carry 480p drops a level instead of stalling.
    minAutoBitrate: 1_000_000,
    // Room to ride out a slow patch. Transcoded segments can be under a second long.
    maxBufferLength: 60,
    xhrSetup: (xhr: XMLHttpRequest, url: string) => {
        // Going through Capacitor's own proxy opens a connection per segment, which a VPN pays for
        // every time. Its patch leaves any URL with the proxy's path in it alone, so this one goes
        // out as a real request on a connection the WebView keeps open.
        const separator = url.includes("?") ? "&" : "?"
        xhr.open("GET", `${url}${separator}_=${HTTP_INTERCEPTOR}`, true)
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
