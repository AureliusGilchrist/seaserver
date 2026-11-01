import { Mediastream_MediaContainer } from "@/api/generated/types"
import { __isMobileShell__ } from "@/types/constants"

const HTTP_INTERCEPTOR = "/_capacitor_http_interceptor_"

/**
 * On Android, Capacitor replaces XMLHttpRequest with a version that never passes responseType to the
 * native side, so a video segment arrives as text and cannot be played. Its own proxy path is left
 * alone and keeps the bytes intact. hls.js leaves a request as it is if xhrSetup has already opened it.
 */
export const mobileShellHlsConfig = __isMobileShell__ ? {
    xhrSetup: (xhr: XMLHttpRequest, url: string) => {
        const proxy = new URL(window.location.origin)
        proxy.pathname = HTTP_INTERCEPTOR
        proxy.searchParams.set("u", new URL(url, window.location.href).toString())
        xhr.open("GET", proxy.toString(), true)
        // hls.js resolves a playlist's relative links against this, so it has to stay the real address.
        Object.defineProperty(xhr, "responseURL", { get: () => url })
    },
} : {}

/**
 * Asks for the source video untouched when the file is HEVC and this phone decodes HEVC itself. The
 * server's ffmpeg may have no HEVC decoder, and re-encoding costs quality the phone doesn't need.
 */
export function mobileShellStreamQuery(container: Mediastream_MediaContainer | null | undefined) {
    if (!__isMobileShell__ || container?.streamType !== "transcode") return ""
    const codec = container.mediaInfo?.mimeCodec?.match(/hvc1\.[^",\s]+|hev1\.[^",\s]+/)?.[0]
    if (!codec) return ""
    const playable = codec.replace(/^hev1/, "hvc1").replace(/L-\d+/, "L150")
    return MediaSource.isTypeSupported(`video/mp4; codecs="${playable}"`) ? "?copy=1" : ""
}
