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
